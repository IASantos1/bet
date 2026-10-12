// Revolut Business API: pays players' withdrawals to their IBAN (as in Bet62Novo,
// artifacts/api-server/src/services/revolut/client.ts — same variables, same flow).
//
// Auth: a refresh token (minted once through /api/revolut/callback) is redeemed for 40-minute access
// tokens with a JWT client assertion signed by the private key whose certificate was uploaded to
// Revolut Business → APIs. Payouts: the player's IBAN becomes a counterparty (reused when it
// exists), then /pay from the payout account. Revolut tells us how each one ends through a signed
// webhook (TransactionStateChanged).

import crypto from 'node:crypto';

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** An RS256 JWT (the client assertion Revolut asks for). */
export function signJwt(payload, privateKey, ttlSeconds = 300) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds }));
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey);
  return `${head}.${body}.${b64url(sig)}`;
}

/** Revolut's transaction states → ours: pending → processing, completed → paid, the rest → failed. */
export function payoutState(state) {
  const s = String(state || '').trim().toLowerCase();
  if (s === 'pending' || s === 'created') return 'processing';
  if (s === 'completed') return 'paid';
  if (['declined', 'failed', 'reverted', 'deleted'].includes(s)) return 'failed';
  return null;
}

export function createRevolut({
  environment = 'sandbox', clientId = '', issuer = '', privateKey = '', refreshToken = '', accountId = '',
  webhookSecret = '', autoMinCents = 2_000, autoMaxCents = 20_000, fetchImpl = globalThis.fetch, log = () => {},
} = {}) {
  const base = environment === 'production' ? 'https://b2b.revolut.com/api/1.0' : 'https://sandbox-b2b.revolut.com/api/1.0';
  const key = String(privateKey || '').replace(/\\n/g, '\n');
  const configured = !!(clientId && issuer && key && refreshToken && accountId);
  let token = null; // { value, until }

  const assertion = () => signJwt({ iss: issuer, sub: clientId, aud: 'https://revolut.com' }, key);
  const fail = (status, message) => Object.assign(new Error(message), { status });

  async function tokenCall(params) {
    const res = await fetchImpl(`${base}/auth/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...params, client_id: clientId, client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: assertion() }),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* not JSON */ }
    if (!res.ok || !data?.access_token) {
      log(`revolut auth HTTP ${res.status}: ${text.slice(0, 300)}`);
      throw fail(502, `Revolut: autenticação falhou (${data?.error_description || data?.error || res.status}).`);
    }
    return data;
  }

  async function accessToken() {
    if (!configured) throw fail(503, 'Revolut não configurada.');
    if (token && token.until - 30_000 > Date.now()) return token.value;
    const d = await tokenCall({ grant_type: 'refresh_token', refresh_token: refreshToken });
    token = { value: d.access_token, until: Date.now() + (d.expires_in ?? 2400) * 1000 };
    return token.value;
  }

  async function call(path, init = {}) {
    const res = await fetchImpl(`${base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : undefined; } catch { data = undefined; }
    if (!res.ok) throw fail(res.status >= 500 ? 502 : 400, `Revolut: ${data?.message || `HTTP ${res.status}`}`);
    return data;
  }

  /** The counterparty for this IBAN (an earlier one reused, else created). */
  async function counterparty({ iban, holderName }) {
    const found = await call(`/counterparties?iban=${encodeURIComponent(iban)}`);
    const live = (Array.isArray(found) ? found : []).find((c) => c.state !== 'deleted');
    if (live) return live.id;
    const words = String(holderName || '').trim().split(/\s+/).filter(Boolean);
    const first = words[0] || 'Cliente';
    const created = await call('/counterparty', {
      method: 'POST',
      body: JSON.stringify({
        profile_type: 'personal', individual_name: { first_name: first, last_name: words.slice(1).join(' ') || first },
        bank_country: iban.slice(0, 2).toUpperCase(), currency: 'EUR', iban,
      }),
    });
    return created.id;
  }

  /**
   * Pays a withdrawal: { id (Revolut transaction), state }. `requestId` makes it idempotent — the
   * same withdrawal never pays twice, even if asked again.
   */
  async function payOut({ iban, holderName, amountCents, reference, requestId }) {
    const counterpartyId = await counterparty({ iban, holderName });
    return call('/pay', {
      method: 'POST',
      body: JSON.stringify({ request_id: requestId, account_id: accountId, receiver: { counterparty_id: counterpartyId }, amount: amountCents / 100, currency: 'EUR', reference }),
    });
  }

  const transaction = (id) => call(`/transaction/${encodeURIComponent(id)}`);

  /** The one-time OAuth step: the code from Revolut's redirect → the refresh token. */
  async function exchangeCode(code) {
    if (!clientId || !issuer || !key) throw fail(503, 'REVOLUT_CLIENT_ID / REVOLUT_JWT_ISSUER / REVOLUT_PRIVATE_KEY em falta.');
    const d = await tokenCall({ grant_type: 'authorization_code', code });
    if (!d.refresh_token) throw fail(502, 'A Revolut não devolveu o refresh_token.');
    return d.refresh_token;
  }

  /** Webhooks v2: `Revolut-Signature: v1=<hex>` = HMAC-SHA256 of `v1.{timestamp}.{body}`, 5 minutes' tolerance. */
  function verifyWebhook(rawBody, signature, timestamp) {
    if (!webhookSecret || !signature || !timestamp) return false;
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60_000) return false;
    const want = crypto.createHmac('sha256', webhookSecret).update(`v1.${timestamp}.${rawBody}`).digest();
    return String(signature).split(',').map((p) => p.trim()).filter((p) => p.startsWith('v1=')).some((p) => {
      const got = Buffer.from(p.slice(3), 'hex');
      return got.length === want.length && crypto.timingSafeEqual(got, want);
    });
  }

  /** Paid automatically (no review): from autoMin to autoMax, inclusive. */
  const autoPays = (amountCents) => configured && amountCents >= autoMinCents && amountCents <= autoMaxCents;

  return {
    configured, environment, autoMinCents, autoMaxCents, webhookSet: !!webhookSecret,
    payOut, transaction, exchangeCode, verifyWebhook, autoPays,
  };
}
