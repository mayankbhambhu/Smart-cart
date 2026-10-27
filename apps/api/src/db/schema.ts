import {
  ADDRESS_LABELS,
  ADMIN_ROLES,
  ALERT_LEVELS,
  ALERT_STATUSES,
  CLOCK_METHODS,
  CREDENTIAL_REQUEST_ACTIONS,
  CREDENTIAL_REQUEST_STATUSES,
  DEPARTMENTS,
  DEVICE_TYPES,
  EMPLOYEE_STATUSES,
  EXIT_PASS_STATUSES,
  GATE_REASONS,
  GATE_RESULTS,
  ID_PROOF_TYPES,
  INVENTORY_MOVEMENT_TYPES,
  NOTIFICATION_TYPES,
  OFFER_TYPES,
  ORDER_CHANNELS,
  ORDER_PAYMENT_STATUSES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  PRIORITIES,
  SESSION_STATUSES,
  SHIFT_STATUSES,
  STAFF_ROLES,
  STORE_STATUSES,
  TASK_CATEGORIES,
  TASK_STATUSES,
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  USER_KINDS,
  USER_STATUSES,
  WAGE_TYPES,
  type AddressSnapshot,
  type Allergen,
  type CandidateDetails,
  type DietaryTag,
  type OrderChannel,
  type StoreLayout,
  type StoreSettings,
} from '@smartcart/shared';
import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * PostgreSQL schema. Column names are written in camelCase here and mapped
 * to snake_case by Drizzle (`casing: 'snake_case'`). Money columns are
 * integers in minor units (paise).
 */

const tz = () => timestamp({ withTimezone: true });
const createdAt = () => tz().notNull().defaultNow();
const updatedAt = () =>
  tz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const id = () => uuid().primaryKey().defaultRandom();

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userKindEnum = pgEnum('user_kind', USER_KINDS);
export const userStatusEnum = pgEnum('user_status', USER_STATUSES);
export const adminRoleEnum = pgEnum('admin_role', ADMIN_ROLES);
export const staffRoleEnum = pgEnum('staff_role', STAFF_ROLES);
export const departmentEnum = pgEnum('department', DEPARTMENTS);
export const employeeStatusEnum = pgEnum('employee_status', EMPLOYEE_STATUSES);
export const wageTypeEnum = pgEnum('wage_type', WAGE_TYPES);
export const idProofTypeEnum = pgEnum('id_proof_type', ID_PROOF_TYPES);
export const addressLabelEnum = pgEnum('address_label', ADDRESS_LABELS);
export const storeStatusEnum = pgEnum('store_status', STORE_STATUSES);
export const orderChannelEnum = pgEnum('order_channel', ORDER_CHANNELS);
export const orderStatusEnum = pgEnum('order_status', ORDER_STATUSES);
export const orderPaymentStatusEnum = pgEnum('order_payment_status', ORDER_PAYMENT_STATUSES);
export const paymentMethodEnum = pgEnum('payment_method', PAYMENT_METHODS);
export const paymentProviderEnum = pgEnum('payment_provider', PAYMENT_PROVIDERS);
export const paymentStatusEnum = pgEnum('payment_status', PAYMENT_STATUSES);
export const offerTypeEnum = pgEnum('offer_type', OFFER_TYPES);
export const sessionStatusEnum = pgEnum('session_status', SESSION_STATUSES);
export const sessionItemSourceEnum = pgEnum('session_item_source', ['APP', 'SMART_CART']);
export const exitPassStatusEnum = pgEnum('exit_pass_status', EXIT_PASS_STATUSES);
export const deviceTypeEnum = pgEnum('device_type', DEVICE_TYPES);
export const gateResultEnum = pgEnum('gate_result', GATE_RESULTS);
export const gateReasonEnum = pgEnum('gate_reason', GATE_REASONS);
export const movementTypeEnum = pgEnum('inventory_movement_type', INVENTORY_MOVEMENT_TYPES);
export const alertStatusEnum = pgEnum('alert_status', ALERT_STATUSES);
export const alertLevelEnum = pgEnum('alert_level', ALERT_LEVELS);
export const taskCategoryEnum = pgEnum('task_category', TASK_CATEGORIES);
export const priorityEnum = pgEnum('priority', PRIORITIES);
export const taskStatusEnum = pgEnum('task_status', TASK_STATUSES);
export const shiftStatusEnum = pgEnum('shift_status', SHIFT_STATUSES);
export const clockMethodEnum = pgEnum('clock_method', CLOCK_METHODS);
export const credentialRequestStatusEnum = pgEnum('credential_request_status', CREDENTIAL_REQUEST_STATUSES);
export const credentialRequestActionEnum = pgEnum('credential_request_action', CREDENTIAL_REQUEST_ACTIONS);
export const ticketCategoryEnum = pgEnum('ticket_category', TICKET_CATEGORIES);
export const ticketStatusEnum = pgEnum('ticket_status', TICKET_STATUSES);
export const notificationTypeEnum = pgEnum('notification_type', NOTIFICATION_TYPES);
export const listRoleEnum = pgEnum('list_role', ['OWNER', 'EDITOR']);
export const otpPurposeEnum = pgEnum('otp_purpose', ['LOGIN', 'RESET_PASSWORD']);

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: id(),
    kind: userKindEnum().notNull(),
    name: text().notNull(),
    email: text(),
    phone: text(),
    /** Login name for staff accounts (issued by the admin team). */
    username: text(),
    passwordHash: text(),
    googleSub: text(),
    appleSub: text(),
    avatarUrl: text(),
    adminRole: adminRoleEnum(),
    status: userStatusEnum().notNull().default('ACTIVE'),
    mustChangePassword: boolean().notNull().default(false),
    /** Bumped to invalidate every outstanding access token immediately. */
    tokenVersion: integer().notNull().default(0),
    phoneVerifiedAt: tz(),
    lastLoginAt: tz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('users_kind_email_uq').on(t.kind, t.email),
    uniqueIndex('users_kind_phone_uq').on(t.kind, t.phone),
    uniqueIndex('users_username_uq').on(t.username),
    uniqueIndex('users_kind_google_uq').on(t.kind, t.googleSub),
    uniqueIndex('users_kind_apple_uq').on(t.kind, t.appleSub),
  ],
);

