// Stripe deposits: a hosted Checkout page (card, MB WAY, Multibanco… whatever is turned on in the
// Stripe dashboard), credited once when Stripe says it is paid — by the webhook, or by asking Stripe
// when the player comes back. No SDK: two REST calls and the webhook signature (HMAC-SHA256).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { nowIso, tx } from './db.js';
import { postTransaction } from './wallet.js';

/** Stripe's form encoding: { a: { b: 1 }, c: [x] } → a[b]=1&c[0]=x */
export function formEncode(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') formEncode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

/**
 * Stripe-Signature "t=…,v1=…[,v1=…]" over `${t}.${rawBody}` with the endpoint secret (whsec_…).
 * Returns the parsed event, or throws.
 */
export function verifyWebhook(rawBody, header, secret, { toleranceSeconds = 300, now = Date.now() } = {}) {
  if (!secret) throw new Error('webhook secret em falta');
  const parts = String(header || '').split(',').map((p) => p.trim().split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length) throw new Error('assinatura inválida');
  if (Math.abs(now / 1000 - t) > toleranceSeconds) throw new Error('assinatura fora de prazo');
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${body}`).digest('hex'));
  const ok = sigs.some((s) => { const b = Buffer.from(String(s)); return b.length === expected.length && timingSafeEqual(b, expected); });
  if (!ok) throw new Error('assinatura inválida');
  return JSON.parse(body);
}

export function createStripe(db, {
  secretKey, webhookSecret = '', currency = 'eur', apiBase = 'https://api.stripe.com/v1', fetchImpl = globalThis.fetch, log = () => {},
} = {}) {
  const enabled = !!secretKey;
  const live = /^(sk|rk)_live_/.test(secretKey || '');

  async function call(method, path, params) {
    const res = await fetchImpl(`${apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: params ? formEncode(params).toString() : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = body?.error?.message || `HTTP ${res.status}`;
      log(`stripe ${method} ${path}: ${msg}`);
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  /** A Checkout page for a deposit → { id, url }. The row is "pending" until Stripe says paid. */
  async function createDeposit(user, amountCents, { successUrl, cancelUrl }) {
    const session = await call('POST', '/checkout/sessions', {
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: String(user.id),
      customer_email: user.email,
      line_items: [{ quantity: 1, price_data: { currency, unit_amount: amountCents, product_data: { name: 'Depósito na carteira' } } }],
      metadata: { user_id: String(user.id), kind: 'deposit' },
      payment_intent_data: { metadata: { user_id: String(user.id), kind: 'deposit' } },
    });
    db.prepare(
      `INSERT INTO stripe_payments (session_id, user_id, amount_cents, currency, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)`
    ).run(session.id, user.id, amountCents, currency, nowIso());
    return { id: session.id, url: session.url };
  }

  /**
   * Applies what Stripe says about one Checkout session. Credits the wallet exactly once, with the
   * amount stored when the page was created (and checked against what Stripe charged).
   */
  function applySession(session) {
    const row = db.prepare('SELECT * FROM stripe_payments WHERE session_id = ?').get(String(session?.id || ''));
    if (!row) return { status: 'unknown' };
    if (row.status === 'paid') return { status: 'paid', row };
    const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
    if (paid) {
      if (Number(session.amount_total) !== row.amount_cents || String(session.currency).toLowerCase() !== row.currency) {
        db.prepare("UPDATE stripe_payments SET status = 'mismatch', updated_at = ? WHERE id = ?").run(nowIso(), row.id);
        log(`stripe ${row.session_id}: valor ${session.amount_total} ${session.currency} ≠ ${row.amount_cents} ${row.currency}`);
        return { status: 'mismatch', row };
      }
      return tx(db, () => {
        // Inside the transaction: a webhook and the player's return can arrive together.
        const r = db.prepare("UPDATE stripe_payments SET status = 'paid', payment_intent = ?, updated_at = ? WHERE id = ? AND status <> 'paid'")
          .run(session.payment_intent ? String(session.payment_intent) : null, nowIso(), row.id);
        if (!r.changes) return { status: 'paid', row };
        const balance = postTransaction(db, row.user_id, row.amount_cents, 'deposit', 'Depósito (Stripe)', `stripe:${row.session_id}`);
        return { status: 'paid', credited: true, balance, row };
      });
    }
    const status = session.status === 'expired' ? 'expired' : session.payment_status === 'unpaid' && session.status === 'complete' ? 'processing' : row.status;
    if (status !== row.status) db.prepare('UPDATE stripe_payments SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), row.id);
    return { status, row };
  }

  /** The webhook: checkout.session.* events. Returns what was done (for the log / tests). */
  function handleEvent(event) {
    const type = String(event?.type || '');
    const session = event?.data?.object;
    if (!type.startsWith('checkout.session.') || session?.object !== 'checkout.session') return { ignored: type };
    if (type === 'checkout.session.async_payment_failed') {
      db.prepare("UPDATE stripe_payments SET status = 'failed', updated_at = ? WHERE session_id = ? AND status <> 'paid'").run(nowIso(), String(session.id));
      return { status: 'failed' };
    }
    return applySession(session);
  }

  /** The player is back from Checkout: our row, refreshed from Stripe while it is not final. */
  async function refresh(sessionId, userId) {
    const row = db.prepare('SELECT * FROM stripe_payments WHERE session_id = ? AND user_id = ?').get(String(sessionId), userId);
    if (!row) return null;
    if (['paid', 'expired', 'failed', 'mismatch'].includes(row.status)) return { status: row.status, amountCents: row.amount_cents };
    const session = await call('GET', `/checkout/sessions/${encodeURIComponent(row.session_id)}`);
    const r = applySession(session);
    return { status: r.status, amountCents: row.amount_cents };
  }

  return {
    enabled, live, hasWebhook: !!webhookSecret, createDeposit, applySession, handleEvent, refresh,
    verify: (raw, header) => verifyWebhook(raw, header, webhookSecret),
  };
}
