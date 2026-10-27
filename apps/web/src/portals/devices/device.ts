import type { DeviceType, StoreDetail } from '@smartcart/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { deviceClient, publicApi } from '@/lib/api';

export interface DeviceInfo {
  id: string;
  storeId: string;
  type: DeviceType;
  name: string;
  storeName: string;
  storeCode: string;
}

const SUFFIX: Record<DeviceType, string> = { EXIT_GATE: 'gate1', SMART_CART: 'cart01', KIOSK: 'kiosk' };

/** Seeded development keys follow scdev_<store code>_<device>. */
export function demoKey(storeCode: string, type: DeviceType): string {
  return `scdev_${storeCode.toLowerCase()}_${SUFFIX[type]}`;
}

function storageKey(type: DeviceType) {
  return `smartcart-device-key:${type}`;
}

function readKey(type: DeviceType): string {
  try {
    return localStorage.getItem(storageKey(type)) ?? '';
  } catch {
    return '';
  }
}

/**
 * The simulator's device key: from ?key=, from local storage, or derived
 * from ?store=<storeId> using the seeded demo key pattern.
 */
export function useDeviceKey(type: DeviceType, params: URLSearchParams) {
  const [key, setKeyState] = useState(() => params.get('key') ?? readKey(type));
  const storeId = params.get('store');
  const { data: store } = useQuery({
    queryKey: ['store', storeId],
    queryFn: () => publicApi.get<StoreDetail>(`/stores/${storeId}`),
    enabled: Boolean(storeId) && !key,
  });
  useEffect(() => {
    if (!key && store) setKeyState(demoKey(store.code, type));
  }, [key, store, type]);
  const setKey = (value: string) => {
    setKeyState(value);
    try {
      localStorage.setItem(storageKey(type), value);
    } catch {
      // private mode: keep it for this tab only
    }
  };
  return { key, setKey };
}

export function useDevice(key: string) {
  return useQuery({
    queryKey: ['device', key],
    queryFn: () => deviceClient(key).get<DeviceInfo>('/devices/me'),
    enabled: key.length > 10,
    retry: false,
  });
}
