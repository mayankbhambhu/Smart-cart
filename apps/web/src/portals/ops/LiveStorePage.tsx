import {
  GATE_REASON_LABELS,
  SocketEvents,
  formatMoney,
  pluralize,
  timeAgo,
  type GateEventDto,
  type GateVerifyResult,
  type InStoreSession,
} from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, DoorOpen, ScanLine, ShoppingCart, XCircle } from 'lucide-react';
import { useState } from 'react';
import { ScannerModal } from '@/components/Scanner';
import { Badge, Button, Card, CardHeader, EmptyState, Input, Modal, PageLoader, Stat } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { toast } from '@/lib/toast';
import { cn, formatTime, useNow } from '@/lib/utils';
import { PageHeader } from './components';
import { useLiveInvalidate, useOps } from './hooks';

type LiveSession = InStoreSession & { customerName: string };

/** Scan & Go shoppers currently in the store, and the exit gates in real time. */
export default function LiveStorePage() {
  const ops = useOps();
  const queryClient = useQueryClient();
  useNow(30_000);
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['ops-sessions', ops.storeId],
    queryFn: () => ops.get<LiveSession[]>('/sessions'),
    refetchInterval: 30_000,
  });
  const { data: events = [] } = useQuery({
    queryKey: ['ops-gate-events', ops.storeId],
    queryFn: () => ops.get<GateEventDto[]>('/gate-events', { query: { limit: 40 } }),
  });
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(false);

  useLiveInvalidate([SocketEvents.SESSION_UPDATED], [['ops-sessions', ops.storeId]], 700);
  useSocketEvent<GateEventDto>('STAFF', SocketEvents.GATE_EVENT, (event) => {
    queryClient.setQueryData<GateEventDto[]>(['ops-gate-events', ops.storeId], (current = []) =>
      [event, ...current.filter((e) => e.id !== event.id)].slice(0, 40),
    );
    setFresh((s) => new Set(s).add(event.id));
    setTimeout(
      () =>
        setFresh((s) => {
          const next = new Set(s);
          next.delete(event.id);
          return next;
        }),
      1600,
    );
    if (event.result === 'DENIED') toast.error(`Gate denied at ${event.deviceName}`, GATE_REASON_LABELS[event.reason]);
  });

  const cartValue = sessions.reduce((sum, s) => sum + s.bill.total, 0);
  const items = sessions.reduce((sum, s) => sum + s.bill.itemCount, 0);
  const paired = sessions.filter((s) => s.cartDevice).length;
  const today = new Date().toDateString();
  const exitsToday = events.filter((e) => e.result === 'OPENED' && new Date(e.at).toDateString() === today).length;

  return (
    <div>
      <PageHeader
        title="Live floor & exit gates"
        subtitle="Every scan deducts stock instantly. Shoppers pay in the app and the gate checks their digital receipt."
        actions={
          <Button icon={<ScanLine className="size-4" />} onClick={() => setChecking(true)}>
            Check an exit pass
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Shoppers in store" value={sessions.length} icon={<ShoppingCart className="size-4" />} tone="success" />
        <Stat label="Value in carts" value={formatMoney(cartValue)} hint={`${items} items`} />
        <Stat label="Smart carts in use" value={paired} />
        <Stat label="Gate exits today" value={exitsToday} icon={<DoorOpen className="size-4" />} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_400px]">
        <Card>
          <CardHeader title="Scan & Go sessions" subtitle="Updates live as shoppers scan" />
          {isLoading ? (
            <PageLoader />
          ) : sessions.length === 0 ? (
            <EmptyState icon="🛒" title="No one is shopping with Scan & Go right now" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {sessions.map((session) => (
                <li key={session.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">{session.customerName}</p>
                      <p className="text-xs text-slate-500">
                        Started {formatTime(session.startedAt)} · last scan {timeAgo(session.lastActivityAt)}
                        {session.listId && ' · shopping from a family list'}
                      </p>
                    </div>
                    {session.cartDevice && <Badge tone="violet">🛒 {session.cartDevice.name}</Badge>}
                    <Badge tone={session.status === 'CHECKOUT' ? 'yellow' : 'green'}>
                      {session.status === 'CHECKOUT' ? 'Paying' : 'Shopping'}
                    </Badge>
                    <span className="tabular w-24 text-right font-bold text-slate-900">{formatMoney(session.bill.total)}</span>
                  </div>
                  {session.items.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {session.items.slice(0, 10).map((item) => (
                        <span
                          key={item.id}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-50 py-0.5 pr-2 pl-0.5 text-xs text-slate-700"
                          title={item.name}
                        >
                          <span
                            className="flex size-6 items-center justify-center rounded-md text-sm"
                            style={{ backgroundColor: item.color }}
                          >
                            {item.emoji}
                          </span>
                          {item.quantity > 1 && `${item.quantity}×`} {item.name.length > 22 ? `${item.name.slice(0, 22)}…` : item.name}
                        </span>
                      ))}
                      {session.items.length > 10 && <span className="text-xs text-slate-500">+{session.items.length - 10} more</span>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Gate activity" subtitle="Exit-pass checks from gates and staff phones" />
          <ul className="max-h-[640px] divide-y divide-slate-100 overflow-y-auto">
            {events.length === 0 && <li className="px-5 py-8 text-center text-sm text-slate-500">No gate activity yet.</li>}
            {events.map((event) => (
              <li key={event.id} className={cn('flex items-start gap-3 px-5 py-3', fresh.has(event.id) && 'animate-flash')}>
                {event.result === 'OPENED' ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand-600" />
                ) : (
                  <XCircle className="mt-0.5 size-5 shrink-0 text-rose-600" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {event.result === 'OPENED' ? 'Gate opened' : 'Denied'}
                    {event.orderNumber && <span className="font-mono font-normal text-slate-500"> · {event.orderNumber}</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {event.customerName ? `${event.customerName} · ` : ''}
                    {event.result === 'DENIED' ? GATE_REASON_LABELS[event.reason] : event.deviceName}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-slate-400">{formatTime(event.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <ManualGateCheck open={checking} onClose={() => setChecking(false)} />
    </div>
  );
}

/** A staff member's phone acting as a handheld exit scanner (e.g. when a gate is down). */
function ManualGateCheck({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ops = useOps();
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState('');
  const [result, setResult] = useState<GateVerifyResult | null>(null);
  const verify = useMutation({
    mutationFn: (value: string) => ops.post<GateVerifyResult>('/gate/verify', { code: value }),
    onSuccess: setResult,
    onError: (error) => toast.error('Check failed', errorMessage(error)),
  });
  const close = () => {
    setResult(null);
    setCode('');
    onClose();
  };
  return (
    <>
      <Modal
        open={open && !scanning}
        onClose={close}
        title="Check an exit pass"
        description="Scan the QR or barcode on the shopper's phone."
      >
        {result ? (
          <div className={cn('rounded-2xl p-6 text-center', result.open ? 'bg-brand-50' : 'bg-rose-50')}>
            {result.open ? (
              <CheckCircle2 className="mx-auto size-14 text-brand-600" />
            ) : (
              <XCircle className="mx-auto size-14 text-rose-600" />
            )}
            <p className={cn('mt-2 text-xl font-extrabold', result.open ? 'text-brand-800' : 'text-rose-700')}>
              {result.open ? 'Paid. Let them through' : 'Do not let through'}
            </p>
            <p className="mt-1 text-sm text-slate-600">{result.message}</p>
            {result.order && (
              <p className="mt-3 text-sm text-slate-700">
                {result.order.customerName} · {result.order.orderNumber} · {pluralize(result.order.itemCount, 'item')} ·{' '}
                {formatMoney(result.order.total)}
              </p>
            )}
            <Button className="mt-5" onClick={() => setResult(null)}>
              Check another
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Button block size="lg" icon={<ScanLine className="size-5" />} onClick={() => setScanning(true)}>
              Scan with camera
            </Button>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim()) verify.mutate(code.trim());
              }}
            >
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Or type the code: SC7K 2M9Q …"
                className="font-mono"
              />
              <Button type="submit" variant="dark" loading={verify.isPending}>
                Check
              </Button>
            </form>
          </div>
        )}
      </Modal>
      <ScannerModal
        open={scanning}
        onClose={() => setScanning(false)}
        title="Scan exit pass"
        hint="QR code or barcode on the shopper's receipt"
        onScan={(value) => {
          setScanning(false);
          verify.mutate(value);
        }}
      />
    </>
  );
}
