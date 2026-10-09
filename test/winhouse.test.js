import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOdd, parseOdds, marketKey, parseLiveEvent, createWinHouseClient, bestLiveGame } from '../server/winhouse.js';

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

test('health check calls the six routes from the server and reports what came back', async () => {
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
  assert.equal(by.liveEvent.path, '/ajax/livegame/1?lang=pt'); // the first live game
  assert.equal(seen[0].url, 'https://iframe.example/ajax/livegames?lang=pt');
  assert.equal(seen[0].referer, 'https://iframe.example/');
  assert.equal(createWinHouseClient({ baseUrl: '' }).enabled, false);
  assert.equal(createWinHouseClient({ baseUrl: 'http://insecure' }).enabled, false);
});

// ---------- collector ----------

import { openDb, nowIso, tx } from '../server/db.js';
import { normalizeItem, pricesFor, estimateOffset, createWinHouseFeed, blockedGame, leagueTerms, finishVerdict, footballLeagues, allowedLeagues, BASKETBALL_TREE, TENNIS_TREE, leagueKey, detailOdds } from '../server/winhouse.js';
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
    prematchEvent: async (id) => (lists.pages?.[id] ? { ok: true, status: 200, body: lists.pages[id] } : { ok: false, status: 404 }),
    liveEvent: async (id) => (lists.livePages?.[id] ? { ok: true, status: 200, body: lists.livePages[id] } : { ok: false, status: 404 }),
    tracker: async (id) => (lists.trackers?.[id] ? { ok: true, status: 200, body: lists.trackers[id] } : { ok: false, status: 404 }),
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

