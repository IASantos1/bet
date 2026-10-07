// WinHouse live video (HLS). The operator's agreement with WinHouse must allow playing the stream
// outside their iframe; until then WINHOUSE_HLS stays off.
//
//   /ajax/livestream?event_id={id}  → { success, embed_url: "https://winhouse.bet/tv/play?t=TOKEN", expires_at }
//   TOKEN carries the stream id ("vi")  → https://winhouse.bet/tv/p/{vi}.m3u8?t=TOKEN
//
// The token is short-lived: each answer is cached until shortly before `expires_at`, then fetched
// again, so a player that asks again near the end gets a fresh address instead of a black screen.

/**
 * A token's payload: JSON in one of its dot-separated parts (JWT-like) or the whole token, base64(url).
 * The part carrying the stream id ("vi") wins over a header ({ alg }).
 */
export function tokenPayload(token) {
  const found = [];
  for (const part of [...String(token || '').split('.'), String(token || '')]) {
    if (!part || part.length < 8) continue;
    try {
      const json = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      if (json && typeof json === 'object' && !Array.isArray(json)) found.push(json);
    } catch { /* not this part */ }
  }
  return found.find((j) => j.vi !== undefined) || found[0] || null;
}

/** WinHouse's livestream answer → { streamId, token, hlsUrl, embedUrl, expiresAt } or an error message. */
export function parseLivestream(body, { hlsPath = '/tv/p/{stream_id}.m3u8?t={token}', tvBase = '' } = {}) {
  if (!body || typeof body !== 'object') return { error: 'resposta inválida da WinHouse' };
  // { success: false, error } or WinHouse's own { Error: true, Message: "error_not_logged_in" }.
  if (body.success === false || body.Error === true) {
    return { error: String(body.Message || body.message || (typeof body.error === 'string' ? body.error : '') || 'sem transmissão para este jogo').slice(0, 200) };
  }
  let embed;
  try { embed = new URL(String(body.embed_url || '')); } catch { return { error: 'resposta sem embed_url' }; }
  if (embed.protocol !== 'https:') return { error: 'embed_url sem https' };
  const token = embed.searchParams.get('t');
  if (!token) return { error: 'embed_url sem token' };
  const payload = tokenPayload(token);
  const streamId = String(payload?.vi ?? body.stream_id ?? '').trim();
  if (!/^\d+$/.test(streamId)) return { error: 'token sem stream id (vi)' };
  const base = (tvBase || embed.origin).replace(/\/+$/, '');
  const hlsUrl = base + hlsPath.replace('{stream_id}', encodeURIComponent(streamId)).replace('{token}', encodeURIComponent(token));
  // expires_at in seconds (or ms); else the token's own exp; else 5 minutes.
  const raw = Number(body.expires_at ?? payload?.exp);
  const expiresAt = Number.isFinite(raw) && raw > 0 ? (raw > 1e12 ? Math.floor(raw / 1000) : raw) : Math.floor(Date.now() / 1000) + 300;
  return { streamId, hlsUrl, embedUrl: embed.toString(), expiresAt };
}

export function createWinHouseLive({
  client, hlsPath, tvBase = '', marginSeconds = 45, playerId = '', log = () => {}, now = () => Date.now(),
} = {}) {
  const cache = new Map(); // WinHouse game id → { at, value } (value: stream or { error })
  const pending = new Map(); // game id → in-flight promise (one WinHouse call per game at a time)
  const enabled = !!client?.livestream;

  // The video needs a signed-in player: one book session for WINHOUSE_STREAM_PLAYER (seamless
  // wallet, /tenant/session with the wallet API key), kept until shortly before it expires.
  let session = null; // { token, until, username }
  let sessionPending = null;
  const sessionInfo = { configured: !!(client?.hasWallet && playerId), ok: null, error: null, at: null, username: null };
  async function sessionToken({ fresh = false } = {}) {
    if (!sessionInfo.configured) return null;
    if (!fresh && session && now() < session.until) return session.token;
    if (sessionPending) return sessionPending;
    sessionPending = (async () => {
      try {
        const r = await client.tenantSession(playerId);
        const token = r.body?.token;
        sessionInfo.at = new Date(now()).toISOString();
        if (!r.ok || !r.body?.ok || !token) {
          sessionInfo.ok = false;
          sessionInfo.error = `HTTP ${r.status}${r.body?.error || r.body?.message ? ` ${r.body.error || r.body.message}` : ''}${r.body?.ip ? ` (IP ${r.body.ip})` : ''}`;
          session = null;
          return null;
        }
        const exp = Number(tokenPayload(token)?.exp);
        const until = Number.isFinite(exp) && exp > 0 ? Math.min((exp > 1e12 ? exp : exp * 1000) - 60_000, now() + 6 * 3600_000) : now() + 30 * 60_000;
        session = { token, until: Math.max(until, now() + 60_000), username: r.body.username || null };
        Object.assign(sessionInfo, { ok: true, error: null, username: session.username });
        return token;
      } catch (err) {
        Object.assign(sessionInfo, { ok: false, error: err.message, at: new Date(now()).toISOString() });
        return null;
      } finally {
        sessionPending = null;
      }
    })();
    return sessionPending;
  }

  async function fetchStream(gameId) {
    let token = await sessionToken();
    let r = await client.livestream(gameId, token);
    // A session the book no longer accepts: open a new one and ask once more.
    if (token && r.body && (r.body.Error === true || r.body.success === false) && /log/i.test(String(r.body.Message || r.body.reason || ''))) {
      token = await sessionToken({ fresh: true });
      if (token) r = await client.livestream(gameId, token);
    }
    if (!r.ok) return { error: `WinHouse HTTP ${r.status}`, retryAfter: 15 };
    const s = parseLivestream(r.body, { hlsPath, tvBase });
    return s.error ? { ...s, retryAfter: 30 } : s;
  }

  /** The game's HLS address (cached while the token is good), or { error }. */
  async function getLiveStream(gameId) {
    const id = String(gameId);
    const hit = cache.get(id);
    const t = now() / 1000;
    if (hit && (hit.value.error ? t < hit.until : t < hit.value.expiresAt - marginSeconds)) return hit.value;
    if (pending.has(id)) return pending.get(id);
    const p = (async () => {
      try {
        const value = await fetchStream(id);
        cache.set(id, { value, until: t + (value.retryAfter || 0) });
        if (cache.size > 2000) for (const [k, v] of cache) if ((v.value.expiresAt || v.until) < t) cache.delete(k);
        return value;
      } catch (err) {
        log(`livestream ${id}: ${err.message}`);
        return { error: err.message };
      } finally {
        pending.delete(id);
      }
    })();
    pending.set(id, p);
    return p;
  }

  return { enabled, getLiveStream, sessionToken, session: () => ({ ...sessionInfo }), cacheSize: () => cache.size };
}
