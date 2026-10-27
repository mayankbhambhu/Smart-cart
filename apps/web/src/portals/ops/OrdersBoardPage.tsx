import {
  ORDER_STAFF_TRANSITIONS,
  ORDER_STATUS_LABELS,
  SocketEvents,
  formatMoney,
  formatPhone,
  parsePickupUri,
  planRoute,
  pluralize,
  timeAgo,
  type Order,
  type OrderChannel,
  type OrderStatus,
  type StoreDetail,
} from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, ChevronLeft, ChevronRight, MapPin, PackageCheck, Phone, QrCode, Route, ScanLine, User } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ChannelBadge, OrderStatusBadge } from '@/components/orders';
import { LocationTag, ProductArt } from '@/components/product';
import { ScannerModal } from '@/components/Scanner';
import { StoreMap } from '@/components/StoreMap';
import { Badge, Button, Card, Drawer, Field, Input, Modal, PageLoader, Segmented, Select } from '@/components/ui';
import { errorMessage, staffApi } from '@/lib/api';
import { toast } from '@/lib/toast';
import { addDays, cn, formatDate, formatTime, localDate } from '@/lib/utils';
import { PageHeader } from './components';
import { useEmployees, useLiveInvalidate, useOps } from './hooks';

type ChannelFilter = 'ALL' | Exclude<OrderChannel, 'IN_STORE'>;

const COLUMNS: { key: string; title: string; statuses: OrderStatus[] }[] = [
  { key: 'new', title: 'New', statuses: ['PLACED'] },
  { key: 'packing', title: 'Packing', statuses: ['PACKING'] },
  { key: 'ready', title: 'Ready / on the way', statuses: ['READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'] },
  { key: 'done', title: 'Completed', statuses: ['DELIVERED', 'PICKED_UP'] },
];

const ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  PACKING: 'Start packing',
  READY_FOR_PICKUP: 'Ready for pickup',
  OUT_FOR_DELIVERY: 'Hand to rider',
  DELIVERED: 'Mark delivered',
  PICKED_UP: 'Hand over',
};

