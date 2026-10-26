import { DeviceCartItemSchema, DevicePairSchema, GateVerifySchema, parseCartPairCode } from '@smartcart/shared';
import { eq } from 'drizzle-orm';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { db } from '../../db/client';
import { stores } from '../../db/schema';
import { forbidden } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { requireDevice } from '../../middleware/auth';
import { deviceLimiter } from '../../middleware/rateLimit';
import { verifyAtGate } from '../../services/exitPass';
import { currentKioskCode } from '../../services/kiosk';
import { cartScan, cartSessionFor, pairCart, serializeSession, unpairCart } from '../../services/sessions';

/**
 * Hardware API for exit gates, smart carts and attendance kiosks.
 * Every request carries the device's `X-Device-Key`.
 */
export const devicesRouter = Router();
devicesRouter.use(deviceLimiter, requireDevice);

function deviceType(type: 'EXIT_GATE' | 'SMART_CART' | 'KIOSK') {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.device?.type !== type) throw forbidden(`This endpoint is for ${type.toLowerCase().replace('_', ' ')} devices`);
    next();
  };
}

devicesRouter.get('/me', async (req, res) => {
  const [store] = await db.select({ name: stores.name, code: stores.code }).from(stores).where(eq(stores.id, req.device!.storeId)).limit(1);
  res.json({ ...req.device, storeName: store?.name, storeCode: store?.code });
});

/** Exit gate: open only for a paid, unused exit pass from this store. */
devicesRouter.post('/gate/verify', deviceType('EXIT_GATE'), async (req, res) => {
  const { code } = parse(GateVerifySchema, req.body);
  res.json(await verifyAtGate({ code, storeId: req.device!.storeId, deviceId: req.device!.id }));
});

/** Smart cart: pair with the shopper's session by scanning the code shown in their app. */
devicesRouter.post('/cart/pair', deviceType('SMART_CART'), async (req, res) => {
  const raw = typeof req.body?.pairingCode === 'string' ? (parseCartPairCode(req.body.pairingCode) ?? req.body.pairingCode) : req.body?.pairingCode;
  const { pairingCode } = parse(DevicePairSchema, { pairingCode: raw });
  res.json(await pairCart(req.device!, pairingCode));
});

devicesRouter.get('/cart/session', deviceType('SMART_CART'), async (req, res) => {
  const session = await cartSessionFor(req.device!.id);
  res.json({ session: session ? await serializeSession(db, session.id) : null });
});

/** Item dropped into (+n) or taken out of (-n) the cart. Deducts store inventory instantly. */
devicesRouter.post('/cart/items', deviceType('SMART_CART'), async (req, res) => {
  const { barcode, quantity } = parse(DeviceCartItemSchema, req.body);
  res.json(await cartScan(req.device!, barcode, quantity));
});

devicesRouter.post('/cart/unpair', deviceType('SMART_CART'), async (req, res) => {
  await unpairCart(req.device!.id);
  res.status(204).end();
});

/** Attendance kiosk: the rotating QR shown at the staff entrance. */
devicesRouter.get('/kiosk/code', deviceType('KIOSK'), async (req, res) => {
  const [store] = await db.select({ kioskSecret: stores.kioskSecret }).from(stores).where(eq(stores.id, req.device!.storeId)).limit(1);
  res.json(currentKioskCode(req.device!.storeId, store!.kioskSecret));
});
