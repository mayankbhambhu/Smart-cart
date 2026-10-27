import {
  AdminUpdateStoreSchema,
  AuditQuerySchema,
  CreateStoreSchema,
  CredentialRequestsQuerySchema,
  EmployeesQuerySchema,
  IdSchema,
  IsoDateSchema,
  OffboardEmployeeSchema,
  ReviewDecisionSchema,
  TicketMessageSchema,
  TicketsQuerySchema,
  UpdateTicketSchema,
  generateLayout,
  type AdminOverview,
  type AdminStoreDetail,
  type AdminStoreRow,
  type AuditLogEntry,
  type CreatedStore,
  type Device,
  type IssuedCredentials,
} from '@smartcart/shared';
import { and, asc, desc, eq, gte, inArray, sql, type SQL } from 'drizzle-orm';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { auditLogs, credentialRequests, devices, employees, products, storeProducts, stores, tickets, users } from '../../db/schema';
import { audit } from '../../lib/audit';
import { nextEmployeeCode } from '../../lib/counters';
import { hashPassword, randomToken, temporaryPassword } from '../../lib/crypto';
import { conflict, notFound } from '../../lib/errors';
import { addDays, zonedParts } from '../../lib/time';
import { parse } from '../../lib/validate';
import { requireAdmin } from '../../middleware/auth';
import * as analytics from '../../services/analytics';
import { revokeAllSessions } from '../../services/auth';
import { getStore, serializeStore, serializeStoreDetail } from '../../services/stores';
import { adminReview, getEmployee, listEmployees, listRequests, loadRequest, offboardEmployee, uniqueUsername } from '../../services/team';
import { addMessage, listTickets, loadTicket, updateTicket } from '../../services/tickets';
import { DEFAULT_STORE_SETTINGS, resolveSettings } from '../stores/settings';
import { env } from '../../config/env';

/** The SmartCart team's console: onboarding approvals, stores, employees and store requests. */
export const adminRouter = Router();
adminRouter.use(requireAdmin());

const managers = requireAdmin('SUPER_ADMIN', 'ADMIN');
const TIMEZONE = 'Asia/Kolkata';

function actor(req: Request) {
  return { userId: req.auth!.userId, name: req.auth!.name };
}

// --- Overview -------------------------------------------------------------------------------

