import { formatMoney, ORDER_STATUS_LABELS, pluralize, type OrderSummary, type Paginated } from '@smartcart/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { colors, space } from '@/components/theme';
import { Badge, Button, Card, EmptyState, Loader, Muted, Row } from '@/components/ui';
import { customerApi } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';

const channelLabel = { DELIVERY: '⚡ Delivery', PICKUP: '🛍️ Pickup', IN_STORE: '📱 Scan & Go' } as const;

export default function OrdersScreen() {
  const router = useRouter();
  const session = useSession('CUSTOMER');
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['orders'],
    queryFn: () => customerApi.get<Paginated<OrderSummary>>('/orders', { limit: 50 }),
    enabled: Boolean(session),
  });
  if (!session)
    return (
      <EmptyState
        emoji="🧾"
        title="Your purchase history"
        body="Log in to see deliveries, pickups and Scan & Go receipts."
        action={<Button title="Log in" onPress={() => router.push('/login')} />}
      />
    );
  if (isLoading) return <Loader />;
  return (
    <FlatList
      data={data?.items ?? []}
      keyExtractor={(o) => o.id}
      contentContainerStyle={{ padding: space.lg, gap: space.md }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.brand} />}
      ListEmptyComponent={<EmptyState emoji="🧾" title="No orders yet" />}
      renderItem={({ item: order }) => (
        <Card onPress={() => router.push(order.channel === 'IN_STORE' ? `/exit/${order.id}` : `/order/${order.id}`)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 22 }}>{order.previewEmojis.join(' ')}</Text>
            <Text style={{ fontWeight: '800', fontSize: 16, color: colors.ink }}>{formatMoney(order.total)}</Text>
          </Row>
          <Row style={{ marginTop: space.sm, flexWrap: 'wrap' }}>
            <Badge
              label={channelLabel[order.channel]}
              tone={order.channel === 'IN_STORE' ? 'violet' : order.channel === 'PICKUP' ? 'blue' : 'green'}
            />
            <Badge
              label={ORDER_STATUS_LABELS[order.status]}
              tone={
                order.status === 'CANCELLED'
                  ? 'red'
                  : order.status === 'PENDING_PAYMENT'
                    ? 'yellow'
                    : ['DELIVERED', 'PICKED_UP', 'COMPLETED'].includes(order.status)
                      ? 'gray'
                      : 'green'
              }
            />
          </Row>
          <View style={{ marginTop: 6 }}>
            <Muted>
              {pluralize(order.itemCount, 'item')} · {order.storeName} · {formatDateTime(order.placedAt ?? order.createdAt)}
            </Muted>
          </View>
        </Card>
      )}
    />
  );
}
