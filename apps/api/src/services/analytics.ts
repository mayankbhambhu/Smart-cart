import type {
  AnalyticsSummary,
  BasketInsights,
  CategoryPerformance,
  CustomerInsights,
  DietaryTag,
  InventoryHealth,
  OfferPerformance,
  OfferType,
  OrderChannel,
  PaymentMethodType,
  PaymentMix,
  RushHours,
  StaffPerformance,
  TopProduct,
  TrendPoint,
} from '@smartcart/shared';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { addDays, daysBetween, zonedRange } from '../lib/time';

/**
 * Business analytics for a store. A sale is an order with a placed_at time
 * (payment confirmed, or COD accepted) that was not cancelled. Day and hour
 * buckets use the store's local timezone.
 *
 *   gross sales  = item total at shelf price
 *   net sales    = gross sales - coupon discounts
 *   gross profit = net sales - cost of goods sold
 */

export interface Range {
  storeId: string | null;
  from: string;
  to: string;
  timezone: string;
}

function window(range: Range) {
  return zonedRange(range.from, range.to, range.timezone);
}

/** Shared WHERE clause for sales in a range ("o" is the orders alias). */
function salesWhere(range: Range): SQL {
  const { start, end } = window(range);
  return sql`o.placed_at >= ${start} and o.placed_at < ${end} and o.status <> 'CANCELLED'
    ${range.storeId ? sql`and o.store_id = ${range.storeId}` : sql``}`;
}

async function rows<T>(query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return result.rows as T[];
}

const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

export async function summary(range: Range): Promise<AnalyticsSummary> {
  const length = daysBetween(range.from, range.to) + 1;
  const previous: Range = { ...range, from: addDays(range.from, -length), to: addDays(range.from, -1) };
  const { start, end } = window(range);

  const [current, prior, channels, cancelled, refunds, customers] = await Promise.all([
    totals(range),
    totals(previous),
    rows<{ channel: OrderChannel; orders: number; net: number; profit: number }>(sql`
      select o.channel, count(*)::int as orders,
             coalesce(sum(o.item_total - o.coupon_discount), 0)::float8 as net,
             coalesce(sum(o.item_total - o.coupon_discount - o.cost_total), 0)::float8 as profit
      from orders o where ${salesWhere(range)} group by o.channel`),
    rows<{ count: number }>(sql`
      select count(*)::int as count from orders o
      where o.status = 'CANCELLED' and o.created_at >= ${start} and o.created_at < ${end}
      ${range.storeId ? sql`and o.store_id = ${range.storeId}` : sql``}`),
    rows<{ amount: number }>(sql`
      select coalesce(sum(p.refunded_amount), 0)::float8 as amount
      from payments p join orders o on o.id = p.order_id
      where p.refunded_amount > 0 and o.created_at >= ${start} and o.created_at < ${end}
      ${range.storeId ? sql`and o.store_id = ${range.storeId}` : sql``}`),
    rows<{ unique_customers: number; new_customers: number }>(sql`
      with first_orders as (
        select o.user_id, min(o.placed_at) as first_at from orders o
        where o.status <> 'CANCELLED' and o.placed_at is not null
        ${range.storeId ? sql`and o.store_id = ${range.storeId}` : sql``}
        group by o.user_id
      ), in_range as (
        select distinct o.user_id from orders o where ${salesWhere(range)}
      )
      select (select count(*) from in_range)::int as unique_customers,
             (select count(*) from first_orders f where f.first_at >= ${start} and f.first_at < ${end})::int as new_customers`),
  ]);

  const byChannel = Object.fromEntries(
    (['DELIVERY', 'PICKUP', 'IN_STORE'] as const).map((channel) => {
      const row = channels.find((c) => c.channel === channel);
      return [channel, { orders: row?.orders ?? 0, netSales: row?.net ?? 0, grossProfit: row?.profit ?? 0 }];
    }),
  ) as AnalyticsSummary['byChannel'];
  const uniqueCustomers = customers[0]?.unique_customers ?? 0;
  const newCustomers = customers[0]?.new_customers ?? 0;

  return {
    from: range.from,
    to: range.to,
    grossSales: current.gross,
    discounts: current.discounts,
    refunds: refunds[0]?.amount ?? 0,
    netSales: current.net,
    cogs: current.cogs,
    grossProfit: current.net - current.cogs,
    marginPct: current.net > 0 ? round(((current.net - current.cogs) / current.net) * 100) : 0,
    taxCollected: current.tax,
    orders: current.orders,
    avgOrderValue: current.orders > 0 ? Math.round(current.net / current.orders) : 0,
    itemsSold: current.items,
    uniqueCustomers,
    newCustomers,
    repeatCustomerRate: uniqueCustomers > 0 ? round(((uniqueCustomers - Math.min(newCustomers, uniqueCustomers)) / uniqueCustomers) * 100) : 0,
    cancelledOrders: cancelled[0]?.count ?? 0,
    byChannel,
    previous: {
      netSales: prior.net,
      grossProfit: prior.net - prior.cogs,
      orders: prior.orders,
      avgOrderValue: prior.orders > 0 ? Math.round(prior.net / prior.orders) : 0,
    },
  };
}

