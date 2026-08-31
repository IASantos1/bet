/**
 * Stripe payments client for wallet deposits — card, MB WAY, and Multibanco, all via Stripe-hosted
 * Checkout (never a raw card form or a hand-rolled MB WAY/Multibanco integration on our own
 * domain: keeps us out of PCI SAQ D scope and gets Stripe's own official branding on the actual
 * payment screen for free). Secrets are read lazily from env at call time, exactly like
 * CASINO_API_KEY in server/lib/casinoAggregator.ts: never hardcode STRIPE_SECRET_KEY or
 * STRIPE_WEBHOOK_SECRET.
 *
 * Card is synchronous (Checkout completes with payment_status 'paid' immediately). MB WAY and
 * Multibanco are delayed/async per Stripe's own model: Checkout completes first with the session
 * still 'unpaid' (the customer has to confirm in the MB WAY app, or pay a Multibanco voucher at
 * an ATM/homebanking later), and the real confirmation arrives afterwards as a separate
 * checkout.session.async_payment_succeeded webhook event — see stripeWebhook.ts, which listens
 * for both. The Stripe Dashboard's webhook endpoint config must include that event type (and
 * async_payment_failed) alongside checkout.session.completed, or MB WAY/Multibanco deposits will
 * silently never get credited even though this code is correct.
 */

import Stripe from 'stripe';

function stripeSecretKey(): string {
  return String(process.env.STRIPE_SECRET_KEY || '').trim();
}

function stripeWebhookSecret(): string {
  return String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
}

function publicAppUrl(): string {
  return String(process.env.PUBLIC_APP_URL || 'https://bet62.plus').trim().replace(/\/+$/, '');
}

export function isStripeConfigured(): boolean {
  return stripeSecretKey().length > 0;
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

export interface CreateDepositCheckoutParams {
  userId: string;
  amount: number;
  method: DepositMethod;
  email?: string;
}

export interface DepositCheckoutSession {
  sessionId: string;
  url: string;
}

/** Creates a Stripe Checkout Session for a deposit via the given method. The charged amount
 *  always comes from Stripe's own session object in the webhook handler afterwards — this
 *  function's `amount` only seeds what Stripe displays/charges at checkout, it is never trusted
 *  as the credited amount. */
export async function createDepositCheckoutSession(params: CreateDepositCheckoutParams): Promise<DepositCheckoutSession> {
  const stripe = stripeClient();
  const amountCents = Math.round(params.amount * 100);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: [params.method],
    customer_email: params.email,
    client_reference_id: params.userId,
    metadata: { user_id: params.userId },
    payment_intent_data: { metadata: { user_id: params.userId } },
    line_items: [
      {
        price_data: {
          currency: 'eur',
          product_data: { name: 'Depósito BET62' },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    success_url: `${publicAppUrl()}/deposit-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${publicAppUrl()}/deposit`,
  });
  if (!session.url) throw new Error('Stripe did not return a checkout URL');
  return { sessionId: session.id, url: session.url };
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
