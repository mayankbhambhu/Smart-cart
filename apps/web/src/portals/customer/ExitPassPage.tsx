import { SocketEvents, formatMoney, groupCode, pluralize, type ExitPass, type Order } from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, DoorOpen, Receipt, RefreshCw, ShieldCheck, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Barcode, QRCode } from '@/components/codes';
import { ProductArt } from '@/components/product';
import { Badge, Button, Card, ErrorState, PageLoader, Segmented } from '@/components/ui';
import { customerApi, errorMessage } from '@/lib/api';
import { useRoom, useSocketEvent } from '@/lib/socket';
import { toast } from '@/lib/toast';
import { formatDateTime, formatTime, useNow } from '@/lib/utils';
import { BillRows } from './CustomerLayout';

/**
 * Digital receipt + exit pass. The QR / barcode holds a one-time token that the
 * exit gate verifies against the payment; the gate opens and the pass is spent.
 */
export default function ExitPassPage() {
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
  const [pass, setPass] = useState<ExitPass | null>(null);
  const [opened, setOpened] = useState(false);
  const [format, setFormat] = useState<'qr' | 'barcode'>('qr');

  const reveal = useMutation({
    mutationFn: () => customerApi.post<ExitPass>(`/orders/${orderId}/exit-pass`),
    onSuccess: setPass,
    onError: (err) => toast.error('Could not load your exit pass', errorMessage(err)),
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
      setPass((current) => ({
        ...event.exitPass!,
        token: event.exitPass!.status === 'ACTIVE' ? (current?.token ?? null) : null,
        uri: event.exitPass!.status === 'ACTIVE' ? (current?.uri ?? null) : null,
      }));
      if (event.exitPass.status === 'USED') {
        setOpened(true);
        navigator.vibrate?.([80, 40, 80]);
      }
    }
    void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
  });

  if (isLoading) return <PageLoader />;
  if (error || !order) return <ErrorState error={error} retry={() => void refetch()} />;

  const status = pass?.status ?? order.exitPass?.status ?? null;

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div>
        {!paid ? (
          <Card className="p-6 text-center">
            <p className="text-4xl">💳</p>
            <p className="mt-2 font-bold text-slate-900">Payment not completed</p>
            <p className="mt-1 text-sm text-slate-500">Your exit pass appears here as soon as the payment goes through.</p>
            <Link to="/instore/session">
              <Button className="mt-4">Back to my cart</Button>
            </Link>
          </Card>
        ) : opened || status === 'USED' ? (
          <GateOpened order={order} usedAt={pass?.usedAt ?? order.exitPass?.usedAt ?? null} />
        ) : status === 'ACTIVE' && pass?.token ? (
          <ActivePass
            pass={pass}
            order={order}
            format={format}
            setFormat={setFormat}
            onRefresh={() => reveal.mutate()}
            refreshing={reveal.isPending}
          />
        ) : status === 'EXPIRED' || status === 'REVOKED' ? (
          <Card className="p-6 text-center">
            <p className="text-4xl">⌛</p>
            <p className="mt-2 font-bold text-slate-900">This exit pass has {status === 'EXPIRED' ? 'expired' : 'been revoked'}</p>
            <p className="mt-1 text-sm text-slate-500">
              Your payment is safe. Show this receipt to a staff member at the exit and they will let you through.
            </p>
            <Badge tone="gray" className="mt-3 font-mono">
              Order {order.orderNumber} · ref …{pass?.hint ?? order.exitPass?.hint}
            </Badge>
          </Card>
        ) : (
          <PageLoader label="Preparing your exit pass…" />
        )}
      </div>

      <Card>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="flex items-center gap-2 font-bold text-slate-900">
              <Receipt className="size-4" /> Digital receipt
            </p>
            <p className="text-sm text-slate-500">
              {order.storeName} · {formatDateTime(order.placedAt ?? order.createdAt)}
            </p>
          </div>
          <Badge tone={paid ? 'green' : 'yellow'}>{paid ? 'Paid' : 'Unpaid'}</Badge>
        </div>
        <ul className="divide-y divide-slate-100">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-5 py-2.5">
              <ProductArt emoji={item.emoji} color={item.color} imageUrl={item.imageUrl} size="xs" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-900">{item.name}</p>
                <p className="text-xs text-slate-500">
                  {item.quantity} × {formatMoney(item.unitPrice)}
                </p>
              </div>
              <span className="tabular text-sm font-semibold">{formatMoney(item.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <div className="border-t border-slate-100 px-5 pb-5">
          <BillRows bill={order.bill} />
          <p className="mt-3 text-xs text-slate-500">
            Order {order.orderNumber} · paid by {order.paymentMethod?.replaceAll('_', ' ').toLowerCase()}
            {order.couponCode ? ` · coupon ${order.couponCode}` : ''}
          </p>
        </div>
      </Card>
    </div>
  );
}

