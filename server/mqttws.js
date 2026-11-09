// A tiny MQTT 3.1.1 client over WebSocket — just what the TheSports live feed needs, so we don't pull
// in a heavy dependency (the project keeps few, and already talks to live sockets with the native
// WebSocket, see livews.js). It connects, SUBSCRIBEs to topics, and hands each QoS-0 PUBLISH to a
// callback as { topic, payload:Buffer }. Keep-alive pings, reconnect with backoff, and a wanted-topic
// set that is re-subscribed on every reconnect. The payloads here are opaque bytes; thesports.js
// decodes them.

import { EventEmitter } from 'node:events';

// ---------- packet encoding / decoding (pure, unit-tested) ----------

/** MQTT "remaining length": a base-128 varint, up to 4 bytes. */
export function encodeLength(n) {
  const out = [];
  do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 0x80; out.push(d); } while (n > 0 && out.length < 4);
  return out;
}
/** Read a remaining-length varint at p: [value, bytesUsed] or null if incomplete. */
function readLength(buf, p) {
  let mult = 1, value = 0, used = 0;
  for (;;) {
    if (p + used >= buf.length) return null;
    const b = buf[p + used]; used += 1;
    value += (b & 0x7f) * mult;
    if (!(b & 0x80)) break;
    mult *= 128;
    if (used > 4) throw new Error('remaining length too long');
  }
  return [value, used];
}
const str = (s) => { const b = Buffer.from(String(s), 'utf8'); return Buffer.concat([Buffer.from([b.length >> 8, b.length & 0xff]), b]); };
const packet = (type, flags, body) => Buffer.concat([Buffer.from([(type << 4) | flags, ...encodeLength(body.length)]), body]);

/** CONNECT. Clean session; username/password only when given. */
export function encodeConnect({ clientId = 'bet62', username = '', password = '', keepalive = 60 } = {}) {
  let flags = 0x02; // clean session
  if (username) flags |= 0x80;
  if (password) flags |= 0x40;
  const vh = Buffer.concat([str('MQTT'), Buffer.from([4, flags, keepalive >> 8, keepalive & 0xff])]);
  const payload = [str(clientId)];
  if (username) payload.push(str(username));
  if (password) payload.push(str(password));
  return packet(1, 0, Buffer.concat([vh, ...payload]));
}
/** SUBSCRIBE one topic at QoS 0. */
export function encodeSubscribe(packetId, topic) {
  return packet(8, 0x02, Buffer.concat([Buffer.from([packetId >> 8, packetId & 0xff]), str(topic), Buffer.from([0])]));
}
/** UNSUBSCRIBE one topic. */
export function encodeUnsubscribe(packetId, topic) {
  return packet(10, 0x02, Buffer.concat([Buffer.from([packetId >> 8, packetId & 0xff]), str(topic)]));
}
export const encodePingreq = () => Buffer.from([0xc0, 0x00]);
export const encodeDisconnect = () => Buffer.from([0xe0, 0x00]);

/**
 * Split a buffer into whole MQTT packets. Returns { packets, rest } where rest is the bytes of a
 * packet still arriving. Each packet: { type, ... } — PUBLISH carries { topic, payload }.
 */
export function decode(buf) {
  const packets = [];
  let p = 0;
  while (p < buf.length) {
    const type = buf[p] >> 4, flags = buf[p] & 0x0f;
    const len = readLength(buf, p + 1);
    if (!len) break; // length not fully here yet
    const [remaining, lenBytes] = len;
    const start = p + 1 + lenBytes;
    if (start + remaining > buf.length) break; // body not fully here yet
    const body = buf.subarray(start, start + remaining);
    if (type === 3) { // PUBLISH
      const tlen = (body[0] << 8) | body[1];
      const topic = body.subarray(2, 2 + tlen).toString('utf8');
      let off = 2 + tlen;
      if ((flags >> 1 & 3) > 0) off += 2; // skip packet id for QoS > 0
      packets.push({ type: 'publish', topic, payload: Buffer.from(body.subarray(off)) });
    } else if (type === 2) packets.push({ type: 'connack', returnCode: body[1] });
    else if (type === 9) packets.push({ type: 'suback' });
    else if (type === 11) packets.push({ type: 'unsuback' });
    else if (type === 13) packets.push({ type: 'pingresp' });
    else packets.push({ type: `t${type}` });
    p = start + remaining;
  }
  return { packets, rest: buf.subarray(p) };
}

// ---------- the client ----------

export function createMqttClient({
  url, clientId = `bet62_${Math.random().toString(36).slice(2, 10)}`, username = '', password = '',
  keepaliveSec = 60, reconnectMs = 5_000, log = () => {}, WebSocketImpl = globalThis.WebSocket,
} = {}) {
  const bus = new EventEmitter();
  const state = { connected: false, wanted: new Set(), messages: 0, lastMessageAt: null, lastError: null, reconnects: 0 };
  let ws = null, rest = Buffer.alloc(0), pingTimer = null, reconnectTimer = null, pid = 1, stopped = false;
  const nextPid = () => (pid = pid % 65535 + 1);

  const send = (b) => { try { ws?.send(b); } catch (err) { log(`send: ${err.message}`); } };

  function open() {
    if (stopped || !url || typeof WebSocketImpl !== 'function') return;
    try { ws = new WebSocketImpl(url, 'mqtt'); } catch (err) { state.lastError = err.message; return schedule(); }
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => send(encodeConnect({ clientId, username, password, keepalive: keepaliveSec }));
    ws.onmessage = (ev) => onBytes(Buffer.from(ev.data));
    ws.onerror = (ev) => { state.lastError = ev?.message || 'erro de ligação'; };
    ws.onclose = () => { state.connected = false; clearInterval(pingTimer); schedule(); };
  }
  function onBytes(chunk) {
    rest = Buffer.concat([rest, chunk]);
    let out;
    try { out = decode(rest); } catch (err) { log(`decode: ${err.message}`); rest = Buffer.alloc(0); return; }
    rest = out.rest;
    for (const pk of out.packets) {
      if (pk.type === 'connack') {
        state.connected = pk.returnCode === 0;
        if (!state.connected) { state.lastError = `CONNACK ${pk.returnCode}`; return; }
        for (const t of state.wanted) send(encodeSubscribe(nextPid(), t));
        clearInterval(pingTimer);
        pingTimer = setInterval(() => send(encodePingreq()), keepaliveSec * 1000 * 0.8);
      } else if (pk.type === 'publish') {
        state.messages += 1; state.lastMessageAt = new Date().toISOString();
        bus.emit('message', { topic: pk.topic, payload: pk.payload });
      }
    }
  }
  function schedule() {
    if (stopped) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => { state.reconnects += 1; open(); }, reconnectMs);
  }

  open();
  return {
    on: (...a) => bus.on(...a),
    subscribe(topic) { if (!topic || state.wanted.has(topic)) return; state.wanted.add(topic); if (state.connected) send(encodeSubscribe(nextPid(), topic)); },
    unsubscribe(topic) { if (!state.wanted.delete(topic)) return; if (state.connected) send(encodeUnsubscribe(nextPid(), topic)); },
    status: () => ({ connected: state.connected, topics: state.wanted.size, messages: state.messages, lastMessageAt: state.lastMessageAt, lastError: state.lastError, reconnects: state.reconnects }),
    close() { stopped = true; clearInterval(pingTimer); clearTimeout(reconnectTimer); try { send(encodeDisconnect()); ws?.close(); } catch { /* already gone */ } },
  };
}
