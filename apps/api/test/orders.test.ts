import type { Address, CheckoutResult, InventoryRow, Order, PickupSlotDay } from '@smartcart/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, findProduct, newCustomer, staffSession, storeByCode } from './helpers';

let storeId: string;

async function shelfOf(managerToken: { Authorization: string }, productName: string): Promise<InventoryRow> {
  const res = await api().get(`/api/v1/ops/stores/${storeId}/inventory`).query({ q: productName, limit: 5 }).set(managerToken).expect(200);
  return (res.body.items as InventoryRow[])[0]!;
}

beforeAll(async () => {
  storeId = (await storeByCode('BLR-IND-01')).id;
});

describe('catalogue', () => {
  it('serves a home feed with offers, categories and bestsellers', async () => {
    const res = await api().get('/api/v1/catalog/home').query({ storeId }).expect(200);
    expect(res.body.banners.map((b: { code: string }) => b.code)).toEqual(expect.arrayContaining(['WELCOME50', 'FRESH20']));
    expect(res.body.categories.length).toBeGreaterThan(10);
    expect(res.body.sections[0].products.length).toBeGreaterThan(0);
  });

  it('searches with typos and filters by dietary preference', async () => {
    const fuzzy = await api().get('/api/v1/catalog/products').query({ storeId, q: 'panner' }).expect(200);
    expect(fuzzy.body.items[0].name).toContain('Paneer');
    const vegan = await api().get('/api/v1/catalog/products').query({ storeId, dietary: 'VEGAN,GLUTEN_FREE', limit: 100 }).expect(200);
    expect(vegan.body.items.length).toBeGreaterThan(5);
    for (const product of vegan.body.items) expect(product.dietaryTags).toEqual(expect.arrayContaining(['VEGAN', 'GLUTEN_FREE']));
  });

  it('looks products up by barcode with their aisle location', async () => {
    const milk = await findProduct(storeId, 'Taaza Toned Milk');
    const res = await api().get('/api/v1/catalog/lookup').query({ storeId, barcode: milk.barcode }).expect(200);
    expect(res.body.id).toBe(milk.id);
    expect(res.body.location).toMatchObject({ aisle: 2, aisleLabel: 'Dairy, Bread & Eggs' });
  });

  it('checks stock across every branch', async () => {
    const res = await api().get('/api/v1/stores/stock-check').query({ q: 'paneer', lat: 12.97, lng: 77.64 }).expect(200);
    expect(res.body[0].stores.length).toBe(3);
    expect(res.body[0].stores[0].store.code).toBe('BLR-IND-01');
  });
});

