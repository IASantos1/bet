import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSportScore, rawForAdmin } from '../server/sportscore.js';

function withFetch(fn, reply) {
  const real = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, opts) => { seen.push({ url: String(url), headers: opts.headers }); return reply(String(url)); };
  return fn(seen).finally(() => { globalThis.fetch = real; });
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('SportScore: the key goes in the header, never in the URL, and answers are cached', () => withFetch(async (seen) => {
  const ss = createSportScore({ apiKey: 'k-123', src: 'bet62' });
  const a = await ss.matches('tennis', 5);
  assert.equal(a.ok, true);
  assert.match(seen[0].url, /\/matches\/\?sport=tennis&limit=5&src=bet62$/);
  assert.equal(seen[0].headers['x-api-key'], 'k-123');
  assert.ok(!seen[0].url.includes('k-123'));
  const b = await ss.matches('tennis', 5);
  assert.equal(b.cached, true);
  assert.equal(seen.length, 1);
  assert.ok(rawForAdmin(a).raw.includes('"matches"'));
}, () => json({ matches: [{ id: 1, slug: 'a-vs-b' }] })));

test('SportScore: Authorization sends Bearer; a query parameter when asked; errors never show the key', () => withFetch(async (seen) => {
  await createSportScore({ apiKey: 'k-9', keyHeader: 'Authorization' }).tracker('basketball', 77);
  assert.equal(seen[0].headers.authorization, 'Bearer k-9');
  const r = await createSportScore({ apiKey: 'k-9', keyParam: 'api_key' }).match('cricket', 'x-vs-y');
  assert.match(seen[1].url, /&api_key=k-9$/);
  assert.equal(r.ok, false);
  assert.ok(!r.error.includes('k-9'));
  assert.equal((await createSportScore().matches('golf')).ok, false);
}, () => json({ error: 'bad key k-9' }, 401)));
