import {
  ORDER_CHANNEL_LABELS,
  ORDER_FLOW,
  ORDER_STATUS_LABELS,
  type OrderChannel,
  type OrderEvent,
  type OrderStatus,
} from '@smartcart/shared';
import { Check } from 'lucide-react';
import { Badge } from '@/components/ui';
import { cn, formatTime } from '@/lib/utils';

const statusTone: Record<OrderStatus, Parameters<typeof Badge>[0]['tone']> = {
  PENDING_PAYMENT: 'yellow',
  PLACED: 'blue',
  PACKING: 'violet',
  READY_FOR_PICKUP: 'orange',
  OUT_FOR_DELIVERY: 'orange',
  DELIVERED: 'green',
  PICKED_UP: 'green',
  COMPLETED: 'green',
  CANCELLED: 'red',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={statusTone[status]}>{ORDER_STATUS_LABELS[status]}</Badge>;
}

const channelTone: Record<OrderChannel, Parameters<typeof Badge>[0]['tone']> = { DELIVERY: 'green', PICKUP: 'blue', IN_STORE: 'violet' };
const channelShort: Record<OrderChannel, string> = { DELIVERY: '⚡ Delivery', PICKUP: '🛍️ Pickup', IN_STORE: '📱 Scan & Go' };

export function ChannelBadge({ channel, long }: { channel: OrderChannel; long?: boolean }) {
  return <Badge tone={channelTone[channel]}>{long ? ORDER_CHANNEL_LABELS[channel] : channelShort[channel]}</Badge>;
}

/** Progress steps for an order, filled from its event history. */
export function OrderProgress({ channel, status, events }: { channel: OrderChannel; status: OrderStatus; events: OrderEvent[] }) {
  if (status === 'CANCELLED') {
    return <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">This order was cancelled.</p>;
  }
  const flow = ORDER_FLOW[channel];
  const reachedIndex = flow.indexOf(status);
  return (
    <ol className="relative space-y-5">
      {flow.map((step, index) => {
        const event = events.find((e) => e.status === step);
        const done = index <= reachedIndex;
        const current = index === reachedIndex;
        return (
          <li key={step} className="relative flex gap-3">
            {index < flow.length - 1 && (
              <span
                className={cn('absolute top-7 left-3.5 h-[calc(100%-4px)] w-0.5', index < reachedIndex ? 'bg-brand-500' : 'bg-slate-200')}
              />
            )}
            <span
              className={cn(
                'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2',
                done ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white',
                current && 'ring-4 ring-brand-100',
              )}
            >
              {done && <Check className="size-4" strokeWidth={3} />}
            </span>
            <div className="pt-0.5">
              <p className={cn('text-sm font-semibold', done ? 'text-slate-900' : 'text-slate-400')}>{ORDER_STATUS_LABELS[step]}</p>
              {event && (
                <p className="text-xs text-slate-500">
                  {formatTime(event.at)}
                  {event.note ? ` · ${event.note}` : ''}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
