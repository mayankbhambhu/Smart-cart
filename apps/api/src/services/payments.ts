import type {
  OrderChannel,
  PaymentClientAction,
  PaymentInfo,
  PaymentMethodType,
  PaymentProviderName,
  PaymentsConfig,
} from '@smartcart/shared';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { env, isProduction } from '../config/env';
import { db } from '../db/client';
import { customerProfiles, payments, users } from '../db/schema';
import { hmacSha256, safeEqual } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

/**
 * Payment provider integrations.
 *
 *  - Cards, Apple Pay and Google Pay  -> Stripe PaymentIntents (wallets via automatic payment methods)
 *  - PayPal                            -> PayPal Orders v2 (approve + capture)
 *  - UPI                               -> Razorpay Orders + Checkout (UPI intent / collect / QR)
 *  - Cash on delivery                  -> collected by the rider, confirmed when delivered
 *
 * When a provider has no credentials and PAYMENTS_DEMO_MODE is on, a demo
 * provider simulates the wallet sheet so every flow works end-to-end locally.
 */

export type PaymentRow = typeof payments.$inferSelect;

const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;

export const providerLive = {
  stripe: () => Boolean(stripe && env.STRIPE_PUBLISHABLE_KEY),
  paypal: () => Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET),
  razorpay: () => Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
};

function demoAllowed(): boolean {
  return env.PAYMENTS_DEMO_MODE;
}

const METHOD_CHANNELS: Record<PaymentMethodType, OrderChannel[]> = {
  UPI: ['DELIVERY', 'PICKUP', 'IN_STORE'],
  CARD: ['DELIVERY', 'PICKUP', 'IN_STORE'],
  APPLE_PAY: ['DELIVERY', 'PICKUP', 'IN_STORE'],
  GOOGLE_PAY: ['DELIVERY', 'PICKUP', 'IN_STORE'],
  PAYPAL: ['DELIVERY', 'PICKUP', 'IN_STORE'],
  CASH_ON_DELIVERY: ['DELIVERY'],
};

export function providerFor(method: PaymentMethodType): PaymentProviderName {
  const live =
    method === 'CASH_ON_DELIVERY'
      ? 'cash'
      : method === 'PAYPAL'
        ? providerLive.paypal()
          ? 'paypal'
          : null
        : method === 'UPI'
          ? providerLive.razorpay()
            ? 'razorpay'
            : null
          : providerLive.stripe()
            ? 'stripe'
            : null;
  if (live) return live;
  if (demoAllowed()) return 'demo';
  throw new AppError(503, 'PAYMENT_METHOD_UNAVAILABLE', 'This payment method is not available right now');
}

export function paymentsConfig(): PaymentsConfig {
  const methods = (Object.keys(METHOD_CHANNELS) as PaymentMethodType[]).flatMap((method) => {
    try {
      const provider = providerFor(method);
      return [{ method, provider, live: provider !== 'demo', channels: METHOD_CHANNELS[method] }];
    } catch {
      return [];
    }
  });
  return {
    currency: env.CURRENCY,
    demoMode: demoAllowed(),
    methods,
    stripePublishableKey: providerLive.stripe() ? env.STRIPE_PUBLISHABLE_KEY! : null,
    razorpayKeyId: providerLive.razorpay() ? env.RAZORPAY_KEY_ID! : null,
    paypalClientId: providerLive.paypal() ? env.PAYPAL_CLIENT_ID! : null,
    merchantDisplayName: env.MERCHANT_NAME,
    merchantCountryCode: env.MERCHANT_COUNTRY,
  };
}

export function assertMethodAllowed(method: PaymentMethodType, channel: OrderChannel): void {
  if (!METHOD_CHANNELS[method].includes(channel)) {
    throw new AppError(400, 'PAYMENT_METHOD_NOT_ALLOWED', 'This payment method cannot be used for this order');
  }
}

// ---------------------------------------------------------------------------
// Creating the provider-side payment (called after the order is committed)
// ---------------------------------------------------------------------------

