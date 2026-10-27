import type {
  Address,
  CatalogProduct,
  Category,
  CustomerProfile,
  HomeFeed,
  Paginated,
  PaymentsConfig,
  SavedPaymentMethod,
  StoreDetail,
  StoreSummary,
} from '@smartcart/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { customerApi, publicApi } from './api';
import { useSession } from './auth';
import { useShop } from './stores';

export function useStores(origin?: { lat: number; lng: number } | null) {
  return useQuery({
    queryKey: ['stores', origin ?? null],
    queryFn: () => publicApi.get<StoreSummary[]>('/stores', origin ?? undefined),
    staleTime: 5 * 60_000,
  });
}

export function useProfile() {
  const session = useSession('CUSTOMER');
  return useQuery({ queryKey: ['profile'], queryFn: () => customerApi.get<CustomerProfile>('/me/profile'), enabled: Boolean(session) });
}

/** The selected store, else the shopper's home store, else the first store. */
export function useCurrentStore() {
  const storeId = useShop((s) => s.storeId);
  const setStore = useShop((s) => s.setStore);
  const session = useSession('CUSTOMER');
  const { data: stores = [], isLoading } = useStores();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const store = stores.find((s) => s.id === storeId);
  useEffect(() => {
    if (isLoading || stores.length === 0 || store) return;
    if (session && profileLoading) return;
    setStore((stores.find((s) => s.id === profile?.defaultStoreId) ?? stores[0]!).id);
  }, [isLoading, stores, store, setStore, session, profileLoading, profile?.defaultStoreId]);
  return { store: store ?? stores[0], stores, isLoading };
}

export function useStoreDetail(storeId: string | undefined | null) {
  return useQuery({
    queryKey: ['store', storeId],
    queryFn: () => publicApi.get<StoreDetail>(`/stores/${storeId}`),
    enabled: Boolean(storeId),
    staleTime: 5 * 60_000,
  });
}

export function useHomeFeed(storeId: string | undefined) {
  return useQuery({
    queryKey: ['home', storeId],
    queryFn: () => publicApi.get<HomeFeed>('/catalog/home', { storeId }),
    enabled: Boolean(storeId),
  });
}

export function useCategories(storeId: string | undefined) {
  return useQuery({
    queryKey: ['categories', storeId],
    queryFn: () => publicApi.get<Category[]>('/catalog/categories', { storeId }),
    enabled: Boolean(storeId),
    staleTime: 10 * 60_000,
  });
}

export function usePaymentsConfig() {
  return useQuery({
    queryKey: ['payments-config'],
    queryFn: () => publicApi.get<PaymentsConfig>('/payments/config'),
    staleTime: 10 * 60_000,
  });
}

export function useAddresses() {
  const session = useSession('CUSTOMER');
  return useQuery({ queryKey: ['addresses'], queryFn: () => customerApi.get<Address[]>('/me/addresses'), enabled: Boolean(session) });
}

export function useSavedMethods() {
  const session = useSession('CUSTOMER');
  return useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => customerApi.get<SavedPaymentMethod[]>('/me/payment-methods'),
    enabled: Boolean(session),
  });
}

export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Type-ahead over a store's catalogue; results carry price, stock and aisle location. */
export function useProductSearch(storeId: string | null | undefined, q: string, limit = 6) {
  const query = useDebounced(q.trim(), 200);
  return useQuery({
    queryKey: ['product-search', storeId, query, limit],
    queryFn: () => publicApi.get<Paginated<CatalogProduct>>('/catalog/products', { storeId, q: query, limit }),
    enabled: Boolean(storeId) && query.length >= 2,
    placeholderData: (previous) => previous,
  });
}

/** The current time, re-rendering every `intervalMs` (countdowns, "x min ago"). */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
