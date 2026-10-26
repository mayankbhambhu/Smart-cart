import {
  SocketEvents,
  TICKET_STATUS_LABELS,
  type CreateTicketInput,
  type StaffRole,
  type Ticket,
  type TicketMessage,
  type TicketStatus,
  type UpdateTicketInput,
} from '@smartcart/shared';
import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db/client';
import { employees, stores, ticketMessages, tickets, users } from '../db/schema';
import { nextTicketNumber } from '../lib/counters';
import { conflict, notFound } from '../lib/errors';
import { transaction } from '../lib/tx';
import { broadcast } from '../realtime/emitter';
import { notifyUsers } from './notifications';

const raiser = alias(users, 'raiser');
const assignee = alias(users, 'assignee');

function ticketQuery() {
  return db
    .select({
      ticket: tickets,
      storeName: stores.name,
      storeCode: stores.code,
      raisedByName: raiser.name,
      assignedName: assignee.name,
      relatedName: employees.fullName,
      messageCount: sql<number>`(select count(*)::int from ${ticketMessages} m where m.ticket_id = ${tickets.id} and not m.is_internal)`,
    })
    .from(tickets)
    .innerJoin(stores, eq(stores.id, tickets.storeId))
    .innerJoin(raiser, eq(raiser.id, tickets.raisedById))
    .leftJoin(assignee, eq(assignee.id, tickets.assignedAdminId))
    .leftJoin(employees, eq(employees.id, tickets.relatedEmployeeId));
}

type TicketRow = Awaited<ReturnType<typeof ticketQuery>>[number];

function serialize(row: TicketRow, messages: TicketMessage[]): Ticket {
  const t = row.ticket;
  return {
    id: t.id,
    ticketNumber: t.ticketNumber,
    storeId: t.storeId,
    storeName: row.storeName,
    storeCode: row.storeCode,
    category: t.category,
    priority: t.priority,
    status: t.status,
    subject: t.subject,
    description: t.description,
    raisedBy: { id: t.raisedById, name: row.raisedByName, role: t.raisedByRole },
    assignedAdmin: t.assignedAdminId && row.assignedName ? { id: t.assignedAdminId, name: row.assignedName } : null,
    relatedEmployee: t.relatedEmployeeId && row.relatedName ? { id: t.relatedEmployeeId, name: row.relatedName } : null,
    messageCount: row.messageCount,
    messages,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
  };
}

export async function listTickets(filter: { storeId?: string; statuses?: TicketStatus[]; category?: string; limit?: number; offset?: number }) {
  const conditions: SQL[] = [];
  if (filter.storeId) conditions.push(eq(tickets.storeId, filter.storeId));
  if (filter.statuses && filter.statuses.length > 0) conditions.push(inArray(tickets.status, filter.statuses));
  if (filter.category) conditions.push(sql`${tickets.category} = ${filter.category}`);
  const rows = await ticketQuery()
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(
      sql`case ${tickets.status} when 'OPEN' then 0 when 'IN_PROGRESS' then 1 when 'WAITING_ON_STORE' then 2 else 3 end`,
      sql`case ${tickets.priority} when 'URGENT' then 0 when 'HIGH' then 1 when 'MEDIUM' then 2 else 3 end`,
      desc(tickets.updatedAt),
    )
    .limit(filter.limit ?? 100)
    .offset(filter.offset ?? 0);
  return rows.map((r) => serialize(r, []));
}

export async function loadTicket(ticketId: string, includeInternal: boolean): Promise<Ticket> {
  const [row] = await ticketQuery().where(eq(tickets.id, ticketId)).limit(1);
  if (!row) throw notFound('Ticket');
  const messages = await db
    .select({ message: ticketMessages, authorName: users.name })
    .from(ticketMessages)
    .innerJoin(users, eq(users.id, ticketMessages.authorId))
    .where(and(eq(ticketMessages.ticketId, ticketId), includeInternal ? undefined : eq(ticketMessages.isInternal, false)))
    .orderBy(asc(ticketMessages.createdAt));
  return serialize(
    row,
    messages.map(({ message, authorName }) => ({
      id: message.id,
      author: { id: message.authorId, name: authorName, side: message.side },
      body: message.body,
      isInternal: message.isInternal,
      createdAt: message.createdAt.toISOString(),
    })),
  );
}

async function adminRecipients(): Promise<string[]> {
  const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.kind, 'ADMIN'), eq(users.status, 'ACTIVE')));
  return admins.map((a) => a.id);
}

