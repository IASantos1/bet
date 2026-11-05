// Revolut Merchant API: card (Visa / Mastercard), Apple Pay and Google Pay deposits. MB WAY and
// Multibanco stay with Stripe (stripe.js); Revolut Business (revolut.js) pays the withdrawals.
//
// One Revolut order per deposit; the player pays on Revolut's own checkout page (checkout_url),
// which offers the card form and, on the devices that have them, Apple Pay and Google Pay, then
// comes back to the wallet (redirect_url). The wallet is credited once, when Revolut's order is
// "completed" with the amount we asked: read from Revolut itself (GET /orders/:id) after the signed
// webhook, the player's page asking, or the server's sweep — never from what a request claims.
// No SDK: REST + HMAC, like the other payment modules.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { nowIso, tx } from './db.js';
import { postTransaction } from './wallet.js';
import { onDeposit } from './promotions.js';
import { onReferredDeposit } from './affiliates.js';

/** The methods paid on Revolut's page (each one opens the same page; the label is the player's choice). */
export const REVOLUT_METHODS = {
  cartao: { label: 'Cartão' },
  applepay: { label: 'Apple Pay' },
  googlepay: { label: 'Google Pay' },
};

// The promotion the player chose for a deposit (stripe_payments.promo_opt, shared with Stripe).
const PROMO_CODE = { none: 0, sport: 1, casino: 2, freebet: 3 };
const PROMO_CHOICE = { 0: 'none', 1: 'sport', 2: 'casino', 3: 'freebet' };
const FINAL = ['paid', 'failed', 'expired', 'mismatch', 'reversed'];
/** Our ids for these deposits (stripe_payments.session_id): "rv_" + a random UUID. */
export const isRevolutDeposit = (id) => /^rv_[0-9a-f-]{36}$/.test(String(id || ''));

/**
 * Revolut's webhook signature: Revolut-Signature "v1=<hex>[,v1=…]" over `v1.${timestamp}.${rawBody}`
 * (HMAC-SHA256 with the webhook's signing secret); the timestamp (ms) at most 5 minutes off.
 */
export function verifyMerchantWebhook(rawBody, signature, timestamp, secret, now = Date.now()) {
  if (!secret || !signature || !timestamp) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 5 * 60_000) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
  const want = createHmac('sha256', secret).update(`v1.${timestamp}.${body}`).digest();
  return String(signature).split(',').map((p) => p.trim()).filter((p) => p.startsWith('v1=')).some((p) => {
    const got = Buffer.from(p.slice(3), 'hex');
    return got.length === want.length && timingSafeEqual(got, want);
  });
}

/** Revolut's order state → ours (paid only after the amount is checked, in applyOrder). */
export function orderState(state) {
  const s = String(state || '').trim().toLowerCase();
  if (s === 'completed') return 'completed';
  if (s === 'cancelled' || s === 'failed' || s === 'declined') return 'failed';
  if (s === 'processing' || s === 'authorised' || s === 'authorized') return 'processing';
  return 'pending';
}