test('a match flagged for review is settled when the tracker says it is over (score not lower than the last seen)', async () => {
  const lists = { live: [football(3, 70, '1-0', ODD), football(4, 70, '0-0', ODD)] };
  const t = setupFeed(lists);
  await t.feed.syncLive();
  const onHome = t.bet(3, '1x2', '1');
  const onDraw = t.bet(4, '1x2', 'X');
  lists.live = [];
  await t.feed.syncLive();
  await t.feed.syncLive();
  assert.ok(t.row(3).review_reason && t.row(4).review_reason);
  // 3: the tracker still shows the 2nd half; 4: it says full time, 0-0.
  lists.trackers = { 3: { status: 'inprogress', period: '2', home_score: 1, away_score: 0 }, 4: { status: 'Ended', home_score: 0, away_score: 0 } };
  const now = Date.now();
  assert.deepEqual(await t.feed.confirmReviews({ now }), { asked: 2, confirmed: 1 });
  assert.equal(t.row(4).status, 'finished');
  assert.equal(t.betStatus(onDraw), 'won');
  assert.equal(t.row(3).status, 'live');
  // Asked again only after 5 minutes; a lower score than the last one seen is not trusted.
  lists.trackers[3] = { status: 'Ended', home_score: 0, away_score: 0 };
  assert.deepEqual(await t.feed.confirmReviews({ now: now + 60_000 }), { asked: 0, confirmed: 0 });
  assert.deepEqual(await t.feed.confirmReviews({ now: now + 6 * 60_000 }), { asked: 1, confirmed: 0 });
  lists.trackers[3] = { status: 'Ended', home_score: 1, away_score: 0 };
  assert.deepEqual(await t.feed.confirmReviews({ now: now + 12 * 60_000 }), { asked: 1, confirmed: 1 });
  assert.equal(t.betStatus(onHome), 'won');
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
  // Virtual football, small table tennis circuits and UTR tennis.
  for (const league of ['FIFA. 4x4. Superleague', 'Esoccer Battle - 8 mins play', 'Subsoccer. Liga', 'Cyber Live Arena', 'ATT. Moscow', 'ATT. Togliatti', 'UTR Pro Tennis Series. San Diego', 'Setka Cup'])
    assert.equal(blockedGame({ ...base, league }, block), true, league);
  assert.equal(blockedGame({ ...base, league: 'FIFA World Cup' }, block), false);
  assert.equal(blockedGame({ ...base, league: 'Brazil. Serie B', home_team: 'Volta Redonda' }, block), false);
  assert.equal(blockedGame({ ...base, league: 'Ecuador. Liga Pro' }, block), false);
  assert.equal(blockedGame({ ...base, sport_id: 20, league: 'Czech. Liga Pro' }, block), true);
  assert.equal(blockedGame({ ...base, league: 'ATT. Moscow' }, { minor: false }), false);
  assert.equal(blockedGame({ ...base, league: 'Some Cup' }, { minor: false, extra: leagueTerms('Liga X, Some Cup') }), true);

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

test('market catalog: every market a game page offers (groups of odd objects)', async () => {
  const { marketCatalog } = await import('../server/winhouse.js');
  const o = (id, odd, mid, market, opt, special = null) => ({ id, game_id: 5, odd, market_id: mid, market, market_option: `${opt} `, special_value: special, mainCategory: 'Main' });
  const body = [
    [o(1, '1.89', '1001', '1x2 [1x2]', '1'), o(2, '3.16', '1001', '1x2 [1x2]', 'x'), o(3, '3.91', '1001', '1x2 [1x2]', '2')],
    [o(4, '1.90', '1234', 'Handicap [AH]', '1', '-1.5'), o(5, '1.00', '1234', 'Handicap [AH]', '2', '+1.5')],
  ];
  assert.equal(detailOdds(body).length, 4); // the 1.00 (suspended) one is left out
  const c = marketCatalog(body);
  assert.equal(c.totalOdds, 4);
  assert.deepEqual(c.markets.map((m) => [m.marketId, m.count, m.mapped, m.code]), [[1001, 3, true, '1x2'], [1234, 1, false, 'AH']]);
  assert.deepEqual(c.markets[1].selections, ['1 [-1.5] @ 1.9']);
  const calls = [];
  const fetchImpl = async (u) => { calls.push(u); const text = u.includes('/prematchgame/') ? JSON.stringify(body) : JSON.stringify([{ id: 77 }]); return { status: 200, ok: true, text: async () => text, headers: { get: () => 'application/json' } }; };
  const client = createWinHouseClient({ baseUrl: 'https://wh.test', fetchImpl });
  const r = await client.markets();
  assert.equal(r.gameId, '77');
  assert.equal(r.markets.length, 2);
  assert.equal(r.sample, undefined);
  assert.ok(calls[1].includes('/ajax/prematchgame/77'));
});

test('game pages: every settleable market of a game (lines, handicaps, BTTS, odd/even, scores, team totals)', async () => {
  const o = (odd, mid, opt, special = null) => ({ id: 1, odd, market_id: String(mid), market: 'm', market_option: `${opt} `, special_value: special });
  const page = [
    [o('1.89', 1001, '1'), o('3.16', 1001, 'x'), o('3.91', 1001, '2')],
    [o('1.92', 1007, 'yes'), o('1.76', 1007, 'no')],
    [o('1.84', 1019, 'odd'), o('1.80', 1019, 'even')],
    [o('7.9', 1011, '1', '-2.5'), o('1.02', 1011, '2', '-2.5'), o('2.78', 1011, '1', '-1.0'), o('1.34', 1011, '2', '-1.0'), o('3.2', 1011, '1', '-1.25'), o('1.26', 1011, '2', '-1.25')],
    [o('1.06', 1018, 'over', '0.5'), o('7.38', 1018, 'under', '0.5'), o('2.15', 1018, 'over', '2.5'), o('1.60', 1018, 'under', '2.5')],
    [o('7.5', 1708, '0:0'), o('5.5', 1708, '1:0'), o('9', 1708, 'other')],
    [o('1.2', 1725, 'over', '0.5'), o('3.75', 1725, 'under', '0.5'), o('3.38', 1714, 'over', '1.5'), o('1.2', 1714, 'under', '1.5')],
    [o('3.0', 1012, '1/1')], // half time / full time: needs the half-time score, not offered
  ];

  assert.deepEqual(pricesFor(detailOdds(page), 'futebol'), {
    '1x2|1': 189, '1x2|X': 316, '1x2|2': 391, 'btts|Y': 192, 'btts|N': 176, 'oe|ODD': 184, 'oe|EVEN': 180,
    'hcp|1-2.5': 790, 'hcp|2+2.5': 102, 'hcp|1-1': 278, 'hcp|2+1': 134,
    'ou|O0.5': 106, 'ou|U0.5': 738, 'ou|O2.5': 215, 'ou|U2.5': 160, 'cs|0:0': 750, 'cs|1:0': 550,
    'tou|1O0.5': 120, 'tou|1U0.5': 375, 'tou|2O1.5': 338, 'tou|2U1.5': 120,
  });
  assert.equal(legOutcome('tou', '1O0.5', 1, 3), 'won');
  assert.equal(legOutcome('tou', '2U1.5', 1, 3), 'lost');
  assert.equal(legOutcome('hcp', '1-1', 2, 1), 'void');
  assert.equal(legOutcome('hcp', '2+1', 1, 1), 'won');

  // The feed reads the pages of games starting soon and keeps the lists' prices on top.
  const future = (id, hours) => ({ ...football(id, 0, '', ODD), id, ...when(-hours * 3_600_000), current_minute: '' });
  const lists = { live: [], pre: [future(10, 3), future(11, 50), future(12, 30)], pages: { 10: page, 12: page } };
  const t = setupFeed(lists);
  await t.feed.syncPrematch();
  const d = await t.feed.syncDetails();
  // Football is read up to 48 h ahead (the bet builder cards need its markets): 12 (30 h) yes, 11 (50 h) no.
  assert.deepEqual([d.window, d.due, d.read, d.failed], [2, 2, 2, 0]);
  const active = (ext) => Object.fromEntries(t.db.prepare('SELECT market, code, odds_x100 FROM selections WHERE event_id = ? AND active = 1').all(t.row(ext).id).map((r) => [`${r.market}|${r.code}`, r.odds_x100]));
  const a = active(10);
  assert.equal(a['btts|Y'], 192);
  assert.equal(a['x|1012~m~1/1'], 300); // half time / full time: imported, settled by the operator
  assert.equal(a['hcp|1-2.5'], 790);
  assert.equal(a['1x2|1'], pricesFor(parseOdds(ODD), 'futebol')['1x2|1']); // list price wins
  // The next list sync keeps the page markets.
  await t.feed.syncPrematch();
  assert.equal(active(10)['tou|2O1.5'], 338);
  // Not read again before the refresh time.
  assert.equal((await t.feed.syncDetails()).due, 0);

  // A deploy: a new feed (empty memory) on the same database. The page markets stay as a fallback
  // through the list reads, even while the page cannot be read…
  const client2 = {
    enabled: true, live: async () => ({ ok: true, status: 200, body: [] }),
    prematchMain: async () => ({ ok: true, status: 200, body: lists.pre }), prematchTop: async () => ({ ok: true, status: 200, body: [] }), prematch24h: async () => ({ ok: false, status: 500 }),
    prematchEvent: async (id) => (lists.pages?.[id] ? { ok: true, status: 200, body: lists.pages[id] } : { ok: false, status: 404 }),
  };
  const restarted = createWinHouseFeed(t.db, { client: client2, tzOffsetMinutes: 60 });
  assert.equal(restarted.status().restored.prematch, 3);
  const saved = lists.pages;
  lists.pages = {};
  await restarted.syncPrematch();
  assert.equal(active(10)['btts|Y'], 192);
  assert.equal(active(10)['hcp|1-2.5'], 790);
  // …are first in line to be read again, and WinHouse's new prices replace them.
  const both = JSON.parse(JSON.stringify(saved[10]).replace('"1.92"', '"2.10"'));
  lists.pages = { 10: both };
  const again = await restarted.syncDetails();
  assert.equal(again.read, 1);
  assert.equal(active(10)['btts|Y'], 210);
});

test('goal totals in Portuguese ("Mais" / "Menos", "mais de 2,5", "Acima (3.5)") are read; a game page is read when a player opens it', async () => {
  const o = (opt, special, odd = '1.9') => ({ id: 1, odd, market_id: '1018', market: 'Total de Golos [TG_O/U]', market_option: `${opt} `, special_value: special });
  const page = [[o('Mais', '2.5'), o('Menos', '2.5'), o('mais de 1,5', null), o('menos de 1,5', null), o('Acima (3.5)', null), o('Abaixo (3.5)', null)]];
  assert.deepEqual(Object.keys(pricesFor(detailOdds(page), 'futebol')).sort(), ['ou|O1.5', 'ou|O2.5', 'ou|O3.5', 'ou|U1.5', 'ou|U2.5', 'ou|U3.5']);

  // A game 5 days ahead: outside the background reads; opening it reads its page once.
  const far = { ...football(20, 0, '', ODD), id: 20, ...when(-5 * 86_400_000), current_minute: '' };
  const lists = { live: [], pre: [far], pages: { 20: page } };
  const t = setupFeed(lists);
  await t.feed.syncPrematch();
  assert.equal((await t.feed.syncDetails()).due, 0);
  const has = (k) => !!t.db.prepare("SELECT 1 FROM selections WHERE event_id = ? AND market || '|' || code = ? AND active = 1").get(t.row(20).id, k);
  assert.equal(has('ou|O3.5'), false);
  assert.equal(await t.feed.readPageNow(t.row(20).id), true);
  assert.equal(has('ou|O3.5'), true);
  assert.equal(await t.feed.readPageNow(t.row(20).id), false, 'not read again before the refresh time');
});

test('game pages in Albanian (sipër / poshtë, po / jo, tek / çift): goal totals, both teams to score, odd / even and team totals are read', async () => {
  const { extraPrices } = await import('../server/winhouse.js');
  const o = (odd, mid, opt, special = null, market = 'm') => ({ id: 1, odd, market_id: String(mid), market, market_option: `${opt} `, special_value: special });
  const page = [
    [o('1.62', 1018, 'sipër', '2.5'), o('2.25', 1018, 'poshtë', '2.5'), o('1.20', 1018, 'sipër', '1.5'), o('4.10', 1018, 'poshtë', '1.5')],
    [o('1.80', 1007, 'po'), o('1.95', 1007, 'jo')],
    [o('1.90', 1019, 'tek'), o('1.88', 1019, 'çift')],
    [o('1.70', 1725, 'sipër', '1.5'), o('2.05', 1725, 'poshtë', '1.5')],
    [o('1.85', 1300017, 'sipër', '9.5', 'Corners · Total [Corners_·_Total]'), o('1.90', 1300017, 'poshtë', '9.5', 'Corners · Total [Corners_·_Total]')],
  ];
  const odds = detailOdds(page);
  assert.deepEqual(pricesFor(odds, 'futebol'), {
    'ou|O2.5': 162, 'ou|U2.5': 225, 'ou|O1.5': 120, 'ou|U1.5': 410, 'btts|Y': 180, 'btts|N': 195, 'oe|ODD': 190, 'oe|EVEN': 188,
    'tou|1O1.5': 170, 'tou|1U1.5': 205,
  });
  // The other markets show in Portuguese.
  assert.deepEqual(extraPrices(odds, { sport: 'futebol' }), {
    'x|1300017~Corners · Total~Mais de (9.5)': 185, 'x|1300017~Corners · Total~Menos de (9.5)': 190,
  });
});

test('every other market of a page becomes an operator-settled selection', async () => {
  const { extraPrices, detailOdds } = await import('../server/winhouse.js');
  const o = (odd, mid, market, opt, special = null) => ({ id: 1, odd, market_id: String(mid), market, market_option: `${opt} `, special_value: special });
  const page = [
    [o('1.89', 1001, '1x2 [1x2]', '1')],
    [o('1.17', 1300017, 'Corners · Total [Corners_·_Total]', 'Over', '6.5'), o('3.87', 1300017, 'Corners · Total [Corners_·_Total]', 'Under', '6.5')],
    [o('2.6', 2412, '1x2 & Total Goals - Over / Under 1.5', '1&over', '1.5')],
    [o('1.0', 1000032, 'Goal In Both Halves', 'Yes'), o('1.74', 1000032, 'Goal In Both Halves', 'No')],
  ];
  assert.deepEqual(extraPrices(detailOdds(page), { sport: 'futebol' }), {
    'x|1300017~Corners · Total~Mais de (6.5)': 117, 'x|1300017~Corners · Total~Menos de (6.5)': 387,
    'x|2412~1x2 & Total Goals - Over / Under 1.5~1&Mais de (1.5)': 260,
    'x|1000032~Goal In Both Halves~Não': 174,
  });
});

test('live game pages: every in-play market, dropped on a goal or when the list suspends the game', async () => {
  const o = (odd, mid, opt, special = null, market = 'm') => ({ id: 1, odd, market_id: String(mid), market, market_option: `${opt} `, special_value: special });
  const page = [
    [o('9.9', 1001, '1')],
    [o('1.92', 1007, 'yes'), o('1.76', 1007, 'no')],
    [o('2.4', 1000050, 'Home', null, 'Next Goal [NG]'), o('1.0', 1000050, 'Away', null, 'Next Goal [NG]')],
  ];
  const lists = { live: [football(20, 30, '0-0', ODD)], livePages: { 20: page } };
  const t = setupFeed(lists);
  await t.feed.syncLive();
  const d = await t.feed.syncLiveDetails();
  assert.deepEqual([d.live, d.due, d.read, d.failed, d.pausedUntil], [1, 1, 1, 0, null]);
  const active = () => Object.fromEntries(t.db.prepare('SELECT market, code, odds_x100 FROM selections WHERE event_id = ? AND active = 1').all(t.row(20).id).map((r) => [`${r.market}|${r.code}`, r.odds_x100]));
  assert.equal(active()['btts|Y'], 192);
  assert.equal(active()['x|1000050~Next Goal~Home'], 240);
  assert.equal(active()['x|1000050~Next Goal~Away'], undefined); // suspended (1.00)
  assert.equal(active()['1x2|1'], 124); // the list's price wins
  // The next list keeps them; not read again before the refresh time.
  await t.feed.syncLive();
  assert.equal(active()['btts|Y'], 192);
  assert.equal((await t.feed.syncLiveDetails()).due, 0);
  // A goal: the page prices go until the page is read again.
  lists.live = [football(20, 31, '1-0', ODD)];
  await t.feed.syncLive();
  assert.equal(active()['btts|Y'], undefined);
  assert.equal(active()['1x2|1'], 124);
  assert.equal((await t.feed.syncLiveDetails()).read, 1);
  assert.equal(active()['btts|Y'], 192);
  // The list suspends the game (every price 1.00): nothing is open, page markets included.
  lists.live = [football(20, 32, '1-0', ODD.replace(/\|\d+\.\d+\|/g, '|1.00|'))];
  await t.feed.syncLive();
  assert.deepEqual(active(), {});
});

test('a live page route that answers 404 to a whole run is paused', async () => {
  const t = setupFeed({ live: [football(21, 30, '0-0', ODD)] });
  await t.feed.syncLive();
  const d = await t.feed.syncLiveDetails();
  assert.deepEqual([d.failed, !!d.pausedUntil], [1, true]);
  assert.equal(await t.feed.syncLiveDetails(), d); // paused: nothing read
});

test('live list: markets we do not settle are imported too (operator-settled)', () => {
  const odd = '975315002|1.31|1|1016|Vencedor do jogo [Match_Winner],975316091|3.44|2|1016|Vencedor do jogo [Match_Winner],'
    + '1282603220|1.11|1|1081|1.º set - Vencedor [1st_Set_Winner],1282604309|6.50|2|1081|1.º set - Vencedor [1st_Set_Winner]';
  const ev = normalizeItem({ id: 5, sport_id: 5, league: 'ATP. Tokyo', name: 'A - B', home_team: 'A', away_team: 'B', ...when(-3_600_000), odd });
  assert.equal(ev.prices['ml|1'] ?? ev.prices['1x2|1'], 131);
  assert.equal(ev.prices['x|1081~1.º set - Vencedor~1'], 111);
  assert.equal(ev.prices['x|1081~1.º set - Vencedor~2'], 650);
});

test('live pages: without a live route (404) the pre-match page of the game is used', async () => {
  const o = (odd, mid, opt) => ({ id: 1, odd, market_id: String(mid), market: 'm', market_option: `${opt} `, special_value: null });
  const t = setupFeed({ live: [football(22, 30, '0-0', ODD)], pages: { 22: [[o('1.92', 1007, 'yes'), o('1.76', 1007, 'no')]] } });
  await t.feed.syncLive();
  const d = await t.feed.syncLiveDetails();
  assert.deepEqual([d.read, d.failed, d.route, d.pausedUntil], [1, 0, 'prematchgame', null]);
  const s = t.db.prepare("SELECT odds_x100 FROM selections WHERE event_id = ? AND market = 'btts' AND code = 'Y' AND active = 1").get(t.row(22).id);
  assert.equal(s.odds_x100, 192);
});

test('"ver mercados ao vivo": first live game, live page or else its pre-match page', async () => {
  const page = [[{ id: 1, odd: '1.92', market_id: '1007', market: 'BTS', market_option: 'yes ', special_value: null }]];
  const calls = [];
  const fetchImpl = async (u) => {
    calls.push(new URL(u).pathname);
    const p = new URL(u).pathname;
    if (p === '/ajax/livegames') return new Response(JSON.stringify([{ id: 55 }]), { status: 200 });
    if (p === '/ajax/livegame/55') return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(page), { status: 200 });
  };
  const r = await createWinHouseClient({ baseUrl: 'https://iframe.example', fetchImpl }).markets({ live: true });
  assert.deepEqual(calls, ['/ajax/livegames', '/ajax/livegame/55', '/ajax/prematchgame/55']);
  assert.deepEqual([r.live, r.gameId, r.route, r.totalOdds], [true, '55', '/ajax/prematchgame/55?lang=pt', 1]);
});

test('admin "Descobrir rotas": the ajax / ws routes in the iframe pages and its scripts', async () => {
  const pages = {
    '/': '<html><script src="/assets/app.123.js"></script><script src="https://cdn.other.com/x.js"></script></html>',
    '/assets/app.123.js': 'fetch("/ajax/livegames?lang="+l);get(`/ajax/liveevent/${id}?lang=pt`);x="/ajax/prematchgame/"+id;new WebSocket("wss://iframe.example/ws-live?x=1")',
  };
  const seen = [];
  const fetchImpl = async (u) => {
    const p = new URL(u).pathname;
    seen.push(u);
    return { status: pages[p] ? 200 : 404, text: async () => pages[p] || '' };
  };
  const r = await createWinHouseClient({ baseUrl: 'https://iframe.example', fetchImpl }).discover();
  const paths = r.routes.map((x) => x.path);
  assert.ok(paths.includes('/ajax/livegames'), paths.join(' '));
  assert.ok(paths.some((p) => p.startsWith('/ajax/liveevent/')), paths.join(' '));
  assert.ok(paths.some((p) => p.startsWith('/ajax/prematchgame/')));
  assert.ok(paths.some((p) => p.startsWith('wss://iframe.example/ws-live')));
  assert.ok(!seen.some((u) => u.includes('cdn.other.com'))); // other origins are not read
  assert.equal(r.scriptsFound, 1);
});

test('"Descobrir rotas" follows the portal to the sportsbook page and its chunks, with context', async () => {
  const pages = {
    '/': '<html><a href="/sportsbook">Desporto</a><a href="/logo.png">x</a><script src="/assets/portal.js"></script></html>',
    '/assets/portal.js': 'window.go=()=>{}',
    '/sportsbook': '<html><script type="module" src="/sb/main.js"></script></html>',
    '/sb/main.js': 'import("./chunk-live.js");',
    '/sb/chunk-live.js': 'const u = base + "/ajax/livegameodds/" + id + "?lang=" + lang; fetch("/ajax/livegames?lang=pt")',
  };
  const fetchImpl = async (u) => { const p = new URL(u).pathname; return { status: pages[p] ? 200 : 404, text: async () => pages[p] || '' }; };
  const r = await createWinHouseClient({ baseUrl: 'https://iframe.example', fetchImpl }).discover();
  assert.ok(r.links.includes('/sportsbook'));
  assert.ok(r.routes.some((x) => x.path.startsWith('/ajax/livegameodds/')), JSON.stringify(r.routes));
  assert.ok(r.hits.some((h) => h.where === '/sb/chunk-live.js' && h.around.includes('livegameodds')));
  assert.ok(!r.visited.some((v) => v.page === '/logo.png'));
});

test('"Descobrir rotas" reads the iframe documentation first and lists the routes it names', async () => {
  const pages = {
    '/llms.txt': '# WinHouse API\n- GET /ajax/livegames?lang=pt\n- GET /ajax/livegame-odds/{id}?lang=pt — all live markets\n',
    '/docs/agent.md': 'Use `/ajax/tracker/{id}` and wss://iframe.example/ws-odds?game={id}',
    '/docs': '<html><body><h1>Docs</h1><code>/ajax/prematchgame/{id}</code></body></html>',
    '/': '<html><a href="/de/">de</a><a href="/docs">docs</a></html>',
  };
  const seen = [];
  const fetchImpl = async (u) => { const p = new URL(u).pathname; seen.push(p); return { status: pages[p] ? 200 : 404, text: async () => pages[p] || '' }; };
  const r = await createWinHouseClient({ baseUrl: 'https://iframe.example', fetchImpl }).discover();
  assert.deepEqual(seen.slice(0, 3), ['/llms.txt', '/docs/agent.md', '/docs']);
  assert.ok(r.docRoutes.includes('/ajax/livegame-odds/{id}?lang=pt'), r.docRoutes.join(' '));
  assert.ok(r.docRoutes.includes('/ajax/prematchgame/{id}'));
  assert.ok(r.docs['/llms.txt'].includes('all live markets'));
  assert.ok(!seen.includes('/de/')); // other-language copies of the portal are skipped
});

test('"Ver mercados ao vivo" shows what the live page answered, even when it falls back', async () => {
  const fetchImpl = async (u) => {
    const p = new URL(u).pathname;
    if (p === '/ajax/livegames') return new Response(JSON.stringify([{ id: 9 }]), { status: 200 });
    if (p === '/ajax/livegame/9') return new Response(JSON.stringify({ error: 'tenant required' }), { status: 400 });
    return new Response('[]', { status: 200 });
  };
  const r = await createWinHouseClient({ baseUrl: 'https://iframe.example', fetchImpl }).markets({ live: true });
  assert.equal(r.liveAttempt.route, '/ajax/livegame/9?lang=pt');
  assert.equal(r.liveAttempt.status, 400);
  assert.match(r.liveAttempt.sample, /tenant required/);
});

test('live book: suspended picks (game_status "0" or 1.00) are skipped; WINHOUSE_LIVE_EVENT=prematchgame is ignored', async () => {
  const { detailOdds } = await import('../server/winhouse.js');
  const o = (odd, opt, status) => ({ id: 1, odd, market_id: '1001', market: '1x2 [1x2]', market_option: opt, special_value: null, game_status: status });
  assert.deepEqual(detailOdds([[o('1.27', '1', '1'), o('5.05', 'x', '0'), o('1.00', '2', '1')]]).map((x) => x.selection), ['1']);
  const { loadConfig } = await import('../server/config.js').catch(() => ({}));
  if (loadConfig) {
    assert.equal(loadConfig({ WINHOUSE_LIVE_EVENT: '/ajax/prematchgame/{gameId}?lang={lang}' }).winhouse.routes.liveEvent, '');
  }
});

test('bestLiveGame: football of a big league before cricket or virtual games', () => {
  const pick = bestLiveGame([
    { id: 1, sport_id: 21, league: 'India. Cricket League' },
    { id: 2, sport_id: 1, league: 'Esoccer Battle - 8 mins' },
    { id: 3, sport_id: 1, league: 'Egypt. Second Division' },
    { id: 4, sport_id: 1, league: 'England. Premier League' },
    { id: 5, sport_id: 2, league: 'NBA' },
  ]);
  assert.equal(pick.id, 4);
});

test('push (new-coefs): live prices move at once, 1.00 closes a pick, a later page read keeps the push', async () => {
  const o = (id, odd, mid, opt, market = 'm') => ({ id, odd, market_id: String(mid), market, market_option: `${opt} ` });
  const page = [
    [o(501, '1.92', 1007, 'yes'), o(502, '1.76', 1007, 'no')],
    [o(503, '2.4', 1000050, 'Home', 'Next Goal [NG]'), o(504, '1.6', 1000050, 'Away', 'Next Goal [NG]')],
  ];
  const lists = { live: [football(30, 30, '0-0', ODD)], livePages: { 30: page } };
  const notified = [];
  const t = setupFeed(lists);
  const client = {
    enabled: true,
    live: async () => ({ ok: true, status: 200, body: lists.live }),
    liveEvent: async (id) => ({ ok: true, status: 200, body: lists.livePages[id] }),
  };
  const feed = createWinHouseFeed(t.db, { client, tzOffsetMinutes: 60, onOdds: (id) => notified.push(id) });
  await feed.syncLive();
  await feed.syncLiveDetails();
  const id = t.row(30).id;
  const active = () => Object.fromEntries(t.db.prepare('SELECT market, code, odds_x100 FROM selections WHERE event_id = ? AND active = 1').all(id).map((r) => [`${r.market}|${r.code}`, r.odds_x100]));
  assert.equal(active()['1x2|1'], 124);
  // From the list (1x2 home) and the page (BTTS yes, an operator market); unknown ids are ignored.
  const touched = feed.applyCoefs([
    { coef_id: 1223894688, odd: '1.30' }, { coef_id: 501, odd: '2.05' }, { coef_id: 504, odd: '1.00' }, { coef_id: 999, odd: '3.3' },
  ]);
  assert.deepEqual(touched, [id]);
  assert.deepEqual(notified, [id]);
  assert.equal(active()['1x2|1'], 130);
  assert.equal(active()['btts|Y'], 205);
  assert.equal(active()['x|1000050~Next Goal~Away'], undefined); // suspended
  assert.equal(active()['x|1000050~Next Goal~Home'], 240);
  // The /ajax answers are cached: a read right after does not undo the push.
  await feed.syncLive();
  assert.equal(active()['1x2|1'], 130);
  assert.equal(active()['x|1000050~Next Goal~Away'], undefined);
  // Reopened.
  feed.applyCoefs([{ coef_id: 504, odd: '1.55' }]);
  assert.equal(active()['x|1000050~Next Goal~Away'], 155);
  const s = feed.status().push;
  assert.equal(s.games, 1);
  assert.ok(s.tracked >= 10);
  // A goal: earlier pushes no longer count.
  lists.live = [football(30, 31, '1-0', ODD)];
  await feed.syncLive();
  assert.equal(active()['1x2|1'], 124);
});

test('football league list: only the listed competitions (names compared loosely); a blocked live game with bets is kept, without prices', async () => {
  const leagues = footballLeagues('');
  assert.ok(leagues.has(leagueKey('England. Premier League')));
  assert.ok(!blockedGame({ sport_id: 1, league: 'england premier league' }, { leagues }));
  assert.ok(!blockedGame({ sport_id: 1, league: 'UEFA Champions League' }, { leagues }));
  assert.ok(blockedGame({ sport_id: 1, league: 'Egypt. Second Division' }, { leagues }));
  assert.ok(!blockedGame({ sport_id: 2, league: 'Egypt. Super League' }, { leagues })); // other sports untouched
  assert.equal(footballLeagues('*'), null);
  assert.deepEqual([...footballLeagues('Spain. La Liga; Italy. Serie A')], ['spainlaliga', 'italyseriea']);

  const lists = { live: [football(40, 30, '0-0', ODD), football(41, 30, '0-0', ODD, { league: 'Spain. La Liga' })] };
  const t = setupFeed(lists);
  await t.feed.syncLive(); // no list yet: both imported
  t.bet(40, '1x2', '1');
  const feed = createWinHouseFeed(t.db, { client: { enabled: true, live: async () => ({ ok: true, status: 200, body: lists.live }) }, tzOffsetMinutes: 60, finishConfirmSeconds: 0, footballLeagues: 'Spain. La Liga' });
  lists.live = [football(40, 35, '1-0', ODD), football(41, 35, '0-0', ODD, { league: 'Spain. La Liga' })];
  await feed.syncLive();
  const open = (ext) => t.db.prepare('SELECT COUNT(*) AS n FROM selections WHERE event_id = ? AND active = 1').get(t.row(ext).id).n;
  assert.equal(t.row(40).status, 'live');
  assert.equal(t.row(40).home_score, 1); // still followed (it has a bet)
  assert.equal(open(40), 0); // but closed to new bets
  assert.ok(open(41) > 0);
});

test('basketball and tennis lists: only the listed competitions; a listed women\'s tournament is shown', () => {
  const leagues = { futebol: footballLeagues(''), basquetebol: allowedLeagues('', BASKETBALL_TREE), tenis: allowedLeagues('', TENNIS_TREE) };
  const block = { women: true, youth: true, minor: true, leagues };
  assert.ok(!blockedGame({ sport_id: 2, league: 'NBA', home_team: 'Lakers', away_team: 'Celtics' }, block));
  assert.ok(!blockedGame({ sport_id: 2, league: 'Spain. Liga ACB' }, block));
  assert.ok(blockedGame({ sport_id: 2, league: 'Egypt. Super League' }, block));
  assert.ok(!blockedGame({ sport_id: 5, league: 'WTA. Beijing', home_team: 'Swiatek I.', away_team: 'Gauff C.' }, block));
  assert.ok(!blockedGame({ sport_id: 5, league: 'World Tennis. Maanshan. Women. Doubles' }, block));
  assert.ok(!blockedGame({ sport_id: 5, league: 'world tennis darwin' }, block));
  assert.ok(blockedGame({ sport_id: 5, league: 'ATP. Challenger. Lyon' }, block));
  assert.ok(blockedGame({ sport_id: 1, league: 'Club Friendlies', home_team: 'Arsenal Women', away_team: 'Chelsea Women' }, block)); // teams still count
  assert.ok(!blockedGame({ sport_id: 4, league: 'Russia. KHL' }, block)); // sports without a list: all
  assert.equal(allowedLeagues('*', TENNIS_TREE), null);
  assert.ok(!blockedGame({ sport_id: 5, league: 'ATP. Challenger. Lyon' }, { leagues: { ...leagues, tenis: null } }));
});

test('game pages: the line after the [CODE] tag is not part of the market name; lines gone from the book are removed, not left locked', async () => {
  const o = (id, odd, opt, special) => ({ id, odd, market_id: '1000300', market: 'European Handicap Including Overtime [EH_Incl_OT] 0:8', market_option: `${opt} `, special_value: special });
  assert.equal(detailOdds([[o(1, '2.94', '1', '0:6')]])[0].marketName, 'European Handicap Including Overtime');
  const lists = { live: [football(50, 30, '0-0', ODD)], livePages: { 50: [[o(1, '2.94', '1', '0:8'), o(2, '1.5', '2', '0:8')], [o(3, '1.88', '1', '0:6')]] } };
  const t = setupFeed(lists);
  await t.feed.syncLive();
  await t.feed.syncLiveDetails();
  const codes = () => t.db.prepare("SELECT code, active FROM selections WHERE event_id = ? AND market = 'x' ORDER BY code").all(t.row(50).id).map((r) => `${r.code}=${r.active}`);
  assert.deepEqual(codes(), [
    '1000300~European Handicap Including Overtime~1 (0:6)=1', '1000300~European Handicap Including Overtime~1 (0:8)=1', '1000300~European Handicap Including Overtime~2 (0:8)=1',
  ]);
  // The 0:8 line leaves the book: gone, not shown locked.
  lists.livePages[50] = [[o(3, '1.9', '1', '0:6')]];
  lists.live = [football(50, 31, '1-0', ODD)]; // a goal: the page is read again at once
  await t.feed.syncLive();
  await t.feed.syncLiveDetails();
  assert.deepEqual(codes(), ['1000300~European Handicap Including Overtime~1 (0:6)=1']);
});

test('streams: games with live video from /ajax/streams (needs the tenant key)', async () => {
  const lists = { live: [football(60, 30, '0-0', ODD), football(61, 30, '0-0', ODD, { league: 'Spain. La Liga', stream_url: 'https://tv.example/embed/61' })] };
  const t = setupFeed(lists);
  const client = {
    enabled: true, hasTenant: true,
    live: async () => ({ ok: true, status: 200, body: lists.live }),
    streams: async () => ({ ok: true, status: 200, body: { success: true, ids: [60, 999] } }),
  };
  const feed = createWinHouseFeed(t.db, { client, tzOffsetMinutes: 60 });
  await feed.syncLive();
  assert.deepEqual(await feed.syncStreams().then((r) => [r.ids, r.live]), [2, 1]);
  assert.deepEqual(feed.streamOf(60), { has: true, url: null });
  assert.deepEqual(feed.streamOf(61), { has: true, url: 'https://tv.example/embed/61' });
  assert.deepEqual(feed.streamOf(62), { has: false, url: null });
  assert.equal(await createWinHouseFeed(t.db, { client: { ...client, hasTenant: false } }).syncStreams(), null);
});

test('future games: each sport\'s full list up to `futureDays` ahead, every `futureMinutes` (or forced); 0 = off', async () => {
  const days = (d) => -d * 1440; // minutes "played" → negative = in the future
  const soon = { ...football(41, days(20), '', ODD), result: '', current_minute: '' };
  const far = { ...football(42, days(50), '', ODD), result: '', current_minute: '' };
  const db = openDb(':memory:');
  const asked = [];
  const empty = async () => ({ ok: true, status: 200, body: [] });
  const client = {
    enabled: true, prematchMain: empty, prematchTop: empty, prematch24h: empty,
    prematchBySport: async (id) => { asked.push(id); return { ok: true, status: 200, body: id === '1' ? [soon, far] : [] }; },
  };
  let setting = 30;
  const feed = createWinHouseFeed(db, { client, tzOffsetMinutes: 60, futureDays: () => setting, futureMinutes: 10 });
  const r = await feed.syncPrematch();
  assert.equal(r.created, 1);
  assert.deepEqual(db.prepare("SELECT external_id FROM events WHERE source = 'winhouse'").all().map((e) => e.external_id), ['41']);
  assert.ok(asked.includes('1') && asked.includes('5'));
  const f = feed.status().last.future;
  assert.equal(f.games, 1);
  assert.equal(f.days, 30);
  assert.ok(f.bySport.futebol.until);
  // Within the refresh gap: not read again; forced (admin "buscar agora"): read again, with the new setting.
  asked.length = 0;
  await feed.syncPrematch();
  assert.equal(asked.length, 0);
  setting = 60;
  await feed.syncPrematch({ force: true });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events WHERE source = 'winhouse'").get().n, 2);
  // 0 = off.
  setting = 0;
  asked.length = 0;
  await feed.syncPrematch({ force: true });
  assert.equal(asked.length, 0);
  assert.equal(feed.status().last.future.off, true);
});

test('a finished match that WinHouse reports at 0 minutes keeps its last clock and is settled when it leaves the list', async () => {
  const db = openDb(':memory:');
  const lists = { live: [football(77, 89, '6-1', ODD)] };
  const empty = async () => ({ ok: true, status: 200, body: [] });
  const client = { enabled: true, live: async () => ({ ok: true, status: 200, body: lists.live }), prematchMain: empty, prematchTop: empty, prematch24h: empty };
  const feed = createWinHouseFeed(db, { client, tzOffsetMinutes: 60, finishConfirmSeconds: 0 });
  await feed.syncLive();
  // Final whistle: the list still has it, but at "00:00".
  lists.live = [{ ...football(77, 89, '6-1', ODD), current_minute: '00:00' }];
  await feed.syncLive();
  let row = db.prepare("SELECT * FROM events WHERE external_id = '77'").get();
  assert.equal(row.wh_minute, 89);
  assert.equal(row.clock, "89'");
  // Gone from the list: missing first, then settled from the last score.
  lists.live = [];
  await feed.syncLive();
  await feed.syncLive();
  row = db.prepare("SELECT * FROM events WHERE external_id = '77'").get();
  assert.deepEqual([row.status, row.home_score, row.away_score], ['finished', 6, 1]);
});
