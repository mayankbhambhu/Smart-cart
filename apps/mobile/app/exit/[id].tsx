import { SocketEvents, formatMoney, groupCode, pluralize, PAYMENT_METHOD_LABELS, type ExitPass, type Order } from '@smartcart/shared';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Brightness from 'expo-brightness';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BillRows } from '@/components/checkout';
import { Barcode, QRCode } from '@/components/codes';
import { colors, radius, space } from '@/components/theme';
import { Badge, Button, Card, EmptyState, H2, Loader, Muted, ProductArt, Row, Screen, Segmented } from '@/components/ui';
import { customerApi, errorMessage } from '@/lib/api';
import { formatDateTime, formatTime } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { useRoom, useSocketEvent } from '@/lib/socket';
import { toast } from '@/lib/toast';

/**
 * Digital receipt + exit pass. The QR / barcode holds a one-time token that the
 * exit gate verifies against the payment; the gate opens and the pass is spent.
 */
export default function ExitPassScreen() {
  const { id: orderId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    data: order,
    isLoading,
    refetch,
  } = useQuery({ queryKey: ['order', orderId], queryFn: () => customerApi.get<Order>(`/orders/${orderId}`) });
  const [pass, setPass] = useState<ExitPass | null>(null);
  const [opened, setOpened] = useState(false);

  const reveal = useMutation({
    mutationFn: () => customerApi.post<ExitPass>(`/orders/${orderId}/exit-pass`),
    onSuccess: setPass,
    onError: (error) => toast.error('Could not load your exit pass', errorMessage(error)),
  });
  const paid = order?.paymentStatus === 'PAID';
  const { mutate: revealPass } = reveal;
  useEffect(() => {
    if (paid && order?.exitPass?.status === 'ACTIVE') revealPass();
  }, [paid, order?.exitPass?.status, revealPass]);

  useRoom('CUSTOMER', SocketEvents.JOIN_ORDER, SocketEvents.LEAVE_ORDER, orderId);
  useSocketEvent<{ orderId: string; exitPass?: ExitPass }>('CUSTOMER', SocketEvents.ORDER_CHANGED, (event) => {
    if (event.orderId !== orderId) return;
    if (event.exitPass) {
      const next = event.exitPass;
      setPass((current) => ({
        ...next,
        token: next.status === 'ACTIVE' ? (current?.token ?? null) : null,
        uri: next.status === 'ACTIVE' ? (current?.uri ?? null) : null,
      }));
      if (next.status === 'USED') {
        setOpened(true);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
    void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
  });

  const done = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const header = <Stack.Screen options={{ headerRight: () => <Button title="Done" variant="ghost" size="sm" onPress={done} /> }} />;
  if (isLoading) return <Loader />;
  if (!order)
    return <EmptyState emoji="🧾" title="Receipt not found" action={<Button title="Try again" onPress={() => void refetch()} />} />;
  const status = pass?.status ?? order.exitPass?.status ?? null;

  return (
    <Screen>
      {header}
      {!paid ? (
        <Card>
          <EmptyState
            emoji="💳"
            title="Payment not completed"
            body="Your exit pass appears here as soon as the payment goes through."
            action={<Button title="Back to my cart" onPress={() => router.dismissTo('/instore')} />}
          />
        </Card>
      ) : opened || status === 'USED' ? (
        <GateOpened order={order} usedAt={pass?.usedAt ?? order.exitPass?.usedAt ?? null} onDone={done} />
      ) : status === 'ACTIVE' && pass?.token ? (
        <ActivePass pass={pass} order={order} onRefresh={() => reveal.mutate()} refreshing={reveal.isPending} />
      ) : status === 'EXPIRED' || status === 'REVOKED' ? (
        <Card>
          <EmptyState
            emoji="⌛"
            title={`This exit pass has ${status === 'EXPIRED' ? 'expired' : 'been revoked'}`}
            body="Your payment is safe. Show this receipt to a staff member at the exit and they will let you through."
            action={<Badge label={`Order ${order.orderNumber} · ref …${pass?.hint ?? order.exitPass?.hint ?? ''}`} />}
          />
        </Card>
      ) : (
        <Loader label="Preparing your exit pass…" />
      )}

      <Card style={{ marginTop: space.lg, gap: space.md }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <H2>🧾 Digital receipt</H2>
            <Muted>
              {order.storeName} · {formatDateTime(order.placedAt ?? order.createdAt)}
            </Muted>
          </View>
          <Badge label={paid ? 'Paid' : 'Unpaid'} tone={paid ? 'green' : 'yellow'} />
        </Row>
        {order.items.map((item) => (
          <Row key={item.id} gap={space.md}>
            <ProductArt emoji={item.emoji} color={item.color} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink }} numberOfLines={1}>
                {item.name}
              </Text>
              <Muted style={{ fontSize: 12 }}>
                {item.quantity} × {formatMoney(item.unitPrice)}
              </Muted>
            </View>
            <Text style={{ fontWeight: '700' }}>{formatMoney(item.lineTotal)}</Text>
          </Row>
        ))}
        <BillRows bill={order.bill} />
        <Muted style={{ fontSize: 12 }}>
          Order {order.orderNumber}
          {order.paymentMethod ? ` · paid with ${PAYMENT_METHOD_LABELS[order.paymentMethod]}` : ''}
          {order.couponCode ? ` · coupon ${order.couponCode}` : ''}
        </Muted>
      </Card>
    </Screen>
  );
}

/** Full brightness while the pass is on screen so the gate scanner reads it first time. */
function useFullBrightness() {
  useEffect(() => {
    let previous: number | null = null;
    let active = true;
    void (async () => {
      try {
        previous = await Brightness.getBrightnessAsync();
        if (active) await Brightness.setBrightnessAsync(1);
      } catch {
        // Brightness control is optional.
      }
    })();
    return () => {
      active = false;
      if (Platform.OS === 'android') void Brightness.restoreSystemBrightnessAsync().catch(() => undefined);
      else if (previous !== null) void Brightness.setBrightnessAsync(previous).catch(() => undefined);
    };
  }, []);
}

function ActivePass({ pass, order, onRefresh, refreshing }: { pass: ExitPass; order: Order; onRefresh: () => void; refreshing: boolean }) {
  const { width } = useWindowDimensions();
  const [format, setFormat] = useState<'qr' | 'barcode'>('qr');
  const now = useNow(1000);
  useFullBrightness();
  const msLeft = new Date(pass.expiresAt).getTime() - now.getTime();
  const minutes = Math.max(0, Math.floor(msLeft / 60_000));
  const seconds = Math.max(0, Math.floor((msLeft % 60_000) / 1000));
  const codeWidth = width - space.lg * 4;
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <View style={styles.passHeader}>
        <Row gap={6}>
          <Ionicons name="shield-checkmark" size={16} color="#fff" />
          <Text style={{ color: '#fff', opacity: 0.9, fontWeight: '600' }}>Payment verified</Text>
        </Row>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800' }}>Scan at the exit gate</Text>
        <Text style={{ color: '#fff', opacity: 0.85 }}>
          {pluralize(order.itemCount, 'item')} · {formatMoney(order.total)}
        </Text>
      </View>
      <View style={{ padding: space.lg, alignItems: 'center', gap: space.md }}>
        <View style={{ alignSelf: 'stretch' }}>
          <Segmented
            value={format}
            onChange={setFormat}
            options={[
              { value: 'qr', label: 'QR code' },
              { value: 'barcode', label: 'Barcode' },
            ]}
          />
        </View>
        <View style={styles.code}>
          {format === 'qr' ? (
            <QRCode value={pass.uri ?? pass.token!} size={Math.min(260, codeWidth)} />
          ) : (
            <Barcode value={pass.token!} width={codeWidth} height={100} />
          )}
        </View>
        <Text style={styles.token}>{groupCode(pass.token!)}</Text>
        <Row style={styles.timer}>
          <Row gap={6} style={{ flex: 1 }}>
            <Ionicons name="sunny-outline" size={16} color={colors.muted} />
            <Muted>Screen brightness turned up</Muted>
          </Row>
          <Text style={{ fontWeight: '700', color: colors.ink }}>
            {minutes}:{String(seconds).padStart(2, '0')} left
          </Text>
        </Row>
        <Button title="New code" icon="refresh" variant="ghost" size="sm" loading={refreshing} onPress={onRefresh} />
        <Muted style={{ textAlign: 'center', fontSize: 12 }}>
          One-time pass. A screenshot stops working once it is used or a new code is shown.
        </Muted>
      </View>
    </Card>
  );
}

