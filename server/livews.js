// Live football over the provider's WebSocket (paid addon): wss://sports.bzzoiro.com/live/football/
//
// Follows the matches the REST live list flags as `live_websocket`, and keeps their score, clock and
// in-play consensus 1X2 prices current. In-play markets are only open while prices are fresh:
//   - a price opens the market and stamps events.live_odds_at;
//   - a score change suspends it until a new price arrives (the old one was for another scoreline);
//   - betting.js refuses live bets once live_odds_at is older than the configured max age.
// The socket allows 10 subscriptions each, so several sockets are opened as needed.
//
// Everything received is also published on `bus` (per ClassicBet event id) so the match page can
// stream it to the browser: 'event' (score, clock, live stats), 'livedata' (ball position and
// situation for the 2D tracker), 'action' (per-action events with coordinates) and 'odds'.

import { EventEmitter } from 'node:events';
import { nowIso, tx } from './db.js';
import { createLivePriceGate } from './sports.js';

const first = (...vals) => vals.find((v) => v !== undefined && v !== null);

// Tennis streams over the multi-sport channel (wss://sports.bzzoiro.com/ws/live/) with
// `"sport": "tennis"` on each subscription: 'event' frames carry the full match state (sets,
// games, point, server, serve statistics) and 'score' frames arrive after every point. Tennis
// markets are pre-match only, so these frames drive the scoreboard and nothing else.
const FATAL_CLOSE = { 4401: 'token inválido', 4402: 'addon WebSocket não ativo', 4404: 'caminho desconhecido' };

