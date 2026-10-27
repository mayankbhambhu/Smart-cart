import {
  SocketEvents,
  STAFF_ROLE_RANK,
  type Employee,
  type SocketEventName,
  type StaffMembership,
  type StaffRole,
} from '@smartcart/shared';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { staffApi, type RequestOptions } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { useRoom, useSocketEvents } from '@/lib/socket';
import { useOpsStore } from '@/lib/stores';

export interface OpsContext {
  storeId: string;
  membership: StaffMembership;
  memberships: StaffMembership[];
  role: StaffRole;
  /** OWNER or STORE_MANAGER: plans shifts, sees wages and analytics, raises login requests. */
  isLeadership: boolean;
  /** Leadership plus floor managers: assign work, see the attendance board. */
  isSupervisor: boolean;
  isOwner: boolean;
  atLeast: (role: StaffRole) => boolean;
  /** "/ops/stores/:storeId" + path */
  path: (path: string) => string;
  get: <T>(path: string, options?: RequestOptions) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
  patch: <T>(path: string, body?: unknown) => Promise<T>;
  put: <T>(path: string, body?: unknown) => Promise<T>;
  del: <T>(path: string) => Promise<T>;
}

/** The store the signed-in employee is working in, with role-aware helpers. */
export function useOps(): OpsContext {
  const session = useSession('STAFF');
  const selected = useOpsStore((s) => s.storeId);
  const memberships = session?.memberships ?? [];
  const membership = memberships.find((m) => m.storeId === selected) ?? memberships[0];
  if (!membership) throw new Error('This account is not assigned to any store');
  const storeId = membership.storeId;
  const rank = STAFF_ROLE_RANK[membership.role];
  const path = (p: string) => `/ops/stores/${storeId}${p}`;
  return {
    storeId,
    membership,
    memberships,
    role: membership.role,
    isLeadership: rank >= STAFF_ROLE_RANK.STORE_MANAGER,
    isSupervisor: rank >= STAFF_ROLE_RANK.FLOOR_MANAGER,
    isOwner: membership.role === 'OWNER',
    atLeast: (role) => rank >= STAFF_ROLE_RANK[role],
    path,
    get: (p, options) => staffApi.get(path(p), options),
    post: (p, body) => staffApi.post(path(p), body),
    patch: (p, body) => staffApi.patch(path(p), body),
    put: (p, body) => staffApi.put(path(p), body),
    del: (p) => staffApi.delete(path(p)),
  };
}

/** Joins the store's live operations room. */
export function useStoreRoom(storeId: string): void {
  useRoom('STAFF', SocketEvents.JOIN_STORE_OPS, null, storeId);
}

/**
 * Refetches the given queries when any of the events fire, at most once per
 * `throttleMs` (a busy store emits many inventory and session events).
 */
export function useLiveInvalidate(events: SocketEventName[], keys: QueryKey[], throttleMs = 1500): void {
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
  useSocketEvents('STAFF', events, () => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      for (const key of keysRef.current) void queryClient.invalidateQueries({ queryKey: key });
    }, throttleMs);
  });
}

export function useEmployees(storeId: string, options: { includeInactive?: boolean } = {}) {
  return useQuery({
    queryKey: ['ops-employees', storeId, options.includeInactive ?? false],
    queryFn: () =>
      staffApi.get<Employee[]>(`/ops/stores/${storeId}/employees`, {
        query: { limit: 200, status: options.includeInactive ? 'ACTIVE,ON_LEAVE,LEFT,TERMINATED' : undefined },
      }),
    staleTime: 60_000,
  });
}

/** Employees the current user may assign work to (managers: floor managers + workers; floor managers: workers). */
export function assignableEmployees(employees: Employee[], ops: Pick<OpsContext, 'role' | 'membership'>): Employee[] {
  return employees.filter((e) => {
    if (e.status !== 'ACTIVE' || !e.userId) return false;
    if (e.id === ops.membership.employeeId) return true;
    if (ops.role === 'OWNER' || ops.role === 'STORE_MANAGER') return e.role === 'FLOOR_MANAGER' || e.role === 'WORKER';
    if (ops.role === 'FLOOR_MANAGER') return e.role === 'WORKER';
    return false;
  });
}
