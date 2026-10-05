import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOdd, parseOdds, marketKey, parseLiveEvent, createWinHouseClient } from '../server/winhouse.js';

test('odds strings parse into id, price, selection and market; known markets map to ours', () => {
  assert.deepEqual(parseOdd('1223894688|1.28|1|1001|1x2 [1x2]'), { oddId: 1223894688, price: 1.28, selection: '1', marketId: 1001, marketName: '1x2', marketCode: '1x2' });
  assert.deepEqual(parseOdd('2046601063|1.02|1x|1005|Dupla Hipótese [DC]'), { oddId: 2046601063, price: 1.02, selection: '1x', marketId: 1005, marketName: 'Dupla Hipótese', marketCode: 'DC' });
  assert.equal(parseOdd('x|1.2|1|1001|1x2'), null);
  assert.equal(parseOdd('1|1.00|1|1001|1x2 [1x2]'), null);
  const list = parseOdds('1|1.28|1|1001|1x2 [1x2];2|4.91|x|1001|1x2 [1x2];3|14.5|2|1001|1x2 [1x2];4|1.02|1x|1005|Dupla Hipótese [DC];5|1.9|O|2001|Total [OU]');
  assert.equal(list.length, 5);
  assert.deepEqual(list.map(marketKey), ['1x2|1', '1x2|X', '1x2|2', 'dc|1X', null]);
  assert.equal(parseOdds(['1|1.5|1|1001|1x2 [1x2]']).length, 1);
});

test('a live event: teams, score and minute', () => {
  const e = parseLiveEvent({ id: 950967002, league: 'Spain. Segunda Division', sport_id: 1, name: 'Cordoba - Tenerife', result: '2-1', current_minute: '56:21', odd: '1|1.28|1|1001|1x2 [1x2]' });
  assert.deepEqual({ ...e, odds: e.odds.length }, { gameId: 950967002, sportId: 1, league: 'Spain. Segunda Division', home: 'Cordoba', away: 'Tenerife', homeScore: 2, awayScore: 1, minute: 56, clock: '56:21', odds: 1 });
});

test('health check calls the five routes from the server and reports what came back', async () => {
  const seen = [];
  const fetchImpl = async (url, opts) => {
    seen.push({ url: String(url), referer: opts.headers.Referer });
    const u = new URL(url);
    if (u.pathname === '/ajax/livegames') return new Response(JSON.stringify([{ id: 1, name: 'A - B', result: '0-0', odd: '1|2.1|1|1001|1x2 [1x2];2|3.2|x|1001|1x2 [1x2]' }]), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.pathname === '/ajax/prematchgamesmainleague') return new Response(JSON.stringify({ data: [{ id: 643637273, name: 'C - D' }] }), { status: 200 });
    if (u.pathname === '/ajax/toptenprematchgames') return new Response('<html>login</html>', { status: 403 });
    if (u.pathname === '/ajax/prematchgames24hour') throw new Error('ECONNRESET');
    return new Response(JSON.stringify({ id: 643637273, odd: ['9|1.5|1|1001|1x2 [1x2]'] }), { status: 200 });
  };
  const wh = createWinHouseClient({ baseUrl: 'https://iframe.example', fetchImpl });
  const r = await wh.health();
  const by = Object.fromEntries(r.routes.map((x) => [x.route, x]));
  assert.deepEqual([by.live.status, by.live.events, by.live.oddsParsed, by.live.oddsMapped], [200, 1, 2, 2]);
  assert.equal(by.prematchMain.events, 1);
  assert.deepEqual([by.prematchTop.status, by.prematchTop.json, by.prematchTop.bodyStart], [403, false, '<html>login</html>']);
  assert.match(by.prematch24h.error, /rede: ECONNRESET/);
  assert.equal(by.prematchEvent.path, '/ajax/prematchgame/643637273?lang=pt');
  assert.equal(by.prematchEvent.oddsParsed, 1);
  assert.equal(seen[0].url, 'https://iframe.example/ajax/livegames?lang=pt');
  assert.equal(seen[0].referer, 'https://iframe.example/');
  assert.equal(createWinHouseClient({ baseUrl: '' }).enabled, false);
  assert.equal(createWinHouseClient({ baseUrl: 'http://insecure' }).enabled, false);
});

