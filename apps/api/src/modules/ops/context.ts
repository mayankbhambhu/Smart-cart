import type { Request } from 'express';
import { STAFF_ROLE_RANK, type StaffRole } from '@smartcart/shared';
import { forbidden } from '../../lib/errors';
import type { StaffActor } from '../../services/workforce';

/** The signed-in staff member, as resolved by `requireStaff` for this store. */
export function actorOf(req: Request): StaffActor {
  const staff = req.staff!;
  return {
    userId: req.auth!.userId,
    employeeId: staff.employeeId,
    storeId: staff.storeId,
    role: staff.role,
    name: staff.name,
    timezone: staff.timezone,
  };
}

export function atLeast(req: Request, role: StaffRole): boolean {
  return STAFF_ROLE_RANK[req.staff!.role] >= STAFF_ROLE_RANK[role];
}

export function requireAtLeast(req: Request, role: StaffRole, message?: string): void {
  if (!atLeast(req, role)) throw forbidden(message);
}

/** Wages and salaries are only visible to the owner and the store manager. */
export function canSeeWages(req: Request): boolean {
  return atLeast(req, 'STORE_MANAGER');
}
