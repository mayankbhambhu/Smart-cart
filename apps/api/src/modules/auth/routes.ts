import {
  AdminLoginSchema,
  ChangePasswordSchema,
  DemoSocialLoginSchema,
  ForgotPasswordSchema,
  LoginSchema,
  OtpRequestSchema,
  OtpVerifySchema,
  RefreshSchema,
  RegisterSchema,
  ResetPasswordSchema,
  SocialLoginSchema,
  StaffLoginSchema,
  type AuthProvidersInfo,
  type MeResponse,
  type OtpRequestResult,
} from '@smartcart/shared';
import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { Router, type Request, type Response } from 'express';
import { env, isProduction } from '../../config/env';
import { db } from '../../db/client';
import { employees, otpCodes, users } from '../../db/schema';
import { audit } from '../../lib/audit';
import { hashPassword, randomDigits, sha256, verifyPassword } from '../../lib/crypto';
import { AppError, conflict, forbidden, tooManyRequests, unauthorized } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { parse } from '../../lib/validate';
import { requireAuth } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimit';
import {
  clearRefreshCookie,
  issueSession,
  loadMemberships,
  readRefreshToken,
  revokeAllSessions,
  revokeRefreshToken,
  rotateRefreshToken,
  serializeUser,
  type UserRow,
} from '../../services/auth';
import { googleClientIds, verifyAppleIdToken, verifyGoogleIdToken, type VerifiedIdentity } from '../../services/identity';
import { sendSms, smsConfigured } from '../../services/sms';

export const authRouter = Router();
// Only credential checks count towards the brute-force limit; refreshing a session does not.
authRouter.use((req, res, next) =>
  req.method === 'POST' && !['/refresh', '/logout'].includes(req.path) ? authLimiter(req, res, next) : next(),
);

const OTP_TTL_SECONDS = 300;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_WINDOW = 5;

function otpEcho(): boolean {
  return env.OTP_DEV_ECHO && !isProduction;
}

authRouter.get('/providers', (_req, res) => {
  const google = googleClientIds().length > 0;
  const apple = env.APPLE_CLIENT_IDS.length > 0 || Boolean(env.APPLE_SERVICE_ID);
  const demo = env.AUTH_DEMO_SOCIAL && !isProduction;
  const body: AuthProvidersInfo = {
    google: {
      enabled: google || demo,
      demo: !google && demo,
      webClientId: env.GOOGLE_WEB_CLIENT_ID ?? null,
      iosClientId: env.GOOGLE_IOS_CLIENT_ID ?? null,
      androidClientId: env.GOOGLE_ANDROID_CLIENT_ID ?? null,
    },
    apple: {
      enabled: apple || demo,
      demo: !apple && demo,
      serviceId: env.APPLE_SERVICE_ID ?? null,
      redirectUri: env.APPLE_REDIRECT_URI ?? null,
    },
    phoneOtp: { enabled: true, devEcho: otpEcho() && !smsConfigured() },
  };
  res.json(body);
});

// --- Customers: email + password ---------------------------------------------

authRouter.post('/register', async (req, res) => {
  const input = parse(RegisterSchema, req.body);
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.kind, 'CUSTOMER'),
        input.phone ? or(eq(users.email, input.email), eq(users.phone, input.phone)) : eq(users.email, input.email),
      ),
    )
    .limit(1);
  if (existing) throw conflict('An account with this email or phone already exists. Try signing in.', 'ACCOUNT_EXISTS');
  const [user] = await db
    .insert(users)
    .values({
      kind: 'CUSTOMER',
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      passwordHash: await hashPassword(input.password),
    })
    .returning();
  res.status(201).json(await issueSession(user!, req, res));
});

authRouter.post('/login', async (req, res) => {
  const input = parse(LoginSchema, req.body);
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.kind, 'CUSTOMER'), eq(users.email, input.email)))
    .limit(1);
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
  }
  res.json(await issueSession(user, req, res));
});

// --- Customers: phone OTP --------------------------------------------------------

authRouter.post('/otp/request', async (req, res) => {
  const { phone } = parse(OtpRequestSchema, req.body);
  const recent = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(otpCodes)
    .where(and(eq(otpCodes.target, phone), eq(otpCodes.purpose, 'LOGIN'), gt(otpCodes.createdAt, new Date(Date.now() - 15 * 60_000))));
  if ((recent[0]?.count ?? 0) >= OTP_MAX_PER_WINDOW) throw tooManyRequests('Too many codes requested. Try again in 15 minutes.');

  const code = randomDigits(6);
  await db.insert(otpCodes).values({
    target: phone,
    purpose: 'LOGIN',
    codeHash: sha256(`${phone}:${code}`),
    expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
  });
  await sendSms(phone, `${code} is your SmartCart login code. It expires in 5 minutes. Do not share it with anyone.`);
  if (!smsConfigured()) logger.info({ phone, code }, 'Login OTP (development)');
  const body: OtpRequestResult = { sent: true, expiresInSeconds: OTP_TTL_SECONDS };
  if (otpEcho() && !smsConfigured()) body.devCode = code;
  res.json(body);
});

