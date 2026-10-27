import { SocketEvents, type InStoreSession, type InventoryRow, type RestockAlert, type ShoppingList, type Task } from '@smartcart/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { storeProducts } from '../src/db/schema';
import { api, bearer, customerSession, findProduct, newCustomer, staffSession, storeByCode } from './helpers';

let storeId: string;
let otherStoreId: string;
const gateKey = 'scdev_blr-ind-01_gate1';
const cartKey = 'scdev_blr-ind-01_cart02';

beforeAll(async () => {
  storeId = (await storeByCode('BLR-IND-01')).id;
  otherStoreId = (await storeByCode('BLR-KOR-02')).id;
});

async function inventoryRow(productName: string): Promise<InventoryRow> {
  const manager = await staffSession('kavya.reddy');
  const res = await api().get(`/api/v1/ops/stores/${storeId}/inventory`).query({ q: productName }).set(bearer(manager)).expect(200);
  return res.body.items[0];
}

describe('Scan & Go with a family list', () => {
  let session: InStoreSession;

  it('starts a session linked to the shared family list', async () => {
    const rohit = await customerSession('rohit@example.com');
    const lists = await api().get('/api/v1/lists').set(bearer(rohit)).expect(200);
    const weekly = lists.body.find((l: { name: string }) => l.name === 'Weekly Groceries');
    const res = await api().post('/api/v1/instore/sessions').set(bearer(rohit)).send({ storeId, listId: weekly.id }).expect(201);
    session = res.body;
    expect(session.status).toBe('ACTIVE');
    expect(session.pairingCode).toMatch(/^\d{6}$/);

    // The list, viewed for this store, carries aisle locations for every item (free text too).
    const list = await api().get(`/api/v1/lists/${weekly.id}`).query({ storeId }).set(bearer(rohit)).expect(200);
    const located = (list.body as ShoppingList).items.filter((i) => i.product?.location);
    expect(located.length).toBe((list.body as ShoppingList).items.length - 1);
    const candles = (list.body as ShoppingList).items.find((i) => i.name === 'Birthday candles');
    expect(candles?.product === null || candles?.product?.location).toBeTruthy();
  });

  it('deducts shelf stock the moment an item is scanned and ticks it off the list', async () => {
    const rohit = await customerSession('rohit@example.com');
    const milk = await findProduct(storeId, 'Taaza Toned Milk');
    const before = await inventoryRow('Amul Taaza Toned Milk');
    const res = await api()
      .post(`/api/v1/instore/sessions/${session.id}/items`)
      .set(bearer(rohit))
      .send({ barcode: milk.barcode, quantity: 2 })
      .expect(201);
    expect(res.body.change).toMatchObject({ type: 'ADDED', quantity: 2, source: 'APP' });
    expect(res.body.session.bill.total).toBe(milk.price * 2);
    const after = await inventoryRow('Amul Taaza Toned Milk');
    expect(after.shelfQty).toBe(before.shelfQty - 2);

    const priya = await customerSession();
    const list = await api().get(`/api/v1/lists/${session.listId}`).set(bearer(priya)).expect(200);
    const milkItem = (list.body as ShoppingList).items.find((i) => i.productId === milk.id);
    expect(milkItem).toMatchObject({ isChecked: true, checkedByName: 'Rohit Sharma' });
  });

  it('returns stock when an item is taken back out of the cart', async () => {
    const rohit = await customerSession('rohit@example.com');
    const current = await api().get(`/api/v1/instore/sessions/${session.id}`).set(bearer(rohit)).expect(200);
    const item = current.body.items[0];
    const before = await inventoryRow(item.name);
    await api().patch(`/api/v1/instore/sessions/${session.id}/items/${item.id}`).set(bearer(rohit)).send({ quantity: 1 }).expect(200);
    const after = await inventoryRow(item.name);
    expect(after.shelfQty).toBe(before.shelfQty + 1);
  });

  it('pays with the in-store offer and walks out through the exit gate exactly once', async () => {
    const rohit = await customerSession('rohit@example.com');
    const checkout = await api()
      .post(`/api/v1/instore/sessions/${session.id}/checkout`)
      .set(bearer(rohit))
      .send({ paymentMethod: 'APPLE_PAY', couponCode: 'SCANGO10' })
      .expect(200);
    expect(checkout.body.order.channel).toBe('IN_STORE');
    expect(checkout.body.order.bill.couponDiscount).toBeGreaterThan(0);

    const paid = await api().post(`/api/v1/payments/${checkout.body.payment.id}/demo`).set(bearer(rohit)).send({}).expect(200);
    expect(paid.body.order.status).toBe('COMPLETED');
    const pass = paid.body.order.exitPass;
    expect(pass.token).toMatch(/^SC[0-9A-Z]{18}$/);
    expect(pass.uri).toBe(`smartcart://exit/${pass.token}`);

    const wrongStoreGate = await api()
      .post('/api/v1/devices/gate/verify')
      .set('X-Device-Key', 'scdev_blr-kor-02_gate1')
      .send({ code: pass.uri })
      .expect(200);
    expect(wrongStoreGate.body).toMatchObject({ open: false, reason: 'WRONG_STORE' });

    const opened = await api().post('/api/v1/devices/gate/verify').set('X-Device-Key', gateKey).send({ code: pass.uri }).expect(200);
    expect(opened.body).toMatchObject({ open: true, reason: 'OK' });
    expect(opened.body.order.customerName).toBe('Rohit Sharma');

    const replay = await api().post('/api/v1/devices/gate/verify').set('X-Device-Key', gateKey).send({ code: pass.token }).expect(200);
    expect(replay.body).toMatchObject({ open: false, reason: 'ALREADY_USED' });

    const garbage = await api().post('/api/v1/devices/gate/verify').set('X-Device-Key', gateKey).send({ code: 'hello' }).expect(200);
    expect(garbage.body.reason).toBe('MALFORMED');
    await api().post('/api/v1/devices/gate/verify').set('X-Device-Key', 'not-a-key').send({ code: pass.token }).expect(401);
    void otherStoreId;
  });

  it('re-issues the exit pass token so only the newest one works', async () => {
    const customer = await newCustomer('Exit Pass Rotation');
    const started = await api().post('/api/v1/instore/sessions').set(bearer(customer)).send({ storeId }).expect(201);
    const chips = await findProduct(storeId, 'Classic Salted Chips');
    await api().post(`/api/v1/instore/sessions/${started.body.id}/items`).set(bearer(customer)).send({ productId: chips.id }).expect(201);
    const checkout = await api()
      .post(`/api/v1/instore/sessions/${started.body.id}/checkout`)
      .set(bearer(customer))
      .send({ paymentMethod: 'UPI' })
      .expect(200);
    const paid = await api().post(`/api/v1/payments/${checkout.body.payment.id}/demo`).set(bearer(customer)).send({}).expect(200);
    const firstToken = paid.body.order.exitPass.token;
    const reissued = await api().post(`/api/v1/orders/${paid.body.order.id}/exit-pass`).set(bearer(customer)).expect(200);
    expect(reissued.body.token).not.toBe(firstToken);
    const old = await api().post('/api/v1/devices/gate/verify').set('X-Device-Key', gateKey).send({ code: firstToken }).expect(200);
    expect(old.body.reason).toBe('NOT_FOUND');
    const fresh = await api()
      .post('/api/v1/devices/gate/verify')
      .set('X-Device-Key', gateKey)
      .send({ code: reissued.body.token })
      .expect(200);
    expect(fresh.body.open).toBe(true);
  });
});

