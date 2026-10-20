import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createWinHouseHealth } from '../server/whhealth.js';

test('WinHouse availability: state, outages and uptime', () => {
  let t = Date.UTC(2026, 9, 20, 10, 0);
  const h = createWinHouseHealth(openDb(':memory:'), { now: () => t });
  assert.equal(h.summary().state, 'sem_leituras');

  for (let i = 0; i < 8; i += 1) { h.note(true, 300); t += 15_000; }
  let s = h.summary();
  assert.equal(s.state, 'online');
  assert.equal(s.avgMs, 300);
  assert.equal(s.outages.length, 0);

  // Two failures: unstable, not an outage yet.
  h.note(false, 0, 'HTTP 502'); t += 15_000;
  h.note(false, 0, 'HTTP 502'); t += 15_000;
  s = h.summary();
  assert.equal(s.state, 'instavel');
  assert.equal(s.outages.length, 0);

  // The third in a row opens it (from the first failure); it lasts until a good read.
  const firstFail = t - 30_000;
  h.note(false, 0, 'timeout'); t += 10 * 60_000;
  s = h.summary();
  assert.equal(s.state, 'em_baixo');
  assert.equal(s.since, new Date(firstFail).toISOString());
  assert.equal(s.outages[0].endedAt, null);
  assert.equal(s.lastError, 'timeout');

  h.note(true, 250);
  s = h.summary();
  assert.equal(s.outages.length, 1);
  assert.ok(s.outages[0].endedAt);
  assert.equal(s.outages[0].minutes, 11);
  assert.equal(s.timeline.length, 96);
  assert.ok(s.timeline.some((x) => x.state === 'partial' || x.state === 'down'));
  assert.ok(s.uptime24h > 0 && s.uptime24h < 100);

  // A few minutes later with good reads only: online again.
  for (let i = 0; i < 16; i += 1) { t += 15_000; h.note(true, 200); }
  assert.equal(h.summary().state, 'online');
});
