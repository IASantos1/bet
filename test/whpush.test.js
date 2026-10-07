import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sioUrl, parsePacket, createWinHouseOddsPush } from '../server/whpush.js';

test('socket.io url and packets', () => {
  assert.equal(sioUrl('https://iframe.winhouse.bet'), 'wss://iframe.winhouse.bet/sio/?EIO=3&transport=websocket');
  assert.equal(sioUrl('http://x.test/', '/sio/', { tenant: 'abc' }), 'ws://x.test/sio/?EIO=3&transport=websocket&tenant=abc');
  assert.deepEqual(parsePacket('0{"sid":"a","pingInterval":25000,"pingTimeout":5000}'), { type: 'open', data: { sid: 'a', pingInterval: 25000, pingTimeout: 5000 } });
  assert.deepEqual(parsePacket('40'), { type: 'connect' });
  assert.deepEqual(parsePacket('2'), { type: 'ping' });
  assert.deepEqual(parsePacket('42["new-coefs",{"coefs":[{"coef_id":1,"odd":"1.5"}]}]'), { type: 'event', name: 'new-coefs', args: [{ coefs: [{ coef_id: 1, odd: '1.5' }] }] });
  assert.deepEqual(parsePacket('42/odds,7["x",1]'), { type: 'event', name: 'x', args: [1] });
  assert.equal(parsePacket('42not json'), null);
  assert.equal(parsePacket(''), null);
});

test('push client: handshake, pong, new-coefs handed over, reconnect after close', async () => {
  const sockets = [];
  class FakeWs {
    constructor(url) { this.url = url; this.sent = []; sockets.push(this); }
    send(t) { this.sent.push(t); }
    close() { this.onclose?.({ code: 1000 }); }
  }
  const got = [];
  const push = createWinHouseOddsPush({ url: 'wss://h/sio/?EIO=3&transport=websocket', WebSocketImpl: FakeWs, onCoefs: (c) => got.push(...c) });
  push.start();
  const ws = sockets[0];
  ws.onmessage({ data: '0{"sid":"a","pingInterval":60000,"pingTimeout":5000}' });
  ws.onmessage({ data: '40' });
  assert.equal(push.status().connected, true);
  ws.onmessage({ data: '2' });
  assert.deepEqual(ws.sent, ['3']);
  ws.onmessage({ data: '42["new-coefs",{"coefs":[{"coef_id":7,"odd":"2.1"},{"coef_id":8,"odd":"1.00"}]}]' });
  ws.onmessage({ data: '42["other",{}]' });
  assert.deepEqual(got, [{ coef_id: 7, odd: '2.1' }, { coef_id: 8, odd: '1.00' }]);
  assert.deepEqual([push.status().frames, push.status().coefs], [1, 2]);
  ws.close();
  assert.equal(push.status().connected, false);
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(sockets.length, 2); // reconnected
  push.stop();
});
