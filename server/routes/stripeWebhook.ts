import type http from 'http';
import type pg from 'pg';
import type Stripe from 'stripe';
import { sendJson } from '../lib/http';
import { constructStripeWebhookEvent } from '../lib/stripePayments';
import { walletService } from '../lib/ledger';
import { maybeGrantWelcomeBonus } from '../lib/bonusService';

/**
 * POST /webhooks/stripe — Stripe's server-to-server payment confirmation. Signature-verified
 * (never trust an unverified body for a real-money credit) — this is the ONLY place in the app
 * that calls walletService.deposit() off an incoming request; there is deliberately no
 * client-callable endpoint that credits the wallet from a client-supplied amount. Idempotent via
 * the PaymentIntent id as the ledger idempotency key, so Stripe's automatic webhook retries (it
 * retries on anything but a 2xx) never double-credit. Wired directly in server/index.ts, outside
 * the /api chain, the same way the casino aggregator's /callback is — a webhook needs the exact
 * raw request bytes for signature verification, not JSON-parsed body.
 *
 * All three deposit methods (card, MB WAY, Multibanco) land on the same event here: card confirms
 * synchronously, MB WAY/Multibanco sit in the PaymentIntent's 'processing' status while the
 * customer approves in their app or pays a voucher, but all three eventually fire
 * payment_intent.succeeded (or payment_intent.payment_failed) — unlike the old Checkout Session
 * integration, which split sync/async methods across different event types.
 */
export async function handleStripeWebhook(pool: pg.Pool, req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
  if (url.pathname !== '/webhooks/stripe') return false;
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return true;
  }

  const signature = String(req.headers['stripe-signature'] || '');
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const rawBody = Buffer.concat(chunks);

  let event: Stripe.Event;
  try {
    event = constructStripeWebhookEvent(rawBody, signature);
  } catch (e: any) {
    console.error('[stripe-webhook] signature verification failed:', String(e?.message || e));
    sendJson(res, 400, { error: 'Invalid signature' });
    return true;
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object as Stripe.PaymentIntent;
      const userId = String(intent.metadata?.user_id || '');
      const amount = Math.round(intent.amount_received || intent.amount || 0) / 100;
      if (userId && amount > 0) {
        const idempotencyKey = `deposit:stripe:${intent.id}`;
        const result = await walletService.deposit(pool, { userId, amount, idempotencyKey, method: 'stripe', referenceId: intent.id });
        if (!result.replayed) {
          await pool.query(
            `UPDATE transactions SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE stripe_session_id = $1`,
            [intent.id],
          );
          // Bonus Engine (spec §34): a first qualifying deposit may trigger the active WELCOME
          // campaign. Best-effort — a failure here must never fail the deposit itself.
          await maybeGrantWelcomeBonus(pool, userId, amount).catch(() => null);
        }
      } else {
        console.error('[stripe-webhook] succeeded intent missing user_id or amount', { paymentIntentId: intent.id });
      }
    } else if (event.type === 'payment_intent.payment_failed') {
      // MB WAY declined/expired, or a Multibanco voucher expired unpaid. Mark the pending row so
      // it doesn't sit as "pending" forever — never touches the wallet.
      const intent = event.data.object as Stripe.PaymentIntent;
      await pool.query(
        `UPDATE transactions SET status = 'failed', updated_at = NOW() WHERE stripe_session_id = $1 AND status = 'pending'`,
        [intent.id],
      );
    }
  } catch (e) {
    // Non-2xx tells Stripe to retry (safe: idempotent on payment_intent.id) rather than silently
    // losing a confirmed payment.
    console.error('[stripe-webhook] failed to process event:', e);
    sendJson(res, 500, { error: 'Internal error' });
    return true;
  }

  sendJson(res, 200, { received: true });
  return true;
}
