import {
  DIETARY_TAG_META,
  SocketEvents,
  describeLocation,
  formatMoney,
  type AppNotification,
  type CatalogProduct,
  type ListUpdateEvent,
  type QuoteResult,
} from '@smartcart/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ClipboardList, LogIn, MapPin, Package, Search, ShoppingBag, ShoppingCart, Store, Tag, User, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Logo } from '@/components/brand';
import { AddToCart, DietaryIcons, LocationTag, ProductArt, VegMark } from '@/components/product';
import { Badge, Button, Drawer, EmptyState, Input, Modal, Stepper } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { useBootstrap } from '@/lib/session';
import { useSocketEvent } from '@/lib/socket';
import { cartTotals, useCart, useShop, useCartLines } from '@/lib/stores';
import { toast } from '@/lib/toast';
import { cn, useDebounced } from '@/lib/utils';
import { useCurrentStore, useHomeFeed } from './hooks';
import { useCustomerUi } from './ui-state';

export function CustomerLayout() {
  useBootstrap('CUSTOMER');
  const session = useSession('CUSTOMER');
  const location = useLocation();

  useSocketEvent<AppNotification>('CUSTOMER', SocketEvents.NOTIFICATION, (n) => {
    if (n.type !== 'LIST_ITEM_ADDED') toast.info(n.title, n.body);
  });
  useSocketEvent<ListUpdateEvent>('CUSTOMER', SocketEvents.LIST_UPDATED, (event) => {
    if (event.action === 'ITEM_ADDED' && event.actor.id !== session?.user.id && event.item) {
      toast.info(`${event.actor.name.split(' ')[0]} added ${event.item.name}`, `to ${event.list?.name ?? 'your list'}`);
    }
  });

  const immersive = location.pathname.startsWith('/instore/session') || location.pathname.startsWith('/exit/');
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      {!immersive && <ModeBar />}
      <main className="flex-1">
        <Outlet />
      </main>
      {!immersive && <Footer />}
      <CartDrawer />
      <StorePicker />
      <ProductSheet />
    </div>
  );
}

function Header() {
  const session = useSession('CUSTOMER');
  const { store } = useCurrentStore();
  const mode = useShop((s) => s.mode);
  const openStorePicker = useCustomerUi((s) => s.openStorePicker);
  const openCart = useCustomerUi((s) => s.openCart);
  const storeId = useShop((s) => s.storeId);
  const lines = useCartLines(storeId);
  const totals = cartTotals(lines);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:gap-6">
        <Link to="/" className="shrink-0">
          <Logo />
        </Link>
        <button type="button" onClick={openStorePicker} className="hidden min-w-0 text-left md:block">
          <p className="text-sm font-extrabold text-slate-900">
            {mode === 'DELIVERY'
              ? `Delivery in ${store?.deliveryEtaMinutes ?? 10} minutes`
              : mode === 'PICKUP'
                ? 'Scheduled pickup'
                : 'Scan & Go in store'}
          </p>
          <p className="flex max-w-56 items-center gap-1 truncate text-xs text-slate-500">
            {store ? `${store.name}, ${store.city}` : 'Choose a store'} <ChevronDown className="size-3.5 shrink-0" />
          </p>
        </button>
        <form
          className="relative min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
          }}
        >
          <Search className="pointer-events-none absolute top-2.5 left-3 size-5 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search "milk", "atta", "chips"…'
            className="h-10 rounded-xl border-slate-200 bg-slate-100 pl-10"
            aria-label="Search products"
          />
        </form>
        <nav className="hidden items-center gap-1 lg:flex">
          <NavLink
            to="/lists"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold',
                isActive ? 'text-brand-700' : 'text-slate-700 hover:bg-slate-100',
              )
            }
          >
            <ClipboardList className="size-4" /> Lists
          </NavLink>
          <NavLink
            to="/orders"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold',
                isActive ? 'text-brand-700' : 'text-slate-700 hover:bg-slate-100',
              )
            }
          >
            <Package className="size-4" /> Orders
          </NavLink>
        </nav>
        {session ? (
          <Link
            to="/account"
            className="hidden items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 sm:flex"
          >
            <User className="size-5" /> {session.user.name.split(' ')[0]}
          </Link>
        ) : (
          <Link to="/login" className="hidden sm:block">
            <Button variant="ghost" icon={<LogIn className="size-4" />}>
              Login
            </Button>
          </Link>
        )}
        <button
          type="button"
          onClick={openCart}
          className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-brand-600 px-3 text-sm font-bold text-white shadow-sm hover:bg-brand-700"
        >
          <ShoppingCart className="size-5" />
          {totals.count > 0 ? (
            <span className="text-left leading-tight">
              <span className="block text-[11px] font-semibold opacity-90">{totals.count} items</span>
              <span className="tabular block">{formatMoney(totals.total)}</span>
            </span>
          ) : (
            <span className="hidden sm:inline">My cart</span>
          )}
        </button>
      </div>
    </header>
  );
}