export function createLiveSocket(db, {
  token, url = 'wss://sports.bzzoiro.com/live/football/', WebSocketImpl = globalThis.WebSocket,
  maxSockets = 5, perSocket = 10, log = () => {}, reconnectMs = 5_000, sport = null, source = 'bzzoiro', liveOddsStale = 600,
  bookmaker = null,
} = {}) {
  const SOURCE = source;
  const state = {
    enabled: !!token && typeof WebSocketImpl === 'function',
    wanted: new Set(), untracked: new Set(), sockets: [], fatal: null, lastError: null, frames: 0, lastFrameAt: null,
    types: {}, bookDropped: null,
  };
  let book = bookmaker;
  let stopped = false;

  const findEvent = db.prepare('SELECT * FROM events WHERE source = ? AND external_id = ?');
  const suspend = (id) => db.prepare('UPDATE selections SET active = 0 WHERE event_id = ?').run(id);
  const suspendOwn = (id) => db.prepare('UPDATE selections SET active = 0 WHERE event_id = ? AND src IS NULL').run(id);
  // Odds frames carry no timestamp, and the consensus frame (re-read every ~30 s) can still be the
  // pre-match book well into the game. A frame opens the market only once its match-result prices
  // differ from the ones held (pre-match, or before the last goal); it then stays open while
  // frames keep coming, until the price has not changed for `liveOddsStale` seconds.
  // With `bookmaker` set, the subscription also asks for that book's own prices (odds_book), which
  // take precedence over the consensus while they keep arriving.
  const gate = createLivePriceGate(liveOddsStale * 1000);
  const lastBook = new Map(); // event id -> time of the last odds_book frame
  const wsOpen = new Map(); // provider id -> time this socket last opened the market with a price
  const oddsLog = []; // last odds frames and what was done with them (admin diagnostics)
  const note = (row, kind, prices, decision) => {
    oddsLog.unshift({ at: nowIso(), match: `${row.home} vs ${row.away}`, score: `${row.home_score ?? '-'}-${row.away_score ?? '-'}`, clock: row.clock,
      kind, odds: ['1', 'X', '2'].map((c) => (prices[`1x2|${c}`] ? prices[`1x2|${c}`] / 100 : '-')).join(' / '), decision });
    oddsLog.length = Math.min(oddsLog.length, 25);
  };
  const mainPrices = (p) => Object.fromEntries(Object.entries(p).filter(([k]) => k.startsWith('1x2|')));
  const heldMain = (id) => Object.fromEntries(
    db.prepare("SELECT code, odds_x100 FROM selections WHERE event_id = ? AND market = '1x2'").all(id).map((r) => [`1x2|${r.code}`, r.odds_x100])
  );

  const bus = new EventEmitter();
  bus.setMaxListeners(0);
  // Last state per ClassicBet event id, replayed to a browser that opens the match page mid-game.
  const snapshots = new Map();
  const snap = (id) => {
    if (!snapshots.has(id)) snapshots.set(id, { event: null, livedata: [], actions: [] });
    return snapshots.get(id);
  };
  const publish = (id, type, data) => bus.emit(`e:${id}`, { type, data });

  function applyLivedata(f) {
    const row = findEvent.get(SOURCE, String(f.event_id));
    if (!row) return;
    const points = Array.isArray(f.coordinates) ? f.coordinates : [];
    const p = points[points.length - 1];
    const data = {
      uts: f.uts ?? Math.floor(Date.now() / 1000), side: f.side ?? null, situation: f.situation ?? null,
      commentary: f.commentary ?? null, x: Number.isFinite(Number(p?.x)) ? Number(p.x) : null, y: Number.isFinite(Number(p?.y)) ? Number(p.y) : null,
    };
    const s = snap(row.id);
    s.livedata.push(data);
    if (s.livedata.length > 30) s.livedata.shift();
    publish(row.id, 'livedata', data);
  }

  function applyAction(f) {
    const row = findEvent.get(SOURCE, String(f.event_id));
    if (!row) return;
    const data = {
      type: f.action_type, team: f.team ?? null, player: f.player?.name ?? null, minute: f.minute ?? null,
      x: Number.isFinite(Number(f.x)) ? Number(f.x) : null, y: Number.isFinite(Number(f.y)) ? Number(f.y) : null,
    };
    const s = snap(row.id);
    s.actions.push(data);
    if (s.actions.length > 40) s.actions.shift();
    publish(row.id, 'action', data);
  }

  // ---------- frame handling ----------

  function applyEvent(f) {
    const row = findEvent.get(SOURCE, String(f.event_id));
    if (!row || row.status === 'finished' || row.status === 'cancelled') return;
    const home = Number(f.score?.home);
    const away = Number(f.score?.away);
    if (!Number.isInteger(home) || !Number.isInteger(away)) return;
    const clock = f.time?.display || (Number.isFinite(Number(f.time?.minute)) ? `${f.time.minute}'` : row.clock);
    tx(db, () => {
      const scoreChanged = row.home_score !== home || row.away_score !== away;
      db.prepare("UPDATE events SET status = 'live', home_score = ?, away_score = ?, clock = ?, updated_at = ? WHERE id = ?")
        .run(home, away, clock, nowIso(), row.id);
      // Half-time score for the half markets, recorded once at the interval.
      if (/^(ht|half.?time|break|interval)$/i.test(String(f.time?.period ?? f.time?.status ?? ''))) {
        db.prepare('UPDATE events SET ht_home = ?, ht_away = ? WHERE id = ? AND ht_home IS NULL').run(home, away, row.id);
      }
      if (scoreChanged || f.time?.status === 'finished') {
        // A goal invalidates every price; wait for an odds frame that has moved since to reopen.
        suspend(row.id);
        gate.forget(row.id);
        db.prepare('UPDATE events SET live_odds_at = NULL, pl_live_at = NULL, score_at = ? WHERE id = ?').run(nowIso(), row.id);
      }
    });
    const data = { homeScore: home, awayScore: away, clock, period: f.time?.period ?? null, stats: f.stats ?? null };
    snap(row.id).event = data;
    publish(row.id, 'event', data);
  }

  function applyOdds(f, kind = 'odds') {
    const row = findEvent.get(SOURCE, String(f.event_id));
    if (!row || row.status !== 'live') return;
    const prices = liveOddsPrices(first(f.odds?.match_winner ? f.odds : null, f.odds?.odds, f.odds_book?.odds, f.odds_book, f.book?.odds, f.odds));
    if (kind === 'odds_book') lastBook.set(row.id, Date.now());
    else if (Date.now() - (lastBook.get(row.id) || 0) < 120_000) return; // the bookmaker's own prices are in use
    const close = (why) => {
      wsOpen.delete(row.external_id);
      suspendOwn(row.id);
      db.prepare('UPDATE events SET live_odds_at = NULL WHERE id = ?').run(row.id);
      note(row, kind, prices, why);
    };
    tx(db, () => {
      if (!prices['1x2|1'] || !prices['1x2|2']) {
        // A frame of another shape must not close a market the REST prices opened (tennis).
        if (sport) return note(row, kind, prices, 'ignorado: sem preço de vencedor');
        return close('fechado: sem preço de resultado');
      }
      if (implausible(prices, row)) return close('fechado: preço não bate com o placar');
      const verdict = gate(row.id, { any: mainPrices(prices), previous: heldMain(row.id) });
      if (!verdict) return close('fechado: ainda o preço de antes do jogo / do golo');
      note(row, kind, prices, 'aberto');
      wsOpen.set(row.external_id, Date.now());
      const upsert = db.prepare(
        `INSERT INTO selections (event_id, market, code, odds_x100, active) VALUES (?, ?, ?, ?, 1)
         ON CONFLICT (event_id, market, code) DO UPDATE SET odds_x100 = excluded.odds_x100, active = 1, src = NULL`
      );
      // The frame is the full in-play book: anything of ours not in it is closed.
      db.prepare('UPDATE selections SET active = 0 WHERE event_id = ? AND src IS NULL').run(row.id);
      for (const [key, x100] of Object.entries(prices)) {
        const [market, code] = key.split('|');
        upsert.run(row.id, market, code, x100);
      }
      db.prepare('UPDATE events SET live_odds_at = ? WHERE id = ?').run(nowIso(), row.id);
    });
    publish(row.id, 'odds', { at: nowIso() });
  }

  // ---------- tennis ----------

  const setsOf = (v) => (Array.isArray(v) ? v.filter((x) => Array.isArray(x) && x.length >= 2).map(([a, b]) => [Number(a), Number(b)]) : null);

  /** Sets won so far: completed sets only (6+ games with a 2-game lead, or a 7-6 tiebreak). */
  function setsWon(sets) {
    let h = 0;
    let a = 0;
    for (const [x, y] of sets) {
      const done = (Math.max(x, y) >= 6 && Math.abs(x - y) >= 2) || (Math.max(x, y) === 7 && Math.min(x, y) === 6);
      if (done) { if (x > y) h += 1; else a += 1; }
    }
    return [h, a];
  }

  function applyTennis(f, kind) {
    const row = findEvent.get(SOURCE, String(f.event_id));
    if (!row || row.status === 'finished' || row.status === 'cancelled') return;
    const sc = kind === 'event' ? f.score || {} : f;
    const sets = setsOf(sc.sets) || [];
    const prev = snap(row.id).event || {};
    let [home, away] = [Number(sc.home_sets), Number(sc.away_sets)];
    if (!Number.isInteger(home) || !Number.isInteger(away)) [home, away] = setsWon(sets);
    const point = sc.point ?? prev.point ?? null;
    const serverSide = sc.server ?? prev.server ?? null;
    const setsText = sets.map(([x, y]) => `${x}-${y}`).join(', ');
    // The point is shown on its own (S1/S2/S3 with 15/30/40/AD under it); the clock keeps the sets.
    const clock = setsText.slice(0, 60) || row.clock;
    const detail = { set: sets.length || null, point, server: serverSide, sets };
    db.prepare("UPDATE events SET status = 'live', home_score = ?, away_score = ?, clock = ?, live_detail = ?, updated_at = ? WHERE id = ?")
      .run(home, away, clock, JSON.stringify(detail), nowIso(), row.id);
    const data = {
      homeScore: home, awayScore: away, clock, sets, point, server: serverSide,
      stats: kind === 'event' && f.stats ? f.stats : prev.stats ?? null,
    };
    snap(row.id).event = data;
    publish(row.id, 'event', data);
  }

  function handle(sock, raw) {
    let f;
    try { f = JSON.parse(typeof raw === 'string' ? raw : String(raw)); } catch { return; }
    state.frames += 1;
    if (f && typeof f.type === 'string') state.types[f.type] = (state.types[f.type] || 0) + 1;
    state.lastFrameAt = nowIso();
    try {
      if (sport === 'tennis' && f.type === 'event') applyTennis(f, 'event');
      else if (sport === 'tennis' && f.type === 'score') applyTennis(f, 'score');
      else if (sport === 'tennis' && f.type === 'subscribed') { if (f.event) applyTennis({ ...f.event, event_id: f.event_id }, 'event'); }
      else if (f.type === 'subscribed') {
        if (f.event) applyEvent({ ...f.event, event_id: f.event_id });
        if (f.odds) applyOdds({ ...f.odds, event_id: f.event_id });
        if (f.odds_book) applyOdds({ odds_book: f.odds_book, event_id: f.event_id }, 'odds_book');
        for (const ld of Array.isArray(f.livedata) ? f.livedata : []) applyLivedata({ ...ld, event_id: f.event_id });
        for (const a of Array.isArray(f.history) ? f.history : []) applyAction({ ...a, event_id: f.event_id });
      } else if (f.type === 'event') applyEvent(f);
      else if (f.type === 'odds') applyOdds(f);
      else if (f.type === 'odds_book') applyOdds(f, 'odds_book');
      else if (f.type === 'livedata') applyLivedata(f);
      else if (f.type === 'action') applyAction(f);
      else if (f.type === 'error') {
        state.lastError = `${f.code}: ${f.message || ''}`.trim();
        // The bookmaker's own prices may need a plan we do not have: never let that cost the
        // consensus feed. Drop bookmaker_slug and subscribe again to everything.
        if (book && (/bookmaker|odds_book/i.test(state.lastError) || f.code === 'subscription_required' || f.code === 'bad_request')) {
          state.bookDropped = state.lastError;
          book = null;
          log(`ws: odds da casa indisponíveis (${state.lastError}); a usar só o consenso`);
          for (const so of state.sockets) for (const id of so.subs) send(so, subscribeMsg(id));
          return;
        }
        if (f.event_id !== undefined && f.event_id !== null && ['not_tracked', 'bad_event_id'].includes(f.code)) {
          const id = String(f.event_id);
          state.untracked.add(id);
          sock.subs.delete(id);
        }
        if (f.code === 'auth_required' || f.code === 'subscription_required') state.fatal = state.lastError;
        log(`ws: ${state.lastError}`);
      }
    } catch (err) {
      log(`ws frame ${f.type}: ${err.message}`);
    }
  }

  // ---------- sockets ----------

  const subscribeMsg = (id) => ({ action: 'subscribe', event_id: Number(id), ...(sport ? { sport } : {}), ...(book ? { bookmaker_slug: book } : {}) });

  function send(sock, msg) {
    if (sock.open) sock.ws.send(JSON.stringify(msg));
  }

  function connect(sock) {
    if (stopped || state.fatal) return;
    let ws;
    try {
      ws = new WebSocketImpl(url, ['token', token]);
    } catch (err) {
      state.lastError = err.message;
      sock.timer = setTimeout(() => connect(sock), reconnectMs);
      return;
    }
    sock.ws = ws;
    ws.onopen = () => {
      sock.open = true;
      sock.attempts = 0;
      for (const id of sock.subs) send(sock, subscribeMsg(id));
    };
    ws.onmessage = (ev) => handle(sock, ev.data);
    ws.onerror = () => { state.lastError = 'erro de ligação'; };
    ws.onclose = (ev) => {
      sock.open = false;
      if (FATAL_CLOSE[ev?.code]) {
        state.fatal = `${ev.code}: ${FATAL_CLOSE[ev.code]}`;
        log(`ws fechado: ${state.fatal}`);
        return;
      }
      if (stopped) return;
      // Subscriptions do not survive a reconnect; onopen re-sends them.
      sock.attempts = (sock.attempts || 0) + 1;
      sock.timer = setTimeout(() => connect(sock), Math.min(reconnectMs * sock.attempts, 60_000));
    };
  }

  function reconcile() {
    if (!state.enabled || state.fatal || stopped) return;
    // Drop matches no longer wanted.
    for (const sock of state.sockets) {
      for (const id of [...sock.subs]) {
        if (!state.wanted.has(id)) {
          send(sock, { ...subscribeMsg(id), action: 'unsubscribe' });
          sock.subs.delete(id);
        }
      }
    }
    // Add new ones where there is room, opening sockets up to the cap.
    const have = new Set(state.sockets.flatMap((s) => [...s.subs]));
    for (const id of state.wanted) {
      if (have.has(id) || state.untracked.has(id)) continue;
      let sock = state.sockets.find((s) => s.subs.size < perSocket);
      if (!sock) {
        if (state.sockets.length >= maxSockets) break;
        sock = { subs: new Set(), open: false, attempts: 0 };
        state.sockets.push(sock);
        connect(sock);
      }
      sock.subs.add(id);
      send(sock, subscribeMsg(id));
    }
  }

  return {
    bus,
    /** What a browser joining mid-game should see first. */
    snapshot: (eventId) => snapshots.get(eventId) || { event: null, livedata: [], actions: [] },
    isFollowing: (externalId) => state.sockets.some((s) => s.subs.has(String(externalId))),
    /** Sets the provider event ids to follow (called by the REST live sync). */
    track(ids) {
      state.wanted = new Set([...ids].map(String));
      for (const id of state.untracked) if (!state.wanted.has(id)) state.untracked.delete(id);
      reconcile();
    },
    stop() {
      stopped = true;
      for (const s of state.sockets) {
        clearTimeout(s.timer);
        try { s.ws?.close(); } catch { /* already closed */ }
      }
    },
    /** True while this socket's own in-play price for the match is current (the REST loop leaves it alone). */
    hasFreshOdds: (externalId, maxAgeMs = 60_000) => Date.now() - (wsOpen.get(String(externalId)) || 0) < maxAgeMs,
    status: () => ({
      enabled: state.enabled, fatal: state.fatal, lastError: state.lastError,
      sockets: state.sockets.length, connected: state.sockets.filter((s) => s.open).length,
      following: state.sockets.reduce((n, s) => n + s.subs.size, 0), notCovered: state.untracked.size,
      bookmaker: book, bookDropped: state.bookDropped || null, frameTypes: { ...state.types }, oddsLog: oddsLog.slice(0, 15),
      frames: state.frames, lastFrameAt: state.lastFrameAt,
    }),
  };
}

