import { test } from 'node:test';
import assert from 'node:assert/strict';
import { widgetCredentials, normalizeWidgetData, normalizeSituation, createWinHouseTracker } from '../server/whtracker.js';
import { openDb, nowIso } from '../server/db.js';

test('tracker credentials from the widget answer: JSON, a widget-data / ws-widget URL or script variables', () => {
  assert.deepEqual(widgetCredentials({ eid: 'abc123', akey: 'K9' }), { eid: 'abc123', akey: 'K9' });
  assert.deepEqual(widgetCredentials(null, '<iframe src="/widget-data?event_id=77001&api_key=f00Ba7"></iframe>'), { eid: '77001', akey: 'f00Ba7' });
  assert.deepEqual(widgetCredentials(null, "new WebSocket('wss://iframe.winhouse.bet/ws-widget?api_key=Zk1&event_id=E55')"), { eid: 'E55', akey: 'Zk1' });
  assert.deepEqual(widgetCredentials(null, '<script>var EID = "991"; var AKEY = "qwe-rty";</script>'), { eid: '991', akey: 'qwe-rty' });
  assert.equal(widgetCredentials(null, '<html>nada</html>'), null);
});

test('widget-data: stats, corners, cards, situation, ball and timeline in the site\'s shape', () => {
  const s = normalizeWidgetData({
    home_score: 1, away_score: 0, status: 'live', period: 2, timer: '63:10',
    stats: { 'On Target': [4, 2], 'Off Target': { home: 3, away: 5 }, Attacks: '51:44', 'Dangerous Attacks': [30, 21], 'Possession %': ['56%', '44%'] },
    corner: [5, 2], yelc: [1, 3],
    situation: 'Away Dangerous Attack', xy: [0.87, 0.17],
    timeline: [{ type: 'GOAL', minute: 23, team: 'home' }, { type: 'YELLOW_CARD', minute: 40, team: 2 }, { type: 'CORNER', minute: 41, team: 'away' }],
  });
  const by = Object.fromEntries(s.stats.map((x) => [x.key, [x.home, x.away]]));
  assert.deepEqual(by, { shots_on_target: [4, 2], shots_off_target: [3, 5], attacks: [51, 44], dangerous_attacks: [30, 21], ball_possession: [56, 44], corners: [5, 2], yellow_cards: [1, 3] });
  assert.deepEqual(s.situation, { side: 'away', situation: 'dangerous_attack', text: 'Away Dangerous Attack' });
  assert.deepEqual(s.ball, { x: 87, y: 17 });
  assert.deepEqual(s.timeline.map((a) => [a.minute, a.type, a.team]), [[23, 'goal', 'home'], [40, 'card', 'away'], [41, 'corner_awarded', 'away']]);
  assert.deepEqual([s.homeScore, s.awayScore], [1, 0]);
  // sc grouped by kind.
  assert.deepEqual(normalizeWidgetData({ sc: { GOAL: [{ minute: 10, team: 1 }] } }).timeline.map((a) => [a.minute, a.type, a.team]), [[10, 'goal', 'home']]);
  assert.equal(normalizeSituation('Home Goal Kick').situation, 'goalkick');
  assert.equal(normalizeSituation('Home Ball Safe').situation, 'safe');
});

