import {
  formatMoney,
  parseCartPairCode,
  pluralize,
  type CatalogProduct,
  type InStoreSession,
  type Paginated,
  type SessionUpdateEvent,
} from '@smartcart/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2Off, Minus, Plus, Search, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Logo } from '@/components/brand';
import { LocationTag } from '@/components/product';
import { Button, Card, Input } from '@/components/ui';
import { deviceClient, errorMessage, publicApi } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useDebounced } from '@/lib/utils';
import { DeviceKeyField } from './DeviceKeyField';
import { useDevice, useDeviceKey } from './device';

/**
 * Smart-cart simulator: the trolley's screen and barcode reader. Pair it with
 * the code in the shopper's app, then "drop" products in or take them out;
 * the shopper's cart and the store inventory update instantly.
 */
export default function SmartCartSimulator() {
  const [params] = useSearchParams();
  const { key, setKey } = useDeviceKey('SMART_CART', params);
  const { data: device, error: deviceError } = useDevice(key);
  const queryClient = useQueryClient();
  const client = deviceClient(key);
  const sessionKey = ['cart-session', key];
  const { data } = useQuery({
    queryKey: sessionKey,
    queryFn: () => client.get<{ session: InStoreSession | null }>('/devices/cart/session'),
    enabled: Boolean(device),
    refetchInterval: 3000,
  });
  const session = data?.session ?? null;
  const [code, setCode] = useState(params.get('code') ?? '');
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 250);
  const [last, setLast] = useState<string | null>(null);

  const { data: products } = useQuery({
    queryKey: ['cart-products', device?.storeId, query],
    queryFn: () =>
      publicApi.get<Paginated<CatalogProduct>>('/catalog/products', {
        query: { storeId: device!.storeId, q: query || undefined, limit: 12, inStockOnly: true },
      }),
    enabled: Boolean(device && session),
    placeholderData: keepPreviousData,
  });

  const pair = useMutation({
    mutationFn: () => client.post<InStoreSession>('/devices/cart/pair', { pairingCode: parseCartPairCode(code) ?? code }),
    onSuccess: (s) => {
      queryClient.setQueryData(sessionKey, { session: s });
      toast.success('Cart paired', `Connected to the shopper at ${s.storeName}`);
    },
    onError: (error) => toast.error('Pairing failed', errorMessage(error)),
  });
  const scan = useMutation({
    mutationFn: ({ barcode, quantity }: { barcode: string; quantity: number }) =>
      client.post<SessionUpdateEvent>('/devices/cart/items', { barcode, quantity }),
    onSuccess: (event) => {
      queryClient.setQueryData(sessionKey, { session: event.session });
      if (event.change) setLast(`${event.change.type === 'REMOVED' ? 'Removed' : 'Added'} ${event.change.productName}`);
    },
    onError: (error) => toast.error('Scan failed', errorMessage(error)),
  });
  const unpair = useMutation({
    mutationFn: () => client.post('/devices/cart/unpair'),
    onSuccess: () => {
      queryClient.setQueryData(sessionKey, { session: null });
      setCode('');
    },
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
        <Link to="/devices">
          <Logo dark subtitle={device ? `${device.name} · ${device.storeName}` : 'Smart cart'} />
        </Link>
        <DeviceKeyField value={key} onChange={setKey} error={deviceError ? errorMessage(deviceError) : null} />
      </header>

      {!device ? (
        <p className="px-6 text-white/60">Connect the cart with its device key to start.</p>
      ) : !session ? (
        <main className="mx-auto max-w-md px-6 py-10 text-center">
          <span className="mx-auto flex size-20 items-center justify-center rounded-3xl bg-brand-600">
            <ShoppingCart className="size-10" />
          </span>
          <h1 className="mt-6 text-2xl font-extrabold">Pair this cart</h1>
          <p className="mt-2 text-white/60">
            In the SmartCart app, tap “Pair smart cart” and enter the 6-digit code here (or scan its QR with the cart's reader).
          </p>
          <form
            className="mt-6 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              pair.mutate();
            }}
          >
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              placeholder="000000"
              className="h-16 border-white/10 bg-white/10 text-center font-mono text-3xl tracking-[0.4em] text-white placeholder:text-white/20"
              autoFocus
            />
            <Button type="submit" block size="lg" variant="accent" loading={pair.isPending} disabled={code.length !== 6}>
              Pair cart
            </Button>
          </form>
        </main>
      ) : (
        <main className="mx-auto grid max-w-6xl gap-6 px-6 pb-10 lg:grid-cols-[1fr_380px]">
          <div>
            <div className="relative">
              <Search className="pointer-events-none absolute top-3 left-3 size-5 text-white/40" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Find a product to drop into the cart"
                className="h-11 border-white/10 bg-white/10 pl-10 text-white placeholder:text-white/40"
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {products?.items.map((p) => {
                const inCart = session.items.find((i) => i.productId === p.id);
                return (
                  <Card key={p.id} className="flex flex-col border-white/10 bg-white/5 p-3 text-white">
                    <div
                      className="flex aspect-square items-center justify-center rounded-xl text-5xl"
                      style={{ backgroundColor: p.color }}
                    >
                      {p.emoji}
                    </div>
                    <p className="mt-2 line-clamp-2 min-h-10 text-sm font-semibold">{p.name}</p>
                    <div className="mt-1 flex items-center justify-between text-xs text-white/60">
                      <span>{formatMoney(p.price)}</span>
                      <LocationTag location={p.location} />
                    </div>
                    <div className="mt-3 flex gap-2">
                      {inCart && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="px-2"
                          aria-label="Take out"
                          onClick={() => scan.mutate({ barcode: p.barcode, quantity: -1 })}
                        >
                          <Minus className="size-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        block
                        variant="accent"
                        icon={<Plus className="size-4" />}
                        onClick={() => scan.mutate({ barcode: p.barcode, quantity: 1 })}
                      >
                        {inCart ? `In cart · ${inCart.quantity}` : 'Drop in'}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
          <Card className="flex flex-col border-white/10 bg-white/5 text-white lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <p className="font-bold">Cart contents</p>
                <p className="text-xs text-white/50">
                  Session {session.pairingCode} · {session.status === 'CHECKOUT' ? 'shopper is paying' : 'shopping'}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-white/70 hover:bg-white/10"
                icon={<Link2Off className="size-4" />}
                loading={unpair.isPending}
                onClick={() => unpair.mutate()}
              >
                Unpair
              </Button>
            </div>
            {last && <p className="animate-fade-in border-b border-white/10 bg-brand-600/20 px-5 py-2 text-sm text-brand-200">{last}</p>}
            <ul className="flex-1 divide-y divide-white/5 overflow-y-auto">
              {session.items.length === 0 && <li className="px-5 py-8 text-center text-sm text-white/50">Drop a product in to start</li>}
              {session.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className="text-xl">{item.emoji}</span>
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold">×{item.quantity}</span>
                  <span className="tabular w-16 text-right">{formatMoney(item.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-white/10 px-5 py-4">
              <div className="flex items-end justify-between">
                <span className="text-white/60">{pluralize(session.bill.itemCount, 'item')}</span>
                <span className="tabular text-3xl font-extrabold">{formatMoney(session.bill.total)}</span>
              </div>
              <p className="mt-1 text-xs text-white/40">The shopper pays on their phone, then scans the receipt at the exit gate.</p>
            </div>
          </Card>
        </main>
      )}
    </div>
  );
}