async function totals(range: Range) {
  const [row] = await rows<{ orders: number; gross: number; discounts: number; net: number; cogs: number; tax: number; items: number }>(sql`
    select count(*)::int as orders,
           coalesce(sum(o.item_total), 0)::float8 as gross,
           coalesce(sum(o.coupon_discount), 0)::float8 as discounts,
           coalesce(sum(o.item_total - o.coupon_discount), 0)::float8 as net,
           coalesce(sum(o.cost_total), 0)::float8 as cogs,
           coalesce(sum(o.tax_included), 0)::float8 as tax,
           coalesce(sum(o.item_count), 0)::int as items
    from orders o where ${salesWhere(range)}`);
  return row ?? { orders: 0, gross: 0, discounts: 0, net: 0, cogs: 0, tax: 0, items: 0 };
}

export async function trend(range: Range, granularity: 'day' | 'week' | 'month'): Promise<TrendPoint[]> {
  const unit = sql.raw(`'${granularity}'`);
  const data = await rows<{ period: string; net: number; profit: number; orders: number; items: number }>(sql`
    select to_char(date_trunc(${unit}, o.placed_at at time zone ${range.timezone}), 'YYYY-MM-DD') as period,
           coalesce(sum(o.item_total - o.coupon_discount), 0)::float8 as net,
           coalesce(sum(o.item_total - o.coupon_discount - o.cost_total), 0)::float8 as profit,
           count(*)::int as orders,
           coalesce(sum(o.item_count), 0)::int as items
    from orders o where ${salesWhere(range)}
    group by 1 order by 1`);
  const byPeriod = new Map(data.map((d) => [d.period, d]));
  // Fill gaps so charts have a continuous axis.
  const periods: string[] = [];
  if (granularity === 'day') {
    for (let day = range.from; day <= range.to; day = addDays(day, 1)) periods.push(day);
  } else {
    periods.push(...data.map((d) => d.period));
  }
  return periods.map((period) => {
    const d = byPeriod.get(period);
    return { period, netSales: d?.net ?? 0, grossProfit: d?.profit ?? 0, orders: d?.orders ?? 0, itemsSold: d?.items ?? 0 };
  });
}

export async function topProducts(range: Range, sort: 'quantity' | 'revenue' | 'profit', limit: number): Promise<TopProduct[]> {
  const orderBy = sql.raw(sort === 'quantity' ? 'quantity' : sort === 'profit' ? 'profit' : 'net');
  const data = await rows<{
    product_id: string;
    name: string;
    brand: string;
    unit: string;
    emoji: string;
    color: string;
    category: string;
    quantity: number;
    net: number;
    profit: number;
    orders: number;
  }>(sql`
    select i.product_id, max(i.name) as name, max(i.brand) as brand, max(i.unit) as unit, max(i.emoji) as emoji,
           max(i.color) as color, max(c.name) as category,
           sum(i.quantity)::int as quantity,
           sum(i.line_total)::float8 as net,
           sum(i.line_total - i.unit_cost * i.quantity)::float8 as profit,
           count(distinct i.order_id)::int as orders
    from order_items i
    join orders o on o.id = i.order_id
    join categories c on c.id = i.category_id
    where ${salesWhere(range)}
    group by i.product_id
    order by ${orderBy} desc
    limit ${limit}`);
  return data.map((d) => ({
    productId: d.product_id,
    name: d.name,
    brand: d.brand,
    unit: d.unit,
    emoji: d.emoji,
    color: d.color,
    categoryName: d.category,
    quantity: d.quantity,
    netSales: d.net,
    grossProfit: d.profit,
    orders: d.orders,
  }));
}