export function createRevolutPay(db, {
  secretKey = '', webhookSecret = '', environment = 'sandbox', apiVersion = '2024-09-01', publicUrl = '',
  fetchImpl = globalThis.fetch, log = () => {},
} = {}) {
  const enabled = !!secretKey;
  const live = environment === 'production';
  const base = (live ? 'https://merchant.revolut.com' : 'https://sandbox-merchant.revolut.com') + '/api';

  async function call(method, path, body) {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`, Accept: 'application/json',
        ...(apiVersion ? { 'Revolut-Api-Version': apiVersion } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.message || data?.error || `HTTP ${res.status}`;
      log(`revolut merchant ${method} ${path}: ${msg}`);
      throw Object.assign(new Error(msg), { status: res.status });
    }
    return data;
  }

  const rowOf = (id) => db.prepare('SELECT * FROM stripe_payments WHERE session_id = ?').get(String(id || ''));
  const rowOfOrder = (orderId) => db.prepare("SELECT * FROM stripe_payments WHERE reference = ? AND session_id LIKE 'rv\\_%' ESCAPE '\\'").get(String(orderId || ''));
  const view = (row) => ({ id: row.session_id, method: row.method, status: row.status, amountCents: row.amount_cents });

  /** A deposit: our pending row, then Revolut's order; the player is sent to its checkout page. */
  async function createDeposit(user, amountCents, { method = 'cartao', promo = 'sport', returnBase = '' } = {}) {
    if (!REVOLUT_METHODS[method]) throw Object.assign(new Error('Método de pagamento inválido.'), { status: 400, ours: true });
    const id = `rv_${randomUUID()}`;
    const home = publicUrl || returnBase;
    const back = /^https?:\/\//.test(home) ? `${home.replace(/\/+$/, '')}/#/perfil/carteira?deposito=${id}` : undefined;
    const order = await call('POST', '/orders', {
      amount: amountCents,
      currency: 'EUR',
      description: `Depósito BET62 — €${(amountCents / 100).toFixed(2)}`,
      capture_mode: 'automatic',
      customer: user.email ? { email: user.email } : undefined,
      merchant_order_data: { reference: id },
      ...(back ? { redirect_url: back } : {}),
    });
    if (!order?.id || !order?.checkout_url) throw new Error('a Revolut não devolveu a página de pagamento');
    db.prepare(
      `INSERT INTO stripe_payments (session_id, user_id, amount_cents, currency, status, method, reference, created_at, promo_opt)
       VALUES (?, ?, ?, 'eur', 'pending', ?, ?, ?, ?)`
    ).run(id, user.id, amountCents, method, String(order.id), nowIso(), PROMO_CODE[promo] ?? 1);
    return { ...view(rowOf(id)), redirectUrl: String(order.checkout_url) };
  }

  /**
   * What Revolut says about one order (fetched from Revolut). Credits the wallet exactly once, with
   * the amount stored when it was created (checked against what Revolut charged).
   */
  function applyOrder(order) {
    const row = rowOfOrder(order?.id);
    if (!row) return { status: 'unknown' };
    if (row.status === 'paid') return { status: 'paid', row };
    const state = orderState(order.state);
    if (state === 'completed') {
      if (Number(order.amount) !== row.amount_cents || String(order.currency || '').toLowerCase() !== 'eur') {
        db.prepare("UPDATE stripe_payments SET status = 'mismatch', updated_at = ? WHERE id = ?").run(nowIso(), row.id);
        log(`revolut ${row.session_id}: valor ${order.amount} ${order.currency} ≠ ${row.amount_cents} EUR`);
        return { status: 'mismatch', row };
      }
      return tx(db, () => {
        // Inside the transaction: the webhook, the player's page and the sweep can arrive together.
        const r = db.prepare("UPDATE stripe_payments SET status = 'paid', updated_at = ? WHERE id = ? AND status <> 'paid'").run(nowIso(), row.id);
        if (!r.changes) return { status: 'paid', row };
        const ref = `revolut:${row.reference}`;
        postTransaction(db, row.user_id, row.amount_cents, 'deposit', `Depósito ${REVOLUT_METHODS[row.method]?.label || 'Cartão'}`, ref);
        const txId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
        const bonus = onDeposit(db, { userId: row.user_id, amountCents: row.amount_cents, ref, method: row.method, choice: PROMO_CHOICE[row.promo_opt] || 'sport' });
        try { onReferredDeposit(db, { userId: row.user_id, amountCents: row.amount_cents, txId, ref }); }
        catch (err) { log(`afiliados ${row.session_id}: ${err.message}`); }
        const balance = db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(row.user_id).balance_cents;
        return { status: 'paid', credited: true, balance, bonus, row };
      });
    }
    if (state !== row.status) db.prepare('UPDATE stripe_payments SET status = ?, updated_at = ? WHERE id = ?').run(state, nowIso(), row.id);
    return { status: state, row };
  }

  const fetchOrder = (orderId) => call('GET', `/orders/${encodeURIComponent(orderId)}`);

  /** The signed webhook: the order it names is read again from Revolut and applied. */
  async function handleWebhook(rawBody, signature, timestamp) {
    if (!verifyMerchantWebhook(rawBody, signature, timestamp, webhookSecret)) return { accepted: false, reason: 'signature' };
    let event;
    try { event = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody)); } catch { return { accepted: false, reason: 'json' }; }
    const orderId = event?.order_id || event?.data?.id || event?.id;
    if (!orderId || !/^ORDER_/.test(String(event?.event || ''))) return { accepted: true, ignored: String(event?.event || '') };
    if (!rowOfOrder(orderId)) return { accepted: true, ignored: 'unknown order' };
    return { accepted: true, ...applyOrder(await fetchOrder(orderId)) };
  }

  /** The player's page asks: our row, refreshed from Revolut while it is not final. */
  async function refresh(id, userId) {
    const row = db.prepare('SELECT * FROM stripe_payments WHERE session_id = ? AND user_id = ?').get(String(id), userId);
    if (!row) return null;
    if (FINAL.includes(row.status) || !row.reference) return view(row);
    applyOrder(await fetchOrder(row.reference));
    return view(rowOf(row.session_id));
  }

  /** Pending Revolut deposits of the last 48 h, checked with Revolut (a missed webhook still credits). */
  async function sweep({ limit = 50 } = {}) {
    const since = new Date(Date.now() - 48 * 3600_000).toISOString();
    const rows = db.prepare(
      "SELECT reference FROM stripe_payments WHERE status IN ('pending', 'processing') AND session_id LIKE 'rv\\_%' ESCAPE '\\' AND reference IS NOT NULL AND created_at >= ? ORDER BY id LIMIT ?"
    ).all(since, limit);
    let credited = 0;
    for (const { reference } of rows) {
      try { if (applyOrder(await fetchOrder(reference)).credited) credited += 1; } catch (err) { log(`revolut sweep ${reference}: ${err.message}`); }
    }
    return { checked: rows.length, credited };
  }

  return { enabled, live, environment, hasWebhook: !!webhookSecret, createDeposit, applyOrder, handleWebhook, refresh, sweep };
}
