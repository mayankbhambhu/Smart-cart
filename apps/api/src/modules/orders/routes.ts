import {
  CancelOrderSchema,
  IdSchema,
  OrdersQuerySchema,
  PlaceOrderSchema,
  QuoteSchema,
  RetryPaymentSchema,
} from '@smartcart/shared';
import { Router } from 'express';
import { parse } from '../../lib/validate';
import { requireCustomer } from '../../middleware/auth';
import { revealExitPass } from '../../services/exitPass';
import {
  cancelOrder,
  getCustomerOrder,
  listCustomerOrders,
  placeOrder,
  quote,
  retryPayment,
} from '../../services/orders';

export const ordersRouter = Router();

/** Bill preview for a cart (works signed-out too; coupon limits apply when signed in). */
ordersRouter.post('/quote', async (req, res) => {
  const input = parse(QuoteSchema, req.body);
  res.json(await quote(input, req.auth?.kind === 'CUSTOMER' ? req.auth.userId : null));
});

ordersRouter.post('/', requireCustomer, async (req, res) => {
  const input = parse(PlaceOrderSchema, req.body);
  res.status(201).json(await placeOrder(req.auth!.userId, input));
});

ordersRouter.get('/', requireCustomer, async (req, res) => {
  const query = parse(OrdersQuerySchema, req.query);
  res.json(await listCustomerOrders(req.auth!.userId, query.channel, query.limit, query.offset));
});

ordersRouter.get('/:orderId', requireCustomer, async (req, res) => {
  const orderId = parse(IdSchema, req.params.orderId);
  res.json(await getCustomerOrder(req.auth!.userId, orderId));
});

ordersRouter.post('/:orderId/cancel', requireCustomer, async (req, res) => {
  const orderId = parse(IdSchema, req.params.orderId);
  const { reason } = parse(CancelOrderSchema, req.body);
  await getCustomerOrder(req.auth!.userId, orderId);
  res.json(
    await cancelOrder(orderId, { userId: req.auth!.userId, name: req.auth!.name, isStaff: false }, reason ?? 'Cancelled by customer'),
  );
});

ordersRouter.post('/:orderId/pay', requireCustomer, async (req, res) => {
  const orderId = parse(IdSchema, req.params.orderId);
  const input = parse(RetryPaymentSchema, req.body);
  res.json(await retryPayment(req.auth!.userId, orderId, input.method, input.savedPaymentMethodId));
});

/** Re-issues the QR token of a valid exit pass (the previous token stops working). */
ordersRouter.post('/:orderId/exit-pass', requireCustomer, async (req, res) => {
  const orderId = parse(IdSchema, req.params.orderId);
  await getCustomerOrder(req.auth!.userId, orderId);
  res.json(await revealExitPass(orderId, req.auth!.userId));
});