export interface PaymentContext {
  orderNumber: string;
  customer: { id: string; name: string; email: string | null; phone: string | null };
  /** Saved Stripe payment method to charge, if any. */
  stripePaymentMethodId?: string | null;
}

export async function startProviderPayment(payment: PaymentRow, context: PaymentContext): Promise<PaymentInfo> {
  let action: PaymentClientAction;
  let providerRef: string | null = payment.providerRef;
  try {
    switch (payment.provider) {
      case 'cash':
        action = { type: 'cash' };
        break;
      case 'demo':
        action = { type: 'demo', method: payment.method, amount: payment.amount, currency: payment.currency };
        providerRef = providerRef ?? `demo_${payment.id}`;
        break;
      case 'stripe': {
        const customerId = await ensureStripeCustomer(context.customer.id);
        const intent = await stripe!.paymentIntents.create(
          {
            amount: payment.amount,
            currency: payment.currency.toLowerCase(),
            customer: customerId,
            automatic_payment_methods: { enabled: true },
            ...(context.stripePaymentMethodId ? { payment_method: context.stripePaymentMethodId } : {}),
            description: `SmartCart order ${context.orderNumber}`,
            metadata: { paymentId: payment.id, orderId: payment.orderId, orderNumber: context.orderNumber },
          },
          { idempotencyKey: `pi_${payment.id}` },
        );
        providerRef = intent.id;
        action = {
          type: 'stripe',
          clientSecret: intent.client_secret!,
          publishableKey: env.STRIPE_PUBLISHABLE_KEY!,
          paymentIntentId: intent.id,
          merchantDisplayName: env.MERCHANT_NAME,
          merchantCountryCode: env.MERCHANT_COUNTRY,
          customerId,
          customerEphemeralKeySecret: null,
        };
        break;
      }
      case 'paypal': {
        const order = await paypalRequest<{ id: string; links: { rel: string; href: string }[] }>('/v2/checkout/orders', {
          intent: 'CAPTURE',
          purchase_units: [
            {
              reference_id: context.orderNumber,
              custom_id: payment.id,
              amount: { currency_code: payment.currency, value: (payment.amount / 100).toFixed(2) },
            },
          ],
          payment_source: {
            paypal: {
              experience_context: {
                brand_name: env.MERCHANT_NAME,
                user_action: 'PAY_NOW',
                return_url: `${env.PUBLIC_WEB_URL}/payment/return?paymentId=${payment.id}`,
                cancel_url: `${env.PUBLIC_WEB_URL}/payment/return?paymentId=${payment.id}&cancelled=1`,
              },
            },
          },
        });
        providerRef = order.id;
        const approval = order.links.find((l) => l.rel === 'payer-action' || l.rel === 'approve');
        action = { type: 'paypal', paypalOrderId: order.id, approvalUrl: approval?.href ?? '' };
        break;
      }
      case 'razorpay': {
        const order = await razorpayRequest<{ id: string }>('/v1/orders', {
          amount: payment.amount,
          currency: payment.currency,
          receipt: context.orderNumber,
          notes: { paymentId: payment.id },
        });
        providerRef = order.id;
        action = {
          type: 'razorpay',
          keyId: env.RAZORPAY_KEY_ID!,
          razorpayOrderId: order.id,
          amount: payment.amount,
          currency: payment.currency,
          merchantName: env.MERCHANT_NAME,
          prefill: { name: context.customer.name, email: context.customer.email, contact: context.customer.phone },
        };
        break;
      }
    }
  } catch (error) {
    logger.error({ err: error, paymentId: payment.id }, 'Payment provider error');
    await db.update(payments).set({ status: 'FAILED', failureReason: 'Provider unavailable' }).where(eq(payments.id, payment.id));
    throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', 'The payment provider is not responding. Please try again or pick another method.');
  }

  const status = payment.provider === 'cash' ? 'CREATED' : 'REQUIRES_ACTION';
  const [updated] = await db
    .update(payments)
    .set({ providerRef, status })
    .where(eq(payments.id, payment.id))
    .returning();
  return toPaymentInfo(updated!, action);
}

