import {
  SocketEvents,
  buildCartPairUri,
  describeLocation,
  formatMoney,
  locationPoint,
  planRoute,
  pluralize,
  type CatalogProduct,
  type CheckoutResult,
  type InStoreSession,
  type ItemLocation,
  type ListItem,
  type ListUpdateEvent,
  type RoutablePoint,
  type SessionUpdateEvent,
  type ShoppingList,
  type ShoppingListSummary,
} from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronRight,
  ClipboardList,
  Footprints,
  Link2,
  MapPin,
  Navigation,
  ScanLine,
  ShoppingCart,
  SkipForward,
  Tag,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { QRCode } from '@/components/codes';
import { usePayment } from '@/components/PaymentSheet';
import { LocationTag, ProductArt } from '@/components/product';
import { ScannerModal } from '@/components/Scanner';
import { StoreMap } from '@/components/StoreMap';
import { Badge, Button, Card, Field, IconButton, Input, Modal, PageLoader, Select, Stepper, Tabs } from '@/components/ui';
import { ApiError, customerApi, errorMessage } from '@/lib/api';
import { useRoom, useSocketEvent } from '@/lib/socket';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useStoreDetail } from './hooks';
import { PaymentMethodPicker, type MethodChoice } from './payment-methods';
import { ProductSearchBox } from '@/components/ProductSearchBox';

const SESSION_KEY = ['instore-session'];

/**
 * The shopper's phone while they walk the store: family list sorted into the
 * shortest route, live cart total, scanning, item finder and checkout.
 */
export default function InStoreSessionPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: SESSION_KEY,
    queryFn: () => customerApi.get<{ session: InStoreSession | null }>('/instore/session'),
  });
  const session = data?.session ?? null;
  const [lastPaidOrder, setLastPaidOrder] = useState<string | null>(null);

  const setSession = useCallback((next: InStoreSession) => queryClient.setQueryData(SESSION_KEY, { session: next }), [queryClient]);

  useRoom('CUSTOMER', SocketEvents.JOIN_SESSION, SocketEvents.LEAVE_SESSION, session?.id);
  useSocketEvent<SessionUpdateEvent | { sessionId: string; status: 'PAID' }>('CUSTOMER', SocketEvents.SESSION_UPDATED, (payload) => {
    if ('session' in payload) {
      if (payload.session.id !== session?.id) return;
      setSession(payload.session);
      if (payload.change?.source === 'SMART_CART') {
        const verb = payload.change.type === 'REMOVED' ? 'removed' : 'added';
        toast.info(`Smart cart ${verb} ${payload.change.productName}`, `Total now ${formatMoney(payload.session.bill.total)}`);
      }
    } else if (payload.status === 'PAID' && session?.orderId) {
      setLastPaidOrder(session.orderId);
    }
  });

  useEffect(() => {
    if (lastPaidOrder) navigate(`/exit/${lastPaidOrder}`, { replace: true });
  }, [lastPaidOrder, navigate]);

  if (isLoading) return <PageLoader label="Opening your cart…" />;
  if (!session) return <Navigate to="/instore" replace />;
  return <SessionView session={session} onSession={setSession} />;
}