function ModeBar() {
  const mode = useShop((s) => s.mode);
  const setMode = useShop((s) => s.setMode);
  const navigate = useNavigate();
  const location = useLocation();
  const { store } = useCurrentStore();
  const openStorePicker = useCustomerUi((s) => s.openStorePicker);
  const modes = [
    { value: 'DELIVERY' as const, icon: <Zap className="size-4" />, label: `Delivery · ${store?.deliveryEtaMinutes ?? 10} min` },
    { value: 'PICKUP' as const, icon: <ShoppingBag className="size-4" />, label: 'Schedule pickup' },
    { value: 'IN_STORE' as const, icon: <Store className="size-4" />, label: 'Scan & Go in store' },
  ];
  const activeMode = location.pathname.startsWith('/instore') ? 'IN_STORE' : mode;
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-4 py-2 scrollbar-none">
        {modes.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => {
              setMode(m.value);
              if (m.value === 'IN_STORE') navigate('/instore');
              else if (location.pathname.startsWith('/instore')) navigate('/');
            }}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors',
              activeMode === m.value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
            )}
          >
            {m.icon}
            {m.label}
          </button>
        ))}
        <button
          type="button"
          onClick={openStorePicker}
          className="ml-auto flex shrink-0 items-center gap-1 text-xs font-semibold text-slate-500 md:hidden"
        >
          <MapPin className="size-3.5" /> {store?.name.replace('SmartCart ', '') ?? 'Store'}
        </button>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <Logo />
          <p className="text-sm text-slate-500">
            Groceries in 10 minutes, pickup on your schedule, and Scan &amp; Go shopping with no checkout lines.
          </p>
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">Shop</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>
              <Link to="/" className="hover:text-brand-700">
                Home
              </Link>
            </li>
            <li>
              <Link to="/instore" className="hover:text-brand-700">
                Scan &amp; Go
              </Link>
            </li>
            <li>
              <Link to="/stores" className="hover:text-brand-700">
                Store locator &amp; stock check
              </Link>
            </li>
            <li>
              <Link to="/lists" className="hover:text-brand-700">
                Family lists
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">For partners</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>
              <Link to="/ops" className="hover:text-brand-700">
                Store Operations dashboard
              </Link>
            </li>
            <li>
              <Link to="/admin" className="hover:text-brand-700">
                SmartCart admin console
              </Link>
            </li>
            <li>
              <Link to="/devices" className="hover:text-brand-700">
                Gate &amp; smart-cart simulators
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">Get the app</p>
          <p className="mt-3 text-sm text-slate-600">
            Scan items with your phone, pay with Apple Pay, Google Pay or UPI, and walk out through the gate.
          </p>
        </div>
      </div>
      <p className="border-t border-slate-100 py-4 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} SmartCart. Prices include GST.
      </p>
    </footer>
  );
}

