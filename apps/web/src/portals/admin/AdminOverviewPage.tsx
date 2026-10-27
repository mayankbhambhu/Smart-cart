import {
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  timeAgo,
  type AdminOverview,
  type CredentialRequest,
  type Paginated,
  type TopProduct,
} from '@smartcart/shared';
import { useQuery } from '@tanstack/react-query';
import { Building2, IndianRupee, Inbox, LifeBuoy, ShoppingBag, Users } from 'lucide-react';
import { Link } from 'react-router';
import { HorizontalBars, SalesTrendChart } from '@/components/charts';
import { RequestStatusBadge } from '@/components/status';
import { Card, CardHeader, PageHeader, PageLoader, Stat } from '@/components/ui';
import { adminApi } from '@/lib/api';
import { useSession } from '@/lib/auth';

export default function AdminOverviewPage() {
  const session = useSession('ADMIN')!;
  const { data, isLoading } = useQuery({ queryKey: ['admin-overview'], queryFn: () => adminApi.get<AdminOverview>('/admin/overview') });
  const { data: pending } = useQuery({
    queryKey: ['admin-requests', 'PENDING_ADMIN', 'overview'],
    queryFn: () => adminApi.get<Paginated<CredentialRequest>>('/admin/requests', { query: { status: 'PENDING_ADMIN', limit: 5 } }),
  });
  const { data: top = [] } = useQuery({
    queryKey: ['admin-top-products'],
    queryFn: () => adminApi.get<TopProduct[]>('/admin/analytics/top-products'),
  });
  if (isLoading || !data) return <PageLoader />;
  return (
    <div>
      <PageHeader title={`Hello, ${session.user.name.split(' ')[0]}`} subtitle="Everything happening across SmartCart stores" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Link to="/admin/requests">
          <Stat
            label="Login requests waiting for you"
            value={data.pendingRequests}
            icon={<Inbox className="size-4" />}
            tone={data.pendingRequests > 0 ? 'warning' : 'default'}
          />
        </Link>
        <Link to="/admin/tickets">
          <Stat
            label="Open store requests"
            value={data.openTickets}
            icon={<LifeBuoy className="size-4" />}
            tone={data.openTickets > 0 ? 'danger' : 'default'}
          />
        </Link>
        <Stat
          label="Net sales today"
          value={formatMoney(data.today.netSales)}
          hint={`${formatNumber(data.today.orders)} orders`}
          icon={<IndianRupee className="size-4" />}
          tone="success"
        />
        <Stat
          label="Stores"
          value={`${data.stores.active} / ${data.stores.total}`}
          hint="active / total"
          icon={<Building2 className="size-4" />}
        />
        <Stat
          label="Employees"
          value={formatNumber(data.employees.active)}
          hint={`${formatNumber(data.employees.total)} including former staff`}
          icon={<Users className="size-4" />}
        />
        <Stat
          label="Last 30 days"
          value={formatMoneyCompact(data.last30.netSales)}
          hint={`${formatNumber(data.last30.orders)} orders · ${formatMoneyCompact(data.last30.grossProfit)} profit · ${formatNumber(data.customers)} customers`}
          icon={<ShoppingBag className="size-4" />}
        />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title="Network net sales" subtitle="All stores, last 30 days" />
          <div className="p-4">
            <SalesTrendChart data={data.trend} height={280} />
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Waiting for admin review"
            action={
              <Link to="/admin/requests" className="text-sm font-semibold text-indigo-700">
                All →
              </Link>
            }
          />
          <ul className="divide-y divide-slate-100">
            {(pending?.items ?? []).length === 0 && <li className="px-5 py-8 text-center text-sm text-slate-500">Nothing waiting. 🎉</li>}
            {pending?.items.map((r) => (
              <li key={r.id}>
                <Link to={`/admin/requests/${r.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{r.candidate.fullName}</p>
                    <p className="text-xs text-slate-500">
                      {r.storeName} · {timeAgo(r.updatedAt)}
                    </p>
                  </div>
                  <RequestStatusBadge status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Sales by store" subtitle="Last 30 days" />
          <div className="p-4">
            <HorizontalBars
              data={data.salesByStore.map((s) => ({ name: s.storeName.replace('SmartCart ', ''), value: s.netSales }))}
              valueFormatter={formatMoney}
              height={Math.max(160, data.salesByStore.length * 44)}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Top products across the network" subtitle="Last 30 days, by net sales" />
          <ul className="divide-y divide-slate-100">
            {top.map((p, i) => (
              <li key={p.productId} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className="w-5 text-right text-xs font-bold text-slate-400">{i + 1}</span>
                <span className="text-lg">{p.emoji}</span>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="tabular font-semibold">{formatMoney(p.netSales)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
