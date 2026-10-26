import { SocketEvents, type SocketEventName } from '@smartcart/shared';
import type { Server } from 'socket.io';

/**
 * Thin broadcasting layer over Socket.IO rooms. Until the HTTP server
 * attaches a Socket.IO instance (or in scripts like the seeder) every emit
 * is a no-op, so services can broadcast unconditionally.
 */

let io: Server | null = null;

export function attachIo(server: Server | null): void {
  io = server;
}

export const rooms = {
  user: (userId: string) => `user:${userId}`,
  storeOps: (storeId: string) => `store:${storeId}:ops`,
  list: (listId: string) => `list:${listId}`,
  order: (orderId: string) => `order:${orderId}`,
  session: (sessionId: string) => `session:${sessionId}`,
  admins: () => 'admins',
};

function emit(room: string, event: SocketEventName, payload: unknown): void {
  io?.to(room).emit(event, payload);
}

export const broadcast = {
  toUser: (userId: string, event: SocketEventName, payload: unknown) => emit(rooms.user(userId), event, payload),
  toUsers: (userIds: string[], event: SocketEventName, payload: unknown) => {
    if (io && userIds.length > 0) io.to(userIds.map(rooms.user)).emit(event, payload);
  },
  toStoreOps: (storeId: string, event: SocketEventName, payload: unknown) => emit(rooms.storeOps(storeId), event, payload),
  toList: (listId: string, event: SocketEventName, payload: unknown) => emit(rooms.list(listId), event, payload),
  toOrder: (orderId: string, event: SocketEventName, payload: unknown) => emit(rooms.order(orderId), event, payload),
  toSession: (sessionId: string, event: SocketEventName, payload: unknown) => emit(rooms.session(sessionId), event, payload),
  toAdmins: (event: SocketEventName, payload: unknown) => emit(rooms.admins(), event, payload),
  /** One emit to several rooms; a socket in more than one of them receives it once. */
  toRooms: (targets: string[], event: SocketEventName, payload: unknown) => {
    if (io && targets.length > 0) io.to(targets).emit(event, payload);
  },
};

export { SocketEvents };