function GateOpened({ order, usedAt, onDone }: { order: Order; usedAt: string | null; onDone: () => void }) {
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <View style={styles.opened}>
        <Ionicons name="checkmark-circle" size={72} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800', marginTop: space.sm }}>Gate opened</Text>
        <Text style={{ color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>Thanks for shopping at {order.storeName}!</Text>
      </View>
      <View style={{ padding: space.lg, alignItems: 'center', gap: space.sm }}>
        <Muted>Exited at {formatTime(usedAt)}</Muted>
        {order.bill.totalSavings > 0 && (
          <Text style={{ color: colors.text }}>
            You saved <Text style={{ color: colors.brand, fontWeight: '800' }}>{formatMoney(order.bill.totalSavings)}</Text> and skipped the
            queue.
          </Text>
        )}
        <Button title="Done" variant="outline" style={{ marginTop: space.sm }} onPress={onDone} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  passHeader: { backgroundColor: colors.brand, padding: space.lg, gap: 2 },
  code: { padding: space.md, backgroundColor: '#fff', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  token: {
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#334155',
  },
  timer: { alignSelf: 'stretch', backgroundColor: '#f1f5f9', borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10 },
  opened: { backgroundColor: colors.brand, alignItems: 'center', paddingVertical: 40, paddingHorizontal: space.lg },
});
