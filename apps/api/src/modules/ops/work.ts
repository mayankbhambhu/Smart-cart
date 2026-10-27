import {
  ClockSchema,
  CompleteTaskSchema,
  CreateShiftsSchema,
  CreateTaskSchema,
  DateRangeQuerySchema,
  IdSchema,
  IsoDateSchema,
  ManualAttendanceSchema,
  ReviewTaskSchema,
  ShiftTemplateSchema,
  TasksQuerySchema,
  UpdateAttendanceSchema,
  UpdateShiftSchema,
  UpdateTaskSchema,
  type ShiftTemplate,
} from '@smartcart/shared';
import { and, asc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { shiftTemplates, stores } from '../../db/schema';
import { notFound } from '../../lib/errors';
import { zonedParts } from '../../lib/time';
import { parse } from '../../lib/validate';
import { allowRoles } from '../../middleware/auth';
import { currentKioskCode } from '../../services/kiosk';
import {
  attendanceBoard,
  attendanceRecordsInRange,
  attendanceSummary,
  clockIn,
  clockOut,
  completeTask,
  correctAttendance,
  createShifts,
  createTask,
  listShifts,
  listTasks,
  loadTask,
  manualAttendance,
  myAttendance,
  reviewTask,
  startTask,
  updateShift,
  updateTask,
} from '../../services/workforce';
import { actorOf, atLeast, canSeeWages } from './context';

export const opsWorkRouter = Router({ mergeParams: true });

// --- Tasks -------------------------------------------------------------------------------

opsWorkRouter.get('/tasks', async (req, res) => {
  const query = parse(TasksQuerySchema, req.query);
  res.json(await listTasks(actorOf(req), { scope: query.scope, statuses: query.status, assigneeId: query.assigneeId, limit: query.limit }));
});

opsWorkRouter.post('/tasks', async (req, res) => {
  const input = parse(CreateTaskSchema, req.body);
  res.status(201).json(await createTask(actorOf(req), input));
});

opsWorkRouter.get('/tasks/:taskId', async (req, res) => {
  const taskId = parse(IdSchema, req.params.taskId);
  const task = await loadTask(db, taskId);
  if (task.storeId !== req.staff!.storeId) throw notFound('Task');
  res.json(task);
});

opsWorkRouter.patch('/tasks/:taskId', async (req, res) => {
  const taskId = parse(IdSchema, req.params.taskId);
  res.json(await updateTask(actorOf(req), taskId, parse(UpdateTaskSchema, req.body)));
});

opsWorkRouter.post('/tasks/:taskId/start', async (req, res) => {
  const taskId = parse(IdSchema, req.params.taskId);
  res.json(await startTask(actorOf(req), taskId));
});

opsWorkRouter.post('/tasks/:taskId/complete', async (req, res) => {
  const taskId = parse(IdSchema, req.params.taskId);
  res.json(await completeTask(actorOf(req), taskId, parse(CompleteTaskSchema, req.body)));
});

opsWorkRouter.post('/tasks/:taskId/review', async (req, res) => {
  const taskId = parse(IdSchema, req.params.taskId);
  res.json(await reviewTask(actorOf(req), taskId, parse(ReviewTaskSchema, req.body)));
});

// --- Shifts ------------------------------------------------------------------------------

const planners = allowRoles('OWNER', 'STORE_MANAGER');

opsWorkRouter.get('/shift-templates', async (req, res) => {
  const rows = await db
    .select()
    .from(shiftTemplates)
    .where(eq(shiftTemplates.storeId, req.staff!.storeId))
    .orderBy(asc(shiftTemplates.startTime));
  const body: ShiftTemplate[] = rows.map((t) => ({
    id: t.id,
    name: t.name,
    startTime: t.startTime,
    endTime: t.endTime,
    breakMinutes: t.breakMinutes,
    color: t.color,
  }));
  res.json(body);
});

opsWorkRouter.post('/shift-templates', planners, async (req, res) => {
  const input = parse(ShiftTemplateSchema, req.body);
  const [row] = await db
    .insert(shiftTemplates)
    .values({
      storeId: req.staff!.storeId,
      name: input.name,
      startTime: input.startTime,
      endTime: input.endTime,
      breakMinutes: input.breakMinutes,
      ...(input.color ? { color: input.color } : {}),
    })
    .returning();
  res.status(201).json(row);
});

opsWorkRouter.delete('/shift-templates/:templateId', planners, async (req, res) => {
  const templateId = parse(IdSchema, req.params.templateId);
  await db.delete(shiftTemplates).where(and(eq(shiftTemplates.id, templateId), eq(shiftTemplates.storeId, req.staff!.storeId)));
  res.status(204).end();
});

opsWorkRouter.get('/shifts', async (req, res) => {
  const query = parse(DateRangeQuerySchema, req.query);
  // Workers and floor managers see their own roster; planners see everyone's.
  const employeeId = atLeast(req, 'STORE_MANAGER') ? query.employeeId : req.staff!.employeeId;
  res.json(await listShifts(req.staff!.storeId, query.from, query.to, employeeId));
});

opsWorkRouter.post('/shifts', planners, async (req, res) => {
  res.status(201).json(await createShifts(actorOf(req), parse(CreateShiftsSchema, req.body)));
});

opsWorkRouter.patch('/shifts/:shiftId', planners, async (req, res) => {
  const shiftId = parse(IdSchema, req.params.shiftId);
  res.json(await updateShift(actorOf(req), shiftId, parse(UpdateShiftSchema, req.body)));
});

opsWorkRouter.delete('/shifts/:shiftId', planners, async (req, res) => {
  const shiftId = parse(IdSchema, req.params.shiftId);
  await updateShift(actorOf(req), shiftId, { status: 'CANCELLED' });
  res.status(204).end();
});

// --- Attendance --------------------------------------------------------------------------

opsWorkRouter.get('/attendance/me', async (req, res) => {
  res.json(await myAttendance(actorOf(req)));
});

opsWorkRouter.post('/attendance/clock-in', async (req, res) => {
  res.status(201).json(await clockIn(actorOf(req), parse(ClockSchema, req.body)));
});

opsWorkRouter.post('/attendance/clock-out', async (req, res) => {
  const input = parse(ClockSchema, req.body);
  res.json(await clockOut(actorOf(req), { method: input.method, note: input.note }));
});

const supervisors = allowRoles('OWNER', 'STORE_MANAGER', 'FLOOR_MANAGER');

opsWorkRouter.get('/attendance/board', supervisors, async (req, res) => {
  const { date } = parse(z.object({ date: IsoDateSchema.optional() }), req.query);
  const day = date ?? zonedParts(new Date(), req.staff!.timezone).date;
  res.json(await attendanceBoard(req.staff!.storeId, day, req.staff!.timezone));
});

opsWorkRouter.get('/attendance', async (req, res) => {
  const query = parse(DateRangeQuerySchema, req.query);
  const employeeId = atLeast(req, 'FLOOR_MANAGER') ? query.employeeId : req.staff!.employeeId;
  res.json(await attendanceRecordsInRange(req.staff!.storeId, query.from, query.to, req.staff!.timezone, employeeId));
});

opsWorkRouter.get('/attendance/summary', supervisors, async (req, res) => {
  const query = parse(DateRangeQuerySchema, req.query);
  res.json(await attendanceSummary(req.staff!.storeId, query.from, query.to, req.staff!.timezone, canSeeWages(req)));
});

opsWorkRouter.post('/attendance', planners, async (req, res) => {
  res.status(201).json(await manualAttendance(actorOf(req), parse(ManualAttendanceSchema, req.body)));
});

opsWorkRouter.patch('/attendance/:recordId', planners, async (req, res) => {
  const recordId = parse(IdSchema, req.params.recordId);
  res.json(await correctAttendance(actorOf(req), recordId, parse(UpdateAttendanceSchema, req.body)));
});

/** Rotating QR for a browser tab opened in "kiosk mode" at the staff entrance. */
opsWorkRouter.get('/attendance/kiosk-code', planners, async (req, res) => {
  const [store] = await db.select({ kioskSecret: stores.kioskSecret }).from(stores).where(eq(stores.id, req.staff!.storeId)).limit(1);
  res.json(currentKioskCode(req.staff!.storeId, store!.kioskSecret));
});