// ---------- collector ----------

import { openDb, nowIso, tx } from '../server/db.js';
import { normalizeItem, pricesFor, estimateOffset, createWinHouseFeed, blockedGame, finishVerdict } from '../server/winhouse.js';
import { legOutcome } from '../server/markets.js';
import { placeBets } from '../server/betting.js';
import { postTransaction } from '../server/wallet.js';
import { createSettlementEngine } from '../server/settlement.js';

const pad = (n) => String(n).padStart(2, '0');
/** game_date / game_time as WinHouse writes them, for a start `msAgo` ago, in a zone `tz` minutes from UTC. */
const when = (msAgo, tz = 60) => {
  const d = new Date(Date.now() - msAgo + tz * 60_000);
  return { game_date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, game_time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00` };
};
const clock = (min) => `${pad(Math.floor(min))}:${pad(Math.round((min % 1) * 60))}`;
const football = (id, min, result, odd, extra = {}) => ({
  id, league: 'Spain. Segunda Division', country: 'Spain', sport_id: 1, ...when((min + (min > 45 ? 15 : 0)) * 60_000),
  name: 'Cordoba - Tenerife', home_team: 'Cordoba', away_team: 'Tenerife', odd, result, current_minute: clock(min),
  home_logo: 'https://cdn.sportapi.net/opp/v1/color/abc.png', away_logo: 'javascript:alert(1)', ...extra,
});
const ODD = '1223894688|1.24|1|1001|1x2 [1x2],1223895777|5.06|x|1001|1x2 [1x2],1223896866|19.90|2|1001|1x2 [1x2],2046601063|1.01|1x|1005|Dupla Hipótese [DC],2046602152|1.18|12|1005|Dupla Hipótese [DC],2046603241|3.98|x2|1005|Dupla Hipótese [DC],1536179746|2.22|over 4.0|1018|Total de Golos - Mais / Menos [TG_O/U],1575315139|1.68|under 4.0|1018|Total de Golos - Mais / Menos [TG_O/U],1|1.60|over 2.5|1018|Total [TG_O/U],2|2.25|under 2.5|1018|Total [TG_O/U]';

test('items: teams, start time from WinHouse local time, logos only from its CDN, settleable markets only', () => {
  const ev = normalizeItem(football(950967002, 65.95, '2-1', ODD), { tzOffsetMinutes: 60 });
  assert.equal(ev.sport, 'futebol');
  assert.deepEqual([ev.home, ev.away, ev.homeScore, ev.awayScore], ['Cordoba', 'Tenerife', 2, 1]);
  assert.ok(Math.abs(new Date(ev.startTime).getTime() - (Date.now() - 81 * 60_000)) < 2 * 60_000);
  assert.equal(ev.homeLogo, 'https://cdn.sportapi.net/opp/v1/color/abc.png');
  assert.equal(ev.awayLogo, null);
  // 1X2 + DC complete; the 2.5 and the 4.0 totals (a whole line voids on a push).
  assert.deepEqual(ev.prices, { '1x2|1': 124, '1x2|X': 506, '1x2|2': 1990, 'dc|12': 118, 'dc|X2': 398, 'ou|O2.5': 160, 'ou|U2.5': 225, 'ou|O4': 222, 'ou|U4': 168, 'dc|1X': 101 });
  // A suspended (1.00) selection closes its whole market.
  assert.deepEqual(pricesFor([{ marketId: 1001, selection: '1', price: 1.5 }, { marketId: 1001, selection: 'x', price: 1 }, { marketId: 1001, selection: '2', price: 3 }], 'futebol'), {});
  // Unsupported sports (cricket 21) are skipped.
  assert.equal(normalizeItem({ id: 1, sport_id: 21, name: 'A - B', game_date: '2026-10-05', game_time: '21:00:00' }), null);
  assert.deepEqual(pricesFor([{ marketId: 1022, selection: '1', price: 4.01 }, { marketId: 1022, selection: '2', price: 1.25 }, { marketId: 1672, selection: 'over 159.5', price: 1.87 }, { marketId: 1672, selection: 'under 159.5', price: 1.87 }], 'basquetebol'),
    { 'ml|1': 401, 'ml|2': 125, 'ou|O159.5': 187, 'ou|U159.5': 187 });
});

test('clock zone estimated from early live matches', () => {
  const items = [5, 10, 20, 25].map((m, i) => ({ id: i, ...when(m * 60_000, 120), current_minute: clock(m) }));
  assert.equal(estimateOffset(items), 120);
  assert.equal(estimateOffset(items.slice(0, 2)), null);
});

function setupFeed(lists) {
  const db = openDb(':memory:');
  const client = {
    enabled: true,
    live: async () => ({ ok: true, status: 200, body: lists.live }),
    prematchMain: async () => ({ ok: true, status: 200, body: lists.pre || [] }),
    prematchTop: async () => ({ ok: true, status: 200, body: [] }),
    prematch24h: async () => ({ ok: false, status: 500 }),
  };
  const feed = createWinHouseFeed(db, { client, tzOffsetMinutes: 60, finishConfirmSeconds: 0 });
  const { lastInsertRowid } = db.prepare("INSERT INTO users (email, name, birthdate, password_hash, created_at) VALUES ('p@x.pt', 'P', '1990-01-01', 'x', ?)").run(nowIso());
  tx(db, () => postTransaction(db, Number(lastInsertRowid), 10_000, 'deposit', 't'));
  const user = () => db.prepare('SELECT * FROM users').get();
  const row = (ext) => db.prepare("SELECT * FROM events WHERE source = 'winhouse' AND external_id = ?").get(String(ext));
  const bet = (ext, market, code) => {
    const s = db.prepare('SELECT * FROM selections WHERE event_id = ? AND market = ? AND code = ?').get(row(ext).id, market, code);
    return tx(db, () => placeBets(db, user(), { mode: 'single', stakeCents: 500, picks: [{ selectionId: s.id, odds: s.odds_x100 / 100 }] }))[0];
  };
  const betStatus = (id) => db.prepare('SELECT status FROM bets WHERE id = ?').get(id).status;
  return { db, feed, row, bet, betStatus };
}

test('live: in-play prices from the list; a match that leaves it at full time is settled, earlier goes to the operator', async () => {
  const lists = { live: [football(1, 80, '2-1', ODD), football(2, 61, '0-1', ODD, { name: 'Romania - Sweden', home_team: 'Romania', away_team: 'Sweden' })] };
  const t = setupFeed(lists);
  const r = await t.feed.syncLive();
  assert.deepEqual([r.live, r.withOdds], [2, 2]);
  assert.equal(t.row(1).status, 'live');
  assert.equal(t.row(1).clock, "80'");
  assert.ok(t.row(1).live_odds_at);
  const onHome = t.bet(1, '1x2', '1');
  const onAway = t.bet(2, '1x2', '2');
  // Last minutes of match 1, then both leave the list.
  lists.live = [football(1, 90.5, '2-1', ODD)];
  await t.feed.syncLive();
  lists.live = [];
  await t.feed.syncLive(); // first miss: markets closed, waiting
  assert.equal(t.row(1).status, 'live');
  await t.feed.syncLive(); // confirmed
  assert.equal(t.row(1).status, 'finished');
  assert.equal(t.betStatus(onHome), 'won');
  // Match 2 left at 61': not settled, flagged for the operator.
  assert.equal(t.row(2).status, 'live');
  assert.match(t.row(2).review_reason, /minuto 61/);
  assert.equal(t.betStatus(onAway), 'open');
  const queue = createSettlementEngine(t.db).queue();
  assert.ok(queue.some((q) => q.id === t.row(2).id && /WinHouse/.test(q.reason)));
});

test('ice hockey: overtime means a regulation draw — 1X2 settles on it', async () => {
  const hockey = (min, result, odd) => ({ id: 77, sport_id: 4, league: 'RHL', ...when((min + 30) * 60_000), name: 'Akuly - Medvedi', home_team: 'Akuly', away_team: 'Medvedi', result, current_minute: clock(min), odd });
  const HOD = '1|3.05|1|1045|1x2 [1X2],2|6.35|x|1045|1x2 [1X2],3|1.63|2|1045|1x2 [1X2]';
  const lists = { live: [hockey(50, '2-2', HOD)] };
  const t = setupFeed(lists);
  await t.feed.syncLive();
  const onDraw = t.bet(77, '1x2', 'X');
  lists.live = [hockey(62, '2-2', HOD)];
  await t.feed.syncLive();
  lists.live = [hockey(63, '3-2', HOD)];
  await t.feed.syncLive();
  lists.live = [];
  await t.feed.syncLive();
  await t.feed.syncLive();
  const ev = t.row(77);
  assert.deepEqual([ev.status, ev.home_score, ev.away_score, ev.reg_home_score, ev.reg_away_score], ['finished', 3, 2, 2, 2]);
  assert.equal(t.betStatus(onDraw), 'won');
});

test('pre-match: upcoming matches with prices; started ones and failing lists do not break it', async () => {
  const future = (id, hours) => ({ ...football(id, 0, '', ODD), id, ...when(-hours * 3_600_000), current_minute: '' });
  const lists = { live: [], pre: [future(10, 3), future(11, 26), { ...future(12, 3), ...when(10 * 60_000) }] };
  const t = setupFeed(lists);
  const r = await t.feed.syncPrematch();
  assert.deepEqual([r.games, r.created, r.priced, r.listsFailed], [3, 2, 2, 1]);
  assert.equal(t.row(10).status, 'scheduled');
  assert.equal(t.row(12), undefined);
  const s = t.db.prepare("SELECT COUNT(*) AS n FROM selections WHERE event_id = ? AND active = 1").get(t.row(10).id).n;
  assert.equal(s, 10);
  // When it starts, the live list takes it over.
  lists.live = [football(10, 3, '0-0', ODD)];
  await t.feed.syncLive();
  assert.equal(t.row(10).status, 'live');
  assert.equal(t.feed.status().events.live, 1);
});

test('women and youth games are blocked; more sports and correct score', () => {
  const base = { id: 9, sport_id: 1, ...when(-3_600_000), name: 'A - B', home_team: 'A', away_team: 'B', odd: ODD };
  const block = { women: true, youth: true };
  assert.equal(blockedGame({ ...base, league: 'Campeonato Boliviano Sub-19' }, block), true);
  assert.equal(blockedGame({ ...base, league: 'Iceland Championship U19' }, block), true);
  assert.equal(blockedGame({ ...base, league: 'Masters. Rússia. Feminino' }, block), true);
  assert.equal(blockedGame({ ...base, home_team: 'Sovy-Pro (Women)' }, block), true);
  assert.equal(blockedGame({ ...base, league: 'World Tennis. Lexington. Women. Qualification' }, block), true);
  assert.equal(blockedGame({ ...base, league: 'UEFA Nations League' }, block), false);
  assert.equal(blockedGame({ ...base, league: 'Iceland Championship U19' }, { women: true, youth: false }), false);
  assert.equal(normalizeItem({ ...base, league: 'Brazil. Copa Goiânia Sub-20' }, { block }), null);
  assert.ok(normalizeItem({ ...base, league: 'Brazil. Serie A' }, { block }));

  // Table tennis: winner and correct score in sets; volleyball: winner only (no draw).
  const tt = pricesFor([
    { marketId: 1044, selection: '1', price: 3.5 }, { marketId: 1044, selection: '2', price: 1.29 },
    { marketId: 1992, selection: '3:1', price: 7.9 }, { marketId: 1992, selection: '3:2', price: 5.5 }, { marketId: 1992, selection: '1:3', price: 1 },
  ], 'tenismesa');
  assert.deepEqual(tt, { 'ml|1': 350, 'ml|2': 129, 'cs|3:1': 790, 'cs|3:2': 550 });
  assert.deepEqual(pricesFor([{ marketId: 1001, selection: '1', price: 1.41 }, { marketId: 1001, selection: 'x', price: 10 }, { marketId: 1001, selection: '2', price: 2.71 }], 'voleibol'), { 'ml|1': 141, 'ml|2': 271 });
  assert.equal(legOutcome('cs', '3:1', 3, 1), 'won');
  assert.equal(legOutcome('cs', '3:1', 3, 2), 'lost');

  assert.deepEqual(finishVerdict({ sport: 'tenismesa', home_score: 3, away_score: 1 }), { home: 3, away: 1 });
  assert.match(finishVerdict({ sport: 'tenismesa', home_score: 2, away_score: 1 }).review, /incompleto/);
  assert.deepEqual(finishVerdict({ sport: 'voleibol', competition: 'Belarus. Liga Pro 4x4', home: 'A', away: 'B', home_score: 2, away_score: 0 }), { home: 2, away: 0 });
  assert.match(finishVerdict({ sport: 'voleibol', competition: 'VCA League', home: 'A', away: 'B', home_score: 2, away_score: 1 }).review, /incompleto/);
  assert.deepEqual(finishVerdict({ sport: 'futsal', wh_minute: 39.5, home_score: 7, away_score: 5 }), { home: 7, away: 5 });
});

test('games imported before the block are removed unless someone has bet on them', async () => {
  const youth = { ...football(31, 10, '0-0', ODD), league: 'Iceland Championship U19' };
  const lists = { live: [youth], pre: [] };
  const db = openDb(':memory:');
  const client = { enabled: true, live: async () => ({ ok: true, status: 200, body: lists.live }), prematchMain: async () => ({ ok: true, status: 200, body: [] }), prematchTop: async () => ({ ok: true, status: 200, body: [] }), prematch24h: async () => ({ ok: true, status: 200, body: [] }) };
  // Imported while the block was off…
  await createWinHouseFeed(db, { client, tzOffsetMinutes: 60, blockYouth: false }).syncLive();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events WHERE source = 'winhouse'").get().n, 1);
  // …and removed once it is on.
  const r = await createWinHouseFeed(db, { client, tzOffsetMinutes: 60 }).syncPrematch();
  assert.equal(r.removed, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events WHERE source = 'winhouse'").get().n, 0);
});

test('whole-line totals (push voids) and more ice hockey markets; quarter lines skipped', () => {
  assert.deepEqual(pricesFor(parseOdds('1|2.11|over 3.0|1018|T [TG_O/U],2|1.70|under 3.0|1018|T [TG_O/U],3|1.9|over 156.25|1018|T [TG_O/U],4|1.84|under 156.25|1018|T [TG_O/U]'), 'futebol'),
    { 'ou|O3': 211, 'ou|U3': 170 });
  assert.equal(legOutcome('ou', 'O3', 2, 1), 'void');
  assert.equal(legOutcome('ou', 'U3', 1, 1), 'won');
  assert.equal(legOutcome('ou', 'O3', 3, 1), 'won');
  const hockey = 'a|1.87|odd|1160|Golos par/impar [TGT/C],b|1.87|even|1160|Golos par/impar [TGT/C],'
    + 'c|1.57|1x|1168|DC [DSh],d|1.12|12|1168|DC [DSh],e|1.46|x2|1168|DC [DSh],'
    + 'f|1.98|over 11.5|1870|Totais [Totals],g|1.69|under 11.5|1870|Totais [Totals]';
  assert.deepEqual(pricesFor(parseOdds(hockey.replace(/\b[a-g]\|/g, (m) => `${m.charCodeAt(0)}|`)), 'hoquei'), {
    'oe|ODD': 187, 'oe|EVEN': 187, 'dc|1X': 157, 'dc|12': 112, 'dc|X2': 146, 'ou|O11.5': 198, 'ou|U11.5': 169,
  });
  assert.equal(legOutcome('oe', 'ODD', 3, 2), 'won');
  assert.equal(legOutcome('oe', 'EVEN', 3, 2), 'lost');
});
