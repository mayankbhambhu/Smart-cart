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
import { useEffect } from 'react';
import { customerApi, publicApi, type QueryParams } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { useShop } from '@/lib/stores';

export function useStores() {
  return useQuery({ queryKey: ['stores'], queryFn: () => publicApi.get<StoreSummary[]>('/stores'), staleTime: 5 * 60_000 });
}

/** The store the shopper buys from: their pick, else their home store, else the first (nearest) store. */
export function useCurrentStore(): { store: StoreSummary | undefined; stores: StoreSummary[]; isLoading: boolean } {
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

export function useStoreDetail(storeId: string | undefined) {
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
    queryFn: () => publicApi.get<HomeFeed>('/catalog/home', { query: { storeId } }),
    enabled: Boolean(storeId),
  });
}

export function useCategories(storeId: string | undefined) {
  return useQuery({
    queryKey: ['categories', storeId],
    queryFn: () => publicApi.get<Category[]>('/catalog/categories', { query: { storeId } }),
    enabled: Boolean(storeId),
    staleTime: 5 * 60_000,
  });
}

export function useProducts(params: QueryParams & { storeId?: string }, enabled = true) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: () => publicApi.get<Paginated<CatalogProduct>>('/catalog/products', { query: params }),
    enabled: Boolean(params.storeId) && enabled,
  });
}

export function usePaymentsConfig() {
  return useQuery({
    queryKey: ['payments-config'],
    queryFn: () => publicApi.get<PaymentsConfig>('/payments/config'),
    staleTime: 10 * 60_000,
  });
}

export function useProfile() {
  const session = useSession('CUSTOMER');
  return useQuery({ queryKey: ['profile'], queryFn: () => customerApi.get<CustomerProfile>('/me/profile'), enabled: Boolean(session) });
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
