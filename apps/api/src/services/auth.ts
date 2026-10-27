import type { AuthSession, AuthUser, StaffMembership, UserKind } from '@smartcart/shared';
import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import type { CookieOptions, Request, Response } from 'express';
import { env } from '../config/env';
import { db, type Executor } from '../db/client';
import { customerProfiles, employees, refreshTokens, stores, users } from '../db/schema';
import { randomToken, sha256 } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { signAccessToken } from '../lib/jwt';

/** One refresh cookie per account type, so a shopper and a staff login can coexist in one browser. */
export function refreshCookieName(kind: UserKind): string {
  return `sc_refresh_${kind.toLowerCase()}`;
}

export type UserRow = typeof users.$inferSelect;

export function serializeUser(user: UserRow): AuthUser {
  return {
    id: user.id,
    kind: user.kind,
    name: user.name,
    email: user.email,
    phone: user.phone,
    username: user.username,
    avatarUrl: user.avatarUrl,
    adminRole: user.adminRole,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function loadMemberships(executor: Executor, userId: string): Promise<StaffMembership[]> {
  const rows = await executor
    .select({
      employeeId: employees.id,
      storeId: employees.storeId,
      storeCode: stores.code,
      storeName: stores.name,
      role: employees.role,
      department: employees.department,
      employeeCode: employees.employeeCode,
      designation: employees.designation,
    })
    .from(employees)
    .innerJoin(stores, eq(stores.id, employees.storeId))
    .where(and(eq(employees.userId, userId), inArray(employees.status, ['ACTIVE', 'ON_LEAVE'])))
    .orderBy(stores.name);
  return rows;
}

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
  };
}

export function clearRefreshCookie(res: Response, kind: UserKind): void {
  res.clearCookie(refreshCookieName(kind), { ...cookieOptions(), maxAge: undefined });
}

/** Issues an access token plus a rotating refresh token (cookie for web, body for mobile). */
export async function issueSession(user: UserRow, req: Request, res: Response, family: string = crypto.randomUUID()): Promise<AuthSession> {
  if (user.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been deactivated');
  const memberships = user.kind === 'STAFF' ? await loadMemberships(db, user.id) : [];
  if (user.kind === 'STAFF' && memberships.length === 0) {
    throw new AppError(403, 'NO_ACTIVE_EMPLOYMENT', 'Your staff account is no longer active at any store');
  }

  const { token: accessToken, expiresAt } = await signAccessToken({
    sub: user.id,
    kind: user.kind,
    ver: user.tokenVersion,
    adminRole: user.adminRole,
  });
  const refreshToken = randomToken(48);
  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: sha256(refreshToken),
    family,
    userAgent: req.get('user-agent')?.slice(0, 300) ?? null,
    ip: req.ip ?? null,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
  });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  if (user.kind === 'CUSTOMER') {
    await db.insert(customerProfiles).values({ userId: user.id }).onConflictDoNothing();
  }
  res.cookie(refreshCookieName(user.kind), refreshToken, cookieOptions());

  return {
    user: serializeUser(user),
    accessToken,
    refreshToken,
    accessTokenExpiresAt: expiresAt.toISOString(),
    memberships,
  };
}

/**
 * Exchanges a refresh token for a new session. Tokens are single-use: a
 * second use of the same token revokes the whole token family (theft).
 */
export async function rotateRefreshToken(token: string, req: Request, res: Response): Promise<AuthSession> {
  const hash = sha256(token);
  const [stored] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hash)).limit(1);
  if (!stored) throw new AppError(401, 'REFRESH_INVALID', 'Please sign in again');
  if (stored.revokedAt) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.family, stored.family), isNull(refreshTokens.revokedAt)));
    throw new AppError(401, 'REFRESH_REUSED', 'Please sign in again');
  }
  if (stored.expiresAt < new Date()) throw new AppError(401, 'REFRESH_EXPIRED', 'Please sign in again');

  const revoked = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.id, stored.id), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });
  if (revoked.length === 0) throw new AppError(401, 'REFRESH_REUSED', 'Please sign in again');

  const [user] = await db.select().from(users).where(eq(users.id, stored.userId)).limit(1);
  if (!user) throw new AppError(401, 'REFRESH_INVALID', 'Please sign in again');
  return issueSession(user, req, res, stored.family);
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, sha256(token)), isNull(refreshTokens.revokedAt)));
}

/** Signs a user out everywhere: revokes refresh tokens and invalidates access tokens. */
export async function revokeAllSessions(executor: Executor, userId: string): Promise<void> {
  await executor
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt), gt(refreshTokens.expiresAt, new Date())));
  const [user] = await executor.select({ v: users.tokenVersion }).from(users).where(eq(users.id, userId));
  if (user)
    await executor
      .update(users)
      .set({ tokenVersion: user.v + 1 })
      .where(eq(users.id, userId));
}

/** Mobile apps send the token in the body; browsers rely on the realm's httpOnly cookie. */
export function readRefreshToken(req: Request, bodyToken: string | undefined, realm: UserKind): string | undefined {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return bodyToken ?? cookies?.[refreshCookieName(realm)];
}
