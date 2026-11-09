import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTheSportsLive } from '../server/thesportslive.js';

const hex = (h) => Buffer.from(h, 'hex');

// A fake MQTT client that records subscriptions and lets the test push PUBLISH messages.
function fakeFactory(sink) {
  return () => {
    let handler = null;
    const api = {
      on: (_e, h) => { handler = h; },
      subscribe: (t) => sink.subs.push(t),
      unsubscribe: (t) => sink.unsubs.push(t),
      status: () => ({ connected: true, messages: sink.msgs, lastError: null }),
      close: () => { sink.closed = true; },
      push: (topic, payload) => { sink.msgs += 1; handler?.({ topic, payload }); },
    };
    sink.client = api;
    return api;
  };
}

test('TheSports live: listenAll subscribes to the wildcard; a position message updates the match', () => {
  const sink = { subs: [], unsubs: [], msgs: 0 };
  const live = createTheSportsLive({ url: 'wss://x/mqtt', mqttFactory: fakeFactory(sink) });
  assert.equal(live.listenAll(), true);
  assert.deepEqual(sink.subs, ['v3/live/m1/#']);
  sink.client.push('v3/live/m1/abc123', hex('0801122f080110d3eb9c021a260a07322d312d302d31120e08d9081a09302e32312c302e38351a090100e9dec6d7068c153004'));
  const m = live.get('abc123');
  assert.equal(m.score, '2-1-0-1');
  assert.deepEqual(m.ball, { x: 0.21, y: 0.85 });
  const snap = live.snapshot();
  assert.equal(snap[0].id, 'abc123');
  assert.equal(snap[0].stats, 0);
  assert.equal(live.status().connected, true);
});

test('TheSports live: stats and lineups land on the same match; watch/unwatch build the id topic', () => {
  const sink = { subs: [], unsubs: [], msgs: 0 };
  const live = createTheSportsLive({ url: 'wss://x/mqtt', mqttFactory: fakeFactory(sink) });
  live.watch('y0or5ofw6p5vmwz');
  assert.ok(sink.subs.includes('v3/live/m1/y0or5ofw6p5vmwz'));
  sink.client.push('v3/live/m1/y0or5ofw6p5vmwz', hex('080212700a060818103c18340a060817105918510a060809100118020a0208040a060803100118010a02081b0a060816100318030a04080810010a04080d18010a060802100618030a0208070a0208200a0208060a060815100318080a060801100218010a0608191037182d0a02080e0a020825'));
  assert.ok(live.snapshot()[0].stats >= 3);
  live.unwatch('y0or5ofw6p5vmwz');
  assert.ok(sink.unsubs.includes('v3/live/m1/y0or5ofw6p5vmwz'));
});

test('TheSports live: disabled without a url', () => {
  const live = createTheSportsLive({});
  assert.equal(live.enabled, false);
  assert.equal(live.listenAll(), false);
  assert.equal(live.status().enabled, false);
});
