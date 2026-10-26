import type { AdminRole, UserKind } from '@smartcart/shared';
import { jwtVerify, SignJWT } from 'jose';
import { env } from '../config/env';

const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const ISSUER = 'smartcart-api';
const AUDIENCE = 'smartcart-apps';

export interface AccessClaims {
  sub: string;
  kind: UserKind;
  ver: number;
  adminRole?: AdminRole | null;
}

export async function signAccessToken(claims: AccessClaims): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + env.ACCESS_TOKEN_TTL_MINUTES * 60_000);
  const token = await new SignJWT({ kind: claims.kind, ver: claims.ver, adminRole: claims.adminRole ?? null })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret);
  return { token, expiresAt };
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
  if (typeof payload.sub !== 'string') throw new Error('Token has no subject');
  return {
    sub: payload.sub,
    kind: payload.kind as UserKind,
    ver: Number(payload.ver ?? 0),
    adminRole: (payload.adminRole as AdminRole | null | undefined) ?? null,
  };
}
