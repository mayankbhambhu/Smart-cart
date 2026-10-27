import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { code128Bars, encodeCode128, qrMatrix, qrSvgPath } from '../src/barcode';
import { buildExitPassUri, groupCode, parseCartPairCode, parseExitPassToken, parseKioskUri, parsePickupUri } from '../src/codes';

const require = createRequire(import.meta.url);
const CODE128B = require('jsbarcode/bin/barcodes/CODE128/CODE128B.js').default as new (
  data: string,
  options: object,
) => { encode(): { data: string } };

describe('Code 128', () => {
  it.each(['SC7K2M9QX4TB1R8NWAZ', 'Hello World 123', 'SC-0001', '~!@#$%^&*()_+'])('matches the reference encoder for %s', (text) => {
    expect(encodeCode128(text)).toBe(new CODE128B(text, {}).encode().data);
  });

  it('produces bars that start and end with a bar', () => {
    const { bars, modules } = code128Bars('ABC');
    expect(bars[0]![0]).toBe(0);
    const last = bars[bars.length - 1]!;
    expect(last[0] + last[1]).toBe(modules);
  });

  it('rejects characters outside printable ASCII', () => {
    expect(() => encodeCode128('é')).toThrow();
  });
});

describe('QR', () => {
  it('builds a square matrix with finder patterns', () => {
    const matrix = qrMatrix(buildExitPassUri('SC7K2M9QX4TB1R8NWAZQ'));
    const size = matrix.length;
    expect(size).toBeGreaterThanOrEqual(21);
    expect(matrix.every((row) => row.length === size)).toBe(true);
    for (const [r, c] of [
      [0, 0],
      [0, size - 1],
      [size - 1, 0],
    ] as const) {
      expect(matrix[r]![c]).toBe(true);
    }
    expect(qrSvgPath(matrix)).toMatch(/^M\d+ \d+h\d+v1h-\d+z/);
  });
});

describe('code parsing', () => {
  const token = 'SC7K2M9QX4TB1R8NWAZQ';

  it('extracts exit-pass tokens from QR URIs, barcodes and typed input', () => {
    expect(parseExitPassToken(buildExitPassUri(token))).toBe(token);
    expect(parseExitPassToken(token)).toBe(token);
    expect(parseExitPassToken(groupCode(token).toLowerCase())).toBe(token);
    expect(parseExitPassToken('hello world')).toBeNull();
  });

  it('parses pickup, cart pairing and kiosk payloads', () => {
    expect(parsePickupUri('smartcart://pickup/SC2610AB12/K7Q2M9')).toEqual({ orderNumber: 'SC2610AB12', pickupCode: 'K7Q2M9' });
    expect(parseCartPairCode('smartcart://cart-pair/482913')).toBe('482913');
    expect(parseKioskUri('smartcart://clock-in/6b0f1c1e-7e4b-4a43-9b1e-2f3a4b5c6d7e/AB12CD34')).toEqual({
      storeId: '6b0f1c1e-7e4b-4a43-9b1e-2f3a4b5c6d7e',
      code: 'AB12CD34',
    });
  });
});
