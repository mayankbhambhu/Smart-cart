import { generateLayout, type CandidateDetails, type DietaryTag, type StaffRole } from '@smartcart/shared';
import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import { hashPassword, randomToken, sha256 } from '../../lib/crypto';
import { logger } from '../../lib/logger';
import { addDays, zonedParts } from '../../lib/time';
import { DEFAULT_STORE_SETTINGS } from '../../modules/stores/settings';
import { db } from '../client';
import {
  addresses,
  categories,
  credentialRequestEvents,
  credentialRequests,
  customerProfiles,
  devices,
  employees,
  instoreSessionItems,
  instoreSessions,
  listItems,
  listMembers,
  notifications,
  offers,
  paymentMethods,
  products,
  restockAlerts,
  shoppingLists,
  storeProducts,
  stores,
  ticketMessages,
  tickets,
  users,
} from '../schema';
import { AISLE_LABELS, CATEGORIES, PRODUCTS, ean13 } from './catalog';
import { seedOrderHistory, type HistoryCustomer, type HistoryOffer, type HistoryStore } from './history';
import { CITIES_BY_STORE, FIRST_NAMES, LAST_NAMES } from './people';
import { chunk, Random } from './random';
import { seedShiftsAndAttendance, seedStoreStaff, seedTasks, type SeededEmployee, type StaffSpec } from './workforce';

export const DEMO_PASSWORDS = { admin: 'Admin@1234', staff: 'Staff@1234', customer: 'Customer@123' };

const STORE_SPECS = [
  {
    code: 'BLR-IND-01',
    name: 'SmartCart Indiranagar',
    addressLine: '612, 100 Feet Road, HAL 2nd Stage, Indiranagar',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560038',
    lat: 12.9719,
    lng: 77.6412,
    phone: '+918040001001',
    openingTime: '00:00',
    closingTime: '00:00',
    baseDailyOrders: 38,
    priceFactor: 1,
  },
  {
    code: 'BLR-KOR-02',
    name: 'SmartCart Koramangala',
    addressLine: '45, 80 Feet Road, Koramangala 4th Block',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560034',
    lat: 12.9352,
    lng: 77.6245,
    phone: '+918040001002',
    openingTime: '06:00',
    closingTime: '00:00',
    baseDailyOrders: 30,
    priceFactor: 1,
  },
  {
    code: 'MUM-BAN-01',
    name: 'SmartCart Bandra West',
    addressLine: '18, Hill Road, Bandra West',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400050',
    lat: 19.0596,
    lng: 72.8295,
    phone: '+912240001003',
    openingTime: '06:00',
    closingTime: '00:00',
    baseDailyOrders: 34,
    priceFactor: 1.04,
  },
] as const;

