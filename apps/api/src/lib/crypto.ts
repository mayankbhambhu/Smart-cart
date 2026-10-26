import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { CODE_ALPHABET } from '@smartcart/shared';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// scrypt parameters (N = 2^15, r = 8, p = 1) => ~32 MiB per hash.
const SCRYPT = { N: 1 << 15, r: 8, p: 1, keylen: 64 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 64 * 1024 * 1024,
  });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [scheme, n, r, p, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmacSha256(key: string, value: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** URL-safe random token with the given number of random bytes. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Random code from the unambiguous base32 alphabet. */
export function randomCode(length: number, alphabet = CODE_ALPHABET): string {
  let code = '';
  for (let i = 0; i < length; i++) code += alphabet[randomInt(alphabet.length)];
  return code;
}

export function randomDigits(length: number): string {
  let code = '';
  for (let i = 0; i < length; i++) code += String(randomInt(10));
  return code;
}

/** Temporary password for newly issued staff credentials, e.g. "Tulip-7342-Kite". */
export function temporaryPassword(): string {
  const words = ['Mango', 'Tulip', 'Kite', 'River', 'Cedar', 'Lotus', 'Maple', 'Pearl', 'Comet', 'Amber', 'Coral', 'Basil'];
  const pick = () => words[randomInt(words.length)]!;
  return `${pick()}-${randomDigits(4)}-${pick()}`;
}
