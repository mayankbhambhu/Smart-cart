import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CatalogProduct } from '@smartcart/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ShopMode = 'DELIVERY' | 'PICKUP';

interface ShopState {
  storeId: string | null;
  mode: ShopMode;
  addressId: string | null;
  setStore: (storeId: string) => void;
  setMode: (mode: ShopMode) => void;
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
    { name: 'smartcart-shop', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export interface CartLine {
  productId: string;
  quantity: number;
  name: string;
  unit: string;
  emoji: string;
  color: string;
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

/** Delivery / pickup basket for one store; switching stores starts a new basket. */
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
              lines: lines.map((l) => (l.productId === product.id ? { ...l, quantity: Math.min(l.quantity + 1, l.maxOrderQty) } : l)),
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
                unit: product.unit,
                emoji: product.emoji,
                color: product.color,
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
    { name: 'smartcart-cart', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

const NO_LINES: CartLine[] = [];

/** Stable selector: zustand selectors must not allocate new arrays. */
export function useCartLines(storeId: string | null | undefined): CartLine[] {
  return useCart((s) => (storeId && s.storeId === storeId ? s.lines : NO_LINES));
}

export function cartTotals(lines: CartLine[]) {
  return lines.reduce((acc, l) => ({ count: acc.count + l.quantity, total: acc.total + l.quantity * l.price }), { count: 0, total: 0 });
}

/** Store the employee is working in (staff may belong to several). */
interface StaffStoreState {
  storeId: string | null;
  setStore: (storeId: string) => void;
}

export const useStaffStore = create<StaffStoreState>()(
  persist((set) => ({ storeId: null, setStore: (storeId) => set({ storeId }) }), {
    name: 'smartcart-staff-store',
    storage: createJSONStorage(() => AsyncStorage),
  }),
);
