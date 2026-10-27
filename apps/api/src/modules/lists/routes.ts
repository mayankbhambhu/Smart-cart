import {
  AddListItemSchema,
  CreateListSchema,
  IdSchema,
  InviteToListSchema,
  JoinListSchema,
  UpdateListItemSchema,
  UpdateListSchema,
  normalizePhone,
} from '@smartcart/shared';
import { and, eq, ne } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { listItems, listMembers, products, shoppingLists, users } from '../../db/schema';
import { conflict, forbidden, notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { requireCustomer } from '../../middleware/auth';
import {
  generateShareCode,
  listMembersOf,
  listSummaries,
  loadList,
  publishListChange,
  requireMembership,
  serializeItem,
} from '../../services/lists';
import { notifyUsers } from '../../services/notifications';

export const listsRouter = Router();
listsRouter.use(requireCustomer);

const StoreContextQuery = z.object({ storeId: IdSchema.optional() });

listsRouter.get('/', async (req, res) => {
  res.json(await listSummaries(req.auth!.userId));
});

listsRouter.post('/', async (req, res) => {
  const input = parse(CreateListSchema, req.body);
  const userId = req.auth!.userId;
  const list = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(shoppingLists)
      .values({
        ownerId: userId,
        name: input.name,
        emoji: input.emoji ?? '🛒',
        storeId: input.storeId ?? null,
        shareCode: await generateShareCode(tx),
      })
      .returning();
    await tx.insert(listMembers).values({ listId: created!.id, userId, role: 'OWNER' });
    return created!;
  });
  res.status(201).json(await loadList(list.id, input.storeId ?? null));
});

listsRouter.post('/join', async (req, res) => {
  const { code } = parse(JoinListSchema, req.body);
  const [list] = await db.select().from(shoppingLists).where(eq(shoppingLists.shareCode, code)).limit(1);
  if (!list) throw notFound('No list matches this invite code');
  const inserted = await db
    .insert(listMembers)
    .values({ listId: list.id, userId: req.auth!.userId, role: 'EDITOR' })
    .onConflictDoNothing()
    .returning();
  if (inserted.length > 0) {
    const member = ((await listMembersOf(db, [list.id])).get(list.id) ?? []).find((m) => m.userId === req.auth!.userId);
    await publishListChange(list.id, 'MEMBER_JOINED', { id: req.auth!.userId, name: req.auth!.name }, { member });
    const others = await db
      .select({ userId: listMembers.userId })
      .from(listMembers)
      .where(and(eq(listMembers.listId, list.id), ne(listMembers.userId, req.auth!.userId)));
    await notifyUsers(
      db,
      others.map((o) => o.userId),
      {
        type: 'LIST_SHARED',
        title: `${req.auth!.name} joined ${list.name}`,
        body: 'You can now shop this list together.',
        data: { listId: list.id },
      },
    );
  }
  res.json(await loadList(list.id, null));
});

listsRouter.get('/:listId', async (req, res) => {
  const listId = parse(IdSchema, req.params.listId);
  const { storeId } = parse(StoreContextQuery, req.query);
  await requireMembership(listId, req.auth!.userId);
  res.json(await loadList(listId, storeId ?? null));
});

listsRouter.patch('/:listId', async (req, res) => {
  const listId = parse(IdSchema, req.params.listId);
  const input = parse(UpdateListSchema, req.body);
  await requireMembership(listId, req.auth!.userId);
  await db
    .update(shoppingLists)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.emoji !== undefined ? { emoji: input.emoji } : {}),
      ...(input.storeId !== undefined ? { storeId: input.storeId } : {}),
    })
    .where(eq(shoppingLists.id, listId));
  await publishListChange(listId, 'LIST_UPDATED', { id: req.auth!.userId, name: req.auth!.name });
  res.json(await loadList(listId, null));
});

