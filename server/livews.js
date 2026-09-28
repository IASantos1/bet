// Live football over the provider's WebSocket (paid addon): wss://sports.bzzoiro.com/live/football/
//
// Follows the matches the REST live list flags as `live_websocket`, and keeps their score, clock and
// in-play consensus 1X2 prices current. In-play markets are only open while prices are fresh:
//   - a price opens the market and stamps events.live_odds_at;
//   - a score change suspends it until a new price arrives (the old one was for another scoreline);
//   - betting.js refuses live bets once live_odds_at is older than the configured max age.
// The socket allows 10 subscriptions each, so several sockets are opened as needed.

import { nowIso, tx } from './db.js';

const SOURCE = 'bzzoiro';
const FATAL_CLOSE = { 4401: 'token inválido', 4402: 'addon WebSocket não ativo', 4404: 'caminho desconhecido' };

export function createLiveSocket(db, {
  token, url = 'wss://sports.bzzoiro.com/live/football/', WebSocketImpl = globalThis.WebSocket,
  maxSockets = 5, perSocket = 10, log = () => {}, reconnectMs = 5_000,
} = {}) {
  const state = {
    enabled: !!token && typeof WebSocketImpl === 'function',
    wanted: new Set(), untracked: new Set(), sockets: [], fatal: null, lastError: null, frames: 0, lastFrameAt: null,
  };
  let stopped = false;

  const findEvent = db.prepare('SELECT * FROM events WHERE source = ? AND external_id = ?');
  const suspend = (id) => db.prepare('UPDATE selections SET active = 0 WHERE event_id = ?').run(id);

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
      if (scoreChanged || f.time?.status === 'finished') {
        // A goal invalidates every price; wait for the next odds frame to reopen.
        suspend(row.id);
        db.prepare('UPDATE events SET live_odds_at = NULL WHERE id = ?').run(row.id);
      }
    });
  }

  function applyOdds(f) {
    const row = findEvent.get(SOURCE, String(f.event_id));
    if (!row || row.status !== 'live') return;
    const mw = f.odds?.match_winner || {};
    const price = (v) => { const n = Number(v); return Number.isFinite(n) && n > 1 ? Math.round(n * 100) : null; };
    const odds = { 1: price(mw.home), X: price(mw.draw), 2: price(mw.away) };
    tx(db, () => {
      if (!odds['1'] || !odds['2']) { suspend(row.id); return; }
      const upsert = db.prepare(
        `INSERT INTO selections (event_id, code, odds_x100, active) VALUES (?, ?, ?, 1)
         ON CONFLICT (event_id, code) DO UPDATE SET odds_x100 = excluded.odds_x100, active = 1`
      );
      for (const code of ['1', 'X', '2']) {
        if (odds[code]) upsert.run(row.id, code, odds[code]);
        else db.prepare('UPDATE selections SET active = 0 WHERE event_id = ? AND code = ?').run(row.id, code);
      }
      db.prepare('UPDATE events SET live_odds_at = ? WHERE id = ?').run(nowIso(), row.id);
    });
  }

  function handle(sock, raw) {
    let f;
    try { f = JSON.parse(typeof raw === 'string' ? raw : String(raw)); } catch { return; }
    state.frames += 1;
    state.lastFrameAt = nowIso();
    try {
      if (f.type === 'subscribed') {
        if (f.event) applyEvent({ ...f.event, event_id: f.event_id });
        if (f.odds) applyOdds({ ...f.odds, event_id: f.event_id });
      } else if (f.type === 'event') applyEvent(f);
      else if (f.type === 'odds') applyOdds(f);
      else if (f.type === 'error') {
        state.lastError = `${f.code}: ${f.message || ''}`.trim();
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
      for (const id of sock.subs) send(sock, { action: 'subscribe', event_id: Number(id) });
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
          send(sock, { action: 'unsubscribe', event_id: Number(id) });
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
      send(sock, { action: 'subscribe', event_id: Number(id) });
    }
  }

  return {
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
    status: () => ({
      enabled: state.enabled, fatal: state.fatal, lastError: state.lastError,
      sockets: state.sockets.length, connected: state.sockets.filter((s) => s.open).length,
      following: state.sockets.reduce((n, s) => n + s.subs.size, 0), notCovered: state.untracked.size,
      frames: state.frames, lastFrameAt: state.lastFrameAt,
    }),
  };
}