function ActivePass({
  pass,
  order,
  format,
  setFormat,
  onRefresh,
  refreshing,
}: {
  pass: ExitPass;
  order: Order;
  format: 'qr' | 'barcode';
  setFormat: (format: 'qr' | 'barcode') => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const now = useNow(1000);
  const msLeft = new Date(pass.expiresAt).getTime() - now.getTime();
  const minutes = Math.max(0, Math.floor(msLeft / 60_000));
  const seconds = Math.max(0, Math.floor((msLeft % 60_000) / 1000));
  return (
    <Card className="overflow-hidden">
      <div className="bg-brand-600 px-5 py-4 text-white">
        <p className="flex items-center gap-2 text-sm font-semibold opacity-90">
          <ShieldCheck className="size-4" /> Payment verified
        </p>
        <p className="text-2xl font-extrabold">Scan at the exit gate</p>
        <p className="text-sm opacity-80">
          {pluralize(order.itemCount, 'item')} · {formatMoney(order.total)}
        </p>
      </div>
      <div className="flex flex-col items-center gap-4 p-6">
        <Segmented
          value={format}
          onChange={setFormat}
          options={[
            { value: 'qr', label: 'QR code' },
            { value: 'barcode', label: 'Barcode' },
          ]}
        />
        {format === 'qr' ? (
          <QRCode value={pass.uri ?? pass.token!} size={260} label="Exit pass QR code" className="border border-slate-200 p-2" />
        ) : (
          <div className="w-full rounded-xl border border-slate-200 p-3">
            <Barcode value={pass.token!} height={90} />
          </div>
        )}
        <p className="font-mono text-sm font-bold tracking-wider text-slate-700">{groupCode(pass.token!)}</p>
        <div className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-4 py-2 text-sm">
          <span className="flex items-center gap-1.5 text-slate-500">
            <Sun className="size-4" /> Turn up your screen brightness
          </span>
          <span className="tabular font-semibold text-slate-900">
            {minutes}:{String(seconds).padStart(2, '0')} left
          </span>
        </div>
        <div className="flex w-full items-center justify-between gap-2">
          <Button variant="ghost" size="sm" icon={<RefreshCw className="size-4" />} loading={refreshing} onClick={onRefresh}>
            New code
          </Button>
          <Link to={`/devices/gate?store=${order.storeId}`} target="_blank" className="text-xs font-semibold text-brand-700">
            Demo: open the gate simulator →
          </Link>
        </div>
        <p className="text-center text-xs text-slate-400">
          One-time pass. A screenshot stops working once it is used or a new code is shown.
        </p>
      </div>
    </Card>
  );
}

function GateOpened({ order, usedAt }: { order: Order; usedAt: string | null }) {
  return (
    <Card className="overflow-hidden text-center">
      <div className="bg-gradient-to-b from-brand-500 to-brand-700 px-6 py-10 text-white">
        <CheckCircle2 className="mx-auto size-16" />
        <p className="mt-3 text-2xl font-extrabold">Gate opened</p>
        <p className="mt-1 text-white/80">Thanks for shopping at {order.storeName}!</p>
      </div>
      <div className="space-y-2 p-6 text-sm text-slate-600">
        <p className="flex items-center justify-center gap-2">
          <DoorOpen className="size-4" /> Exited at {formatTime(usedAt)}
        </p>
        <p>
          You saved <strong className="text-brand-700">{formatMoney(order.bill.totalSavings)}</strong> and skipped the queue.
        </p>
        <Link to="/orders">
          <Button variant="outline" className="mt-3">
            Purchase history
          </Button>
        </Link>
      </div>
    </Card>
  );
}
