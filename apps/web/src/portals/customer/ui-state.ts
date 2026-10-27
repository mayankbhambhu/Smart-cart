import type { CatalogProduct } from '@smartcart/shared';
import { create } from 'zustand';

interface CustomerUi {
  cartOpen: boolean;
  storePickerOpen: boolean;
  product: CatalogProduct | null;
  openCart: () => void;
  closeCart: () => void;
  openStorePicker: () => void;
  closeStorePicker: () => void;
  openProduct: (product: CatalogProduct) => void;
  closeProduct: () => void;
}

export const useCustomerUi = create<CustomerUi>()((set) => ({
  cartOpen: false,
  storePickerOpen: false,
  product: null,
  openCart: () => set({ cartOpen: true }),
  closeCart: () => set({ cartOpen: false }),
  openStorePicker: () => set({ storePickerOpen: true }),
  closeStorePicker: () => set({ storePickerOpen: false }),
  openProduct: (product) => set({ product }),
  closeProduct: () => set({ product: null }),
}));