/** In-play odds frame → { 'market|code': x100 } for the markets we offer. */
/**
 * A book that cannot belong to the current score: the side two or more goals up priced no
 * shorter than the side behind (e.g. 1-3 at half-time with the home win still at 2.18).
 */
export function implausible(prices, { home_score: h, away_score: a }) {
  if (!Number.isInteger(h) || !Number.isInteger(a) || Math.abs(h - a) < 2) return false;
  const [lead, trail] = h > a ? [prices['1x2|1'], prices['1x2|2']] : [prices['1x2|2'], prices['1x2|1']];
  return !!lead && !!trail && lead >= trail;
}

export function liveOddsPrices(odds) {
  const o = odds || {};
  const px = (v) => { const n = Number(v); return Number.isFinite(n) && n > 1 ? Math.round(n * 100) : null; };
  const out = {};
  const put = (key, v) => { const x = px(v); if (x) out[key] = x; };
  // Football sends home/draw/away; tennis and other two-way sports name the sides player1/player2.
  const mw = o.match_winner || o.winner || {};
  put('1x2|1', first(mw.home, mw.player1, mw.p1, o.odds_player1, o.odds_home));
  put('1x2|X', mw.draw);
  put('1x2|2', first(mw.away, mw.player2, mw.p2, o.odds_player2, o.odds_away));
  const ou = o.over_under || {};
  for (const [k, v] of Object.entries(ou)) {
    const m = /^(over|under)_(\d)(\d)$/.exec(k);
    if (m) put(`ou|${m[1] === 'over' ? 'O' : 'U'}${m[2]}.${m[3]}`, v);
  }
  put('btts|Y', o.btts?.yes); put('btts|N', o.btts?.no);
  // Asian handicap is left out on purpose: in play it is settled on the goals scored after the
  // bet (from the score at that moment), which this settlement does not track.
  return out;
}
