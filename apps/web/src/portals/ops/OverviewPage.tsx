import {
  GATE_REASON_LABELS,
  SocketEvents,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  timeAgo,
  type OpsOverview,
  type Task,
} from '@smartcart/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Boxes,
  ClipboardCheck,
  DoorOpen,
  IndianRupee,
  ShoppingBag,
  ShoppingCart,
  Siren,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { hourLabel } from '@/components/charts';
import { Badge, Card, CardHeader, PageLoader, Stat } from '@/components/ui';
import { useSession } from '@/lib/auth';
import { cn, formatDate, formatTime } from '@/lib/utils';
import { ClockCard, PageHeader, PriorityBadge, TaskStatusBadge } from './components';
import { useLiveInvalidate, useOps } from './hooks';

export default function OverviewPage() {
  const ops = useOps();
  const session = useSession('STAFF')!;
  const { data, isLoading } = useQuery({
    queryKey: ['ops-overview', ops.storeId],
    queryFn: () => ops.get<OpsOverview>('/overview'),
    refetchInterval: 60_000,
  });
  const { data: myTasks = [] } = useQuery({
    queryKey: ['tasks', ops.storeId, 'mine-open'],
    queryFn: () => ops.get<Task[]>('/tasks', { query: { scope: 'mine', status: 'TODO,IN_PROGRESS,REOPENED', limit: 6 } }),
  });
  useLiveInvalidate(
    [
      SocketEvents.ORDER_CHANGED,
      SocketEvents.ALERT_CHANGED,
      SocketEvents.GATE_EVENT,
      SocketEvents.SESSION_UPDATED,
      SocketEvents.ATTENDANCE_CHANGED,
      SocketEvents.TASK_CHANGED,
    ],
    [
      ['ops-overview', ops.storeId],
      ['tasks', ops.storeId],
    ],
    3000,
  );

  if (isLoading || !data) return <PageLoader />;
  const delta = (today: number, before: number) => (before > 0 ? ((today - before) / before) * 100 : null);
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${session.user.name.split(' ')[0]}`}
        subtitle={`${ops.membership.storeName} · ${formatDate(data.date, { weekday: 'long' })}`}
      />

      {ops.isSupervisor && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Net sales today"
            value={formatMoney(data.today.netSales)}
            delta={delta(data.today.netSales, data.yesterday.netSales)}
            hint="vs this time yesterday"
            icon={<IndianRupee className="size-4" />}
            tone="success"
          />
          <Stat
            label="Gross profit"
            value={formatMoney(data.today.grossProfit)}
            hint={data.today.netSales > 0 ? `${((data.today.grossProfit / data.today.netSales) * 100).toFixed(1)}% margin` : undefined}
            icon={<TrendingUp className="size-4" />}
          />
          <Stat
            label="Orders"
            value={formatNumber(data.today.orders)}
            delta={delta(data.today.orders, data.yesterday.orders)}
            hint={`AOV ${formatMoney(data.today.avgOrderValue)}`}
            icon={<ShoppingBag className="size-4" />}
          />
          <Stat
            label="Items sold"
            value={formatNumber(data.today.itemsSold)}
            hint={`${data.today.exits} Scan & Go exits`}
            icon={<DoorOpen className="size-4" />}
          />
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <LiveTile
          to="/ops/live"
          icon={<ShoppingCart className="size-5" />}
          label="Shoppers in store now"
          value={data.activeShoppers}
          tone="violet"
        />
        <LiveTile
          to="/ops/orders"
          icon={<ShoppingBag className="size-5" />}
          label="Orders to pack"
          value={data.pendingOrders.delivery + data.pendingOrders.pickup}
          detail={`${data.pendingOrders.delivery} delivery · ${data.pendingOrders.pickup} pickup`}
          tone="blue"
        />
        <LiveTile
          to="/ops/alerts"
          icon={<Siren className="size-5" />}
          label="Restock alerts"
          value={data.openAlerts}
          tone={data.openAlerts > 0 ? 'red' : 'green'}
        />
        <LiveTile
          to={ops.isSupervisor ? '/ops/attendance' : '/ops/shifts'}
          icon={<Users className="size-5" />}
          label="Staff on duty"
          value={data.staff.onDuty}
          detail={`${data.staff.scheduledToday} scheduled · ${data.staff.notYetIn} not in yet`}
          tone="green"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {ops.isSupervisor && (
            <Card>
              <CardHeader title="Sales by hour" subtitle="Net sales today, all channels" />
              <div className="p-4">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.salesByHour} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                    <XAxis
                      dataKey="hour"
                      tickFormatter={hourLabel}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={false}
                      interval={2}
                    />
                    <YAxis
                      tickFormatter={(v: number) => formatMoneyCompact(v)}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={false}
                      width={52}
                    />
                    <Tooltip
                      labelFormatter={(h) => hourLabel(Number(h))}
                      formatter={(value, name) => (name === 'netSales' ? [formatMoney(Number(value)), 'Net sales'] : [value, 'Orders'])}
                      contentStyle={{ borderRadius: 12, fontSize: 12 }}
                    />
                    <Bar dataKey="netSales" fill="#0a8f45" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader
              title="My open tasks"
              action={
                <Link to="/ops/tasks" className="text-sm font-semibold text-brand-700">
                  All tasks →
                </Link>
              }
            />
            {myTasks.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">Nothing assigned to you right now.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {myTasks.map((task) => (
                  <li key={task.id}>
                    <Link to="/ops/tasks" className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                      <ClipboardCheck className="size-5 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{task.title}</p>
                        <p className="text-xs text-slate-500">
                          From {task.assignedBy.name}
                          {task.dueAt && ` · due ${formatTime(task.dueAt)}`}
                          {task.aisle && ` · Aisle ${task.aisle}`}
                        </p>
                      </div>
                      {task.isOverdue && <Badge tone="red">Overdue</Badge>}
                      <PriorityBadge priority={task.priority} />
                      <TaskStatusBadge status={task.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <ClockCard />
          {ops.isSupervisor && (
            <Card className="p-5">
              <p className="text-sm font-semibold text-slate-500">Team tasks</p>
              <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-2xl font-extrabold text-slate-900">{data.tasks.open}</p>
                  <p className="text-xs text-slate-500">Open</p>
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-amber-600">{data.tasks.awaitingReview}</p>
                  <p className="text-xs text-slate-500">To review</p>
                </div>
                <div>
                  <p className={cn('text-2xl font-extrabold', data.tasks.overdue > 0 ? 'text-rose-600' : 'text-slate-900')}>
                    {data.tasks.overdue}
                  </p>
                  <p className="text-xs text-slate-500">Overdue</p>
                </div>
              </div>
            </Card>
          )}
          <Card>
            <CardHeader
              title="Exit gates"
              action={
                <Link to="/ops/live" className="text-sm font-semibold text-brand-700">
                  Live →
                </Link>
              }
            />
            <ul className="divide-y divide-slate-100">
              {data.recentGateEvents.length === 0 && <li className="px-5 py-6 text-center text-sm text-slate-500">No exits yet today.</li>}
              {data.recentGateEvents.slice(0, 6).map((event) => (
                <li key={event.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className={cn('size-2 shrink-0 rounded-full', event.result === 'OPENED' ? 'bg-brand-500' : 'bg-rose-500')} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-900">
                      {event.result === 'OPENED'
                        ? `${event.customerName ?? 'Shopper'} · ${event.orderNumber}`
                        : GATE_REASON_LABELS[event.reason]}
                    </p>
                    <p className="text-xs text-slate-500">{event.deviceName}</p>
                  </div>
                  <span className="text-xs text-slate-400">{timeAgo(event.at)}</span>
                </li>
              ))}
            </ul>
          </Card>
          {!ops.isSupervisor && (
            <Link to="/ops/inventory">
              <Card className="flex items-center gap-3 p-4 hover:shadow-pop">
                <Boxes className="size-5 text-brand-600" />
                <span className="flex-1 text-sm font-semibold text-slate-900">Look up stock and shelf locations</span>
                <ArrowRight className="size-4 text-slate-400" />
              </Card>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function LiveTile({
  to,
  icon,
  label,
  value,
  detail,
  tone,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  value: number;
  detail?: string;
  tone: 'violet' | 'blue' | 'red' | 'green';
}) {
  const tones = {
    violet: 'bg-violet-50 text-violet-700',
    blue: 'bg-sky-50 text-sky-700',
    red: 'bg-rose-50 text-rose-700',
    green: 'bg-brand-50 text-brand-700',
  };
  return (
    <Link to={to}>
      <Card className="flex items-center gap-4 p-4 transition-shadow hover:shadow-pop">
        <span className={cn('flex size-11 items-center justify-center rounded-xl', tones[tone])}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-500">{label}</p>
          <p className="text-2xl font-extrabold text-slate-900">{value}</p>
          {detail && <p className="truncate text-xs text-slate-500">{detail}</p>}
        </div>
      </Card>
    </Link>
  );
}
