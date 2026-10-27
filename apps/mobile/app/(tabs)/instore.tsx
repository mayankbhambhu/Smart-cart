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
  type ListUpdateEvent,
  type RoutablePoint,
  type SessionUpdateEvent,
  type ShoppingList,
  type ShoppingListSummary,
} from '@smartcart/shared';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { PaymentMethodPicker, type MethodChoice } from '@/components/checkout';
import { QRCode } from '@/components/codes';
import { LocationTag } from '@/components/product';
import { FoundCard, ProductFinder } from '@/components/ProductFinder';
import { ScannerModal } from '@/components/Scanner';
import { StoreMap } from '@/components/StoreMap';
import { colors, radius, space } from '@/components/theme';
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  H1,
  H2,
  IconButton,
  Loader,
  Muted,
  ProductArt,
  Row,
  Screen,
  SectionTitle,
  Segmented,
  Stepper,
} from '@/components/ui';
import { ApiError, customerApi, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { useCurrentStore, useStoreDetail } from '@/lib/hooks';
import { afterModalClose, usePayment } from '@/lib/payments';
import { useRoom, useSocketEvent } from '@/lib/socket';
import { useShop } from '@/lib/stores';
import { toast } from '@/lib/toast';

const SESSION_KEY = ['instore-session'];
type SetSession = (session: InStoreSession | null) => void;

/**
 * Scan & Go. Before shopping: pick the store and a family list, and find where
 * things are. In the store: the list sorted into the shortest walk through the
 * aisles, a running total, barcode scanning, a paired smart cart and checkout.
 */
export default function InStoreScreen() {
  const signedIn = Boolean(useSession('CUSTOMER'));
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: SESSION_KEY,
    queryFn: () => customerApi.get<{ session: InStoreSession | null }>('/instore/session'),
    enabled: signedIn,
  });
  const active = data?.session && data.session.status !== 'PAID' ? data.session : null;
  const setSession = useCallback<SetSession>((next) => queryClient.setQueryData(SESSION_KEY, { session: next }), [queryClient]);

  // Paying here and the PAID broadcast can both report the same order: open its exit pass once.
  const opened = useRef<string | null>(null);
  const openExitPass = useCallback(
    (orderId: string) => {
      if (opened.current === orderId) return;
      opened.current = orderId;
      setSession(null);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      router.push(`/exit/${orderId}`);
    },
    [queryClient, router, setSession],
  );

  useRoom('CUSTOMER', SocketEvents.JOIN_SESSION, SocketEvents.LEAVE_SESSION, active?.id);
  useSocketEvent<SessionUpdateEvent | { sessionId: string; status: 'PAID' }>('CUSTOMER', SocketEvents.SESSION_UPDATED, (payload) => {
    if ('session' in payload) {
      if (payload.session.id !== active?.id) return;
      setSession(payload.session);
      if (payload.change?.source === 'SMART_CART') {
        void Haptics.selectionAsync();
        toast.info(
          `Smart cart ${payload.change.type === 'REMOVED' ? 'removed' : 'added'} ${payload.change.productName}`,
          `Total now ${formatMoney(payload.session.bill.total)}`,
        );
      }
    } else if (payload.status === 'PAID' && payload.sessionId === active?.id && active.orderId) {
      openExitPass(active.orderId);
    }
  });

  if (signedIn && isLoading) return <Loader label="Opening your cart…" />;
  if (!active) return <Landing onStarted={setSession} />;
  return <SessionView session={active} onSession={setSession} onPaid={openExitPass} />;
}

// ---------------------------------------------------------------------------
// Before shopping
// ---------------------------------------------------------------------------

const STEPS = [
  { icon: 'scan' as const, title: 'Scan as you shop', body: 'Scan each barcode with your phone, or pair a smart cart that scans for you.' },
  {
    icon: 'navigate' as const,
    title: 'Follow the fastest route',
    body: 'Your family list is sorted into the shortest walk through the aisles.',
  },
  { icon: 'phone-portrait' as const, title: 'Tap to pay', body: 'Apple Pay, Google Pay, UPI or card, right on your phone. No queues.' },
  { icon: 'exit' as const, title: 'Walk out', body: 'Show your digital receipt at the exit gate and it opens.' },
];