function staffSpecs(rng: Random, storeCode: string, owner: { name: string; username: string; phone: string }): StaffSpec[] {
  const named: Record<string, { manager: string; floor: string[]; workers: [string, StaffSpec['department']][] }> = {
    'BLR-IND-01': {
      manager: 'Kavya Reddy',
      floor: ['Vikram Singh', 'Ananya Iyer'],
      workers: [
        ['Rahul Yadav', 'WAREHOUSE'],
        ['Imran Khan', 'WAREHOUSE'],
        ['Pooja Nair', 'PICKING'],
        ['Suresh Kumar', 'PICKING'],
        ['Meera Joshi', 'FLOOR'],
        ['Joseph Fernandes', 'FLOOR'],
        ['Ravi Teja', 'DELIVERY'],
        ['Lakshmi Pillai', 'SECURITY'],
      ],
    },
    'BLR-KOR-02': {
      manager: 'Nikhil Rao',
      floor: ['Shreya Menon'],
      workers: [
        ['Arun Gowda', 'WAREHOUSE'],
        ['Divya Shetty', 'PICKING'],
        ['Mohammed Irfan', 'FLOOR'],
        ['Tanvi Bhat', 'CUSTOMER_SERVICE'],
        ['Kiran Hegde', 'DELIVERY'],
        ['Sunil Das', 'SECURITY'],
      ],
    },
    'MUM-BAN-01': {
      manager: 'Rohan Kulkarni',
      floor: ['Zoya Shaikh', 'Aditya Desai'],
      workers: [
        ['Rakesh More', 'WAREHOUSE'],
        ['Sneha Patil', 'WAREHOUSE'],
        ['Farhan Ansari', 'PICKING'],
        ['Maria D’Souza', 'FLOOR'],
        ['Ganesh Jadhav', 'DELIVERY'],
        ['Priyanka Sawant', 'CUSTOMER_SERVICE'],
      ],
    },
  };
  const plan = named[storeCode]!;
  const username = (name: string) =>
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[’']/g, '')
      .replace(/[^a-z\s]/g, '')
      .trim()
      .replace(/\s+/g, '.');
  const phone = () => `+9197${rng.int(10000000, 99999999)}`;
  return [
    { name: owner.name, username: owner.username, role: 'OWNER', department: 'MANAGEMENT', designation: 'Franchise owner', wageType: 'MONTHLY', wage: 0, joinedDaysAgo: 900, phone: owner.phone },
    { name: plan.manager, username: username(plan.manager), role: 'STORE_MANAGER', department: 'MANAGEMENT', designation: 'Store manager', wageType: 'MONTHLY', wage: 58000, joinedDaysAgo: rng.int(400, 800), phone: phone() },
    ...plan.floor.map((name) => ({
      name,
      username: username(name),
      role: 'FLOOR_MANAGER' as StaffRole,
      department: 'FLOOR' as const,
      designation: 'Floor manager',
      wageType: 'MONTHLY' as const,
      wage: rng.pick([32000, 34000, 36000]),
      joinedDaysAgo: rng.int(200, 700),
      phone: phone(),
    })),
    ...plan.workers.map(([name, department], index) => ({
      name,
      username: username(name),
      role: 'WORKER' as StaffRole,
      department,
      designation: department === 'WAREHOUSE' ? 'Stock associate' : department === 'PICKING' ? 'Picker' : department === 'DELIVERY' ? 'Delivery partner' : department === 'SECURITY' ? 'Exit & security' : 'Store associate',
      wageType: index === plan.workers.length - 1 ? ('HOURLY' as const) : ('MONTHLY' as const),
      wage: index === plan.workers.length - 1 ? 130 : rng.pick([18000, 19500, 21000, 22500]),
      joinedDaysAgo: rng.int(30, 600),
      phone: phone(),
    })),
  ];
}

async function truncateAll(): Promise<void> {
  const tables = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const names = tables.rows.map((t) => `"${t.tablename}"`).join(', ');
  if (names) await db.execute(sql.raw(`TRUNCATE ${names} RESTART IDENTITY CASCADE`));
}

export async function seed(): Promise<void> {
  const started = Date.now();
  const rng = new Random(20261026);
  const now = new Date();
  await truncateAll();

  const [adminHash, staffHash, customerHash] = await Promise.all([
    hashPassword(DEMO_PASSWORDS.admin),
    hashPassword(DEMO_PASSWORDS.staff),
    hashPassword(DEMO_PASSWORDS.customer),
  ]);

  // --- Admin team -----------------------------------------------------------
  const adminRows = await db
    .insert(users)
    .values([
      { kind: 'ADMIN', name: 'Aarav Kapoor', email: 'admin@smartcart.dev', adminRole: 'SUPER_ADMIN', passwordHash: adminHash },
      { kind: 'ADMIN', name: 'Neha Verma', email: 'ops@smartcart.dev', adminRole: 'ADMIN', passwordHash: adminHash },
      { kind: 'ADMIN', name: 'Rohan Das', email: 'support@smartcart.dev', adminRole: 'SUPPORT', passwordHash: adminHash },
    ])
    .returning();
  const superAdmin = adminRows[0]!;
  const opsAdmin = adminRows[1]!;

  // --- Catalogue -----------------------------------------------------------
  const categoryRows = await db
    .insert(categories)
    .values(CATEGORIES.map((c, i) => ({ slug: c.slug, name: c.name, emoji: c.emoji, color: c.color, sortOrder: i })))
    .returning();
  const categoryBySlug = new Map(categoryRows.map((c) => [c.slug, c]));
  const categoryMeta = new Map(CATEGORIES.map((c) => [c.slug, c]));

  let sequence = 0;
  const productInserts: (typeof products.$inferInsert)[] = [];
  const shortNames = new Map<string, string>();
  for (const [slug, rows] of Object.entries(PRODUCTS)) {
    const meta = categoryMeta.get(slug)!;
    const category = categoryBySlug.get(slug)!;
    rows.forEach(([name, brand, unit, mrp, price, emoji, tags, allergens]) => {
      sequence++;
      shortNames.set(`SKU-${String(sequence).padStart(5, '0')}`, name);
      productInserts.push({
        sku: `SKU-${String(sequence).padStart(5, '0')}`,
        barcode: ean13(sequence),
        name: brand === 'Fresh' || name.startsWith(brand) ? name : `${brand} ${name}`,
        brand,
        description: `${name} (${unit}). Fresh stock, quality checked at the store.`,
        categoryId: category.id,
        unit,
        mrp: mrp * 100,
        defaultPrice: price * 100,
        defaultCost: Math.round(price * 100 * meta.costRatio),
        taxRate: meta.taxRate,
        emoji,
        color: category.color,
        dietaryTags: tags,
        allergens: allergens ?? [],
        maxOrderQty: price > 500 ? 4 : 10,
      });
    });
  }
  const productRows = await db.insert(products).values(productInserts).returning();

  // --- Stores --------------------------------------------------------------
  const layout = generateLayout({ aisles: AISLE_LABELS.map((label) => ({ label })) });
  const storeRows = await db
    .insert(stores)
    .values(
      STORE_SPECS.map((s) => ({
        code: s.code,
        name: s.name,
        addressLine: s.addressLine,
        city: s.city,
        state: s.state,
        pincode: s.pincode,
        lat: s.lat,
        lng: s.lng,
        phone: s.phone,
        openingTime: s.openingTime,
        closingTime: s.closingTime,
        email: `${s.code.toLowerCase()}@stores.smartcart.dev`,
        layout,
        settings: DEFAULT_STORE_SETTINGS,
        kioskSecret: randomToken(24),
        createdAt: new Date(now.getTime() - 400 * 86_400_000),
      })),
    )
    .returning();
  const storeByCode = new Map(storeRows.map((s) => [s.code, s]));

  // --- Staff ---------------------------------------------------------------
  const owners = {
    arjun: { name: 'Arjun Mehta', username: 'arjun.mehta', phone: '+919845000001' },
    sneha: { name: 'Sneha Kapoor', username: 'sneha.kapoor', phone: '+919820000002' },
  };
  const staffUsers = new Map<string, string>();
  const staffByStore = new Map<string, SeededEmployee[]>();
  for (const spec of STORE_SPECS) {
    const store = storeByCode.get(spec.code)!;
    const owner = spec.code === 'MUM-BAN-01' ? owners.sneha : owners.arjun;
    const staff = await seedStoreStaff(store, staffSpecs(rng, spec.code, owner), staffHash, now, staffUsers);
    staffByStore.set(store.id, staff);
  }
  await db.execute(sql`
    insert into counters (key, value)
    select 'employee:' || s.code, count(e.id) from stores s left join employees e on e.store_id = s.id group by s.code
    on conflict (key) do update set value = excluded.value
  `);

  // --- Customers -----------------------------------------------------------
  const demoCustomers = await db
    .insert(users)
    .values([
      { kind: 'CUSTOMER', name: 'Priya Sharma', email: 'priya@example.com', phone: '+919900000001', passwordHash: customerHash, phoneVerifiedAt: now },
      { kind: 'CUSTOMER', name: 'Rohit Sharma', email: 'rohit@example.com', phone: '+919900000002', passwordHash: customerHash, phoneVerifiedAt: now },
    ])
    .returning();
  const priya = demoCustomers[0]!;
  const rohit = demoCustomers[1]!;
  const indiranagar = storeByCode.get('BLR-IND-01')!;
  const koramangala = storeByCode.get('BLR-KOR-02')!;
  const bandra = storeByCode.get('MUM-BAN-01')!;

  const generated: { name: string; phone: string; email: string; storeCode: string; weight: number; diet: DietaryTag[] }[] = [];
  for (let i = 0; i < 240; i++) {
    const first = rng.pick(FIRST_NAMES);
    const last = rng.pick(LAST_NAMES);
    const storeCode = rng.weighted(['BLR-IND-01', 'BLR-KOR-02', 'MUM-BAN-01'], (c) => (c === 'BLR-IND-01' ? 40 : 30));
    const diet: DietaryTag[] = [];
    if (rng.chance(0.46)) diet.push('VEGETARIAN');
    if (rng.chance(0.09)) diet.push('VEGAN');
    if (rng.chance(0.07)) diet.push('GLUTEN_FREE');
    if (rng.chance(0.12)) diet.push('HIGH_PROTEIN');
    if (rng.chance(0.05)) diet.push('JAIN');
    if (rng.chance(0.04)) diet.push('KETO');
    if (rng.chance(0.06)) diet.push('ORGANIC');
    generated.push({
      name: `${first} ${last}`,
      phone: `+9198${String(10000000 + i * 7919).slice(-8)}`,
      email: `${first}.${last}.${i}@example.com`.toLowerCase().replace(/[^a-z0-9.@]/g, ''),
      storeCode,
      weight: Math.pow(rng.next(), 2.2) * 10 + 0.3,
      diet: [...new Set(diet)],
    });
  }
  const generatedRows = await db
    .insert(users)
    .values(
      generated.map((g) => ({
        kind: 'CUSTOMER' as const,
        name: g.name,
        email: g.email,
        phone: g.phone,
        passwordHash: customerHash,
        createdAt: new Date(now.getTime() - rng.int(130, 400) * 86_400_000),
      })),
    )
    .returning();
  await db.insert(customerProfiles).values([
    { userId: priya.id, dietaryPreferences: ['VEGETARIAN', 'HIGH_PROTEIN'], allergens: ['PEANUTS'], defaultStoreId: indiranagar.id, loyaltyPoints: 420 },
    { userId: rohit.id, dietaryPreferences: ['HIGH_PROTEIN'], allergens: [], defaultStoreId: indiranagar.id, loyaltyPoints: 180 },
    ...generatedRows.map((u, i) => ({
      userId: u.id,
      dietaryPreferences: generated[i]!.diet,
      defaultStoreId: storeByCode.get(generated[i]!.storeCode)!.id,
      loyaltyPoints: rng.int(0, 600),
    })),
  ]);

  const customerAddress = (storeCode: string, name: string, phone: string): HistoryCustomer['address'] => {
    const place = CITIES_BY_STORE[storeCode]!;
    const store = storeByCode.get(storeCode)!;
    return {
      label: 'HOME',
      line1: `${rng.int(1, 999)}, ${rng.pick(['Lakeview', 'Palm Grove', 'Sunrise', 'Green Park', 'Silver Oak'])} Apartments`,
      line2: `${rng.int(1, 18)}th Cross, ${rng.pick(place.localities)}`,
      landmark: rng.chance(0.5) ? 'Near the metro station' : null,
      city: place.city,
      state: place.state,
      pincode: place.pincode,
      lat: store.lat + (rng.next() - 0.5) * 0.03,
      lng: store.lng + (rng.next() - 0.5) * 0.03,
      receiverName: name,
      receiverPhone: phone,
    };
  };

  const historyCustomers = new Map<string, HistoryCustomer[]>();
  generatedRows.forEach((u, i) => {
    const g = generated[i]!;
    const list = historyCustomers.get(g.storeCode) ?? [];
    // 40% were already customers when the history starts; the rest sign up over the 120 days.
    const joinDay = rng.chance(0.4) ? 0 : rng.int(1, 118);
    list.push({ id: u.id, name: u.name, phone: g.phone, weight: g.weight, joinDay, address: customerAddress(g.storeCode, u.name, g.phone) });
    historyCustomers.set(g.storeCode, list);
  });
  const priyaHome: HistoryCustomer['address'] = {
    label: 'HOME',
    line1: 'Flat 302, Lakeview Apartments',
    line2: '12th Main Road, HAL 2nd Stage, Indiranagar',
    landmark: 'Opposite Indiranagar Metro',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560038',
    lat: 12.9755,
    lng: 77.6389,
    receiverName: 'Priya Sharma',
    receiverPhone: '+919900000001',
  };
  historyCustomers.get('BLR-IND-01')!.push(
    { id: priya.id, name: priya.name, phone: priya.phone!, weight: 6, joinDay: 0, address: priyaHome },
    {
      id: rohit.id,
      name: rohit.name,
      phone: rohit.phone!,
      weight: 3,
      joinDay: 0,
      address: { ...priyaHome, receiverName: 'Rohit Sharma', receiverPhone: '+919900000002' },
    },
  );

  await db.insert(addresses).values([
    { userId: priya.id, ...priyaHome, isDefault: true },
    {
      userId: priya.id,
      label: 'WORK',
      line1: 'Floor 6, Embassy Golf Links',
      line2: 'Intermediate Ring Road, Domlur',
      landmark: 'Tower C',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560071',
      lat: 12.9539,
      lng: 77.6431,
      receiverName: 'Priya Sharma',
      receiverPhone: '+919900000001',
    },
    { userId: rohit.id, ...priyaHome, receiverName: 'Rohit Sharma', receiverPhone: '+919900000002', isDefault: true },
  ]);
  await db.insert(paymentMethods).values([
    { userId: priya.id, type: 'UPI', provider: 'demo', label: 'priya.sharma@okhdfcbank', upiId: 'priya.sharma@okhdfcbank', isDefault: true },
    { userId: priya.id, type: 'CARD', provider: 'demo', label: 'Visa •••• 4242', brand: 'Visa', last4: '4242', expMonth: 8, expYear: 2029 },
    { userId: priya.id, type: 'PAYPAL', provider: 'demo', label: 'PayPal · priya@example.com', email: 'priya@example.com' },
    { userId: rohit.id, type: 'UPI', provider: 'demo', label: 'rohit.s@okaxis', upiId: 'rohit.s@okaxis', isDefault: true },
  ]);

  // --- Store inventory -----------------------------------------------------
  const rowsByAisle = new Map<number, number>();
  const placement = new Map<string, { aisle: number; row: number }>();
  for (const product of productRows) {
    const category = categoryRows.find((c) => c.id === product.categoryId)!;
    const aisle = categoryMeta.get(category.slug)!.aisle;
    const index = rowsByAisle.get(aisle) ?? 0;
    rowsByAisle.set(aisle, index + 1);
    placement.set(product.id, { aisle, row: 1 + (Math.floor(index / 4) % layout.aisles[aisle - 1]!.rows) });
  }

  const historyStores: HistoryStore[] = [];
  const inventoryByStore = new Map<string, (typeof storeProducts.$inferSelect)[]>();
  for (const spec of STORE_SPECS) {
    const store = storeByCode.get(spec.code)!;
    const carried = productRows.filter((p) => !(spec.code === 'BLR-KOR-02' && p.name.includes('Alphonso')));
    const inserts = carried.map((product) => {
      const spot = placement.get(product.id)!;
      const price = Math.round((product.defaultPrice * spec.priceFactor) / 100) * 100;
      const threshold = rng.int(5, 9);
      const lowNow = rng.chance(0.045);
      return {
        storeId: store.id,
        productId: product.id,
        price: Math.min(Math.max(price, product.defaultPrice), Math.max(product.mrp, product.defaultPrice)),
        cost: product.defaultCost,
        shelfQty: lowNow ? rng.int(0, threshold) : rng.int(threshold + 4, 42),
        storageQty: lowNow && rng.chance(0.3) ? rng.int(0, 4) : rng.int(18, 140),
        reorderThreshold: threshold,
        restockTarget: rng.pick([24, 30, 36, 40]),
        aisle: spot.aisle,
        row: spot.row,
        shelf: rng.int(1, 5),
      };
    });
    const spRows: (typeof storeProducts.$inferSelect)[] = [];
    for (const rows of chunk(inserts, 500)) spRows.push(...(await db.insert(storeProducts).values(rows).returning()));
    inventoryByStore.set(store.id, spRows);
  }

  // --- Offers --------------------------------------------------------------
  const yearAgo = new Date(now.getTime() - 365 * 86_400_000);
  const inSixMonths = new Date(now.getTime() + 180 * 86_400_000);
  const lassi = productRows.find((p) => p.name.includes('Lassi'))!;
  const offerRows = await db
    .insert(offers)
    .values([
      { code: 'WELCOME50', title: '₹50 off your first order', description: 'On orders above ₹199. New customers only.', type: 'FLAT_OFF', value: 5000, minOrderValue: 19900, usageLimitPerUser: 1, startsAt: yearAgo, endsAt: inSixMonths, bannerColor: '#0f8a4b', createdById: superAdmin.id },
      { code: 'FRESH20', title: '20% off fruits & vegetables', description: 'Up to ₹100 off on fresh produce.', type: 'PERCENT_OFF', value: 20, maxDiscount: 10000, categoryId: categoryBySlug.get('fruits-vegetables')!.id, startsAt: yearAgo, endsAt: inSixMonths, bannerColor: '#16a34a', createdById: superAdmin.id },
      { code: 'WEEKEND15', title: 'Weekend stock-up: 15% off', description: '15% off on orders above ₹999, up to ₹150.', type: 'PERCENT_OFF', value: 15, minOrderValue: 99900, maxDiscount: 15000, startsAt: yearAgo, endsAt: inSixMonths, bannerColor: '#7c3aed', createdById: superAdmin.id },
      { code: 'FREEDEL', title: 'Free delivery today', description: 'No delivery fee on orders above ₹99.', type: 'FREE_DELIVERY', value: 0, minOrderValue: 9900, channels: ['DELIVERY'], startsAt: yearAgo, endsAt: inSixMonths, bannerColor: '#f59e0b', createdById: superAdmin.id },
      { code: 'SCANGO10', title: 'Scan & Go: 10% off', description: 'Skip the queue and save 10% (up to ₹75) when you pay in the app in store.', type: 'PERCENT_OFF', value: 10, maxDiscount: 7500, channels: ['IN_STORE'], startsAt: yearAgo, endsAt: inSixMonths, bannerColor: '#0ea5e9', createdById: superAdmin.id },
      { code: 'LASSI3', title: 'Buy 2 Lassi, get 1 free', description: 'Amul Rose Lassi 200 ml.', type: 'BOGO', value: 0, productId: lassi.id, buyQty: 2, getQty: 1, startsAt: yearAgo, endsAt: inSixMonths, bannerColor: '#ec4899', createdById: superAdmin.id },
      { storeId: bandra.id, code: 'BANDRA25', title: '₹25 off at Bandra West', description: 'On orders above ₹299 at our Bandra store.', type: 'FLAT_OFF', value: 2500, minOrderValue: 29900, startsAt: yearAgo, endsAt: inSixMonths, bannerColor: '#e11d48', createdById: opsAdmin.id },
    ])
    .returning();

  // --- Devices (gates, smart carts, kiosk) ---------------------------------
  const deviceKeys: { store: string; name: string; key: string }[] = [];
  const gateIdsByStore = new Map<string, string[]>();
  for (const store of storeRows) {
    const specs = [
      { type: 'EXIT_GATE' as const, name: 'Exit Gate 1', slug: 'gate1' },
      { type: 'EXIT_GATE' as const, name: 'Exit Gate 2', slug: 'gate2' },
      { type: 'SMART_CART' as const, name: 'Smart Cart 01', slug: 'cart01' },
      { type: 'SMART_CART' as const, name: 'Smart Cart 02', slug: 'cart02' },
      { type: 'SMART_CART' as const, name: 'Smart Cart 03', slug: 'cart03' },
      { type: 'KIOSK' as const, name: 'Staff Entrance Kiosk', slug: 'kiosk' },
    ];
    const rows = await db
      .insert(devices)
      .values(
        specs.map((d) => {
          const key = `scdev_${store.code.toLowerCase()}_${d.slug}`;
          deviceKeys.push({ store: store.code, name: d.name, key });
          return {
            storeId: store.id,
            type: d.type,
            name: d.name,
            apiKeyHash: sha256(key),
            apiKeyPrefix: key.slice(0, 14),
            lastSeenAt: new Date(now.getTime() - rng.int(1, 30) * 60_000),
          };
        }),
      )
      .returning();
    gateIdsByStore.set(
      store.id,
      rows.filter((d) => d.type === 'EXIT_GATE').map((d) => d.id),
    );
  }

  // --- Order history ---------------------------------------------------------
  const productById = new Map(productRows.map((p) => [p.id, p]));
  for (const spec of STORE_SPECS) {
    const store = storeByCode.get(spec.code)!;
    const inventory = inventoryByStore.get(store.id)!;
    historyStores.push({
      id: store.id,
      code: store.code,
      name: store.name,
      timezone: store.timezone,
      baseDailyOrders: spec.baseDailyOrders,
      fees: DEFAULT_STORE_SETTINGS,
      customers: historyCustomers.get(spec.code)!,
      gateDeviceIds: gateIdsByStore.get(store.id)!,
      categoryWeights: new Map(CATEGORIES.map((c) => [categoryBySlug.get(c.slug)!.id, c.popularity])),
      products: inventory.map((sp, index) => {
        const product = productById.get(sp.productId)!;
        const category = categoryRows.find((c) => c.id === product.categoryId)!;
        return {
          id: product.id,
          storeProductId: sp.id,
          name: product.name,
          shortName: shortNames.get(product.sku) ?? product.name,
          brand: product.brand,
          unit: product.unit,
          emoji: product.emoji,
          color: product.color,
          barcode: product.barcode,
          categoryId: product.categoryId,
          categorySlug: category.slug,
          price: sp.price,
          mrp: product.mrp,
          cost: sp.cost,
          taxRate: product.taxRate,
          aisle: sp.aisle,
          row: sp.row,
          shelf: sp.shelf,
          // A few SKUs barely sell, so the slow-mover report has something to show.
          weight: index % 11 === 7 ? 0.03 : 1 / (1 + (index % 9) * 0.35),
        };
      }),
    });
  }
  const historyOffers: HistoryOffer[] = offerRows.map((o) => ({
    id: o.id,
    storeId: o.storeId,
    code: o.code,
    title: o.title,
    type: o.type,
    value: o.value,
    minOrderValue: o.minOrderValue,
    maxDiscount: o.maxDiscount,
    productId: o.productId,
    categoryId: o.categoryId,
    buyQty: o.buyQty,
    getQty: o.getQty,
    channels: o.channels,
  }));
  const historyDays = Number(process.env.SEED_HISTORY_DAYS ?? 120);
  const history = await seedOrderHistory(rng, historyStores, historyOffers, historyDays, now);

  // --- Workforce: shifts, attendance, tasks ----------------------------------
  let shiftCount = 0;
  let attendanceCount = 0;
  let taskCount = 0;
  for (const store of storeRows) {
    const staff = staffByStore.get(store.id)!;
    const result = await seedShiftsAndAttendance(rng, store, staff, now);
    shiftCount += result.shifts;
    attendanceCount += result.attendance;
    taskCount += await seedTasks(rng, store.id, staff, now);
  }

  // --- Restock alerts for the shelves that are already low -------------------
  const lowRows = await db
    .select()
    .from(storeProducts)
    .where(lte(storeProducts.shelfQty, storeProducts.reorderThreshold));
  if (lowRows.length > 0) {
    await db.insert(restockAlerts).values(
      lowRows.map((sp, i) => {
        const warehouse = staffByStore.get(sp.storeId)!.find((e) => e.department === 'WAREHOUSE');
        const acknowledged = i % 3 === 0 && warehouse;
        return {
          storeId: sp.storeId,
          storeProductId: sp.id,
          productId: sp.productId,
          level: sp.shelfQty === 0 ? ('OUT_OF_STOCK' as const) : ('LOW' as const),
          status: acknowledged ? ('ACKNOWLEDGED' as const) : ('OPEN' as const),
          shelfQtyAtTrigger: sp.shelfQty,
          threshold: sp.reorderThreshold,
          acknowledgedById: acknowledged ? warehouse.userId : null,
          acknowledgedAt: acknowledged ? new Date(now.getTime() - 20 * 60_000) : null,
          createdAt: new Date(now.getTime() - rng.int(5, 180) * 60_000),
        };
      }),
    );
  }

  // --- Onboarding (credential) requests --------------------------------------
  const indStaff = staffByStore.get(indiranagar.id)!;
  const korStaff = staffByStore.get(koramangala.id)!;
  const banStaff = staffByStore.get(bandra.id)!;
  const managerOf = (staff: SeededEmployee[]) => staff.find((e) => e.role === 'STORE_MANAGER')!;
  const ownerOf = (staff: SeededEmployee[]) => staff.find((e) => e.role === 'OWNER')!;
  const candidate = (fullName: string, role: CandidateDetails['role'], department: CandidateDetails['department'], wage: number, joiningInDays: number): CandidateDetails => ({
    fullName,
    email: `${fullName.toLowerCase().replace(/[^a-z]+/g, '.')}@gmail.com`,
    phone: `+9199${rng.int(10000000, 99999999)}`,
    role,
    department,
    designation: role === 'FLOOR_MANAGER' ? 'Floor manager' : 'Store associate',
    joiningDate: addDays(zonedParts(now, 'Asia/Kolkata').date, joiningInDays),
    wageType: 'MONTHLY',
    wageAmount: wage * 100,
    dateOfBirth: `199${rng.int(0, 9)}-0${rng.int(1, 9)}-1${rng.int(0, 9)}`,
    address: 'Bengaluru, Karnataka',
    emergencyContactName: 'Parent',
    emergencyContactPhone: `+9198${rng.int(10000000, 99999999)}`,
    idProofType: 'AADHAAR',
    idProofLast4: String(rng.int(1000, 9999)),
    notes: null,
    reportsToId: null,
  });
  let requestSeq = 0;
  const year = now.getUTCFullYear();
  const requestPlans: {
    store: typeof indiranagar;
    staff: SeededEmployee[];
    details: CandidateDetails;
    status: (typeof credentialRequests.$inferInsert)['status'];
    comment?: string;
    daysAgo: number;
  }[] = [
    { store: indiranagar, staff: indStaff, details: candidate('Deepika Rao', 'FLOOR_MANAGER', 'FLOOR', 34000, 7), status: 'PENDING_ADMIN', daysAgo: 2 },
    { store: indiranagar, staff: indStaff, details: candidate('Manoj Tiwari', 'WORKER', 'PICKING', 19500, 10), status: 'PENDING_OWNER', daysAgo: 1 },
    { store: indiranagar, staff: indStaff, details: candidate('Fatima Sheikh', 'WORKER', 'CUSTOMER_SERVICE', 9000, 5), status: 'ADMIN_CHANGES_REQUESTED', comment: 'The monthly wage is below the state minimum wage for this role. Please correct it and resubmit.', daysAgo: 4 },
    { store: koramangala, staff: korStaff, details: candidate('Harish Gowda', 'WORKER', 'DELIVERY', 21000, 3), status: 'PENDING_ADMIN', daysAgo: 1 },
    { store: bandra, staff: banStaff, details: { ...candidate('Nikita Sawant', 'WORKER', 'FLOOR', 20000, 12), emergencyContactName: null, emergencyContactPhone: null }, status: 'OWNER_CHANGES_REQUESTED', comment: 'Please add an emergency contact before I approve.', daysAgo: 3 },
    { store: bandra, staff: banStaff, details: candidate('Aamir Qureshi', 'WORKER', 'WAREHOUSE', 19000, 2), status: 'REJECTED', comment: 'Duplicate: this person was already onboarded at another store.', daysAgo: 9 },
  ];
  for (const plan of requestPlans) {
    requestSeq++;
    const manager = managerOf(plan.staff);
    const owner = ownerOf(plan.staff);
    const createdAt = new Date(now.getTime() - plan.daysAgo * 86_400_000);
    const [request] = await db
      .insert(credentialRequests)
      .values({
        requestNumber: `REQ-${year}-${String(requestSeq).padStart(4, '0')}`,
        storeId: plan.store.id,
        requestedById: manager.userId,
        requestedByRole: 'STORE_MANAGER',
        status: plan.status,
        candidate: plan.details,
        candidateName: plan.details.fullName,
        lastComment: plan.comment ?? null,
        ownerReviewedById: plan.status === 'PENDING_OWNER' || plan.status === 'OWNER_CHANGES_REQUESTED' ? null : owner.userId,
        ownerReviewedAt: plan.status === 'PENDING_OWNER' ? null : new Date(createdAt.getTime() + 3 * 3600_000),
        adminReviewedById: plan.status === 'ADMIN_CHANGES_REQUESTED' || plan.status === 'REJECTED' ? opsAdmin.id : null,
        adminReviewedAt: plan.status === 'ADMIN_CHANGES_REQUESTED' || plan.status === 'REJECTED' ? new Date(createdAt.getTime() + 20 * 3600_000) : null,
        createdAt,
      })
      .returning();
    const events: (typeof credentialRequestEvents.$inferInsert)[] = [
      { requestId: request!.id, actorId: manager.userId, actorName: manager.name, actorRole: 'STORE_MANAGER', action: 'SUBMITTED', toStatus: 'PENDING_OWNER', createdAt },
    ];
    const ownerAt = new Date(createdAt.getTime() + 3 * 3600_000);
    const adminAt = new Date(createdAt.getTime() + 20 * 3600_000);
    if (plan.status === 'OWNER_CHANGES_REQUESTED') {
      events.push({ requestId: request!.id, actorId: owner.userId, actorName: owner.name, actorRole: 'OWNER', action: 'OWNER_REQUESTED_CHANGES', comment: plan.comment, fromStatus: 'PENDING_OWNER', toStatus: 'OWNER_CHANGES_REQUESTED', createdAt: ownerAt });
    } else if (plan.status !== 'PENDING_OWNER') {
      events.push({ requestId: request!.id, actorId: owner.userId, actorName: owner.name, actorRole: 'OWNER', action: 'OWNER_APPROVED', fromStatus: 'PENDING_OWNER', toStatus: 'PENDING_ADMIN', createdAt: ownerAt });
    }
    if (plan.status === 'ADMIN_CHANGES_REQUESTED') {
      events.push({ requestId: request!.id, actorId: opsAdmin.id, actorName: opsAdmin.name, actorRole: 'ADMIN', action: 'ADMIN_REQUESTED_CHANGES', comment: plan.comment, fromStatus: 'PENDING_ADMIN', toStatus: 'ADMIN_CHANGES_REQUESTED', createdAt: adminAt });
    }
    if (plan.status === 'REJECTED') {
      events.push({ requestId: request!.id, actorId: opsAdmin.id, actorName: opsAdmin.name, actorRole: 'ADMIN', action: 'REJECTED', comment: plan.comment, fromStatus: 'PENDING_ADMIN', toStatus: 'REJECTED', createdAt: adminAt });
    }
    await db.insert(credentialRequestEvents).values(events);
  }
  await db.execute(sql`insert into counters (key, value) values (${`credential_request:${year}`}, ${requestSeq}) on conflict (key) do update set value = excluded.value`);

  // --- Store requests (tickets) ------------------------------------------------
  const rakesh = banStaff.find((e) => e.name === 'Rakesh More')!;
  const ticketPlans = [
    { store: indiranagar, by: managerOf(indStaff), category: 'HARDWARE' as const, priority: 'HIGH' as const, status: 'IN_PROGRESS' as const, subject: 'Exit Gate 2 not reading QR codes in direct sunlight', description: 'Between 4 and 6 pm the evening sun hits the scanner on Exit Gate 2 and it fails to read customer exit passes. Security has to wave customers through manually.', messages: [['ADMIN', 'Thanks Kavya. We have raised this with the hardware vendor; a technician will install a hood on the scanner. Can you share a photo of the gate?'], ['STORE', 'Shared the photo with the vendor on WhatsApp. It happens almost daily.']] as const, assigned: true, daysAgo: 2 },
    { store: indiranagar, by: ownerOf(indStaff), category: 'PAYMENTS' as const, priority: 'MEDIUM' as const, status: 'WAITING_ON_STORE' as const, subject: 'UPI settlement mismatch for last Saturday', description: 'The settlement report is ₹1,240 lower than our day-end sales for Saturday.', messages: [['ADMIN', 'We found 3 refunds processed that day. Could you confirm the order numbers on your side?']] as const, assigned: true, daysAgo: 5 },
    { store: koramangala, by: managerOf(korStaff), category: 'INVENTORY' as const, priority: 'LOW' as const, status: 'OPEN' as const, subject: 'Please add Amul High Protein Buttermilk to the catalogue', description: 'Customers keep asking for it. We can source it from our distributor from next week.', messages: [] as const, assigned: false, daysAgo: 1 },
    { store: bandra, by: managerOf(banStaff), category: 'EMPLOYEE_OFFBOARDING' as const, priority: 'HIGH' as const, status: 'OPEN' as const, subject: 'Remove access for Rakesh More (resigned)', description: 'Rakesh served his notice period; his last working day was yesterday. Please delete his login.', messages: [] as const, assigned: false, daysAgo: 0, related: rakesh.id },
    { store: koramangala, by: managerOf(korStaff), category: 'TECHNICAL' as const, priority: 'MEDIUM' as const, status: 'RESOLVED' as const, subject: 'Smart Cart 03 battery drains in 2 hours', description: 'The cart display turns off mid-shopping.', messages: [['ADMIN', 'Replacement battery pack shipped and installed by the vendor.'], ['STORE', 'Confirmed, working fine now. Thanks!']] as const, assigned: true, daysAgo: 8 },
  ];
  let ticketSeq = 0;
  for (const plan of ticketPlans) {
    ticketSeq++;
    const createdAt = new Date(now.getTime() - plan.daysAgo * 86_400_000 - 2 * 3600_000);
    const [ticket] = await db
      .insert(tickets)
      .values({
        ticketNumber: `TKT-${year}-${String(ticketSeq).padStart(4, '0')}`,
        storeId: plan.store.id,
        raisedById: plan.by.userId,
        raisedByRole: plan.by.role,
        category: plan.category,
        priority: plan.priority,
        status: plan.status,
        subject: plan.subject,
        description: plan.description,
        assignedAdminId: plan.assigned ? opsAdmin.id : null,
        relatedEmployeeId: 'related' in plan ? plan.related : null,
        resolvedAt: plan.status === 'RESOLVED' ? new Date(createdAt.getTime() + 30 * 3600_000) : null,
        createdAt,
      })
      .returning();
    if (plan.messages.length > 0) {
      await db.insert(ticketMessages).values(
        plan.messages.map(([side, body], i) => ({
          ticketId: ticket!.id,
          authorId: side === 'ADMIN' ? opsAdmin.id : plan.by.userId,
          side,
          body,
          createdAt: new Date(createdAt.getTime() + (i + 1) * 3 * 3600_000),
        })),
      );
    }
  }
  await db.execute(sql`insert into counters (key, value) values (${`ticket:${year}`}, ${ticketSeq}) on conflict (key) do update set value = excluded.value`);

  // --- Family shopping lists -----------------------------------------------
  const productByName = (fragment: string) => productRows.find((p) => p.name.includes(fragment))!;
  const [weekly] = await db
    .insert(shoppingLists)
    .values({ ownerId: priya.id, name: 'Weekly Groceries', emoji: '🛒', storeId: indiranagar.id, shareCode: 'FAMILY42' })
    .returning();
  const [party] = await db
    .insert(shoppingLists)
    .values({ ownerId: priya.id, name: 'Saturday Party', emoji: '🎉', storeId: indiranagar.id, shareCode: 'PARTY777' })
    .returning();
  const [gym] = await db
    .insert(shoppingLists)
    .values({ ownerId: rohit.id, name: 'Gym Diet', emoji: '💪', storeId: indiranagar.id, shareCode: 'GYM2026A' })
    .returning();
  await db.insert(listMembers).values([
    { listId: weekly!.id, userId: priya.id, role: 'OWNER' },
    { listId: weekly!.id, userId: rohit.id, role: 'EDITOR' },
    { listId: party!.id, userId: priya.id, role: 'OWNER' },
    { listId: gym!.id, userId: rohit.id, role: 'OWNER' },
    { listId: gym!.id, userId: priya.id, role: 'EDITOR' },
  ]);
  const listItem = (listId: string, fragment: string | null, name: string, quantity: number, addedBy: string, checked = false) => {
    const product = fragment ? productByName(fragment) : null;
    return {
      listId,
      productId: product?.id ?? null,
      name: product?.name ?? name,
      quantity,
      addedById: addedBy,
      isChecked: checked,
      checkedById: checked ? addedBy : null,
      checkedAt: checked ? new Date(now.getTime() - 86_400_000) : null,
    };
  };
  await db.insert(listItems).values([
    listItem(weekly!.id, 'Taaza Toned Milk', 'Milk', 2, priya.id),
    listItem(weekly!.id, 'Brown Bread', 'Bread', 1, priya.id),
    listItem(weekly!.id, 'Farm Fresh Eggs', 'Eggs', 1, rohit.id),
    listItem(weekly!.id, 'Banana Robusta', 'Bananas', 1, priya.id),
    listItem(weekly!.id, 'Tomato Hybrid', 'Tomatoes', 2, priya.id),
    listItem(weekly!.id, 'Coriander Leaves', 'Coriander', 1, rohit.id),
    listItem(weekly!.id, 'Tata Tea Gold', 'Tea', 1, priya.id),
    listItem(weekly!.id, 'Dishwash Gel', 'Dishwash gel', 1, rohit.id),
    listItem(weekly!.id, 'Fresh Paneer', 'Paneer', 1, priya.id),
    listItem(weekly!.id, null, 'Birthday candles', 1, rohit.id),
    listItem(party!.id, 'Classic Salted Chips', 'Chips', 4, priya.id),
    listItem(party!.id, 'Coca-Cola', 'Coke', 3, priya.id),
    listItem(party!.id, 'Nacho Chips', 'Nachos', 2, priya.id),
    listItem(party!.id, 'Popcorn Butter', 'Popcorn', 2, priya.id),
    listItem(party!.id, 'Vanilla Ice Cream', 'Ice cream', 1, priya.id),
    listItem(gym!.id, 'Greek Yogurt', 'Greek yogurt', 4, rohit.id),
    listItem(gym!.id, 'Chicken Breast', 'Chicken breast', 2, rohit.id),
    listItem(gym!.id, 'Rolled Oats', 'Oats', 1, rohit.id),
    listItem(gym!.id, 'Almonds California', 'Almonds', 1, rohit.id, true),
  ]);

  // --- A live smart-cart session in Indiranagar ------------------------------
  const sessionCustomer = historyCustomers.get('BLR-IND-01')![0]!;
  const indInventory = inventoryByStore.get(indiranagar.id)!;
  const [liveSession] = await db
    .insert(instoreSessions)
    .values({
      storeId: indiranagar.id,
      userId: sessionCustomer.id,
      pairingCode: '482913',
      startedAt: new Date(now.getTime() - 9 * 60_000),
      lastActivityAt: new Date(now.getTime() - 60_000),
    })
    .returning();
  const sessionPicks = rng.sample(indInventory.filter((sp) => sp.shelfQty > 10), 4);
  await db.insert(instoreSessionItems).values(
    sessionPicks.map((sp) => ({
      sessionId: liveSession!.id,
      productId: sp.productId,
      storeProductId: sp.id,
      quantity: 1,
      unitPrice: sp.price,
      addedVia: 'APP' as const,
    })),
  );

  // --- Notifications for the demo accounts ---------------------------------
  const kavya = managerOf(indStaff);
  const rahul = indStaff.find((e) => e.username === 'rahul.yadav')!;
  await db.insert(notifications).values([
    { userId: priya.id, type: 'LIST_ITEM_ADDED', title: 'Rohit added Farm Fresh Eggs', body: 'to Weekly Groceries', data: { listId: weekly!.id } },
    { userId: priya.id, type: 'GENERAL', title: 'Scan & Go is live at Indiranagar', body: 'Shop with your phone, pay in the app and walk out. 10% off with SCANGO10.' },
    { userId: rahul.userId, type: 'RESTOCK_ALERT', title: 'Running low on shelves', body: 'A few items in your aisles need restocking.', data: { storeId: indiranagar.id } },
    { userId: kavya.userId, type: 'CREDENTIAL_REQUEST', title: 'Admin sent back REQ for Fatima Sheikh', body: 'Wage below the state minimum. Please correct and resubmit.', data: { storeId: indiranagar.id } },
  ]);

  // Approved requests in the history of the onboarding flow: link two existing workers.
  const approvedFor = indStaff.filter((e) => e.role === 'WORKER').slice(0, 2);
  for (const employee of approvedFor) {
    requestSeq++;
    const createdAt = new Date(now.getTime() - 40 * 86_400_000);
    const [request] = await db
      .insert(credentialRequests)
      .values({
        requestNumber: `REQ-${year}-${String(requestSeq).padStart(4, '0')}`,
        storeId: indiranagar.id,
        requestedById: kavya.userId,
        requestedByRole: 'STORE_MANAGER',
        status: 'APPROVED',
        candidate: candidate(employee.name, 'WORKER', employee.department as CandidateDetails['department'], 19500, -30),
        candidateName: employee.name,
        ownerReviewedById: ownerOf(indStaff).userId,
        ownerReviewedAt: new Date(createdAt.getTime() + 2 * 3600_000),
        adminReviewedById: opsAdmin.id,
        adminReviewedAt: new Date(createdAt.getTime() + 26 * 3600_000),
        issuedEmployeeId: employee.id,
        issuedUsername: employee.username,
        createdAt,
      })
      .returning();
    await db.insert(credentialRequestEvents).values([
      { requestId: request!.id, actorId: kavya.userId, actorName: kavya.name, actorRole: 'STORE_MANAGER', action: 'SUBMITTED', toStatus: 'PENDING_OWNER', createdAt },
      { requestId: request!.id, actorId: ownerOf(indStaff).userId, actorName: ownerOf(indStaff).name, actorRole: 'OWNER', action: 'OWNER_APPROVED', fromStatus: 'PENDING_OWNER', toStatus: 'PENDING_ADMIN', createdAt: new Date(createdAt.getTime() + 2 * 3600_000) },
      { requestId: request!.id, actorId: opsAdmin.id, actorName: opsAdmin.name, actorRole: 'ADMIN', action: 'ADMIN_APPROVED', fromStatus: 'PENDING_ADMIN', toStatus: 'APPROVED', comment: 'Credentials issued', createdAt: new Date(createdAt.getTime() + 26 * 3600_000) },
    ]);
    await db.update(employees).set({ credentialRequestId: request!.id }).where(eq(employees.id, employee.id));
  }
  await db.execute(sql`insert into counters (key, value) values (${`credential_request:${year}`}, ${requestSeq}) on conflict (key) do update set value = excluded.value`);

  const openAlerts = await db
    .select({ id: restockAlerts.id })
    .from(restockAlerts)
    .where(and(inArray(restockAlerts.status, ['OPEN', 'ACKNOWLEDGED'])));

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  logger.info(
    {
      stores: storeRows.length,
      products: productRows.length,
      customers: generatedRows.length + demoCustomers.length,
      orders: history.orders,
      orderItems: history.items,
      shifts: shiftCount,
      attendance: attendanceCount,
      tasks: taskCount,
      openAlerts: openAlerts.length,
    },
    `Seed completed in ${seconds}s`,
  );
  printCredentials(deviceKeys);
}

function printCredentials(deviceKeys: { store: string; name: string; key: string }[]): void {
  const lines = [
    '',
    'Demo accounts',
    '-------------',
    `Admin console   admin@smartcart.dev / ${DEMO_PASSWORDS.admin}   (also ops@ and support@smartcart.dev)`,
    `Store owner     arjun.mehta / ${DEMO_PASSWORDS.staff}           (Indiranagar + Koramangala)`,
    `Store manager   kavya.reddy / ${DEMO_PASSWORDS.staff}           (Indiranagar)`,
    `Floor manager   vikram.singh / ${DEMO_PASSWORDS.staff}`,
    `Worker          rahul.yadav / ${DEMO_PASSWORDS.staff}           (warehouse, gets restock alerts)`,
    `Customer        priya@example.com / ${DEMO_PASSWORDS.customer}  (phone +91 99000 00001, OTP shown in dev)`,
    `Family member   rohit@example.com / ${DEMO_PASSWORDS.customer}  (shares "Weekly Groceries", code FAMILY42)`,
    '',
    'Device API keys (development only)',
    ...deviceKeys.filter((d) => d.store === 'BLR-IND-01').map((d) => `  ${d.store}  ${d.name.padEnd(22)} ${d.key}`),
    '  (same pattern for BLR-KOR-02 and MUM-BAN-01)',
    '',
  ];
  console.log(lines.join('\n'));
}