authRouter.post('/otp/verify', async (req, res) => {
  const input = parse(OtpVerifySchema, req.body);
  const [otp] = await db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.target, input.phone), eq(otpCodes.purpose, 'LOGIN'), isNull(otpCodes.consumedAt)))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);
  if (!otp || otp.expiresAt < new Date()) throw new AppError(400, 'OTP_EXPIRED', 'This code has expired. Request a new one.');
  if (otp.attempts >= OTP_MAX_ATTEMPTS) throw tooManyRequests('Too many wrong attempts. Request a new code.');
  if (otp.codeHash !== sha256(`${input.phone}:${input.code}`)) {
    await db
      .update(otpCodes)
      .set({ attempts: otp.attempts + 1 })
      .where(eq(otpCodes.id, otp.id));
    throw new AppError(400, 'OTP_INVALID', 'That code is not correct');
  }

  let [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.kind, 'CUSTOMER'), eq(users.phone, input.phone)))
    .limit(1);
  if (!user && !input.name) {
    throw new AppError(422, 'NAME_REQUIRED', 'Welcome! Tell us your name to finish creating your account.');
  }
  await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, otp.id));
  if (!user) {
    [user] = await db
      .insert(users)
      .values({ kind: 'CUSTOMER', name: input.name!, phone: input.phone, phoneVerifiedAt: new Date() })
      .returning();
  } else if (!user.phoneVerifiedAt) {
    [user] = await db.update(users).set({ phoneVerifiedAt: new Date() }).where(eq(users.id, user.id)).returning();
  }
  res.json(await issueSession(user!, req, res));
});

// --- Customers: Google / Apple -------------------------------------------------

async function signInWithIdentity(identity: VerifiedIdentity, fallbackName: string | undefined, req: Request, res: Response) {
  const subColumn = identity.provider === 'google' ? users.googleSub : users.appleSub;
  let [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.kind, 'CUSTOMER'), eq(subColumn, identity.subject)))
    .limit(1);
  if (!user && identity.email) {
    const [byEmail] = await db
      .select()
      .from(users)
      .where(and(eq(users.kind, 'CUSTOMER'), eq(users.email, identity.email)))
      .limit(1);
    if (byEmail) {
      [user] = await db
        .update(users)
        .set(identity.provider === 'google' ? { googleSub: identity.subject } : { appleSub: identity.subject })
        .where(eq(users.id, byEmail.id))
        .returning();
    }
  }
  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        kind: 'CUSTOMER',
        name: identity.name ?? fallbackName ?? identity.email?.split('@')[0] ?? 'SmartCart shopper',
        email: identity.email,
        avatarUrl: identity.picture,
        ...(identity.provider === 'google' ? { googleSub: identity.subject } : { appleSub: identity.subject }),
      })
      .returning();
  }
  return issueSession(user!, req, res);
}

authRouter.post('/google', async (req, res) => {
  const input = parse(SocialLoginSchema, req.body);
  const identity = await verifyGoogleIdToken(input.idToken);
  res.json(await signInWithIdentity(identity, input.name, req, res));
});

authRouter.post('/apple', async (req, res) => {
  const input = parse(SocialLoginSchema, req.body);
  const identity = await verifyAppleIdToken(input.idToken, input.nonce);
  res.json(await signInWithIdentity(identity, input.name, req, res));
});

/** Development stand-in for Google/Apple when no OAuth client is configured. */
authRouter.post('/demo-social', async (req, res) => {
  if (!env.AUTH_DEMO_SOCIAL || isProduction) throw forbidden('Demo sign-in is disabled');
  const input = parse(DemoSocialLoginSchema, req.body);
  const identity: VerifiedIdentity = {
    provider: input.provider,
    subject: `demo-${input.provider}-${sha256(input.email).slice(0, 24)}`,
    email: input.email,
    emailVerified: true,
    name: input.name,
    picture: null,
  };
  res.json(await signInWithIdentity(identity, input.name, req, res));
});

// --- Staff and admin consoles ----------------------------------------------------

authRouter.post('/staff/login', async (req, res) => {
  const input = parse(StaffLoginSchema, req.body);
  const identifier = input.identifier;
  const [byEmployeeCode] = await db
    .select({ userId: employees.userId })
    .from(employees)
    .where(eq(employees.employeeCode, identifier.toUpperCase()))
    .limit(1);
  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.kind, 'STAFF'),
        byEmployeeCode?.userId ? eq(users.id, byEmployeeCode.userId) : or(eq(users.username, identifier), eq(users.email, identifier)),
      ),
    )
    .limit(1);
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect username or password');
  }
  const memberships = await loadMemberships(db, user.id);
  if (memberships.length === 0 || user.status !== 'ACTIVE') {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'Your staff account has been deactivated. Contact your store manager.');
  }
  await audit(db, {
    actorId: user.id,
    actorKind: 'STAFF',
    actorName: user.name,
    action: 'STAFF_LOGIN',
    entityType: 'user',
    entityId: user.id,
    ip: req.ip,
  });
  res.json(await issueSession(user, req, res));
});

