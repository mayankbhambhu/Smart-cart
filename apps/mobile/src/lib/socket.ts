import type { SocketEventName } from '@smartcart/shared';
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { refreshSession } from './api';
import { useAuth, type Realm } from './auth';
import { API_URL } from './config';

const sockets = new Map<Realm, Socket>();

function currentToken(realm: Realm): string | undefined {
  return useAuth.getState().sessions[realm]?.accessToken;
}

export function getSocket(realm: Realm): Socket | null {
  if (!currentToken(realm)) return null;
  let socket = sockets.get(realm);
  if (!socket) {
    socket = io(API_URL, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: (cb) => cb({ token: currentToken(realm) }),
      reconnectionDelayMax: 8000,
    });
    socket.on('connect_error', async (error) => {
      if (error.message === 'UNAUTHORIZED' && (await refreshSession(realm))) socket?.connect();
    });
    sockets.set(realm, socket);
  }
  return socket;
}

useAuth.subscribe((state, previous) => {
  for (const realm of Object.keys(previous.sessions) as Realm[]) {
    if (!state.sessions[realm]) {
      sockets.get(realm)?.close();
      sockets.delete(realm);
    }
  }
});

export function useSocketEvent<T>(realm: Realm, event: SocketEventName, handler: (payload: T) => void): void {
  const signedIn = useAuth((state) => Boolean(state.sessions[realm]));
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
  }, [realm, event, signedIn]);
}

export function useRoom(realm: Realm, joinEvent: SocketEventName, leaveEvent: SocketEventName | null, id: string | null | undefined): void {
  const signedIn = useAuth((state) => Boolean(state.sessions[realm]));
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
  }, [realm, joinEvent, leaveEvent, id, signedIn]);
}