listsRouter.delete('/:listId', async (req, res) => {
  const listId = parse(IdSchema, req.params.listId);
  const { role } = await requireMembership(listId, req.auth!.userId);
  if (role !== 'OWNER') throw forbidden('Only the owner can delete this list');
  const members = await db.select({ userId: listMembers.userId }).from(listMembers).where(eq(listMembers.listId, listId));
  await db.delete(shoppingLists).where(eq(shoppingLists.id, listId));
  await publishListChange(
    listId,
    'LIST_DELETED',
    { id: req.auth!.userId, name: req.auth!.name },
    {},
    members.map((m) => m.userId),
  );
  res.status(204).end();
});

// --- Items -----------------------------------------------------------------------

listsRouter.post('/:listId/items', async (req, res) => {
  const listId = parse(IdSchema, req.params.listId);
  const { storeId } = parse(StoreContextQuery, req.query);
  const input = parse(AddListItemSchema, req.body);
  const { list } = await requireMembership(listId, req.auth!.userId);
  let name = input.name;
  if (input.productId) {
    const [product] = await db.select({ name: products.name }).from(products).where(eq(products.id, input.productId)).limit(1);
    if (!product) throw notFound('Product');
    name = product.name;
    const [existing] = await db
      .select()
      .from(listItems)
      .where(and(eq(listItems.listId, listId), eq(listItems.productId, input.productId), eq(listItems.isChecked, false)))
      .limit(1);
    if (existing) {
      await db
        .update(listItems)
        .set({ quantity: Math.min(99, existing.quantity + input.quantity) })
        .where(eq(listItems.id, existing.id));
      const item = await serializeItem(existing.id, listId, storeId ?? list.storeId);
      await publishListChange(listId, 'ITEM_UPDATED', { id: req.auth!.userId, name: req.auth!.name }, { item });
      res.json(item);
      return;
    }
  }
  const [row] = await db
    .insert(listItems)
    .values({
      listId,
      productId: input.productId ?? null,
      name: name!,
      quantity: input.quantity,
      note: input.note ?? null,
      addedById: req.auth!.userId,
    })
    .returning();
  const item = await serializeItem(row!.id, listId, storeId ?? list.storeId);
  await publishListChange(listId, 'ITEM_ADDED', { id: req.auth!.userId, name: req.auth!.name }, { item });
  const others = await db
    .select({ userId: listMembers.userId })
    .from(listMembers)
    .where(and(eq(listMembers.listId, listId), ne(listMembers.userId, req.auth!.userId)));
  await notifyUsers(
    db,
    others.map((o) => o.userId),
    {
      type: 'LIST_ITEM_ADDED',
      title: `${req.auth!.name.split(' ')[0]} added ${item.name}`,
      body: `to ${list.name}${item.product?.location ? ` · Aisle ${item.product.location.aisle}, Row ${item.product.location.row}` : ''}`,
      data: { listId, itemId: item.id },
    },
  );
  res.status(201).json(item);
});

listsRouter.patch('/:listId/items/:itemId', async (req, res) => {
  const listId = parse(IdSchema, req.params.listId);
  const itemId = parse(IdSchema, req.params.itemId);
  const { storeId } = parse(StoreContextQuery, req.query);
  const input = parse(UpdateListItemSchema, req.body);
  const { list } = await requireMembership(listId, req.auth!.userId);
  const patch: Partial<typeof listItems.$inferInsert> = {};
  if (input.quantity !== undefined) patch.quantity = input.quantity;
  if (input.note !== undefined) patch.note = input.note;
  if (input.name !== undefined) patch.name = input.name;
  if (input.productId !== undefined) {
    patch.productId = input.productId;
    if (input.productId) {
      const [product] = await db.select({ name: products.name }).from(products).where(eq(products.id, input.productId)).limit(1);
      if (!product) throw notFound('Product');
      patch.name = product.name;
    }
  }
  if (input.isChecked !== undefined) {
    patch.isChecked = input.isChecked;
    patch.checkedById = input.isChecked ? req.auth!.userId : null;
    patch.checkedAt = input.isChecked ? new Date() : null;
  }
  const [updated] = await db
    .update(listItems)
    .set(patch)
    .where(and(eq(listItems.id, itemId), eq(listItems.listId, listId)))
    .returning();
  if (!updated) throw notFound('List item');
  const item = await serializeItem(itemId, listId, storeId ?? list.storeId);
  await publishListChange(listId, 'ITEM_UPDATED', { id: req.auth!.userId, name: req.auth!.name }, { item });
  res.json(item);
});