export async function categoryPerformance(range: Range): Promise<CategoryPerformance[]> {
  const data = await rows<{ id: string; name: string; emoji: string; color: string; quantity: number; net: number; profit: number }>(sql`
    select c.id, c.name, c.emoji, c.color,
           sum(i.quantity)::int as quantity,
           sum(i.line_total)::float8 as net,
           sum(i.line_total - i.unit_cost * i.quantity)::float8 as profit
    from order_items i
    join orders o on o.id = i.order_id
    join categories c on c.id = i.category_id
    where ${salesWhere(range)}
    group by c.id order by net desc`);
  const total = data.reduce((sum, d) => sum + d.net, 0);
  return data.map((d) => ({
    categoryId: d.id,
    name: d.name,
    emoji: d.emoji,
    color: d.color,
    quantity: d.quantity,
    netSales: d.net,
    grossProfit: d.profit,
    share: total > 0 ? round((d.net / total) * 100) : 0,
  }));
}

export async function offerPerformance(range: Range): Promise<OfferPerformance[]> {
  const overall = await totals(range);
  const overallAov = overall.orders > 0 ? overall.net / overall.orders : 0;
  const data = await rows<{
    id: string;
    code: string | null;
    title: string;
    type: OfferType;
    redemptions: number;
    customers: number;
    discount: number;
    revenue: number;
  }>(sql`
    select f.id, f.code, f.title, f.type,
           count(*)::int as redemptions,
           count(distinct r.user_id)::int as customers,
           sum(r.discount)::float8 as discount,
           sum(o.item_total - o.coupon_discount)::float8 as revenue
    from offer_redemptions r
    join orders o on o.id = r.order_id
    join offers f on f.id = r.offer_id
    where ${salesWhere(range)}
    group by f.id order by redemptions desc`);
  return data.map((d) => {
    const aov = d.redemptions > 0 ? d.revenue / d.redemptions : 0;
    return {
      offerId: d.id,
      code: d.code,
      title: d.title,
      type: d.type,
      redemptions: d.redemptions,
      uniqueCustomers: d.customers,
      discountGiven: d.discount,
      revenue: d.revenue,
      avgOrderValue: Math.round(aov),
      aovLiftPct: overallAov > 0 ? round(((aov - overallAov) / overallAov) * 100) : 0,
      returnOnDiscount: d.discount > 0 ? round(d.revenue / d.discount, 2) : 0,
    };
  });
}

export async function rushHours(range: Range): Promise<RushHours> {
  const tz = range.timezone;
  const [cells, hourly, weekdays] = await Promise.all([
    rows<{ dow: number; hour: number; orders: number; net: number }>(sql`
      select extract(dow from o.placed_at at time zone ${tz})::int as dow,
             extract(hour from o.placed_at at time zone ${tz})::int as hour,
             count(*)::int as orders,
             sum(o.item_total - o.coupon_discount)::float8 as net
      from orders o where ${salesWhere(range)} group by 1, 2`),
    rows<{ hour: number; orders: number; net: number; delivery: number; pickup: number; in_store: number }>(sql`
      select extract(hour from o.placed_at at time zone ${tz})::int as hour,
             count(*)::int as orders,
             sum(o.item_total - o.coupon_discount)::float8 as net,
             count(*) filter (where o.channel = 'DELIVERY')::int as delivery,
             count(*) filter (where o.channel = 'PICKUP')::int as pickup,
             count(*) filter (where o.channel = 'IN_STORE')::int as in_store
      from orders o where ${salesWhere(range)} group by 1 order by 1`),
    rows<{ dow: number; orders: number; net: number }>(sql`
      select extract(dow from o.placed_at at time zone ${tz})::int as dow, count(*)::int as orders,
             sum(o.item_total - o.coupon_discount)::float8 as net
      from orders o where ${salesWhere(range)} group by 1 order by 1`),
  ]);
  const total = hourly.reduce((sum, h) => sum + h.orders, 0);
  const byHour = new Map(hourly.map((h) => [h.hour, h]));
  return {
    heatmap: cells.map((c) => ({ dow: c.dow, hour: c.hour, orders: c.orders, netSales: c.net })),
    hourly: Array.from({ length: 24 }, (_, hour) => {
      const h = byHour.get(hour);
      return {
        hour,
        orders: h?.orders ?? 0,
        netSales: h?.net ?? 0,
        DELIVERY: h?.delivery ?? 0,
        PICKUP: h?.pickup ?? 0,
        IN_STORE: h?.in_store ?? 0,
      };
    }),
    peakHours: [...hourly]
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 3)
      .map((h) => ({ hour: h.hour, orders: h.orders, share: total > 0 ? round((h.orders / total) * 100) : 0 })),
    byWeekday: Array.from({ length: 7 }, (_, dow) => {
      const w = weekdays.find((d) => d.dow === dow);
      return { dow, orders: w?.orders ?? 0, netSales: w?.net ?? 0 };
    }),
  };
}

