import {
  CreateCredentialRequestSchema,
  CreateTicketSchema,
  CredentialRequestsQuerySchema,
  IdSchema,
  ReviewDecisionSchema,
  TicketMessageSchema,
  TicketsQuerySchema,
  UpdateCredentialRequestSchema,
  UpdateEmployeeSchema,
  EmployeesQuerySchema,
} from '@smartcart/shared';
import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { employees } from '../../db/schema';
import { forbidden, notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { allowRoles } from '../../middleware/auth';
import {
  cancelRequest,
  createRequest,
  getEmployee,
  listEmployees,
  listRequests,
  loadRequest,
  ownerReview,
  resubmitRequest,
  updateRequest,
} from '../../services/team';
import { addMessage, createTicket, listTickets, loadTicket } from '../../services/tickets';
import { canSeeWages } from './context';

export const opsTeamRouter = Router({ mergeParams: true });

// --- Employees ---------------------------------------------------------------------------

opsTeamRouter.get('/employees', async (req, res) => {
  const query = parse(EmployeesQuerySchema, req.query);
  const statuses = query.status.length > 0 ? query.status : (['ACTIVE', 'ON_LEAVE'] as const);
  const { items } = await listEmployees(
    db,
    { storeId: req.staff!.storeId, role: query.role, statuses: [...statuses], q: query.q, limit: query.limit, offset: query.offset },
    canSeeWages(req),
  );
  res.json(items);
});

opsTeamRouter.get('/employees/:employeeId', async (req, res) => {
  const employeeId = parse(IdSchema, req.params.employeeId);
  const employee = await getEmployee(employeeId, canSeeWages(req));
  if (employee.storeId !== req.staff!.storeId) throw notFound('Employee');
  res.json(employee);
});

opsTeamRouter.patch('/employees/:employeeId', allowRoles('OWNER', 'STORE_MANAGER'), async (req, res) => {
  const employeeId = parse(IdSchema, req.params.employeeId);
  const input = parse(UpdateEmployeeSchema, req.body);
  const [target] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.storeId, req.staff!.storeId)))
    .limit(1);
  if (!target) throw notFound('Employee');
  if (target.role === 'OWNER' || (req.staff!.role === 'STORE_MANAGER' && target.role === 'STORE_MANAGER' && target.id !== req.staff!.employeeId)) {
    throw forbidden('You cannot edit this person’s record');
  }
  if (req.staff!.role === 'STORE_MANAGER' && target.id === req.staff!.employeeId && (input.wageAmount !== undefined || input.wageType !== undefined)) {
    throw forbidden('Ask the store owner to change your own wage');
  }
  await db.update(employees).set(input).where(eq(employees.id, employeeId));
  res.json(await getEmployee(employeeId, true));
});

// --- Login (onboarding) requests ---------------------------------------------------------

const leadership = allowRoles('OWNER', 'STORE_MANAGER');

function actor(req: Parameters<typeof canSeeWages>[0]) {
  return { userId: req.auth!.userId, name: req.staff!.name, role: req.staff!.role };
}

opsTeamRouter.get('/requests', leadership, async (req, res) => {
  const query = parse(CredentialRequestsQuerySchema, req.query);
  res.json((await listRequests({ storeId: req.staff!.storeId, statuses: query.status, q: query.q, limit: query.limit, offset: query.offset })).items);
});

opsTeamRouter.post('/requests', leadership, async (req, res) => {
  const input = parse(CreateCredentialRequestSchema, req.body);
  res.status(201).json(await createRequest(req.staff!.storeId, actor(req), input));
});

opsTeamRouter.get('/requests/:requestId', leadership, async (req, res) => {
  const requestId = parse(IdSchema, req.params.requestId);
  const request = await loadRequest(db, requestId);
  if (request.storeId !== req.staff!.storeId) throw notFound('Request');
  res.json(request);
});

opsTeamRouter.patch('/requests/:requestId', leadership, async (req, res) => {
  const requestId = parse(IdSchema, req.params.requestId);
  const input = parse(UpdateCredentialRequestSchema, req.body);
  res.json(await updateRequest(requestId, req.staff!.storeId, actor(req), input));
});

opsTeamRouter.post('/requests/:requestId/resubmit', leadership, async (req, res) => {
  const requestId = parse(IdSchema, req.params.requestId);
  const { comment } = parse(z.object({ comment: z.string().trim().max(1000).optional() }), req.body);
  res.json(await resubmitRequest(requestId, req.staff!.storeId, actor(req), comment));
});

opsTeamRouter.post('/requests/:requestId/review', allowRoles('OWNER'), async (req, res) => {
  const requestId = parse(IdSchema, req.params.requestId);
  const { decision, comment } = parse(ReviewDecisionSchema, req.body);
  res.json(await ownerReview(requestId, req.staff!.storeId, actor(req), decision, comment));
});

opsTeamRouter.post('/requests/:requestId/cancel', leadership, async (req, res) => {
  const requestId = parse(IdSchema, req.params.requestId);
  res.json(await cancelRequest(requestId, req.staff!.storeId, actor(req)));
});

// --- Requests to the SmartCart team (tickets) -----------------------------------------------

const managers = allowRoles('OWNER', 'STORE_MANAGER', 'FLOOR_MANAGER');

opsTeamRouter.get('/tickets', managers, async (req, res) => {
  const query = parse(TicketsQuerySchema, req.query);
  res.json(await listTickets({ storeId: req.staff!.storeId, statuses: query.status, category: query.category, limit: query.limit }));
});

opsTeamRouter.post('/tickets', managers, async (req, res) => {
  const input = parse(CreateTicketSchema, req.body);
  res.status(201).json(await createTicket(req.staff!.storeId, actor(req), input));
});

opsTeamRouter.get('/tickets/:ticketId', managers, async (req, res) => {
  const ticketId = parse(IdSchema, req.params.ticketId);
  const ticket = await loadTicket(ticketId, false);
  if (ticket.storeId !== req.staff!.storeId) throw notFound('Ticket');
  res.json(ticket);
});

opsTeamRouter.post('/tickets/:ticketId/messages', managers, async (req, res) => {
  const ticketId = parse(IdSchema, req.params.ticketId);
  const { body } = parse(TicketMessageSchema, req.body);
  const ticket = await loadTicket(ticketId, false);
  if (ticket.storeId !== req.staff!.storeId) throw notFound('Ticket');
  const updated = await addMessage(ticketId, { userId: req.auth!.userId, name: req.staff!.name, side: 'STORE' }, body, false);
  res.json({ ...updated, messages: updated.messages.filter((m) => !m.isInternal) });
});
