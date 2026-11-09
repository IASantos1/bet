import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeLength, encodeConnect, encodeSubscribe, encodePingreq, decode, createMqttClient } from '../server/mqttws.js';

test('MQTT: remaining-length varint', () => {
  assert.deepEqual(encodeLength(0), [0x00]);
  assert.deepEqual(encodeLength(127), [0x7f]);
  assert.deepEqual(encodeLength(128), [0x80, 0x01]);
  assert.deepEqual(encodeLength(16383), [0xff, 0x7f]);
});

test('MQTT: CONNECT carries MQTT/level 4 and the client id, and username/password only when given', () => {
  const noAuth = encodeConnect({ clientId: 'bet62', keepalive: 60 });
  assert.equal(noAuth[0], 0x10); // CONNECT
  assert.ok(noAuth.includes(Buffer.from('MQTT')[0]) && noAuth.toString('latin1').includes('MQTT'));
  assert.ok(noAuth.toString('latin1').includes('bet62'));
  assert.equal(noAuth[9], 0x02); // flags: clean session only
  const auth = encodeConnect({ clientId: 'x', username: 'u', password: 'p' });
  assert.equal(auth[9], 0x02 | 0x80 | 0x40);
  assert.ok(auth.toString('latin1').includes('u') && auth.toString('latin1').includes('p'));
});

test('MQTT: SUBSCRIBE has the 0x82 header, the topic and QoS 0', () => {
  const s = encodeSubscribe(1, 'v3/live/m1/abc');
  assert.equal(s[0], 0x82);
  assert.ok(s.toString('latin1').includes('v3/live/m1/abc'));
  assert.equal(s[s.length - 1], 0x00); // requested QoS 0
});

test('MQTT: decode reads a QoS-0 PUBLISH into topic + payload, and buffers a split packet', () => {
  // PUBLISH, topic "v3/live/m1/x" (12 bytes), payload 0xAA 0xBB
  const topic = 'v3/live/m1/x';
  const body = Buffer.concat([Buffer.from([0, topic.length]), Buffer.from(topic), Buffer.from([0xaa, 0xbb])]);
  const pub = Buffer.concat([Buffer.from([0x30, body.length]), body]);
  const whole = decode(pub);
  assert.equal(whole.packets.length, 1);
  assert.equal(whole.packets[0].topic, topic);
  assert.deepEqual([...whole.packets[0].payload], [0xaa, 0xbb]);
  // split across two chunks: first half gives nothing, the rest completes it
  const half = decode(pub.subarray(0, 5));
  assert.equal(half.packets.length, 0);
  const joined = decode(Buffer.concat([half.rest, pub.subarray(5)]));
  assert.equal(joined.packets[0].topic, topic);
});

test('MQTT: decode handles CONNACK and PINGRESP, and two packets back to back', () => {
  const connack = Buffer.from([0x20, 0x02, 0x00, 0x00]);
  const pingresp = Buffer.from([0xd0, 0x00]);
  const r = decode(Buffer.concat([connack, pingresp]));
  assert.deepEqual(r.packets.map((p) => p.type), ['connack', 'pingresp']);
  assert.equal(r.packets[0].returnCode, 0);
});

test('MQTT: the client subscribes after CONNACK and delivers a PUBLISH, with a fake socket', async () => {
  const sent = [];
  let inst;
  class FakeWS {
    constructor() { inst = this; this.binaryType = ''; setTimeout(() => this.onopen?.(), 0); }
    send(b) { sent.push(Buffer.from(b)); }
    close() {}
  }
  const got = [];
  const c = createMqttClient({ url: 'wss://x/mqtt', clientId: 'bet62', WebSocketImpl: FakeWS });
  c.on('message', (m) => got.push(m));
  c.subscribe('v3/live/m1/x');
  await new Promise((r) => setTimeout(r, 5)); // let onopen fire (sends CONNECT)
  assert.equal(sent[0][0], 0x10); // CONNECT
  inst.onmessage({ data: Buffer.from([0x20, 0x02, 0x00, 0x00]) }); // CONNACK ok → subscribes
  assert.ok(sent.some((b) => b[0] === 0x82)); // SUBSCRIBE went out
  const topic = 'v3/live/m1/x';
  const body = Buffer.concat([Buffer.from([0, topic.length]), Buffer.from(topic), Buffer.from([1, 2, 3])]);
  inst.onmessage({ data: Buffer.concat([Buffer.from([0x30, body.length]), body]) });
  assert.equal(got.length, 1);
  assert.equal(got[0].topic, topic);
  assert.deepEqual([...got[0].payload], [1, 2, 3]);
  assert.equal(c.status().connected, true);
  c.close();
});