export async function paymentMix(range: Range): Promise<PaymentMix[]> {
  const data = await rows<{ method: PaymentMethodType; orders: number; amount: number }>(sql`
    select o.payment_method as method, count(*)::int as orders, sum(o.total)::float8 as amount
    from orders o where ${salesWhere(range)} and o.payment_method is not null
    group by 1 order by orders desc`);
  const total = data.reduce((sum, d) => sum + d.orders, 0);
  return data.map((d) => ({ method: d.method, orders: d.orders, amount: d.amount, share: total > 0 ? round((d.orders / total) * 100) : 0 }));
}

export async function inventoryHealth(storeId: string): Promise<InventoryHealth> {
  const since = new Date(Date.now() - 28 * 86_400_000);
  const [totalsRow] = await rows<{ skus: number; cost: number; retail: number; low: number; out: number }>(sql`
    select count(*)::int as skus,
           sum((sp.shelf_qty + sp.storage_qty) * sp.cost)::float8 as cost,
           sum((sp.shelf_qty + sp.storage_qty) * sp.price)::float8 as retail,
           count(*) filter (where sp.shelf_qty <= sp.reorder_threshold and sp.shelf_qty + sp.storage_qty > 0)::int as low,
           count(*) filter (where sp.shelf_qty + sp.storage_qty = 0)::int as out
    from store_products sp where sp.store_id = ${storeId} and sp.is_available`);
  const velocity = await rows<{
    product_id: string;
    name: string;
    emoji: string;
    unit: string;
    shelf: number;
    storage: number;
    sold: number;
    stock_value: number;
  }>(sql`
    select p.id as product_id, p.name, p.emoji, p.unit, sp.shelf_qty as shelf, sp.storage_qty as storage,
           coalesce(s.sold, 0)::int as sold,
           ((sp.shelf_qty + sp.storage_qty) * sp.cost)::float8 as stock_value
    from store_products sp
    join products p on p.id = sp.product_id
    left join (
      select i.product_id, sum(i.quantity) as sold
      from order_items i join orders o on o.id = i.order_id
      where o.store_id = ${storeId} and o.placed_at >= ${since} and o.status <> 'CANCELLED'
      group by i.product_id
    ) s on s.product_id = sp.product_id
    where sp.store_id = ${storeId} and sp.is_available`);
  const withCover = velocity.map((v) => {
    const avgDaily = v.sold / 28;
    const stock = v.shelf + v.storage;
    return { ...v, avgDaily, stock, daysOfCover: avgDaily > 0 ? stock / avgDaily : Infinity };
  });
  return {
    skuCount: totalsRow?.skus ?? 0,
    stockCostValue: totalsRow?.cost ?? 0,
    stockRetailValue: totalsRow?.retail ?? 0,
    lowStock: totalsRow?.low ?? 0,
    outOfStock: totalsRow?.out ?? 0,
    reorderSuggestions: withCover
      .filter((v) => v.avgDaily > 0 && v.daysOfCover < 10)
      .sort((a, b) => a.daysOfCover - b.daysOfCover)
      .slice(0, 12)
      .map((v) => ({
        productId: v.product_id,
        name: v.name,
        emoji: v.emoji,
        unit: v.unit,
        shelfQty: v.shelf,
        storageQty: v.storage,
        avgDailySales: round(v.avgDaily, 1),
        daysOfCover: round(v.daysOfCover, 1),
        suggestedOrderQty: Math.max(0, Math.ceil(v.avgDaily * 21 - v.stock)),
      })),
    slowMovers: withCover
      .filter((v) => v.stock > 0 && v.sold <= 3)
      .sort((a, b) => b.stock_value - a.stock_value)
      .slice(0, 10)
      .map((v) => ({ productId: v.product_id, name: v.name, emoji: v.emoji, stock: v.stock, unitsSold: v.sold, stockValue: v.stock_value })),
  };
}

