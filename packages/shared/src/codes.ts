/**
 * Formats of the machine-readable codes exchanged between the apps,
 * the exit gates, smart carts and the attendance kiosk.
 */

/** Crockford base32 without I, L, O, U: unambiguous when read aloud or typed. */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Exit-pass tokens: "SC" + 18 base32 characters (90 bits of entropy). */
export const EXIT_PASS_TOKEN_PATTERN = /SC[0-9A-HJKMNP-TV-Z]{18}/;
export const EXIT_PASS_URI_PREFIX = 'smartcart://exit/';

export const PICKUP_URI_PREFIX = 'smartcart://pickup/';
export const CART_PAIR_URI_PREFIX = 'smartcart://cart-pair/';
export const KIOSK_URI_PREFIX = 'smartcart://clock-in/';

export function buildExitPassUri(token: string): string {
  return `${EXIT_PASS_URI_PREFIX}${token}`;
}

/** Extracts the exit-pass token from a QR payload, a barcode or a typed code. */
export function parseExitPassToken(scanned: string): string | null {
  const match = EXIT_PASS_TOKEN_PATTERN.exec(scanned.trim().toUpperCase().replace(/[\s-]/g, ''));
  return match ? match[0] : null;
}

export function buildPickupUri(orderNumber: string, pickupCode: string): string {
  return `${PICKUP_URI_PREFIX}${orderNumber}/${pickupCode}`;
}

export function parsePickupUri(scanned: string): { orderNumber: string; pickupCode: string } | null {
  const match = /pickup\/([A-Z0-9-]+)\/([A-Z0-9]{4,8})/i.exec(scanned.trim());
  return match ? { orderNumber: match[1]!.toUpperCase(), pickupCode: match[2]!.toUpperCase() } : null;
}

export function buildCartPairUri(pairingCode: string): string {
  return `${CART_PAIR_URI_PREFIX}${pairingCode}`;
}

export function parseCartPairCode(scanned: string): string | null {
  const match = /(\d{6})\s*$/.exec(scanned.trim());
  return match ? match[1]! : null;
}

export function buildKioskUri(storeId: string, code: string): string {
  return `${KIOSK_URI_PREFIX}${storeId}/${code}`;
}

export function parseKioskUri(scanned: string): { storeId: string; code: string } | null {
  const match = /clock-in\/([0-9a-f-]{36})\/([A-Z0-9]{6,12})/i.exec(scanned.trim());
  return match ? { storeId: match[1]!.toLowerCase(), code: match[2]!.toUpperCase() } : null;
}

/** Splits a long token into groups for display: "SC7K 2M9Q X4TB ..." */
export function groupCode(code: string, size = 4): string {
  return code.replace(new RegExp(`(.{${size}})(?=.)`, 'g'), '$1 ');
}
