/**
 * Stripe payments client for wallet deposits — card, MB WAY, and Multibanco, all embedded on our
 * own /deposit page via the PaymentIntents API + Stripe Elements (@stripe/react-stripe-js on the
 * frontend), never a redirect to a Stripe-hosted page. Card fields are still rendered inside
 * Stripe's own iframe (PaymentElement), so raw card numbers never touch our server — same PCI
 * posture as before, just without the extra tab. Secrets are read lazily from env at call time,
 * exactly like CASINO_API_KEY in server/lib/casinoAggregator.ts: never hardcode STRIPE_SECRET_KEY,
 * STRIPE_PUBLISHABLE_KEY or STRIPE_WEBHOOK_SECRET.
 *
 * All three methods go through the same PaymentIntent lifecycle here (unlike the old Checkout
 * Session integration, which split sync/async methods across different event types): card
 * confirms synchronously, MB WAY waits for in-app approval, and Multibanco waits for the customer
 * to pay the displayed voucher — but all three eventually land on a single `payment_intent.succeeded`
 * webhook event (or `payment_intent.payment_failed`), since the PaymentIntent sits in `processing`
 * in between. See stripeWebhook.ts.
 */

import Stripe from 'stripe';

function stripeSecretKey(): string {
  return String(process.env.STRIPE_SECRET_KEY || '').trim();
}

function stripeWebhookSecret(): string {
  return String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
}

export function isStripeConfigured(): boolean {
  return stripeSecretKey().length > 0;
}

/** The publishable key is not secret — it's meant to ship to the browser (loadStripe() needs it)
 *  — but it's still read from env rather than hardcoded, so switching between test/live keys
 *  never needs a code change. Exposed to the frontend via GET /api/wallet/stripe/config. */
export function stripePublishableKey(): string {
  return String(process.env.STRIPE_PUBLISHABLE_KEY || '').trim();
}

let client: Stripe | null = null;

function stripeClient(): Stripe {
  const key = stripeSecretKey();
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  if (!client) client = new Stripe(key);
  return client;
}

export type DepositMethod = 'card' | 'mb_way' | 'multibanco';

export const DEPOSIT_METHODS: DepositMethod[] = ['card', 'mb_way', 'multibanco'];

export interface CreateDepositIntentParams {
  userId: string;
  amount: number;
  method: DepositMethod;
  email?: string;
}

export interface DepositIntent {
  paymentIntentId: string;
  clientSecret: string;
}

/** Creates a PaymentIntent for a deposit via the given method. The credited amount always comes
 *  from Stripe's own PaymentIntent object in the webhook handler afterwards — this function's
 *  `amount` only seeds what Stripe charges, it is never trusted as the credited amount. The
 *  returned client_secret is safe to hand to the browser (it's what Stripe.js needs to confirm
 *  the payment) but must never be logged or embedded in a URL. */
export async function createDepositPaymentIntent(params: CreateDepositIntentParams): Promise<DepositIntent> {
  const stripe = stripeClient();
  const amountCents = Math.round(params.amount * 100);
  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'eur',
    payment_method_types: [params.method],
    receipt_email: params.email,
    metadata: { user_id: params.userId },
  });
  if (!intent.client_secret) throw new Error('Stripe did not return a client secret');
  return { paymentIntentId: intent.id, clientSecret: intent.client_secret };
}

export type DepositIntentStatus = Stripe.PaymentIntent.Status;

/** Polls a PaymentIntent's current status — used by the frontend to show a live "confirmado" /
 *  "falhou" state on MB WAY and Multibanco (both wait on the customer outside our page) without
 *  requiring the wallet webhook to have landed yet. Never itself credits the wallet — that only
 *  ever happens from the signature-verified webhook in stripeWebhook.ts. */
export async function getDepositIntentStatus(paymentIntentId: string): Promise<DepositIntentStatus> {
  const stripe = stripeClient();
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  return intent.status;
}

/** Verifies and parses a Stripe webhook payload. `rawBody` must be the exact, unparsed request
 *  bytes — Stripe's signature covers the raw payload, so JSON.stringify(JSON.parse(raw)) would
 *  not necessarily reproduce a byte-identical string and can fail verification. Throws on an
 *  invalid/missing signature; callers must reject the request rather than process the event. */
export function constructStripeWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
  const secret = stripeWebhookSecret();
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET not configured');
  return stripeClient().webhooks.constructEvent(rawBody, signature, secret);
}
