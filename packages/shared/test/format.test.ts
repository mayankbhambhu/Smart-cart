import { describe, expect, it } from 'vitest';
import { formatDuration, formatMoney, formatMoneyCompact, initials, normalizePhone } from '../src/format';
import { PhoneSchema, PlaceOrderSchema, ReviewDecisionSchema } from '../src/schemas';

describe('formatting', () => {
  it('formats rupees with Indian grouping', () => {
    expect(formatMoney(12345)).toBe('₹123.45');
    expect(formatMoney(12300)).toBe('₹123');
    expect(formatMoney(12345600)).toBe('₹1,23,456');
    expect(formatMoneyCompact(2_50_00_000)).toBe('₹2.5L');
  });

  it('formats durations and initials', () => {
    expect(formatDuration(465)).toBe('7h 45m');
    expect(formatDuration(45)).toBe('45m');
    expect(initials('Priya Sharma')).toBe('PS');
  });

  it('normalises phone numbers to E.164', () => {
    expect(normalizePhone('98765 43210')).toBe('+919876543210');
    expect(normalizePhone('09876543210')).toBe('+919876543210');
    expect(normalizePhone('+1 (415) 555-0100')).toBe('+14155550100');
    expect(PhoneSchema.safeParse('12').success).toBe(false);
  });
});

describe('schemas', () => {
  it('requires an address for delivery and a slot for pickup', () => {
    const base = {
      storeId: '6b0f1c1e-7e4b-4a43-9b1e-2f3a4b5c6d7e',
      items: [{ productId: '6b0f1c1e-7e4b-4a43-9b1e-2f3a4b5c6d7f', quantity: 1 }],
      paymentMethod: 'UPI',
    };
    expect(PlaceOrderSchema.safeParse({ ...base, channel: 'DELIVERY' }).success).toBe(false);
    expect(PlaceOrderSchema.safeParse({ ...base, channel: 'PICKUP' }).success).toBe(false);
    expect(PlaceOrderSchema.safeParse({ ...base, channel: 'PICKUP', pickupSlotStart: '2026-10-27T10:00:00.000Z' }).success).toBe(true);
  });

  it('requires a comment when sending a request back', () => {
    expect(ReviewDecisionSchema.safeParse({ decision: 'REQUEST_CHANGES' }).success).toBe(false);
    expect(ReviewDecisionSchema.safeParse({ decision: 'APPROVE' }).success).toBe(true);
  });
});
