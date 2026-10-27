import {
  DIETARY_TAG_META,
  ORDER_CHANNEL_LABELS,
  PAYMENT_METHOD_LABELS,
  STAFF_ROLE_LABELS,
  formatDuration,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  type AnalyticsSummary,
  type BasketInsights,
  type CategoryPerformance,
  type CustomerInsights,
  type InventoryHealth,
  type OfferPerformance,
  type PaymentMix,
  type RushHours,
  type StaffPerformance,
  type TopProduct,
  type TrendPoint,
} from '@smartcart/shared';
import { useQuery } from '@tanstack/react-query';
import { Download, IndianRupee, Percent, ShoppingBag, Star, TrendingUp, Users } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Donut, HorizontalBars, HourlyBars, RushHeatmap, SalesTrendChart, hourLabel } from '@/components/charts';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  PageLoader,
  Segmented,
  Select,
  Stat,
  Table,
  Tabs,
  Td,
  Th,
} from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { toast } from '@/lib/toast';
import { WEEKDAY_SHORT, addDays, cn, formatDate, localDate, startOfWeek } from '@/lib/utils';
import { PageHeader } from './components';
import { useOps } from './hooks';

type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'this-month' | 'last-month' | 'this-year' | 'custom';
type Granularity = 'day' | 'week' | 'month';
type Section = 'overview' | 'products' | 'rush' | 'customers' | 'inventory' | 'staff';
interface Range {
  from: string;
  to: string;
}

function presetRange(preset: Preset, today: string): Range {
  const monthStart = `${today.slice(0, 8)}01`;
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday':
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case '7d':
      return { from: addDays(today, -6), to: today };
    case '30d':
      return { from: addDays(today, -29), to: today };
    case 'this-month':
      return { from: monthStart, to: today };
    case 'last-month': {
      const last = addDays(monthStart, -1);
      return { from: `${last.slice(0, 8)}01`, to: last };
    }
    case 'this-year':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    default:
      return { from: startOfWeek(today), to: today };
  }
}

function daysBetween(range: Range): number {
  return Math.round((new Date(`${range.to}T00:00:00Z`).getTime() - new Date(`${range.from}T00:00:00Z`).getTime()) / 86_400_000) + 1;
}

const PRESET_LABELS: Record<Preset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  'this-month': 'This month',
  'last-month': 'Last month',
  'this-year': 'This year',
  custom: 'Custom range',
};