authRouter.post('/admin/login', async (req, res) => {
  const input = parse(AdminLoginSchema, req.body);
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.kind, 'ADMIN'), eq(users.email, input.email)))
    .limit(1);
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
  }
  await audit(db, {
    actorId: user.id,
    actorKind: 'ADMIN',
    actorName: user.name,
    action: 'ADMIN_LOGIN',
    entityType: 'user',
    entityId: user.id,
    ip: req.ip,
  });
  res.json(await issueSession(user, req, res));
});

// --- Session management -------------------------------------------------------------

authRouter.post('/refresh', async (req, res) => {
  const input = parse(RefreshSchema, req.body);
  const token = readRefreshToken(req, input.refreshToken, input.realm);
  if (!token) throw unauthorized('Please sign in again');
  res.json(await rotateRefreshToken(token, req, res));
});

authRouter.post('/logout', async (req, res) => {
  const input = parse(RefreshSchema, req.body);
  const token = readRefreshToken(req, input.refreshToken, input.realm);
  if (token) await revokeRefreshToken(token);
  clearRefreshCookie(res, input.realm);
  res.status(204).end();
});

authRouter.get('/me', requireAuth(), async (req, res) => {
  const [user] = await db.select().from(users).where(eq(users.id, req.auth!.userId)).limit(1);
  if (!user) throw unauthorized();
  const body: MeResponse = {
    user: serializeUser(user),
    memberships: user.kind === 'STAFF' ? await loadMemberships(db, user.id) : [],
  };
  res.json(body);
});

authRouter.post('/change-password', requireAuth(), async (req, res) => {
  const input = parse(ChangePasswordSchema, req.body);
  const [user] = await db.select().from(users).where(eq(users.id, req.auth!.userId)).limit(1);
  if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new AppError(400, 'INVALID_CREDENTIALS', 'Your current password is incorrect');
  }
  await revokeAllSessions(db, user.id);
  const [updated] = await db
    .update(users)
    .set({ passwordHash: await hashPassword(input.newPassword), mustChangePassword: false })
    .where(eq(users.id, user.id))
    .returning();
  await audit(db, {
    actorId: user.id,
    actorKind: user.kind,
    actorName: user.name,
    action: 'PASSWORD_CHANGED',
    entityType: 'user',
    entityId: user.id,
    ip: req.ip,
  });
  res.json(await issueSession(updated as UserRow, req, res));
});

authRouter.post('/password/forgot', async (req, res) => {
  const { email } = parse(ForgotPasswordSchema, req.body);
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.kind, 'CUSTOMER'), eq(users.email, email)))
    .limit(1);
  const body: OtpRequestResult = { sent: true, expiresInSeconds: OTP_TTL_SECONDS };
  if (user) {
    const code = randomDigits(6);
    await db.insert(otpCodes).values({
      target: email,
      purpose: 'RESET_PASSWORD',
      codeHash: sha256(`${email}:${code}`),
      expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
    });
    logger.info({ email, code }, 'Password reset code (connect an email provider to deliver it)');
    if (otpEcho()) body.devCode = code;
  }
  // Same response whether or not the account exists, to avoid account enumeration.
  res.json(body);
});

authRouter.post('/password/reset', async (req, res) => {
  const input = parse(ResetPasswordSchema, req.body);
  const [otp] = await db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.target, input.email), eq(otpCodes.purpose, 'RESET_PASSWORD'), isNull(otpCodes.consumedAt)))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);
  if (!otp || otp.expiresAt < new Date() || otp.attempts >= OTP_MAX_ATTEMPTS) {
    throw new AppError(400, 'OTP_EXPIRED', 'This code has expired. Request a new one.');
  }
  if (otp.codeHash !== sha256(`${input.email}:${input.code}`)) {
    await db
      .update(otpCodes)
      .set({ attempts: otp.attempts + 1 })
      .where(eq(otpCodes.id, otp.id));
    throw new AppError(400, 'OTP_INVALID', 'That code is not correct');
  }
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.kind, 'CUSTOMER'), eq(users.email, input.email)))
    .limit(1);
  if (!user) throw new AppError(400, 'OTP_INVALID', 'That code is not correct');
  await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, otp.id));
  await revokeAllSessions(db, user.id);
  const [updated] = await db
    .update(users)
    .set({ passwordHash: await hashPassword(input.newPassword) })
    .where(eq(users.id, user.id))
    .returning();
  res.json(await issueSession(updated!, req, res));
});
