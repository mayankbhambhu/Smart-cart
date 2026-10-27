import { formatMoney, type QuoteResult } from '@smartcart/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { BillRows } from '@/components/checkout';
import { colors, space } from '@/components/theme';
import { Button, Card, EmptyState, Field, H2, Muted, ProductArt, Row, Screen, Stepper } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { useCurrentStore } from '@/lib/hooks';
import { cartTotals, useCart, useCartLines, useShop } from '@/lib/stores';

export default function CartScreen() {
  const router = useRouter();
  const session = useSession('CUSTOMER');
  const { store } = useCurrentStore();
  const lines = useCartLines(store?.id);
  const setQuantity = useCart((s) => s.setQuantity);
  const mode = useShop((s) => s.mode);
  const [coupon, setCoupon] = useState('');
  const [applied, setApplied] = useState('');
  const [debounced, setDebounced] = useState(lines);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(lines), 300);
    return () => clearTimeout(timer);
  }, [lines]);

  const { data: quote } = useQuery({
    queryKey: ['quote', store?.id, mode, debounced.map((l) => `${l.productId}:${l.quantity}`).join(','), applied],
    queryFn: () =>
      publicApi.post<QuoteResult>('/orders/quote', {
        storeId: store!.id,
        channel: mode,
        items: debounced.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        couponCode: applied || undefined,
      }),
    enabled: Boolean(store) && debounced.length > 0,
  });

  if (lines.length === 0) {
    return (
      <EmptyState
        emoji="🛒"
        title="Your cart is empty"
        body="Add something and get it in minutes."
        action={<Button title="Start shopping" onPress={() => router.back()} />}
      />
    );
  }
  const totals = cartTotals(lines);
  return (
    <Screen
      footer={
        <Button
          title={`${mode === 'PICKUP' ? 'Choose pickup slot' : 'Checkout'} · ${formatMoney(quote?.bill.total ?? totals.total)}`}
          size="lg"
          block
          onPress={() => (session ? router.replace({ pathname: '/checkout', params: { coupon: applied } }) : router.push('/login'))}
        />
      }
    >
      <Card style={{ gap: space.md }}>
        <H2>
          {mode === 'PICKUP'
            ? '🛍️ Pick up at your chosen slot'
            : `⚡ Delivery in ${quote?.deliveryEtaMinutes ?? store?.deliveryEtaMinutes ?? 10} minutes`}
        </H2>
        {lines.map((line) => {
          const quoted = quote?.lines.find((l) => l.productId === line.productId);
          return (
            <Row key={line.productId} gap={space.md}>
              <ProductArt emoji={line.emoji} color={line.color} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: colors.ink }} numberOfLines={2}>
                  {line.name}
                </Text>
                <Muted>{line.unit}</Muted>
                {quoted && !quoted.available && (
                  <Text style={{ color: colors.danger, fontSize: 12 }}>Only {quoted.availableQty} available</Text>
                )}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Stepper value={line.quantity} max={line.maxOrderQty} onChange={(q) => setQuantity(line.productId, q)} />
                <Text style={{ fontWeight: '700' }}>{formatMoney(line.price * line.quantity)}</Text>
              </View>
            </Row>
          );
        })}
      </Card>
      <Card style={{ marginTop: space.lg }}>
        <Row>
          <View style={{ flex: 1 }}>
            <Field
              label="Coupon"
              value={coupon}
              onChangeText={(t) => setCoupon(t.toUpperCase())}
              placeholder="WELCOME50"
              autoCapitalize="characters"
            />
          </View>
          <Button title="Apply" variant="dark" onPress={() => setApplied(coupon.trim())} style={{ marginTop: 10 }} />
        </Row>
        {quote?.offer && (
          <Text style={{ color: quote.offer.applicable ? colors.brand : colors.danger, fontWeight: '600' }}>{quote.offer.message}</Text>
        )}
      </Card>
      {quote && (
        <Card style={{ marginTop: space.lg }}>
          <H2 style={{ marginBottom: space.sm }}>Bill details</H2>
          <BillRows bill={quote.bill} />
          {quote.bill.totalSavings > 0 && (
            <Text style={{ marginTop: space.md, color: colors.info, fontWeight: '700' }}>
              You save {formatMoney(quote.bill.totalSavings)} on this order 🎉
            </Text>
          )}
        </Card>
      )}
    </Screen>
  );
}
