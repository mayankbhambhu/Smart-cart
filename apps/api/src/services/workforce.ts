import {
  LATE_GRACE_MINUTES,
  OPEN_TASK_STATUSES,
  SocketEvents,
  STAFF_ROLE_RANK,
  haversineKm,
  type AttendanceBoard,
  type AttendanceRecord,
  type AttendanceSummaryRow,
  type ClockMethod,
  type CompleteTaskInput,
  type CreateShiftsInput,
  type CreateTaskInput,
  type EmployeeRef,
  type MyAttendance,
  type ReviewTaskInput,
  type Shift,
  type StaffRole,
  type Task,
  type TaskStatus,
  type UpdateShiftInput,
  type UpdateTaskInput,
} from '@smartcart/shared';
import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, type Executor } from '../db/client';
import { attendanceRecords, employees, shifts, stores, tasks, users } from '../db/schema';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { transaction } from '../lib/tx';
import { addDays, minutesBetween, minutesOfDay, zonedParts, zonedRange, zonedToUtc } from '../lib/time';
import { resolveSettings } from '../modules/stores/settings';
import { broadcast } from '../realtime/emitter';
import { verifyKioskCode } from './kiosk';
import { notifyUsers } from './notifications';

export interface StaffActor {
  userId: string;
  employeeId: string;
  storeId: string;
  role: StaffRole;
  name: string;
  timezone: string;
}

const assignee = alias(employees, 'assignee');
const assigner = alias(employees, 'assigner');
const reviewer = alias(employees, 'reviewer');

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

function taskQuery(executor: Executor) {
  return executor
    .select({
      task: tasks,
      assigneeName: assignee.fullName,
      assigneeRole: assignee.role,
      assigneeDepartment: assignee.department,
      assignerName: assigner.fullName,
      assignerRole: assigner.role,
      reviewerName: reviewer.fullName,
    })
    .from(tasks)
    .innerJoin(assignee, eq(assignee.id, tasks.assigneeId))
    .innerJoin(assigner, eq(assigner.id, tasks.assignedById))
    .leftJoin(reviewer, eq(reviewer.id, tasks.reviewedById));
}

type TaskQueryRow = Awaited<ReturnType<typeof taskQuery>>[number];