function StorePicker() {
  const open = useCustomerUi((s) => s.storePickerOpen);
  const close = useCustomerUi((s) => s.closeStorePicker);
  const { stores } = useCurrentStore();
  const storeId = useShop((s) => s.storeId);
  const setStore = useShop((s) => s.setStore);
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const { data: nearby } = useQuery({
    queryKey: ['stores', origin],
    queryFn: () => publicApi.get<typeof stores>('/stores', { query: origin ?? {} }),
    enabled: Boolean(origin),
  });
  const list = nearby ?? stores;
  return (
    <Modal
      open={open}
      onClose={close}
      title="Choose your store"
      description="Prices, stock and aisle locations are specific to each store."
    >
      <Button
        variant="outline"
        block
        icon={<MapPin className="size-4" />}
        onClick={() =>
          navigator.geolocation?.getCurrentPosition(
            (pos) => setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => toast.error('Location unavailable', 'Pick a store from the list instead.'),
          )
        }
      >
        Use my current location
      </Button>
      <ul className="mt-4 space-y-2">
        {list.map((store) => (
          <li key={store.id}>
            <button
              type="button"
              onClick={() => {
                setStore(store.id);
                close();
              }}
              className={cn(
                'flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors',
                store.id === storeId ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:border-slate-300',
              )}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-xl shadow-card">🏪</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-semibold text-slate-900">
                  {store.name}
                  <Badge tone={store.isOpenNow ? 'green' : 'gray'}>{store.isOpenNow ? 'Open' : 'Closed'}</Badge>
                </span>
                <span className="block truncate text-sm text-slate-500">
                  {store.addressLine}, {store.city}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {store.openingTime === store.closingTime ? 'Open 24 hours' : `${store.openingTime}–${store.closingTime}`}
                  {store.distanceKm !== null && ` · ${store.distanceKm} km away`}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function CartDrawer() {
  const open = useCustomerUi((s) => s.cartOpen);
  const close = useCustomerUi((s) => s.closeCart);
  const storeId = useShop((s) => s.storeId);
  const mode = useShop((s) => s.mode);
  const lines = useCartLines(storeId);
  const setQuantity = useCart((s) => s.setQuantity);
  const [coupon, setCoupon] = useState('');
  const debouncedLines = useDebounced(lines, 300);
  const channel = mode === 'PICKUP' ? 'PICKUP' : 'DELIVERY';
  const { data: home } = useHomeFeed(storeId ?? undefined);
  const navigate = useNavigate();

  const { data: quote, isFetching } = useQuery({
    queryKey: ['quote', storeId, channel, debouncedLines.map((l) => `${l.productId}:${l.quantity}`).join(','), coupon],
    queryFn: () =>
      publicApi.post<QuoteResult>('/orders/quote', {
        storeId,
        channel,
        items: debouncedLines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        couponCode: coupon || undefined,
      }),
    enabled: open && Boolean(storeId) && debouncedLines.length > 0,
  });

  useEffect(() => {
    if (open) setCoupon(sessionStorage.getItem('smartcart-coupon') ?? '');
  }, [open]);
  const applyCoupon = (code: string) => {
    setCoupon(code);
    sessionStorage.setItem('smartcart-coupon', code);
  };

  const bill = quote?.bill;
  return (
    <Drawer
      open={open}
      onClose={close}
      title={
        <span className="flex items-center gap-2">
          My cart {lines.length > 0 && <Badge tone="green">{cartTotals(lines).count} items</Badge>}
        </span>
      }
      footer={
        lines.length > 0 && (
          <Button
            block
            size="lg"
            className="justify-between"
            onClick={() => {
              close();
              navigate('/checkout');
            }}
          >
            <span className="tabular text-left leading-tight">
              <span className="block text-base">{formatMoney(bill?.total ?? cartTotals(lines).total)}</span>
              <span className="block text-[11px] font-medium opacity-80">TOTAL</span>
            </span>
            <span>{channel === 'PICKUP' ? 'Choose pickup slot' : 'Proceed to checkout'} →</span>
          </Button>
        )
      }
    >
      {lines.length === 0 ? (
        <EmptyState
          icon="🛒"
          title="Your cart is empty"
          body="Add something delicious and get it in minutes."
          action={<Button onClick={close}>Start shopping</Button>}
        />
      ) : (
        <div className="space-y-4 bg-slate-50 p-4">
          <div className="rounded-2xl bg-white p-4 shadow-card">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
              {channel === 'PICKUP' ? <ShoppingBag className="size-4 text-brand-600" /> : <Zap className="size-4 text-brand-600" />}
              {channel === 'PICKUP' ? 'Pick up at your chosen slot' : `Delivery in ${quote?.deliveryEtaMinutes ?? 10} minutes`}
            </p>
            <ul className="mt-3 divide-y divide-slate-100">
              {lines.map((line) => {
                const quoted = quote?.lines.find((l) => l.productId === line.productId);
                return (
                  <li key={line.productId} className="flex items-center gap-3 py-3">
                    <ProductArt emoji={line.emoji} color={line.color} imageUrl={line.imageUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium text-slate-900">{line.name}</p>
                      <p className="text-xs text-slate-500">{line.unit}</p>
                      {quoted && !quoted.available && (
                        <p className="text-xs font-semibold text-rose-600">Only {quoted.availableQty} available</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Stepper size="sm" value={line.quantity} max={line.maxOrderQty} onChange={(q) => setQuantity(line.productId, q)} />
                      <span className="tabular text-sm font-semibold">{formatMoney(line.price * line.quantity)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-card">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Tag className="size-4 text-violet-600" /> Coupons &amp; offers
            </p>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                applyCoupon(coupon.trim().toUpperCase());
              }}
            >
              <Input value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Enter coupon code" />
              <Button type="submit" variant="dark">
                Apply
              </Button>
            </form>
            {quote?.offer && (
              <p className={cn('mt-2 text-sm font-semibold', quote.offer.applicable ? 'text-brand-700' : 'text-rose-600')}>
                {quote.offer.code}: {quote.offer.message}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {home?.banners
                .filter((b) => b.code && b.type !== 'BOGO')
                .slice(0, 4)
                .map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => applyCoupon(b.code!)}
                    className="rounded-lg border border-dashed border-violet-300 bg-violet-50 px-2 py-1 text-xs font-bold text-violet-800"
                  >
                    {b.code}
                  </button>
                ))}
            </div>
          </div>

          {bill && (
            <div className={cn('rounded-2xl bg-white p-4 shadow-card', isFetching && 'opacity-70')}>
              <p className="text-sm font-bold text-slate-900">Bill details</p>
              <BillRows bill={bill} />
              {bill.totalSavings > 0 && (
                <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800">
                  You save {formatMoney(bill.totalSavings)} on this order 🎉
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

export function BillRows({ bill }: { bill: QuoteResult['bill'] }) {
  const rows: [string, number, string?][] = [
    ['Items total', bill.itemTotal],
    ...(bill.couponDiscount > 0 ? ([['Coupon discount', -bill.couponDiscount, 'text-brand-700']] as [string, number, string][]) : []),
    ...(bill.deliveryFee > 0 ? ([['Delivery fee', bill.deliveryFee]] as [string, number][]) : []),
    ...(bill.handlingFee > 0 ? ([['Handling charge', bill.handlingFee]] as [string, number][]) : []),
    ...(bill.smallCartFee > 0 ? ([['Small cart fee', bill.smallCartFee]] as [string, number][]) : []),
    ...(bill.tip > 0 ? ([['Rider tip', bill.tip]] as [string, number][]) : []),
  ];
  return (
    <dl className="mt-3 space-y-2 text-sm">
      {bill.mrpTotal > bill.itemTotal && (
        <div className="flex justify-between text-slate-500">
          <dt>MRP total</dt>
          <dd className="tabular line-through">{formatMoney(bill.mrpTotal)}</dd>
        </div>
      )}
      {rows.map(([label, value, className]) => (
        <div key={label} className={cn('flex justify-between text-slate-700', className)}>
          <dt>{label}</dt>
          <dd className="tabular">{value < 0 ? `−${formatMoney(-value)}` : formatMoney(value)}</dd>
        </div>
      ))}
      {bill.deliveryFee === 0 && bill.itemCount > 0 && bill.handlingFee > 0 && (
        <div className="flex justify-between text-brand-700">
          <dt>Delivery fee</dt>
          <dd>FREE</dd>
        </div>
      )}
      <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-bold text-slate-900">
        <dt>Grand total</dt>
        <dd className="tabular">{formatMoney(bill.total)}</dd>
      </div>
      <p className="text-xs text-slate-400">Includes {formatMoney(bill.taxIncluded)} GST</p>
    </dl>
  );
}

function ProductSheet() {
  const product = useCustomerUi((s) => s.product);
  const close = useCustomerUi((s) => s.closeProduct);
  return (
    <Modal open={Boolean(product)} onClose={close} size="lg">
      {product && <ProductDetail product={product} />}
    </Modal>
  );
}

function ProductDetail({ product }: { product: CatalogProduct }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <ProductArt emoji={product.emoji} color={product.color} imageUrl={product.imageUrl} size="lg" />
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{product.brand}</p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">{product.name}</h2>
          <p className="text-sm text-slate-500">{product.unit}</p>
        </div>
        <div className="flex items-end gap-3">
          <span className="tabular text-2xl font-extrabold">{formatMoney(product.price)}</span>
          {product.mrp > product.price && (
            <>
              <span className="tabular text-sm text-slate-400 line-through">MRP {formatMoney(product.mrp)}</span>
              <Badge tone="blue">{product.discountPercent}% OFF</Badge>
            </>
          )}
        </div>
        <AddToCart product={product} />
        <div className="rounded-2xl bg-slate-50 p-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-slate-800">
            <MapPin className="size-4 text-sky-600" /> In store: {describeLocation(product.location, { withLabel: true })}
          </p>
          <p className="mt-1 text-slate-500">
            {product.stockStatus === 'OUT_OF_STOCK'
              ? 'Out of stock at this store'
              : product.onShelf
                ? `${product.availableQty} available`
                : 'Ask a staff member, it is in the storeroom'}
          </p>
        </div>
        {product.dietaryTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <VegMark tags={product.dietaryTags} />
            {product.dietaryTags.map((tag) => (
              <Badge key={tag} tone="green">
                {DIETARY_TAG_META[tag].emoji} {DIETARY_TAG_META[tag].label}
              </Badge>
            ))}
          </div>
        )}
        {product.allergens.length > 0 && (
          <p className="text-xs text-amber-700">Contains: {product.allergens.map((a) => a.toLowerCase().replace('_', ' ')).join(', ')}</p>
        )}
        {product.description && <p className="text-sm text-slate-600">{product.description}</p>}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <DietaryIcons tags={product.dietaryTags} />
          <LocationTag location={product.location} />
          GST {product.taxRate}% included · SKU {product.sku}
        </div>
      </div>
    </div>
  );
}
