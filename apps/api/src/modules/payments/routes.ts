import { ConfirmPaymentSchema, DemoPaymentSchema, IdSchema, type CheckoutResult } from '@smartcart/shared';
import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../../db/client';
import { payments } from '../../db/schema';
import { AppError, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { parse } from '../../lib/validate';
import { requireCustomer } from '../../middleware/auth';
import { applyPaymentResult, loadOrder } from '../../services/orders';
import {
  parseRazorpayWebhook,
  parseStripeWebhook,
  paymentsConfig,
  toPaymentInfo,
  verifyWithProvider,
  type WebhookOutcome,
} from '../../services/payments';

export const paymentsRouter = Router();

paymentsRouter.get('/config', (_req, res) => {
  res.json(paymentsConfig());
});

async function ownPayment(paymentId: string, userId: string) {
  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.userId, userId)))
    .limit(1);
  if (!payment) throw notFound('Payment');
  return payment;
}

async function checkoutResult(orderId: string, paymentId: string, exitToken: string | null): Promise<CheckoutResult> {
  const order = await loadOrder(db, orderId, exitToken);
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  return { order: order!, payment: toPaymentInfo(payment!) };
}

/**
 * Called by the app after the wallet / checkout sheet closes. The server
 * re-verifies with the provider before marking anything as paid.
 */
paymentsRouter.post('/:paymentId/confirm', requireCustomer, async (req, res) => {
  const paymentId = parse(IdSchema, req.params.paymentId);
  const { payload } = parse(ConfirmPaymentSchema, req.body);
  const payment = await ownPayment(paymentId, req.auth!.userId);
  if (payment.provider === 'demo') throw new AppError(400, 'USE_DEMO_ENDPOINT', 'Use the demo payment endpoint for demo payments');
  const result = await verifyWithProvider(payment, payload);
  const applied = await applyPaymentResult(payment.id, result);
  res.json(await checkoutResult(applied.orderId, payment.id, applied.exitToken));
});

/** Completes a simulated payment (only for the demo provider). */
paymentsRouter.post('/:paymentId/demo', requireCustomer, async (req, res) => {
  const paymentId = parse(IdSchema, req.params.paymentId);
  const { outcome } = parse(DemoPaymentSchema, req.body);
  const payment = await ownPayment(paymentId, req.auth!.userId);
  if (payment.provider !== 'demo') throw new AppError(400, 'NOT_DEMO', 'This payment is processed by a real provider');
  const result = await verifyWithProvider(payment, { outcome });
  const applied = await applyPaymentResult(payment.id, result);
  res.json(await checkoutResult(applied.orderId, payment.id, applied.exitToken));
});

/** Provider webhooks; mounted with a raw body parser so signatures can be verified. */
export const paymentWebhooksRouter = Router();

async function handleWebhook(outcome: WebhookOutcome): Promise<void> {
  if (!outcome) return;
  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.provider, outcome.provider), eq(payments.providerRef, outcome.paymentRef)))
    .limit(1);
  if (!payment) {
    logger.warn({ ref: outcome.paymentRef }, 'Webhook for unknown payment');
    return;
  }
  await applyPaymentResult(payment.id, outcome.result);
}

paymentWebhooksRouter.post('/stripe', async (req, res) => {
  await handleWebhook(parseStripeWebhook(req.body as Buffer, req.header('stripe-signature')));
  res.json({ received: true });
});

paymentWebhooksRouter.post('/razorpay', async (req, res) => {
  await handleWebhook(parseRazorpayWebhook(req.body as Buffer, req.header('x-razorpay-signature')));
  res.json({ received: true });
});
