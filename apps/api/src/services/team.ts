import {
  CREDENTIAL_REQUEST_ACTION_LABELS,
  SocketEvents,
  STAFF_ROLE_LABELS,
  type CandidateDetails,
  type CandidateInput,
  type CredentialRequest,
  type CredentialRequestAction,
  type CredentialRequestStatus,
  type Employee,
  type IssuedCredentials,
  type StaffRole,
} from '@smartcart/shared';
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { env } from '../config/env';
import { db, type Executor, type Transaction } from '../db/client';
import { credentialRequestEvents, credentialRequests, employees, stores, users } from '../db/schema';
import { audit } from '../lib/audit';
import { nextEmployeeCode, nextRequestNumber } from '../lib/counters';
import { hashPassword, temporaryPassword } from '../lib/crypto';
import { AppError, conflict, forbidden, notFound } from '../lib/errors';
import { transaction, type AfterCommit } from '../lib/tx';
import { broadcast } from '../realtime/emitter';
import { revokeAllSessions } from './auth';
import { notifyUsers } from './notifications';

type EmployeeRow = typeof employees.$inferSelect;
const manager = alias(employees, 'manager');

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export async function listEmployees(
  executor: Executor,
  filter: { storeId?: string; role?: StaffRole; statuses?: EmployeeRow['status'][]; q?: string; limit?: number; offset?: number },
  showWages: boolean,
): Promise<{ items: Employee[]; total: number }> {
  const conditions: SQL[] = [];
  if (filter.storeId) conditions.push(eq(employees.storeId, filter.storeId));
  if (filter.role) conditions.push(eq(employees.role, filter.role));
  if (filter.statuses && filter.statuses.length > 0) conditions.push(inArray(employees.status, filter.statuses));
  if (filter.q) {
    const like = `%${filter.q}%`;
    conditions.push(or(ilike(employees.fullName, like), ilike(employees.employeeCode, like), ilike(employees.phone, like), ilike(employees.email, like))!);
  }
  const rows = await executor
    .select({
      employee: employees,
      storeName: stores.name,
      storeCode: stores.code,
      username: users.username,
      lastLoginAt: users.lastLoginAt,
      managerName: manager.fullName,
      total: sql<number>`count(*) over()::int`,
    })
    .from(employees)
    .innerJoin(stores, eq(stores.id, employees.storeId))
    .leftJoin(users, eq(users.id, employees.userId))
    .leftJoin(manager, eq(manager.id, employees.reportsToId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(
      sql`case ${employees.role} when 'OWNER' then 0 when 'STORE_MANAGER' then 1 when 'FLOOR_MANAGER' then 2 else 3 end`,
      asc(employees.fullName),
    )
    .limit(filter.limit ?? 500)
    .offset(filter.offset ?? 0);
  return {
    total: rows[0]?.total ?? 0,
    items: rows.map((r) => serializeEmployee(r.employee, r, showWages)),
  };
}

export function serializeEmployee(
  e: EmployeeRow,
  extra: { storeName: string; storeCode: string; username: string | null; lastLoginAt: Date | null; managerName: string | null },
  showWages: boolean,
): Employee {
  return {
    id: e.id,
    userId: e.userId,
    storeId: e.storeId,
    storeName: extra.storeName,
    storeCode: extra.storeCode,
    name: e.fullName,
    email: e.email,
    phone: e.phone,
    username: extra.username,
    employeeCode: e.employeeCode,
    role: e.role,
    department: e.department,
    designation: e.designation,
    joiningDate: e.joiningDate,
    wageType: showWages ? e.wageType : null,
    wageAmount: showWages ? e.wageAmount : null,
    status: e.status,
    exitDate: e.exitDate,
    exitReason: e.exitReason,
    reportsTo: e.reportsToId && extra.managerName ? { id: e.reportsToId, name: extra.managerName } : null,
    lastLoginAt: extra.lastLoginAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
  };
}

export async function getEmployee(employeeId: string, showWages: boolean): Promise<Employee> {
  const [row] = await db
    .select({ employee: employees, storeName: stores.name, storeCode: stores.code, username: users.username, lastLoginAt: users.lastLoginAt, managerName: manager.fullName })
    .from(employees)
    .innerJoin(stores, eq(stores.id, employees.storeId))
    .leftJoin(users, eq(users.id, employees.userId))
    .leftJoin(manager, eq(manager.id, employees.reportsToId))
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!row) throw notFound('Employee');
  return serializeEmployee(row.employee, row, showWages);
}

/**
 * Removes an employee's access (resigned or terminated). The HR record,
 * attendance and task history are kept; the login is disabled and every
 * session is revoked immediately.
 */
export async function offboardEmployee(
  employeeId: string,
  input: { reason: 'LEFT' | 'TERMINATED'; note?: string; exitDate?: string },
  actor: { userId: string; name: string; kind: 'ADMIN' | 'STAFF' },
  ip: string | null,
): Promise<Employee> {
  await transaction(async (tx, afterCommit) => {
    const [employee] = await tx.select().from(employees).where(eq(employees.id, employeeId)).for('update');
    if (!employee) throw notFound('Employee');
    if (employee.status === 'LEFT' || employee.status === 'TERMINATED') throw conflict('This employee has already been offboarded');
    await tx
      .update(employees)
      .set({
        status: input.reason,
        exitDate: input.exitDate ?? new Date().toISOString().slice(0, 10),
        exitReason: input.note ?? (input.reason === 'LEFT' ? 'Resigned' : 'Terminated'),
      })
      .where(eq(employees.id, employeeId));
    if (employee.userId) {
      const [{ remaining }] = (await tx
        .select({ remaining: sql<number>`count(*)::int` })
        .from(employees)
        .where(and(eq(employees.userId, employee.userId), inArray(employees.status, ['ACTIVE', 'ON_LEAVE'])))) as [{ remaining: number }];
      if (remaining === 0) {
        await tx.update(users).set({ status: 'DEACTIVATED', passwordHash: null }).where(eq(users.id, employee.userId));
      }
      await revokeAllSessions(tx, employee.userId);
    }
    await tx.execute(sql`update tasks set status = 'CANCELLED' where assignee_id = ${employeeId} and status in ('TODO', 'IN_PROGRESS', 'REOPENED')`);
    await tx.execute(sql`delete from shifts where employee_id = ${employeeId} and start_at > now()`);
    await audit(tx, {
      actorId: actor.userId,
      actorKind: actor.kind,
      actorName: actor.name,
      action: 'EMPLOYEE_OFFBOARDED',
      entityType: 'employee',
      entityId: employeeId,
      storeId: employee.storeId,
      metadata: { reason: input.reason, note: input.note ?? null, employeeCode: employee.employeeCode, name: employee.fullName },
      ip,
    });
    afterCommit(() => broadcast.toStoreOps(employee.storeId, SocketEvents.REQUEST_CHANGED, { employeeId }));
  });
  return getEmployee(employeeId, true);
}

// ---------------------------------------------------------------------------
// Onboarding requests: store manager -> store owner -> SmartCart admin
// ---------------------------------------------------------------------------

type RequestRow = typeof credentialRequests.$inferSelect;
const requester = alias(users, 'requester');

export async function loadRequest(executor: Executor, requestId: string): Promise<CredentialRequest> {
  const [row] = await executor
    .select({ request: credentialRequests, storeName: stores.name, storeCode: stores.code, requesterName: requester.name })
    .from(credentialRequests)
    .innerJoin(stores, eq(stores.id, credentialRequests.storeId))
    .innerJoin(requester, eq(requester.id, credentialRequests.requestedById))
    .where(eq(credentialRequests.id, requestId))
    .limit(1);
  if (!row) throw notFound('Request');
  const events = await executor
    .select()
    .from(credentialRequestEvents)
    .where(eq(credentialRequestEvents.requestId, requestId))
    .orderBy(asc(credentialRequestEvents.createdAt));
  let issued: CredentialRequest['issued'] = null;
  if (row.request.issuedEmployeeId) {
    const [employee] = await executor
      .select({ id: employees.id, code: employees.employeeCode })
      .from(employees)
      .where(eq(employees.id, row.request.issuedEmployeeId))
      .limit(1);
    if (employee) issued = { employeeId: employee.id, employeeCode: employee.code, username: row.request.issuedUsername ?? '' };
  }
  return serializeRequest(row.request, row.storeName, row.storeCode, row.requesterName, events, issued);
}

function serializeRequest(
  r: RequestRow,
  storeName: string,
  storeCode: string,
  requesterName: string,
  events: (typeof credentialRequestEvents.$inferSelect)[],
  issued: CredentialRequest['issued'],
): CredentialRequest {
  return {
    id: r.id,
    requestNumber: r.requestNumber,
    storeId: r.storeId,
    storeName,
    storeCode,
    status: r.status,
    revision: r.revision,
    candidate: r.candidate,
    requestedBy: { id: r.requestedById, name: requesterName, role: r.requestedByRole },
    lastComment: r.lastComment,
    events: events.map((e) => ({
      id: e.id,
      action: e.action,
      actorName: e.actorName,
      actorRole: e.actorRole,
      comment: e.comment,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      at: e.createdAt.toISOString(),
    })),
    issued,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function listRequests(
  filter: { storeId?: string; statuses?: CredentialRequestStatus[]; q?: string; limit?: number; offset?: number },
): Promise<{ items: CredentialRequest[]; total: number }> {
  const conditions: SQL[] = [];
  if (filter.storeId) conditions.push(eq(credentialRequests.storeId, filter.storeId));
  if (filter.statuses && filter.statuses.length > 0) conditions.push(inArray(credentialRequests.status, filter.statuses));
  if (filter.q) {
    const like = `%${filter.q}%`;
    conditions.push(or(ilike(credentialRequests.candidateName, like), ilike(credentialRequests.requestNumber, like))!);
  }
  const rows = await db
    .select({
      request: credentialRequests,
      storeName: stores.name,
      storeCode: stores.code,
      requesterName: requester.name,
      issuedCode: employees.employeeCode,
      total: sql<number>`count(*) over()::int`,
    })
    .from(credentialRequests)
    .innerJoin(stores, eq(stores.id, credentialRequests.storeId))
    .innerJoin(requester, eq(requester.id, credentialRequests.requestedById))
    .leftJoin(employees, eq(employees.id, credentialRequests.issuedEmployeeId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(credentialRequests.updatedAt))
    .limit(filter.limit ?? 100)
    .offset(filter.offset ?? 0);
  const ids = rows.map((r) => r.request.id);
  const events =
    ids.length > 0
      ? await db.select().from(credentialRequestEvents).where(inArray(credentialRequestEvents.requestId, ids)).orderBy(asc(credentialRequestEvents.createdAt))
      : [];
  return {
    total: rows[0]?.total ?? 0,
    items: rows.map((r) =>
      serializeRequest(
        r.request,
        r.storeName,
        r.storeCode,
        r.requesterName,
        events.filter((e) => e.requestId === r.request.id),
        r.request.issuedEmployeeId && r.request.issuedUsername
          ? { employeeId: r.request.issuedEmployeeId, employeeCode: r.issuedCode ?? '', username: r.request.issuedUsername }
          : null,
      ),
    ),
  };
}

function normalizeCandidate(input: CandidateInput): CandidateDetails {
  return {
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    role: input.role,
    department: input.department,
    designation: input.designation ?? null,
    joiningDate: input.joiningDate,
    wageType: input.wageType,
    wageAmount: input.wageAmount,
    dateOfBirth: input.dateOfBirth ?? null,
    address: input.address ?? null,
    emergencyContactName: input.emergencyContactName ?? null,
    emergencyContactPhone: input.emergencyContactPhone ?? null,
    idProofType: input.idProofType ?? null,
    idProofLast4: input.idProofLast4 ?? null,
    notes: input.notes ?? null,
    reportsToId: input.reportsToId ?? null,
  };
}

async function recordEvent(
  tx: Transaction,
  request: RequestRow,
  actor: { userId: string; name: string; role: string },
  action: CredentialRequestAction,
  toStatus: CredentialRequestStatus,
  comment: string | null,
): Promise<void> {
  await tx.insert(credentialRequestEvents).values({
    requestId: request.id,
    actorId: actor.userId,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    comment,
    fromStatus: request.status,
    toStatus,
  });
}

async function storeLeadership(executor: Executor, storeId: string) {
  return executor
    .select({ userId: employees.userId, role: employees.role })
    .from(employees)
    .where(and(eq(employees.storeId, storeId), eq(employees.status, 'ACTIVE'), inArray(employees.role, ['OWNER', 'STORE_MANAGER'])));
}

async function adminUserIds(executor: Executor): Promise<string[]> {
  const admins = await executor
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.kind, 'ADMIN'), eq(users.status, 'ACTIVE'), inArray(users.adminRole, ['SUPER_ADMIN', 'ADMIN'])));
  return admins.map((a) => a.id);
}

function publishRequest(afterCommit: AfterCommit, request: Pick<RequestRow, 'id' | 'storeId'>) {
  afterCommit(() => {
    broadcast.toStoreOps(request.storeId, SocketEvents.REQUEST_CHANGED, { requestId: request.id });
    broadcast.toAdmins(SocketEvents.REQUEST_CHANGED, { requestId: request.id });
  });
}

export async function createRequest(
  storeId: string,
  actor: { userId: string; name: string; role: StaffRole },
  input: CandidateInput,
): Promise<CredentialRequest> {
  if (actor.role !== 'OWNER' && actor.role !== 'STORE_MANAGER') throw forbidden('Only store managers and owners can request staff logins');
  if (actor.role === 'STORE_MANAGER' && input.role === 'STORE_MANAGER') {
    throw forbidden('A store manager login must be requested by the store owner');
  }
  const candidate = normalizeCandidate(input);
  const id = await transaction(async (tx, afterCommit) => {
    // Owners skip their own review: their requests go straight to the admin team.
    const status: CredentialRequestStatus = actor.role === 'OWNER' ? 'PENDING_ADMIN' : 'PENDING_OWNER';
    const [request] = await tx
      .insert(credentialRequests)
      .values({
        requestNumber: await nextRequestNumber(tx),
        storeId,
        requestedById: actor.userId,
        requestedByRole: actor.role,
        status,
        candidate,
        candidateName: candidate.fullName,
        ...(actor.role === 'OWNER' ? { ownerReviewedById: actor.userId, ownerReviewedAt: new Date() } : {}),
      })
      .returning();
    await tx.insert(credentialRequestEvents).values({
      requestId: request!.id,
      actorId: actor.userId,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'SUBMITTED',
      toStatus: status,
    });
    const leaders = await storeLeadership(tx, storeId);
    const recipients = status === 'PENDING_OWNER' ? leaders.filter((l) => l.role === 'OWNER').map((l) => l.userId) : await adminUserIds(tx);
    await notifyUsers(
      tx,
      recipients,
      {
        type: 'CREDENTIAL_REQUEST',
        title: `Login request ${request!.requestNumber}: ${candidate.fullName}`,
        body: `${STAFF_ROLE_LABELS[candidate.role]} · requested by ${actor.name}. Waiting for your review.`,
        data: { requestId: request!.id, storeId },
      },
      afterCommit,
    );
    publishRequest(afterCommit, request!);
    return request!.id;
  });
  return loadRequest(db, id);
}

const EDITABLE: CredentialRequestStatus[] = ['PENDING_OWNER', 'OWNER_CHANGES_REQUESTED', 'ADMIN_CHANGES_REQUESTED'];

export async function updateRequest(
  requestId: string,
  storeId: string,
  actor: { userId: string; name: string; role: StaffRole },
  patch: Partial<CandidateInput>,
): Promise<CredentialRequest> {
  await transaction(async (tx, afterCommit) => {
    const [request] = await tx
      .select()
      .from(credentialRequests)
      .where(and(eq(credentialRequests.id, requestId), eq(credentialRequests.storeId, storeId)))
      .for('update');
    if (!request) throw notFound('Request');
    if (!EDITABLE.includes(request.status)) throw conflict('This request can no longer be edited');
    if (actor.role !== 'OWNER' && request.requestedById !== actor.userId) throw forbidden('Only the requester or the owner can edit this request');
    const candidate = normalizeCandidate({ ...request.candidate, ...patch } as CandidateInput);
    await tx
      .update(credentialRequests)
      .set({ candidate, candidateName: candidate.fullName })
      .where(eq(credentialRequests.id, requestId));
    await recordEvent(tx, request, actor, 'EDITED', request.status, null);
    publishRequest(afterCommit, request);
  });
  return loadRequest(db, requestId);
}

/** After changes were requested: the owner's resubmission goes to admin, a manager's back to the owner. */
export async function resubmitRequest(
  requestId: string,
  storeId: string,
  actor: { userId: string; name: string; role: StaffRole },
  comment: string | undefined,
): Promise<CredentialRequest> {
  await transaction(async (tx, afterCommit) => {
    const [request] = await tx
      .select()
      .from(credentialRequests)
      .where(and(eq(credentialRequests.id, requestId), eq(credentialRequests.storeId, storeId)))
      .for('update');
    if (!request) throw notFound('Request');
    if (request.status !== 'OWNER_CHANGES_REQUESTED' && request.status !== 'ADMIN_CHANGES_REQUESTED') {
      throw conflict('Only requests that were sent back can be resubmitted');
    }
    if (actor.role !== 'OWNER' && request.requestedById !== actor.userId) throw forbidden('Only the requester or the owner can resubmit');
    const toStatus: CredentialRequestStatus = actor.role === 'OWNER' ? 'PENDING_ADMIN' : 'PENDING_OWNER';
    await tx
      .update(credentialRequests)
      .set({
        status: toStatus,
        revision: request.revision + 1,
        ...(actor.role === 'OWNER' ? { ownerReviewedById: actor.userId, ownerReviewedAt: new Date() } : {}),
      })
      .where(eq(credentialRequests.id, requestId));
    await recordEvent(tx, request, actor, 'RESUBMITTED', toStatus, comment ?? null);
    const leaders = await storeLeadership(tx, storeId);
    const recipients = toStatus === 'PENDING_OWNER' ? leaders.filter((l) => l.role === 'OWNER').map((l) => l.userId) : await adminUserIds(tx);
    await notifyUsers(
      tx,
      recipients,
      {
        type: 'CREDENTIAL_REQUEST',
        title: `${request.requestNumber} resubmitted`,
        body: `${request.candidateName}: changes made by ${actor.name}. Ready for review.`,
        data: { requestId, storeId },
      },
      afterCommit,
    );
    publishRequest(afterCommit, request);
  });
  return loadRequest(db, requestId);
}

/** Store owner's decision on a manager's request. */
export async function ownerReview(
  requestId: string,
  storeId: string,
  actor: { userId: string; name: string; role: StaffRole },
  decision: 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT',
  comment: string | undefined,
): Promise<CredentialRequest> {
  if (actor.role !== 'OWNER') throw forbidden('Only the store owner can review login requests');
  await transaction(async (tx, afterCommit) => {
    const [request] = await tx
      .select()
      .from(credentialRequests)
      .where(and(eq(credentialRequests.id, requestId), eq(credentialRequests.storeId, storeId)))
      .for('update');
    if (!request) throw notFound('Request');
    if (request.status !== 'PENDING_OWNER') throw conflict('This request is not waiting for the owner');
    const toStatus: CredentialRequestStatus =
      decision === 'APPROVE' ? 'PENDING_ADMIN' : decision === 'REQUEST_CHANGES' ? 'OWNER_CHANGES_REQUESTED' : 'REJECTED';
    const action: CredentialRequestAction =
      decision === 'APPROVE' ? 'OWNER_APPROVED' : decision === 'REQUEST_CHANGES' ? 'OWNER_REQUESTED_CHANGES' : 'REJECTED';
    await tx
      .update(credentialRequests)
      .set({ status: toStatus, lastComment: comment ?? request.lastComment, ownerReviewedById: actor.userId, ownerReviewedAt: new Date() })
      .where(eq(credentialRequests.id, requestId));
    await recordEvent(tx, request, actor, action, toStatus, comment ?? null);
    const recipients = decision === 'APPROVE' ? await adminUserIds(tx) : [request.requestedById];
    await notifyUsers(
      tx,
      recipients,
      {
        type: 'CREDENTIAL_REQUEST',
        title: `${request.requestNumber}: ${CREDENTIAL_REQUEST_ACTION_LABELS[action]}`,
        body: comment ? `${request.candidateName} · "${comment}"` : request.candidateName,
        data: { requestId, storeId },
      },
      afterCommit,
    );
    publishRequest(afterCommit, request);
  });
  return loadRequest(db, requestId);
}

export async function cancelRequest(requestId: string, storeId: string, actor: { userId: string; name: string; role: StaffRole }) {
  await transaction(async (tx, afterCommit) => {
    const [request] = await tx
      .select()
      .from(credentialRequests)
      .where(and(eq(credentialRequests.id, requestId), eq(credentialRequests.storeId, storeId)))
      .for('update');
    if (!request) throw notFound('Request');
    if (request.status === 'APPROVED' || request.status === 'REJECTED' || request.status === 'CANCELLED') {
      throw conflict('This request is already closed');
    }
    if (actor.role !== 'OWNER' && request.requestedById !== actor.userId) throw forbidden('Only the requester or the owner can cancel');
    await tx.update(credentialRequests).set({ status: 'CANCELLED' }).where(eq(credentialRequests.id, requestId));
    await recordEvent(tx, request, actor, 'CANCELLED', 'CANCELLED', null);
    publishRequest(afterCommit, request);
  });
  return loadRequest(db, requestId);
}

/**
 * Admin's decision. Approval creates (or re-activates) the staff login,
 * adds the employee to the store and returns a one-time temporary password.
 */
export async function adminReview(
  requestId: string,
  actor: { userId: string; name: string },
  decision: 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT',
  comment: string | undefined,
  ip: string | null,
): Promise<{ request: CredentialRequest; credentials: IssuedCredentials | null }> {
  let credentials: IssuedCredentials | null = null;
  await transaction(async (tx, afterCommit) => {
    const [request] = await tx.select().from(credentialRequests).where(eq(credentialRequests.id, requestId)).for('update');
    if (!request) throw notFound('Request');
    if (request.status !== 'PENDING_ADMIN') throw conflict('This request is not waiting for admin review');
    const adminActor = { ...actor, role: 'ADMIN' };
    const leaders = await storeLeadership(tx, request.storeId);
    const storeRecipients = [...new Set([request.requestedById, ...leaders.map((l) => l.userId)])];

    if (decision !== 'APPROVE') {
      const toStatus: CredentialRequestStatus = decision === 'REQUEST_CHANGES' ? 'ADMIN_CHANGES_REQUESTED' : 'REJECTED';
      const action: CredentialRequestAction = decision === 'REQUEST_CHANGES' ? 'ADMIN_REQUESTED_CHANGES' : 'REJECTED';
      await tx
        .update(credentialRequests)
        .set({ status: toStatus, lastComment: comment ?? null, adminReviewedById: actor.userId, adminReviewedAt: new Date() })
        .where(eq(credentialRequests.id, requestId));
      await recordEvent(tx, request, adminActor, action, toStatus, comment ?? null);
      await notifyUsers(
        tx,
        storeRecipients,
        {
          type: 'CREDENTIAL_REQUEST',
          title: `${request.requestNumber}: ${CREDENTIAL_REQUEST_ACTION_LABELS[action]}`,
          body: `${request.candidateName} · "${comment}"`,
          data: { requestId, storeId: request.storeId },
        },
        afterCommit,
      );
      publishRequest(afterCommit, request);
      return;
    }

    const candidate = request.candidate;
    const [store] = await tx.select().from(stores).where(eq(stores.id, request.storeId)).limit(1);
    const password = temporaryPassword();
    const passwordHash = await hashPassword(password);

    // Re-use an existing staff identity (e.g. a rehire or someone moving stores).
    let [user] = await tx
      .select()
      .from(users)
      .where(and(eq(users.kind, 'STAFF'), or(eq(users.email, candidate.email), eq(users.phone, candidate.phone))))
      .limit(1);
    if (user) {
      const [active] = await tx
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.userId, user.id), eq(employees.storeId, request.storeId), inArray(employees.status, ['ACTIVE', 'ON_LEAVE'])))
        .limit(1);
      if (active) throw conflict(`${candidate.fullName} already works at this store`);
      [user] = await tx
        .update(users)
        .set({ status: 'ACTIVE', passwordHash, mustChangePassword: true, name: candidate.fullName, tokenVersion: user.tokenVersion + 1 })
        .where(eq(users.id, user.id))
        .returning();
    } else {
      const username = await uniqueUsername(tx, candidate.fullName);
      [user] = await tx
        .insert(users)
        .values({
          kind: 'STAFF',
          name: candidate.fullName,
          email: candidate.email,
          phone: candidate.phone,
          username,
          passwordHash,
          mustChangePassword: true,
        })
        .returning();
    }

    const employeeCode = await nextEmployeeCode(tx, store!.code);
    const [employee] = await tx
      .insert(employees)
      .values({
        userId: user!.id,
        storeId: request.storeId,
        employeeCode,
        fullName: candidate.fullName,
        email: candidate.email,
        phone: candidate.phone,
        role: candidate.role,
        department: candidate.department,
        designation: candidate.designation,
        joiningDate: candidate.joiningDate,
        wageType: candidate.wageType,
        wageAmount: candidate.wageAmount,
        dateOfBirth: candidate.dateOfBirth,
        address: candidate.address,
        emergencyContactName: candidate.emergencyContactName,
        emergencyContactPhone: candidate.emergencyContactPhone,
        idProofType: candidate.idProofType,
        idProofLast4: candidate.idProofLast4,
        reportsToId: candidate.reportsToId,
        credentialRequestId: request.id,
      })
      .returning();

    await tx
      .update(credentialRequests)
      .set({
        status: 'APPROVED',
        lastComment: comment ?? null,
        adminReviewedById: actor.userId,
        adminReviewedAt: new Date(),
        issuedEmployeeId: employee!.id,
        issuedUsername: user!.username,
      })
      .where(eq(credentialRequests.id, requestId));
    await recordEvent(tx, request, adminActor, 'ADMIN_APPROVED', 'APPROVED', comment ?? 'Credentials issued');
    await audit(tx, {
      actorId: actor.userId,
      actorKind: 'ADMIN',
      actorName: actor.name,
      action: 'CREDENTIALS_ISSUED',
      entityType: 'employee',
      entityId: employee!.id,
      storeId: request.storeId,
      metadata: { requestNumber: request.requestNumber, username: user!.username, role: candidate.role },
      ip,
    });
    await notifyUsers(
      tx,
      storeRecipients,
      {
        type: 'CREDENTIAL_REQUEST',
        title: `${candidate.fullName} can now sign in`,
        body: `${request.requestNumber} approved. Username ${user!.username}; the temporary password was shared by the SmartCart admin team.`,
        data: { requestId, storeId: request.storeId, employeeId: employee!.id },
      },
      afterCommit,
    );
    publishRequest(afterCommit, request);
    credentials = {
      employeeId: employee!.id,
      employeeCode,
      username: user!.username!,
      temporaryPassword: password,
      loginUrl: `${env.PUBLIC_WEB_URL}/ops/login`,
    };
  });
  return { request: await loadRequest(db, requestId), credentials };
}

/** "Kavya Reddy" -> "kavya.reddy", then "kavya.reddy2" ... */
export async function uniqueUsername(executor: Executor, fullName: string): Promise<string> {
  const base =
    fullName
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z\s]/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join('.') || 'staff';
  for (let n = 1; n < 100; n++) {
    const candidate = n === 1 ? base : `${base}${n}`;
    const [taken] = await executor.select({ id: users.id }).from(users).where(eq(users.username, candidate)).limit(1);
    if (!taken) return candidate;
  }
  throw new AppError(500, 'USERNAME_EXHAUSTED', 'Could not allocate a username');
}