export function toPaymentInfo(payment: PaymentRow, action: PaymentClientAction = { type: 'none' }): PaymentInfo {
  return {
    id: payment.id,
    orderId: payment.orderId,
    provider: payment.provider,
    method: payment.method,
    status: payment.status,
    amount: payment.amount,
    currency: payment.currency,
    clientAction: action,
  };
}

// ---------------------------------------------------------------------------
// Verifying completion
// ---------------------------------------------------------------------------

export type VerificationResult =
  | { status: 'succeeded'; providerPaymentId: string | null }
  | { status: 'pending' }
  | { status: 'failed'; reason: string };

/** Asks the provider whether a payment really succeeded (never trust the client alone). */
export async function verifyWithProvider(payment: PaymentRow, payload: Record<string, string> = {}): Promise<VerificationResult> {
  switch (payment.provider) {
    case 'demo':
      return payload.outcome === 'failure'
        ? { status: 'failed', reason: 'Payment declined (demo)' }
        : { status: 'succeeded', providerPaymentId: `demo_txn_${payment.id.slice(0, 8)}` };
    case 'cash':
      return { status: 'pending' };
    case 'stripe': {
      const intent = await stripe!.paymentIntents.retrieve(payment.providerRef!);
      if (intent.status === 'succeeded') {
        const charge = typeof intent.latest_charge === 'string' ? intent.latest_charge : (intent.latest_charge?.id ?? null);
        return { status: 'succeeded', providerPaymentId: charge };
      }
      if (intent.status === 'canceled' || intent.status === 'requires_payment_method') {
        return { status: 'failed', reason: intent.last_payment_error?.message ?? 'Payment was not completed' };
      }
      return { status: 'pending' };
    }
    case 'paypal': {
      const capture = await paypalRequest<{
        status: string;
        purchase_units?: { payments?: { captures?: { id: string; status: string }[] } }[];
      }>(`/v2/checkout/orders/${payment.providerRef}/capture`, {});
      const captureId = capture.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? null;
      return capture.status === 'COMPLETED'
        ? { status: 'succeeded', providerPaymentId: captureId }
        : { status: 'failed', reason: `PayPal status ${capture.status}` };
    }
    case 'razorpay': {
      const orderId = payload.razorpay_order_id;
      const paymentId = payload.razorpay_payment_id;
      const signature = payload.razorpay_signature;
      if (!orderId || !paymentId || !signature || orderId !== payment.providerRef) {
        return { status: 'failed', reason: 'Missing Razorpay confirmation' };
      }
      const expected = hmacSha256(env.RAZORPAY_KEY_SECRET!, `${orderId}|${paymentId}`);
      return safeEqual(expected, signature)
        ? { status: 'succeeded', providerPaymentId: paymentId }
        : { status: 'failed', reason: 'Signature mismatch' };
    }
  }
}

export async function refundWithProvider(payment: PaymentRow, amount: number): Promise<void> {
  if (amount <= 0) return;
  switch (payment.provider) {
    case 'demo':
    case 'cash':
      return;
    case 'stripe':
      await stripe!.refunds.create({ payment_intent: payment.providerRef!, amount }, { idempotencyKey: `refund_${payment.id}_${amount}` });
      return;
    case 'razorpay':
      await razorpayRequest(`/v1/payments/${payment.providerPaymentId}/refund`, { amount });
      return;
    case 'paypal':
      await paypalRequest(`/v2/payments/captures/${payment.providerPaymentId}/refund`, {
        amount: { currency_code: payment.currency, value: (amount / 100).toFixed(2) },
      });
  }
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export type WebhookOutcome = { paymentRef: string; provider: PaymentProviderName; result: VerificationResult } | null;

export function parseStripeWebhook(rawBody: Buffer, signature: string | undefined): WebhookOutcome {
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) throw new AppError(501, 'NOT_CONFIGURED', 'Stripe webhooks are not configured');
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature ?? '', env.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw new AppError(400, 'INVALID_SIGNATURE', 'Invalid Stripe signature');
  }
  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent;
    const charge = typeof intent.latest_charge === 'string' ? intent.latest_charge : (intent.latest_charge?.id ?? null);
    return { provider: 'stripe', paymentRef: intent.id, result: { status: 'succeeded', providerPaymentId: charge } };
  }
  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object as Stripe.PaymentIntent;
    return {
      provider: 'stripe',
      paymentRef: intent.id,
      result: { status: 'failed', reason: intent.last_payment_error?.message ?? 'Payment failed' },
    };
  }
  return null;
}