export async function createTicket(
  storeId: string,
  actor: { userId: string; name: string; role: StaffRole },
  input: CreateTicketInput,
): Promise<Ticket> {
  if (input.relatedEmployeeId) {
    const [employee] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.id, input.relatedEmployeeId), eq(employees.storeId, storeId)))
      .limit(1);
    if (!employee) throw notFound('Employee in this store');
  }
  const id = await transaction(async (tx, afterCommit) => {
    const [ticket] = await tx
      .insert(tickets)
      .values({
        ticketNumber: await nextTicketNumber(tx),
        storeId,
        raisedById: actor.userId,
        raisedByRole: actor.role,
        category: input.category,
        priority: input.priority ?? 'MEDIUM',
        subject: input.subject,
        description: input.description,
        relatedEmployeeId: input.relatedEmployeeId ?? null,
      })
      .returning();
    await notifyUsers(
      tx,
      await adminRecipients(),
      {
        type: 'TICKET_UPDATE',
        title: `New ${input.priority === 'URGENT' || input.priority === 'HIGH' ? 'priority ' : ''}request ${ticket!.ticketNumber}`,
        body: input.subject,
        data: { ticketId: ticket!.id, storeId },
      },
      afterCommit,
    );
    afterCommit(() => broadcast.toAdmins(SocketEvents.TICKET_CHANGED, { ticketId: ticket!.id }));
    return ticket!.id;
  });
  return loadTicket(id, false);
}

export async function addMessage(
  ticketId: string,
  author: { userId: string; name: string; side: 'STORE' | 'ADMIN' },
  body: string,
  isInternal: boolean,
): Promise<Ticket> {
  await transaction(async (tx, afterCommit) => {
    const [ticket] = await tx.select().from(tickets).where(eq(tickets.id, ticketId)).for('update');
    if (!ticket) throw notFound('Ticket');
    if (ticket.status === 'CLOSED') throw conflict('This request is closed');
    await tx.insert(ticketMessages).values({ ticketId, authorId: author.userId, side: author.side, body, isInternal: author.side === 'ADMIN' && isInternal });
    // A store reply re-opens a ticket that was waiting on the store.
    const nextStatus: TicketStatus | null =
      author.side === 'STORE' && (ticket.status === 'WAITING_ON_STORE' || ticket.status === 'RESOLVED')
        ? 'IN_PROGRESS'
        : author.side === 'ADMIN' && ticket.status === 'OPEN' && !isInternal
          ? 'IN_PROGRESS'
          : null;
    await tx
      .update(tickets)
      .set({ updatedAt: new Date(), ...(nextStatus ? { status: nextStatus } : {}) })
      .where(eq(tickets.id, ticketId));
    if (!(author.side === 'ADMIN' && isInternal)) {
      const recipients = author.side === 'ADMIN' ? [ticket.raisedById] : ticket.assignedAdminId ? [ticket.assignedAdminId] : await adminRecipients();
      await notifyUsers(
        tx,
        recipients,
        {
          type: 'TICKET_UPDATE',
          title: `${author.name} replied on ${ticket.ticketNumber}`,
          body: body.length > 120 ? `${body.slice(0, 117)}...` : body,
          data: { ticketId, storeId: ticket.storeId },
        },
        afterCommit,
      );
    }
    afterCommit(() => {
      broadcast.toAdmins(SocketEvents.TICKET_CHANGED, { ticketId });
      broadcast.toStoreOps(ticket.storeId, SocketEvents.TICKET_CHANGED, { ticketId });
    });
  });
  return loadTicket(ticketId, author.side === 'ADMIN');
}

export async function updateTicket(ticketId: string, actor: { userId: string; name: string }, input: UpdateTicketInput): Promise<Ticket> {
  await transaction(async (tx, afterCommit) => {
    const [ticket] = await tx.select().from(tickets).where(eq(tickets.id, ticketId)).for('update');
    if (!ticket) throw notFound('Ticket');
    const resolved = input.status === 'RESOLVED' || input.status === 'CLOSED';
    await tx
      .update(tickets)
      .set({
        ...(input.status ? { status: input.status, resolvedAt: resolved ? (ticket.resolvedAt ?? new Date()) : null } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.assignedAdminId !== undefined ? { assignedAdminId: input.assignedAdminId } : {}),
      })
      .where(eq(tickets.id, ticketId));
    if (input.status && input.status !== ticket.status) {
      await notifyUsers(
        tx,
        [ticket.raisedById],
        {
          type: 'TICKET_UPDATE',
          title: `${ticket.ticketNumber}: ${TICKET_STATUS_LABELS[input.status]}`,
          body: `${ticket.subject} · updated by ${actor.name}`,
          data: { ticketId, storeId: ticket.storeId },
        },
        afterCommit,
      );
    }
    afterCommit(() => {
      broadcast.toAdmins(SocketEvents.TICKET_CHANGED, { ticketId });
      broadcast.toStoreOps(ticket.storeId, SocketEvents.TICKET_CHANGED, { ticketId });
    });
  });
  return loadTicket(ticketId, true);
}