export default function OrdersBoardPage() {
  const ops = useOps();
  const [channel, setChannel] = useState<ChannelFilter>('ALL');
  const [date, setDate] = useState(localDate());
  const [openId, setOpenId] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const key = ['ops-orders', ops.storeId, channel, date];
  const { data: orders = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () =>
      ops.get<Order[]>('/orders', {
        query: {
          channel: channel === 'ALL' ? undefined : channel,
          status: 'PLACED,PACKING,READY_FOR_PICKUP,OUT_FOR_DELIVERY,DELIVERED,PICKED_UP',
          date,
          limit: 200,
        },
      }),
    refetchInterval: 60_000,
  });
  useLiveInvalidate([SocketEvents.ORDER_CHANGED], [['ops-orders', ops.storeId]], 800);

  const online = orders.filter((o) => o.channel !== 'IN_STORE');
  const opened = online.find((o) => o.id === openId) ?? null;

  return (
    <div>
      <PageHeader
        title="Orders & pickups"
        subtitle="Pack delivery orders and scheduled pickups. Pick lists are sorted in aisle order."
        actions={
          <Button icon={<QrCode className="size-4" />} onClick={() => setVerifying(true)}>
            Verify pickup
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          value={channel}
          onChange={setChannel}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'DELIVERY', label: '⚡ Delivery' },
            { value: 'PICKUP', label: '🛍️ Pickup' },
          ]}
        />
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
          <button
            type="button"
            className="rounded-lg p-1.5 hover:bg-slate-100"
            aria-label="Previous day"
            onClick={() => setDate(addDays(date, -1))}
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-32 text-center text-sm font-semibold">
            {date === localDate() ? 'Today' : formatDate(date, { weekday: 'short' })}
          </span>
          <button
            type="button"
            className="rounded-lg p-1.5 hover:bg-slate-100"
            aria-label="Next day"
            onClick={() => setDate(addDays(date, 1))}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((column) => {
            const items = online.filter((o) => column.statuses.includes(o.status));
            return (
              <div key={column.key} className="rounded-2xl bg-slate-100/70 p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <p className="text-sm font-bold text-slate-700">{column.title}</p>
                  <Badge tone="gray">{items.length}</Badge>
                </div>
                <div className="space-y-3">
                  {items.length === 0 && <p className="py-6 text-center text-xs text-slate-400">Nothing here</p>}
                  {items.map((order) => (
                    <OrderCard key={order.id} order={order} onOpen={() => setOpenId(order.id)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <OrderDrawer order={opened} onClose={() => setOpenId(null)} />
      <VerifyPickupModal open={verifying} onClose={() => setVerifying(false)} />
    </div>
  );
}

interface StatusInput {
  orderId: string;
  status: OrderStatus;
  note?: string;
  pickupCode?: string;
  riderName?: string;
  riderPhone?: string;
}

function useStatusMutation() {
  const ops = useOps();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, ...input }: StatusInput) => ops.post<Order>(`/orders/${orderId}/status`, input),
    onSuccess: (updated) => {
      toast.success(`${updated.orderNumber}: ${ORDER_STATUS_LABELS[updated.status]}`);
      void queryClient.invalidateQueries({ queryKey: ['ops-orders', ops.storeId] });
    },
    onError: (error) => toast.error('Could not update the order', errorMessage(error)),
  });
}

function OrderCard({ order, onOpen }: { order: Order; onOpen: () => void }) {
  const next = (ORDER_STAFF_TRANSITIONS[order.channel][order.status] ?? []).filter((s) => s !== 'CANCELLED');
  const status = useStatusMutation();
  const [riderFor, setRiderFor] = useState(false);
  const slot = order.channel === 'PICKUP' ? `${formatTime(order.scheduledFor)}–${formatTime(order.slotEnd)}` : null;
  const ageMinutes = order.placedAt ? (Date.now() - new Date(order.placedAt).getTime()) / 60_000 : 0;
  const late = order.channel === 'DELIVERY' && (order.status === 'PLACED' || order.status === 'PACKING') && ageMinutes > 6;

  return (
    <Card className={cn('p-3', late && 'border-amber-300 ring-1 ring-amber-200')}>
      <button type="button" className="w-full text-left" onClick={onOpen}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-bold text-slate-900">{order.orderNumber}</span>
          <ChannelBadge channel={order.channel} />
        </div>
        <p className="mt-1 truncate text-sm text-slate-700">{order.customer?.name ?? 'Customer'}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
          <span>
            {pluralize(order.itemCount, 'item')} · {formatMoney(order.total)}
          </span>
          {slot ? (
            <span className="font-semibold text-sky-700">Slot {slot}</span>
          ) : (
            <span className={cn(late && 'font-semibold text-amber-700')}>{order.placedAt ? timeAgo(order.placedAt) : ''}</span>
          )}
        </div>
        {order.picker && (
          <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
            <User className="size-3" /> {order.picker.name}
          </p>
        )}
        {order.paymentMethod === 'CASH_ON_DELIVERY' && (
          <Badge tone="yellow" className="mt-1.5">
            Collect {formatMoney(order.total)} cash
          </Badge>
        )}
      </button>
      {next.length > 0 && (
        <div className="mt-3 flex gap-2">
          {next.map((s) => (
            <Button
              key={s}
              size="sm"
              block
              variant={s === 'PICKED_UP' ? 'outline' : 'primary'}
              loading={status.isPending && status.variables?.status === s}
              onClick={() => {
                if (s === 'OUT_FOR_DELIVERY') setRiderFor(true);
                else if (s === 'PICKED_UP') onOpen();
                else status.mutate({ orderId: order.id, status: s });
              }}
            >
              {ACTION_LABELS[s] ?? ORDER_STATUS_LABELS[s]}
            </Button>
          ))}
        </div>
      )}
      <RiderModal
        open={riderFor}
        onClose={() => setRiderFor(false)}
        onSubmit={(rider) =>
          status.mutate({ orderId: order.id, status: 'OUT_FOR_DELIVERY', ...rider }, { onSuccess: () => setRiderFor(false) })
        }
      />
    </Card>
  );
}

function RiderModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (rider: { riderName?: string; riderPhone?: string }) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Hand to rider"
      description="The customer sees the rider's name and can call them."
      footer={
        <Button
          icon={<Bike className="size-4" />}
          onClick={() => onSubmit({ riderName: name || undefined, riderPhone: phone || undefined })}
        >
          Out for delivery
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="Rider name" hint="Leave empty if you deliver it yourself.">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Imran Khan" />
        </Field>
        <Field label="Rider phone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98450 12345" />
        </Field>
      </div>
    </Modal>
  );
}