export function parseRazorpayWebhook(rawBody: Buffer, signature: string | undefined): WebhookOutcome {
  if (!env.RAZORPAY_WEBHOOK_SECRET) throw new AppError(501, 'NOT_CONFIGURED', 'Razorpay webhooks are not configured');
  const expected = hmacSha256(env.RAZORPAY_WEBHOOK_SECRET, rawBody.toString('utf8'));
  if (!signature || !safeEqual(expected, signature)) throw new AppError(400, 'INVALID_SIGNATURE', 'Invalid Razorpay signature');
  const body = JSON.parse(rawBody.toString('utf8')) as {
    event: string;
    payload?: { payment?: { entity?: { id: string; order_id: string; error_description?: string } } };
  };
  const entity = body.payload?.payment?.entity;
  if (!entity) return null;
  if (body.event === 'payment.captured' || body.event === 'order.paid') {
    return { provider: 'razorpay', paymentRef: entity.order_id, result: { status: 'succeeded', providerPaymentId: entity.id } };
  }
  if (body.event === 'payment.failed') {
    return { provider: 'razorpay', paymentRef: entity.order_id, result: { status: 'failed', reason: entity.error_description ?? 'Payment failed' } };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Stripe customers & saved cards
// ---------------------------------------------------------------------------

async function ensureStripeCustomer(userId: string): Promise<string> {
  const [profile] = await db.select().from(customerProfiles).where(eq(customerProfiles.userId, userId)).limit(1);
  if (profile?.stripeCustomerId) return profile.stripeCustomerId;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const customer = await stripe!.customers.create({
    name: user?.name,
    email: user?.email ?? undefined,
    phone: user?.phone ?? undefined,
    metadata: { userId },
  });
  await db.insert(customerProfiles).values({ userId, stripeCustomerId: customer.id }).onConflictDoUpdate({
    target: customerProfiles.userId,
    set: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

export async function createStripeSetupIntent(userId: string): Promise<{ clientSecret: string; customerId: string; publishableKey: string }> {
  if (!providerLive.stripe()) {
    throw new AppError(501, 'STRIPE_NOT_CONFIGURED', 'Card saving through Stripe is not configured; cards are saved in demo mode');
  }
  const customerId = await ensureStripeCustomer(userId);
  const intent = await stripe!.setupIntents.create({ customer: customerId, usage: 'off_session', automatic_payment_methods: { enabled: true } });
  return { clientSecret: intent.client_secret!, customerId, publishableKey: env.STRIPE_PUBLISHABLE_KEY! };
}

// ---------------------------------------------------------------------------
// HTTP helpers for PayPal and Razorpay
// ---------------------------------------------------------------------------

let paypalToken: { value: string; expiresAt: number } | null = null;

async function paypalRequest<T>(path: string, body: unknown): Promise<T> {
  const base = env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  if (!paypalToken || paypalToken.expiresAt < Date.now() + 60_000) {
    const auth = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64');
    const response = await fetch(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`PayPal auth failed with ${response.status}`);
    const token = (await response.json()) as { access_token: string; expires_in: number };
    paypalToken = { value: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
  }
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${paypalToken.value}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`PayPal ${path} failed with ${response.status}: ${await response.text()}`);
  return (await response.json()) as T;
}

async function razorpayRequest<T>(path: string, body: unknown): Promise<T> {
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const response = await fetch(`https://api.razorpay.com${path}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Razorpay ${path} failed with ${response.status}: ${await response.text()}`);
  return (await response.json()) as T;
}

if (isProduction && env.PAYMENTS_DEMO_MODE) {
  logger.warn('PAYMENTS_DEMO_MODE is enabled in production: unconfigured payment methods will be simulated');
}