/** Business analysis for owners and store managers: sales, profit, top sellers, offers, rush hours and more. */
export default function AnalyticsPage() {
  const ops = useOps();
  const today = localDate();
  const [preset, setPreset] = useState<Preset>('30d');
  const [custom, setCustom] = useState<Range>({ from: addDays(today, -13), to: today });
  const [section, setSection] = useState<Section>('overview');
  const range = preset === 'custom' ? custom : presetRange(preset, today);
  const days = daysBetween(range);
  const [granularityOverride, setGranularity] = useState<Granularity | null>(null);
  const granularity: Granularity = granularityOverride ?? (days > 180 ? 'month' : days > 62 ? 'week' : 'day');
  const [exporting, setExporting] = useState(false);

  if (!ops.isLeadership)
    return <PageHeader title="Analytics" subtitle="Business analysis is available to the store owner and store manager." />;

  const download = async () => {
    setExporting(true);
    try {
      const csv = await ops.get<string>('/analytics/export.csv', { query: { from: range.from, to: range.to } });
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `smartcart-${ops.membership.storeCode}-${range.from}-to-${range.to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Export failed', errorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Business analysis"
        subtitle={`${formatDate(range.from)} – ${formatDate(range.to)} · ${days} ${days === 1 ? 'day' : 'days'}`}
        actions={
          <>
            <Select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} className="w-40" aria-label="Period">
              {(Object.keys(PRESET_LABELS) as Preset[]).map((p) => (
                <option key={p} value={p}>
                  {PRESET_LABELS[p]}
                </option>
              ))}
            </Select>
            {preset === 'custom' && (
              <>
                <Input
                  type="date"
                  value={custom.from}
                  max={custom.to}
                  onChange={(e) => setCustom({ ...custom, from: e.target.value })}
                  className="w-40"
                  aria-label="From"
                />
                <Input
                  type="date"
                  value={custom.to}
                  min={custom.from}
                  max={today}
                  onChange={(e) => setCustom({ ...custom, to: e.target.value })}
                  className="w-40"
                  aria-label="To"
                />
              </>
            )}
            <Button variant="outline" icon={<Download className="size-4" />} loading={exporting} onClick={download}>
              CSV
            </Button>
          </>
        }
      />
      <Tabs
        className="mb-5"
        value={section}
        onChange={setSection}
        tabs={[
          { value: 'overview', label: 'Sales & profit' },
          { value: 'products', label: 'Top sellers & offers' },
          { value: 'rush', label: 'Rush hours' },
          { value: 'customers', label: 'Customers & baskets' },
          { value: 'inventory', label: 'Inventory health' },
          { value: 'staff', label: 'Staff' },
        ]}
      />
      {section === 'overview' && <Overview range={range} granularity={granularity} onGranularity={setGranularity} />}
      {section === 'products' && <Products range={range} />}
      {section === 'rush' && <Rush range={range} />}
      {section === 'customers' && <Customers range={range} />}
      {section === 'inventory' && <Inventory />}
      {section === 'staff' && <Staff range={range} />}
    </div>
  );
}

function useAnalytics<T>(name: string, range: Range, extra: Record<string, string | number> = {}) {
  const ops = useOps();
  return useQuery({
    queryKey: ['analytics', ops.storeId, name, range.from, range.to, extra],
    queryFn: () => ops.get<T>(`/analytics/${name}`, { query: { ...range, ...extra } }),
    staleTime: 60_000,
  });
}

const pct = (current: number, previous: number) => (previous > 0 ? ((current - previous) / previous) * 100 : null);

function Overview({
  range,
  granularity,
  onGranularity,
}: {
  range: Range;
  granularity: Granularity;
  onGranularity: (g: Granularity) => void;
}) {
  const { data: summary, isLoading } = useAnalytics<AnalyticsSummary>('summary', range);
  const { data: trend = [] } = useAnalytics<TrendPoint[]>('trend', range, { granularity });
  const { data: payments = [] } = useAnalytics<PaymentMix[]>('payments', range);
  if (isLoading || !summary) return <PageLoader />;
  const channels = (Object.keys(summary.byChannel) as (keyof typeof summary.byChannel)[]).map((c) => ({
    channel: c,
    ...summary.byChannel[c],
  }));

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Net sales"
          value={formatMoney(summary.netSales)}
          delta={pct(summary.netSales, summary.previous.netSales)}
          hint="vs previous period"
          icon={<IndianRupee className="size-4" />}
          tone="success"
        />
        <Stat
          label="Gross profit"
          value={formatMoney(summary.grossProfit)}
          delta={pct(summary.grossProfit, summary.previous.grossProfit)}
          hint={`${formatPercent(summary.marginPct)} margin`}
          icon={<TrendingUp className="size-4" />}
        />
        <Stat
          label="Orders"
          value={formatNumber(summary.orders)}
          delta={pct(summary.orders, summary.previous.orders)}
          hint={`${formatNumber(summary.itemsSold)} items`}
          icon={<ShoppingBag className="size-4" />}
        />
        <Stat
          label="Average order"
          value={formatMoney(summary.avgOrderValue)}
          delta={pct(summary.avgOrderValue, summary.previous.avgOrderValue)}
          icon={<Percent className="size-4" />}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Customers"
          value={formatNumber(summary.uniqueCustomers)}
          hint={`${summary.newCustomers} new · ${formatPercent(summary.repeatCustomerRate)} repeat`}
          icon={<Users className="size-4" />}
        />
        <Stat
          label="Gross sales (MRP-based)"
          value={formatMoney(summary.grossSales)}
          hint={`GST collected ${formatMoney(summary.taxCollected)}`}
        />
        <Stat
          label="Discounts given"
          value={formatMoney(summary.discounts)}
          hint={`Cost of goods ${formatMoneyCompact(summary.cogs)}`}
          tone="warning"
        />
        <Stat
          label="Refunds / cancelled"
          value={formatMoney(summary.refunds)}
          hint={`${summary.cancelledOrders} cancelled orders`}
          tone={summary.cancelledOrders > 0 ? 'danger' : 'default'}
        />
      </div>

      <Card>
        <CardHeader
          title="Net sales and gross profit"
          action={
            <Segmented
              value={granularity}
              onChange={onGranularity}
              options={[
                { value: 'day', label: 'Daily' },
                { value: 'week', label: 'Weekly' },
                { value: 'month', label: 'Monthly' },
              ]}
            />
          }
        />
        <div className="p-4">
          {trend.length > 0 ? <SalesTrendChart data={trend} height={300} /> : <EmptyState title="No sales in this period" />}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Sales by channel" subtitle="Delivery vs scheduled pickup vs Scan & Go" />
          <div className="grid items-center gap-4 p-4 sm:grid-cols-2">
            <Donut
              data={channels.map((c) => ({ name: ORDER_CHANNEL_LABELS[c.channel], value: c.netSales }))}
              valueFormatter={formatMoney}
              height={200}
            />
            <ul className="space-y-2 text-sm">
              {channels.map((c) => (
                <li key={c.channel} className="flex justify-between gap-2">
                  <span className="text-slate-600">{ORDER_CHANNEL_LABELS[c.channel]}</span>
                  <span className="tabular text-right">
                    <strong>{formatMoney(c.netSales)}</strong>
                    <span className="block text-xs text-slate-500">
                      {c.orders} orders · {formatMoneyCompact(c.grossProfit)} profit
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
        <Card>
          <CardHeader title="How customers pay" />
          <div className="grid items-center gap-4 p-4 sm:grid-cols-2">
            <Donut
              data={payments.map((p) => ({ name: PAYMENT_METHOD_LABELS[p.method], value: p.amount }))}
              valueFormatter={formatMoney}
              height={200}
            />
            <ul className="space-y-2 text-sm">
              {payments.map((p) => (
                <li key={p.method} className="flex justify-between gap-2">
                  <span className="text-slate-600">{PAYMENT_METHOD_LABELS[p.method]}</span>
                  <span className="tabular">
                    {formatPercent(p.share)} · {p.orders}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Products({ range }: { range: Range }) {
  const [sort, setSort] = useState<'revenue' | 'quantity' | 'profit'>('revenue');
  const { data: top = [], isLoading } = useAnalytics<TopProduct[]>('top-products', range, { sort, limit: 15 });
  const { data: categories = [] } = useAnalytics<CategoryPerformance[]>('categories', range);
  const { data: offers = [] } = useAnalytics<OfferPerformance[]>('offers', range);
  const loved = [...offers].sort((a, b) => b.uniqueCustomers - a.uniqueCustomers);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Top sellers"
          action={
            <Segmented
              value={sort}
              onChange={setSort}
              options={[
                { value: 'revenue', label: 'Revenue' },
                { value: 'quantity', label: 'Units' },
                { value: 'profit', label: 'Profit' },
              ]}
            />
          }
        />
        {isLoading ? (
          <PageLoader />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Product</Th>
                <Th className="text-right">Units</Th>
                <Th className="text-right">Orders</Th>
                <Th className="text-right">Net sales</Th>
                <Th className="text-right">Gross profit</Th>
                <Th className="text-right">Margin</Th>
              </tr>
            </thead>
            <tbody>
              {top.map((p, i) => (
                <tr key={p.productId}>
                  <Td className="font-bold text-slate-400">{i + 1}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-lg text-lg" style={{ backgroundColor: p.color }}>
                        {p.emoji}
                      </span>
                      <div className="min-w-0">
                        <p className="max-w-72 truncate font-medium text-slate-900">{p.name}</p>
                        <p className="text-xs text-slate-500">
                          {p.unit} · {p.categoryName}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td className="tabular text-right">{formatNumber(p.quantity)}</Td>
                  <Td className="tabular text-right">{formatNumber(p.orders)}</Td>
                  <Td className="tabular text-right font-semibold">{formatMoney(p.netSales)}</Td>
                  <Td className="tabular text-right">{formatMoney(p.grossProfit)}</Td>
                  <Td className="tabular text-right">{p.netSales > 0 ? formatPercent((p.grossProfit / p.netSales) * 100) : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Categories" subtitle="Share of net sales" />
          <div className="p-4">
            <HorizontalBars
              data={categories.slice(0, 10).map((c) => ({ name: `${c.emoji} ${c.name}`, value: c.netSales }))}
              valueFormatter={formatMoney}
              height={Math.max(220, Math.min(10, categories.length) * 30)}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Most-loved offers" subtitle="Ranked by the number of customers who used them" />
          {loved.length === 0 ? (
            <EmptyState title="No offer redemptions in this period" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {loved.map((o, i) => (
                <li key={o.offerId} className="flex items-center gap-3 px-5 py-3">
                  <span
                    className={cn(
                      'flex size-7 items-center justify-center rounded-full text-xs font-bold',
                      i === 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600',
                    )}
                  >
                    {i === 0 ? <Star className="size-3.5 fill-current" /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {o.title} {o.code && <Badge tone="violet">{o.code}</Badge>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {o.uniqueCustomers} customers · {o.redemptions} uses · {formatMoney(o.discountGiven)} discount
                    </p>
                  </div>
                  <div className="tabular text-right text-xs">
                    <p className="font-semibold text-slate-900">{formatMoney(o.revenue)}</p>
                    <p className={cn(o.aovLiftPct >= 0 ? 'text-brand-700' : 'text-rose-600')}>
                      AOV {o.aovLiftPct >= 0 ? '+' : ''}
                      {o.aovLiftPct.toFixed(0)}% · ₹{o.returnOnDiscount.toFixed(1)}/₹
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Rush({ range }: { range: Range }) {
  const { data, isLoading } = useAnalytics<RushHours>('rush-hours', range);
  if (isLoading || !data) return <PageLoader />;
  const weekday = [1, 2, 3, 4, 5, 6, 0].map((dow) => data.byWeekday.find((d) => d.dow === dow) ?? { dow, orders: 0, netSales: 0 });
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {data.peakHours.slice(0, 3).map((p, i) => (
          <Card key={p.hour} className="p-4">
            <p className="text-sm text-slate-500">{i === 0 ? 'Busiest hour' : `#${i + 1} busiest`}</p>
            <p className="text-2xl font-extrabold text-slate-900">
              {hourLabel(p.hour)}–{hourLabel(p.hour + 1)}
            </p>
            <p className="text-xs text-slate-500">
              {p.orders} orders · {formatPercent(p.share)} of all orders
            </p>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title="Orders by day and hour" subtitle="Darker = busier. Use it to plan shifts and restocking." />
        <div className="p-4">
          <RushHeatmap cells={data.heatmap} />
        </div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Hourly orders by channel" />
          <div className="p-4">
            <HourlyBars data={data.hourly} stacked height={260} />
          </div>
        </Card>
        <Card>
          <CardHeader title="By weekday" />
          <div className="p-4">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={weekday.map((d) => ({ ...d, day: WEEKDAY_SHORT[d.dow] }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis
                  tickFormatter={(v: number) => formatMoneyCompact(v)}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                />
                <Tooltip
                  formatter={(v, name) => (name === 'netSales' ? [formatMoney(Number(v)), 'Net sales'] : [v, 'Orders'])}
                  contentStyle={{ borderRadius: 12, fontSize: 12 }}
                />
                <Bar dataKey="netSales" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Customers({ range }: { range: Range }) {
  const { data: customers, isLoading } = useAnalytics<CustomerInsights>('customers', range);
  const { data: basket } = useAnalytics<BasketInsights>('basket', range, { limit: 10 });
  if (isLoading || !customers) return <PageLoader />;
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="New vs returning customers" />
          <div className="p-4">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={customers.newVsReturning} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis
                  dataKey="period"
                  tickFormatter={(v: string) => formatDate(v, { year: undefined })}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={20}
                />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="returningCustomers" name="Returning" stackId="a" fill="#0a8f45" />
                <Bar dataKey="newCustomers" name="New" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Dietary preferences" subtitle="Share of this store's customers" />
          <ul className="space-y-2.5 p-5">
            {customers.dietary.map((d) => (
              <li key={d.tag}>
                <div className="flex justify-between text-sm">
                  <span>
                    {DIETARY_TAG_META[d.tag].emoji} {DIETARY_TAG_META[d.tag].label}
                  </span>
                  <span className="tabular text-slate-500">
                    {d.customers} · {formatPercent(d.share)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, d.share)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Frequently bought together"
            subtitle={
              basket
                ? `${basket.avgItemsPerOrder.toFixed(1)} items and ${basket.avgDistinctProducts.toFixed(1)} different products per order`
                : undefined
            }
          />
          <ul className="divide-y divide-slate-100">
            {(basket?.pairs ?? []).map((pair) => (
              <li key={`${pair.a.id}-${pair.b.id}`} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="text-lg">{pair.a.emoji}</span>
                <span className="min-w-0 flex-1 truncate">
                  {pair.a.name} <span className="text-slate-400">+</span> {pair.b.name}
                </span>
                <Badge tone="gray">{pair.orders} orders</Badge>
                <Badge tone="green">{pair.lift.toFixed(1)}× lift</Badge>
              </li>
            ))}
            {basket?.pairs.length === 0 && <li className="px-5 py-6 text-center text-sm text-slate-500">Not enough orders yet.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Top delivery neighbourhoods" />
          <ul className="divide-y divide-slate-100">
            {customers.topLocalities.map((l, i) => (
              <li key={l.locality} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span>
                  <span className="mr-2 text-slate-400">{i + 1}</span>
                  {l.locality}
                </span>
                <span className="tabular font-semibold">{l.orders} orders</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Inventory() {
  const ops = useOps();
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', ops.storeId, 'inventory-health'],
    queryFn: () => ops.get<InventoryHealth>('/analytics/inventory-health', { query: { from: localDate(-29), to: localDate() } }),
    staleTime: 60_000,
  });
  if (isLoading || !data) return <PageLoader />;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Products stocked" value={formatNumber(data.skuCount)} />
        <Stat
          label="Stock value (cost)"
          value={formatMoney(data.stockCostValue)}
          hint={`${formatMoney(data.stockRetailValue)} at retail`}
        />
        <Stat label="Low on the shelf" value={data.lowStock} tone="warning" />
        <Stat label="Out of stock" value={data.outOfStock} tone={data.outOfStock > 0 ? 'danger' : 'default'} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Reorder suggestions" subtitle="Based on the last 30 days of sales" />
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th className="text-right">In stock</Th>
                <Th className="text-right">Sells / day</Th>
                <Th className="text-right">Days left</Th>
                <Th className="text-right">Order</Th>
              </tr>
            </thead>
            <tbody>
              {data.reorderSuggestions.map((r) => (
                <tr key={r.productId}>
                  <Td>
                    <span className="mr-2">{r.emoji}</span>
                    {r.name} <span className="text-xs text-slate-400">{r.unit}</span>
                  </Td>
                  <Td className="tabular text-right">{r.shelfQty + r.storageQty}</Td>
                  <Td className="tabular text-right">{r.avgDailySales.toFixed(1)}</Td>
                  <Td
                    className={cn(
                      'tabular text-right font-semibold',
                      r.daysOfCover < 2 ? 'text-rose-600' : r.daysOfCover < 5 ? 'text-amber-700' : 'text-slate-700',
                    )}
                  >
                    {r.daysOfCover.toFixed(1)}
                  </Td>
                  <Td className="tabular text-right font-bold text-brand-700">{r.suggestedOrderQty}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Slow movers" subtitle="Money tied up in stock that is not selling" />
          <ul className="divide-y divide-slate-100">
            {data.slowMovers.map((s) => (
              <li key={s.productId} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                <span className="min-w-0 truncate">
                  {s.emoji} {s.name}
                </span>
                <span className="tabular shrink-0 text-right text-xs text-slate-500">
                  {s.stock} in stock · {s.unitsSold} sold
                  <span className="block font-semibold text-slate-700">{formatMoney(s.stockValue)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Staff({ range }: { range: Range }) {
  const { data = [], isLoading } = useAnalytics<StaffPerformance[]>('staff', range);
  if (isLoading) return <PageLoader />;
  return (
    <Card>
      <CardHeader title="Team performance" subtitle="Tasks, review ratings and punctuality" />
      <Table>
        <thead>
          <tr>
            <Th>Employee</Th>
            <Th className="text-right">Tasks done</Th>
            <Th className="text-right">Open</Th>
            <Th className="text-right">Avg rating</Th>
            <Th className="text-right">Days present</Th>
            <Th className="text-right">Hours</Th>
            <Th className="text-right">On time</Th>
          </tr>
        </thead>
        <tbody>
          {data.map((s) => (
            <tr key={s.employeeId}>
              <Td>
                <p className="font-medium text-slate-900">{s.name}</p>
                <p className="text-xs text-slate-500">{STAFF_ROLE_LABELS[s.role]}</p>
              </Td>
              <Td className="tabular text-right">{s.tasksCompleted}</Td>
              <Td className="tabular text-right">{s.tasksOpen}</Td>
              <Td className="tabular text-right">{s.avgRating ? `${s.avgRating.toFixed(1)} ★` : '—'}</Td>
              <Td className="tabular text-right">{s.daysPresent}</Td>
              <Td className="tabular text-right">{formatDuration(s.minutesWorked)}</Td>
              <Td className={cn('tabular text-right', s.onTimeRate < 80 ? 'text-amber-700' : 'text-brand-700')}>
                {formatPercent(s.onTimeRate, 0)}
                {s.lateDays > 0 && <span className="block text-xs text-slate-400">{s.lateDays} late</span>}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
