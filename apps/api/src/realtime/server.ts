import { createAdapter } from '@socket.io/redis-adapter';
import { SocketEvents } from '@smartcart/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { Server as HttpServer } from 'node:http';
import { Redis } from 'ioredis';
import { Server, type Socket } from 'socket.io';
import { env } from '../config/env';
import { db } from '../db/client';
import { employees, instoreSessions, listMembers, orders } from '../db/schema';
import { logger } from '../lib/logger';
import { resolveToken } from '../middleware/auth';
import { attachIo, rooms } from './emitter';

type Ack = ((response: { ok: boolean; error?: string }) => void) | undefined;
type SocketUser = Awaited<ReturnType<typeof resolveToken>>;

/**
 * Socket.IO server. Clients authenticate with their access token
 * (`auth: { token }`), are placed in their personal room automatically,
 * staff join their stores' operations rooms, admins join the admin room,
 * and lists / orders / sessions are joined on demand after an access check.
 */
export function createRealtime(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: env.CORS_ORIGINS, credentials: true },
    pingInterval: 20_000,
    pingTimeout: 20_000,
  });

  if (env.REDIS_URL) {
    const pub = new Redis(env.REDIS_URL);
    const sub = pub.duplicate();
    io.adapter(createAdapter(pub, sub));
    logger.info('Socket.IO using the Redis adapter');
  }

  io.use(async (socket, next) => {
    const header = socket.handshake.headers.authorization;
    const token = (socket.handshake.auth as { token?: string })?.token ?? (header?.startsWith('Bearer ') ? header.slice(7) : undefined);
    if (!token) return next(new Error('UNAUTHORIZED'));
    try {
      socket.data.user = await resolveToken(token);
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    void onConnection(socket).catch((error: unknown) => logger.error({ err: error }, 'socket connection setup failed'));
  });

  attachIo(io);
  return io;
}

async function onConnection(socket: Socket): Promise<void> {
  const user = socket.data.user as SocketUser;
  await socket.join(rooms.user(user.userId));
  if (user.kind === 'ADMIN') await socket.join(rooms.admins());
  if (user.kind === 'STAFF') {
    const memberships = await db
      .select({ storeId: employees.storeId })
      .from(employees)
      .where(and(eq(employees.userId, user.userId), inArray(employees.status, ['ACTIVE', 'ON_LEAVE'])));
    for (const m of memberships) await socket.join(rooms.storeOps(m.storeId));
  }

  const guard = (handler: (id: string) => Promise<boolean>, room: (id: string) => string) => async (id: unknown, ack: Ack) => {
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return ack?.({ ok: false, error: 'BAD_ID' });
    try {
      if (!(await handler(id))) return ack?.({ ok: false, error: 'FORBIDDEN' });
      await socket.join(room(id));
      ack?.({ ok: true });
    } catch (error) {
      logger.warn({ err: error }, 'socket join failed');
      ack?.({ ok: false, error: 'ERROR' });
    }
  };

  socket.on(
    SocketEvents.JOIN_LIST,
    guard(async (listId) => {
      const [member] = await db
        .select({ listId: listMembers.listId })
        .from(listMembers)
        .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, user.userId)))
        .limit(1);
      return Boolean(member);
    }, rooms.list),
  );
  socket.on(
    SocketEvents.JOIN_ORDER,
    guard(async (orderId) => {
      const [order] = await db.select({ userId: orders.userId, storeId: orders.storeId }).from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order) return false;
      if (order.userId === user.userId || user.kind === 'ADMIN') return true;
      return user.kind === 'STAFF' && socket.rooms.has(rooms.storeOps(order.storeId));
    }, rooms.order),
  );
  socket.on(
    SocketEvents.JOIN_SESSION,
    guard(async (sessionId) => {
      const [session] = await db.select({ userId: instoreSessions.userId }).from(instoreSessions).where(eq(instoreSessions.id, sessionId)).limit(1);
      return session?.userId === user.userId;
    }, rooms.session),
  );
  socket.on(
    SocketEvents.JOIN_STORE_OPS,
    guard(async (storeId) => user.kind === 'STAFF' && socket.rooms.has(rooms.storeOps(storeId)), rooms.storeOps),
  );
  socket.on(SocketEvents.LEAVE_LIST, (listId: unknown) => typeof listId === 'string' && void socket.leave(rooms.list(listId)));
  socket.on(SocketEvents.LEAVE_ORDER, (orderId: unknown) => typeof orderId === 'string' && void socket.leave(rooms.order(orderId)));
  socket.on(SocketEvents.LEAVE_SESSION, (sessionId: unknown) => typeof sessionId === 'string' && void socket.leave(rooms.session(sessionId)));
}