function OrderDrawer({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const ops = useOps();
  const queryClient = useQueryClient();
  const { data: employees = [] } = useEmployees(ops.storeId);
  const { data: store } = useQuery({
    queryKey: ['ops-settings', ops.storeId],
    queryFn: () => ops.get<StoreDetail>('/settings'),
    staleTime: 5 * 60_000,
  });
  const [showRoute, setShowRoute] = useState(false);
  const [code, setCode] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const status = useStatusMutation();

  const plan = useMemo(() => {
    if (!order || !store) return null;
    // Pickers start at the packing counter and bring the basket back to it.
    const counter = store.layout.zones.find((z) => z.kind === 'PICKUP');
    const point = counter ? { x: counter.x + counter.width / 2, y: counter.y } : undefined;
    return planRoute(
      store.layout,
      order.items.map((item) => ({ location: item.location, payload: item })),
      { start: point, end: point },
    );
  }, [order, store]);

  const assign = useMutation({
    mutationFn: (employeeId: string | null) => ops.post<Order>(`/orders/${order!.id}/picker`, { employeeId }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['ops-orders', ops.storeId] }),
    onError: (error) => toast.error('Could not assign', errorMessage(error)),
  });

  const pickers = employees.filter(
    (e) =>
      e.status === 'ACTIVE' &&
      (e.department === 'PICKING' || e.department === 'FLOOR' || e.department === 'WAREHOUSE' || e.department === 'DELIVERY'),
  );
  const canCancel = order ? (ORDER_STAFF_TRANSITIONS[order.channel][order.status] ?? []).includes('CANCELLED') : false;

  return (
    <Drawer
      open={Boolean(order)}
      onClose={onClose}
      width="max-w-xl"
      title={order && <span className="font-mono">{order.orderNumber}</span>}
    >
      {order && (
        <div className="space-y-5 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <ChannelBadge channel={order.channel} long />
            <OrderStatusBadge status={order.status} />
            <Badge tone={order.paymentStatus === 'PAID' ? 'green' : 'yellow'}>
              {order.paymentStatus === 'PAID'
                ? 'Paid'
                : order.paymentMethod === 'CASH_ON_DELIVERY'
                  ? 'Cash on delivery'
                  : order.paymentStatus.toLowerCase()}
            </Badge>
          </div>

          <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Customer</p>
              <p className="font-semibold text-slate-900">{order.customer?.name}</p>
              {order.customer?.phone && (
                <a href={`tel:${order.customer.phone}`} className="flex items-center gap-1 text-brand-700">
                  <Phone className="size-3.5" /> {formatPhone(order.customer.phone)}
                </a>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">{order.channel === 'PICKUP' ? 'Pickup slot' : 'Deliver to'}</p>
              {order.channel === 'PICKUP' ? (
                <p className="font-semibold text-slate-900">
                  {formatDate(order.scheduledFor, { weekday: 'short' })}, {formatTime(order.scheduledFor)}–{formatTime(order.slotEnd)}
                </p>
              ) : (
                order.address && (
                  <p className="text-slate-700">
                    <MapPin className="mr-1 inline size-3.5" />
                    {order.address.line1}
                    {order.address.line2 ? `, ${order.address.line2}` : ''}, {order.address.pincode}
                    {order.address.landmark && <span className="block text-xs text-slate-500">Near {order.address.landmark}</span>}
                  </p>
                )
              )}
            </div>
            {order.notes && <p className="text-amber-800 sm:col-span-2">Note: “{order.notes}”</p>}
          </div>

          <Field label="Picker">
            <Select value={order.picker?.id ?? ''} onChange={(e) => assign.mutate(e.target.value || null)}>
              <option value="">Unassigned</option>
              {pickers.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {e.department.toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="font-bold text-slate-900">Pick list · {pluralize(order.itemCount, 'item')}</p>
              <Button size="xs" variant="ghost" icon={<Route className="size-3.5" />} onClick={() => setShowRoute((s) => !s)}>
                {showRoute ? 'Hide route' : 'Show route'}
              </Button>
            </div>
            {showRoute && store && plan && (
              <div className="mb-3 rounded-2xl border border-slate-200 p-2">
                <StoreMap layout={store.layout} plan={plan} />
                <p className="px-2 pt-1 text-xs text-slate-500">
                  {plan.stops.length} stops · {Math.round(plan.totalDistance)} m · ~{Math.max(1, Math.round(plan.estimatedMinutes))} min
                </p>
              </div>
            )}
            <ol className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
              {(plan ? [...plan.stops.flatMap((s) => s.items), ...plan.unlocated] : order.items).map((item, i) => (
                <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-5 text-center text-xs font-bold text-slate-400">{i + 1}</span>
                  <ProductArt emoji={item.emoji} color={item.color} imageUrl={item.imageUrl} size="xs" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{item.name}</p>
                    <p className="text-xs text-slate-500">
                      {item.unit} · {item.barcode}
                    </p>
                  </div>
                  <LocationTag location={item.location} />
                  <span className="w-10 text-right text-sm font-bold">×{item.quantity}</span>
                </li>
              ))}
            </ol>
          </div>

          {order.status === 'READY_FOR_PICKUP' && (
            <form
              className="space-y-2 rounded-2xl border border-sky-200 bg-sky-50 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                status.mutate({ orderId: order.id, status: 'PICKED_UP', pickupCode: code.trim().toUpperCase() }, { onSuccess: onClose });
              }}
            >
              <p className="font-semibold text-sky-900">Hand over to the customer</p>
              <p className="text-xs text-sky-800">Ask for the pickup code in their app (or use “Verify pickup” to scan the QR).</p>
              <div className="flex gap-2">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="Pickup code"
                  className="font-mono tracking-widest uppercase"
                  maxLength={8}
                />
                <Button type="submit" icon={<PackageCheck className="size-4" />} loading={status.isPending} disabled={code.length < 4}>
                  Confirm
                </Button>
              </div>
            </form>
          )}

          <div className="rounded-2xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between">
              <span>Items</span>
              <span className="tabular">{formatMoney(order.bill.itemTotal)}</span>
            </div>
            {order.bill.couponDiscount > 0 && (
              <div className="flex justify-between text-brand-700">
                <span>Coupon {order.couponCode}</span>
                <span className="tabular">−{formatMoney(order.bill.couponDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Fees &amp; tip</span>
              <span className="tabular">
                {formatMoney(order.bill.deliveryFee + order.bill.handlingFee + order.bill.smallCartFee + order.bill.tip)}
              </span>
            </div>
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-bold">
              <span>Total</span>
              <span className="tabular">{formatMoney(order.total)}</span>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-bold text-slate-900">History</p>
            <ul className="space-y-1.5 text-xs text-slate-600">
              {order.events.map((event, i) => (
                <li key={i}>
                  <span className="font-semibold">{formatTime(event.at)}</span> · {ORDER_STATUS_LABELS[event.status]}
                  {event.actorName ? ` by ${event.actorName}` : ''}
                  {event.note ? ` (${event.note})` : ''}
                </li>
              ))}
            </ul>
          </div>

          {canCancel && (
            <Button variant="ghost" className="text-rose-600" onClick={() => setCancelling(true)}>
              Cancel order
            </Button>
          )}
          <Modal
            open={cancelling}
            onClose={() => setCancelling(false)}
            title={`Cancel ${order.orderNumber}?`}
            description="Reserved stock goes back to the shelf and paid orders are refunded."
            footer={
              <Button
                variant="danger"
                loading={status.isPending}
                disabled={reason.trim().length < 3}
                onClick={() =>
                  status.mutate(
                    { orderId: order.id, status: 'CANCELLED', note: reason.trim() },
                    {
                      onSuccess: () => {
                        setCancelling(false);
                        onClose();
                      },
                    },
                  )
                }
              >
                Cancel order
              </Button>
            }
          >
            <Field label="Reason (shown to the customer)">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Item out of stock" />
            </Field>
          </Modal>
        </div>
      )}
    </Drawer>
  );
}

function VerifyPickupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ops = useOps();
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [code, setCode] = useState('');
  const verify = useMutation({
    mutationFn: (input: { scanned?: string; orderNumber?: string; pickupCode?: string }) =>
      staffApi.post<Order>(ops.path('/orders/verify-pickup'), input),
    onSuccess: (order) => {
      toast.success(
        `Handed over ${order.orderNumber}`,
        `${pluralize(order.itemCount, 'item')} to ${order.customer?.name ?? 'the customer'}`,
      );
      void queryClient.invalidateQueries({ queryKey: ['ops-orders', ops.storeId] });
      setOrderNumber('');
      setCode('');
      onClose();
    },
    onError: (error) => toast.error('Pickup not verified', errorMessage(error)),
  });
  return (
    <>
      <Modal
        open={open && !scanning}
        onClose={onClose}
        title="Verify a pickup"
        description="Scan the QR code in the customer's app, or type the order number and pickup code."
        footer={
          <Button
            loading={verify.isPending}
            disabled={!orderNumber || code.length < 4}
            onClick={() => verify.mutate({ orderNumber, pickupCode: code })}
          >
            Verify &amp; hand over
          </Button>
        }
      >
        <Button block variant="outline" size="lg" icon={<ScanLine className="size-5" />} onClick={() => setScanning(true)}>
          Scan customer's QR
        </Button>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Order number">
            <Input
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
              placeholder="SC-24101-0042"
              className="font-mono"
            />
          </Field>
          <Field label="Pickup code">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="K7M2"
              className="font-mono tracking-widest"
              maxLength={8}
            />
          </Field>
        </div>
      </Modal>
      <ScannerModal
        open={scanning}
        onClose={() => setScanning(false)}
        title="Scan pickup QR"
        hint="Ask the customer to open the order in the SmartCart app"
        manualPlaceholder="Or paste the scanned text"
        onScan={(value) => {
          setScanning(false);
          const parsed = parsePickupUri(value);
          if (!parsed) {
            toast.error('That is not a SmartCart pickup code');
            return;
          }
          verify.mutate({ scanned: value });
        }}
      />
    </>
  );
}
