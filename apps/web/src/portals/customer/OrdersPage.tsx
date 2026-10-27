import { formatMoney, pluralize, type OrderSummary, type Paginated } from '@smartcart/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { ChannelBadge, OrderStatusBadge } from '@/components/orders';
import { Button, Card, EmptyState, PageLoader, Segmented } from '@/components/ui';
import { customerApi } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

type Filter = 'ALL' | 'DELIVERY' | 'PICKUP' | 'IN_STORE';

export default function OrdersPage() {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [limit, setLimit] = useState(20);
  const { data, isLoading } = useQuery({
    queryKey: ['orders', filter, limit],
    queryFn: () =>
      customerApi.get<Paginated<OrderSummary>>('/orders', { query: { channel: filter === 'ALL' ? undefined : filter, limit } }),
  });
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-extrabold text-slate-900">Purchase history</h1>
      <p className="text-sm text-slate-500">Deliveries, pickups and Scan &amp; Go receipts in one place.</p>
      <Segmented
        className="mt-4"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'ALL', label: 'All' },
          { value: 'DELIVERY', label: 'Delivery' },
          { value: 'PICKUP', label: 'Pickup' },
          { value: 'IN_STORE', label: 'In store' },
        ]}
      />
      {isLoading ? (
        <PageLoader />
      ) : !data || data.items.length === 0 ? (
        <EmptyState icon="🧾" title="No orders yet" body="Your orders and in-store receipts will show up here." />
      ) : (
        <div className="mt-4 space-y-3">
          {data.items.map((order) => (
            <Link key={order.id} to={order.channel === 'IN_STORE' ? `/exit/${order.id}` : `/orders/${order.id}`}>
              <Card className="flex items-center gap-4 p-4 transition-shadow hover:shadow-pop">
                <div className="flex -space-x-2">
                  {order.previewEmojis.map((emoji, i) => (
                    <span
                      key={i}
                      className="flex size-10 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-lg"
                    >
                      {emoji}
                    </span>
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{formatMoney(order.total)}</span>
                    <ChannelBadge channel={order.channel} />
                    <OrderStatusBadge status={order.status} />
                  </div>
                  <p className="mt-0.5 truncate text-sm text-slate-500">
                    {pluralize(order.itemCount, 'item')} · {order.storeName} · {formatDateTime(order.placedAt ?? order.createdAt)}
                  </p>
                </div>
                <ChevronRight className="size-5 text-slate-400" />
              </Card>
            </Link>
          ))}
          {data.total > data.items.length && (
            <Button variant="outline" block onClick={() => setLimit(limit + 20)}>
              Show more
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