export const customerProfiles = pgTable('customer_profiles', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  dietaryPreferences: text()
    .array()
    .$type<DietaryTag[]>()
    .notNull()
    .default(sql`'{}'::text[]`),
  allergens: text()
    .array()
    .$type<Allergen[]>()
    .notNull()
    .default(sql`'{}'::text[]`),
  defaultStoreId: uuid().references(() => stores.id, { onDelete: 'set null' }),
  loyaltyPoints: integer().notNull().default(0),
  stripeCustomerId: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const addresses = pgTable(
  'addresses',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: addressLabelEnum().notNull().default('HOME'),
    line1: text().notNull(),
    line2: text(),
    landmark: text(),
    city: text().notNull(),
    state: text().notNull(),
    pincode: text().notNull(),
    lat: doublePrecision().notNull(),
    lng: doublePrecision().notNull(),
    receiverName: text(),
    receiverPhone: text(),
    isDefault: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('addresses_user_idx').on(t.userId)],
);

export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: paymentMethodEnum().notNull(),
    provider: paymentProviderEnum().notNull(),
    label: text().notNull(),
    brand: text(),
    last4: text(),
    expMonth: smallint(),
    expYear: smallint(),
    upiId: text(),
    email: text(),
    /** Provider token, e.g. a Stripe PaymentMethod id. Never raw card data. */
    providerRef: text(),
    isDefault: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('payment_methods_user_idx').on(t.userId)],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text().notNull(),
    family: uuid().notNull(),
    userAgent: text(),
    ip: text(),
    expiresAt: tz().notNull(),
    revokedAt: tz(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('refresh_tokens_hash_uq').on(t.tokenHash), index('refresh_tokens_user_idx').on(t.userId)],
);

export const otpCodes = pgTable(
  'otp_codes',
  {
    id: id(),
    target: text().notNull(),
    purpose: otpPurposeEnum().notNull(),
    codeHash: text().notNull(),
    attempts: integer().notNull().default(0),
    expiresAt: tz().notNull(),
    consumedAt: tz(),
    createdAt: createdAt(),
  },
  (t) => [index('otp_codes_target_idx').on(t.target, t.purpose, t.createdAt)],
);