export async function basketInsights(range: Range, limit: number): Promise<BasketInsights> {
  const [sizes] = await rows<{ items: number; distinct_products: number }>(sql`
    select coalesce(avg(o.item_count), 0)::float8 as items,
           coalesce(avg((select count(*) from order_items i where i.order_id = o.id)), 0)::float8 as distinct_products
    from orders o where ${salesWhere(range)}`);
  const pairs = await rows<{
    a_id: string;
    a_name: string;
    a_emoji: string;
    b_id: string;
    b_name: string;
    b_emoji: string;
    together: number;
    a_orders: number;
    b_orders: number;
    total_orders: number;
  }>(sql`
    with sale_items as (
      select i.order_id, i.product_id, i.name, i.emoji
      from order_items i join orders o on o.id = i.order_id
      where ${salesWhere(range)}
    ), product_orders as (
      select product_id, count(distinct order_id) as orders from sale_items group by product_id
    ), total as (
      select count(distinct order_id) as orders from sale_items
    )
    select a.product_id as a_id, max(a.name) as a_name, max(a.emoji) as a_emoji,
           b.product_id as b_id, max(b.name) as b_name, max(b.emoji) as b_emoji,
           count(*)::int as together,
           max(pa.orders)::int as a_orders, max(pb.orders)::int as b_orders, max(t.orders)::int as total_orders
    from sale_items a
    join sale_items b on a.order_id = b.order_id and a.product_id < b.product_id
    join product_orders pa on pa.product_id = a.product_id
    join product_orders pb on pb.product_id = b.product_id
    cross join total t
    group by a.product_id, b.product_id
    having count(*) >= 5
    order by (count(*)::float8 * max(t.orders)) / (max(pa.orders) * max(pb.orders)) desc, together desc
    limit ${limit}`);
  return {
    avgItemsPerOrder: round(sizes?.items ?? 0, 1),
    avgDistinctProducts: round(sizes?.distinct_products ?? 0, 1),
    pairs: pairs.map((p) => ({
      a: { id: p.a_id, name: p.a_name, emoji: p.a_emoji },
      b: { id: p.b_id, name: p.b_name, emoji: p.b_emoji },
      orders: p.together,
      lift: round((p.together * p.total_orders) / Math.max(1, p.a_orders * p.b_orders), 2),
    })),
  };
}

export async function customerInsights(range: Range): Promise<CustomerInsights> {
  const { start } = window(range);
  const [dietary, weekly, localities] = await Promise.all([
    rows<{ tag: DietaryTag; customers: number; total: number }>(sql`
      with shoppers as (select distinct o.user_id from orders o where ${salesWhere(range)})
      select tag, count(*)::int as customers, (select count(*) from shoppers)::int as total
      from shoppers s join customer_profiles cp on cp.user_id = s.user_id
      cross join lateral unnest(cp.dietary_preferences) as tag
      group by tag order by customers desc`),
    rows<{ period: string; new_customers: number; returning_customers: number }>(sql`
      with first_orders as (
        select o.user_id, min(o.placed_at) as first_at from orders o
        where o.status <> 'CANCELLED' and o.placed_at is not null
        ${range.storeId ? sql`and o.store_id = ${range.storeId}` : sql``}
        group by o.user_id
      )
      select to_char(date_trunc('week', o.placed_at at time zone ${range.timezone}), 'YYYY-MM-DD') as period,
             count(distinct o.user_id) filter (where date_trunc('week', f.first_at) = date_trunc('week', o.placed_at))::int as new_customers,
             count(distinct o.user_id) filter (where date_trunc('week', f.first_at) < date_trunc('week', o.placed_at))::int as returning_customers
      from orders o join first_orders f on f.user_id = o.user_id
      where ${salesWhere(range)} and o.placed_at >= ${start}
      group by 1 order by 1`),
    rows<{ locality: string; orders: number }>(sql`
      select trim(split_part(o.address->>'line2', ',', -1)) as locality, count(*)::int as orders
      from orders o where ${salesWhere(range)} and o.channel = 'DELIVERY' and o.address is not null
      group by 1 order by orders desc limit 8`),
  ]);
  return {
    dietary: dietary.map((d) => ({ tag: d.tag, customers: d.customers, share: d.total > 0 ? round((d.customers / d.total) * 100) : 0 })),
    newVsReturning: weekly.map((w) => ({ period: w.period, newCustomers: w.new_customers, returningCustomers: w.returning_customers })),
    topLocalities: localities.filter((l) => l.locality),
  };
}