describe('delivery orders', () => {
  it('quotes with fees and coupons', async () => {
    const chips = await findProduct(storeId, 'Classic Salted Chips');
    const small = await api()
      .post('/api/v1/orders/quote')
      .send({ storeId, channel: 'DELIVERY', items: [{ productId: chips.id, quantity: 2 }] })
      .expect(200);
    expect(small.body.bill.smallCartFee).toBeGreaterThan(0);
    expect(small.body.bill.deliveryFee).toBeGreaterThan(0);

    // FREEDEL needs ₹99 of items; 5 packs (₹100) is still under the ₹199 free-delivery threshold.
    const free = await api()
      .post('/api/v1/orders/quote')
      .send({ storeId, channel: 'DELIVERY', items: [{ productId: chips.id, quantity: 5 }], couponCode: 'FREEDEL' })
      .expect(200);
    expect(free.body.offer).toMatchObject({ code: 'FREEDEL', applicable: true });
    expect(free.body.bill.deliveryFee).toBe(0);

    const invalid = await api()
      .post('/api/v1/orders/quote')
      .send({ storeId, channel: 'DELIVERY', items: [{ productId: chips.id, quantity: 1 }], couponCode: 'NOPE' })
      .expect(200);
    expect(invalid.body.offer.applicable).toBe(false);
  });

  it('places an order, takes payment and moves through the store workflow', async () => {
    const customer = await newCustomer('Delivery Tester');
    const address = await api()
      .post('/api/v1/me/addresses')
      .set(bearer(customer))
      .send({ label: 'HOME', line1: '12, Lake View Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560038', lat: 12.974, lng: 77.64 })
      .expect(201);
    const paneer = await findProduct(storeId, 'Fresh Paneer');
    const manager = await staffSession('kavya.reddy');
    const before = await shelfOf(bearer(manager), 'Amul Fresh Paneer');

    const placed = await api()
      .post('/api/v1/orders')
      .set(bearer(customer))
      .send({
        storeId,
        channel: 'DELIVERY',
        items: [{ productId: paneer.id, quantity: 3 }],
        addressId: (address.body as Address).id,
        paymentMethod: 'UPI',
        couponCode: 'WELCOME50',
        idempotencyKey: `test-${Date.now()}`,
      })
      .expect(201);
    const checkout = placed.body as CheckoutResult;
    expect(checkout.order.status).toBe('PENDING_PAYMENT');
    expect(checkout.payment.clientAction.type).toBe('demo');
    expect(checkout.order.bill.couponDiscount).toBe(5000);

    // Stock is reserved as soon as the order is created.
    const reserved = await shelfOf(bearer(manager), 'Amul Fresh Paneer');
    expect(reserved.shelfQty + reserved.storageQty).toBe(before.shelfQty + before.storageQty - 3);

    const paid = await api().post(`/api/v1/payments/${checkout.payment.id}/demo`).set(bearer(customer)).send({ outcome: 'success' }).expect(200);
    expect(paid.body.order).toMatchObject({ status: 'PLACED', paymentStatus: 'PAID' });

    const orderId = checkout.order.id;
    const board = await api().get(`/api/v1/ops/stores/${storeId}/orders`).query({ status: 'PLACED' }).set(bearer(manager)).expect(200);
    expect((board.body as Order[]).some((o) => o.id === orderId)).toBe(true);

    await api().post(`/api/v1/ops/stores/${storeId}/orders/${orderId}/status`).set(bearer(manager)).send({ status: 'DELIVERED' }).expect(409);
    await api().post(`/api/v1/ops/stores/${storeId}/orders/${orderId}/status`).set(bearer(manager)).send({ status: 'PACKING' }).expect(200);
    await api()
      .post(`/api/v1/ops/stores/${storeId}/orders/${orderId}/status`)
      .set(bearer(manager))
      .send({ status: 'OUT_FOR_DELIVERY', riderName: 'Ravi' })
      .expect(200);
    const delivered = await api()
      .post(`/api/v1/ops/stores/${storeId}/orders/${orderId}/status`)
      .set(bearer(manager))
      .send({ status: 'DELIVERED' })
      .expect(200);
    expect(delivered.body.events.map((e: { status: string }) => e.status)).toEqual([
      'PENDING_PAYMENT',
      'PLACED',
      'PACKING',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ]);

    const history = await api().get('/api/v1/orders').set(bearer(customer)).expect(200);
    expect(history.body.items[0]).toMatchObject({ id: orderId, status: 'DELIVERED' });

    // WELCOME50 is single use per customer.
    const again = await api()
      .post('/api/v1/orders/quote')
      .set(bearer(customer))
      .send({ storeId, channel: 'DELIVERY', items: [{ productId: paneer.id, quantity: 3 }], couponCode: 'WELCOME50' })
      .expect(200);
    expect(again.body.offer).toMatchObject({ applicable: false, message: 'You have already used this offer' });
  });

  it('is idempotent for retried submissions', async () => {
    const customer = await newCustomer('Retry Tester');
    const address = await api()
      .post('/api/v1/me/addresses')
      .set(bearer(customer))
      .send({ label: 'HOME', line1: '7, MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560038', lat: 12.972, lng: 77.641 })
      .expect(201);
    const eggs = await findProduct(storeId, 'Farm Fresh Eggs');
    const body = { storeId, channel: 'DELIVERY', items: [{ productId: eggs.id, quantity: 1 }], addressId: address.body.id, paymentMethod: 'CASH_ON_DELIVERY', idempotencyKey: 'same-key-123' };
    const first = await api().post('/api/v1/orders').set(bearer(customer)).send(body).expect(201);
    const second = await api().post('/api/v1/orders').set(bearer(customer)).send(body).expect(201);
    expect(second.body.order.id).toBe(first.body.order.id);
    expect(first.body.order.status).toBe('PLACED');
  });

  it('rejects addresses outside the delivery radius', async () => {
    const customer = await newCustomer('Far Away');
    const address = await api()
      .post('/api/v1/me/addresses')
      .set(bearer(customer))
      .send({ label: 'HOME', line1: 'Somewhere in Mysuru', city: 'Mysuru', state: 'Karnataka', pincode: '570001', lat: 12.2958, lng: 76.6394 })
      .expect(201);
    const eggs = await findProduct(storeId, 'Farm Fresh Eggs');
    const res = await api()
      .post('/api/v1/orders')
      .set(bearer(customer))
      .send({ storeId, channel: 'DELIVERY', items: [{ productId: eggs.id, quantity: 1 }], addressId: address.body.id, paymentMethod: 'UPI' })
      .expect(422);
    expect(res.body.error.code).toBe('OUT_OF_DELIVERY_AREA');
  });

  it('releases stock and refunds when a paid order is cancelled', async () => {
    const customer = await newCustomer('Cancel Tester');
    const address = await api()
      .post('/api/v1/me/addresses')
      .set(bearer(customer))
      .send({ label: 'WORK', line1: '1, CMH Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560038', lat: 12.978, lng: 77.642 })
      .expect(201);
    const manager = await staffSession('kavya.reddy');
    const butter = await findProduct(storeId, 'Salted Butter');
    const before = await shelfOf(bearer(manager), 'Amul Salted Butter');
    const placed = await api()
      .post('/api/v1/orders')
      .set(bearer(customer))
      .send({ storeId, channel: 'DELIVERY', items: [{ productId: butter.id, quantity: 2 }], addressId: address.body.id, paymentMethod: 'CARD' })
      .expect(201);
    await api().post(`/api/v1/payments/${placed.body.payment.id}/demo`).set(bearer(customer)).send({}).expect(200);
    const cancelled = await api().post(`/api/v1/orders/${placed.body.order.id}/cancel`).set(bearer(customer)).send({ reason: 'Ordered by mistake' }).expect(200);
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', paymentStatus: 'REFUNDED' });
    const after = await shelfOf(bearer(manager), 'Amul Salted Butter');
    expect(after.shelfQty + after.storageQty).toBe(before.shelfQty + before.storageQty);
  });
});