listsRouter.delete('/:listId/items/:itemId', async (req, res) => {
  const listId = parse(IdSchema, req.params.listId);
  const itemId = parse(IdSchema, req.params.itemId);
  await requireMembership(listId, req.auth!.userId);
  const deleted = await db
    .delete(listItems)
    .where(and(eq(listItems.id, itemId), eq(listItems.listId, listId)))
    .returning({ id: listItems.id });
  if (deleted.length === 0) throw notFound('List item');
  await publishListChange(listId, 'ITEM_REMOVED', { id: req.auth!.userId, name: req.auth!.name }, { itemId });
  res.status(204).end();
});

/** Removes every checked item (after a shopping trip). */
listsRouter.post('/:listId/clear-checked', async (req, res) => {
  const listId = parse(IdSchema, req.params.listId);
  await requireMembership(listId, req.auth!.userId);
  await db.delete(listItems).where(and(eq(listItems.listId, listId), eq(listItems.isChecked, true)));
  await publishListChange(listId, 'LIST_UPDATED', { id: req.auth!.userId, name: req.auth!.name });
  res.json(await loadList(listId, null));
});

// --- Members ---------------------------------------------------------------------

listsRouter.post('/:listId/invite', async (req, res) => {
  const listId = parse(IdSchema, req.params.listId);
  const { contact } = parse(InviteToListSchema, req.body);
  const { list } = await requireMembership(listId, req.auth!.userId);
  const isEmail = contact.includes('@');
  const value = isEmail ? contact.toLowerCase() : normalizePhone(contact);
  const [invitee] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.kind, 'CUSTOMER'), isEmail ? eq(users.email, value) : eq(users.phone, value)))
    .limit(1);
  if (!invitee) {
    throw notFound(`SmartCart account for ${contact}. Share the invite code ${list.shareCode} instead`);
  }
  const inserted = await db.insert(listMembers).values({ listId, userId: invitee.id, role: 'EDITOR' }).onConflictDoNothing().returning();
  if (inserted.length === 0) throw conflict(`${invitee.name} is already on this list`);
  const member = ((await listMembersOf(db, [listId])).get(listId) ?? []).find((m) => m.userId === invitee.id);
  await publishListChange(listId, 'MEMBER_JOINED', { id: req.auth!.userId, name: req.auth!.name }, { member });
  await notifyUsers(db, [invitee.id], {
    type: 'LIST_SHARED',
    title: `${req.auth!.name} shared "${list.name}" with you`,
    body: 'Add items from home and they appear instantly for whoever is at the store.',
    data: { listId },
  });
  res.json(await loadList(listId, null));
});

listsRouter.delete('/:listId/members/:userId', async (req, res) => {
  const listId = parse(IdSchema, req.params.listId);
  const memberId = parse(IdSchema, req.params.userId);
  const { list, role } = await requireMembership(listId, req.auth!.userId);
  const self = memberId === req.auth!.userId;
  if (!self && role !== 'OWNER') throw forbidden('Only the owner can remove members');
  if (memberId === list.ownerId) throw forbidden('The owner cannot leave their own list; delete it instead');
  const leaving = ((await listMembersOf(db, [listId])).get(listId) ?? []).find((m) => m.userId === memberId);
  if (!leaving) throw notFound('List member');
  const recipients = (await db.select({ userId: listMembers.userId }).from(listMembers).where(eq(listMembers.listId, listId))).map(
    (m) => m.userId,
  );
  await db.delete(listMembers).where(and(eq(listMembers.listId, listId), eq(listMembers.userId, memberId)));
  await publishListChange(listId, 'MEMBER_LEFT', { id: req.auth!.userId, name: req.auth!.name }, { member: leaving }, recipients);
  res.status(204).end();
});
