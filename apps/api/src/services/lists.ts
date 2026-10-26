import {
  SocketEvents,
  type CatalogProduct,
  type ListItem,
  type ListMember,
  type ListUpdateAction,
  type ListUpdateEvent,
  type ShoppingList,
  type ShoppingListSummary,
} from '@smartcart/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, type Executor } from '../db/client';
import { listItems, listMembers, shoppingLists, users } from '../db/schema';
import { randomCode } from '../lib/crypto';
import { forbidden, notFound } from '../lib/errors';
import { broadcast, rooms } from '../realtime/emitter';
import { bestMatch, catalogProductsByIds, loadCatalogContext } from './catalog';

type ListRow = typeof shoppingLists.$inferSelect;
type ItemRow = typeof listItems.$inferSelect;

const addedBy = alias(users, 'added_by');
const checkedBy = alias(users, 'checked_by');

export async function generateShareCode(executor: Executor): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode(8);
    const [taken] = await executor.select({ id: shoppingLists.id }).from(shoppingLists).where(eq(shoppingLists.shareCode, code)).limit(1);
    if (!taken) return code;
  }
  throw new Error('Could not allocate a share code');
}

/** Loads a list and checks that the user is a member. */
export async function requireMembership(listId: string, userId: string): Promise<{ list: ListRow; role: 'OWNER' | 'EDITOR' }> {
  const [row] = await db
    .select({ list: shoppingLists, role: listMembers.role })
    .from(shoppingLists)
    .innerJoin(listMembers, and(eq(listMembers.listId, shoppingLists.id), eq(listMembers.userId, userId)))
    .where(eq(shoppingLists.id, listId))
    .limit(1);
  if (!row) {
    const [exists] = await db.select({ id: shoppingLists.id }).from(shoppingLists).where(eq(shoppingLists.id, listId)).limit(1);
    if (!exists) throw notFound('List');
    throw forbidden('You are not a member of this list');
  }
  return row;
}

export async function listMembersOf(executor: Executor, listIds: string[]): Promise<Map<string, ListMember[]>> {
  if (listIds.length === 0) return new Map();
  const rows = await executor
    .select({
      listId: listMembers.listId,
      userId: listMembers.userId,
      role: listMembers.role,
      joinedAt: listMembers.joinedAt,
      name: users.name,
      avatarUrl: users.avatarUrl,
    })
    .from(listMembers)
    .innerJoin(users, eq(users.id, listMembers.userId))
    .where(inArray(listMembers.listId, listIds))
    .orderBy(asc(listMembers.joinedAt));
  const map = new Map<string, ListMember[]>();
  for (const r of rows) {
    const member: ListMember = { userId: r.userId, name: r.name, avatarUrl: r.avatarUrl, role: r.role, joinedAt: r.joinedAt.toISOString() };
    map.set(r.listId, [...(map.get(r.listId) ?? []), member]);
  }
  return map;
}

interface ItemQueryRow {
  item: ItemRow;
  addedByName: string;
  checkedByName: string | null;
}

async function itemRows(executor: Executor, listId: string, itemIds?: string[]): Promise<ItemQueryRow[]> {
  return executor
    .select({ item: listItems, addedByName: addedBy.name, checkedByName: checkedBy.name })
    .from(listItems)
    .innerJoin(addedBy, eq(addedBy.id, listItems.addedById))
    .leftJoin(checkedBy, eq(checkedBy.id, listItems.checkedById))
    .where(and(eq(listItems.listId, listId), itemIds ? inArray(listItems.id, itemIds) : undefined))
    .orderBy(asc(listItems.isChecked), asc(listItems.createdAt));
}

function toListItem(row: ItemQueryRow, product: CatalogProduct | null): ListItem {
  const { item } = row;
  return {
    id: item.id,
    listId: item.listId,
    productId: item.productId,
    name: item.name,
    quantity: item.quantity,
    note: item.note,
    isChecked: item.isChecked,
    checkedByName: row.checkedByName,
    checkedAt: item.checkedAt?.toISOString() ?? null,
    addedById: item.addedById,
    addedByName: row.addedByName,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    product: product
      ? {
          id: product.id,
          name: product.name,
          brand: product.brand,
          unit: product.unit,
          emoji: product.emoji,
          color: product.color,
          imageUrl: product.imageUrl,
          barcode: product.barcode,
          price: product.price,
          mrp: product.mrp,
          location: product.location,
          stockStatus: product.stockStatus,
        }
      : null,
  };
}

/**
 * Serializes items for a store: linked products get that store's price,
 * stock and aisle location; free-text items ("milk") are matched to the
 * closest product so the shopper still sees where to find them.
 */
