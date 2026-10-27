import {
  ORDER_FLOW,
  ORDER_STATUS_LABELS,
  SocketEvents,
  buildPickupUri,
  formatMoney,
  pluralize,
  type CheckoutResult,
  type Order,
} from '@smartcart/shared';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Modal, Text, View } from 'react-native';
import { BillRows, PaymentMethodPicker, type MethodChoice } from '@/components/checkout';
import { QRCode } from '@/components/codes';
import { colors, radius, space } from '@/components/theme';
import { Badge, Button, Card, H1, H2, Loader, Muted, ProductArt, Row, Screen } from '@/components/ui';
import { customerApi, errorMessage } from '@/lib/api';
import { formatDateTime, formatTime } from '@/lib/format';
import { afterModalClose, usePayment } from '@/lib/payments';
import { useRoom, useSocketEvent } from '@/lib/socket';
import { toast } from '@/lib/toast';

/** Live order tracking: status timeline, rider, pickup QR, bill, pay or cancel. */
export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const {
    data: order,
    refetch,
    isRefetching,
  } = useQuery({ queryKey: ['order', id], queryFn: () => customerApi.get<Order>(`/orders/${id}`) });
  useRoom('CUSTOMER', SocketEvents.JOIN_ORDER, SocketEvents.LEAVE_ORDER, id);
  useSocketEvent<{ orderId: string }>('CUSTOMER', SocketEvents.ORDER_CHANGED, (e) => {
    if (e.orderId === id) void queryClient.invalidateQueries({ queryKey: ['order', id] });
  });
  const [paying, setPaying] = useState(false);
  const cancel = useMutation({
    mutationFn: () => customerApi.post<Order>(`/orders/${id}/cancel`, { reason: 'Cancelled by customer' }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['order', id], updated);
      toast.success('Order cancelled', updated.paymentStatus === 'REFUNDED' ? 'Your refund is on its way.' : undefined);
    },
    onError: (error) => toast.error('Could not cancel', errorMessage(error)),
  });

  if (!order) return <Loader />;
  const flow = ORDER_FLOW[order.channel];
  const reached = flow.indexOf(order.status);
  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Stack.Screen options={{ title: order.orderNumber }} />
      <H1>{ORDER_STATUS_LABELS[order.status]}</H1>
      <Muted>
        {order.storeName} · placed {formatDateTime(order.placedAt ?? order.createdAt)}
      </Muted>

      {order.status === 'PENDING_PAYMENT' && (
        <Card style={{ marginTop: space.lg, backgroundColor: colors.warningSoft, borderColor: '#fde68a', gap: space.sm }}>
          <Text style={{ fontWeight: '700', color: colors.warning }}>Payment pending</Text>
          <Muted>Unpaid orders are released after 20 minutes.</Muted>
          <Button title="Pay now" onPress={() => setPaying(true)} />
        </Card>
      )}

      {order.channel === 'DELIVERY' && order.status === 'OUT_FOR_DELIVERY' && (
        <Card style={{ marginTop: space.lg, backgroundColor: colors.brand, borderColor: colors.brand }}>
          <Text style={{ color: '#fff', opacity: 0.85, fontWeight: '600' }}>On the way</Text>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{order.rider?.name ?? 'Your delivery partner'}</Text>
          {order.rider?.phone && (
            <Button
              title="Call rider"
              variant="accent"
              icon="call"
              style={{ marginTop: space.md }}
              onPress={() => void Linking.openURL(`tel:${order.rider!.phone}`)}
            />
          )}
        </Card>
      )}

      {order.channel === 'PICKUP' && order.pickupCode && !['CANCELLED', 'PICKED_UP'].includes(order.status) && (
        <Card style={{ marginTop: space.lg, alignItems: 'center', gap: space.sm }}>
          <Badge
            label={order.status === 'READY_FOR_PICKUP' ? 'Ready at the counter' : 'Being prepared'}
            tone={order.status === 'READY_FOR_PICKUP' ? 'green' : 'yellow'}
          />
          <QRCode value={buildPickupUri(order.orderNumber, order.pickupCode)} size={200} />
          <Text style={{ fontSize: 30, fontWeight: '800', letterSpacing: 8 }}>{order.pickupCode}</Text>
          <Muted style={{ textAlign: 'center' }}>
            Slot {formatTime(order.scheduledFor)}–{formatTime(order.slotEnd)} · show this at the pickup counter
          </Muted>
        </Card>
      )}

      {order.status !== 'CANCELLED' && order.channel !== 'IN_STORE' && (
        <Card style={{ marginTop: space.lg, gap: space.md }}>
          {flow.map((step, i) => {
            const event = order.events.find((e) => e.status === step);
            const done = i <= reached;
            return (
              <Row key={step} gap={space.md}>
                <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={done ? colors.brand : colors.faint} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: done ? colors.ink : colors.faint }}>{ORDER_STATUS_LABELS[step]}</Text>
                  {event && <Muted>{formatTime(event.at)}</Muted>}
                </View>
              </Row>
            );
          })}
        </Card>
      )}

      <Card style={{ marginTop: space.lg, gap: space.md }}>
        <H2>{pluralize(order.itemCount, 'item')}</H2>
        {order.items.map((item) => (
          <Row key={item.id} gap={space.md}>
            <ProductArt emoji={item.emoji} color={item.color} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink }} numberOfLines={1}>
                {item.name}
              </Text>
              <Muted>
                {item.quantity} × {formatMoney(item.unitPrice)}
              </Muted>
            </View>
            <Text style={{ fontWeight: '700' }}>{formatMoney(item.lineTotal)}</Text>
          </Row>
        ))}
      </Card>
      <Card style={{ marginTop: space.lg }}>
        <BillRows bill={order.bill} />
      </Card>
      {(order.status === 'PLACED' || order.status === 'PENDING_PAYMENT') && (
        <Button
          title="Cancel order"
          variant="ghost"
          style={{ marginTop: space.lg }}
          loading={cancel.isPending}
          onPress={() => cancel.mutate()}
        />
      )}
      <RetryPayment order={order} visible={paying} onClose={() => setPaying(false)} />
    </Screen>
  );
}

function RetryPayment({ order, visible, onClose }: { order: Order; visible: boolean; onClose: () => void }) {
  const [method, setMethod] = useState<MethodChoice | null>(null);
  const { pay, sheet } = usePayment();
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: async () => {
      const checkout = await customerApi.post<CheckoutResult>(`/orders/${order.id}/pay`, method);
      onClose();
      await afterModalClose();
      return pay(checkout);
    },
    onSuccess: (paid) => {
      void queryClient.invalidateQueries({ queryKey: ['order', order.id] });
      if (paid) toast.success('Payment successful');
    },
    onError: (error) => toast.error('Payment could not start', errorMessage(error)),
  });
  return (
    <>
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View style={{ flex: 1, padding: space.lg, gap: space.md, backgroundColor: colors.background, borderRadius: radius.lg }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <H2>Pay {formatMoney(order.total)}</H2>
            <Button title="Close" variant="ghost" size="sm" onPress={onClose} />
          </Row>
          <PaymentMethodPicker channel={order.channel} value={method} onChange={setMethod} />
          <Button title="Continue" size="lg" disabled={!method} loading={retry.isPending} onPress={() => retry.mutate()} />
        </View>
      </Modal>
      {sheet}
    </>
  );
}
