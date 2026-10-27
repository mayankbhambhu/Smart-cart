import type { CatalogProduct, OrderChannel } from '@smartcart/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Which store the shopper is buying from, and how. */
interface ShopState {
  storeId: string | null;
  mode: Exclude<OrderChannel, 'IN_STORE'> | 'IN_STORE';
  addressId: string | null;
  setStore: (storeId: string) => void;
  setMode: (mode: ShopState['mode']) => void;
  setAddress: (addressId: string | null) => void;
}

export const useShop = create<ShopState>()(
  persist(
    (set) => ({
      storeId: null,
      mode: 'DELIVERY',
      addressId: null,
      setStore: (storeId) => set({ storeId }),
      setMode: (mode) => set({ mode }),
      setAddress: (addressId) => set({ addressId }),
    }),
    { name: 'smartcart-shop' },
  ),
);

export interface CartLine {
  productId: string;
  quantity: number;
  name: string;
  brand: string;
  unit: string;
  emoji: string;
  color: string;
  imageUrl: string | null;
  price: number;
  mrp: number;
  maxOrderQty: number;
}

interface CartState {
  storeId: string | null;
  lines: CartLine[];
  add: (product: CatalogProduct, storeId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
}

/** Delivery / pickup basket. It belongs to one store: switching stores starts a new basket. */
export const useCart = create<CartState>()(
  persist(
    (set) => ({
      storeId: null,
      lines: [],
      add: (product, storeId) =>
        set((state) => {
          const lines = state.storeId === storeId ? state.lines : [];
          const existing = lines.find((l) => l.productId === product.id);
          if (existing) {
            return {
              storeId,
              lines: lines.map((l) =>
                l.productId === product.id ? { ...l, quantity: Math.min(l.quantity + 1, product.maxOrderQty || l.maxOrderQty) } : l,
              ),
            };
          }
          return {
            storeId,
            lines: [
              ...lines,
              {
                productId: product.id,
                quantity: 1,
                name: product.name,
                brand: product.brand,
                unit: product.unit,
                emoji: product.emoji,
                color: product.color,
                imageUrl: product.imageUrl,
                price: product.price,
                mrp: product.mrp,
                maxOrderQty: product.maxOrderQty,
              },
            ],
          };
        }),
      setQuantity: (productId, quantity) =>
        set((state) => ({
          lines:
            quantity <= 0
              ? state.lines.filter((l) => l.productId !== productId)
              : state.lines.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(quantity, l.maxOrderQty) } : l)),
        })),
      clear: () => set({ lines: [] }),
    }),
    { name: 'smartcart-cart' },
  ),
);

export function cartTotals(lines: CartLine[]) {
  return lines.reduce(
    (acc, l) => ({ count: acc.count + l.quantity, total: acc.total + l.quantity * l.price, mrp: acc.mrp + l.quantity * l.mrp }),
    { count: 0, total: 0, mrp: 0 },
  );
}

/** The store selected in the staff dashboard (staff may work at several stores). */
interface OpsState {
  storeId: string | null;
  setStore: (storeId: string) => void;
}

export const useOpsStore = create<OpsState>()(
  persist((set) => ({ storeId: null, setStore: (storeId) => set({ storeId }) }), { name: 'smartcart-ops-store' }),
);

const NO_LINES: CartLine[] = [];

/** Basket lines for a store. Returns a stable empty array for other stores (zustand selectors must not allocate). */
export function useCartLines(storeId: string | null | undefined): CartLine[] {
  return useCart((s) => (storeId && s.storeId === storeId ? s.lines : NO_LINES));
}