async function serializeItems(rows: ItemQueryRow[], storeId: string | null): Promise<ListItem[]> {
  if (!storeId) return rows.map((r) => toListItem(r, null));
  const context = await loadCatalogContext(db, storeId);
  const linked = await catalogProductsByIds(
    db,
    storeId,
    rows.map((r) => r.item.productId).filter((id): id is string => Boolean(id)),
    context,
  );
  const result: ListItem[] = [];
  for (const row of rows) {
    let product = row.item.productId ? (linked.get(row.item.productId) ?? null) : null;
    if (!product && !row.item.productId) product = await bestMatch(db, storeId, row.item.name, context);
    result.push(toListItem(row, product));
  }
  return result;
}

export async function serializeItem(itemId: string, listId: string, storeId: string | null): Promise<ListItem> {
  const rows = await itemRows(db, listId, [itemId]);
  if (rows.length === 0) throw notFound('List item');
  return (await serializeItems(rows, storeId))[0]!;
}

export async function listSummaries(userId: string): Promise<ShoppingListSummary[]> {
  const rows = await db
    .select({
      list: shoppingLists,
      itemCount: sql<number>`(select count(*)::int from ${listItems} where ${listItems.listId} = ${shoppingLists.id})`,
      checkedCount: sql<number>`(select count(*)::int from ${listItems} where ${listItems.listId} = ${shoppingLists.id} and ${listItems.isChecked})`,
    })
    .from(shoppingLists)
    .innerJoin(listMembers, and(eq(listMembers.listId, shoppingLists.id), eq(listMembers.userId, userId)))
    .orderBy(sql`${shoppingLists.updatedAt} desc`);
  const members = await listMembersOf(
    db,
    rows.map((r) => r.list.id),
  );
  return rows.map((r) => summaryOf(r.list, r.itemCount, r.checkedCount, members.get(r.list.id) ?? []));
}

function summaryOf(list: ListRow, itemCount: number, checkedCount: number, members: ListMember[]): ShoppingListSummary {
  return {
    id: list.id,
    name: list.name,
    emoji: list.emoji,
    ownerId: list.ownerId,
    storeId: list.storeId,
    itemCount,
    checkedCount,
    members,
    updatedAt: list.updatedAt.toISOString(),
  };
}

export async function loadList(listId: string, storeId: string | null): Promise<ShoppingList> {
  const [list] = await db.select().from(shoppingLists).where(eq(shoppingLists.id, listId)).limit(1);
  if (!list) throw notFound('List');
  const contextStore = storeId ?? list.storeId;
  const items = await serializeItems(await itemRows(db, listId), contextStore);
  const members = (await listMembersOf(db, [listId])).get(listId) ?? [];
  const estimatedTotal = items.reduce((sum, item) => sum + (item.product ? item.product.price * item.quantity : 0), 0);
  return {
    ...summaryOf(
      list,
      items.length,
      items.filter((i) => i.isChecked).length,
      members,
    ),
    shareCode: list.shareCode,
    items,
    estimatedTotal,
    createdAt: list.createdAt.toISOString(),
  };
}

export async function summaryFor(listId: string): Promise<ShoppingListSummary> {
  const [list] = await db.select().from(shoppingLists).where(eq(shoppingLists.id, listId)).limit(1);
  if (!list) throw notFound('List');
  const [counts] = await db
    .select({
      itemCount: sql<number>`count(*)::int`,
      checkedCount: sql<number>`count(*) filter (where ${listItems.isChecked})::int`,
    })
    .from(listItems)
    .where(eq(listItems.listId, listId));
  const members = (await listMembersOf(db, [listId])).get(listId) ?? [];
  return summaryOf(list, counts?.itemCount ?? 0, counts?.checkedCount ?? 0, members);
}

/** Broadcasts a change to everyone viewing the list and touches its updated_at. */
export async function publishListChange(
  listId: string,
  action: ListUpdateAction,
  actor: { id: string; name: string },
  extra: Pick<ListUpdateEvent, 'item' | 'itemId' | 'member'> = {},
  /** Pass the members explicitly when the list (and its member rows) is being deleted. */
  memberIds?: string[],
): Promise<void> {
  if (action !== 'LIST_DELETED') {
    await db.update(shoppingLists).set({ updatedAt: new Date() }).where(eq(shoppingLists.id, listId));
  }
  const event: ListUpdateEvent = {
    listId,
    action,
    actor,
    at: new Date().toISOString(),
    ...extra,
    ...(action === 'LIST_DELETED' ? {} : { list: await summaryFor(listId) }),
  };
  const recipients =
    memberIds ?? (await db.select({ userId: listMembers.userId }).from(listMembers).where(eq(listMembers.listId, listId))).map((m) => m.userId);
  broadcast.toRooms([rooms.list(listId), ...recipients.map(rooms.user)], SocketEvents.LIST_UPDATED, event);
}