export async function staffPerformance(range: Range & { storeId: string }): Promise<StaffPerformance[]> {
  const { start, end } = window(range);
  const data = await rows<{
    id: string;
    name: string;
    role: StaffPerformance['role'];
    department: StaffPerformance['department'];
    completed: number;
    open: number;
    rating: number | null;
    minutes: number;
    days: number;
    late_days: number;
  }>(sql`
    select e.id, e.full_name as name, e.role, e.department,
      (select count(*) from tasks t where t.assignee_id = e.id and t.status in ('DONE', 'APPROVED')
         and t.completed_at >= ${start} and t.completed_at < ${end})::int as completed,
      (select count(*) from tasks t where t.assignee_id = e.id and t.status in ('TODO', 'IN_PROGRESS', 'REOPENED'))::int as open,
      (select avg(t.review_rating) from tasks t where t.assignee_id = e.id and t.review_rating is not null
         and t.reviewed_at >= ${start} and t.reviewed_at < ${end})::float8 as rating,
      coalesce((select sum(a.worked_minutes) from attendance_records a where a.employee_id = e.id
         and a.clock_in_at >= ${start} and a.clock_in_at < ${end}), 0)::int as minutes,
      (select count(distinct (a.clock_in_at at time zone ${range.timezone})::date) from attendance_records a
         where a.employee_id = e.id and a.clock_in_at >= ${start} and a.clock_in_at < ${end})::int as days,
      (select count(*) from attendance_records a where a.employee_id = e.id and a.late_by_minutes > 0
         and a.clock_in_at >= ${start} and a.clock_in_at < ${end})::int as late_days
    from employees e
    where e.store_id = ${range.storeId} and e.status in ('ACTIVE', 'ON_LEAVE') and e.role <> 'OWNER'
    order by completed desc, name`);
  return data.map((d) => ({
    employeeId: d.id,
    name: d.name,
    role: d.role,
    department: d.department,
    tasksCompleted: d.completed,
    tasksOpen: d.open,
    avgRating: d.rating === null ? null : round(d.rating, 1),
    minutesWorked: d.minutes,
    daysPresent: d.days,
    lateDays: d.late_days,
    onTimeRate: d.days > 0 ? round(((d.days - Math.min(d.late_days, d.days)) / d.days) * 100) : 0,
  }));
}

/** Day-by-day sales as CSV (for accountants / spreadsheets). */
export async function dailyCsv(range: Range): Promise<string> {
  const data = await rows<{ day: string; orders: number; gross: number; discounts: number; net: number; cogs: number; tax: number }>(sql`
    select to_char((o.placed_at at time zone ${range.timezone})::date, 'YYYY-MM-DD') as day,
           count(*)::int as orders, sum(o.item_total)::float8 as gross, sum(o.coupon_discount)::float8 as discounts,
           sum(o.item_total - o.coupon_discount)::float8 as net, sum(o.cost_total)::float8 as cogs, sum(o.tax_included)::float8 as tax
    from orders o where ${salesWhere(range)} group by 1 order by 1`);
  const rupees = (minor: number) => (minor / 100).toFixed(2);
  const lines = ['date,orders,gross_sales,discounts,net_sales,cogs,gross_profit,gst_included'];
  for (const d of data) {
    lines.push([d.day, d.orders, rupees(d.gross), rupees(d.discounts), rupees(d.net), rupees(d.cogs), rupees(d.net - d.cogs), rupees(d.tax)].join(','));
  }
  return lines.join('\n');
}