function SessionView({ session, onSession }: { session: InStoreSession; onSession: (session: InStoreSession) => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: store } = useStoreDetail(session.storeId);
  const [tab, setTab] = useState<'route' | 'cart'>('route');
  const [scanning, setScanning] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [found, setFound] = useState<CatalogProduct | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [lastLocation, setLastLocation] = useState<ItemLocation | null>(null);

  // The family list, live: items added at home appear on the route instantly.
  const listKey = ['list', session.listId, session.storeId];
  const { data: list } = useQuery({
    queryKey: listKey,
    queryFn: () => customerApi.get<ShoppingList>(`/lists/${session.listId}`, { query: { storeId: session.storeId } }),
    enabled: Boolean(session.listId),
  });
  useRoom('CUSTOMER', SocketEvents.JOIN_LIST, SocketEvents.LEAVE_LIST, session.listId);
  useSocketEvent<ListUpdateEvent>('CUSTOMER', SocketEvents.LIST_UPDATED, (event) => {
    if (event.listId === session.listId) void queryClient.invalidateQueries({ queryKey: ['list', session.listId] });
  });

  const inCart = useMemo(() => new Map(session.items.map((i) => [i.productId, i])), [session.items]);
  const pendingItems = useMemo(
    () => (list?.items ?? []).filter((i) => !i.isChecked && !(i.productId && inCart.has(i.productId)) && !skipped.has(i.id)),
    [list?.items, inCart, skipped],
  );

  const plan = useMemo(() => {
    if (!store) return null;
    let start: RoutablePoint = store.layout.entrance;
    const point = lastLocation ? locationPoint(store.layout, lastLocation) : null;
    if (point && lastLocation) start = { ...point, aisle: lastLocation.aisle };
    return planRoute(
      store.layout,
      pendingItems.map((item) => ({ location: item.product?.location, payload: item })),
      { start },
    );
  }, [store, pendingItems, lastLocation]);

  const nextStop = plan?.stops[0];

  const afterChange = (event: SessionUpdateEvent, message?: string) => {
    onSession(event.session);
    const item = event.session.items.find((i) => i.productId === event.change?.productId);
    if (item?.location) setLastLocation(item.location);
    if (message) toast.success(message, `Cart total ${formatMoney(event.session.bill.total)}`);
    if (session.listId) void queryClient.invalidateQueries({ queryKey: ['list', session.listId] });
  };

  const add = useMutation({
    mutationFn: (input: { barcode?: string; productId?: string }) =>
      customerApi.post<SessionUpdateEvent>(`/instore/sessions/${session.id}/items`, { ...input, quantity: 1 }),
    onSuccess: (event) => {
      const item = event.session.items.find((i) => i.productId === event.change?.productId);
      afterChange(event, item ? `${item.name} · ${formatMoney(item.unitPrice)}` : 'Added to cart');
      setScanning(false);
    },
    onError: (error) =>
      toast.error(error instanceof ApiError && error.status === 404 ? 'Product not found' : 'Could not add the item', errorMessage(error)),
  });

  const setQuantity = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      customerApi.patch<SessionUpdateEvent>(`/instore/sessions/${session.id}/items/${itemId}`, { quantity }),
    onSuccess: (event) => afterChange(event),
    onError: (error) => toast.error('Could not update the cart', errorMessage(error)),
  });

  const onScan = useCallback((code: string) => add.mutate({ barcode: code }), [add]);

  const { pay, sheet } = usePayment();
  const checkout = useMutation({
    mutationFn: async ({ method, coupon }: { method: MethodChoice; coupon: string }) => {
      const result = await customerApi.post<CheckoutResult>(`/instore/sessions/${session.id}/checkout`, {
        paymentMethod: method.method,
        savedPaymentMethodId: method.savedPaymentMethodId,
        couponCode: coupon.trim() || undefined,
      });
      setCheckingOut(false);
      return { result, paid: await pay(result) };
    },
    onSuccess: async ({ result, paid }) => {
      if (paid && paid.paymentStatus === 'PAID') {
        navigate(`/exit/${result.order.id}`, { replace: true });
        return;
      }
      // Sheet closed without paying: cancel the pending order and keep shopping.
      const resumed = await customerApi.post<InStoreSession>(`/instore/sessions/${session.id}/resume`).catch(() => null);
      if (resumed) onSession(resumed);
      toast.info('Payment cancelled', 'Your cart is still here.');
    },
    onError: (error) => toast.error('Checkout failed', errorMessage(error)),
  });
  const totalQty = session.items.reduce((sum, i) => sum + i.quantity, 0);

  // The live update says "checkout" as soon as payment starts; keep this screen (and its payment sheet) while paying here.
  if (session.status === 'CHECKOUT' && !checkout.isPending) {
    return <PendingCheckout session={session} onSession={onSession} />;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 pb-32 lg:pb-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">Scan &amp; Go · In store</p>
          <h1 className="truncate text-xl font-extrabold text-slate-900">{session.storeName}</h1>
        </div>
        <Button variant="outline" size="sm" icon={<Link2 className="size-4" />} onClick={() => setPairing(true)}>
          {session.cartDevice ? session.cartDevice.name : 'Pair smart cart'}
        </Button>
        <Button variant="ghost" size="sm" className="text-slate-500" onClick={() => setLeaving(true)}>
          Leave
        </Button>
      </div>

      <ProductSearchBox
        storeId={session.storeId}
        className="mt-4"
        placeholder='Tell us what you need: "basmati rice", "eggs"…'
        onPick={(product) => {
          setFound(product);
          setTab('route');
        }}
      />

      {found && (
        <Card className="mt-3 flex flex-wrap items-center gap-3 border-sky-200 bg-sky-50 p-3">
          <ProductArt emoji={found.emoji} color={found.color} imageUrl={found.imageUrl} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-slate-900">{found.name}</p>
            <p className="flex items-center gap-1 text-sm font-extrabold text-sky-800">
              <MapPin className="size-4" /> {describeLocation(found.location, { withLabel: true })}
            </p>
            <p className="text-xs text-slate-600">
              {formatMoney(found.price)} ·{' '}
              {found.stockStatus === 'OUT_OF_STOCK'
                ? 'Out of stock'
                : found.onShelf
                  ? 'On the shelf'
                  : 'In the storeroom, ask a staff member'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" icon={<ScanLine className="size-4" />} onClick={() => setScanning(true)}>
              Scan it
            </Button>
            <IconButton label="Close" onClick={() => setFound(null)}>
              <X className="size-4" />
            </IconButton>
          </div>
        </Card>
      )}

      <Tabs
        className="mt-4 lg:hidden"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'route', label: 'Route & list', count: pendingItems.length },
          { value: 'cart', label: 'My cart', count: totalQty },
        ]}
      />

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className={cn('space-y-4', tab !== 'route' && 'hidden lg:block')}>
          {nextStop ? (
            <Card className="overflow-hidden border-brand-200">
              <div className="flex items-center gap-3 bg-brand-600 px-4 py-3 text-white">
                <Navigation className="size-5" />
                <div className="flex-1">
                  <p className="text-xs font-semibold opacity-80">Next stop · {plan!.stops.length} to go</p>
                  <p className="text-lg font-extrabold">{describeLocation(nextStop.location)}</p>
                </div>
                <span className="text-right text-xs opacity-90">
                  <Footprints className="ml-auto size-4" />
                  {Math.round(nextStop.distanceFromPrevious)} m
                </span>
              </div>
              <ul className="divide-y divide-slate-100">
                {nextStop.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                    {item.product && (
                      <ProductArt emoji={item.product.emoji} color={item.product.color} imageUrl={item.product.imageUrl} size="xs" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {item.name} <span className="font-normal text-slate-500">× {item.quantity}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        Shelf {item.product?.location?.shelf} · {item.product ? formatMoney(item.product.price) : ''} · added by{' '}
                        {item.addedByName.split(' ')[0]}
                      </p>
                    </div>
                    <IconButton label="Skip for now" onClick={() => setSkipped((s) => new Set(s).add(item.id))}>
                      <SkipForward className="size-4" />
                    </IconButton>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2 border-t border-slate-100 p-3">
                <Button block icon={<ScanLine className="size-4" />} onClick={() => setScanning(true)}>
                  Scan item
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="p-5 text-center">
              {session.listId ? (
                <>
                  <p className="text-3xl">🎉</p>
                  <p className="mt-1 font-bold text-slate-900">Everything on your list is in the cart</p>
                  <p className="text-sm text-slate-500">Head to checkout, or keep browsing and scan anything else you fancy.</p>
                </>
              ) : (
                <LinkList session={session} onSession={onSession} />
              )}
            </Card>
          )}

          <Card className="p-3">
            <div className="flex items-center justify-between px-1 pb-2">
              <p className="text-sm font-bold text-slate-900">Your route</p>
              {plan && plan.stops.length > 0 && (
                <span className="text-xs text-slate-500">
                  {plan.stops.length} stops · {Math.round(plan.totalDistance)} m · ~{Math.max(1, Math.round(plan.estimatedMinutes))} min
                </span>
              )}
            </div>
            {store ? (
              <StoreMap layout={store.layout} plan={plan} activeStop={0} highlight={found?.location ?? null} />
            ) : (
              <div className="aspect-[4/3] animate-pulse rounded-xl bg-slate-100" />
            )}
          </Card>

          {plan && plan.stops.length > 1 && (
            <Card>
              <p className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-900">Then</p>
              <ol className="divide-y divide-slate-100">
                {plan.stops.slice(1).map((stop) => (
                  <li key={`${stop.location.aisle}-${stop.location.row}`} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-brand-600 text-xs font-extrabold text-brand-700">
                      {stop.index}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-900">{stop.items.map((i) => i.name).join(', ')}</p>
                    </div>
                    <LocationTag location={stop.location} />
                  </li>
                ))}
              </ol>
            </Card>
          )}

          {(plan?.unlocated.length ?? 0) > 0 && (
            <Card className="p-4">
              <p className="text-sm font-bold text-slate-900">Not mapped in this store</p>
              <p className="text-xs text-slate-500">Ask a staff member, or pick a product to replace these notes.</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {plan!.unlocated.map((item: ListItem) => (
                  <li key={item.id}>
                    <Badge tone="gray">📝 {item.name}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {skipped.size > 0 && (
            <Button variant="ghost" size="sm" icon={<Undo2 className="size-4" />} onClick={() => setSkipped(new Set())}>
              Bring back {skipped.size} skipped {skipped.size === 1 ? 'item' : 'items'}
            </Button>
          )}
        </div>

        <aside className={cn('space-y-4', tab !== 'cart' && 'hidden lg:block')}>
          <Card>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="flex items-center gap-2 font-bold text-slate-900">
                <ShoppingCart className="size-4" /> In your cart
              </p>
              <Badge tone="green">{pluralize(totalQty, 'item')}</Badge>
            </div>
            {session.items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">Scan a barcode to add your first item.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {session.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <ProductArt emoji={item.emoji} color={item.color} imageUrl={item.imageUrl} size="xs" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-500">
                        {formatMoney(item.unitPrice)} · {item.addedVia === 'SMART_CART' ? '🛒 smart cart' : '📱 app'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Stepper size="sm" value={item.quantity} onChange={(quantity) => setQuantity.mutate({ itemId: item.id, quantity })} />
                      <span className="tabular text-sm font-semibold">{formatMoney(item.lineTotal)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="hidden p-4 lg:block">
            <TotalsBlock session={session} />
            <Button block size="lg" className="mt-4" disabled={session.items.length === 0} onClick={() => setCheckingOut(true)}>
              Checkout · {formatMoney(session.bill.total)}
            </Button>
            <Button block variant="outline" className="mt-2" icon={<ScanLine className="size-4" />} onClick={() => setScanning(true)}>
              Scan item
            </Button>
          </Card>
        </aside>
      </div>

      {/* Phone: sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <button
            type="button"
            onClick={() => setScanning(true)}
            className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white"
            aria-label="Scan item"
          >
            <ScanLine className="size-6" />
          </button>
          <Button
            size="lg"
            block
            className="h-14 justify-between"
            disabled={session.items.length === 0}
            onClick={() => setCheckingOut(true)}
          >
            <span className="text-left leading-tight">
              <span className="tabular block text-lg">{formatMoney(session.bill.total)}</span>
              <span className="block text-[11px] font-medium opacity-80">{pluralize(totalQty, 'item')}</span>
            </span>
            <span className="flex items-center">
              Checkout <ChevronRight className="size-5" />
            </span>
          </Button>
        </div>
      </div>

      <ScannerModal
        open={scanning}
        onClose={() => setScanning(false)}
        onScan={onScan}
        title="Scan a product"
        hint="Point your camera at the barcode on the pack"
      />
      <CheckoutModal
        open={checkingOut}
        onClose={() => setCheckingOut(false)}
        session={session}
        paying={checkout.isPending}
        onPay={(input) => checkout.mutate(input)}
      />
      {sheet}
      <PairCartModal open={pairing} onClose={() => setPairing(false)} session={session} onSession={onSession} />
      <LeaveModal
        open={leaving}
        onClose={() => setLeaving(false)}
        session={session}
        onLeft={() => {
          void queryClient.invalidateQueries({ queryKey: SESSION_KEY });
          navigate('/instore');
        }}
      />
    </div>
  );
}

function TotalsBlock({ session }: { session: InStoreSession }) {
  const { bill } = session;
  return (
    <dl className="space-y-1.5 text-sm">
      {bill.mrpTotal > bill.itemTotal && (
        <div className="flex justify-between text-slate-500">
          <dt>MRP</dt>
          <dd className="tabular line-through">{formatMoney(bill.mrpTotal)}</dd>
        </div>
      )}
      <div className="flex justify-between text-slate-700">
        <dt>Items ({bill.itemCount})</dt>
        <dd className="tabular">{formatMoney(bill.itemTotal)}</dd>
      </div>
      {bill.itemSavings > 0 && (
        <div className="flex justify-between text-brand-700">
          <dt>You save</dt>
          <dd className="tabular">{formatMoney(bill.itemSavings)}</dd>
        </div>
      )}
      <div className="flex justify-between border-t border-slate-100 pt-2 text-lg font-extrabold text-slate-900">
        <dt>Total</dt>
        <dd className="tabular">{formatMoney(bill.total)}</dd>
      </div>
      <p className="text-xs text-slate-400">No delivery or handling fees in store · GST included</p>
    </dl>
  );
}

function LinkList({ session, onSession }: { session: InStoreSession; onSession: (session: InStoreSession) => void }) {
  const { data: lists = [] } = useQuery({ queryKey: ['lists'], queryFn: () => customerApi.get<ShoppingListSummary[]>('/lists') });
  const [listId, setListId] = useState('');
  const link = useMutation({
    mutationFn: () => customerApi.put<InStoreSession>(`/instore/sessions/${session.id}/list`, { listId }),
    onSuccess: (next) => {
      onSession(next);
      toast.success('List linked', 'We sorted it into the fastest route through the store.');
    },
  });
  return (
    <div className="space-y-3 text-left">
      <p className="flex items-center gap-2 font-bold text-slate-900">
        <ClipboardList className="size-4" /> Shop from a family list
      </p>
      <p className="text-sm text-slate-500">
        Link a list to get a turn-by-turn route through the aisles. Items your family adds appear live.
      </p>
      {lists.length === 0 ? (
        <Link to="/lists" className="text-sm font-semibold text-brand-700">
          Create a list →
        </Link>
      ) : (
        <div className="flex gap-2">
          <Select value={listId} onChange={(e) => setListId(e.target.value)}>
            <option value="">Choose a list</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.emoji} {l.name}
              </option>
            ))}
          </Select>
          <Button disabled={!listId} loading={link.isPending} onClick={() => link.mutate()}>
            Link
          </Button>
        </div>
      )}
    </div>
  );
}

function CheckoutModal({
  open,
  onClose,
  session,
  paying,
  onPay,
}: {
  open: boolean;
  onClose: () => void;
  session: InStoreSession;
  paying: boolean;
  onPay: (input: { method: MethodChoice; coupon: string }) => void;
}) {
  const [method, setMethod] = useState<MethodChoice | null>(null);
  const [coupon, setCoupon] = useState('SCANGO10');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pay and walk out"
      description={`${pluralize(session.bill.itemCount, 'item')} · ${formatMoney(session.bill.total)} before coupon`}
      footer={
        <Button size="lg" disabled={!method} loading={paying} onClick={() => method && onPay({ method, coupon })}>
          Pay {formatMoney(session.bill.total)}
          {coupon ? ' − coupon' : ''}
        </Button>
      }
    >
      <div className="space-y-4">
        <PaymentMethodPicker channel="IN_STORE" value={method} onChange={setMethod} />
        <Field label="Coupon" hint="Scan & Go shoppers get 10% off with SCANGO10 (up to ₹75).">
          <div className="relative">
            <Tag className="pointer-events-none absolute top-2.5 left-3 size-5 text-violet-500" />
            <Input
              className="pl-10 uppercase"
              value={coupon}
              onChange={(e) => setCoupon(e.target.value.toUpperCase())}
              placeholder="Coupon code"
            />
          </div>
        </Field>
      </div>
    </Modal>
  );
}

function PendingCheckout({ session, onSession }: { session: InStoreSession; onSession: (session: InStoreSession) => void }) {
  const resume = useMutation({
    mutationFn: () => customerApi.post<InStoreSession>(`/instore/sessions/${session.id}/resume`),
    onSuccess: onSession,
  });
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-4xl">💳</p>
      <h1 className="mt-2 text-xl font-extrabold text-slate-900">Your payment is not finished</h1>
      <p className="mt-1 text-sm text-slate-500">
        {pluralize(session.bill.itemCount, 'item')} · {formatMoney(session.bill.total)}. Go back to your cart to pay again or change items.
      </p>
      <Button className="mt-6" size="lg" loading={resume.isPending} onClick={() => resume.mutate()}>
        Back to my cart
      </Button>
    </div>
  );
}

function PairCartModal({
  open,
  onClose,
  session,
  onSession,
}: {
  open: boolean;
  onClose: () => void;
  session: InStoreSession;
  onSession: (session: InStoreSession) => void;
}) {
  const unpair = useMutation({
    mutationFn: () => customerApi.post<InStoreSession>(`/instore/sessions/${session.id}/unpair`),
    onSuccess: (next) => {
      onSession(next);
      toast.success('Smart cart unpaired');
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Smart cart"
      description="Items dropped into a SmartCart trolley are added to this cart automatically."
    >
      {session.cartDevice ? (
        <div className="space-y-4 text-center">
          <p className="text-5xl">🛒</p>
          <p className="font-semibold text-slate-900">Paired with {session.cartDevice.name}</p>
          <p className="text-sm text-slate-500">The cart's scanner adds and removes items as you shop. You still pay on your phone.</p>
          <Button variant="outline" loading={unpair.isPending} onClick={() => unpair.mutate()}>
            Unpair cart
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 text-center">
          <QRCode value={buildCartPairUri(session.pairingCode)} size={180} label="Smart cart pairing code" />
          <div>
            <p className="text-sm text-slate-500">Or type this code on the cart's screen</p>
            <p className="font-mono text-4xl font-extrabold tracking-[0.3em] text-slate-900">{session.pairingCode}</p>
          </div>
          <Link
            to={`/devices/cart?code=${session.pairingCode}&store=${session.storeId}`}
            target="_blank"
            className="text-xs font-semibold text-brand-700"
          >
            No trolley handy? Open the smart-cart simulator →
          </Link>
        </div>
      )}
    </Modal>
  );
}

function LeaveModal({
  open,
  onClose,
  session,
  onLeft,
}: {
  open: boolean;
  onClose: () => void;
  session: InStoreSession;
  onLeft: () => void;
}) {
  const cancel = useMutation({
    mutationFn: () => customerApi.post<InStoreSession>(`/instore/sessions/${session.id}/cancel`),
    onSuccess: () => {
      toast.success('Session ended', session.items.length > 0 ? 'Please leave the scanned items in the basket by the exit.' : undefined);
      onLeft();
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Leave without buying?"
      description="Your scanned items are released back to the store's stock."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep shopping
          </Button>
          <Button variant="danger" loading={cancel.isPending} icon={<Trash2 className="size-4" />} onClick={() => cancel.mutate()}>
            End session
          </Button>
        </>
      }
    >
      <p className="flex items-center gap-2 text-sm text-slate-600">
        <Check className="size-4 text-brand-600" /> {session.items.length} products in your cart · {formatMoney(session.bill.total)}
      </p>
    </Modal>
  );
}
