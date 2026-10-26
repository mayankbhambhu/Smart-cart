import { buildKioskUri, CODE_ALPHABET, type KioskCode } from '@smartcart/shared';
import { hmacSha256 } from '../lib/crypto';

/**
 * Rotating attendance codes. The kiosk at the staff entrance shows a QR that
 * changes every minute; staff scan it with the app to clock in, which proves
 * they are physically at the store (no buddy punching from home).
 */

const WINDOW_MS = 60_000;

function codeFor(secret: string, window: number): string {
  const digest = hmacSha256(secret, `kiosk:${window}`);
  let code = '';
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[parseInt(digest.slice(i * 2, i * 2 + 2), 16) % CODE_ALPHABET.length];
  return code;
}

export function currentKioskCode(storeId: string, secret: string, now = Date.now()): KioskCode {
  const window = Math.floor(now / WINDOW_MS);
  const code = codeFor(secret, window);
  return { code, uri: buildKioskUri(storeId, code), expiresAt: new Date((window + 1) * WINDOW_MS).toISOString() };
}

/** Accepts the current and the previous code so a scan right at the boundary still works. */
export function verifyKioskCode(secret: string, code: string, now = Date.now()): boolean {
  const window = Math.floor(now / WINDOW_MS);
  return [window, window - 1].some((w) => codeFor(secret, w) === code.toUpperCase());
}
