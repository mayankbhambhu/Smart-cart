import { formatMoney, formatMoneyCompact, type RushHourCell } from '@smartcart/shared';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn, WEEKDAY_SHORT } from '@/lib/utils';

export const CHART_COLORS = ['#0a8f45', '#6366f1', '#f59e0b', '#0ea5e9', '#ec4899', '#14b8a6', '#8b5cf6', '#f97316'];

const tooltipStyle = { borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 8px 24px -8px rgb(0 0 0 / 0.15)', fontSize: 12 };

export function SalesTrendChart({
  data,
  height = 260,
}: {
  data: { period: string; netSales: number; grossProfit: number }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="net" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a8f45" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#0a8f45" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="profit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
        <XAxis
          dataKey="period"
          tickFormatter={shortDate}
          tick={{ fontSize: 11, fill: '#64748b' }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          tickFormatter={(v: number) => formatMoneyCompact(v)}
          tick={{ fontSize: 11, fill: '#64748b' }}
          tickLine={false}
          axisLine={false}
          width={56}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(label) => shortDate(String(label))}
          formatter={(value, name) => [formatMoney(Number(value)), name === 'netSales' ? 'Net sales' : 'Gross profit']}
        />
        <Area type="monotone" dataKey="netSales" stroke="#0a8f45" strokeWidth={2} fill="url(#net)" />
        <Area type="monotone" dataKey="grossProfit" stroke="#6366f1" strokeWidth={2} fill="url(#profit)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HourlyBars({
  data,
  height = 220,
  stacked,
}: {
  data: { hour: number; orders: number; DELIVERY?: number; PICKUP?: number; IN_STORE?: number }[];
  height?: number;
  stacked?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
        <XAxis
          dataKey="hour"
          tickFormatter={hourLabel}
          tick={{ fontSize: 11, fill: '#64748b' }}
          tickLine={false}
          axisLine={false}
          interval={2}
        />
        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(h) => hourLabel(Number(h))} />
        {stacked ? (
          <>
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="DELIVERY" name="Delivery" stackId="a" fill="#0a8f45" radius={[0, 0, 0, 0]} />
            <Bar dataKey="PICKUP" name="Pickup" stackId="a" fill="#0ea5e9" />
            <Bar dataKey="IN_STORE" name="Scan & Go" stackId="a" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </>
        ) : (
          <Bar dataKey="orders" name="Orders" fill="#0a8f45" radius={[4, 4, 0, 0]} />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({
  data,
  height = 220,
  valueFormatter = (v: number) => String(v),
}: {
  data: { name: string; value: number }[];
  height?: number;
  valueFormatter?: (value: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={2} stroke="none">
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={(value) => valueFormatter(Number(value))} />
        <Legend iconType="circle" layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function HorizontalBars({
  data,
  height = 280,
  valueFormatter = (v: number) => String(v),
}: {
  data: { name: string; value: number }[];
  height?: number;
  valueFormatter?: (value: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12, fill: '#334155' }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(value) => valueFormatter(Number(value))} cursor={{ fill: '#f1f5f9' }} />
        <Bar dataKey="value" fill="#0a8f45" radius={[0, 6, 6, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Orders by weekday x hour: the store's rush hours at a glance. */
export function RushHeatmap({ cells, fromHour = 6, toHour = 23 }: { cells: RushHourCell[]; fromHour?: number; toHour?: number }) {
  const max = Math.max(1, ...cells.map((c) => c.orders));
  const hours = Array.from({ length: toHour - fromHour + 1 }, (_, i) => fromHour + i);
  const order = [1, 2, 3, 4, 5, 6, 0];
  const value = (dow: number, hour: number) => cells.find((c) => c.dow === dow && c.hour === hour)?.orders ?? 0;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-[11px]">
        <thead>
          <tr>
            <th />
            {hours.map((h) => (
              <th key={h} className="font-medium text-slate-400">
                {h % 3 === 0 ? hourLabel(h) : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {order.map((dow) => (
            <tr key={dow}>
              <td className="pr-1 font-semibold text-slate-500">{WEEKDAY_SHORT[dow]}</td>
              {hours.map((h) => {
                const v = value(dow, h);
                const intensity = v / max;
                return (
                  <td key={h} title={`${WEEKDAY_SHORT[dow]} ${hourLabel(h)}: ${v} orders`}>
                    <div
                      className={cn('h-6 min-w-5 rounded-md', v === 0 && 'bg-slate-100')}
                      style={v > 0 ? { backgroundColor: `rgba(10, 143, 69, ${0.08 + intensity * 0.92})` } : undefined}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function hourLabel(hour: number): string {
  const h = hour % 24;
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

function shortDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
