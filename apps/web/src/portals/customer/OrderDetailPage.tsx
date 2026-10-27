import {
  SocketEvents,
  buildPickupUri,
  formatMoney,
  interpolate,
  pluralize,
  type CatalogProduct,
  type CheckoutResult,
  type Order,
} from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, MapPin, Phone, Receipt, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { QRCode } from '@/components/codes';
import { ChannelBadge, OrderProgress, OrderStatusBadge } from '@/components/orders';
import { usePayment } from '@/components/PaymentSheet';
import { ProductArt } from '@/components/product';
import { Badge, Button, Card, CardHeader, ErrorState, Modal, PageLoader } from '@/components/ui';
import { customerApi, errorMessage, publicApi } from '@/lib/api';
import { useRoom, useSocketEvent } from '@/lib/socket';
import { useCart, useShop } from '@/lib/stores';
import { toast } from '@/lib/toast';
import { formatDateTime, formatTime, useNow } from '@/lib/utils';
import { BillRows } from './CustomerLayout';
import { PaymentMethodPicker, type MethodChoice } from './payment-methods';

export default function OrderDetailPage() {
  const { orderId } = useParams();
  const queryClient = useQueryClient();
  const {
    data: order,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => customerApi.get<Order>(`/orders/${orderId}`),
  });
  useRoom('CUSTOMER', SocketEvents.JOIN_ORDER, SocketEvents.LEAVE_ORDER, orderId);
  useSocketEvent<{ orderId: string }>('CUSTOMER', SocketEvents.ORDER_CHANGED, (event) => {
    if (event.orderId === orderId) void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
  });
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);

  if (isLoading) return <PageLoader />;
  if (error || !order) return <ErrorState error={error} retry={() => void refetch()} />;

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <div>
          <Link to="/orders" className="text-sm font-semibold text-brand-700">
            ← All orders
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900">Order {order.orderNumber}</h1>
            <ChannelBadge channel={order.channel} long />
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="text-sm text-slate-500">
            {order.storeName} · placed {formatDateTime(order.placedAt ?? order.createdAt)}
          </p>
        </div>

        {order.status === 'PENDING_PAYMENT' && (
          <Card className="flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50 p-4">
            <div>
              <p className="font-semibold text-amber-900">Payment pending</p>
              <p className="text-sm text-amber-800">
                Complete the payment to confirm your order. Unpaid orders are released after 20 minutes.
              </p>
            </div>
            <Button onClick={() => setRetrying(true)}>Pay now</Button>
          </Card>
        )}

        {order.channel === 'DELIVERY' && order.status === 'OUT_FOR_DELIVERY' && <RiderCard order={order} />}
        {order.channel === 'PICKUP' && order.pickupCode && order.status !== 'CANCELLED' && order.status !== 'PICKED_UP' && (
          <PickupCard order={order} />
        )}

        <Card>
          <CardHeader title="Order status" />
          <div className="p-5">
            <OrderProgress channel={order.channel} status={order.status} events={order.events} />
            {order.cancelReason && <p className="mt-4 text-sm text-slate-500">Reason: {order.cancelReason}</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title={pluralize(order.itemCount, 'item')} />
          <ul className="divide-y divide-slate-100">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-5 py-3">
                <ProductArt emoji={item.emoji} color={item.color} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{item.name}</p>
                  <p className="text-xs text-slate-500">
                    {item.unit} · {formatMoney(item.unitPrice)} × {item.quantity}
                  </p>
                </div>
                <span className="tabular text-sm font-semibold">{formatMoney(item.lineTotal)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <aside className="space-y-4">
        <Card className="p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Receipt className="size-4" /> Bill
          </p>
          <BillRows bill={order.bill} />
          {order.couponCode && (
            <Badge tone="violet" className="mt-3">
              Coupon {order.couponCode}
            </Badge>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Paid with {order.paymentMethod?.replaceAll('_', ' ').toLowerCase() ?? '—'} · {order.paymentStatus.toLowerCase()}
          </p>
        </Card>
        {order.address && (
          <Card className="p-4 text-sm">
            <p className="flex items-center gap-2 font-bold text-slate-900">
              <MapPin className="size-4" /> Delivering to
            </p>
            <p className="mt-2 text-slate-600">
              {order.address.line1}
              {order.address.line2 ? `, ${order.address.line2}` : ''}, {order.address.city} {order.address.pincode}
            </p>
          </Card>
        )}
        <ReorderButton order={order} />
        {(order.status === 'PLACED' || order.status === 'PENDING_PAYMENT') && (
          <Button variant="outline" block className="text-rose-600" onClick={() => setCancelling(true)}>
            Cancel order
          </Button>
        )}
      </aside>

      <CancelModal order={order} open={cancelling} onClose={() => setCancelling(false)} />
      <RetryPayment order={order} open={retrying} onClose={() => setRetrying(false)} />
    </div>
  );
}

function RiderCard({ order }: { order: Order }) {
  const now = useNow(5000);
  const start = order.outForDeliveryAt ? new Date(order.outForDeliveryAt).getTime() : now.getTime();
  const eta = (order.deliveryEtaMinutes ?? 10) * 60_000 * 0.7;
  const progress = Math.min(0.97, (now.getTime() - start) / eta);
  const position = order.address ? interpolate(order.store, order.address, progress) : null;
  const minutesLeft = Math.max(1, Math.ceil((eta - (now.getTime() - start)) / 60_000));
  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-r from-brand-600 to-brand-700 p-5 text-white">
        <p className="text-sm font-semibold opacity-90">Arriving in</p>
        <p className="text-3xl font-extrabold">{minutesLeft} min</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/25">
          <div className="h-full rounded-full bg-accent-400 transition-all duration-1000" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-xs opacity-80">
          <span>🏪 {order.storeName}</span>
          <span>🏠 You</span>
        </div>
      </div>
      <div className="flex items-center gap-3 p-4">
        <span className="flex size-11 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <Bike className="size-5" />
        </span>
        <div className="flex-1">
          <p className="font-semibold text-slate-900">{order.rider?.name ?? 'Your delivery partner'}</p>
          <p className="text-xs text-slate-500">
            {position ? `Near ${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}` : 'On the way'}
          </p>
        </div>
        {order.rider?.phone && (
          <a href={`tel:${order.rider.phone}`}>
            <Button variant="outline" size="sm" icon={<Phone className="size-4" />}>
              Call
            </Button>
          </a>
        )}
      </div>
    </Card>
  );
}

function PickupCard({ order }: { order: Order }) {
  const ready = order.status === 'READY_FOR_PICKUP';
  return (
    <Card className="grid gap-5 p-5 sm:grid-cols-[auto_1fr]">
      <QRCode value={buildPickupUri(order.orderNumber, order.pickupCode!)} size={170} label="Pickup QR code" />
      <div>
        <Badge tone={ready ? 'green' : 'yellow'}>{ready ? 'Ready at the counter' : 'Being prepared'}</Badge>
        <p className="mt-2 text-sm text-slate-500">Pickup code</p>
        <p className="font-mono text-3xl font-extrabold tracking-[0.3em] text-slate-900">{order.pickupCode}</p>
        <p className="mt-2 text-sm text-slate-600">
          Slot {formatTime(order.scheduledFor)}–{formatTime(order.slotEnd)} at {order.store.name}. Show this QR or code at the pickup
          counter.
        </p>
        <p className="mt-1 text-xs text-slate-500">{order.store.addressLine}</p>
      </div>
    </Card>
  );
}

function ReorderButton({ order }: { order: Order }) {
  const add = useCart((s) => s.add);
  const setStore = useShop((s) => s.setStore);
  return (
    <Button
      variant="secondary"
      block
      icon={<RotateCcw className="size-4" />}
      onClick={async () => {
        setStore(order.storeId);
        for (const item of order.items) {
          const product = await publicApi
            .get<CatalogProduct>(`/catalog/products/${item.productId}`, { query: { storeId: order.storeId } })
            .catch(() => null);
          if (product && product.maxOrderQty > 0) {
            for (let i = 0; i < Math.min(item.quantity, product.maxOrderQty); i++) add(product, order.storeId);
          }
        }
        toast.success('Items added to your cart');
      }}
    >
      Order again
    </Button>
  );
}

function CancelModal({ order, open, onClose }: { order: Order; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => customerApi.post<Order>(`/orders/${order.id}/cancel`, { reason: 'Cancelled by customer' }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['order', order.id], updated);
      toast.success('Order cancelled', updated.paymentStatus === 'REFUNDED' ? 'Your refund is on its way.' : undefined);
      onClose();
    },
    onError: (error) => toast.error('Could not cancel', errorMessage(error)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cancel this order?"
      description="Paid orders are refunded to the original payment method."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep order
          </Button>
          <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>
            Cancel order
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">Orders can be cancelled until the store starts packing them.</p>
    </Modal>
  );
}

function RetryPayment({ order, open, onClose }: { order: Order; open: boolean; onClose: () => void }) {
  const [method, setMethod] = useState<MethodChoice | null>(null);
  const { pay, sheet } = usePayment();
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: async () => {
      const checkout = await customerApi.post<CheckoutResult>(`/orders/${order.id}/pay`, method);
      onClose();
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
      <Modal
        open={open}
        onClose={onClose}
        title={`Pay ${formatMoney(order.total)}`}
        footer={
          <Button disabled={!method} loading={retry.isPending} onClick={() => retry.mutate()}>
            Continue
          </Button>
        }
      >
        <PaymentMethodPicker channel={order.channel} value={method} onChange={setMethod} />
      </Modal>
      {sheet}
    </>
  );
}
