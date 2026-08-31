/**
 * Stripe payments client for wallet deposits. Card only for now — Stripe-hosted Checkout, never a
 * raw card form on our own domain (keeps us out of PCI SAQ D scope). Secrets are read lazily from
 * env at call time, exactly like CASINO_API_KEY in server/lib/casinoAggregator.ts: never hardcode
 * STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET.
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

export interface CreateDepositCheckoutParams {
  userId: string;
  amount: number;
  email?: string;
}

export interface DepositCheckoutSession {
  sessionId: string;
  url: string;
}

/** Creates a Stripe Checkout Session for a card deposit. The charged amount always comes from
 *  Stripe's own session object in the webhook handler afterwards — this function's `amount` only
 *  seeds what Stripe displays/charges at checkout, it is never trusted as the credited amount. */
export async function createDepositCheckoutSession(params: CreateDepositCheckoutParams): Promise<DepositCheckoutSession> {
  const stripe = stripeClient();
  const amountCents = Math.round(params.amount * 100);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
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
