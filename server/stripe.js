// Stripe deposits inside the site (as in Bet62Novo): one PaymentIntent per deposit, no Stripe page.
//   MB WAY      → confirmed by the server with the player's phone; the player approves in the MB WAY app.
//   Multibanco  → confirmed by the server; Stripe returns entity + reference to pay at an ATM / home banking.
//   Card        → the server creates the intent; the card form is Stripe's Payment Element inside our page.
// The wallet is credited once, when Stripe says "succeeded": by the webhook, by the player's page
// asking for the status, or by the server's own sweep of pending payments. No SDK: REST + HMAC.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { nowIso, tx } from './db.js';
import { postTransaction } from './wallet.js';
import { onDeposit, onChargeback } from './promotions.js';
import { onReferredDeposit, onDepositReversed } from './affiliates.js';

export const METHODS = {
  mbway: { label: 'MB WAY', type: 'mb_way' },
  multibanco: { label: 'Multibanco', type: 'multibanco' },
  cartao: { label: 'Cartão', type: 'card' },
};

/** Stripe's form encoding: { a: { b: 1 }, c: [x] } → a[b]=1&c[0]=x */
export function formEncode(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
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

/** A Portuguese mobile number as Stripe wants it (+351…), or '' when it is not one. */
export function ptPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9) d = `351${d}`;
  return /^3519\d{8}$/.test(d) ? `+${d}` : '';
}

// The promotion the player chose for a deposit (stripe_payments.promo_opt).
const PROMO_CODE = { none: 0, sport: 1, casino: 2 };
const PROMO_CHOICE = { 0: 'none', 1: 'sport', 2: 'casino' };

const FINAL = ['paid', 'failed', 'expired', 'mismatch', 'reversed'];