function serializeTask(row: TaskQueryRow): Task {
  const t = row.task;
  return {
    id: t.id,
    storeId: t.storeId,
    title: t.title,
    description: t.description,
    category: t.category,
    priority: t.priority,
    status: t.status,
    assignee: { id: t.assigneeId, name: row.assigneeName, role: row.assigneeRole, department: row.assigneeDepartment },
    assignedBy: { id: t.assignedById, name: row.assignerName, role: row.assignerRole },
    aisle: t.aisle,
    dueAt: t.dueAt?.toISOString() ?? null,
    isOverdue: Boolean(t.dueAt && t.dueAt < new Date() && OPEN_TASK_STATUSES.includes(t.status)),
    startedAt: t.startedAt?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    completionNote: t.completionNote,
    completionPhotoUrl: t.completionPhotoUrl,
    review:
      t.reviewedAt && row.reviewerName
        ? { rating: t.reviewRating, comment: t.reviewComment, reviewerName: row.reviewerName, reviewedAt: t.reviewedAt.toISOString() }
        : null,
    restockAlertId: t.restockAlertId,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export async function loadTask(executor: Executor, taskId: string): Promise<Task> {
  const [row] = await taskQuery(executor).where(eq(tasks.id, taskId)).limit(1);
  if (!row) throw notFound('Task');
  return serializeTask(row);
}

export async function listTasks(
  actor: StaffActor,
  filter: { scope: 'mine' | 'team' | 'all'; statuses: TaskStatus[]; assigneeId?: string; limit: number },
): Promise<Task[]> {
  const conditions: SQL[] = [eq(tasks.storeId, actor.storeId)];
  const isWorker = actor.role === 'WORKER';
  if (filter.scope === 'mine' || isWorker) conditions.push(eq(tasks.assigneeId, actor.employeeId));
  else if (filter.scope === 'team' && actor.role === 'FLOOR_MANAGER') {
    conditions.push(
      or(eq(tasks.assignedById, actor.employeeId), eq(tasks.assigneeId, actor.employeeId), eq(assignee.reportsToId, actor.employeeId))!,
    );
  }
  if (filter.assigneeId && !isWorker) conditions.push(eq(tasks.assigneeId, filter.assigneeId));
  if (filter.statuses.length > 0) conditions.push(inArray(tasks.status, filter.statuses));
  const rows = await taskQuery(db)
    .where(and(...conditions))
    .orderBy(
      sql`case ${tasks.status} when 'REOPENED' then 0 when 'TODO' then 1 when 'IN_PROGRESS' then 2 when 'DONE' then 3 else 4 end`,
      sql`case ${tasks.priority} when 'URGENT' then 0 when 'HIGH' then 1 when 'MEDIUM' then 2 else 3 end`,
      asc(tasks.dueAt),
      desc(tasks.createdAt),
    )
    .limit(filter.limit);
  return rows.map(serializeTask);
}

async function assertCanAssign(actor: StaffActor, assigneeId: string) {
  const [target] = await db
    .select({ id: employees.id, role: employees.role, userId: employees.userId, status: employees.status, name: employees.fullName })
    .from(employees)
    .where(and(eq(employees.id, assigneeId), eq(employees.storeId, actor.storeId)))
    .limit(1);
  if (!target || target.status !== 'ACTIVE') throw notFound('Active employee in this store');
  // Store managers/owners assign to floor managers and workers; floor managers assign to workers.
  const allowed =
    actor.role === 'OWNER' || actor.role === 'STORE_MANAGER'
      ? target.role === 'FLOOR_MANAGER' || target.role === 'WORKER' || target.id === actor.employeeId
      : actor.role === 'FLOOR_MANAGER'
        ? target.role === 'WORKER' || target.id === actor.employeeId
        : false;
  if (!allowed) throw forbidden('You cannot assign work to this person');
  return target;
}

export async function createTask(actor: StaffActor, input: CreateTaskInput): Promise<Task> {
  if (actor.role === 'WORKER') throw forbidden('Workers cannot assign tasks');
  const target = await assertCanAssign(actor, input.assigneeId);
  const id = await transaction(async (tx, afterCommit) => {
    const [task] = await tx
      .insert(tasks)
      .values({
        storeId: actor.storeId,
        title: input.title,
        description: input.description ?? null,
        category: input.category ?? 'OTHER',
        priority: input.priority ?? 'MEDIUM',
        assigneeId: target.id,
        assignedById: actor.employeeId,
        aisle: input.aisle ?? null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        restockAlertId: input.restockAlertId ?? null,
      })
      .returning();
    if (target.userId !== null && target.id !== actor.employeeId) {
      await notifyUsers(
        tx,
        [target.userId],
        {
          type: 'TASK_ASSIGNED',
          title: `New task from ${actor.name}: ${task!.title}`,
          body:
            [
              input.priority === 'URGENT' ? 'Urgent' : null,
              input.aisle ? `Aisle ${input.aisle}` : null,
              input.dueAt
                ? `due ${new Date(input.dueAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: actor.timezone })}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'Open your task list for details',
          data: { taskId: task!.id, storeId: actor.storeId },
        },
        afterCommit,
      );
    }
    afterCommit(() => broadcast.toStoreOps(actor.storeId, SocketEvents.TASK_CHANGED, { taskId: task!.id }));
    return task!.id;
  });
  return loadTask(db, id);
}

export async function updateTask(actor: StaffActor, taskId: string, input: UpdateTaskInput): Promise<Task> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.storeId, actor.storeId)))
    .limit(1);
  if (!task) throw notFound('Task');
  const isManager = actor.role === 'OWNER' || actor.role === 'STORE_MANAGER';
  if (!isManager && task.assignedById !== actor.employeeId) throw forbidden('Only the person who assigned this task can change it');
  if (input.assigneeId && input.assigneeId !== task.assigneeId) await assertCanAssign(actor, input.assigneeId);
  await db
    .update(tasks)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt ? new Date(input.dueAt) : null } : {}),
      ...(input.aisle !== undefined ? { aisle: input.aisle } : {}),
      ...(input.status === 'CANCELLED' ? { status: 'CANCELLED' as const } : {}),
    })
    .where(eq(tasks.id, taskId));
  broadcast.toStoreOps(actor.storeId, SocketEvents.TASK_CHANGED, { taskId });
  return loadTask(db, taskId);
}

export async function startTask(actor: StaffActor, taskId: string): Promise<Task> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.storeId, actor.storeId)))
    .limit(1);
  if (!task) throw notFound('Task');
  if (task.assigneeId !== actor.employeeId) throw forbidden('Only the assignee can start this task');
  if (task.status !== 'TODO' && task.status !== 'REOPENED') throw conflict('This task has already been started');
  await db
    .update(tasks)
    .set({ status: 'IN_PROGRESS', startedAt: task.startedAt ?? new Date() })
    .where(eq(tasks.id, taskId));
  broadcast.toStoreOps(actor.storeId, SocketEvents.TASK_CHANGED, { taskId });
  return loadTask(db, taskId);
}

/** The assignee marks the work done and leaves a remark for the manager. */
export async function completeTask(actor: StaffActor, taskId: string, input: CompleteTaskInput): Promise<Task> {
  await transaction(async (tx, afterCommit) => {
    const [task] = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.storeId, actor.storeId)))
      .for('update');
    if (!task) throw notFound('Task');
    if (task.assigneeId !== actor.employeeId) throw forbidden('Only the assignee can complete this task');
    if (!OPEN_TASK_STATUSES.includes(task.status)) throw conflict('This task is not open');
    const now = new Date();
    await tx
      .update(tasks)
      .set({
        status: 'DONE',
        startedAt: task.startedAt ?? now,
        completedAt: now,
        completionNote: input.note,
        completionPhotoUrl: input.photoUrl ?? null,
      })
      .where(eq(tasks.id, taskId));
    const [assignedBy] = await tx.select({ userId: employees.userId }).from(employees).where(eq(employees.id, task.assignedById)).limit(1);
    await notifyUsers(
      tx,
      [assignedBy?.userId],
      {
        type: 'TASK_COMPLETED',
        title: `${actor.name} completed "${task.title}"`,
        body: input.note,
        data: { taskId, storeId: actor.storeId },
      },
      afterCommit,
    );
    afterCommit(() => broadcast.toStoreOps(actor.storeId, SocketEvents.TASK_CHANGED, { taskId }));
  });
  return loadTask(db, taskId);
}

/** Manager reviews completed work: approve with a rating, or reopen with feedback. */
export async function reviewTask(actor: StaffActor, taskId: string, input: ReviewTaskInput): Promise<Task> {
  await transaction(async (tx, afterCommit) => {
    const [task] = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.storeId, actor.storeId)))
      .for('update');
    if (!task) throw notFound('Task');
    const isManager = actor.role === 'OWNER' || actor.role === 'STORE_MANAGER';
    if (!isManager && task.assignedById !== actor.employeeId) throw forbidden('Only the person who assigned this task can review it');
    if (task.status !== 'DONE') throw conflict('Only completed tasks can be reviewed');
    const approve = input.decision === 'APPROVE';
    await tx
      .update(tasks)
      .set({
        status: approve ? 'APPROVED' : 'REOPENED',
        reviewRating: approve ? (input.rating ?? null) : null,
        reviewComment: input.comment ?? null,
        reviewedById: actor.employeeId,
        reviewedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
    const [assigneeRow] = await tx.select({ userId: employees.userId }).from(employees).where(eq(employees.id, task.assigneeId)).limit(1);
    await notifyUsers(
      tx,
      [assigneeRow?.userId],
      {
        type: 'TASK_REVIEWED',
        title: approve ? `"${task.title}" approved ${'★'.repeat(input.rating ?? 0)}` : `"${task.title}" needs another look`,
        body: input.comment ?? (approve ? 'Great work!' : 'Please check the task again'),
        data: { taskId, storeId: actor.storeId },
      },
      afterCommit,
    );
    afterCommit(() => broadcast.toStoreOps(actor.storeId, SocketEvents.TASK_CHANGED, { taskId }));
  });
  return loadTask(db, taskId);
}

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------

function employeeRef(e: {
  id: string;
  fullName: string;
  role: StaffRole;
  department: EmployeeRef['department'];
  employeeCode: string;
}): EmployeeRef {
  return { id: e.id, name: e.fullName, role: e.role, department: e.department, employeeCode: e.employeeCode };
}

export async function listShifts(storeId: string, from: string, to: string, employeeId?: string): Promise<Shift[]> {
  const rows = await db
    .select({ shift: shifts, employee: employees })
    .from(shifts)
    .innerJoin(employees, eq(employees.id, shifts.employeeId))
    .where(
      and(
        eq(shifts.storeId, storeId),
        gte(shifts.date, from),
        sql`${shifts.date} <= ${to}`,
        eq(shifts.status, 'SCHEDULED'),
        employeeId ? eq(shifts.employeeId, employeeId) : undefined,
      ),
    )
    .orderBy(asc(shifts.startAt), asc(employees.fullName));
  const shiftIds = rows.map((r) => r.shift.id);
  const attendance =
    shiftIds.length > 0 ? await db.select().from(attendanceRecords).where(inArray(attendanceRecords.shiftId, shiftIds)) : [];
  const byShift = new Map(attendance.map((a) => [a.shiftId, a]));
  return rows.map(({ shift, employee }) => {
    const record = byShift.get(shift.id);
    return {
      id: shift.id,
      storeId: shift.storeId,
      employee: employeeRef(employee),
      date: shift.date,
      startAt: shift.startAt.toISOString(),
      endAt: shift.endAt.toISOString(),
      label: shift.label,
      breakMinutes: shift.breakMinutes,
      notes: shift.notes,
      status: shift.status,
      attendance: record
        ? {
            id: record.id,
            clockInAt: record.clockInAt.toISOString(),
            clockOutAt: record.clockOutAt?.toISOString() ?? null,
            lateByMinutes: record.lateByMinutes,
          }
        : null,
    };
  });
}

/** Builds UTC start/end for a store-local date and times; an end before the start rolls over midnight. */
function shiftWindow(date: string, startTime: string, endTime: string, timezone: string): { startAt: Date; endAt: Date } {
  const startAt = zonedToUtc(date, startTime, timezone);
  const endDate = minutesOfDay(endTime) <= minutesOfDay(startTime) ? addDays(date, 1) : date;
  return { startAt, endAt: zonedToUtc(endDate, endTime, timezone) };
}

export async function createShifts(actor: StaffActor, input: CreateShiftsInput): Promise<Shift[]> {
  if (actor.role === 'WORKER' || actor.role === 'FLOOR_MANAGER') throw forbidden('Only store managers can plan shifts');
  const team = await db
    .select({ id: employees.id, userId: employees.userId, status: employees.status })
    .from(employees)
    .where(and(eq(employees.storeId, actor.storeId), inArray(employees.id, input.employeeIds)));
  if (team.length !== new Set(input.employeeIds).size || team.some((t) => t.status !== 'ACTIVE')) {
    throw badRequest('Every employee must be active in this store');
  }
  const created = await transaction(async (tx, afterCommit) => {
    const values: (typeof shifts.$inferInsert)[] = [];
    for (const date of [...new Set(input.dates)].sort()) {
      const { startAt, endAt } = shiftWindow(date, input.startTime, input.endTime, actor.timezone);
      for (const employeeId of input.employeeIds) {
        const [overlap] = await tx
          .select({ id: shifts.id })
          .from(shifts)
          .where(
            and(
              eq(shifts.employeeId, employeeId),
              eq(shifts.status, 'SCHEDULED'),
              lt(shifts.startAt, endAt),
              sql`${shifts.endAt} > ${startAt}`,
            ),
          )
          .limit(1);
        if (overlap) continue;
        values.push({
          storeId: actor.storeId,
          employeeId,
          date,
          startAt,
          endAt,
          label: input.label ?? null,
          breakMinutes: input.breakMinutes ?? 30,
          notes: input.notes ?? null,
          createdById: actor.employeeId,
        });
      }
    }
    const rows = values.length > 0 ? await tx.insert(shifts).values(values).returning() : [];
    const dates = [...new Set(input.dates)].sort();
    await notifyUsers(
      tx,
      team.map((t) => t.userId),
      {
        type: 'SHIFT_ASSIGNED',
        title: 'New shifts on your roster',
        body: `${input.label ?? 'Shift'} ${input.startTime}–${input.endTime} on ${dates.length === 1 ? dates[0] : `${dates.length} days from ${dates[0]}`}`,
        data: { storeId: actor.storeId },
      },
      afterCommit,
    );
    return rows;
  });
  if (created.length === 0) return [];
  const from = created.reduce((min, s) => (s.date < min ? s.date : min), created[0]!.date);
  const to = created.reduce((max, s) => (s.date > max ? s.date : max), created[0]!.date);
  const ids = new Set(created.map((s) => s.id));
  return (await listShifts(actor.storeId, from, to)).filter((s) => ids.has(s.id));
}

export async function updateShift(actor: StaffActor, shiftId: string, input: UpdateShiftInput): Promise<Shift> {
  if (actor.role === 'WORKER' || actor.role === 'FLOOR_MANAGER') throw forbidden('Only store managers can change shifts');
  const [shift] = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.id, shiftId), eq(shifts.storeId, actor.storeId)))
    .limit(1);
  if (!shift) throw notFound('Shift');
  const local = { start: zonedParts(shift.startAt, actor.timezone).time, end: zonedParts(shift.endAt, actor.timezone).time };
  const { startAt, endAt } = shiftWindow(shift.date, input.startTime ?? local.start, input.endTime ?? local.end, actor.timezone);
  await db
    .update(shifts)
    .set({
      startAt,
      endAt,
      ...(input.employeeId ? { employeeId: input.employeeId } : {}),
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.breakMinutes !== undefined ? { breakMinutes: input.breakMinutes } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.status ? { status: input.status } : {}),
    })
    .where(eq(shifts.id, shiftId));
  return shiftRow(shiftId);
}

async function shiftRow(shiftId: string): Promise<Shift> {
  const [row] = await db
    .select({ shift: shifts, employee: employees })
    .from(shifts)
    .innerJoin(employees, eq(employees.id, shifts.employeeId))
    .where(eq(shifts.id, shiftId))
    .limit(1);
  if (!row) throw notFound('Shift');
  return {
    id: row.shift.id,
    storeId: row.shift.storeId,
    employee: employeeRef(row.employee),
    date: row.shift.date,
    startAt: row.shift.startAt.toISOString(),
    endAt: row.shift.endAt.toISOString(),
    label: row.shift.label,
    breakMinutes: row.shift.breakMinutes,
    notes: row.shift.notes,
    status: row.shift.status,
    attendance: null,
  };
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

const editor = alias(users, 'editor');

function attendanceQuery(executor: Executor) {
  return executor
    .select({ record: attendanceRecords, employee: employees, shift: shifts, editorName: editor.name })
    .from(attendanceRecords)
    .innerJoin(employees, eq(employees.id, attendanceRecords.employeeId))
    .leftJoin(shifts, eq(shifts.id, attendanceRecords.shiftId))
    .leftJoin(editor, eq(editor.id, attendanceRecords.editedById));
}

type AttendanceQueryRow = Awaited<ReturnType<typeof attendanceQuery>>[number];

function serializeAttendance(row: AttendanceQueryRow): AttendanceRecord {
  const r = row.record;
  const open = !r.clockOutAt;
  return {
    id: r.id,
    storeId: r.storeId,
    employee: employeeRef(row.employee),
    shiftId: r.shiftId,
    shiftStartAt: row.shift?.startAt.toISOString() ?? null,
    shiftEndAt: row.shift?.endAt.toISOString() ?? null,
    clockInAt: r.clockInAt.toISOString(),
    clockOutAt: r.clockOutAt?.toISOString() ?? null,
    workedMinutes: open ? Math.max(0, minutesBetween(r.clockInAt, new Date())) : r.workedMinutes,
    clockInMethod: r.clockInMethod,
    clockOutMethod: r.clockOutMethod,
    lateByMinutes: r.lateByMinutes,
    leftEarlyByMinutes: r.leftEarlyByMinutes,
    notes: r.notes,
    editedByName: row.editorName,
  };
}

/** Finds the shift an employee is clocking in for (started up to 2h ago or starting within 2h). */
async function matchShift(employeeId: string, at: Date) {
  const [shift] = await db
    .select()
    .from(shifts)
    .where(
      and(
        eq(shifts.employeeId, employeeId),
        eq(shifts.status, 'SCHEDULED'),
        lt(shifts.startAt, new Date(at.getTime() + 2 * 3600_000)),
        sql`${shifts.endAt} > ${new Date(at.getTime() - 30 * 60_000)}`,
      ),
    )
    .orderBy(asc(shifts.startAt))
    .limit(1);
  return shift ?? null;
}

function computeTimes(clockInAt: Date, clockOutAt: Date | null, shift: { startAt: Date; endAt: Date; breakMinutes: number } | null) {
  const lateBy = shift ? minutesBetween(shift.startAt, clockInAt) : 0;
  const breakMinutes = shift?.breakMinutes ?? 0;
  const worked = clockOutAt
    ? Math.max(0, minutesBetween(clockInAt, clockOutAt) - (minutesBetween(clockInAt, clockOutAt) > 5 * 60 ? breakMinutes : 0))
    : 0;
  return {
    lateByMinutes: lateBy > LATE_GRACE_MINUTES ? lateBy : 0,
    leftEarlyByMinutes: clockOutAt && shift ? Math.max(0, minutesBetween(clockOutAt, shift.endAt)) : 0,
    workedMinutes: worked,
  };
}

export async function clockIn(
  actor: StaffActor,
  input: { method: ClockMethod; lat?: number; lng?: number; kioskCode?: string; note?: string },
): Promise<AttendanceRecord> {
  const [store] = await db.select().from(stores).where(eq(stores.id, actor.storeId)).limit(1);
  const settings = resolveSettings(store!.settings);
  if (input.method === 'KIOSK') {
    if (!input.kioskCode || !verifyKioskCode(store!.kioskSecret, input.kioskCode)) {
      throw new AppError(400, 'KIOSK_CODE_INVALID', 'That kiosk code has expired. Scan the QR at the staff entrance again.');
    }
  } else if (input.method === 'APP' && settings.geofenceMeters > 0 && input.lat !== undefined && input.lng !== undefined) {
    const meters = haversineKm({ lat: input.lat, lng: input.lng }, store!) * 1000;
    if (meters > settings.geofenceMeters) {
      throw new AppError(
        400,
        'OUTSIDE_STORE',
        `You appear to be ${Math.round(meters)} m from the store. Clock in at the store or scan the kiosk QR.`,
      );
    }
  }
  const now = new Date();
  const shift = await matchShift(actor.employeeId, now);
  const times = computeTimes(now, null, shift);
  let recordId: string;
  try {
    const [record] = await db
      .insert(attendanceRecords)
      .values({
        storeId: actor.storeId,
        employeeId: actor.employeeId,
        shiftId: shift?.id ?? null,
        clockInAt: now,
        clockInMethod: input.method,
        clockInLat: input.lat ?? null,
        clockInLng: input.lng ?? null,
        lateByMinutes: times.lateByMinutes,
        notes: input.note ?? null,
      })
      .returning({ id: attendanceRecords.id });
    recordId = record!.id;
  } catch (error) {
    if ((error as { cause?: { code?: string } }).cause?.code === '23505')
      throw conflict('You are already clocked in', 'ALREADY_CLOCKED_IN');
    throw error;
  }
  broadcast.toStoreOps(actor.storeId, SocketEvents.ATTENDANCE_CHANGED, { employeeId: actor.employeeId });
  return loadAttendance(recordId);
}

export async function clockOut(actor: StaffActor, input: { method: ClockMethod; note?: string }): Promise<AttendanceRecord> {
  const [open] = await db
    .select()
    .from(attendanceRecords)
    .where(and(eq(attendanceRecords.employeeId, actor.employeeId), isNull(attendanceRecords.clockOutAt)))
    .limit(1);
  if (!open) throw conflict('You are not clocked in', 'NOT_CLOCKED_IN');
  const shift = open.shiftId ? ((await db.select().from(shifts).where(eq(shifts.id, open.shiftId)).limit(1))[0] ?? null) : null;
  const now = new Date();
  const times = computeTimes(open.clockInAt, now, shift);
  await db
    .update(attendanceRecords)
    .set({
      clockOutAt: now,
      clockOutMethod: input.method,
      workedMinutes: times.workedMinutes,
      leftEarlyByMinutes: times.leftEarlyByMinutes,
      notes: input.note ? [open.notes, input.note].filter(Boolean).join(' · ') : open.notes,
    })
    .where(eq(attendanceRecords.id, open.id));
  broadcast.toStoreOps(actor.storeId, SocketEvents.ATTENDANCE_CHANGED, { employeeId: actor.employeeId });
  return loadAttendance(open.id);
}

export async function loadAttendance(recordId: string): Promise<AttendanceRecord> {
  const [row] = await attendanceQuery(db).where(eq(attendanceRecords.id, recordId)).limit(1);
  if (!row) throw notFound('Attendance record');
  return serializeAttendance(row);
}

export async function myAttendance(actor: StaffActor): Promise<MyAttendance> {
  const today = zonedParts(new Date(), actor.timezone).date;
  const [openRow] = await attendanceQuery(db)
    .where(and(eq(attendanceRecords.employeeId, actor.employeeId), isNull(attendanceRecords.clockOutAt)))
    .limit(1);
  const upcoming = await listShifts(actor.storeId, today, addDays(today, 7), actor.employeeId);
  const recentRows = await attendanceQuery(db)
    .where(eq(attendanceRecords.employeeId, actor.employeeId))
    .orderBy(desc(attendanceRecords.clockInAt))
    .limit(14);
  const weekStart = zonedRange(addDays(today, -6), today, actor.timezone).start;
  const recent = recentRows.map(serializeAttendance);
  return {
    open: openRow ? serializeAttendance(openRow) : null,
    todayShift: upcoming.find((s) => s.date === today) ?? null,
    upcoming: upcoming.filter((s) => new Date(s.endAt) > new Date()).slice(0, 7),
    recent,
    weekMinutes: recent.filter((r) => new Date(r.clockInAt) >= weekStart).reduce((sum, r) => sum + r.workedMinutes, 0),
  };
}

export async function attendanceBoard(storeId: string, date: string, timezone: string): Promise<AttendanceBoard> {
  const { start, end } = zonedRange(date, date, timezone);
  const rows = await attendanceQuery(db)
    .where(
      and(
        eq(attendanceRecords.storeId, storeId),
        or(and(gte(attendanceRecords.clockInAt, start), lt(attendanceRecords.clockInAt, end)), isNull(attendanceRecords.clockOutAt)),
      ),
    )
    .orderBy(asc(attendanceRecords.clockInAt));
  const records = rows.map(serializeAttendance);
  const dayShifts = await listShifts(storeId, date, date);
  const now = new Date();
  return {
    date,
    onDuty: records.filter((r) => !r.clockOutAt),
    completed: records.filter((r) => r.clockOutAt),
    notYetIn: dayShifts.filter(
      (s) => !s.attendance && new Date(s.startAt) <= new Date(now.getTime() + 60 * 60_000) && new Date(s.endAt) > now,
    ),
  };
}

export async function attendanceRecordsInRange(storeId: string, from: string, to: string, timezone: string, employeeId?: string) {
  const { start, end } = zonedRange(from, to, timezone);
  const rows = await attendanceQuery(db)
    .where(
      and(
        eq(attendanceRecords.storeId, storeId),
        gte(attendanceRecords.clockInAt, start),
        lt(attendanceRecords.clockInAt, end),
        employeeId ? eq(attendanceRecords.employeeId, employeeId) : undefined,
      ),
    )
    .orderBy(desc(attendanceRecords.clockInAt))
    .limit(2000);
  return rows.map(serializeAttendance);
}

/** Who worked how many hours and days, who was late, and the estimated pay for the period. */
export async function attendanceSummary(
  storeId: string,
  from: string,
  to: string,
  timezone: string,
  showPay: boolean,
): Promise<AttendanceSummaryRow[]> {
  const team = await db
    .select()
    .from(employees)
    .where(and(eq(employees.storeId, storeId), inArray(employees.status, ['ACTIVE', 'ON_LEAVE']), sql`${employees.role} <> 'OWNER'`))
    .orderBy(asc(employees.fullName));
  const records = await attendanceRecordsInRange(storeId, from, to, timezone);
  const today = zonedParts(new Date(), timezone).date;
  const plannedShifts = await listShifts(storeId, from, to < today ? to : today);
  return team.map((employee) => {
    const mine = records.filter((r) => r.employee.id === employee.id);
    const myShifts = plannedShifts.filter((s) => s.employee.id === employee.id && new Date(s.startAt) < new Date());
    const daysPresent = new Set(mine.map((r) => zonedParts(new Date(r.clockInAt), timezone).date)).size;
    const minutesWorked = mine.reduce((sum, r) => sum + r.workedMinutes, 0);
    const scheduledMinutes = myShifts.reduce(
      (sum, s) => sum + Math.max(0, minutesBetween(new Date(s.startAt), new Date(s.endAt)) - s.breakMinutes),
      0,
    );
    const avg = (values: string[]) => {
      if (values.length === 0) return null;
      const minutes = values.map(minutesOfDay);
      const mean = Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length);
      return `${String(Math.floor(mean / 60)).padStart(2, '0')}:${String(mean % 60).padStart(2, '0')}`;
    };
    let estimatedPay: number | null = null;
    if (showPay) {
      if (employee.wageType === 'HOURLY') estimatedPay = Math.round((minutesWorked / 60) * employee.wageAmount);
      else if (employee.wageType === 'DAILY') estimatedPay = daysPresent * employee.wageAmount;
      else estimatedPay = Math.round((employee.wageAmount / 26) * daysPresent);
    }
    return {
      employee: employeeRef(employee),
      daysScheduled: myShifts.length,
      daysPresent,
      absences: Math.max(0, myShifts.filter((s) => !s.attendance).length),
      lateDays: mine.filter((r) => r.lateByMinutes > 0).length,
      minutesWorked,
      scheduledMinutes,
      overtimeMinutes: Math.max(0, minutesWorked - scheduledMinutes),
      avgClockIn: avg(mine.map((r) => zonedParts(new Date(r.clockInAt), timezone).time)),
      avgClockOut: avg(mine.filter((r) => r.clockOutAt).map((r) => zonedParts(new Date(r.clockOutAt!), timezone).time)),
      estimatedPay,
    };
  });
}

export async function manualAttendance(
  actor: StaffActor,
  input: { employeeId: string; clockInAt: string; clockOutAt?: string; note: string },
): Promise<AttendanceRecord> {
  if (STAFF_ROLE_RANK[actor.role] < STAFF_ROLE_RANK.STORE_MANAGER) throw forbidden('Only store managers can correct attendance');
  const [employee] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.id, input.employeeId), eq(employees.storeId, actor.storeId)))
    .limit(1);
  if (!employee) throw notFound('Employee');
  const clockInAt = new Date(input.clockInAt);
  const clockOutAt = input.clockOutAt ? new Date(input.clockOutAt) : null;
  if (clockOutAt && clockOutAt <= clockInAt) throw badRequest('Clock-out must be after clock-in');
  const shift = await matchShift(input.employeeId, clockInAt);
  const times = computeTimes(clockInAt, clockOutAt, shift);
  const [record] = await db
    .insert(attendanceRecords)
    .values({
      storeId: actor.storeId,
      employeeId: input.employeeId,
      shiftId: shift?.id ?? null,
      clockInAt,
      clockOutAt,
      clockInMethod: 'MANUAL',
      clockOutMethod: clockOutAt ? 'MANUAL' : null,
      ...times,
      notes: input.note,
      editedById: actor.userId,
    })
    .returning({ id: attendanceRecords.id });
  broadcast.toStoreOps(actor.storeId, SocketEvents.ATTENDANCE_CHANGED, { employeeId: input.employeeId });
  return loadAttendance(record!.id);
}

export async function correctAttendance(
  actor: StaffActor,
  recordId: string,
  input: { clockInAt?: string; clockOutAt?: string | null; note: string },
): Promise<AttendanceRecord> {
  if (STAFF_ROLE_RANK[actor.role] < STAFF_ROLE_RANK.STORE_MANAGER) throw forbidden('Only store managers can correct attendance');
  const [record] = await db
    .select()
    .from(attendanceRecords)
    .where(and(eq(attendanceRecords.id, recordId), eq(attendanceRecords.storeId, actor.storeId)))
    .limit(1);
  if (!record) throw notFound('Attendance record');
  const clockInAt = input.clockInAt ? new Date(input.clockInAt) : record.clockInAt;
  const clockOutAt = input.clockOutAt === undefined ? record.clockOutAt : input.clockOutAt ? new Date(input.clockOutAt) : null;
  if (clockOutAt && clockOutAt <= clockInAt) throw badRequest('Clock-out must be after clock-in');
  const shift = record.shiftId ? ((await db.select().from(shifts).where(eq(shifts.id, record.shiftId)).limit(1))[0] ?? null) : null;
  const times = computeTimes(clockInAt, clockOutAt, shift);
  await db
    .update(attendanceRecords)
    .set({
      clockInAt,
      clockOutAt,
      ...times,
      clockOutMethod: clockOutAt ? (record.clockOutMethod ?? 'MANUAL') : null,
      notes: [record.notes, `Corrected by ${actor.name}: ${input.note}`].filter(Boolean).join(' · '),
      editedById: actor.userId,
    })
    .where(eq(attendanceRecords.id, recordId));
  broadcast.toStoreOps(actor.storeId, SocketEvents.ATTENDANCE_CHANGED, { employeeId: record.employeeId });
  return loadAttendance(recordId);
}
