import { formatMoney, type CheckoutResult, type PickupSlotDay, type QuoteResult } from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { AddressForm } from '@/components/AddressForm';
import { BillRows, PaymentMethodPicker, type MethodChoice } from '@/components/checkout';
import { colors, radius, space } from '@/components/theme';
import { Button, Card, Chip, EmptyState, H2, Muted, Row, Screen } from '@/components/ui';
import { customerApi, errorMessage, publicApi } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { useAddresses, useCurrentStore } from '@/lib/hooks';
import { usePayment } from '@/lib/payments';
import { useCart, useCartLines, useShop } from '@/lib/stores';
import { toast } from '@/lib/toast';

const TIPS = [0, 2000, 3000, 5000];

export default function CheckoutScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { coupon = '' } = useLocalSearchParams<{ coupon?: string }>();
  const { store } = useCurrentStore();
  const mode = useShop((s) => s.mode);
  const addressId = useShop((s) => s.addressId);
  const setAddress = useShop((s) => s.setAddress);
  const lines = useCartLines(store?.id);
  const clearCart = useCart((s) => s.clear);
  const { data: addresses = [] } = useAddresses();
  const [adding, setAdding] = useState(false);
  const [tip, setTip] = useState(0);
  const [day, setDay] = useState(0);
  const [slot, setSlot] = useState<string | null>(null);
  const [method, setMethod] = useState<MethodChoice | null>(null);
  const { pay, sheet } = usePayment();
  const idempotencyKey = useMemo(() => Crypto.randomUUID(), []);
  const address = addresses.find((a) => a.id === addressId) ?? addresses.find((a) => a.isDefault) ?? addresses[0];
  const items = lines.map((l) => ({ productId: l.productId, quantity: l.quantity }));

  const { data: quote } = useQuery({
    queryKey: ['checkout-quote', store?.id, mode, JSON.stringify(items), coupon, tip],
    queryFn: () =>
      customerApi.post<QuoteResult>('/orders/quote', {
        storeId: store!.id,
        channel: mode,
        items,
        couponCode: coupon || undefined,
        tip: mode === 'DELIVERY' ? tip : undefined,
      }),
    enabled: Boolean(store) && items.length > 0,
  });
  const { data: slots = [] } = useQuery({
    queryKey: ['pickup-slots', store?.id],
    queryFn: () => publicApi.get<PickupSlotDay[]>(`/stores/${store!.id}/pickup-slots`, { days: 3 }),
    enabled: Boolean(store) && mode === 'PICKUP',
  });

  const place = useMutation({
    mutationFn: async () => {
      const checkout = await customerApi.post<CheckoutResult>('/orders', {
        storeId: store!.id,
        channel: mode,
        items,
        couponCode: quote?.offer?.applicable ? coupon : undefined,
        tip: mode === 'DELIVERY' ? tip : undefined,
        addressId: mode === 'DELIVERY' ? address?.id : undefined,
        pickupSlotStart: mode === 'PICKUP' ? slot : undefined,
        paymentMethod: method!.method,
        savedPaymentMethodId: method!.savedPaymentMethodId,
        idempotencyKey,
      });
      return { checkout, paid: await pay(checkout) };
    },
    onSuccess: ({ checkout, paid }) => {
      clearCart();
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success(
        paid ? (mode === 'PICKUP' ? 'Pickup booked!' : 'Order placed!') : 'Order created',
        paid ? `Order ${checkout.order.orderNumber}` : 'Finish the payment from the order screen.',
      );
      router.replace(`/order/${checkout.order.id}`);
    },
    onError: (error) => toast.error('Could not place the order', errorMessage(error)),
  });

  if (!store || lines.length === 0) return <EmptyState emoji="🛒" title="Your cart is empty" />;
  const ready = Boolean(method) && (mode === 'DELIVERY' ? Boolean(address) : Boolean(slot)) && !quote?.unavailable.length;

  return (
    <Screen
      footer={
        <Button
          title={method?.method === 'CASH_ON_DELIVERY' ? 'Place order' : `Pay ${quote ? formatMoney(quote.bill.total) : ''}`}
          size="lg"
          block
          disabled={!ready}
          loading={place.isPending}
          onPress={() => place.mutate()}
        />
      }
    >
      {mode === 'DELIVERY' ? (
        <Card style={{ gap: space.sm }}>
          <H2>Deliver to</H2>
          {addresses.map((a) => (
            <Pressable key={a.id} onPress={() => setAddress(a.id)} style={[styles.option, address?.id === a.id && styles.selected]}>
              <Text style={{ fontWeight: '700' }}>{a.label === 'HOME' ? 'Home' : a.label === 'WORK' ? 'Work' : 'Other'}</Text>
              <Muted numberOfLines={2}>
                {a.line1}
                {a.line2 ? `, ${a.line2}` : ''}, {a.city} {a.pincode}
              </Muted>
            </Pressable>
          ))}
          {adding ? (
            <AddressForm onSaved={(a) => (setAddress(a.id), setAdding(false))} />
          ) : (
            <Button title="Add a new address" variant="outline" icon="add" onPress={() => setAdding(true)} />
          )}
          <H2 style={{ marginTop: space.md }}>Tip your rider</H2>
          <Row>
            {TIPS.map((t) => (
              <Chip key={t} label={t === 0 ? 'No tip' : formatMoney(t)} active={tip === t} onPress={() => setTip(t)} />
            ))}
          </Row>
        </Card>
      ) : (
        <Card style={{ gap: space.sm }}>
          <H2>Pickup slot at {store.name}</H2>
          <Row>
            {slots.map((d, i) => (
              <Chip key={d.date} label={d.label} active={day === i} onPress={() => setDay(i)} />
            ))}
          </Row>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {(slots[day]?.slots ?? []).map((s) => (
              <Pressable
                key={s.start}
                disabled={!s.available}
                onPress={() => setSlot(s.start)}
                style={[styles.slot, slot === s.start && styles.selected, !s.available && { opacity: 0.4 }]}
              >
                <Text style={{ fontWeight: '700' }}>
                  {formatTime(s.start)}–{formatTime(s.end)}
                </Text>
                <Muted style={{ fontSize: 11 }}>{s.available ? `${s.remaining} left` : 'Full'}</Muted>
              </Pressable>
            ))}
          </ScrollView>
        </Card>
      )}

      <Card style={{ marginTop: space.lg, gap: space.sm }}>
        <H2>Pay with</H2>
        <PaymentMethodPicker channel={mode} value={method} onChange={setMethod} />
      </Card>

      {quote && (
        <Card style={{ marginTop: space.lg }}>
          <H2 style={{ marginBottom: space.sm }}>Bill details</H2>
          <BillRows bill={quote.bill} />
          {quote.unavailable.length > 0 && (
            <Text style={{ color: colors.danger, marginTop: space.sm }}>Some items are no longer available. Update your cart.</Text>
          )}
        </Card>
      )}
      {sheet}
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: { padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, gap: 2 },
  selected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  slot: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
});
