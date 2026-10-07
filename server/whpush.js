// WinHouse real-time odds: the sportsbook's own socket.io feed (server v2.5, Engine.IO 3) at /sio.
// Every price change of the whole book arrives as the event `new-coefs` = { coefs: [{ coef_id, odd }] }
// (a global broadcast, ~300 changes/s). `coef_id` is the same odd id the /ajax pages carry, and a
// price of 1.00 means suspended. No socket.io client is needed: the websocket transport is a few
// text packets ("0{…}" open, "40" connect, "2"/"3" ping/pong, "42[name, data]" event).

/** https://host + /sio → wss://host/sio/?EIO=3&transport=websocket */
export function sioUrl(base, path = '/sio', query = {}) {
  const u = new URL(base);
  u.protocol = u.protocol === 'http:' ? 'ws:' : 'wss:';
  u.pathname = `${path.replace(/\/+$/, '')}/`;
  u.search = '';
  u.searchParams.set('EIO', '3');
  u.searchParams.set('transport', 'websocket');
  for (const [k, v] of Object.entries(query)) if (v) u.searchParams.set(k, v);
  return u.toString();
}

/** One Engine.IO 3 / socket.io 2 text packet → { type, … } or null. */
export function parsePacket(text) {
  const s = String(text ?? '');
  const json = (t) => { try { return JSON.parse(t); } catch { return undefined; } };
  switch (s[0]) {
    case '0': return { type: 'open', data: json(s.slice(1)) || {} };
    case '1': return { type: 'close' };
    case '2': return { type: 'ping' };
    case '3': return { type: 'pong' };
    case '4': {
      const kind = s[1];
      // Namespace ("/name,") and ack id (digits) are optional before the payload.
      const rest = s.slice(2).replace(/^\/[^,[]*,/, '').replace(/^\d+/, '');
      if (kind === '0') return { type: 'connect' };
      if (kind === '1') return { type: 'disconnect' };
      if (kind === '4') return { type: 'error', data: json(rest) ?? rest };
      if (kind === '2') {
        const arr = json(rest);
        return Array.isArray(arr) && typeof arr[0] === 'string' ? { type: 'event', name: arr[0], args: arr.slice(1) } : null;
      }
      return null;
    }
    default: return null;
  }
}

/**
 * Keeps one socket open (reconnecting with backoff) and hands every `new-coefs` batch to onCoefs.
 * status() is shown in the admin.
 */
export function createWinHouseOddsPush({ url, WebSocketImpl = globalThis.WebSocket, onCoefs, log = () => {}, maxBackoffMs = 60_000 } = {}) {
  const state = {
    url, connected: false, opens: 0, frames: 0, coefs: 0, lastFrameAt: null, connectedAt: null,
    lastError: WebSocketImpl ? null : 'WebSocket indisponível neste Node', closeCode: null,
  };
  let ws = null;
  let stopped = true;
  let retryTimer = null;
  let pingTimer = null;
  let backoff = 1000;
  let lastMsgAt = 0;

  const send = (t) => { try { ws?.send(t); } catch { /* closing */ } };

  function retry() {
    if (stopped || retryTimer) return;
    retryTimer = setTimeout(() => { retryTimer = null; connect(); }, backoff);
    retryTimer.unref?.();
    backoff = Math.min(backoff * 2, maxBackoffMs);
  }

  function handle(text) {
    lastMsgAt = Date.now();
    const p = parsePacket(text);
    if (!p) return;
    if (p.type === 'open') {
      const every = Number(p.data.pingInterval) || 25_000;
      const timeout = Number(p.data.pingTimeout) || 20_000;
      clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        // Nothing heard for a whole ping cycle: the socket is dead even if it never said so.
        if (Date.now() - lastMsgAt > every + timeout) { try { ws?.close(); } catch { /* gone */ } return; }
        send('2');
      }, every);
      pingTimer.unref?.();
    } else if (p.type === 'ping') send('3');
    else if (p.type === 'connect') {
      state.connected = true;
      state.connectedAt = new Date().toISOString();
      state.opens += 1;
      backoff = 1000;
    } else if (p.type === 'close' || p.type === 'disconnect') { try { ws?.close(); } catch { /* gone */ } }
    else if (p.type === 'error') state.lastError = typeof p.data === 'string' ? p.data : JSON.stringify(p.data);
    else if (p.type === 'event' && p.name === 'new-coefs') {
      const coefs = p.args[0]?.coefs;
      if (!Array.isArray(coefs)) return;
      state.frames += 1;
      state.coefs += coefs.length;
      state.lastFrameAt = new Date().toISOString();
      try { onCoefs?.(coefs); } catch (err) { state.lastError = err.message; log(`push odds: ${err.message}`); }
    }
  }

  function connect() {
    if (stopped || !WebSocketImpl) return;
    try { ws = new WebSocketImpl(url); } catch (err) { state.lastError = err.message; retry(); return; }
    const me = ws;
    lastMsgAt = Date.now();
    me.onmessage = (m) => { if (ws === me) handle(typeof m.data === 'string' ? m.data : String(m.data)); };
    me.onerror = (e) => { if (ws === me) state.lastError = e?.message || 'erro no socket'; };
    me.onclose = (e) => {
      if (ws !== me) return;
      ws = null;
      state.connected = false;
      state.closeCode = e?.code ?? null;
      clearInterval(pingTimer);
      retry();
    };
  }

  function stop() {
    stopped = true;
    clearTimeout(retryTimer);
    retryTimer = null;
    clearInterval(pingTimer);
    const w = ws;
    ws = null;
    state.connected = false;
    try { w?.close(); } catch { /* gone */ }
  }

  function start() {
    if (!stopped) return stop;
    stopped = false;
    connect();
    return stop;
  }

  return { start, stop, status: () => ({ ...state }), handle };
}