export function createStripe(db, {
  secretKey, publishableKey = '', webhookSecret = '', currency = 'eur', apiVersion = '2026-06-24.dahlia',
  apiBase = 'https://api.stripe.com/v1', fetchImpl = globalThis.fetch, log = () => {},
} = {}) {
  const enabled = !!secretKey;
  const live = /^(sk|rk)_live_/.test(secretKey || '');

  async function call(method, path, params) {
    const res = await fetchImpl(`${apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        ...(apiVersion ? { 'Stripe-Version': apiVersion } : {}),
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

  const rowOf = (id) => db.prepare('SELECT * FROM stripe_payments WHERE session_id = ?').get(String(id || ''));
  const view = (row) => ({
    id: row.session_id, method: row.method, status: row.status, amountCents: row.amount_cents,
    entity: row.entity || undefined, reference: row.reference || undefined, expiresAt: row.expires_at || undefined,
  });

  /**
   * A deposit: the PaymentIntent and our pending row. MB WAY and Multibanco are confirmed here;
   * the card gets a client secret for the Payment Element.
   */
  async function createDeposit(user, amountCents, { method, phone, promo = 'sport' } = {}) {
    const m = METHODS[method];
    if (!m) throw Object.assign(new Error('Método de pagamento inválido.'), { status: 400, ours: true });
    const tel = method === 'mbway' ? ptPhone(phone) : '';
    if (method === 'mbway' && !tel) throw Object.assign(new Error('Número de telemóvel MB WAY inválido.'), { status: 400, ours: true });
    const meta = { user_id: String(user.id), kind: 'deposit', method };
    // The card also offers Link (its own button beside our card fields); an account without Link
    // refuses the type, and then the card goes alone.
    const create = (types) => call('POST', '/payment_intents', {
      amount: amountCents,
      currency,
      payment_method_types: types,
      metadata: meta,
      receipt_email: user.email,
      description: `Depósito — €${(amountCents / 100).toFixed(2)}`,
      ...(method === 'cartao' ? {} : {
        confirm: 'true',
        payment_method_data: { type: m.type, billing_details: { email: user.email, ...(tel ? { phone: tel } : {}) } },
      }),
    });
    let intent;
    if (method !== 'cartao') intent = await create([m.type]);
    else {
      try { intent = await create([m.type, 'link']); } catch (err) {
        if (!/link/i.test(err.message)) throw err;
        intent = await create([m.type]);
      }
    }
    const mb = intent.next_action?.multibanco_display_details;
    const expires = mb?.expires_at ? new Date(mb.expires_at * 1000).toISOString() : null;
    db.prepare(
      `INSERT INTO stripe_payments (session_id, user_id, amount_cents, currency, status, method, entity, reference, expires_at, created_at, promo_opt)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`
    ).run(intent.id, user.id, amountCents, currency, method, mb?.entity || null, mb?.reference || null, expires, nowIso(), PROMO_CODE[promo] ?? 1);
    if (method === 'multibanco' && !(mb?.entity && mb?.reference)) log(`stripe ${intent.id}: Multibanco sem entidade/referência (${intent.status})`);
    const r = applyIntent(intent);
    return {
      ...view(rowOf(intent.id)),
      status: r.status,
      clientSecret: method === 'cartao' ? intent.client_secret : undefined,
      publishableKey: method === 'cartao' ? publishableKey : undefined,
      voucherUrl: mb?.hosted_voucher_url || undefined,
    };
  }

  /**
   * Applies what Stripe says about one PaymentIntent. Credits the wallet exactly once, with the
   * amount stored when it was created (checked against what Stripe charged).
   */
  function applyIntent(pi) {
    const row = rowOf(pi?.id);
    if (!row) return { status: 'unknown' };
    if (row.status === 'paid') return { status: 'paid', row };
    if (pi.status === 'succeeded') {
      if (Number(pi.amount_received ?? pi.amount) !== row.amount_cents || String(pi.currency).toLowerCase() !== row.currency) {
        db.prepare("UPDATE stripe_payments SET status = 'mismatch', updated_at = ? WHERE id = ?").run(nowIso(), row.id);
        log(`stripe ${row.session_id}: valor ${pi.amount_received ?? pi.amount} ${pi.currency} ≠ ${row.amount_cents} ${row.currency}`);
        return { status: 'mismatch', row };
      }
      return tx(db, () => {
        // Inside the transaction: the webhook, the player's page and the sweep can arrive together.
        const r = db.prepare("UPDATE stripe_payments SET status = 'paid', updated_at = ? WHERE id = ? AND status <> 'paid'").run(nowIso(), row.id);
        if (!r.changes) return { status: 'paid', row };
        const label = METHODS[row.method]?.label || 'Stripe';
        postTransaction(db, row.user_id, row.amount_cents, 'deposit', `Depósito ${label}`, `stripe:${row.session_id}`);
        const txId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
        // The deposit bonus it earns, if any (once per deposit, decided by the server).
        const bonus = onDeposit(db, { userId: row.user_id, amountCents: row.amount_cents, ref: `stripe:${row.session_id}`, method: row.method, choice: PROMO_CHOICE[row.promo_opt] || 'sport' });
        // The referring affiliate's commission, when this is the player's first eligible deposit (once).
        // A failure there never holds the deposit back: affiliates.recover() picks it up later.
        try { onReferredDeposit(db, { userId: row.user_id, amountCents: row.amount_cents, txId, ref: `stripe:${row.session_id}` }); }
        catch (err) { log(`afiliados ${row.session_id}: ${err.message}`); }
        const balance = db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(row.user_id).balance_cents;
        return { status: 'paid', credited: true, balance, bonus, row };
      });
    }
    const status = pi.status === 'canceled' ? 'failed'
      : pi.status === 'processing' ? 'processing'
      // A refused card can be tried again on the same intent; MB WAY / Multibanco cannot.
      : pi.status === 'requires_payment_method' && pi.last_payment_error && row.method !== 'cartao' ? 'failed'
      : 'pending';
    if (status !== row.status) db.prepare('UPDATE stripe_payments SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), row.id);
    return { status, row };
  }

  /**
   * A paid deposit reversed (chargeback opened, or refunded): its money is taken back and the
   * player's promotions cancelled (promotions.onChargeback), once.
   */
  function reverse(piId, reason) {
    const row = rowOf(piId);
    if (!row || row.status !== 'paid') return { status: row ? row.status : 'unknown' };
    return tx(db, () => {
      const r = db.prepare("UPDATE stripe_payments SET status = 'reversed', updated_at = ? WHERE id = ? AND status = 'paid'").run(nowIso(), row.id);
      if (!r.changes) return { status: 'reversed' };
      onChargeback(db, { userId: row.user_id, amountCents: row.amount_cents, ref: `stripe:${row.session_id}`, reason });
      onDepositReversed(db, { ref: `stripe:${row.session_id}`, reason });
      log(`stripe ${row.session_id}: depósito revertido (${reason})`);
      return { status: 'reversed', reversed: true };
    });
  }

  /** The webhook: payment_intent.* events, chargebacks and refunds. Returns what was done (for the log / tests). */
  function handleEvent(event) {
    const type = String(event?.type || '');
    const obj = event?.data?.object;
    if (type.startsWith('payment_intent.') && obj?.object === 'payment_intent') return applyIntent(obj);
    if (type === 'charge.dispute.created' && obj?.payment_intent) return reverse(obj.payment_intent, 'chargeback');
    if (type === 'charge.refunded' && obj?.payment_intent && obj.refunded) return reverse(obj.payment_intent, 'depósito reembolsado');
    return { ignored: type };
  }

  /** The player's page asks: our row, refreshed from Stripe while it is not final. */
  async function refresh(id, userId) {
    const row = db.prepare('SELECT * FROM stripe_payments WHERE session_id = ? AND user_id = ?').get(String(id), userId);
    if (!row) return null;
    if (FINAL.includes(row.status) || !row.session_id.startsWith('pi_')) return view(row);
    applyIntent(await call('GET', `/payment_intents/${encodeURIComponent(row.session_id)}`));
    return view(rowOf(row.session_id));
  }

  /** Pending deposits of the last 48 h, checked with Stripe (a missed webhook still credits). */
  async function sweep({ limit = 50 } = {}) {
    const since = new Date(Date.now() - 48 * 3600_000).toISOString();
    const rows = db.prepare(
      "SELECT session_id FROM stripe_payments WHERE status IN ('pending', 'processing') AND session_id LIKE 'pi\\_%' ESCAPE '\\' AND created_at >= ? ORDER BY id LIMIT ?"
    ).all(since, limit);
    let credited = 0;
    for (const { session_id: id } of rows) {
      try {
        if (applyIntent(await call('GET', `/payment_intents/${encodeURIComponent(id)}`)).credited) credited += 1;
      } catch (err) { log(`stripe sweep ${id}: ${err.message}`); }
    }
    return { checked: rows.length, credited };
  }

  return {
    enabled, live, hasWebhook: !!webhookSecret, hasPublishable: !!publishableKey,
    createDeposit, applyIntent, handleEvent, reverse, refresh, sweep,
    verify: (raw, header) => verifyWebhook(raw, header, webhookSecret),
  };
}
