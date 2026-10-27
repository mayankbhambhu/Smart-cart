import { SocketEvents, STAFF_ROLE_RANK, type SocketEventName, type StaffMembership, type StaffRole } from '@smartcart/shared';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { staffApi, type QueryParams } from './api';
import { useSession } from './auth';
import { useRoom, useSocketEvent } from './socket';
import { useStaffStore } from './stores';

export interface StaffContext {
  storeId: string;
  membership: StaffMembership;
  memberships: StaffMembership[];
  role: StaffRole;
  /** OWNER or STORE_MANAGER */
  isLeadership: boolean;
  /** Leadership plus floor managers: assign and review work. */
  isSupervisor: boolean;
  get: <T>(path: string, query?: QueryParams) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
  patch: <T>(path: string, body?: unknown) => Promise<T>;
}

/** The store the signed-in employee is working in, with role-aware helpers. Null until signed in. */
export function useStaff(): StaffContext | null {
  const session = useSession('STAFF');
  const selected = useStaffStore((s) => s.storeId);
  const memberships = session?.memberships ?? [];
  const membership = memberships.find((m) => m.storeId === selected) ?? memberships[0];
  if (!session || !membership) return null;
  const rank = STAFF_ROLE_RANK[membership.role];
  const base = `/ops/stores/${membership.storeId}`;
  return {
    storeId: membership.storeId,
    membership,
    memberships,
    role: membership.role,
    isLeadership: rank >= STAFF_ROLE_RANK.STORE_MANAGER,
    isSupervisor: rank >= STAFF_ROLE_RANK.FLOOR_MANAGER,
    get: (path, query) => staffApi.get(`${base}${path}`, query),
    post: (path, body) => staffApi.post(`${base}${path}`, body),
    patch: (path, body) => staffApi.patch(`${base}${path}`, body),
  };
}

/** Joins the store's live operations room. */
export function useStoreRoom(storeId: string | undefined): void {
  useRoom('STAFF', SocketEvents.JOIN_STORE_OPS, null, storeId);
}

/** Refetches the given queries when the event fires, at most once per `throttleMs`. */
export function useLiveInvalidate(event: SocketEventName, keys: QueryKey[], throttleMs = 800): void {
  const queryClient = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keysRef = useRef(keys);
  keysRef.current = keys;
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useSocketEvent('STAFF', event, () => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      for (const key of keysRef.current) void queryClient.invalidateQueries({ queryKey: key });
    }, throttleMs);
  });
}