test('a watched match streams the tracker: ball, situation and new timeline items; stats for the page', async () => {
  const db = openDb(':memory:');
  const ts = nowIso();
  const { lastInsertRowid } = db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, home_score, away_score, clock, source, external_id, created_at, updated_at)
    VALUES ('futebol', 'L', 'A', 'B', ?, 'live', 1, 0, '63''', 'winhouse', '900', ?, ?)`).run(ts, ts, ts);
  const id = Number(lastInsertRowid);
  let data = { home_score: 1, away_score: 0, stats: { 'On Target': [4, 2] }, situation: 'Home Attack', xy: [0.7, 0.24], timeline: [{ type: 'GOAL', minute: 23, team: 'home' }] };
  const calls = [];
  const client = {
    enabled: true,
    widget: async (g) => { calls.push(`w${g}`); return { ok: true, status: 200, body: null, text: '<script>src="/widget-data?event_id=E900&api_key=KEY1"</script>' }; },
    widgetData: async (eid, akey) => { calls.push(`d${eid}:${akey}`); return { ok: true, status: 200, body: data }; },
  };
  const t = createWinHouseTracker(db, { client, pollMs: 60_000 });
  const got = [];
  t.bus.on(`e:${id}`, (m) => got.push(m));
  const stop = t.follow(id, '900');
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(got.map((m) => m.type), ['event', 'livedata', 'action']);
  assert.deepEqual(got[1].data, { x: 70, y: 24, side: 'home', situation: 'attack', commentary: 'Home Attack' });
  assert.deepEqual(got[0].data.stats.home, { shots_on_target: 4 });
  assert.deepEqual(t.snapshot(id).actions.map((a) => a.type), ['goal']);
  // Away attack: coordinates are sent mirrored (the page mirrors them back).
  data = { ...data, situation: 'Away Dangerous Attack', xy: [0.2, 0.4] };
  got.length = 0;
  await t.state('900').then(() => {});
  stop();
  const extras = await t.matchExtras('900');
  assert.deepEqual(extras.incidents, [{ minute: 23, type: 'goal', side: 'home', player: '' }]);
  assert.equal(extras.stats[0].key, 'shots_on_target');
  assert.equal(calls.filter((c) => c.startsWith('w')).length, 1); // the key is cached
});

test('real widget-data: sc counts are stats (not events), H1 is the half-time score, timer gives the clock', async () => {
  const { clockFrom } = await import('../server/whtracker.js');
  const real = { success: true, event_id: 's9-99.759416090', ts: 1791387297618, sc: { GOAL: [3, 3], H1: [1, 0], CORNER: [6, 4], YELLOW_CARD: [2, 1] },
    home_score: 3, away_score: 3, status: 'live', period: 'Second Half', timer: 5469, situation: 'Away Goal', match_length: 90, injury_time: 0,
    timeline: [{ type: 'goal', min: 28, text: 'Goal - (Civilizations)', team: 'home' }, { type: 'goal', min: 68, text: 'Goal - (El Jazera Egypt)', team: 'away' }],
    home_name: 'Civilizations', away_name: 'El Jazera Egypt', plus: null, pitch: 'v1' };
  const s = normalizeWidgetData(real);
  assert.equal(s.clock, "90+1'");
  assert.deepEqual(s.halfTime, { home: 1, away: 0 });
  assert.deepEqual(Object.fromEntries(s.stats.map((x) => [x.key, [x.home, x.away]])), { corners: [6, 4], yellow_cards: [2, 1] });
  assert.deepEqual(s.timeline.map((a) => [a.minute, a.type, a.team, a.label]), [[28, 'goal', 'home', 'Goal - (Civilizations)'], [68, 'goal', 'away', 'Goal - (El Jazera Egypt)']]);
  assert.deepEqual(s.situation, { side: 'away', situation: 'goal', text: 'Away Goal' });
  // No xy in this frame: the ball is placed by the situation (away goal → at the home goal).
  assert.deepEqual(s.ball, { x: 4, y: 50, estimated: true });
  // Without a timeline, sc counts are not turned into fake events.
  assert.deepEqual(normalizeWidgetData({ sc: { GOAL: [3, 3] } }).timeline, []);
  assert.equal(clockFrom(1500, 'First Half', 'live'), "25'");
  assert.equal(clockFrom(2820, 'First Half', 'live'), "45+2'");
  assert.equal(clockFrom(2700, 'Half Time', 'live'), 'Intervalo');
});

test('the tracker WebSocket moves the ball every frame; widget-data keeps the rest', async () => {
  const db = openDb(':memory:');
  const ts = nowIso();
  const { lastInsertRowid } = db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, home_score, away_score, clock, source, external_id, created_at, updated_at)
    VALUES ('futebol', 'L', 'A', 'B', ?, 'live', 0, 0, '10''', 'winhouse', '901', ?, ?)`).run(ts, ts, ts);
  const id = Number(lastInsertRowid);
  const sockets = [];
  class FakeWS {
    constructor(url, opts) { this.url = url; this.opts = opts; sockets.push(this); }
    send() {}
    close() { this.onclose?.({ code: 1000 }); }
    frame(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
  }
  const client = {
    enabled: true, origin: 'https://iframe.example',
    widget: async () => ({ ok: true, status: 200, body: null, text: 'ws-widget?api_key=AK&event_id=E1' }),
    widgetData: async () => ({ ok: true, status: 200, body: { status: 'live', period: 'First Half', timer: 600, situation: 'Home Attack', timeline: [] } }),
    wsUrl: (eid, akey) => `wss://iframe.example/ws-widget?api_key=${akey}&event_id=${eid}`,
  };
  const t = createWinHouseTracker(db, { client, pollMs: 60_000, WebSocketImpl: FakeWS });
  const got = [];
  t.bus.on(`e:${id}`, (m) => got.push(m));
  const stop = t.follow(id, '901');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].url, 'wss://iframe.example/ws-widget?api_key=AK&event_id=E1');
  got.length = 0;
  sockets[0].frame({ type: 'tracker', event_id: 'E1', xy: [0.7, 0.24], situation: 'Home Dangerous Attack' });
  sockets[0].frame({ type: 'tracker', event_id: 'E1', xy: [0.75, 0.05] });
  const balls = got.filter((m) => m.type === 'livedata').map((m) => [m.data.x, m.data.y, m.data.situation]);
  assert.deepEqual(balls, [[70, 24, 'dangerous_attack'], [75, 5, 'dangerous_attack']]);
  stop();
});

