import type { OfferType, OrderChannel } from './constants';

/**
 * Bill calculation shared by the API (source of truth) and the apps
 * (instant previews). All money values are integers in minor units (paise).
 * Shelf prices are tax-inclusive (MRP style); the GST portion is reported
 * for the receipt but never added on top.
 */

export interface PricingLine {
  productId: string;
  categoryId?: string | null;
  quantity: number;
  unitPrice: number;
  mrp: number;
  /** GST rate in percent, e.g. 5 or 18 */
  taxRate: number;
}

export interface StoreFees {
  deliveryFee: number;
  freeDeliveryThreshold: number;
  handlingFee: number;
  smallCartThreshold: number;
  smallCartFee: number;
}

export interface OfferRule {
  id: string;
  code: string | null;
  title: string;
  type: OfferType;
  /** percent for PERCENT_OFF, minor units for FLAT_OFF, unused otherwise */
  value: number;
  minOrderValue: number;
  maxDiscount: number | null;
  productId: string | null;
  categoryId: string | null;
  buyQty: number | null;
  getQty: number | null;
  /** empty = valid on every channel */
  channels: OrderChannel[];
}

export interface Bill {
  itemCount: number;
  itemTotal: number;
  mrpTotal: number;
  itemSavings: number;
  couponDiscount: number;
  deliveryFee: number;
  handlingFee: number;
  smallCartFee: number;
  tip: number;
  taxIncluded: number;
  total: number;
  /** MRP savings + coupon + waived fees */
  totalSavings: number;
}

export interface OfferEvaluation {
  offerId: string;
  code: string | null;
  title: string;
  applicable: boolean;
  discount: number;
  freeDelivery: boolean;
  message: string;
}

export const DEFAULT_STORE_FEES: StoreFees = {
  deliveryFee: 3000,
  freeDeliveryThreshold: 19900,
  handlingFee: 400,
  smallCartThreshold: 9900,
  smallCartFee: 2000,
};

export function lineTotal(line: Pick<PricingLine, 'quantity' | 'unitPrice'>): number {
  return line.quantity * line.unitPrice;
}

export function evaluateOffer(offer: OfferRule, lines: PricingLine[], channel: OrderChannel): OfferEvaluation {
  const base = { offerId: offer.id, code: offer.code, title: offer.title };
  const itemTotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);

  if (offer.channels.length > 0 && !offer.channels.includes(channel)) {
    return { ...base, applicable: false, discount: 0, freeDelivery: false, message: 'Not valid for this order type' };
  }
  if (itemTotal < offer.minOrderValue) {
    const short = offer.minOrderValue - itemTotal;
    return {
      ...base,
      applicable: false,
      discount: 0,
      freeDelivery: false,
      message: `Add items worth ${rupees(short)} more to use this offer`,
    };
  }

  const eligible = lines.filter(
    (line) =>
      (!offer.productId || line.productId === offer.productId) &&
      (!offer.categoryId || line.categoryId === offer.categoryId),
  );
  const eligibleTotal = eligible.reduce((sum, line) => sum + lineTotal(line), 0);
  if ((offer.productId || offer.categoryId) && eligibleTotal === 0) {
    return { ...base, applicable: false, discount: 0, freeDelivery: false, message: 'No eligible items in your cart' };
  }

  let discount = 0;
  switch (offer.type) {
    case 'PERCENT_OFF':
      discount = Math.round((eligibleTotal * offer.value) / 100);
      break;
    case 'FLAT_OFF':
      discount = Math.min(offer.value, eligibleTotal);
      break;
    case 'BOGO': {
      const buy = Math.max(1, offer.buyQty ?? 1);
      const get = Math.max(1, offer.getQty ?? 1);
      for (const line of eligible) {
        const free = Math.floor(line.quantity / (buy + get)) * get;
        discount += free * line.unitPrice;
      }
      if (discount === 0) {
        return {
          ...base,
          applicable: false,
          discount: 0,
          freeDelivery: false,
          message: `Add ${buy + get} of the offer item to get ${get} free`,
        };
      }
      break;
    }
    case 'FREE_DELIVERY':
      if (channel !== 'DELIVERY') {
        return { ...base, applicable: false, discount: 0, freeDelivery: false, message: 'Only valid on delivery orders' };
      }
      return { ...base, applicable: true, discount: 0, freeDelivery: true, message: 'Delivery fee waived' };
  }

  if (offer.maxDiscount !== null && offer.maxDiscount >= 0) discount = Math.min(discount, offer.maxDiscount);
  discount = Math.min(discount, itemTotal);
  return { ...base, applicable: discount > 0, discount, freeDelivery: false, message: `You save ${rupees(discount)}` };
}

export interface ComputeBillInput {
  lines: PricingLine[];
  channel: OrderChannel;
  fees: StoreFees;
  offer?: OfferRule | null;
  tip?: number;
}

export function computeBill(input: ComputeBillInput): { bill: Bill; offer: OfferEvaluation | null } {
  const { lines, channel, fees } = input;
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const itemTotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const mrpTotal = lines.reduce((sum, line) => sum + line.quantity * Math.max(line.mrp, line.unitPrice), 0);
  const offer = input.offer ? evaluateOffer(input.offer, lines, channel) : null;
  const couponDiscount = offer?.applicable ? offer.discount : 0;

  let deliveryFee = 0;
  let handlingFee = 0;
  let smallCartFee = 0;
  let waived = 0;
  if (channel === 'DELIVERY' && itemCount > 0) {
    const freeDelivery = itemTotal >= fees.freeDeliveryThreshold || Boolean(offer?.applicable && offer.freeDelivery);
    deliveryFee = freeDelivery ? 0 : fees.deliveryFee;
    if (freeDelivery) waived += fees.deliveryFee;
    handlingFee = fees.handlingFee;
    smallCartFee = itemTotal < fees.smallCartThreshold ? fees.smallCartFee : 0;
  }
  const tip = channel === 'DELIVERY' ? Math.max(0, Math.round(input.tip ?? 0)) : 0;

  const grossTax = lines.reduce(
    (sum, line) => sum + (lineTotal(line) * line.taxRate) / (100 + line.taxRate),
    0,
  );
  const discountRatio = itemTotal > 0 ? (itemTotal - couponDiscount) / itemTotal : 0;
  const taxIncluded = Math.round(grossTax * discountRatio);

  const total = Math.max(0, itemTotal - couponDiscount + deliveryFee + handlingFee + smallCartFee + tip);
  const itemSavings = mrpTotal - itemTotal;

  return {
    bill: {
      itemCount,
      itemTotal,
      mrpTotal,
      itemSavings,
      couponDiscount,
      deliveryFee,
      handlingFee,
      smallCartFee,
      tip,
      taxIncluded,
      total,
      totalSavings: itemSavings + couponDiscount + waived,
    },
    offer,
  };
}

export function discountPercent(mrp: number, price: number): number {
  if (mrp <= 0 || price >= mrp) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}

export function emptyBill(): Bill {
  return computeBill({ lines: [], channel: 'IN_STORE', fees: DEFAULT_STORE_FEES }).bill;
}

function rupees(minor: number): string {
  const value = minor / 100;
  return `₹${Number.isInteger(value) ? value : value.toFixed(2)}`;
}
