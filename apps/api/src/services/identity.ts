import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { createHash } from 'node:crypto';
import { env } from '../config/env';
import { AppError } from '../lib/errors';

/**
 * Verifies identity tokens from Google Sign-In and Sign in with Apple
 * against the providers' published signing keys.
 */

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const appleKeys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export interface VerifiedIdentity {
  provider: 'google' | 'apple';
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

export function googleClientIds(): string[] {
  return [env.GOOGLE_WEB_CLIENT_ID, env.GOOGLE_IOS_CLIENT_ID, env.GOOGLE_ANDROID_CLIENT_ID].filter((id): id is string => Boolean(id));
}

export function appleClientIds(): string[] {
  return [...env.APPLE_CLIENT_IDS, ...(env.APPLE_SERVICE_ID ? [env.APPLE_SERVICE_ID] : [])];
}

export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedIdentity> {
  const audience = googleClientIds();
  if (audience.length === 0) throw new AppError(501, 'PROVIDER_NOT_CONFIGURED', 'Google sign-in is not configured');
  let payload: JWTPayload & { email?: string; email_verified?: boolean | string; name?: string; picture?: string };
  try {
    ({ payload } = await jwtVerify(idToken, googleKeys, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience,
    }));
  } catch {
    throw new AppError(401, 'INVALID_ID_TOKEN', 'Google sign-in could not be verified');
  }
  return {
    provider: 'google',
    subject: payload.sub!,
    email: payload.email?.toLowerCase() ?? null,
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    name: payload.name ?? null,
    picture: payload.picture ?? null,
  };
}

export async function verifyAppleIdToken(idToken: string, rawNonce?: string): Promise<VerifiedIdentity> {
  const audience = appleClientIds();
  if (audience.length === 0) throw new AppError(501, 'PROVIDER_NOT_CONFIGURED', 'Sign in with Apple is not configured');
  let payload: JWTPayload & { email?: string; email_verified?: boolean | string; nonce?: string };
  try {
    ({ payload } = await jwtVerify(idToken, appleKeys, { issuer: 'https://appleid.apple.com', audience }));
  } catch {
    throw new AppError(401, 'INVALID_ID_TOKEN', 'Sign in with Apple could not be verified');
  }
  if (rawNonce) {
    const hashed = createHash('sha256').update(rawNonce).digest('hex');
    if (payload.nonce !== hashed && payload.nonce !== rawNonce) {
      throw new AppError(401, 'INVALID_NONCE', 'Sign in with Apple could not be verified');
    }
  }
  return {
    provider: 'apple',
    subject: payload.sub!,
    email: payload.email?.toLowerCase() ?? null,
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    name: null,
    picture: null,
  };
}