describe('smart cart hardware', () => {
  it('pairs with a shopper and syncs items dropped into the cart', async () => {
    const customer = await newCustomer('Smart Cart Shopper');
    const started = await api().post('/api/v1/instore/sessions').set(bearer(customer)).send({ storeId }).expect(201);
    const paired = await api()
      .post('/api/v1/devices/cart/pair')
      .set('X-Device-Key', cartKey)
      .send({ pairingCode: `smartcart://cart-pair/${started.body.pairingCode}` })
      .expect(200);
    expect(paired.body.cartDevice.name).toBe('Smart Cart 02');

    const bread = await findProduct(storeId, 'Brown Bread');
    const before = await inventoryRow('Britannia Brown Bread');
    const added = await api()
      .post('/api/v1/devices/cart/items')
      .set('X-Device-Key', cartKey)
      .send({ barcode: bread.barcode, quantity: 1 })
      .expect(200);
    expect(added.body.change).toMatchObject({ source: 'SMART_CART', quantity: 1 });
    expect((await inventoryRow('Britannia Brown Bread')).shelfQty).toBe(before.shelfQty - 1);

    const removed = await api()
      .post('/api/v1/devices/cart/items')
      .set('X-Device-Key', cartKey)
      .send({ barcode: bread.barcode, quantity: -1 })
      .expect(200);
    expect(removed.body.change.type).toBe('REMOVED');
    expect((await inventoryRow('Britannia Brown Bread')).shelfQty).toBe(before.shelfQty);

    await api().post('/api/v1/devices/gate/verify').set('X-Device-Key', cartKey).send({ code: 'x' }).expect(403);
  });

  it('returns everything to the shelf when a session is abandoned', async () => {
    const customer = await newCustomer('Abandoner');
    const started = await api().post('/api/v1/instore/sessions').set(bearer(customer)).send({ storeId }).expect(201);
    const cola = await findProduct(storeId, 'Coca-Cola');
    const before = await inventoryRow('Coca-Cola');
    await api()
      .post(`/api/v1/instore/sessions/${started.body.id}/items`)
      .set(bearer(customer))
      .send({ productId: cola.id, quantity: 3 })
      .expect(201);
    await api().post(`/api/v1/instore/sessions/${started.body.id}/cancel`).set(bearer(customer)).expect(200);
    expect((await inventoryRow('Coca-Cola')).shelfQty).toBe(before.shelfQty);
  });
});