describe('scheduled pickup', () => {
  it('books a slot, packs the order and hands it over with the pickup code', async () => {
    const customer = await newCustomer('Pickup Tester');
    const slotsRes = await api().get(`/api/v1/stores/${storeId}/pickup-slots`).query({ days: 2 }).expect(200);
    const slot = (slotsRes.body as PickupSlotDay[]).flatMap((d) => d.slots).find((s) => s.available)!;
    expect(slot).toBeDefined();
    const atta = await findProduct(storeId, 'Shudh Chakki Atta');
    const placed = await api()
      .post('/api/v1/orders')
      .set(bearer(customer))
      .send({ storeId, channel: 'PICKUP', items: [{ productId: atta.id, quantity: 1 }], pickupSlotStart: slot.start, paymentMethod: 'GOOGLE_PAY' })
      .expect(201);
    const paid = await api().post(`/api/v1/payments/${placed.body.payment.id}/demo`).set(bearer(customer)).send({}).expect(200);
    const order = paid.body.order as Order;
    expect(order.pickupCode).toMatch(/^[0-9A-Z]{6}$/);
    expect(order.scheduledFor).toBe(slot.start);

    const floor = await staffSession('vikram.singh');
    const status = (s: string) =>
      api().post(`/api/v1/ops/stores/${storeId}/orders/${order.id}/status`).set(bearer(floor)).send({ status: s });
    await status('PACKING').expect(200);
    await api()
      .post(`/api/v1/ops/stores/${storeId}/orders/verify-pickup`)
      .set(bearer(floor))
      .send({ orderNumber: order.orderNumber, pickupCode: order.pickupCode })
      .expect(409);
    await status('READY_FOR_PICKUP').expect(200);
    await api()
      .post(`/api/v1/ops/stores/${storeId}/orders/verify-pickup`)
      .set(bearer(floor))
      .send({ orderNumber: order.orderNumber, pickupCode: 'WRONG1' })
      .expect(400);
    const handed = await api()
      .post(`/api/v1/ops/stores/${storeId}/orders/verify-pickup`)
      .set(bearer(floor))
      .send({ scanned: `smartcart://pickup/${order.orderNumber}/${order.pickupCode}` })
      .expect(200);
    expect(handed.body.status).toBe('PICKED_UP');
  });
});
