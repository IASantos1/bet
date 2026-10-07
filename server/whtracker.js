// WinHouse match tracker (football in play): statistics, ball position, situation and timeline.
//
//   /ajax/widget?event_id=<game id>   → the tracker's own event id (EID) and key (AKEY)
//   /widget-data?event_id=EID&api_key=AKEY → the match state: score, clock, stats, situation,
//                                           xy (ball, 0–1), timeline / sc, corners, yellow cards
//
// Only matches someone is watching are read (every `pollMs` while a browser follows them), and
// everything is published on `bus` in the same shape as the main live socket, so the match page's
// 2D tracker, actions list and statistics work unchanged: 'event', 'livedata', 'action'.

import { EventEmitter } from 'node:events';

const first = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== '');
const num = (v) => { const n = Number(String(v ?? '').replace('%', '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

/** EID and AKEY from the widget route's answer (JSON or the widget's HTML / script). */
export function widgetCredentials(body, text = '') {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const o = body.data && typeof body.data === 'object' ? { ...body, ...body.data } : body;
    const eid = first(o.eid, o.EID, o.event_id, o.eventId, o.tracker_id, o.match_id);
    const akey = first(o.akey, o.AKEY, o.api_key, o.apiKey, o.key, o.token);
    if (eid && akey) return { eid: String(eid), akey: String(akey) };
  }
  const t = String(text || '');
  const url = /(?:widget-data|ws-widget)[^"'\s<>]*/.exec(t)?.[0] || '';
  const pick = (src, names) => {
    for (const n of names) {
      const m = new RegExp(`[?&"'\\s{,]${n}["']?\\s*(?:=|:)\\s*["']?([A-Za-z0-9_.:-]{2,128})`, 'i').exec(` ${src}`);
      if (m) return m[1];
    }
    return null;
  };
  const eid = pick(url, ['event_id']) || pick(t, ['EID', 'eid', 'eventId', 'event_id']);
  const akey = pick(url, ['api_key']) || pick(t, ['AKEY', 'akey', 'apiKey', 'api_key']);
  return eid && akey ? { eid, akey } : null;
}

const STAT_LABELS = [
  [/possess|posse/i, 'ball_possession', 'Posse de bola', '%'],
  [/dangerous/i, 'dangerous_attacks', 'Ataques perigosos', ''],
  [/attack/i, 'attacks', 'Ataques', ''],
  [/on.?target|no alvo|shots? on/i, 'shots_on_target', 'Remates à baliza', ''],
  [/off.?target|fora/i, 'shots_off_target', 'Remates para fora', ''],
  [/corner|canto/i, 'corners', 'Cantos', ''],
  [/yellow|amarel/i, 'yellow_cards', 'Cartões amarelos', ''],
  [/red|vermelh/i, 'red_cards', 'Cartões vermelhos', ''],
  [/penalt/i, 'penalties', 'Penáltis', ''],
  [/substitut/i, 'substitutions', 'Substituições', ''],
];
const statMeta = (name) => {
  const hit = STAT_LABELS.find(([re]) => re.test(name));
  return hit ? { key: hit[1], label: hit[2], unit: hit[3] } : { key: String(name).toLowerCase().replace(/\W+/g, '_'), label: String(name), unit: '' };
};
/** A home/away pair from [h, a], {home, away}, {1: h, 2: a} or "h:a". */
const pair = (v) => {
  if (Array.isArray(v) && v.length >= 2) return [num(v[0]), num(v[1])];
  if (v && typeof v === 'object') return [num(first(v.home, v.h, v[1], v['1'], v.team1, v.t1)), num(first(v.away, v.a, v[2], v['2'], v.team2, v.t2))];
  const m = /^\s*([\d.]+)\s*[:\-/|]\s*([\d.]+)\s*$/.exec(String(v ?? ''));
  return m ? [num(m[1]), num(m[2])] : [null, null];
};

/** stats as object ({"On Target": [3, 1]}) or list ([{name, home, away}] / [{type, value: [h, a]}]). */
export function normalizeStats(raw) {
  const rows = [];
  const add = (name, v) => {
    const [home, away] = pair(v);
    if (home === null || away === null || !name) return;
    const meta = statMeta(name);
    if (!rows.some((r) => r.key === meta.key)) rows.push({ ...meta, home, away });
  };
  if (Array.isArray(raw)) {
    for (const s of raw) {
      if (!s || typeof s !== 'object') continue;
      const name = first(s.name, s.type, s.title, s.label, s.key);
      add(name, s.home !== undefined || s.away !== undefined ? s : first(s.value, s.values, s.data, s));
    }
  } else if (raw && typeof raw === 'object') {
    for (const [name, v] of Object.entries(raw)) add(name, v);
  }
  return rows;
}

const SITUATIONS = [
  [/dangerous/i, 'dangerous_attack'], [/goal ?kick/i, 'goalkick'], [/\bgoal\b/i, 'goal'], [/corner/i, 'corner'],
  [/free ?kick/i, 'freekick'], [/throw/i, 'throwin'], [/penalt/i, 'penalty'], [/offside/i, 'offside'],
  [/shot|attempt/i, 'shot'], [/safe/i, 'safe'], [/attack/i, 'attack'], [/possession/i, 'possession'],
];
/** "Home Dangerous Attack" → { side: 'home', situation: 'dangerous_attack', text }. */
export function normalizeSituation(raw) {
  const text = String(typeof raw === 'object' && raw ? first(raw.text, raw.name, raw.type, raw.situation, '') : raw ?? '').trim();
  if (!text) return null;
  const sideRaw = typeof raw === 'object' && raw ? first(raw.team, raw.side) : null;
  const side = /^(away|2|a)$/i.test(String(sideRaw ?? '')) || /\baway\b|visitante/i.test(text) ? 'away'
    : /^(home|1|h)$/i.test(String(sideRaw ?? '')) || /\bhome\b|casa/i.test(text) ? 'home' : null;
  const situation = SITUATIONS.find(([re]) => re.test(text))?.[1] || 'possession';
  return { side, situation, text };
}

const EVENT_TYPES = [
  [/goal|golo/i, 'goal'], [/yellow|amarel/i, 'card'], [/red|vermelh/i, 'card'], [/corner|canto/i, 'corner_awarded'], [/sub/i, 'substitution'],
  [/on.?target/i, 'shot_on_target'], [/off.?target/i, 'shot_off_target'], [/penalt/i, 'penalty_faced'],
];

/**
 * Where the ball usually is for a situation, on the home team's left-to-right pitch (x, y in %):
 * the tracker sends xy only during play near the box, so "Ball Safe", attacks, corners and goal
 * kicks without it still move the ball to the right area.
 */
const SITUATION_SPOT = {
  safe: [30, 50], possession: [42, 50], attack: [66, 45], dangerous_attack: [83, 50], shot: [86, 48], goal: [96, 50],
  corner: [98, 4], goalkick: [7, 50], freekick: [60, 40], throwin: [50, 2], penalty: [89, 50], offside: [72, 50],
};
export function estimatedBall(situation) {
  const spot = situation?.side && SITUATION_SPOT[situation.situation];
  if (!spot) return null;
  const [x, y] = situation.side === 'away' ? [100 - spot[0], 100 - spot[1]] : spot;
  return { x, y, estimated: true };
}
/** timeline / sc entries → [{ minute, type, team, label }]. */
export function normalizeTimeline(raw) {
  // An object is events grouped by kind ({ GOAL: [{ min, team }] }); plain counts ({ GOAL: [3, 3] }) are not events.
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object'
    ? Object.entries(raw).flatMap(([k, v]) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object').map((x) => ({ type: k, ...x })) : []))
    : [];
  return list.map((x) => {
    if (!x || typeof x !== 'object') return null;
    const name = String(first(x.type, x.event, x.name, x.kind, '')).trim();
    if (!name) return null;
    const t = first(x.team, x.side, x.competitor, x.participant);
    const team = /^(away|2|a)$/i.test(String(t ?? '')) ? 'away' : /^(home|1|h)$/i.test(String(t ?? '')) ? 'home' : null;
    const minute = num(first(x.minute, x.min, x.time, x.timer, x.t));
    const kind = EVENT_TYPES.find(([re]) => re.test(name))?.[1] || name.toLowerCase();
    const cardColor = /red|vermelh/i.test(name) ? 'red' : /yellow|amarel/i.test(name) ? 'yellow' : null;
    const label = String(first(x.text, x.description, name)).trim().slice(0, 80);
    return { minute: minute === null ? null : Math.floor(minute > 200 ? minute / 60 : minute), type: kind, team, label, card: cardColor };
  }).filter(Boolean);
}

/** widget-data → the match state the site uses. */
export function normalizeWidgetData(body) {
  const d = body && typeof body === 'object' ? (body.data && typeof body.data === 'object' && !Array.isArray(body.data) ? { ...body, ...body.data } : body) : {};
  const stats = normalizeStats(first(d.stats, d.statistics));
  const [corH, corA] = pair(d.corner ?? d.corners);
  const [yelH, yelA] = pair(d.yelc ?? d.yellow ?? d.yellow_cards);
  if (corH !== null && !stats.some((s) => s.key === 'corners')) stats.push({ key: 'corners', label: 'Cantos', unit: '', home: corH, away: corA });
  if (yelH !== null && !stats.some((s) => s.key === 'yellow_cards')) stats.push({ key: 'yellow_cards', label: 'Cartões amarelos', unit: '', home: yelH, away: yelA });
  // /ajax/tracker/{id} sends flat pairs: on_target, off_target, attacks, dangerous, possession, red, subs, penalties, offsides.
  const FLAT = [['on_target', 'shots_on_target', 'Remates à baliza', ''], ['off_target', 'shots_off_target', 'Remates para fora', ''],
    ['attacks', 'attacks', 'Ataques', ''], ['dangerous', 'dangerous_attacks', 'Ataques perigosos', ''], ['possession', 'ball_possession', 'Posse de bola', '%'],
    ['red', 'red_cards', 'Cartões vermelhos', ''], ['redc', 'red_cards', 'Cartões vermelhos', ''], ['penalties', 'penalties', 'Penáltis', ''],
    ['offsides', 'offsides', 'Foras de jogo', ''], ['subs', 'substitutions', 'Substituições', '']];
  for (const [k, key, label, unit] of FLAT) {
    const [h, a] = pair(d[k]);
    if (h !== null && a !== null && !stats.some((x) => x.key === key)) stats.push({ key, label, unit, home: h, away: a });
  }
  const xy = Array.isArray(d.xy) ? d.xy : d.xy && typeof d.xy === 'object' ? [d.xy.x, d.xy.y] : null;
  let ball = null;
  // [1, 1] / [0, 0] come with "Ball Safe" and no play: a placeholder, not a position.
  const placeholder = xy && ((num(xy[0]) === 1 && num(xy[1]) === 1) || (num(xy[0]) === 0 && num(xy[1]) === 0));
  if (xy && !placeholder && num(xy[0]) !== null && num(xy[1]) !== null) {
    const scale = (v) => { const n = num(v); return n <= 1 ? n * 100 : n; };
    ball = { x: Math.max(0, Math.min(100, scale(xy[0]))), y: Math.max(0, Math.min(100, scale(xy[1]))) };
  }
  const situation = normalizeSituation(d.situation);
  if (!ball) ball = estimatedBall(situation);
  // sc: per-kind counts as [home, away] ({ GOAL: [3, 3], CORNER: [5, 2], H1: [1, 0] }); H1 is the half-time score.
  let halfTime = null;
  { const [h, a] = pair(d.h1); if (h !== null && a !== null) halfTime = { home: h, away: a }; }
  if (d.sc && typeof d.sc === 'object' && !Array.isArray(d.sc)) {
    for (const [k, v] of Object.entries(d.sc)) {
      const [h, a] = pair(v);
      if (h === null || a === null) continue;
      if (/^h(alf)?1$|^ht$/i.test(k)) { halfTime = { home: h, away: a }; continue; }
      if (/^h(alf)?2$|^goals?$|^score$/i.test(k)) continue;
      const meta = /yellow/i.test(k) ? { key: 'yellow_cards', label: 'Cartões amarelos', unit: '' } : /red/i.test(k) ? { key: 'red_cards', label: 'Cartões vermelhos', unit: '' }
        : statMeta(k.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()));
      if (!stats.some((x) => x.key === meta.key)) stats.push({ ...meta, home: h, away: a });
    }
  }
  const timeline = normalizeTimeline(Array.isArray(d.timeline) && d.timeline.length ? d.timeline : d.sc);
  const timer = num(first(d.timer, d.time));
  const period = first(d.period, null);
  return {
    clock: clockFrom(timer, period, d.status, num(d.match_length) || 90),
    halfTime,
    homeScore: num(first(d.home_score, d.homeScore, d.score?.home, Array.isArray(d.goals) ? d.goals[0] : null)),
    awayScore: num(first(d.away_score, d.awayScore, d.score?.away, Array.isArray(d.goals) ? d.goals[1] : null)),
    status: first(d.status, null), period: first(d.period, null), timer: first(d.timer, d.time, null),
    matchLength: num(d.match_length), injuryTime: num(d.injury_time),
    homeName: first(d.home_name, null), awayName: first(d.away_name, null),
    stats, situation, ball, timeline,
  };
}

/**
 * The match clock from the tracker's timer (seconds played): "67'", or "45+2'" / "90+3'" in
 * added time; "Intervalo" at half time. null when there is no timer.
 */
export function clockFrom(timer, period, status, length = 90) {
  // timer = seconds played (5469 → 91 minutes → "90+1'").
  const s = `${status ?? ''} ${period ?? ''}`.toLowerCase();
  if (/half.?time|interval|break|\bht\b/.test(s)) return 'Intervalo';
  if (timer === null || timer === undefined || !Number.isFinite(Number(timer)) || Number(timer) < 0) return null;
  const min = Math.floor(Number(timer) / 60);
  const half = length / 2;
  const second = /2|second/i.test(String(period ?? ''));
  const end = second ? length : half;
  if (!second && !/1|first/i.test(String(period ?? ''))) return `${min}'`;
  return min > end ? `${end}+${min - end}'` : `${min}'`;
}

const PERIOD_LABEL = (p, status) => {
  const s = `${status ?? ''} ${p ?? ''}`.toLowerCase();
  if (/half.?time|interval|break|ht\b/.test(s)) return 'Intervalo';
  if (/2|second/i.test(String(p ?? ''))) return '2.ª parte';
  if (/1|first/i.test(String(p ?? ''))) return '1.ª parte';
  return null;
};

export function createWinHouseTracker(db, {
  client, pollMs = 2_000, idleMs = 60_000, credentialMinutes = 30, ws = true, WebSocketImpl = globalThis.WebSocket, log = () => {},
} = {}) {
  const bus = new EventEmitter();
  bus.setMaxListeners(0);
  const creds = new Map(); // gameId → { at, eid, akey } | { at, missing: true }
  const watched = new Map(); // eventId → { gameId, timer, last, lastAt, seen:Set, actions:[], lastBall, watchers }
  const enabled = !!client?.enabled && typeof client.widget === 'function';

  async function credentials(gameId, { fresh = false } = {}) {
    const hit = creds.get(gameId);
    if (!fresh && hit && Date.now() - hit.at < (hit.missing ? 5 * 60_000 : credentialMinutes * 60_000)) return hit.missing ? null : hit;
    const r = await client.widget(gameId);
    const c = r.ok ? widgetCredentials(r.body, r.text) : null;
    creds.set(gameId, c ? { at: Date.now(), ...c } : { at: Date.now(), missing: true });
    if (creds.size > 2000) creds.delete(creds.keys().next().value);
    return c;
  }

  /** widget-data as WinHouse sends it (null when there is no tracker for the game). */
  async function rawState(gameId) {
    const viaWidget = async () => {
      let c = await credentials(gameId);
      if (!c) return null;
      let r = await client.widgetData(c.eid, c.akey);
      if (!r.ok || !r.body) { // expired key: ask the widget again once
        c = await credentials(gameId, { fresh: true });
        if (!c) return null;
        r = await client.widgetData(c.eid, c.akey);
        if (!r.ok || !r.body) return null;
      }
      return r.body;
    };
    const body = await viaWidget().catch(() => null);
    if (body || typeof client.tracker !== 'function') return body;
    // No widget for this game (or it failed): the plain tracker route, no key needed.
    const r = await client.tracker(gameId).catch(() => null);
    return r?.ok && r.body && typeof r.body === 'object' && !Array.isArray(r.body) ? r.body : null;
  }

  /** The tracker state of one game (null when WinHouse has no tracker for it). */
  async function state(gameId) {
    const raw = await rawState(gameId);
    return raw ? normalizeWidgetData(raw) : null;
  }

  /** A ws-widget frame → the widget-data fields it carries ({ type: 'tracker', ... } or { data: {...} }). */
  const frameFields = (msg) => {
    if (!msg || typeof msg !== 'object') return null;
    if (msg.type && !/tracker|update|data|state/i.test(String(msg.type))) return null;
    const body = msg.data && typeof msg.data === 'object' && !Array.isArray(msg.data) ? msg.data : msg;
    const { type, event_id: _e, ...fields } = body;
    return fields;
  };

  const publish = (id, type, data) => bus.emit(`e:${id}`, { type, data });

  /** Publishes what changed in a watched match's tracker state (merged widget-data + ws frames). */
  function process(eventId, w) {
    const s = normalizeWidgetData(w.raw);
    w.last = s;
    const row = db.prepare('SELECT home_score, away_score, clock FROM events WHERE id = ?').get(eventId);
    const live = Object.fromEntries(['home', 'away'].map((side) => [side, Object.fromEntries(s.stats.map((x) => [x.key === 'ball_possession' ? 'possession' : x.key, x[side]]))]));
    const ev = { homeScore: row?.home_score ?? s.homeScore, awayScore: row?.away_score ?? s.awayScore, clock: s.clock || row?.clock || null, stats: live };
    const evKey = JSON.stringify(ev);
    if (evKey !== w.lastEvent) { w.lastEvent = evKey; publish(eventId, 'event', ev); }
    if (s.ball || s.situation) {
      const side = s.situation?.side || 'home';
      // The page mirrors the away team's coordinates; send them pre-mirrored so the ball stays put.
      const spot = s.ball ? (side === 'away' ? { x: 100 - s.ball.x, y: 100 - s.ball.y } : s.ball) : { x: null, y: null };
      const key = `${spot.x}|${spot.y}|${s.situation?.situation}|${side}`;
      if (key !== w.lastBall) {
        w.lastBall = key;
        const d = { ...spot, side, situation: s.situation?.situation || null, commentary: s.situation?.text || PERIOD_LABEL(s.period, s.status) || '' };
        w.livedata = d;
        publish(eventId, 'livedata', d);
      }
    }
    for (const a of s.timeline) {
      const id = `${a.minute}|${a.type}|${a.team}|${a.label}`;
      if (w.seen.has(id)) continue;
      w.seen.add(id);
      w.actions.push(a);
      w.actions = w.actions.slice(-15);
      publish(eventId, 'action', a);
    }
  }

  const wsLive = (w) => w.ws && Date.now() - (w.lastFrameAt || 0) < 10_000;

  /** Opens the tracker WebSocket of a watched match; reconnects while someone still watches it. */
  async function connect(eventId, w, { fresh = false } = {}) {
    if (!ws || typeof WebSocketImpl !== 'function' || typeof client.wsUrl !== 'function' || w.ws || w.closed) return;
    try {
      const c = await credentials(w.gameId, { fresh });
      if (!c || w.closed) return;
      const sock = new WebSocketImpl(client.wsUrl(c.eid, c.akey), { headers: { Origin: client.origin, 'User-Agent': 'BET62-Data-Service/1.0' } });
      w.ws = sock;
      const opened = Date.now();
      sock.onmessage = (m) => {
        let msg = null;
        try { msg = JSON.parse(typeof m.data === 'string' ? m.data : String(m.data)); } catch { return; }
        const fields = frameFields(msg);
        if (!fields) return;
        // A frame without xy has no live ball position: drop the previous one (the situation places it).
        w.raw = { ...(w.raw || {}), ...fields };
        if (!('xy' in fields)) delete w.raw.xy;
        w.lastFrameAt = Date.now();
        w.frames = (w.frames || 0) + 1;
        try { process(eventId, w); } catch (err) { log(`tracker ws ${w.gameId}: ${err.message}`); }
      };
      sock.onerror = () => {};
      sock.onclose = () => {
        if (w.ws === sock) w.ws = null;
        if (w.closed || !watched.has(eventId)) return;
        // Quick close (bad key?) → fresh key next time; back off up to a minute.
        w.retry = Math.min(60_000, (w.retry || 2_500) * 2);
        const t = setTimeout(() => connect(eventId, w, { fresh: Date.now() - opened < 5_000 }), w.retry);
        t.unref?.();
      };
    } catch (err) {
      log(`tracker ws ${w.gameId}: ${err.message}`);
    }
  }

  async function tick(eventId) {
    const w = watched.get(eventId);
    if (!w) return;
    if (!w.watchers && Date.now() - w.lastAt > idleMs) {
      clearInterval(w.timer);
      w.closed = true;
      try { w.ws?.close(); } catch { /* already closed */ }
      watched.delete(eventId);
      return;
    }
    if (w.busy) return;
    // With live WebSocket frames, widget-data is only a periodic refresh (timeline, sc, scores).
    if (wsLive(w) && Date.now() - (w.polledAt || 0) < 15_000) return;
    w.busy = true;
    try {
      const raw = await rawState(w.gameId);
      w.polledAt = Date.now();
      if (!raw) return;
      w.raw = { ...(w.raw || {}), ...raw };
      process(eventId, w);
      if (!w.ws) connect(eventId, w);
    } catch (err) {
      log(`tracker ${w.gameId}: ${err.message}`);
    } finally {
      w.busy = false;
    }
  }

  /** A browser follows a live match: start (or keep) reading its tracker; returns a stop function. */
  function follow(eventId, gameId) {
    let w = watched.get(eventId);
    if (!w) {
      w = { gameId: String(gameId), watchers: 0, lastAt: Date.now(), seen: new Set(), actions: [], last: null, livedata: null, lastBall: null, raw: null, ws: null };
      w.timer = setInterval(() => tick(eventId), pollMs);
      w.timer.unref?.();
      watched.set(eventId, w);
      tick(eventId);
    }
    w.watchers += 1;
    return () => { w.watchers = Math.max(0, w.watchers - 1); w.lastAt = Date.now(); };
  }

  const snapshot = (eventId) => {
    const w = watched.get(eventId);
    return { event: null, livedata: w?.livedata ? [w.livedata] : [], actions: w?.actions || [] };
  };

  /** Statistics and timeline for the match page (same shape as the other providers). */
  async function matchExtras(gameId) {
    const s = await state(String(gameId)).catch(() => null);
    if (!s) return { stats: [], incidents: [] };
    const incidents = s.timeline.filter((a) => a.type === 'goal' || a.type === 'card')
      .map((a) => ({ minute: a.minute, type: a.type === 'goal' ? 'goal' : a.card || 'yellow', side: a.team, player: '' }));
    return { stats: s.stats, incidents, period: PERIOD_LABEL(s.period, s.status), clock: s.clock, halfTime: s.halfTime };
  }

  /** Admin: the raw answers of both routes for one game, to map new fields. */
  /** Admin: a few seconds of the tracker WebSocket (first frames, raw and normalized). */
  function listen(c, { ms = 6_000, max = 6 } = {}) {
    if (!ws || typeof WebSocketImpl !== 'function' || typeof client.wsUrl !== 'function') return Promise.resolve({ enabled: false });
    return new Promise((resolve) => {
      const out = { enabled: true, opened: false, frames: 0, samples: [], error: null, closeCode: null };
      let sock;
      let merged = {};
      const done = () => {
        clearTimeout(timer);
        try { sock?.close(); } catch { /* closed */ }
        out.normalized = out.frames ? normalizeWidgetData(merged) : null;
        resolve(out);
      };
      const timer = setTimeout(done, ms);
      try {
        sock = new WebSocketImpl(client.wsUrl(c.eid, c.akey), { headers: { Origin: client.origin, 'User-Agent': 'BET62-Data-Service/1.0' } });
      } catch (err) { out.error = err.message; done(); return; }
      sock.onopen = () => { out.opened = true; };
      sock.onerror = (e) => { out.error = e?.message || 'erro na ligação'; };
      sock.onclose = (e) => { out.closeCode = e?.code ?? null; done(); };
      sock.onmessage = (m) => {
        out.frames += 1;
        const text = typeof m.data === 'string' ? m.data : String(m.data);
        let frame = null;
        try { frame = JSON.parse(text); } catch { /* not JSON */ }
        if (frame && typeof frame === 'object') {
          if (frame.xy !== undefined) out.withXy = (out.withXy || 0) + 1;
          if (frame.situation) out.situations = [...new Set([...(out.situations || []), String(frame.situation)])].slice(0, 20);
        }
        // Samples without the long timeline, so the moving parts (xy, situation, timer) show.
        if (out.samples.length < max) {
          const short = frame && typeof frame === 'object' ? JSON.stringify({ ...frame, timeline: Array.isArray(frame.timeline) ? `[${frame.timeline.length} lances]` : frame.timeline }) : text;
          out.samples.push(short.slice(0, 1500));
        }
        try { const f = frameFields(JSON.parse(text)); if (f) merged = { ...merged, ...f }; } catch { /* not JSON */ }
      };
    });
  }

  async function inspect(gameId, { listenMs = 6_000 } = {}) {
    const w = await client.widget(gameId);
    const c = w.ok ? widgetCredentials(w.body, w.text) : null;
    const out = {
      at: new Date().toISOString(), gameId: String(gameId),
      widget: { status: w.status, bytes: w.bytes, json: w.body !== null, found: !!c, eid: c?.eid ?? null, key: c ? `${c.akey.slice(0, 4)}…` : null,
        sample: c ? undefined : (w.body !== null ? JSON.stringify(w.body) : w.text || '').slice(0, 3000) },
    };
    if (c) {
      const r = await client.widgetData(c.eid, c.akey);
      out.data = { status: r.status, bytes: r.bytes, json: r.body !== null, keys: r.body && typeof r.body === 'object' ? Object.keys(r.body) : null,
        normalized: r.body ? normalizeWidgetData(r.body) : null, sample: (r.body !== null ? JSON.stringify(r.body) : r.text || '').slice(0, 6000) };
      out.ws = await listen(c, { ms: listenMs });
    }
    return out;
  }

  return { enabled, bus, follow, snapshot, isFollowing: (eventId) => watched.has(eventId), state, matchExtras, inspect };
}
