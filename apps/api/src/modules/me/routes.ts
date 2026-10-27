import {
  AddressSchema,
  IdSchema,
  PushTokenSchema,
  SavePaymentMethodSchema,
  UpdateProfileSchema,
  type Address,
  type CustomerProfile,
  type SavedPaymentMethod,
} from '@smartcart/shared';
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { addresses, customerProfiles, notifications, orders, paymentMethods, pushTokens, users } from '../../db/schema';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { requireAuth, requireCustomer } from '../../middleware/auth';
import { serializeUser } from '../../services/auth';
import { serializeNotification } from '../../services/notifications';
import { createStripeSetupIntent, describeStripeCard } from '../../services/payments';

export const meRouter = Router();

// --- Notifications & push tokens (every account type) ------------------------------

meRouter.get('/notifications', requireAuth(), async (req, res) => {
  const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) }), req.query);
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, req.auth!.userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  const [unread] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, req.auth!.userId), isNull(notifications.readAt)));
  res.json({ items: rows.map(serializeNotification), unread: unread?.count ?? 0 });
});

meRouter.post('/notifications/read-all', requireAuth(), async (req, res) => {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, req.auth!.userId), isNull(notifications.readAt)));
  res.status(204).end();
});

meRouter.post('/notifications/:id/read', requireAuth(), async (req, res) => {
  const id = parse(IdSchema, req.params.id);
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, req.auth!.userId)));
  res.status(204).end();
});

meRouter.post('/push-tokens', requireAuth(), async (req, res) => {
  const input = parse(PushTokenSchema, req.body);
  await db
    .insert(pushTokens)
    .values({ userId: req.auth!.userId, token: input.token, platform: input.platform })
    .onConflictDoUpdate({ target: pushTokens.token, set: { userId: req.auth!.userId, lastSeenAt: new Date() } });
  res.status(204).end();
});

meRouter.delete('/push-tokens', requireAuth(), async (req, res) => {
  const { token } = parse(z.object({ token: z.string().min(10) }), req.body);
  await db.delete(pushTokens).where(and(eq(pushTokens.token, token), eq(pushTokens.userId, req.auth!.userId)));
  res.status(204).end();
});

// --- Customer profile ---------------------------------------------------------------

async function loadProfile(userId: string): Promise<CustomerProfile> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw notFound('Account');
  await db.insert(customerProfiles).values({ userId }).onConflictDoNothing();
  const [profile] = await db.select().from(customerProfiles).where(eq(customerProfiles.userId, userId)).limit(1);
  const [stats] = await db
    .select({
      orders: sql<number>`count(*)::int`,
      totalSpent: sql<number>`coalesce(sum(${orders.total}), 0)::float8`,
      totalSavings: sql<number>`coalesce(sum(${orders.mrpTotal} - ${orders.itemTotal} + ${orders.couponDiscount}), 0)::float8`,
    })
    .from(orders)
    .where(and(eq(orders.userId, userId), sql`${orders.placedAt} is not null`, ne(orders.status, 'CANCELLED')));
  return {
    user: serializeUser(user),
    dietaryPreferences: profile?.dietaryPreferences ?? [],
    allergens: profile?.allergens ?? [],
    defaultStoreId: profile?.defaultStoreId ?? null,
    loyaltyPoints: profile?.loyaltyPoints ?? 0,
    stats: { orders: stats?.orders ?? 0, totalSpent: stats?.totalSpent ?? 0, totalSavings: stats?.totalSavings ?? 0 },
  };
}

meRouter.get('/profile', requireCustomer, async (req, res) => {
  res.json(await loadProfile(req.auth!.userId));
});

meRouter.patch('/profile', requireCustomer, async (req, res) => {
  const input = parse(UpdateProfileSchema, req.body);
  const userId = req.auth!.userId;
  for (const field of ['email', 'phone'] as const) {
    const value = input[field];
    if (!value) continue;
    const column = field === 'email' ? users.email : users.phone;
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.kind, 'CUSTOMER'), eq(column, value), ne(users.id, userId)))
      .limit(1);
    if (taken) throw conflict(`That ${field} is already used by another account`);
  }
  const userPatch: Partial<typeof users.$inferInsert> = {};
  if (input.name !== undefined) userPatch.name = input.name;
  if (input.email !== undefined) userPatch.email = input.email;
  if (input.phone !== undefined) userPatch.phone = input.phone;
  if (input.avatarUrl !== undefined) userPatch.avatarUrl = input.avatarUrl;
  if (Object.keys(userPatch).length > 0) await db.update(users).set(userPatch).where(eq(users.id, userId));

  const profilePatch: Partial<typeof customerProfiles.$inferInsert> = {};
  if (input.dietaryPreferences !== undefined) profilePatch.dietaryPreferences = input.dietaryPreferences;
  if (input.allergens !== undefined) profilePatch.allergens = input.allergens;
  if (input.defaultStoreId !== undefined) profilePatch.defaultStoreId = input.defaultStoreId;
  await db.insert(customerProfiles).values({ userId }).onConflictDoNothing();
  if (Object.keys(profilePatch).length > 0) {
    await db.update(customerProfiles).set(profilePatch).where(eq(customerProfiles.userId, userId));
  }
  res.json(await loadProfile(userId));
});

// --- Addresses ------------------------------------------------------------------------

function serializeAddress(row: typeof addresses.$inferSelect): Address {
  return {
    id: row.id,
    label: row.label,
    line1: row.line1,
    line2: row.line2,
    landmark: row.landmark,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    lat: row.lat,
    lng: row.lng,
    receiverName: row.receiverName,
    receiverPhone: row.receiverPhone,
    isDefault: row.isDefault,
  };
}

