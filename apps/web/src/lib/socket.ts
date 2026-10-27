import type { SocketEventName } from '@smartcart/shared';
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_BASE, refreshSession } from './api';
import { currentToken, useAuth, type Realm } from './auth';

const sockets = new Map<Realm, Socket>();

/** One Socket.IO connection per signed-in realm; reconnects pick up the latest token. */
export function getSocket(realm: Realm): Socket | null {
  if (!currentToken(realm)) return null;
  let socket = sockets.get(realm);
  if (!socket) {
    socket = io(API_BASE || undefined, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: (cb) => cb({ token: currentToken(realm) }),
      reconnectionDelayMax: 8000,
    });
    socket.on('connect_error', async (error) => {
      if (error.message === 'UNAUTHORIZED') {
        const session = await refreshSession(realm);
        if (session) socket?.connect();
      }
    });
    sockets.set(realm, socket);
  }
  return socket;
}

export function closeSocket(realm: Realm): void {
  sockets.get(realm)?.close();
  sockets.delete(realm);
}

// Drop the connection when a realm signs out.
useAuth.subscribe((state, previous) => {
  for (const realm of Object.keys(previous.sessions) as Realm[]) {
    if (!state.sessions[realm]) closeSocket(realm);
  }
});

/** Subscribes to a server event while the component is mounted. */
export function useSocketEvent<T>(realm: Realm, event: SocketEventName, handler: (payload: T) => void): void {
  const token = useAuth((state) => state.sessions[realm]?.accessToken);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const socket = getSocket(realm);
    if (!socket) return;
    const listener = (payload: T) => ref.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [realm, event, Boolean(token)]);
}

/** Joins a room (list, order, session, store) for as long as the component is mounted. */
export function useRoom(realm: Realm, joinEvent: SocketEventName, leaveEvent: SocketEventName | null, id: string | null | undefined): void {
  const token = useAuth((state) => state.sessions[realm]?.accessToken);
  useEffect(() => {
    if (!id) return;
    const socket = getSocket(realm);
    if (!socket) return;
    const join = () => socket.emit(joinEvent, id);
    if (socket.connected) join();
    socket.on('connect', join);
    return () => {
      socket.off('connect', join);
      if (leaveEvent) socket.emit(leaveEvent, id);
    };
  }, [realm, joinEvent, leaveEvent, id, Boolean(token)]);
}

/** Subscribes one handler to several server events (e.g. "anything changed in the store"). */
export function useSocketEvents(
  realm: Realm,
  events: SocketEventName[],
  handler: (event: SocketEventName, payload: unknown) => void,
): void {
  const token = useAuth((state) => state.sessions[realm]?.accessToken);
  const ref = useRef(handler);
  ref.current = handler;
  const key = events.join('|');
  useEffect(() => {
    const socket = getSocket(realm);
    if (!socket) return;
    const listeners = key.split('|').map((event) => {
      const listener = (payload: unknown) => ref.current(event as SocketEventName, payload);
      socket.on(event, listener);
      return [event, listener] as const;
    });
    return () => {
      for (const [event, listener] of listeners) socket.off(event, listener);
    };
  }, [realm, key, Boolean(token)]);
}
