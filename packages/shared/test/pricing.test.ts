import { describe, expect, it } from 'vitest';
import { computeBill, DEFAULT_STORE_FEES, discountPercent, type OfferRule, type PricingLine } from '../src/pricing';

const milk: PricingLine = { productId: 'milk', categoryId: 'dairy', quantity: 2, unitPrice: 3000, mrp: 3200, taxRate: 0 };
const chips: PricingLine = { productId: 'chips', categoryId: 'snacks', quantity: 3, unitPrice: 2000, mrp: 2000, taxRate: 12 };

function offer(partial: Partial<OfferRule>): OfferRule {
  return {
    id: 'o1',
    code: 'TEST',
    title: 'Test offer',
    type: 'PERCENT_OFF',
    value: 10,
    minOrderValue: 0,
    maxDiscount: null,
    productId: null,
    categoryId: null,
    buyQty: null,
    getQty: null,
    channels: [],
    ...partial,
  };
}

describe('computeBill', () => {
  it('charges delivery, handling and small-cart fees on small delivery orders', () => {
    const { bill } = computeBill({ lines: [milk], channel: 'DELIVERY', fees: DEFAULT_STORE_FEES });
    expect(bill.itemTotal).toBe(6000);
    expect(bill.mrpTotal).toBe(6400);
    expect(bill.itemSavings).toBe(400);
    expect(bill.deliveryFee).toBe(DEFAULT_STORE_FEES.deliveryFee);
    expect(bill.handlingFee).toBe(DEFAULT_STORE_FEES.handlingFee);
    expect(bill.smallCartFee).toBe(DEFAULT_STORE_FEES.smallCartFee);
    expect(bill.total).toBe(6000 + 3000 + 400 + 2000);
  });

  it('waives delivery above the free-delivery threshold', () => {
    const big = { ...milk, quantity: 10 };
    const { bill } = computeBill({ lines: [big], channel: 'DELIVERY', fees: DEFAULT_STORE_FEES });
    expect(bill.deliveryFee).toBe(0);
    expect(bill.smallCartFee).toBe(0);
    expect(bill.totalSavings).toBe(bill.itemSavings + DEFAULT_STORE_FEES.deliveryFee);
  });

  it('charges no fees for pickup and in-store orders', () => {
    for (const channel of ['PICKUP', 'IN_STORE'] as const) {
      const { bill } = computeBill({ lines: [milk], channel, fees: DEFAULT_STORE_FEES, tip: 2000 });
      expect(bill.total).toBe(6000);
      expect(bill.tip).toBe(0);
    }
  });

  it('caps percentage discounts', () => {
    const { bill, offer: result } = computeBill({
      lines: [milk, chips],
      channel: 'IN_STORE',
      fees: DEFAULT_STORE_FEES,
      offer: offer({ value: 50, maxDiscount: 1000 }),
    });
    expect(result?.applicable).toBe(true);
    expect(bill.couponDiscount).toBe(1000);
    expect(bill.total).toBe(12000 - 1000);
  });

  it('limits category offers to eligible lines', () => {
    const { bill } = computeBill({
      lines: [milk, chips],
      channel: 'PICKUP',
      fees: DEFAULT_STORE_FEES,
      offer: offer({ value: 20, categoryId: 'snacks' }),
    });
    expect(bill.couponDiscount).toBe(1200);
  });

  it('explains unmet minimum order values', () => {
    const { bill, offer: result } = computeBill({
      lines: [milk],
      channel: 'DELIVERY',
      fees: DEFAULT_STORE_FEES,
      offer: offer({ type: 'FLAT_OFF', value: 5000, minOrderValue: 19900 }),
    });
    expect(result?.applicable).toBe(false);
    expect(result?.message).toContain('₹139');
    expect(bill.couponDiscount).toBe(0);
  });

  it('gives free units for buy-X-get-Y offers', () => {
    const { bill } = computeBill({
      lines: [{ ...chips, quantity: 5 }],
      channel: 'IN_STORE',
      fees: DEFAULT_STORE_FEES,
      offer: offer({ type: 'BOGO', productId: 'chips', buyQty: 1, getQty: 1 }),
    });
    expect(bill.couponDiscount).toBe(2 * 2000);
  });

  it('waives the delivery fee with a free-delivery offer', () => {
    const { bill } = computeBill({
      lines: [milk],
      channel: 'DELIVERY',
      fees: DEFAULT_STORE_FEES,
      offer: offer({ type: 'FREE_DELIVERY', value: 0 }),
    });
    expect(bill.deliveryFee).toBe(0);
  });

  it('respects channel restrictions', () => {
    const { offer: result } = computeBill({
      lines: [milk],
      channel: 'DELIVERY',
      fees: DEFAULT_STORE_FEES,
      offer: offer({ channels: ['IN_STORE'] }),
    });
    expect(result?.applicable).toBe(false);
  });

  it('reports the GST included in tax-inclusive prices', () => {
    const { bill } = computeBill({ lines: [chips], channel: 'IN_STORE', fees: DEFAULT_STORE_FEES });
    expect(bill.taxIncluded).toBe(Math.round((6000 * 12) / 112));
  });
});

describe('discountPercent', () => {
  it('rounds to whole percent and never goes negative', () => {
    expect(discountPercent(3200, 3000)).toBe(6);
    expect(discountPercent(1000, 1200)).toBe(0);
  });
});