function Landing({ onStarted }: { onStarted: SetSession }) {
  const router = useRouter();
  const signedIn = Boolean(useSession('CUSTOMER'));
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ list?: string }>();
  const { store, stores } = useCurrentStore();
  const setStore = useShop((s) => s.setStore);
  const [listId, setListId] = useState(params.list ?? '');
  const [found, setFound] = useState<CatalogProduct | null>(null);
  const { data: detail } = useStoreDetail(store?.id);
  const { data: lists = [] } = useQuery({
    queryKey: ['lists'],
    queryFn: () => customerApi.get<ShoppingListSummary[]>('/lists'),
    enabled: signedIn,
  });
  useEffect(() => {
    if (params.list) setListId(params.list);
  }, [params.list]);

  const start = useMutation({
    mutationFn: () => customerApi.post<InStoreSession>('/instore/sessions', { storeId: store!.id, listId: listId || undefined }),
    onSuccess: (started) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onStarted(started);
    },
    onError: (error) => toast.error('Could not start shopping', errorMessage(error)),
  });
  const inStoreStores = stores.filter((s) => s.supportsInStore);

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.heroBadge}>NO LINES · NO CASHIERS</Text>
        <Text style={styles.heroTitle}>Shop the store with your phone</Text>
        <Text style={styles.heroBody}>
          Tell us what you need and we show exactly where it is, like{' '}
          <Text style={{ color: '#fff', fontWeight: '800' }}>Aisle 4 · Row 2</Text>, with a running total as you shop.
        </Text>
        <Text style={styles.heroLabel}>Store</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {inStoreStores.map((s) => (
            <HeroChip key={s.id} label={s.name} active={store?.id === s.id} onPress={() => setStore(s.id)} />
          ))}
        </ScrollView>
        {signedIn && (
          <>
            <Text style={styles.heroLabel}>Shopping list</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              <HeroChip label="No list" active={!listId} onPress={() => setListId('')} />
              {lists.map((l) => (
                <HeroChip
                  key={l.id}
                  label={`${l.emoji} ${l.name} · ${l.itemCount - l.checkedCount}`}
                  active={listId === l.id}
                  onPress={() => setListId(l.id)}
                />
              ))}
            </ScrollView>
          </>
        )}
        <View style={{ marginTop: space.lg }}>
          {signedIn ? (
            <Button
              title="I'm in the store"
              variant="accent"
              size="lg"
              icon="walk"
              loading={start.isPending}
              disabled={!store?.supportsInStore}
              onPress={() => start.mutate()}
            />
          ) : (
            <Button title="Log in to start" variant="accent" size="lg" onPress={() => router.push('/login')} />
          )}
        </View>
        {store && !store.isOpenNow && (
          <Text style={{ color: '#fcd34d', marginTop: space.sm, fontSize: 13 }}>
            {store.name} is closed right now (opens {store.openingTime}).
          </Text>
        )}
      </View>

      <SectionTitle title="Where is it?" />
      <Muted style={{ marginBottom: space.sm }}>Search, or dictate with the keyboard mic: “where is the peanut butter?”</Muted>
      <ProductFinder storeId={store?.id} onPick={setFound} placeholder="Find an item in this store" />
      {found && (
        <View style={{ marginTop: space.sm }}>
          <FoundCard product={found} onClose={() => setFound(null)} />
        </View>
      )}
      <Card style={{ marginTop: space.md, padding: space.sm }}>
        <Row style={{ justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 6 }}>
          <Text style={{ fontWeight: '700', color: colors.ink }}>{store?.name ?? 'Store'} floor plan</Text>
          <LocationTag location={found?.location} />
        </Row>
        {detail ? (
          <StoreMap layout={detail.layout} highlight={found?.location ?? null} width={width - space.lg * 2 - space.sm * 2 - 2} />
        ) : (
          <Loader />
        )}
      </Card>

      <SectionTitle title="How Scan & Go works" />
      <View style={{ gap: space.md }}>
        {STEPS.map((step, i) => (
          <Row key={step.title} gap={space.md} style={{ alignItems: 'flex-start' }}>
            <View style={styles.stepIcon}>
              <Ionicons name={step.icon} size={20} color={colors.brandDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>
                {i + 1}. {step.title}
              </Text>
              <Muted>{step.body}</Muted>
            </View>
          </Row>
        ))}
      </View>
    </Screen>
  );
}

function HeroChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.heroChip, active && styles.heroChipActive]}>
      <Text style={[styles.heroChipText, active && { color: colors.ink }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// In the store
// ---------------------------------------------------------------------------

function SessionView({
  session,
  onSession,
  onPaid,
}: {
  session: InStoreSession;
  onSession: SetSession;
  onPaid: (orderId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const { data: store } = useStoreDetail(session.storeId);
  const [tab, setTab] = useState<'route' | 'cart'>('route');
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [found, setFound] = useState<CatalogProduct | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [lastLocation, setLastLocation] = useState<ItemLocation | null>(null);

  // The family list, live: items added at home appear on the route instantly.
  const { data: list } = useQuery({
    queryKey: ['list', session.listId, session.storeId],
    queryFn: () => customerApi.get<ShoppingList>(`/lists/${session.listId}`, { storeId: session.storeId }),
    enabled: Boolean(session.listId),
  });
  useRoom('CUSTOMER', SocketEvents.JOIN_LIST, SocketEvents.LEAVE_LIST, session.listId);
  useSocketEvent<ListUpdateEvent>('CUSTOMER', SocketEvents.LIST_UPDATED, (event) => {
    if (event.listId !== session.listId) return;
    void queryClient.invalidateQueries({ queryKey: ['list', session.listId] });
    if (event.action === 'ITEM_ADDED' && event.item)
      toast.info(`${event.actor.name.split(' ')[0]} added ${event.item.name}`, 'It is on your route now.');
  });

  const inCart = useMemo(() => new Set(session.items.map((i) => i.productId)), [session.items]);
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
  const totalQty = session.items.reduce((sum, i) => sum + i.quantity, 0);
  const mapWidth = width - space.lg * 2 - space.sm * 2 - 2;

  const afterChange = (event: SessionUpdateEvent) => {
    onSession(event.session);
    const item = event.session.items.find((i) => i.productId === event.change?.productId);
    if (item?.location) setLastLocation(item.location);
    if (session.listId) void queryClient.invalidateQueries({ queryKey: ['list', session.listId] });
  };

  const add = useMutation({
    mutationFn: (input: { barcode?: string; productId?: string }) =>
      customerApi.post<SessionUpdateEvent>(`/instore/sessions/${session.id}/items`, { ...input, quantity: 1 }),
    onSuccess: (event) => {
      afterChange(event);
      const item = event.session.items.find((i) => i.productId === event.change?.productId);
      const text = `${item ? `${item.name} · ${formatMoney(item.unitPrice)}` : 'Added to cart'}`;
      setScanStatus({ ok: true, text: `${text}  ·  Total ${formatMoney(event.session.bill.total)}` });
      if (!scanning) toast.success(text, `Cart total ${formatMoney(event.session.bill.total)}`);
    },
    onError: (error) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const title = error instanceof ApiError && error.status === 404 ? 'Product not found' : 'Could not add the item';
      setScanStatus({ ok: false, text: `${title}: ${errorMessage(error)}` });
      if (!scanning) toast.error(title, errorMessage(error));
    },
  });
  const setQuantity = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      customerApi.patch<SessionUpdateEvent>(`/instore/sessions/${session.id}/items/${itemId}`, { quantity }),
    onSuccess: afterChange,
    onError: (error) => toast.error('Could not update the cart', errorMessage(error)),
  });

  const { pay, sheet } = usePayment();
  const checkout = useMutation({
    mutationFn: async ({ method, coupon }: { method: MethodChoice; coupon: string }) => {
      const result = await customerApi.post<CheckoutResult>(`/instore/sessions/${session.id}/checkout`, {
        paymentMethod: method.method,
        savedPaymentMethodId: method.savedPaymentMethodId,
        couponCode: coupon.trim() || undefined,
      });
      setCheckingOut(false);
      await afterModalClose();
      return { result, paid: await pay(result) };
    },
    onSuccess: async ({ result, paid }) => {
      if (paid?.paymentStatus === 'PAID') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onPaid(result.order.id);
        return;
      }
      // Sheet closed without paying: cancel the pending order and keep shopping.
      const resumed = await customerApi.post<InStoreSession>(`/instore/sessions/${session.id}/resume`).catch(() => null);
      if (resumed) onSession(resumed);
      toast.info('Payment cancelled', 'Your cart is still here.');
    },
    onError: (error) => toast.error('Checkout failed', errorMessage(error)),
  });

  const cancel = useMutation({
    mutationFn: () => customerApi.post<InStoreSession>(`/instore/sessions/${session.id}/cancel`),
    onSuccess: () => {
      toast.success('Session ended', session.items.length > 0 ? 'Please leave the scanned items in the basket by the exit.' : undefined);
      onSession(null);
    },
    onError: (error) => toast.error('Could not end the session', errorMessage(error)),
  });
  const leave = () =>
    Alert.alert('Leave without buying?', `Your ${pluralize(totalQty, 'scanned item')} go back to the store's stock.`, [
      { text: 'Keep shopping', style: 'cancel' },
      { text: 'End session', style: 'destructive', onPress: () => cancel.mutate() },
    ]);

  // The live update says "checkout" as soon as payment starts; keep this screen (and its payment sheet) while paying here.
  if (session.status === 'CHECKOUT' && !checkout.isPending) return <PendingCheckout session={session} onSession={onSession} />;

  return (
    <Screen
      footer={
        <Row gap={space.md}>
          <Pressable accessibilityRole="button" accessibilityLabel="Scan item" onPress={() => setScanning(true)} style={styles.scanButton}>
            <Ionicons name="scan" size={26} color="#fff" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Checkout, ${formatMoney(session.bill.total)}`}
            disabled={session.items.length === 0}
            onPress={() => setCheckingOut(true)}
            style={({ pressed }) => [styles.checkoutButton, session.items.length === 0 && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
          >
            <View>
              <Text style={styles.checkoutTotal}>{formatMoney(session.bill.total)}</Text>
              <Text style={styles.checkoutCount}>{pluralize(totalQty, 'item')}</Text>
            </View>
            <Row gap={2}>
              <Text style={styles.checkoutLabel}>Checkout</Text>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </Row>
          </Pressable>
        </Row>
      }
    >
      <Row>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>SCAN & GO · IN STORE</Text>
          <H1 numberOfLines={1}>{session.storeName}</H1>
        </View>
        <Button
          title={session.cartDevice ? session.cartDevice.name : 'Pair cart'}
          icon="cart-outline"
          variant="outline"
          size="sm"
          onPress={() => setPairing(true)}
        />
        <IconButton name="exit-outline" label="Leave without buying" color={colors.muted} onPress={leave} />
      </Row>

      <View style={{ marginTop: space.md }}>
        <ProductFinder
          storeId={session.storeId}
          placeholder="Tell us what you need: “eggs”, “rice”…"
          onPick={(product) => {
            setFound(product);
            setTab('route');
          }}
        />
      </View>
      {found && (
        <View style={{ marginTop: space.sm }}>
          <FoundCard
            product={found}
            onClose={() => setFound(null)}
            action={<Button title="Scan it" icon="scan" size="sm" onPress={() => setScanning(true)} />}
          />
        </View>
      )}

      <View style={{ marginTop: space.md }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'route', label: `Route & list (${pendingItems.length})` },
            { value: 'cart', label: `My cart (${totalQty})` },
          ]}
        />
      </View>

      {tab === 'route' ? (
        <View style={{ gap: space.md, marginTop: space.md }}>
          {nextStop ? (
            <Card style={{ padding: 0, overflow: 'hidden', borderColor: colors.brandBorder }}>
              <Row gap={space.md} style={styles.nextStop}>
                <Ionicons name="navigate" size={22} color="#fff" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', opacity: 0.85, fontSize: 12, fontWeight: '600' }}>
                    Next stop · {plan!.stops.length} to go
                  </Text>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>{describeLocation(nextStop.location)}</Text>
                </View>
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  <Ionicons name="footsteps" size={14} color="#fff" /> {Math.round(nextStop.distanceFromPrevious)} m
                </Text>
              </Row>
              {nextStop.items.map((item) => (
                <Row key={item.id} gap={space.md} style={styles.stopItem}>
                  {item.product && <ProductArt emoji={item.product.emoji} color={item.product.color} size={36} />}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '600', color: colors.ink }} numberOfLines={1}>
                      {item.name} <Text style={{ fontWeight: '400', color: colors.muted }}>× {item.quantity}</Text>
                    </Text>
                    <Muted style={{ fontSize: 12 }}>
                      Shelf {item.product?.location?.shelf} · {item.product ? formatMoney(item.product.price) : ''} · added by{' '}
                      {item.addedByName.split(' ')[0]}
                    </Muted>
                  </View>
                  <IconButton
                    name="play-skip-forward-outline"
                    label="Skip for now"
                    color={colors.muted}
                    onPress={() => setSkipped((s) => new Set(s).add(item.id))}
                  />
                </Row>
              ))}
              <View style={{ padding: space.md }}>
                <Button title="Scan item" icon="scan" block onPress={() => setScanning(true)} />
              </View>
            </Card>
          ) : (
            <Card>
              {session.listId ? (
                <EmptyState
                  emoji="🎉"
                  title="Everything on your list is in the cart"
                  body="Head to checkout, or keep browsing and scan anything else you fancy."
                />
              ) : (
                <LinkList session={session} onSession={onSession} />
              )}
            </Card>
          )}

          <Card style={{ padding: space.sm }}>
            <Row style={{ justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 6 }}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>Your route</Text>
              {plan && plan.stops.length > 0 && (
                <Muted style={{ fontSize: 12 }}>
                  {plan.stops.length} stops · {Math.round(plan.totalDistance)} m · ~{Math.max(1, Math.round(plan.estimatedMinutes))} min
                </Muted>
              )}
            </Row>
            {store ? <StoreMap layout={store.layout} plan={plan} highlight={found?.location ?? null} width={mapWidth} /> : <Loader />}
          </Card>

          {plan && plan.stops.length > 1 && (
            <Card style={{ gap: space.md }}>
              <H2>Then</H2>
              {plan.stops.slice(1).map((stop) => (
                <Row key={`${stop.location.aisle}-${stop.location.row}`} gap={space.md}>
                  <View style={styles.stopIndex}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: colors.brandDark }}>{stop.index}</Text>
                  </View>
                  <Text style={{ flex: 1, color: colors.ink }} numberOfLines={1}>
                    {stop.items.map((i) => i.name).join(', ')}
                  </Text>
                  <LocationTag location={stop.location} />
                </Row>
              ))}
            </Card>
          )}

          {(plan?.unlocated.length ?? 0) > 0 && (
            <Card style={{ gap: space.sm }}>
              <H2>Not mapped in this store</H2>
              <Muted>Ask a staff member, or pick a product to replace these notes.</Muted>
              <Row style={{ flexWrap: 'wrap' }}>
                {plan!.unlocated.map((item) => (
                  <Badge key={item.id} label={`📝 ${item.name}`} />
                ))}
              </Row>
            </Card>
          )}

          {skipped.size > 0 && (
            <Button
              title={`Bring back ${pluralize(skipped.size, 'skipped item')}`}
              variant="ghost"
              icon="arrow-undo"
              onPress={() => setSkipped(new Set())}
            />
          )}
        </View>
      ) : (
        <View style={{ gap: space.md, marginTop: space.md }}>
          <Card style={{ gap: space.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <H2>In your cart</H2>
              <Badge label={pluralize(totalQty, 'item')} tone="green" />
            </Row>
            {session.items.length === 0 ? (
              <Muted style={{ textAlign: 'center', paddingVertical: space.lg }}>Scan a barcode to add your first item.</Muted>
            ) : (
              session.items.map((item) => (
                <Row key={item.id} gap={space.md}>
                  <ProductArt emoji={item.emoji} color={item.color} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.ink, fontWeight: '500' }} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Muted style={{ fontSize: 12 }}>
                      {formatMoney(item.unitPrice)} · {item.addedVia === 'SMART_CART' ? '🛒 smart cart' : '📱 app'}
                    </Muted>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Stepper value={item.quantity} onChange={(quantity) => setQuantity.mutate({ itemId: item.id, quantity })} />
                    <Text style={{ fontWeight: '700' }}>{formatMoney(item.lineTotal)}</Text>
                  </View>
                </Row>
              ))
            )}
          </Card>
          <Card>
            <Totals session={session} />
          </Card>
        </View>
      )}

      <ScannerModal
        visible={scanning}
        onClose={() => {
          setScanning(false);
          setScanStatus(null);
        }}
        onScan={(code) => add.mutate({ barcode: code })}
        continuous
        title="Scan as you shop"
        hint="Point at the barcode on each pack. Close when you're done."
        status={
          scanStatus && (
            <View style={[styles.scanStatus, { backgroundColor: scanStatus.ok ? colors.brand : colors.danger }]}>
              <Ionicons name={scanStatus.ok ? 'checkmark-circle' : 'alert-circle'} size={20} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700', flex: 1 }} numberOfLines={2}>
                {scanStatus.text}
              </Text>
            </View>
          )
        }
      />
      <CheckoutSheet
        visible={checkingOut}
        onClose={() => setCheckingOut(false)}
        session={session}
        paying={checkout.isPending}
        onPay={(input) => checkout.mutate(input)}
      />
      <PairCartSheet visible={pairing} onClose={() => setPairing(false)} session={session} onSession={onSession} />
      {sheet}
    </Screen>
  );
}

function Totals({ session }: { session: InStoreSession }) {
  const { bill } = session;
  return (
    <View style={{ gap: 6 }}>
      {bill.mrpTotal > bill.itemTotal && (
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted>MRP</Muted>
          <Muted style={{ textDecorationLine: 'line-through' }}>{formatMoney(bill.mrpTotal)}</Muted>
        </Row>
      )}
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ color: colors.text }}>Items ({bill.itemCount})</Text>
        <Text style={{ color: colors.text }}>{formatMoney(bill.itemTotal)}</Text>
      </Row>
      {bill.itemSavings > 0 && (
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ color: colors.brand }}>You save</Text>
          <Text style={{ color: colors.brand }}>{formatMoney(bill.itemSavings)}</Text>
        </Row>
      )}
      <Row
        style={{ justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 8 }}
      >
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>Total</Text>
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>{formatMoney(bill.total)}</Text>
      </Row>
      <Muted style={{ fontSize: 11 }}>No delivery or handling fees in store · GST included</Muted>
    </View>
  );
}

function LinkList({ session, onSession }: { session: InStoreSession; onSession: SetSession }) {
  const router = useRouter();
  const { data: lists = [] } = useQuery({ queryKey: ['lists'], queryFn: () => customerApi.get<ShoppingListSummary[]>('/lists') });
  const [listId, setListId] = useState('');
  const link = useMutation({
    mutationFn: () => customerApi.put<InStoreSession>(`/instore/sessions/${session.id}/list`, { listId }),
    onSuccess: (next) => {
      onSession(next);
      toast.success('List linked', 'We sorted it into the fastest route through the store.');
    },
    onError: (error) => toast.error('Could not link the list', errorMessage(error)),
  });
  return (
    <View style={{ gap: space.sm }}>
      <H2>Shop from a family list</H2>
      <Muted>Link a list for a turn-by-turn route through the aisles. Items your family adds appear live.</Muted>
      {lists.length === 0 ? (
        <Button title="Create a list" variant="outline" onPress={() => router.navigate('/lists')} />
      ) : (
        <>
          <Row style={{ flexWrap: 'wrap' }}>
            {lists.map((l) => (
              <Chip key={l.id} label={`${l.emoji} ${l.name}`} active={listId === l.id} onPress={() => setListId(l.id)} />
            ))}
          </Row>
          <Button title="Link list" disabled={!listId} loading={link.isPending} onPress={() => link.mutate()} />
        </>
      )}
    </View>
  );
}

function CheckoutSheet({
  visible,
  onClose,
  session,
  paying,
  onPay,
}: {
  visible: boolean;
  onClose: () => void;
  session: InStoreSession;
  paying: boolean;
  onPay: (input: { method: MethodChoice; coupon: string }) => void;
}) {
  const [method, setMethod] = useState<MethodChoice | null>(null);
  const [coupon, setCoupon] = useState('SCANGO10');
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
        keyboardShouldPersistTaps="handled"
      >
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <H1>Pay and walk out</H1>
            <Muted>
              {pluralize(session.bill.itemCount, 'item')} · {formatMoney(session.bill.total)} before coupon
            </Muted>
          </View>
          <IconButton name="close" label="Close" onPress={onClose} />
        </Row>
        <PaymentMethodPicker channel="IN_STORE" value={method} onChange={setMethod} />
        <Field
          label="Coupon"
          value={coupon}
          onChangeText={(t) => setCoupon(t.toUpperCase())}
          autoCapitalize="characters"
          placeholder="Coupon code"
          hint="Scan & Go shoppers get 10% off with SCANGO10 (up to ₹75)."
        />
        <Button
          title={`Pay ${formatMoney(session.bill.total)}${coupon ? ' − coupon' : ''}`}
          size="lg"
          disabled={!method}
          loading={paying}
          onPress={() => method && onPay({ method, coupon })}
        />
      </ScrollView>
    </Modal>
  );
}

function PendingCheckout({ session, onSession }: { session: InStoreSession; onSession: SetSession }) {
  const resume = useMutation({
    mutationFn: () => customerApi.post<InStoreSession>(`/instore/sessions/${session.id}/resume`),
    onSuccess: onSession,
    onError: (error) => toast.error('Could not reopen your cart', errorMessage(error)),
  });
  return (
    <EmptyState
      emoji="💳"
      title="Your payment is not finished"
      body={`${pluralize(session.bill.itemCount, 'item')} · ${formatMoney(session.bill.total)}. Go back to your cart to pay again or change items.`}
      action={<Button title="Back to my cart" size="lg" loading={resume.isPending} onPress={() => resume.mutate()} />}
    />
  );
}

function PairCartSheet({
  visible,
  onClose,
  session,
  onSession,
}: {
  visible: boolean;
  onClose: () => void;
  session: InStoreSession;
  onSession: SetSession;
}) {
  const unpair = useMutation({
    mutationFn: () => customerApi.post<InStoreSession>(`/instore/sessions/${session.id}/unpair`),
    onSuccess: (next) => {
      onSession(next);
      toast.success('Smart cart unpaired');
    },
    onError: (error) => toast.error('Could not unpair', errorMessage(error)),
  });
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, padding: space.lg, gap: space.lg, backgroundColor: colors.background }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <H1>Smart cart</H1>
          <IconButton name="close" label="Close" onPress={onClose} />
        </Row>
        <Muted>Items dropped into a SmartCart trolley are added to this cart automatically. You still pay on your phone.</Muted>
        {session.cartDevice ? (
          <View style={{ alignItems: 'center', gap: space.md }}>
            <Text style={{ fontSize: 56 }}>🛒</Text>
            <H2>Paired with {session.cartDevice.name}</H2>
            <Button title="Unpair cart" variant="outline" loading={unpair.isPending} onPress={() => unpair.mutate()} />
          </View>
        ) : (
          <View style={{ alignItems: 'center', gap: space.md }}>
            <View style={{ padding: space.md, backgroundColor: '#fff', borderRadius: radius.lg }}>
              <QRCode value={buildCartPairUri(session.pairingCode)} size={200} />
            </View>
            <Muted>Show this to the cart's scanner, or type the code on its screen</Muted>
            <Text style={{ fontSize: 40, fontWeight: '800', letterSpacing: 10, color: colors.ink }}>{session.pairingCode}</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.ink, borderRadius: radius.xl, padding: space.xl },
  heroBadge: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  heroTitle: { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 6, letterSpacing: -0.3 },
  heroBody: { color: 'rgba(255,255,255,0.72)', marginTop: 8, fontSize: 14, lineHeight: 20 },
  heroLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '700', marginTop: space.lg, marginBottom: 6 },
  heroChip: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    maxWidth: 240,
  },
  heroChipActive: { backgroundColor: colors.accent },
  heroChipText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  stepIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: colors.brandDark },
  nextStop: { backgroundColor: colors.brand, paddingHorizontal: space.lg, paddingVertical: space.md },
  stopItem: {
    paddingHorizontal: space.lg,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  stopIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanButton: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutButton: {
    flex: 1,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.brand,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
  },
  checkoutTotal: { color: '#fff', fontSize: 18, fontWeight: '800' },
  checkoutCount: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' },
  checkoutLabel: { color: '#fff', fontSize: 16, fontWeight: '800' },
  scanStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: radius.md,
  },
});
