import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeTracker, trackerTopic } from '../server/thesports.js';

const hex = (h) => Buffer.from(h, 'hex');

test('TheSports: a type-1 message gives the ball position and the score', () => {
  const r = decodeTracker(hex('0801122f080110f0eb9c021a260a07312d312d312d30120e08d9081a09302e34312c302e33341a090100d4edc6d706de233004'));
  assert.equal(r.type, 'position');
  assert.equal(r.score, '1-1-1-0');
  assert.deepEqual(r.ball, { x: 0.41, y: 0.34 });
});

test('TheSports: another position, different coordinates', () => {
  const r = decodeTracker(hex('0801122f080110d3eb9c021a260a07322d312d302d31120e08d9081a09302e32312c302e38351a090100e9dec6d7068c153004'));
  assert.deepEqual(r.ball, { x: 0.21, y: 0.85 });
  assert.equal(r.score, '2-1-0-1');
});

test('TheSports: a type-2 message gives live statistics as id/home/away', () => {
  const r = decodeTracker(hex('080212700a060818103c18340a060817105918510a060809100118020a0208040a060803100118010a02081b0a060816100318030a04080810010a04080d18010a060802100618030a0208070a0208200a0208060a060815100318080a060801100218010a0608191037182d0a02080e0a020825'));
  assert.equal(r.type, 'stats');
  const byId = Object.fromEntries(r.stats.map((s) => [s.id, [s.home, s.away]]));
  assert.deepEqual(byId[24], [60, 52]);
  assert.deepEqual(byId[23], [89, 81]);
  assert.deepEqual(byId[9], [1, 2]);
});

test('TheSports: a type-4 message gives the players', () => {
  const r = decodeTracker(hex('080412e7010a05100b188c150a23100118ec18280230cad6053892986d8001018a010e4162647568616c696c6f7620532e0a23100118ac20280230cad60538edad7c8001028a010e41626475726173756c6f7620412e'));
  assert.equal(r.type, 'lineups');
  assert.deepEqual(r.players.map((p) => p.name), ['Abduhalilov S.', 'Abdurasulov A.']);
});

test('TheSports: animation frames and junk do not throw', () => {
  assert.equal(decodeTracker(hex('0809121f08d3eb9c0210041a070200000206000022070101000103000028e9dec6d706')).type, 'other');
  assert.equal(decodeTracker(Buffer.alloc(0)).type, 'invalid');
  assert.equal(decodeTracker(hex('ffffff')).type, 'invalid');
});

test('TheSports: the MQTT topic is built from the SportScore tracker id', () => {
  assert.equal(trackerTopic('y0or5ofw6p5vmwz'), 'v3/live/m1/y0or5ofw6p5vmwz');
  assert.equal(trackerTopic('../evil'), null);
});