meRouter.get('/addresses', requireCustomer, async (req, res) => {
  const rows = await db
    .select()
    .from(addresses)
    .where(eq(addresses.userId, req.auth!.userId))
    .orderBy(desc(addresses.isDefault), desc(addresses.createdAt));
  res.json(rows.map(serializeAddress));
});

meRouter.post('/addresses', requireCustomer, async (req, res) => {
  const input = parse(AddressSchema, req.body);
  const userId = req.auth!.userId;
  const created = await db.transaction(async (tx) => {
    const [{ count }] = (await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(addresses)
      .where(eq(addresses.userId, userId))) as [{ count: number }];
    const makeDefault = input.isDefault ?? count === 0;
    if (makeDefault) await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, userId));
    const [row] = await tx
      .insert(addresses)
      .values({ ...input, userId, isDefault: makeDefault })
      .returning();
    return row!;
  });
  res.status(201).json(serializeAddress(created));
});

meRouter.patch('/addresses/:id', requireCustomer, async (req, res) => {
  const id = parse(IdSchema, req.params.id);
  const input = parse(AddressSchema.partial(), req.body);
  const userId = req.auth!.userId;
  const updated = await db.transaction(async (tx) => {
    if (input.isDefault) await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, userId));
    const [row] = await tx
      .update(addresses)
      .set(input)
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
      .returning();
    return row;
  });
  if (!updated) throw notFound('Address');
  res.json(serializeAddress(updated));
});

meRouter.delete('/addresses/:id', requireCustomer, async (req, res) => {
  const id = parse(IdSchema, req.params.id);
  await db.delete(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, req.auth!.userId)));
  res.status(204).end();
});

// --- Saved payment methods ------------------------------------------------------------

export function serializePaymentMethod(row: typeof paymentMethods.$inferSelect): SavedPaymentMethod {
  return {
    id: row.id,
    type: row.type,
    provider: row.provider,
    label: row.label,
    brand: row.brand,
    last4: row.last4,
    expMonth: row.expMonth,
    expYear: row.expYear,
    upiId: row.upiId,
    email: row.email,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
  };
}

meRouter.get('/payment-methods', requireCustomer, async (req, res) => {
  const rows = await db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.userId, req.auth!.userId))
    .orderBy(desc(paymentMethods.isDefault), desc(paymentMethods.createdAt));
  res.json(rows.map(serializePaymentMethod));
});

/** Stripe SetupIntent for saving a card with Stripe Elements / PaymentSheet (live mode only). */
meRouter.post('/payment-methods/stripe-setup', requireCustomer, async (req, res) => {
  res.json(await createStripeSetupIntent(req.auth!.userId));
});

meRouter.post('/payment-methods', requireCustomer, async (req, res) => {
  const input = parse(SavePaymentMethodSchema, req.body);
  const userId = req.auth!.userId;
  let values: typeof paymentMethods.$inferInsert;
  if (input.type === 'UPI') {
    values = { userId, type: 'UPI', provider: 'razorpay', label: input.upiId, upiId: input.upiId };
  } else if (input.type === 'PAYPAL') {
    values = { userId, type: 'PAYPAL', provider: 'paypal', label: `PayPal · ${input.email}`, email: input.email };
  } else {
    const card = input.stripePaymentMethodId
      ? await describeStripeCard(userId, input.stripePaymentMethodId)
      : { brand: input.brand, last4: input.last4, expMonth: input.expMonth, expYear: input.expYear };
    if (!card.brand || !card.last4 || !card.expMonth || !card.expYear) throw badRequest('Enter the card details');
    values = {
      userId,
      type: 'CARD',
      provider: input.stripePaymentMethodId ? 'stripe' : 'demo',
      label: `${card.brand} •••• ${card.last4}`,
      brand: card.brand,
      last4: card.last4,
      expMonth: card.expMonth,
      expYear: card.expYear,
      providerRef: input.stripePaymentMethodId ?? null,
    };
  }
  const created = await db.transaction(async (tx) => {
    const existing = await tx.select({ id: paymentMethods.id }).from(paymentMethods).where(eq(paymentMethods.userId, userId));
    const makeDefault = input.isDefault ?? existing.length === 0;
    if (makeDefault) await tx.update(paymentMethods).set({ isDefault: false }).where(eq(paymentMethods.userId, userId));
    const [row] = await tx
      .insert(paymentMethods)
      .values({ ...values, isDefault: makeDefault })
      .returning();
    return row!;
  });
  res.status(201).json(serializePaymentMethod(created));
});

meRouter.post('/payment-methods/:id/default', requireCustomer, async (req, res) => {
  const id = parse(IdSchema, req.params.id);
  const userId = req.auth!.userId;
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: paymentMethods.id })
      .from(paymentMethods)
      .where(and(eq(paymentMethods.id, id), eq(paymentMethods.userId, userId)));
    if (!row) throw notFound('Payment method');
    await tx.update(paymentMethods).set({ isDefault: false }).where(eq(paymentMethods.userId, userId));
    await tx.update(paymentMethods).set({ isDefault: true }).where(eq(paymentMethods.id, id));
  });
  res.status(204).end();
});

meRouter.delete('/payment-methods/:id', requireCustomer, async (req, res) => {
  const id = parse(IdSchema, req.params.id);
  await db.delete(paymentMethods).where(and(eq(paymentMethods.id, id), eq(paymentMethods.userId, req.auth!.userId)));
  res.status(204).end();
});