describe('low-stock alerts', () => {
  const productName = 'Tata Salt Iodised Salt';
  let storeProductId: string;

  afterAll(async () => {
    if (storeProductId) await db.update(storeProducts).set({ shelfQty: 30 }).where(eq(storeProducts.id, storeProductId));
  });

  it('raises an alert and an auto-assigned restock task when a cart empties the shelf', async () => {
    const row = await inventoryRow(productName);
    storeProductId = row.storeProductId;
    // Leave one unit above the threshold, then take two.
    await db
      .update(storeProducts)
      .set({ shelfQty: row.reorderThreshold + 1, storageQty: 50 })
      .where(eq(storeProducts.id, row.storeProductId));
    const customer = await newCustomer('Salt Buyer');
    const started = await api().post('/api/v1/instore/sessions').set(bearer(customer)).send({ storeId }).expect(201);
    await api()
      .post(`/api/v1/instore/sessions/${started.body.id}/items`)
      .set(bearer(customer))
      .send({ productId: row.productId, quantity: 2 })
      .expect(201);

    const worker = await staffSession('rahul.yadav');
    const alerts = await api().get(`/api/v1/ops/stores/${storeId}/alerts`).set(bearer(worker)).expect(200);
    const alert = (alerts.body as RestockAlert[]).find((a) => a.product.id === row.productId)!;
    expect(alert).toMatchObject({ status: 'OPEN', level: 'LOW' });
    expect(alert.taskId).toBeTruthy();

    const warehouse = await staffSession('imran.khan');
    const tasksA = await api().get(`/api/v1/ops/stores/${storeId}/tasks`).query({ scope: 'mine' }).set(bearer(worker)).expect(200);
    const tasksB = await api().get(`/api/v1/ops/stores/${storeId}/tasks`).query({ scope: 'mine' }).set(bearer(warehouse)).expect(200);
    const task = [...tasksA.body, ...tasksB.body].find((t: Task) => t.id === alert.taskId) as Task;
    expect(task).toMatchObject({ category: 'RESTOCK', priority: 'HIGH' });

    const notifications = await api().get('/api/v1/me/notifications').set(bearer(worker)).expect(200);
    expect(
      notifications.body.items.some((n: { type: string; title: string }) => n.type === 'RESTOCK_ALERT' && n.title.includes('Salt')),
    ).toBe(true);

    // Restocking from storage resolves the alert.
    const resolved = await api()
      .post(`/api/v1/ops/stores/${storeId}/alerts/${alert.id}/resolve`)
      .set(bearer(worker))
      .send({ restockQuantity: 20 })
      .expect(200);
    expect(resolved.body).toMatchObject({ status: 'RESOLVED', restockedQty: 20 });
    const movements = await api()
      .get(`/api/v1/ops/stores/${storeId}/inventory/${row.storeProductId}/movements`)
      .set(bearer(worker))
      .expect(200);
    expect(movements.body.map((m: { type: string }) => m.type)).toEqual(expect.arrayContaining(['RESTOCK', 'CART_ADD']));
  });
});

