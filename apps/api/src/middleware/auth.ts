import { STAFF_ROLE_RANK, type AdminRole, type StaffRole, type UserKind } from '@smartcart/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import { db } from '../db/client';
import { devices, employees, stores, users } from '../db/schema';
import { sha256 } from '../lib/crypto';
import { AppError, forbidden, unauthorized } from '../lib/errors';
import { verifyAccessToken } from '../lib/jwt';

/** Attaches `req.auth` when a valid bearer token is present. Never rejects anonymous requests. */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  const user = await resolveToken(header.slice(7).trim());
  req.auth = user;
  next();
}

export async function resolveToken(token: string): Promise<NonNullable<Request['auth']>> {
  let claims;
  try {
    claims = await verifyAccessToken(token);
  } catch {
    throw new AppError(401, 'TOKEN_EXPIRED', 'Your session has expired, please sign in again');
  }
  const [user] = await db
    .select({
      id: users.id,
      kind: users.kind,
      name: users.name,
      status: users.status,
      tokenVersion: users.tokenVersion,
      adminRole: users.adminRole,
    })
    .from(users)
    .where(eq(users.id, claims.sub))
    .limit(1);
  if (!user || user.tokenVersion !== claims.ver) {
    throw new AppError(401, 'TOKEN_REVOKED', 'Your session has ended, please sign in again');
  }
  if (user.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been deactivated');
  return { userId: user.id, kind: user.kind, name: user.name, adminRole: user.adminRole };
}

export function requireAuth(...kinds: UserKind[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) throw unauthorized();
    if (kinds.length > 0 && !kinds.includes(req.auth.kind)) throw forbidden('This area is not available for your account type');
    next();
  };
}

export const requireCustomer = requireAuth('CUSTOMER');

export function requireAdmin(...roles: AdminRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) throw unauthorized();
    if (req.auth.kind !== 'ADMIN') throw forbidden('Admin console access only');
    if (roles.length > 0 && (!req.auth.adminRole || !roles.includes(req.auth.adminRole))) {
      throw forbidden('Your admin role cannot perform this action');
    }
    next();
  };
}

/**
 * For routes mounted under /ops/stores/:storeId. Verifies the signed-in staff
 * member actively works at that store and attaches their role.
 */
export async function requireStaff(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.auth) throw unauthorized();
  if (req.auth.kind !== 'STAFF') throw forbidden('Store operations are only available to store staff');
  const storeId = typeof req.params.storeId === 'string' ? req.params.storeId : '';
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) throw new AppError(400, 'BAD_REQUEST', 'Invalid store id');
  const [membership] = await db
    .select({
      employeeId: employees.id,
      role: employees.role,
      department: employees.department,
      name: employees.fullName,
      timezone: stores.timezone,
    })
    .from(employees)
    .innerJoin(stores, eq(stores.id, employees.storeId))
    .where(and(eq(employees.userId, req.auth.userId), eq(employees.storeId, storeId), inArray(employees.status, ['ACTIVE', 'ON_LEAVE'])))
    .limit(1);
  if (!membership) throw forbidden('You are not part of this store’s team');
  req.staff = { ...membership, storeId };
  next();
}

/** Allows only the listed store roles (checked after `requireStaff`). */
export function allowRoles(...roles: StaffRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.staff || !roles.includes(req.staff.role)) throw forbidden('Your role cannot perform this action');
    next();
  };
}

export function hasRank(role: StaffRole, minimum: StaffRole): boolean {
  return STAFF_ROLE_RANK[role] >= STAFF_ROLE_RANK[minimum];
}

/** Authenticates hardware with the `X-Device-Key` header. */
export async function requireDevice(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const key = req.header('x-device-key');
  if (!key) throw new AppError(401, 'DEVICE_KEY_REQUIRED', 'Missing X-Device-Key header');
  const [device] = await db
    .select({ id: devices.id, storeId: devices.storeId, type: devices.type, name: devices.name, isActive: devices.isActive })
    .from(devices)
    .where(eq(devices.apiKeyHash, sha256(key)))
    .limit(1);
  if (!device || !device.isActive) throw new AppError(401, 'DEVICE_KEY_INVALID', 'Unknown or disabled device');
  req.device = { id: device.id, storeId: device.storeId, type: device.type, name: device.name };
  await db.update(devices).set({ lastSeenAt: new Date() }).where(eq(devices.id, device.id));
  next();
}

export function clientIp(req: Request): string | null {
  return req.ip ?? null;
}
