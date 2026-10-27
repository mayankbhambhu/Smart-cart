import {
  describeLocation,
  formatMoney,
  pluralize,
  type CatalogProduct,
  type InStoreSession,
  type ShoppingListSummary,
} from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, DoorOpen, MapPin, Route, ScanLine, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { StoreMap } from '@/components/StoreMap';
import { LocationTag, ProductArt } from '@/components/product';
import { Badge, Button, Card, Select } from '@/components/ui';
import { customerApi, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { useShop } from '@/lib/stores';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useCurrentStore, useStoreDetail } from './hooks';
import { ProductSearchBox } from '@/components/ProductSearchBox';

const STEPS = [
  {
    icon: <ScanLine className="size-5" />,
    title: 'Scan as you shop',
    body: 'Scan each barcode with your phone, or pair a smart cart that scans for you.',
  },
  {
    icon: <Route className="size-5" />,
    title: 'Follow the fastest route',
    body: 'Your family list is sorted into the shortest walk through the aisles.',
  },
  {
    icon: <Smartphone className="size-5" />,
    title: 'Tap to pay',
    body: 'Apple Pay, Google Pay, UPI or card, right on your phone. No queues.',
  },
  { icon: <DoorOpen className="size-5" />, title: 'Walk out', body: 'Scan your digital receipt at the exit gate and it opens.' },
];

/** Scan & Go landing: pick the store and a list, find items, start shopping. */
export default function InStorePage() {
  const session = useSession('CUSTOMER');
  const { store, stores } = useCurrentStore();
  const setStore = useShop((s) => s.setStore);
  const [params] = useSearchParams();
  const [listId, setListId] = useState(params.get('list') ?? '');
  const [found, setFound] = useState<CatalogProduct | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: detail } = useStoreDetail(store?.id);

  const { data: active } = useQuery({
    queryKey: ['instore-session'],
    queryFn: () => customerApi.get<{ session: InStoreSession | null }>('/instore/session'),
    enabled: Boolean(session),
  });
  const { data: lists = [] } = useQuery({
    queryKey: ['lists'],
    queryFn: () => customerApi.get<ShoppingListSummary[]>('/lists'),
    enabled: Boolean(session),
  });

  const start = useMutation({
    mutationFn: () => customerApi.post<InStoreSession>('/instore/sessions', { storeId: store!.id, listId: listId || undefined }),
    onSuccess: (started) => {
      // Seed the session page's query so it does not see the cached "no session" answer.
      queryClient.setQueryData(['instore-session'], { session: started });
      navigate('/instore/session');
    },
    onError: (error) => toast.error('Could not start shopping', errorMessage(error)),
  });

  const inStoreStores = stores.filter((s) => s.supportsInStore);
  const current = active?.session;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-brand-900 p-6 text-white sm:p-10">
        <Badge tone="dark" className="bg-white/10">
          New · No lines, no cashiers
        </Badge>
        <h1 className="mt-3 max-w-xl text-3xl font-extrabold tracking-tight sm:text-4xl">Scan &amp; Go: shop the store with your phone</h1>
        <p className="mt-3 max-w-xl text-white/70">
          Tell us what you need and we show exactly where it is, like <strong className="text-white">Aisle 4 · Row 2</strong>, with a
          running total as you shop.
        </p>
        {current && current.status !== 'PAID' ? (
          <Card className="mt-6 flex flex-wrap items-center gap-4 border-white/10 bg-white/10 p-4 text-white">
            <div className="flex-1">
              <p className="font-semibold">You are shopping at {current.storeName}</p>
              <p className="text-sm text-white/70">
                {pluralize(current.bill.itemCount, 'item')} · {formatMoney(current.bill.total)}
              </p>
            </div>
            <Link to="/instore/session">
              <Button variant="accent" icon={<ArrowRight className="size-4" />}>
                Continue shopping
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="mt-6 grid max-w-2xl gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <Select
              value={store?.id ?? ''}
              onChange={(e) => setStore(e.target.value)}
              className="h-12 border-white/10 bg-white/10 text-white [&>option]:text-slate-900"
              aria-label="Store"
            >
              {inStoreStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Select
              value={listId}
              onChange={(e) => setListId(e.target.value)}
              className="h-12 border-white/10 bg-white/10 text-white [&>option]:text-slate-900"
              aria-label="Shopping list"
              disabled={!session}
            >
              <option value="">No list, just browsing</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.emoji} {l.name} ({l.itemCount - l.checkedCount} items)
                </option>
              ))}
            </Select>
            {session ? (
              <Button
                size="lg"
                variant="accent"
                loading={start.isPending}
                disabled={!store?.supportsInStore}
                onClick={() => start.mutate()}
              >
                I'm in the store
              </Button>
            ) : (
              <Link to="/login?next=/instore">
                <Button size="lg" variant="accent" block>
                  Log in to start
                </Button>
              </Link>
            )}
          </div>
        )}
        {store && !store.isOpenNow && (
          <p className="mt-3 text-sm text-amber-300">
            {store.name} is closed right now (opens {store.openingTime}).
          </p>
        )}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card className="p-5">
          <h2 className="text-lg font-bold text-slate-900">Where is it?</h2>
          <p className="text-sm text-slate-500">Search or ask by voice: “where is the peanut butter?”</p>
          <ProductSearchBox storeId={store?.id} placeholder="Find an item in this store" className="mt-4" onPick={setFound} />
          {found ? (
            <div className="mt-4 flex items-center gap-4 rounded-2xl bg-sky-50 p-4">
              <ProductArt emoji={found.emoji} color={found.color} imageUrl={found.imageUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">{found.name}</p>
                <p className="flex items-center gap-1 text-sm font-bold text-sky-800">
                  <MapPin className="size-4" /> {describeLocation(found.location, { withLabel: true })}
                </p>
                <p className="text-xs text-slate-500">
                  {formatMoney(found.price)} ·{' '}
                  {found.stockStatus === 'OUT_OF_STOCK'
                    ? 'Out of stock'
                    : found.onShelf
                      ? `${found.availableQty} on the shelf`
                      : 'In the storeroom, ask staff'}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
              Pick a product to see its aisle, row and shelf on the map.
            </p>
          )}
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">{step.icon}</span>
                <span>
                  <span className="block text-sm font-bold text-slate-900">
                    {i + 1}. {step.title}
                  </span>
                  <span className="block text-sm text-slate-500">{step.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="font-bold text-slate-900">{store?.name ?? 'Store'} floor plan</p>
            {found?.location && <LocationTag location={found.location} />}
          </div>
          {detail ? (
            <StoreMap layout={detail.layout} highlight={found?.location ?? null} />
          ) : (
            <div className={cn('aspect-[4/3] animate-pulse rounded-2xl bg-slate-100')} />
          )}
        </Card>
      </div>
    </div>
  );
}
