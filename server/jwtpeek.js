// Read a JWT without verifying it — just to SHOW its model (header + claims) in the admin. Never trusts
// the token; it only base64-decodes the two readable parts so an operator can see what a provider issues.

export function decodeJwt(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const read = (s) => { try { return JSON.parse(Buffer.from(s, 'base64url').toString('utf8')); } catch { return null; } };
  const header = read(parts[0]);
  const payload = read(parts[1]);
  if (!header && !payload) return null; // not a JWT
  const out = { header, payload, parts: parts.length };
  if (payload && typeof payload.exp === 'number') {
    out.expiresAt = new Date(payload.exp * 1000).toISOString();
    out.expired = Date.now() >= payload.exp * 1000;
    out.expiresInSec = Math.round(payload.exp - Date.now() / 1000);
  }
  if (payload && typeof payload.iat === 'number') out.issuedAt = new Date(payload.iat * 1000).toISOString();
  return out;
}

// Mask token-like VALUES (by key name) in a response body so a probe can be shown without dumping secrets.
export function maskTokens(value) {
  const TOKEN_KEY = /token|jwt|secret|^key$|apikey|api_key|auth|session|signature|\bsig\b|password/i;
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o = {};
      for (const [k, val] of Object.entries(v)) {
        o[k] = TOKEN_KEY.test(k) && typeof val === 'string' && val.length > 12 ? `${val.slice(0, 10)}…(${val.length} chars)` : walk(val);
      }
      return o;
    }
    return v;
  };
  return walk(value);
}