adminRouter.get('/overview', async (_req, res) => {
  const today = zonedParts(new Date(), TIMEZONE).date;
  const range30 = { storeId: null, from: addDays(today, -29), to: today, timezone: TIMEZONE };
  const [storeCounts] = await db
    .select({ total: sql<number>`count(*)::int`, active: sql<number>`count(*) filter (where ${stores.status} = 'ACTIVE')::int` })
    .from(stores);
  const [employeeCounts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${employees.status} in ('ACTIVE', 'ON_LEAVE'))::int`,
    })
    .from(employees);
  const [customers] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.kind, 'CUSTOMER'));
  const [pending] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(credentialRequests)
    .where(eq(credentialRequests.status, 'PENDING_ADMIN'));
  const [openTickets] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tickets)
    .where(inArray(tickets.status, ['OPEN', 'IN_PROGRESS', 'WAITING_ON_STORE']));
  const [todaySummary, last30, trend] = await Promise.all([
    analytics.summary({ ...range30, from: today }),
    analytics.summary(range30),
    analytics.trend(range30, 'day'),
  ]);
  const byStore = await db.execute<{ store_id: string; name: string; code: string; net: number; orders: number }>(sql`
    select s.id as store_id, s.name, s.code,
           coalesce(sum(o.item_total - o.coupon_discount), 0)::float8 as net, count(o.id)::int as orders
    from stores s
    left join orders o on o.store_id = s.id and o.status <> 'CANCELLED' and o.placed_at >= ${new Date(Date.now() - 30 * 86_400_000)}
    group by s.id order by net desc`);
  const body: AdminOverview = {
    stores: { total: storeCounts?.total ?? 0, active: storeCounts?.active ?? 0 },
    employees: { total: employeeCounts?.total ?? 0, active: employeeCounts?.active ?? 0 },
    customers: customers?.count ?? 0,
    pendingRequests: pending?.count ?? 0,
    openTickets: openTickets?.count ?? 0,
    today: { netSales: todaySummary.netSales, orders: todaySummary.orders },
    last30: { netSales: last30.netSales, orders: last30.orders, grossProfit: last30.grossProfit },
    salesByStore: byStore.rows.map((r) => ({
      storeId: r.store_id,
      storeName: r.name,
      storeCode: r.code,
      netSales: r.net,
      orders: r.orders,
    })),
    trend,
  };
  res.json(body);
});

// --- Login (credential) requests ---------------------------------------------------------------

adminRouter.get('/requests', async (req, res) => {
  const query = parse(CredentialRequestsQuerySchema, req.query);
  res.json(await listRequests({ statuses: query.status, storeId: query.storeId, q: query.q, limit: query.limit, offset: query.offset }));
});

adminRouter.get('/requests/:requestId', async (req, res) => {
  const requestId = parse(IdSchema, req.params.requestId);
  res.json(await loadRequest(db, requestId));
});

/** Approve (issues credentials), send back for changes, or reject. */
adminRouter.post('/requests/:requestId/review', managers, async (req, res) => {
  const requestId = parse(IdSchema, req.params.requestId);
  const { decision, comment } = parse(ReviewDecisionSchema, req.body);
  res.json(await adminReview(requestId, actor(req), decision, comment, req.ip ?? null));
});

// --- Stores ---------------------------------------------------------------------------------------

async function storeRows(): Promise<AdminStoreRow[]> {
  const rows = await db.select().from(stores).orderBy(asc(stores.name));
  const since = new Date(Date.now() - 30 * 86_400_000);
  const stats = await db.execute<{
    store_id: string;
    employees: number;
    active_employees: number;
    wage_bill: number;
    net: number;
    orders: number;
    open_tickets: number;
    pending_requests: number;
  }>(sql`
    select s.id as store_id,
      (select count(*) from employees e where e.store_id = s.id)::int as employees,
      (select count(*) from employees e where e.store_id = s.id and e.status in ('ACTIVE', 'ON_LEAVE'))::int as active_employees,
      (select coalesce(sum(case e.wage_type when 'MONTHLY' then e.wage_amount when 'DAILY' then e.wage_amount * 26 else e.wage_amount * 208 end), 0)
         from employees e where e.store_id = s.id and e.status in ('ACTIVE', 'ON_LEAVE'))::float8 as wage_bill,
      (select coalesce(sum(o.item_total - o.coupon_discount), 0) from orders o where o.store_id = s.id and o.status <> 'CANCELLED' and o.placed_at >= ${since})::float8 as net,
      (select count(*) from orders o where o.store_id = s.id and o.status <> 'CANCELLED' and o.placed_at >= ${since})::int as orders,
      (select count(*) from tickets t where t.store_id = s.id and t.status in ('OPEN', 'IN_PROGRESS', 'WAITING_ON_STORE'))::int as open_tickets,
      (select count(*) from credential_requests r where r.store_id = s.id and r.status in ('PENDING_OWNER', 'PENDING_ADMIN'))::int as pending_requests
    from stores s`);
  const owners = await db
    .select({ storeId: employees.storeId, userId: users.id, name: users.name, email: users.email, phone: users.phone })
    .from(employees)
    .innerJoin(users, eq(users.id, employees.userId))
    .where(and(eq(employees.role, 'OWNER'), inArray(employees.status, ['ACTIVE', 'ON_LEAVE'])));
  return rows.map((store) => {
    const s = stats.rows.find((r) => r.store_id === store.id);
    const owner = owners.find((o) => o.storeId === store.id);
    return {
      ...serializeStore(store),
      owner: owner ? { userId: owner.userId, name: owner.name, email: owner.email, phone: owner.phone } : null,
      employeeCount: s?.employees ?? 0,
      activeEmployeeCount: s?.active_employees ?? 0,
      monthlyWageBill: s?.wage_bill ?? 0,
      netSales30d: s?.net ?? 0,
      orders30d: s?.orders ?? 0,
      openTickets: s?.open_tickets ?? 0,
      pendingRequests: s?.pending_requests ?? 0,
    };
  });
}

adminRouter.get('/stores', async (_req, res) => {
  res.json(await storeRows());
});

adminRouter.get('/stores/:storeId', async (req, res) => {
  const storeId = parse(IdSchema, req.params.storeId);
  const store = await getStore(db, storeId);
  const row = (await storeRows()).find((r) => r.id === storeId)!;
  const { items: team } = await listEmployees(db, { storeId, statuses: ['ACTIVE', 'ON_LEAVE', 'LEFT', 'TERMINATED'] }, true);
  const deviceRows = await db.select().from(devices).where(eq(devices.storeId, storeId)).orderBy(asc(devices.type), asc(devices.name));
  const today = zonedParts(new Date(), store.timezone).date;
  const last30 = await analytics.summary({ storeId, from: addDays(today, -29), to: today, timezone: store.timezone });
  const body: AdminStoreDetail = {
    store: { ...serializeStoreDetail(store), settings: resolveSettings(store.settings) },
    owner: row.owner,
    employees: team,
    devices: deviceRows.map((d): Device => ({
      id: d.id,
      storeId: d.storeId,
      type: d.type,
      name: d.name,
      apiKeyPrefix: d.apiKeyPrefix,
      isActive: d.isActive,
      lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
    })),
    stats: {
      netSales30d: last30.netSales,
      orders30d: last30.orders,
      grossProfit30d: last30.grossProfit,
      openTickets: row.openTickets,
      pendingRequests: row.pendingRequests,
    },
  };
  res.json(body);
});

/** Onboards a new store: profile, floor plan, catalogue and the owner's login. */
adminRouter.post('/stores', managers, async (req, res) => {
  const input = parse(CreateStoreSchema, req.body);
  const [existing] = await db.select({ id: stores.id }).from(stores).where(eq(stores.code, input.code)).limit(1);
  if (existing) throw conflict(`Store code ${input.code} is already taken`);
  let ownerCredentials: IssuedCredentials | null = null;

  const storeId = await db.transaction(async (tx) => {
    const aisles = input.aisles ?? [
      { label: 'Fruits & Vegetables' },
      { label: 'Dairy, Bread & Eggs' },
      { label: 'Bakery & Breakfast' },
      { label: 'Snacks & Sweets' },
      { label: 'Beverages' },
      { label: 'Staples & Masala' },
      { label: 'Sauces & Organic' },
      { label: 'Meat, Fish & Frozen' },
      { label: 'Personal & Baby Care' },
      { label: 'Home & Pet Care' },
    ];
    const layout = generateLayout({ aisles });
    const [store] = await tx
      .insert(stores)
      .values({
        code: input.code,
        name: input.name,
        addressLine: input.addressLine,
        city: input.city,
        state: input.state,
        pincode: input.pincode,
        lat: input.lat,
        lng: input.lng,
        phone: input.phone,
        email: input.email ?? null,
        openingTime: input.openingTime,
        closingTime: input.closingTime,
        status: 'ONBOARDING',
        layout,
        settings: DEFAULT_STORE_SETTINGS,
        kioskSecret: randomToken(24),
      })
      .returning();

    let ownerUserId = input.ownerUserId ?? null;
    let ownerName = '';
    let ownerEmail: string | null = null;
    let ownerPhone: string | null = null;
    if (input.newOwner) {
      const password = temporaryPassword();
      const [taken] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.kind, 'STAFF'), eq(users.email, input.newOwner.email)))
        .limit(1);
      if (taken) throw conflict('A staff account with this email already exists; link it as the owner instead');
      const username = await uniqueUsername(tx, input.newOwner.fullName);
      const [owner] = await tx
        .insert(users)
        .values({
          kind: 'STAFF',
          name: input.newOwner.fullName,
          email: input.newOwner.email,
          phone: input.newOwner.phone,
          username,
          passwordHash: await hashPassword(password),
          mustChangePassword: true,
        })
        .returning();
      ownerUserId = owner!.id;
      ownerName = owner!.name;
      ownerEmail = owner!.email;
      ownerPhone = owner!.phone;
      ownerCredentials = {
        employeeId: '',
        employeeCode: '',
        username,
        temporaryPassword: password,
        loginUrl: `${env.PUBLIC_WEB_URL}/ops/login`,
      };
    } else {
      const [owner] = await tx
        .select()
        .from(users)
        .where(and(eq(users.id, ownerUserId!), eq(users.kind, 'STAFF')))
        .limit(1);
      if (!owner) throw notFound('Owner account');
      ownerName = owner.name;
      ownerEmail = owner.email;
      ownerPhone = owner.phone;
    }
    const employeeCode = await nextEmployeeCode(tx, store!.code);
    const [ownerEmployee] = await tx
      .insert(employees)
      .values({
        userId: ownerUserId,
        storeId: store!.id,
        employeeCode,
        fullName: ownerName,
        email: ownerEmail,
        phone: ownerPhone,
        role: 'OWNER',
        department: 'MANAGEMENT',
        designation: 'Franchise owner',
        joiningDate: new Date().toISOString().slice(0, 10),
        wageType: 'MONTHLY',
        wageAmount: 0,
      })
      .returning();
    if (ownerCredentials) {
      ownerCredentials = { ...(ownerCredentials as IssuedCredentials), employeeId: ownerEmployee!.id, employeeCode };
    }

    if (input.stockCatalog) {
      const catalogue = await tx.select().from(products).where(eq(products.isActive, true));
      const perAisle = new Map<number, number>();
      const values = catalogue.map((p, i) => {
        const aisle = 1 + (i % layout.aisles.length);
        const index = perAisle.get(aisle) ?? 0;
        perAisle.set(aisle, index + 1);
        return {
          storeId: store!.id,
          productId: p.id,
          price: p.defaultPrice,
          cost: p.defaultCost,
          shelfQty: 0,
          storageQty: 0,
          aisle,
          row: 1 + (Math.floor(index / 4) % layout.aisles[0]!.rows),
          shelf: 1 + (index % 5),
        };
      });
      if (values.length > 0) await tx.insert(storeProducts).values(values);
    }
    await audit(tx, {
      actorId: req.auth!.userId,
      actorKind: 'ADMIN',
      actorName: req.auth!.name,
      action: 'STORE_CREATED',
      entityType: 'store',
      entityId: store!.id,
      storeId: store!.id,
      metadata: { code: store!.code, owner: ownerName },
      ip: req.ip,
    });
    return store!.id;
  });

  const body: CreatedStore = { store: serializeStoreDetail(await getStore(db, storeId)), ownerCredentials };
  res.status(201).json(body);
});

adminRouter.patch('/stores/:storeId', managers, async (req, res) => {
  const storeId = parse(IdSchema, req.params.storeId);
  const input = parse(AdminUpdateStoreSchema, req.body);
  const [updated] = await db.update(stores).set(input).where(eq(stores.id, storeId)).returning();
  if (!updated) throw notFound('Store');
  await audit(db, {
    actorId: req.auth!.userId,
    actorKind: 'ADMIN',
    actorName: req.auth!.name,
    action: 'STORE_UPDATED',
    entityType: 'store',
    entityId: storeId,
    storeId,
    metadata: input as Record<string, unknown>,
    ip: req.ip,
  });
  res.json(serializeStoreDetail(updated));
});

// --- Employees -------------------------------------------------------------------------------------

adminRouter.get('/employees', async (req, res) => {
  const query = parse(EmployeesQuerySchema, req.query);
  res.json(
    await listEmployees(
      db,
      { storeId: query.storeId, role: query.role, statuses: query.status, q: query.q, limit: query.limit, offset: query.offset },
      true,
    ),
  );
});

adminRouter.get('/employees/:employeeId', async (req, res) => {
  const employeeId = parse(IdSchema, req.params.employeeId);
  res.json(await getEmployee(employeeId, true));
});

/** "Delete account": revokes the login of an employee who left or was fired; history is kept. */
adminRouter.post('/employees/:employeeId/offboard', managers, async (req, res) => {
  const employeeId = parse(IdSchema, req.params.employeeId);
  const input = parse(OffboardEmployeeSchema, req.body);
  res.json(await offboardEmployee(employeeId, input, { ...actor(req), kind: 'ADMIN' }, req.ip ?? null));
});

/** Issues a new temporary password (forces a change at next sign-in). */
adminRouter.post('/employees/:employeeId/reset-password', managers, async (req, res) => {
  const employeeId = parse(IdSchema, req.params.employeeId);
  const employee = await getEmployee(employeeId, false);
  if (!employee.userId || (employee.status !== 'ACTIVE' && employee.status !== 'ON_LEAVE')) {
    throw conflict('This employee has no active login');
  }
  const password = temporaryPassword();
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), mustChangePassword: true, status: 'ACTIVE' })
    .where(eq(users.id, employee.userId));
  await revokeAllSessions(db, employee.userId);
  await audit(db, {
    actorId: req.auth!.userId,
    actorKind: 'ADMIN',
    actorName: req.auth!.name,
    action: 'PASSWORD_RESET',
    entityType: 'employee',
    entityId: employeeId,
    storeId: employee.storeId,
    ip: req.ip,
  });
  const body: IssuedCredentials = {
    employeeId,
    employeeCode: employee.employeeCode,
    username: employee.username ?? '',
    temporaryPassword: password,
    loginUrl: `${env.PUBLIC_WEB_URL}/ops/login`,
  };
  res.json(body);
});

// --- Store requests (tickets) ----------------------------------------------------------------------

adminRouter.get('/tickets', async (req, res) => {
  const query = parse(TicketsQuerySchema, req.query);
  res.json(
    await listTickets({
      storeId: query.storeId,
      statuses: query.status,
      category: query.category,
      limit: query.limit,
      offset: query.offset,
    }),
  );
});

adminRouter.get('/tickets/:ticketId', async (req, res) => {
  const ticketId = parse(IdSchema, req.params.ticketId);
  res.json(await loadTicket(ticketId, true));
});

adminRouter.patch('/tickets/:ticketId', async (req, res) => {
  const ticketId = parse(IdSchema, req.params.ticketId);
  res.json(await updateTicket(ticketId, actor(req), parse(UpdateTicketSchema, req.body)));
});

adminRouter.post('/tickets/:ticketId/messages', async (req, res) => {
  const ticketId = parse(IdSchema, req.params.ticketId);
  const input = parse(TicketMessageSchema, req.body);
  res.json(await addMessage(ticketId, { ...actor(req), side: 'ADMIN' }, input.body, input.isInternal ?? false));
});

// --- Admin team & audit trail -------------------------------------------------------------------------

adminRouter.get('/admins', async (_req, res) => {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, adminRole: users.adminRole, lastLoginAt: users.lastLoginAt })
    .from(users)
    .where(and(eq(users.kind, 'ADMIN'), eq(users.status, 'ACTIVE')))
    .orderBy(asc(users.name));
  res.json(rows.map((r) => ({ ...r, lastLoginAt: r.lastLoginAt?.toISOString() ?? null })));
});

adminRouter.get('/audit', async (req, res) => {
  const query = parse(AuditQuerySchema, req.query);
  const conditions: SQL[] = [];
  if (query.storeId) conditions.push(eq(auditLogs.storeId, query.storeId));
  if (query.action) conditions.push(eq(auditLogs.action, query.action));
  const rows = await db
    .select({ log: auditLogs, storeName: stores.name })
    .from(auditLogs)
    .leftJoin(stores, eq(stores.id, auditLogs.storeId))
    .where(conditions.length > 0 ? and(...conditions) : gte(auditLogs.createdAt, new Date(Date.now() - 90 * 86_400_000)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(query.limit)
    .offset(query.offset);
  const body: AuditLogEntry[] = rows.map(({ log, storeName }) => ({
    id: log.id,
    actorName: log.actorName,
    actorKind: log.actorKind as AuditLogEntry['actorKind'],
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    storeName,
    metadata: log.metadata,
    ip: log.ip,
    createdAt: log.createdAt.toISOString(),
  }));
  res.json(body);
});

/** Platform-wide analytics (all stores), same shape as a store's analytics. */
adminRouter.get('/analytics/top-products', async (req, res) => {
  const today = zonedParts(new Date(), TIMEZONE).date;
  const query = parse(z.object({ from: IsoDateSchema.default(addDays(today, -29)), to: IsoDateSchema.default(today) }), req.query);
  res.json(await analytics.topProducts({ storeId: null, from: query.from, to: query.to, timezone: TIMEZONE }, 'revenue', 10));
});
