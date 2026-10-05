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