test('admin "Ver tracker" also listens to the WebSocket for a few seconds', async () => {
  const db = openDb(':memory:');
  class FakeWS {
    constructor() { setTimeout(() => { this.onopen?.(); this.onmessage?.({ data: JSON.stringify({ type: 'tracker', xy: [0.94, 0.54], situation: 'Away Corner' }) }); }, 5); }
    close() {}
  }
  const client = {
    enabled: true, origin: 'https://x',
    widget: async () => ({ ok: true, status: 200, body: { eid: 'E', akey: 'K123' } }),
    widgetData: async () => ({ ok: true, status: 200, body: { status: 'live' } }),
    wsUrl: () => 'wss://x/ws-widget',
  };
  const r = await createWinHouseTracker(db, { client, WebSocketImpl: FakeWS }).inspect('5', { listenMs: 50 });
  assert.equal(r.ws.opened, true);
  assert.equal(r.ws.frames, 1);
  assert.deepEqual(r.ws.normalized.ball, { x: 94, y: 54 });
  assert.equal(r.ws.normalized.situation.situation, 'corner');
});

test('without xy the situation places the ball; real timeline kinds get Portuguese-ready types', async () => {
  const { estimatedBall } = await import('../server/whtracker.js');
  assert.deepEqual(normalizeWidgetData({ situation: 'Home Ball Safe' }).ball, { x: 30, y: 50, estimated: true });
  assert.deepEqual(normalizeWidgetData({ situation: 'Away Dangerous Attack' }).ball, { x: 17, y: 50, estimated: true });
  assert.deepEqual(normalizeWidgetData({ situation: 'Home Corner', xy: [0.97, 0.03] }).ball, { x: 97, y: 3 }); // real xy wins
  assert.equal(estimatedBall({ side: null, situation: 'attack' }), null);
  const t = normalizeWidgetData({ timeline: [
    { type: 'shot_on_target', min: 10, team: 'home' }, { type: 'shot_off_target', min: 12, team: 'away' },
    { type: 'corner', min: 11, team: 'home' }, { type: 'yellow_card', min: 29, team: 'away' }, { type: 'substitution', min: 53, team: 'away' },
  ] }).timeline;
  assert.deepEqual(t.map((a) => a.type), ['shot_on_target', 'shot_off_target', 'corner_awarded', 'card', 'substitution']);
  assert.equal(t[3].card, 'yellow');
});

test('/ajax/tracker (flat pairs) is read too; xy [1, 1] with "Ball Safe" is a placeholder', () => {
  const s = normalizeWidgetData({ period: 'Second Half', xy: [1, 1], situation: 'Home Ball Safe', timer: 4465, goals: [3, 2], h1: [2, 2],
    yellow: [2, 6], red: [0, 1], corners: [0, 3], subs: [2, 3], offsides: null, penalties: [1, 0], on_target: [3, 2], off_target: [0, 0],
    attacks: [0, 0], dangerous: [0, 0], possession: [52, 48], timeline: [{ type: 'red_card', min: 40, text: 'Red card - (Mons)', team: 'away' }] });
  assert.deepEqual([s.homeScore, s.awayScore], [3, 2]);
  assert.deepEqual(s.halfTime, { home: 2, away: 2 });
  const by = Object.fromEntries(s.stats.map((x) => [x.key, [x.home, x.away]]));
  assert.deepEqual(by.shots_on_target, [3, 2]);
  assert.deepEqual(by.ball_possession, [52, 48]);
  assert.deepEqual(by.red_cards, [0, 1]);
  assert.deepEqual(by.penalties, [1, 0]);
  assert.deepEqual(by.substitutions, [2, 3]);
  assert.deepEqual(by.corners, [0, 3]);
  assert.deepEqual(by.yellow_cards, [2, 6]);
  assert.deepEqual(s.ball, { x: 30, y: 50, estimated: true }); // not the pitch corner
  assert.deepEqual(s.timeline[0], { minute: 40, type: 'card', team: 'away', label: 'Red card - (Mons)', card: 'red' });
  assert.equal(s.clock, "74'");
});

test('without a widget for the game, the plain /ajax/tracker route feeds the tracker', async () => {
  const db = openDb(':memory:');
  const client = {
    enabled: true,
    widget: async () => ({ ok: false, status: 404, body: null, text: '' }),
    widgetData: async () => ({ ok: false, status: 404 }),
    tracker: async (id) => ({ ok: true, status: 200, body: { goals: [1, 0], on_target: [4, 1], situation: 'Away Attack', xy: [0.3, 0.6] } }),
  };
  const s = await createWinHouseTracker(db, { client }).state('77');
  assert.equal(s.homeScore, 1);
  assert.deepEqual(s.ball, { x: 30, y: 60 });
});