export const pushTokens = pgTable(
  'push_tokens',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text().notNull(),
    platform: text().notNull(),
    lastSeenAt: createdAt(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('push_tokens_token_uq').on(t.token), index('push_tokens_user_idx').on(t.userId)],
);

// ---------------------------------------------------------------------------
// Stores & staff
// ---------------------------------------------------------------------------

export const stores = pgTable('stores', {
  id: id(),
  code: text().notNull().unique(),
  name: text().notNull(),
  addressLine: text().notNull(),
  city: text().notNull(),
  state: text().notNull(),
  pincode: text().notNull(),
  lat: doublePrecision().notNull(),
  lng: doublePrecision().notNull(),
  phone: text().notNull(),
  email: text(),
  timezone: text().notNull().default('Asia/Kolkata'),
  openingTime: text().notNull().default('07:00'),
  closingTime: text().notNull().default('23:00'),
  status: storeStatusEnum().notNull().default('ACTIVE'),
  supportsDelivery: boolean().notNull().default(true),
  supportsPickup: boolean().notNull().default(true),
  supportsInStore: boolean().notNull().default(true),
  layout: jsonb().$type<StoreLayout>().notNull(),
  settings: jsonb().$type<StoreSettings>().notNull(),
  /** HMAC key for the rotating attendance-kiosk codes. */
  kioskSecret: text().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const employees = pgTable(
  'employees',
  {
    id: id(),
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    employeeCode: text().notNull().unique(),
    fullName: text().notNull(),
    email: text(),
    phone: text(),
    role: staffRoleEnum().notNull(),
    department: departmentEnum().notNull(),
    designation: text(),
    joiningDate: date().notNull(),
    wageType: wageTypeEnum().notNull().default('MONTHLY'),
    wageAmount: integer().notNull().default(0),
    status: employeeStatusEnum().notNull().default('ACTIVE'),
    exitDate: date(),
    exitReason: text(),
    reportsToId: uuid().references((): AnyPgColumn => employees.id, { onDelete: 'set null' }),
    dateOfBirth: date(),
    address: text(),
    emergencyContactName: text(),
    emergencyContactPhone: text(),
    idProofType: idProofTypeEnum(),
    idProofLast4: text(),
    credentialRequestId: uuid(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('employees_store_idx').on(t.storeId, t.status),
    index('employees_user_idx').on(t.userId),
    uniqueIndex('employees_store_user_active_uq')
      .on(t.storeId, t.userId)
      .where(sql`${t.status} in ('ACTIVE', 'ON_LEAVE')`),
  ],
);

export const credentialRequests = pgTable(
  'credential_requests',
  {
    id: id(),
    requestNumber: text().notNull().unique(),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    requestedById: uuid()
      .notNull()
      .references(() => users.id),
    requestedByRole: staffRoleEnum().notNull(),
    status: credentialRequestStatusEnum().notNull(),
    revision: integer().notNull().default(1),
    candidate: jsonb().$type<CandidateDetails>().notNull(),
    candidateName: text().notNull(),
    lastComment: text(),
    ownerReviewedById: uuid().references(() => users.id),
    ownerReviewedAt: tz(),
    adminReviewedById: uuid().references(() => users.id),
    adminReviewedAt: tz(),
    issuedEmployeeId: uuid().references(() => employees.id, { onDelete: 'set null' }),
    issuedUsername: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('credential_requests_status_idx').on(t.status), index('credential_requests_store_idx').on(t.storeId)],
);

export const credentialRequestEvents = pgTable(
  'credential_request_events',
  {
    id: id(),
    requestId: uuid()
      .notNull()
      .references(() => credentialRequests.id, { onDelete: 'cascade' }),
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    actorName: text().notNull(),
    actorRole: text().notNull(),
    action: credentialRequestActionEnum().notNull(),
    comment: text(),
    fromStatus: credentialRequestStatusEnum(),
    toStatus: credentialRequestStatusEnum().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('credential_request_events_request_idx').on(t.requestId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Catalogue & inventory
// ---------------------------------------------------------------------------

export const categories = pgTable('categories', {
  id: id(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  emoji: text().notNull(),
  color: text().notNull(),
  sortOrder: integer().notNull().default(0),
  createdAt: createdAt(),
});

export const products = pgTable(
  'products',
  {
    id: id(),
    sku: text().notNull().unique(),
    barcode: text().notNull().unique(),
    name: text().notNull(),
    brand: text().notNull(),
    description: text(),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id),
    unit: text().notNull(),
    mrp: integer().notNull(),
    defaultPrice: integer().notNull(),
    defaultCost: integer().notNull(),
    taxRate: integer().notNull().default(5),
    emoji: text().notNull(),
    color: text().notNull(),
    imageUrl: text(),
    dietaryTags: text()
      .array()
      .$type<DietaryTag[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
    allergens: text()
      .array()
      .$type<Allergen[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
    maxOrderQty: integer().notNull().default(10),
    isActive: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('products_category_idx').on(t.categoryId)],
);

export const storeProducts = pgTable(
  'store_products',
  {
    id: id(),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    price: integer().notNull(),
    cost: integer().notNull(),
    /** Units on the shop floor. Smart carts deduct from here in real time. */
    shelfQty: integer().notNull().default(0),
    /** Units in the back room / warehouse, used to restock the shelf. */
    storageQty: integer().notNull().default(0),
    reorderThreshold: integer().notNull().default(5),
    restockTarget: integer().notNull().default(24),
    aisle: smallint().notNull(),
    row: smallint().notNull(),
    shelf: smallint().notNull(),
    isAvailable: boolean().notNull().default(true),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('store_products_store_product_uq').on(t.storeId, t.productId),
    index('store_products_store_aisle_idx').on(t.storeId, t.aisle, t.row),
    check('store_products_shelf_nonneg', sql`${t.shelfQty} >= 0`),
    check('store_products_storage_nonneg', sql`${t.storageQty} >= 0`),
  ],
);

export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: id(),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    storeProductId: uuid()
      .notNull()
      .references(() => storeProducts.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    type: movementTypeEnum().notNull(),
    shelfDelta: integer().notNull().default(0),
    storageDelta: integer().notNull().default(0),
    refType: text(),
    refId: uuid(),
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index('inventory_movements_sp_idx').on(t.storeProductId, t.createdAt),
    index('inventory_movements_store_idx').on(t.storeId, t.createdAt),
  ],
);

export const restockAlerts = pgTable(
  'restock_alerts',
  {
    id: id(),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    storeProductId: uuid()
      .notNull()
      .references(() => storeProducts.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    status: alertStatusEnum().notNull().default('OPEN'),
    level: alertLevelEnum().notNull(),
    shelfQtyAtTrigger: integer().notNull(),
    threshold: integer().notNull(),
    acknowledgedById: uuid().references(() => users.id, { onDelete: 'set null' }),
    acknowledgedAt: tz(),
    resolvedById: uuid().references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: tz(),
    restockedQty: integer(),
    taskId: uuid(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('restock_alerts_store_status_idx').on(t.storeId, t.status),
    uniqueIndex('restock_alerts_one_active_uq')
      .on(t.storeProductId)
      .where(sql`${t.status} in ('OPEN', 'ACKNOWLEDGED')`),
  ],
);

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

export const offers = pgTable(
  'offers',
  {
    id: id(),
    /** null = valid in every store */
    storeId: uuid().references(() => stores.id, { onDelete: 'cascade' }),
    code: text(),
    title: text().notNull(),
    description: text(),
    type: offerTypeEnum().notNull(),
    value: integer().notNull().default(0),
    minOrderValue: integer().notNull().default(0),
    maxDiscount: integer(),
    productId: uuid().references(() => products.id, { onDelete: 'cascade' }),
    categoryId: uuid().references(() => categories.id, { onDelete: 'cascade' }),
    buyQty: integer(),
    getQty: integer(),
    channels: text()
      .array()
      .$type<OrderChannel[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
    startsAt: tz().notNull(),
    endsAt: tz().notNull(),
    isActive: boolean().notNull().default(true),
    usageLimitPerUser: integer(),
    bannerColor: text().notNull().default('#0f8a4b'),
    createdById: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('offers_code_idx').on(t.code), index('offers_store_idx').on(t.storeId)],
);

export const offerRedemptions = pgTable(
  'offer_redemptions',
  {
    id: id(),
    offerId: uuid()
      .notNull()
      .references(() => offers.id, { onDelete: 'cascade' }),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    discount: integer().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('offer_redemptions_order_uq').on(t.orderId), index('offer_redemptions_offer_idx').on(t.offerId, t.userId)],
);

// ---------------------------------------------------------------------------
// Collaborative shopping lists
// ---------------------------------------------------------------------------

export const shoppingLists = pgTable(
  'shopping_lists',
  {
    id: id(),
    ownerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    emoji: text().notNull().default('🛒'),
    storeId: uuid().references(() => stores.id, { onDelete: 'set null' }),
    shareCode: text().notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('shopping_lists_owner_idx').on(t.ownerId)],
);

export const listMembers = pgTable(
  'list_members',
  {
    listId: uuid()
      .notNull()
      .references(() => shoppingLists.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: listRoleEnum().notNull().default('EDITOR'),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.listId, t.userId] }), index('list_members_user_idx').on(t.userId)],
);

export const listItems = pgTable(
  'list_items',
  {
    id: id(),
    listId: uuid()
      .notNull()
      .references(() => shoppingLists.id, { onDelete: 'cascade' }),
    productId: uuid().references(() => products.id, { onDelete: 'set null' }),
    name: text().notNull(),
    quantity: integer().notNull().default(1),
    note: text(),
    isChecked: boolean().notNull().default(false),
    checkedById: uuid().references(() => users.id, { onDelete: 'set null' }),
    checkedAt: tz(),
    addedById: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('list_items_list_idx').on(t.listId)],
);

// ---------------------------------------------------------------------------
// Orders, payments, in-store sessions, exit passes
// ---------------------------------------------------------------------------

export const orders = pgTable(
  'orders',
  {
    id: id(),
    orderNumber: text().notNull().unique(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    storeId: uuid()
      .notNull()
      .references(() => stores.id),
    channel: orderChannelEnum().notNull(),
    status: orderStatusEnum().notNull(),
    paymentStatus: orderPaymentStatusEnum().notNull().default('UNPAID'),
    paymentMethod: paymentMethodEnum(),
    itemCount: integer().notNull(),
    itemTotal: integer().notNull(),
    mrpTotal: integer().notNull(),
    couponDiscount: integer().notNull().default(0),
    deliveryFee: integer().notNull().default(0),
    handlingFee: integer().notNull().default(0),
    smallCartFee: integer().notNull().default(0),
    tip: integer().notNull().default(0),
    taxIncluded: integer().notNull().default(0),
    total: integer().notNull(),
    /** Cost of goods at the time of sale, for profit reporting. */
    costTotal: integer().notNull().default(0),
    offerId: uuid().references(() => offers.id, { onDelete: 'set null' }),
    couponCode: text(),
    address: jsonb().$type<AddressSnapshot>(),
    scheduledFor: tz(),
    slotEnd: tz(),
    pickupCode: text(),
    sessionId: uuid(),
    notes: text(),
    cancelReason: text(),
    pickerId: uuid().references(() => employees.id, { onDelete: 'set null' }),
    riderName: text(),
    riderPhone: text(),
    deliveryEtaMinutes: integer(),
    idempotencyKey: text(),
    /** When the order counted as a sale (payment confirmed / COD accepted). */
    placedAt: tz(),
    packingAt: tz(),
    readyAt: tz(),
    outForDeliveryAt: tz(),
    completedAt: tz(),
    cancelledAt: tz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('orders_store_placed_idx').on(t.storeId, t.placedAt),
    index('orders_store_status_idx').on(t.storeId, t.status),
    index('orders_user_idx').on(t.userId, t.createdAt),
    uniqueIndex('orders_user_idempotency_uq').on(t.userId, t.idempotencyKey),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: id(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    categoryId: uuid().notNull(),
    name: text().notNull(),
    brand: text().notNull(),
    unit: text().notNull(),
    emoji: text().notNull(),
    color: text().notNull(),
    barcode: text().notNull(),
    quantity: integer().notNull(),
    unitPrice: integer().notNull(),
    mrp: integer().notNull(),
    unitCost: integer().notNull(),
    taxRate: integer().notNull(),
    lineTotal: integer().notNull(),
    aisle: smallint(),
    row: smallint(),
    shelf: smallint(),
  },
  (t) => [index('order_items_order_idx').on(t.orderId), index('order_items_product_idx').on(t.productId)],
);

export const orderEvents = pgTable(
  'order_events',
  {
    id: id(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    status: orderStatusEnum().notNull(),
    note: text(),
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    actorName: text(),
    createdAt: createdAt(),
  },
  (t) => [index('order_events_order_idx').on(t.orderId, t.createdAt)],
);

export const payments = pgTable(
  'payments',
  {
    id: id(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    provider: paymentProviderEnum().notNull(),
    method: paymentMethodEnum().notNull(),
    amount: integer().notNull(),
    currency: text().notNull().default('INR'),
    status: paymentStatusEnum().notNull().default('CREATED'),
    /** Provider object id: Stripe PaymentIntent, PayPal order or Razorpay order. */
    providerRef: text(),
    /** Provider charge/capture id once paid. */
    providerPaymentId: text(),
    savedPaymentMethodId: uuid().references(() => paymentMethods.id, { onDelete: 'set null' }),
    failureReason: text(),
    refundedAmount: integer().notNull().default(0),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    succeededAt: tz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('payments_order_idx').on(t.orderId), uniqueIndex('payments_provider_ref_uq').on(t.provider, t.providerRef)],
);

export const instoreSessions = pgTable(
  'instore_sessions',
  {
    id: id(),
    storeId: uuid()
      .notNull()
      .references(() => stores.id),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    status: sessionStatusEnum().notNull().default('ACTIVE'),
    pairingCode: text().notNull(),
    listId: uuid().references(() => shoppingLists.id, { onDelete: 'set null' }),
    cartDeviceId: uuid().references(() => devices.id, { onDelete: 'set null' }),
    orderId: uuid(),
    startedAt: createdAt(),
    lastActivityAt: createdAt(),
    endedAt: tz(),
  },
  (t) => [
    index('instore_sessions_user_idx').on(t.userId, t.status),
    index('instore_sessions_store_idx').on(t.storeId, t.status),
    uniqueIndex('instore_sessions_pairing_uq')
      .on(t.storeId, t.pairingCode)
      .where(sql`${t.status} in ('ACTIVE', 'CHECKOUT')`),
  ],
);

export const instoreSessionItems = pgTable(
  'instore_session_items',
  {
    id: id(),
    sessionId: uuid()
      .notNull()
      .references(() => instoreSessions.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    storeProductId: uuid()
      .notNull()
      .references(() => storeProducts.id),
    quantity: integer().notNull(),
    unitPrice: integer().notNull(),
    addedVia: sessionItemSourceEnum().notNull().default('APP'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('instore_session_items_uq').on(t.sessionId, t.productId)],
);

export const exitPasses = pgTable(
  'exit_passes',
  {
    id: id(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    storeId: uuid()
      .notNull()
      .references(() => stores.id),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    /** SHA-256 of the bearer token; the token itself is only ever shown to the customer. */
    tokenHash: text().notNull(),
    tokenHint: text().notNull(),
    status: exitPassStatusEnum().notNull().default('ACTIVE'),
    expiresAt: tz().notNull(),
    usedAt: tz(),
    usedAtDeviceId: uuid(),
    issuedAt: createdAt(),
  },
  (t) => [uniqueIndex('exit_passes_order_uq').on(t.orderId), uniqueIndex('exit_passes_token_uq').on(t.tokenHash)],
);

export const devices = pgTable(
  'devices',
  {
    id: id(),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    type: deviceTypeEnum().notNull(),
    name: text().notNull(),
    apiKeyHash: text().notNull(),
    apiKeyPrefix: text().notNull(),
    isActive: boolean().notNull().default(true),
    lastSeenAt: tz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('devices_api_key_uq').on(t.apiKeyHash), index('devices_store_idx').on(t.storeId)],
);

export const gateEvents = pgTable(
  'gate_events',
  {
    id: id(),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    deviceId: uuid().references(() => devices.id, { onDelete: 'set null' }),
    exitPassId: uuid().references(() => exitPasses.id, { onDelete: 'set null' }),
    orderId: uuid().references(() => orders.id, { onDelete: 'set null' }),
    result: gateResultEnum().notNull(),
    reason: gateReasonEnum().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('gate_events_store_idx').on(t.storeId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Work management: tasks, shifts, attendance
// ---------------------------------------------------------------------------

export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    description: text(),
    category: taskCategoryEnum().notNull().default('OTHER'),
    priority: priorityEnum().notNull().default('MEDIUM'),
    status: taskStatusEnum().notNull().default('TODO'),
    assigneeId: uuid()
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    assignedById: uuid()
      .notNull()
      .references(() => employees.id),
    aisle: smallint(),
    dueAt: tz(),
    startedAt: tz(),
    completedAt: tz(),
    completionNote: text(),
    completionPhotoUrl: text(),
    reviewRating: smallint(),
    reviewComment: text(),
    reviewedById: uuid().references(() => employees.id, { onDelete: 'set null' }),
    reviewedAt: tz(),
    restockAlertId: uuid().references(() => restockAlerts.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('tasks_store_status_idx').on(t.storeId, t.status), index('tasks_assignee_idx').on(t.assigneeId, t.status)],
);

export const shiftTemplates = pgTable('shift_templates', {
  id: id(),
  storeId: uuid()
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  startTime: text().notNull(),
  endTime: text().notNull(),
  breakMinutes: integer().notNull().default(30),
  color: text().notNull().default('#0f8a4b'),
  createdAt: createdAt(),
});

export const shifts = pgTable(
  'shifts',
  {
    id: id(),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    employeeId: uuid()
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    /** Store-local calendar date the shift starts on. */
    date: date().notNull(),
    startAt: tz().notNull(),
    endAt: tz().notNull(),
    label: text(),
    breakMinutes: integer().notNull().default(30),
    notes: text(),
    status: shiftStatusEnum().notNull().default('SCHEDULED'),
    createdById: uuid().references(() => employees.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('shifts_store_date_idx').on(t.storeId, t.date), index('shifts_employee_date_idx').on(t.employeeId, t.date)],
);

export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: id(),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    employeeId: uuid()
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    shiftId: uuid().references(() => shifts.id, { onDelete: 'set null' }),
    clockInAt: tz().notNull(),
    clockOutAt: tz(),
    clockInMethod: clockMethodEnum().notNull().default('APP'),
    clockOutMethod: clockMethodEnum(),
    clockInLat: doublePrecision(),
    clockInLng: doublePrecision(),
    workedMinutes: integer().notNull().default(0),
    lateByMinutes: integer().notNull().default(0),
    leftEarlyByMinutes: integer().notNull().default(0),
    notes: text(),
    editedById: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('attendance_store_in_idx').on(t.storeId, t.clockInAt),
    index('attendance_employee_in_idx').on(t.employeeId, t.clockInAt),
    uniqueIndex('attendance_one_open_uq')
      .on(t.employeeId)
      .where(sql`${t.clockOutAt} is null`),
  ],
);

// ---------------------------------------------------------------------------
// Store requests (tickets), notifications, audit
// ---------------------------------------------------------------------------

export const tickets = pgTable(
  'tickets',
  {
    id: id(),
    ticketNumber: text().notNull().unique(),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    raisedById: uuid()
      .notNull()
      .references(() => users.id),
    raisedByRole: staffRoleEnum(),
    category: ticketCategoryEnum().notNull(),
    priority: priorityEnum().notNull().default('MEDIUM'),
    status: ticketStatusEnum().notNull().default('OPEN'),
    subject: text().notNull(),
    description: text().notNull(),
    assignedAdminId: uuid().references(() => users.id, { onDelete: 'set null' }),
    relatedEmployeeId: uuid().references(() => employees.id, { onDelete: 'set null' }),
    resolvedAt: tz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('tickets_status_idx').on(t.status), index('tickets_store_idx').on(t.storeId)],
);

export const ticketMessages = pgTable(
  'ticket_messages',
  {
    id: id(),
    ticketId: uuid()
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    authorId: uuid()
      .notNull()
      .references(() => users.id),
    side: text().$type<'STORE' | 'ADMIN'>().notNull(),
    body: text().notNull(),
    isInternal: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('ticket_messages_ticket_idx').on(t.ticketId, t.createdAt)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    readAt: tz(),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    actorKind: text().notNull(),
    actorName: text(),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text(),
    storeId: uuid().references(() => stores.id, { onDelete: 'set null' }),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    ip: text(),
    createdAt: createdAt(),
  },
  (t) => [index('audit_logs_created_idx').on(t.createdAt), index('audit_logs_store_idx').on(t.storeId, t.createdAt)],
);

/** Monotonic counters for human-readable numbers (employee codes, tickets, requests). */
export const counters = pgTable('counters', {
  key: text().primaryKey(),
  value: integer().notNull().default(0),
});

// ---------------------------------------------------------------------------
// Relations (for Drizzle's relational query API)
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ one, many }) => ({
  customerProfile: one(customerProfiles, { fields: [users.id], references: [customerProfiles.userId] }),
  employees: many(employees),
}));

export const customerProfilesRelations = relations(customerProfiles, ({ one }) => ({
  user: one(users, { fields: [customerProfiles.userId], references: [users.id] }),
}));

export const storesRelations = relations(stores, ({ many }) => ({
  employees: many(employees),
  storeProducts: many(storeProducts),
}));

export const employeesRelations = relations(employees, ({ one }) => ({
  user: one(users, { fields: [employees.userId], references: [users.id] }),
  store: one(stores, { fields: [employees.storeId], references: [stores.id] }),
  reportsTo: one(employees, { fields: [employees.reportsToId], references: [employees.id] }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  storeProducts: many(storeProducts),
}));

export const storeProductsRelations = relations(storeProducts, ({ one }) => ({
  store: one(stores, { fields: [storeProducts.storeId], references: [stores.id] }),
  product: one(products, { fields: [storeProducts.productId], references: [products.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  store: one(stores, { fields: [orders.storeId], references: [stores.id] }),
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  items: many(orderItems),
  events: many(orderEvents),
  payments: many(payments),
  exitPass: one(exitPasses, { fields: [orders.id], references: [exitPasses.orderId] }),
  picker: one(employees, { fields: [orders.pickerId], references: [employees.id] }),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));

export const orderEventsRelations = relations(orderEvents, ({ one }) => ({
  order: one(orders, { fields: [orderEvents.orderId], references: [orders.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
}));

export const exitPassesRelations = relations(exitPasses, ({ one }) => ({
  order: one(orders, { fields: [exitPasses.orderId], references: [orders.id] }),
}));

export const shoppingListsRelations = relations(shoppingLists, ({ many }) => ({
  members: many(listMembers),
  items: many(listItems),
}));

export const listMembersRelations = relations(listMembers, ({ one }) => ({
  list: one(shoppingLists, { fields: [listMembers.listId], references: [shoppingLists.id] }),
  user: one(users, { fields: [listMembers.userId], references: [users.id] }),
}));

export const listItemsRelations = relations(listItems, ({ one }) => ({
  list: one(shoppingLists, { fields: [listItems.listId], references: [shoppingLists.id] }),
  product: one(products, { fields: [listItems.productId], references: [products.id] }),
  addedBy: one(users, { fields: [listItems.addedById], references: [users.id], relationName: 'addedBy' }),
  checkedBy: one(users, { fields: [listItems.checkedById], references: [users.id], relationName: 'checkedBy' }),
}));

export const instoreSessionsRelations = relations(instoreSessions, ({ one, many }) => ({
  store: one(stores, { fields: [instoreSessions.storeId], references: [stores.id] }),
  items: many(instoreSessionItems),
  cartDevice: one(devices, { fields: [instoreSessions.cartDeviceId], references: [devices.id] }),
}));

export const instoreSessionItemsRelations = relations(instoreSessionItems, ({ one }) => ({
  session: one(instoreSessions, { fields: [instoreSessionItems.sessionId], references: [instoreSessions.id] }),
  product: one(products, { fields: [instoreSessionItems.productId], references: [products.id] }),
  storeProduct: one(storeProducts, { fields: [instoreSessionItems.storeProductId], references: [storeProducts.id] }),
}));

export const credentialRequestsRelations = relations(credentialRequests, ({ one, many }) => ({
  store: one(stores, { fields: [credentialRequests.storeId], references: [stores.id] }),
  requestedBy: one(users, { fields: [credentialRequests.requestedById], references: [users.id] }),
  events: many(credentialRequestEvents),
}));

export const credentialRequestEventsRelations = relations(credentialRequestEvents, ({ one }) => ({
  request: one(credentialRequests, { fields: [credentialRequestEvents.requestId], references: [credentialRequests.id] }),
}));

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  store: one(stores, { fields: [tickets.storeId], references: [stores.id] }),
  messages: many(ticketMessages),
}));

export const ticketMessagesRelations = relations(ticketMessages, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketMessages.ticketId], references: [tickets.id] }),
  author: one(users, { fields: [ticketMessages.authorId], references: [users.id] }),
}));