describe('collaborative list sync', () => {
  it('pushes items added at home to the shopper in real time', async () => {
    const http = await import('node:http');
    const { createRealtime } = await import('../src/realtime/server');
    const { io: connect } = await import('socket.io-client');
    const { app } = await import('./helpers');
    const server = http.createServer(app);
    const io = createRealtime(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    const priya = await customerSession();
    const rohit = await customerSession('rohit@example.com');
    const lists = await api().get('/api/v1/lists').set(bearer(priya)).expect(200);
    const weekly = lists.body.find((l: { name: string }) => l.name === 'Weekly Groceries');

    const shopper = connect(`http://localhost:${port}`, { auth: { token: rohit.accessToken }, transports: ['websocket'] });
    try {
      await new Promise<void>((resolve, reject) => {
        shopper.on('connect', () => resolve());
        shopper.on('connect_error', reject);
      });
      const joined = await new Promise<{ ok: boolean }>((resolve) => shopper.emit(SocketEvents.JOIN_LIST, weekly.id, resolve));
      expect(joined.ok).toBe(true);

      const received = new Promise<{ action: string; item: { name: string }; actor: { name: string } }>((resolve) =>
        shopper.on(SocketEvents.LIST_UPDATED, (event) => event.action === 'ITEM_ADDED' && resolve(event)),
      );
      await api().post(`/api/v1/lists/${weekly.id}/items`).set(bearer(priya)).send({ name: 'Greek yogurt' }).expect(201);
      const event = await received;
      expect(event.actor.name).toBe('Priya Sharma');
      expect(event.item.name).toBe('Greek yogurt');

      const outsider = await newCustomer('Nosy Neighbour');
      const intruder = connect(`http://localhost:${port}`, { auth: { token: outsider.accessToken }, transports: ['websocket'] });
      await new Promise<void>((resolve) => intruder.on('connect', () => resolve()));
      const denied = await new Promise<{ ok: boolean }>((resolve) => intruder.emit(SocketEvents.JOIN_LIST, weekly.id, resolve));
      expect(denied.ok).toBe(false);
      intruder.close();
    } finally {
      shopper.close();
      await io.close();
      server.close();
    }
  });

  it('lets family members join with the invite code', async () => {
    const cousin = await newCustomer('Cousin Meera');
    const joined = await api().post('/api/v1/lists/join').set(bearer(cousin)).send({ code: 'family42' }).expect(200);
    expect(joined.body.members.map((m: { name: string }) => m.name)).toContain('Cousin Meera');
    await api().delete(`/api/v1/lists/${joined.body.id}`).set(bearer(cousin)).expect(403);
  });
});
