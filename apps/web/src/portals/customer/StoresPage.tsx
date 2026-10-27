import { STOCK_STATUS_LABELS, formatMoney, shortLocation, type StockCheckResult, type StoreSummary } from '@smartcart/shared';
import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import { Clock, LocateFixed, Navigation, PackageSearch, Phone, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { useNavigate } from 'react-router';
import { ProductArt } from '@/components/product';
import { Badge, Button, Card, EmptyState, Input, Skeleton } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { useShop } from '@/lib/stores';
import { toast } from '@/lib/toast';
import { cn, useDebounced } from '@/lib/utils';

const storeIcon = (active: boolean) =>
  L.divIcon({
    className: '',
    html: `<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center">
      <div style="background:${active ? '#0a8f45' : '#0f172a'};color:#fff;border-radius:9999px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 4px 12px rgba(0,0,0,.25);border:2px solid #fff">🏪</div>
      <div style="width:2px;height:8px;background:${active ? '#0a8f45' : '#0f172a'}"></div></div>`,
    iconSize: [0, 0],
  });

const meIcon = L.divIcon({
  className: '',
  html: '<div style="transform:translate(-50%,-50%);width:16px;height:16px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,.2)"></div>',
  iconSize: [0, 0],
});

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(',')).join('|');
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) map.setView(points[0]!, 13);
    else map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 13 });
  }, [key, map]); // `points` is captured through `key`
  return null;
}

/** Store locator with a live map, plus "is it in stock?" across every store before leaving home. */
export default function StoresPage() {
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [area, setArea] = useState('');
  const [item, setItem] = useState('');
  const debouncedArea = useDebounced(area, 300);
  const debouncedItem = useDebounced(item.trim(), 350);
  const storeId = useShop((s) => s.storeId);
  const setStore = useShop((s) => s.setStore);
  const navigate = useNavigate();

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ['stores', origin, debouncedArea],
    queryFn: () => publicApi.get<StoreSummary[]>('/stores', { query: { ...origin, q: debouncedArea || undefined } }),
  });
  const { data: stock, isFetching: checking } = useQuery({
    queryKey: ['stock-check', debouncedItem, origin],
    queryFn: () => publicApi.get<StockCheckResult[]>('/stores/stock-check', { query: { q: debouncedItem, ...origin } }),
    enabled: debouncedItem.length >= 2,
  });

  const points = useMemo<[number, number][]>(() => {
    const list: [number, number][] = stores.map((s) => [s.lat, s.lng]);
    if (origin) list.push([origin.lat, origin.lng]);
    return list;
  }, [stores, origin]);

  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      (pos) => setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => toast.error('Location unavailable', 'Search by area or PIN code instead.'),
    );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Stores near you</h1>
          <p className="text-sm text-slate-500">Check opening hours and whether your item is in stock before you leave home.</p>
        </div>
        <Button variant="outline" icon={<LocateFixed className="size-4" />} onClick={locate}>
          Use my location
        </Button>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[400px_1fr]">
        <div className="space-y-4">
          <Card className="p-4">
            <p className="flex items-center gap-2 font-bold text-slate-900">
              <PackageSearch className="size-5 text-brand-600" /> Inventory check
            </p>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute top-2.5 left-3 size-5 text-slate-400" />
              <Input
                className="pl-10"
                value={item}
                onChange={(e) => setItem(e.target.value)}
                placeholder="Is it in stock? e.g. almond milk"
              />
            </div>
            {debouncedItem.length >= 2 && (
              <div className={cn('mt-3 space-y-3', checking && 'opacity-60')}>
                {stock?.length === 0 && <p className="text-sm text-slate-500">No products match "{debouncedItem}".</p>}
                {stock?.slice(0, 4).map((result) => (
                  <div key={result.product.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center gap-3">
                      <ProductArt emoji={result.product.emoji} color={result.product.color} imageUrl={result.product.imageUrl} size="xs" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{result.product.name}</p>
                        <p className="text-xs text-slate-500">{result.product.unit}</p>
                      </div>
                    </div>
                    <ul className="mt-2 space-y-1.5">
                      {result.stores.map((entry) => (
                        <li key={entry.store.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate text-slate-700">{entry.store.name.replace('SmartCart ', '')}</span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <span className="tabular font-semibold">{formatMoney(entry.price)}</span>
                            {entry.location && entry.stockStatus !== 'OUT_OF_STOCK' && (
                              <span className="font-mono text-slate-500">{shortLocation(entry.location)}</span>
                            )}
                            <Badge tone={entry.stockStatus === 'IN_STOCK' ? 'green' : entry.stockStatus === 'LOW_STOCK' ? 'orange' : 'red'}>
                              {entry.stockStatus === 'LOW_STOCK' ? `${entry.availableQty} left` : STOCK_STATUS_LABELS[entry.stockStatus]}
                            </Badge>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-5 text-slate-400" />
            <Input
              className="pl-10"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Search by area, city or PIN code"
            />
          </div>
          {isLoading ? (
            <Skeleton className="h-40" />
          ) : stores.length === 0 ? (
            <EmptyState icon="🗺️" title="No stores found" body="Try another area or PIN code." />
          ) : (
            <ul className="space-y-3">
              {stores.map((store) => (
                <li key={store.id}>
                  <Card className={cn('p-4', store.id === storeId && 'border-brand-500 ring-1 ring-brand-500')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900">{store.name}</p>
                        <p className="truncate text-sm text-slate-500">
                          {store.addressLine}, {store.city} {store.pincode}
                        </p>
                      </div>
                      <Badge tone={store.isOpenNow ? 'green' : 'gray'}>{store.isOpenNow ? 'Open now' : 'Closed'}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3.5" />{' '}
                        {store.openingTime === store.closingTime ? 'Open 24 hours' : `${store.openingTime}–${store.closingTime}`}
                      </span>
                      <a href={`tel:${store.phone}`} className="flex items-center gap-1 hover:text-brand-700">
                        <Phone className="size-3.5" /> {store.phone}
                      </a>
                      {store.distanceKm !== null && <span>{store.distanceKm} km away</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {store.supportsDelivery && <Badge tone="green">⚡ {store.deliveryEtaMinutes}-min delivery</Badge>}
                      {store.supportsPickup && <Badge tone="blue">🛍️ Pickup</Badge>}
                      {store.supportsInStore && <Badge tone="violet">📱 Scan &amp; Go</Badge>}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          setStore(store.id);
                          navigate('/');
                        }}
                      >
                        Shop this store
                      </Button>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Button size="sm" variant="outline" icon={<Navigation className="size-4" />}>
                          Directions
                        </Button>
                      </a>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Card className="h-[420px] overflow-hidden lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)]">
          <MapContainer center={[12.97, 77.62]} zoom={12} className="h-full w-full" scrollWheelZoom>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds points={points} />
            {stores.map((store) => (
              <Marker key={store.id} position={[store.lat, store.lng]} icon={storeIcon(store.id === storeId)}>
                <Popup>
                  <strong>{store.name}</strong>
                  <br />
                  {store.addressLine}
                  <br />
                  {store.isOpenNow ? 'Open now' : 'Closed'}
                </Popup>
              </Marker>
            ))}
            {origin && <Marker position={[origin.lat, origin.lng]} icon={meIcon} />}
          </MapContainer>
        </Card>
      </div>
    </div>
  );
}
