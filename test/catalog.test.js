import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso } from '../server/db.js';
import { analyzePayload, createMarketCatalog } from '../server/catalog.js';

test('catalogue folds every documented odds shape', () => {
  const map = new Map();
  // Sports Pack /odds/: bookmakers (winner) + markets (AH/OU by line and period)
  analyzePayload(map, {
    bookmakers: [{ bookmaker: 'Bet365', odds_home: 1.77, odds_away: 2.19 }, { bookmaker: 'Pinnacle', odds_home: 1.8, odds_away: 2.1 }],
    markets: [
      { market_kind: 'AH', market_family: 'AH', market_line: -3.5, market_period: 'FT', selections: ['HOME', 'AWAY'], bookmakers: [{ bookmaker: 'Bet365', prices: { HOME: { price: 1.91 }, AWAY: { price: 1.91 } } }] },
      { market_kind: 'AH', market_family: 'AH', market_line: -5.5, market_period: 'FT', selections: ['HOME', 'AWAY'], bookmakers: [] },
      { market_kind: 'OU', market_family: 'OU', market_line: 221.5, market_period: '1H', selections: ['OVER', 'UNDER'], bookmakers: [] },
    ],
  }, { eventId: 1, live: false });
  // Football bulk rows and consensus flat prices
  analyzePayload(map, { results: [{ market: 'corners_over_under', outcome: 'over', line: 9.5, period: 'ft', bookmaker_slug: 'bet365', decimal_odds: 1.9 }] }, { eventId: 2, live: true });
  analyzePayload(map, { event_id: 2, home_win: 2.1, draw: 3.3, away_win: 3.4, over_25_goals: 1.8 }, { eventId: 2, live: true });
  const get = (k) => map.get(k);
  assert.deepEqual([...get('AH|AH|FT').lines], ['-3.5', '-5.5']);
  assert.deepEqual([...get('OU|OU|1H').selections], ['OVER', 'UNDER']);
  assert.equal(get('WINNER|bookmakers|FT').bookmakers.size, 2);
  assert.deepEqual([...get('WINNER|bookmakers|FT').selections], ['odds_home', 'odds_away']);
  assert.equal(get('corners_over_under|corners_over_under|ft').live, 1);
  assert.deepEqual([...get('flat|consenso|FT').selections], ['home_win', 'draw', 'away_win', 'over_25_goals']);
});

test('catalogue samples real games per sport and marks what Bet62 already offers', async () => {
  const db = openDb(':memory:');
  const ts = nowIso();
  const future = new Date(Date.now() + 3600e3).toISOString();
  for (const ext of ['1', '2']) {
    db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, source, external_id, created_at, updated_at)
      VALUES ('basquetebol', 'NBA', 'A', 'B', ?, 'scheduled', 'bzzoiro-basketball', ?, ?, ?)`).run(future, ext, ts, ts);
  }
  const provider = {
    sport: 'basquetebol', source: 'bzzoiro-basketball', enabled: () => true,
    rawOdds: async (ext) => ({ markets: [{ market_kind: 'WINNER', selections: ['HOME', 'AWAY'] }, ...(ext === '1' ? [{ market_kind: 'BTTS_X', market_line: 220.5, selections: ['OVER', 'UNDER'] }] : [])] }),
  };
  const c = createMarketCatalog(db, [provider, { sport: 'dardos', source: 'x', enabled: () => false, rawOdds: async () => ({}) }]);
  const r = await c.run({ sample: 5 });
  assert.equal(r.calls, 2);
  const bk = r.sports[0];
  assert.equal(bk.sampled, 2);
  const winner = bk.markets.find((m) => m.kind === 'WINNER');
  const other = bk.markets.find((m) => m.kind === 'BTTS_X');
  assert.deepEqual([winner.events, winner.wired, other.events, other.wired], [2, true, 1, false]);
  assert.equal(r.sports.length, 1); // a switched-off provider is left out
});

test('catalogue: WinHouse, every sport it feeds, markets by id with automatic or manual settlement', async () => {
  const db = openDb(':memory:');
  const ts = nowIso();
  const future = new Date(Date.now() + 3600e3).toISOString();
  for (const [sport, ext, status] of [['futebol', '10', 'scheduled'], ['futebol', '11', 'live'], ['tenis', '20', 'scheduled']]) {
    db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, source, external_id, created_at, updated_at)
      VALUES (?, 'Liga', 'A', 'B', ?, ?, 'winhouse', ?, ?, ?)`).run(sport, status === 'live' ? ts : future, status, ext, ts, ts);
  }
  const asked = [];
  const provider = {
    source: 'winhouse', enabled: () => true,
    sports: () => ['futebol', 'tenis'],
    gameMarkets: async (ext, { live }) => {
      asked.push([ext, live]);
      return { markets: [
        { marketId: 1001, name: '1x2', code: '1x2', category: 'Main', selections: ['1 @ 1.5', 'X @ 3.2', '2 @ 4.0'] },
        ...(ext === '10' ? [{ marketId: 1500, name: 'Cantos', code: 'C', category: 'Corners', selections: ['Over [8.5] @ 1.9', 'Under [8.5] @ 1.8'] }] : []),
      ] };
    },
    wired: (sport) => new Set(sport === 'futebol' ? [1001] : []),
  };
  const r = await createMarketCatalog(db, [provider]).run({ sample: 5 });
  assert.deepEqual(asked.sort(), [['10', false], ['11', true], ['20', false]]);
  const fb = r.sports.find((s) => s.sport === 'futebol');
  assert.deepEqual([fb.source, fb.sampled, fb.sampledLive], ['winhouse', 2, 1]);
  const x12 = fb.markets.find((m) => m.kind === '1x2');
  const corners = fb.markets.find((m) => m.kind === 'Cantos');
  assert.deepEqual([x12.events, x12.pre, x12.live, x12.wired], [2, 1, 1, true]);
  assert.deepEqual([corners.lines, corners.selections, corners.wired], [['8.5'], ['Over', 'Under'], false]);
  assert.equal(r.sports.find((s) => s.sport === 'tenis').markets[0].wired, false);
});
