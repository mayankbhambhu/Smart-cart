import {
  IdSchema,
  SessionAddItemSchema,
  SessionCheckoutSchema,
  SessionLinkListSchema,
  SessionUpdateItemSchema,
  StartSessionSchema,
} from '@smartcart/shared';
import { Router } from 'express';
import { parse } from '../../lib/validate';
import { requireCustomer } from '../../middleware/auth';
import {
  activeSessionFor,
  addItem,
  checkout,
  endSession,
  linkList,
  ownSession,
  resume,
  serializeSession,
  setItemQuantity,
  startSession,
  unpairCart,
} from '../../services/sessions';
import { db } from '../../db/client';

/** Scan & Go: the customer's in-store shopping session (their "smart cart"). */
export const instoreRouter = Router();
instoreRouter.use(requireCustomer);

instoreRouter.get('/session', async (req, res) => {
  res.json({ session: await activeSessionFor(req.auth!.userId) });
});

instoreRouter.post('/sessions', async (req, res) => {
  const input = parse(StartSessionSchema, req.body);
  res.status(201).json(await startSession(req.auth!.userId, input.storeId, input.listId));
});

instoreRouter.get('/sessions/:sessionId', async (req, res) => {
  const sessionId = parse(IdSchema, req.params.sessionId);
  await ownSession(sessionId, req.auth!.userId);
  res.json(await serializeSession(db, sessionId));
});

instoreRouter.post('/sessions/:sessionId/items', async (req, res) => {
  const sessionId = parse(IdSchema, req.params.sessionId);
  const input = parse(SessionAddItemSchema, req.body);
  await ownSession(sessionId, req.auth!.userId);
  res.status(201).json(await addItem(sessionId, input, 'APP', req.auth!.userId));
});

instoreRouter.patch('/sessions/:sessionId/items/:itemId', async (req, res) => {
  const sessionId = parse(IdSchema, req.params.sessionId);
  const itemId = parse(IdSchema, req.params.itemId);
  const { quantity } = parse(SessionUpdateItemSchema, req.body);
  await ownSession(sessionId, req.auth!.userId);
  res.json(await setItemQuantity(sessionId, itemId, quantity, 'APP', req.auth!.userId));
});

instoreRouter.delete('/sessions/:sessionId/items/:itemId', async (req, res) => {
  const sessionId = parse(IdSchema, req.params.sessionId);
  const itemId = parse(IdSchema, req.params.itemId);
  await ownSession(sessionId, req.auth!.userId);
  res.json(await setItemQuantity(sessionId, itemId, 0, 'APP', req.auth!.userId));
});

instoreRouter.put('/sessions/:sessionId/list', async (req, res) => {
  const sessionId = parse(IdSchema, req.params.sessionId);
  const { listId } = parse(SessionLinkListSchema, req.body);
  res.json(await linkList(sessionId, req.auth!.userId, listId));
});

instoreRouter.post('/sessions/:sessionId/checkout', async (req, res) => {
  const sessionId = parse(IdSchema, req.params.sessionId);
  const input = parse(SessionCheckoutSchema, req.body);
  res.json(await checkout(sessionId, req.auth!.userId, input));
});

instoreRouter.post('/sessions/:sessionId/resume', async (req, res) => {
  const sessionId = parse(IdSchema, req.params.sessionId);
  res.json(await resume(sessionId, req.auth!.userId));
});

instoreRouter.post('/sessions/:sessionId/cancel', async (req, res) => {
  const sessionId = parse(IdSchema, req.params.sessionId);
  await ownSession(sessionId, req.auth!.userId);
  await endSession(sessionId, 'ABANDONED', req.auth!.userId);
  res.json(await serializeSession(db, sessionId));
});

instoreRouter.post('/sessions/:sessionId/unpair', async (req, res) => {
  const sessionId = parse(IdSchema, req.params.sessionId);
  const session = await ownSession(sessionId, req.auth!.userId);
  if (session.cartDeviceId) await unpairCart(session.cartDeviceId);
  res.json(await serializeSession(db, sessionId));
});
