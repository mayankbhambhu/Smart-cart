import type {
  AddressLabel,
  AdminRole,
  AlertLevel,
  AlertStatus,
  Allergen,
  ClockMethod,
  CredentialRequestAction,
  CredentialRequestStatus,
  Department,
  DeviceType,
  DietaryTag,
  EmployeeStatus,
  ExitPassStatus,
  GateReason,
  GateResult,
  IdProofType,
  InventoryMovementType,
  NotificationType,
  OfferType,
  OrderChannel,
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethodType,
  PaymentProviderName,
  PaymentStatus,
  Priority,
  RequestableRole,
  SessionStatus,
  ShiftStatus,
  StaffRole,
  StockStatus,
  StoreStatus,
  TaskCategory,
  TaskStatus,
  TicketCategory,
  TicketStatus,
  UserKind,
  WageType,
} from './constants';
import type { ItemLocation, StoreLayout } from './layout';
import type { Bill } from './pricing';

/**
 * Response shapes of the SmartCart REST API (JSON). Timestamps are ISO-8601
 * strings, calendar dates are "YYYY-MM-DD", money is integer minor units.
 */

export type ISODateTime = string;
export type ISODate = string;

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface PersonRef {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  kind: UserKind;
  name: string;
  email: string | null;
  phone: string | null;
  username: string | null;
  avatarUrl: string | null;
  adminRole: AdminRole | null;
  mustChangePassword: boolean;
  createdAt: ISODateTime;
}

export interface StaffMembership {
  employeeId: string;
  storeId: string;
  storeCode: string;
  storeName: string;
  role: StaffRole;
  department: Department;
  employeeCode: string;
  designation: string | null;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: ISODateTime;
  memberships: StaffMembership[];
}

export interface MeResponse {
  user: AuthUser;
  memberships: StaffMembership[];
}

export interface OtpRequestResult {
  sent: true;
  expiresInSeconds: number;
  /** Only present when the server runs with OTP_DEV_ECHO enabled. */
  devCode?: string;
}

export interface AuthProvidersInfo {
  google: { enabled: boolean; demo: boolean; webClientId: string | null; iosClientId: string | null; androidClientId: string | null };
  apple: { enabled: boolean; demo: boolean; serviceId: string | null; redirectUri: string | null };
  phoneOtp: { enabled: boolean; devEcho: boolean };
}

// ---------------------------------------------------------------------------
// Customer profile
// ---------------------------------------------------------------------------

export interface CustomerProfile {
  user: AuthUser;
  dietaryPreferences: DietaryTag[];
  allergens: Allergen[];
  defaultStoreId: string | null;
  loyaltyPoints: number;
  stats: { orders: number; totalSpent: number; totalSavings: number };
}

export interface Address {
  id: string;
  label: AddressLabel;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  lat: number;
  lng: number;
  receiverName: string | null;
  receiverPhone: string | null;
  isDefault: boolean;
}

export interface SavedPaymentMethod {
  id: string;
  type: PaymentMethodType;
  provider: PaymentProviderName;
  label: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  upiId: string | null;
  email: string | null;
  isDefault: boolean;
  createdAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Catalogue & stores
// ---------------------------------------------------------------------------

export interface Category {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  color: string;
  sortOrder: number;
  productCount?: number;
}

export interface CatalogProduct {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  brand: string;
  description: string | null;
  unit: string;
  categoryId: string;
  categoryName: string;
  emoji: string;
  color: string;
  imageUrl: string | null;
  mrp: number;
  price: number;
  discountPercent: number;
  taxRate: number;
  dietaryTags: DietaryTag[];
  allergens: Allergen[];
  stockStatus: StockStatus;
  /** Units the customer can order right now (shelf + storage, capped). */
  availableQty: number;
  maxOrderQty: number;
  location: ItemLocation | null;
  /** True when units are on the shop floor (not only in storage). */
  onShelf: boolean;
  offerTag: string | null;
}

export interface OfferBanner {
  id: string;
  code: string | null;
  title: string;
  description: string | null;
  type: OfferType;
  bannerColor: string;
  minOrderValue: number;
  endsAt: ISODateTime;
}

export interface HomeSection {
  title: string;
  categoryId: string | null;
  products: CatalogProduct[];
}

export interface HomeFeed {
  store: StoreSummary;
  banners: OfferBanner[];
  categories: Category[];
  sections: HomeSection[];
}

export interface StoreSummary {
  id: string;
  code: string;
  name: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  lat: number;
  lng: number;
  phone: string;
  openingTime: string;
  closingTime: string;
  timezone: string;
  isOpenNow: boolean;
  status: StoreStatus;
  supportsDelivery: boolean;
  supportsPickup: boolean;
  supportsInStore: boolean;
  deliveryEtaMinutes: number;
  deliveryRadiusKm: number;
  distanceKm: number | null;
}

export interface StoreFeesInfo {
  deliveryFee: number;
  freeDeliveryThreshold: number;
  handlingFee: number;
  smallCartThreshold: number;
  smallCartFee: number;
}

export interface StoreSettings extends StoreFeesInfo {
  deliveryEtaMinutes: number;
  deliveryRadiusKm: number;
  pickupSlotMinutes: 15 | 30 | 60;
  pickupSlotCapacity: number;
  pickupLeadMinutes: number;
  exitPassTtlMinutes: number;
  sessionIdleMinutes: number;
  autoCreateRestockTasks: boolean;
  geofenceMeters: number;
}

export interface StoreDetail extends StoreSummary {
  email: string | null;
  layout: StoreLayout;
  fees: StoreFeesInfo;
}

export interface StockCheckStore {
  store: StoreSummary;
  stockStatus: StockStatus;
  availableQty: number;
  price: number;
  location: ItemLocation | null;
}

export interface StockCheckResult {
  product: Pick<CatalogProduct, 'id' | 'name' | 'brand' | 'unit' | 'emoji' | 'color' | 'imageUrl' | 'mrp'>;
  stores: StockCheckStore[];
}

export interface PickupSlot {
  start: ISODateTime;
  end: ISODateTime;
  remaining: number;
  available: boolean;
}

export interface PickupSlotDay {
  date: ISODate;
  label: string;
  slots: PickupSlot[];
}

// ---------------------------------------------------------------------------
// Collaborative lists
// ---------------------------------------------------------------------------

export interface ListMember {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: 'OWNER' | 'EDITOR';
  joinedAt: ISODateTime;
}

export interface ListItemProduct {
  id: string;
  name: string;
  brand: string;
  unit: string;
  emoji: string;
  color: string;
  imageUrl: string | null;
  barcode: string;
  price: number;
  mrp: number;
  location: ItemLocation | null;
  stockStatus: StockStatus | null;
}

export interface ListItem {
  id: string;
  listId: string;
  productId: string | null;
  name: string;
  quantity: number;
  note: string | null;
  isChecked: boolean;
  checkedByName: string | null;
  checkedAt: ISODateTime | null;
  addedById: string;
  addedByName: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  product: ListItemProduct | null;
}

export interface ShoppingListSummary {
  id: string;
  name: string;
  emoji: string;
  ownerId: string;
  storeId: string | null;
  itemCount: number;
  checkedCount: number;
  members: ListMember[];
  updatedAt: ISODateTime;
}

export interface ShoppingList extends ShoppingListSummary {
  shareCode: string;
  items: ListItem[];
  /** Sum of known product prices x quantity for unchecked + checked items. */
  estimatedTotal: number;
  createdAt: ISODateTime;
}

export type ListUpdateAction =
  | 'ITEM_ADDED'
  | 'ITEM_UPDATED'
  | 'ITEM_REMOVED'
  | 'LIST_UPDATED'
  | 'MEMBER_JOINED'
  | 'MEMBER_LEFT'
  | 'LIST_DELETED';

export interface ListUpdateEvent {
  listId: string;
  action: ListUpdateAction;
  item?: ListItem;
  itemId?: string;
  member?: ListMember;
  list?: ShoppingListSummary;
  actor: PersonRef;
  at: ISODateTime;
}

// ---------------------------------------------------------------------------
// Orders & payments
// ---------------------------------------------------------------------------

export interface QuoteLine {
  productId: string;
  name: string;
  brand: string;
  unit: string;
  emoji: string;
  color: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
  mrp: number;
  lineTotal: number;
  availableQty: number;
  available: boolean;
}

export interface AppliedOffer {
  offerId: string;
  code: string | null;
  title: string;
  applicable: boolean;
  discount: number;
  message: string;
}

export interface QuoteResult {
  storeId: string;
  channel: OrderChannel;
  lines: QuoteLine[];
  bill: Bill;
  offer: AppliedOffer | null;
  unavailable: { productId: string; name: string; requested: number; available: number }[];
  deliveryEtaMinutes: number | null;
}

export interface AddressSnapshot {
  label: AddressLabel;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  lat: number;
  lng: number;
  receiverName: string | null;
  receiverPhone: string | null;
}

export interface OrderItem {
  id: string;
  productId: string;
  name: string;
  brand: string;
  unit: string;
  emoji: string;
  color: string;
  imageUrl: string | null;
  barcode: string;
  quantity: number;
  unitPrice: number;
  mrp: number;
  lineTotal: number;
  location: ItemLocation | null;
}

export interface OrderEvent {
  status: OrderStatus;
  note: string | null;
  actorName: string | null;
  at: ISODateTime;
}

export interface ExitPass {
  id: string;
  /**
   * The bearer token encoded in the QR/barcode. Only returned right after it
   * is issued or re-issued (POST /orders/:id/exit-pass); the server stores a hash.
   */
  token: string | null;
  uri: string | null;
  /** Last characters of the token, for support look-ups. */
  hint: string;
  status: ExitPassStatus;
  issuedAt: ISODateTime;
  expiresAt: ISODateTime;
  usedAt: ISODateTime | null;
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  channel: OrderChannel;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  paymentMethod: PaymentMethodType | null;
  storeId: string;
  storeName: string;
  total: number;
  itemCount: number;
  previewEmojis: string[];
  scheduledFor: ISODateTime | null;
  placedAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface Order extends OrderSummary {
  items: OrderItem[];
  bill: Bill;
  couponCode: string | null;
  address: AddressSnapshot | null;
  slotEnd: ISODateTime | null;
  pickupCode: string | null;
  notes: string | null;
  events: OrderEvent[];
  exitPass: ExitPass | null;
  deliveryEtaMinutes: number | null;
  outForDeliveryAt: ISODateTime | null;
  completedAt: ISODateTime | null;
  cancelReason: string | null;
  rider: { name: string; phone: string } | null;
  store: { id: string; name: string; addressLine: string; lat: number; lng: number; phone: string };
  customer: { id: string; name: string; phone: string | null } | null;
  picker: PersonRef | null;
}

export type PaymentClientAction =
  | { type: 'none' }
  | { type: 'cash' }
  | { type: 'demo'; method: PaymentMethodType; amount: number; currency: string }
  | {
      type: 'stripe';
      clientSecret: string;
      publishableKey: string;
      paymentIntentId: string;
      merchantDisplayName: string;
      merchantCountryCode: string;
      customerId: string | null;
      customerEphemeralKeySecret: string | null;
    }
  | { type: 'paypal'; approvalUrl: string; paypalOrderId: string }
  | {
      type: 'razorpay';
      keyId: string;
      razorpayOrderId: string;
      amount: number;
      currency: string;
      merchantName: string;
      prefill: { name: string; email: string | null; contact: string | null };
    };

export interface PaymentInfo {
  id: string;
  orderId: string;
  provider: PaymentProviderName;
  method: PaymentMethodType;
  status: PaymentStatus;
  amount: number;
  currency: string;
  clientAction: PaymentClientAction;
}

export interface CheckoutResult {
  order: Order;
  payment: PaymentInfo;
}

export interface PaymentMethodAvailability {
  method: PaymentMethodType;
  provider: PaymentProviderName;
  live: boolean;
  channels: OrderChannel[];
}

export interface PaymentsConfig {
  currency: string;
  demoMode: boolean;
  methods: PaymentMethodAvailability[];
  stripePublishableKey: string | null;
  razorpayKeyId: string | null;
  paypalClientId: string | null;
  merchantDisplayName: string;
  merchantCountryCode: string;
}

// ---------------------------------------------------------------------------
// In-store scan & go
// ---------------------------------------------------------------------------

export interface SessionItem {
  id: string;
  productId: string;
  name: string;
  brand: string;
  unit: string;
  emoji: string;
  color: string;
  imageUrl: string | null;
  barcode: string;
  quantity: number;
  unitPrice: number;
  mrp: number;
  lineTotal: number;
  location: ItemLocation | null;
  addedVia: 'APP' | 'SMART_CART';
}

export interface InStoreSession {
  id: string;
  storeId: string;
  storeName: string;
  status: SessionStatus;
  pairingCode: string;
  listId: string | null;
  cartDevice: { id: string; name: string } | null;
  items: SessionItem[];
  bill: Bill;
  orderId: string | null;
  startedAt: ISODateTime;
  lastActivityAt: ISODateTime;
  expiresAt: ISODateTime;
}

export interface SessionChange {
  type: 'ADDED' | 'REMOVED' | 'UPDATED';
  productId: string;
  productName: string;
  quantity: number;
  source: 'APP' | 'SMART_CART';
}

export interface SessionUpdateEvent {
  session: InStoreSession;
  change: SessionChange | null;
}

export interface GateVerifyResult {
  open: boolean;
  result: GateResult;
  reason: GateReason;
  message: string;
  order: { orderNumber: string; itemCount: number; total: number; customerName: string; paidAt: ISODateTime | null } | null;
}

// ---------------------------------------------------------------------------
// Store operations
// ---------------------------------------------------------------------------

export interface InventoryRow {
  storeProductId: string;
  productId: string;
  sku: string;
  barcode: string;
  name: string;
  brand: string;
  unit: string;
  emoji: string;
  color: string;
  imageUrl: string | null;
  categoryId: string;
  categoryName: string;
  price: number;
  mrp: number;
  cost: number;
  shelfQty: number;
  storageQty: number;
  reorderThreshold: number;
  restockTarget: number;
  location: ItemLocation;
  isAvailable: boolean;
  stockStatus: StockStatus;
  openAlertId: string | null;
  updatedAt: ISODateTime;
}

export interface InventoryUpdateEvent {
  storeId: string;
  storeProductId: string;
  productId: string;
  productName: string;
  shelfQty: number;
  storageQty: number;
  stockStatus: StockStatus;
  reason: InventoryMovementType;
  shelfDelta: number;
  storageDelta: number;
  at: ISODateTime;
}

export interface InventoryMovement {
  id: string;
  type: InventoryMovementType;
  shelfDelta: number;
  storageDelta: number;
  note: string | null;
  actorName: string | null;
  refType: string | null;
  createdAt: ISODateTime;
}

export interface RestockAlert {
  id: string;
  storeId: string;
  status: AlertStatus;
  level: AlertLevel;
  product: Pick<CatalogProduct, 'id' | 'name' | 'brand' | 'unit' | 'emoji' | 'color' | 'imageUrl'>;
  storeProductId: string;
  location: ItemLocation;
  shelfQty: number;
  storageQty: number;
  threshold: number;
  restockTarget: number;
  needsReorder: boolean;
  createdAt: ISODateTime;
  acknowledgedBy: string | null;
  acknowledgedAt: ISODateTime | null;
  resolvedBy: string | null;
  resolvedAt: ISODateTime | null;
  restockedQty: number | null;
  taskId: string | null;
}

export interface GateEventDto {
  id: string;
  deviceName: string;
  result: GateResult;
  reason: GateReason;
  orderNumber: string | null;
  customerName: string | null;
  at: ISODateTime;
}

export interface OpsOverview {
  storeId: string;
  date: ISODate;
  today: {
    netSales: number;
    grossProfit: number;
    orders: number;
    avgOrderValue: number;
    itemsSold: number;
    exits: number;
  };
  yesterday: { netSales: number; orders: number };
  activeShoppers: number;
  openAlerts: number;
  pendingOrders: { delivery: number; pickup: number };
  staff: { onDuty: number; scheduledToday: number; notYetIn: number };
  tasks: { open: number; awaitingReview: number; overdue: number };
  salesByHour: { hour: number; netSales: number; orders: number }[];
  recentGateEvents: GateEventDto[];
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface AnalyticsSummary {
  from: ISODate;
  to: ISODate;
  grossSales: number;
  discounts: number;
  refunds: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  marginPct: number;
  taxCollected: number;
  orders: number;
  avgOrderValue: number;
  itemsSold: number;
  uniqueCustomers: number;
  newCustomers: number;
  repeatCustomerRate: number;
  cancelledOrders: number;
  byChannel: Record<OrderChannel, { orders: number; netSales: number; grossProfit: number }>;
  previous: { netSales: number; grossProfit: number; orders: number; avgOrderValue: number };
}

export interface TrendPoint {
  period: ISODate;
  netSales: number;
  grossProfit: number;
  orders: number;
  itemsSold: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  brand: string;
  unit: string;
  emoji: string;
  color: string;
  categoryName: string;
  quantity: number;
  netSales: number;
  grossProfit: number;
  orders: number;
}

export interface CategoryPerformance {
  categoryId: string;
  name: string;
  emoji: string;
  color: string;
  quantity: number;
  netSales: number;
  grossProfit: number;
  share: number;
}

export interface OfferPerformance {
  offerId: string;
  code: string | null;
  title: string;
  type: OfferType;
  redemptions: number;
  uniqueCustomers: number;
  discountGiven: number;
  revenue: number;
  avgOrderValue: number;
  /** AOV of orders using the offer vs. AOV of all orders in the range, in %. */
  aovLiftPct: number;
  /** revenue per rupee of discount */
  returnOnDiscount: number;
}

export interface RushHourCell {
  dow: number;
  hour: number;
  orders: number;
  netSales: number;
}

export interface RushHours {
  heatmap: RushHourCell[];
  hourly: { hour: number; orders: number; netSales: number; DELIVERY: number; PICKUP: number; IN_STORE: number }[];
  peakHours: { hour: number; orders: number; share: number }[];
  byWeekday: { dow: number; orders: number; netSales: number }[];
}

export interface PaymentMix {
  method: PaymentMethodType;
  orders: number;
  amount: number;
  share: number;
}

export interface InventoryHealth {
  skuCount: number;
  stockCostValue: number;
  stockRetailValue: number;
  lowStock: number;
  outOfStock: number;
  reorderSuggestions: {
    productId: string;
    name: string;
    emoji: string;
    unit: string;
    shelfQty: number;
    storageQty: number;
    avgDailySales: number;
    daysOfCover: number;
    suggestedOrderQty: number;
  }[];
  slowMovers: { productId: string; name: string; emoji: string; stock: number; unitsSold: number; stockValue: number }[];
}

export interface BasketInsights {
  avgItemsPerOrder: number;
  avgDistinctProducts: number;
  pairs: { a: PersonRef & { emoji: string }; b: PersonRef & { emoji: string }; orders: number; lift: number }[];
}

export interface CustomerInsights {
  dietary: { tag: DietaryTag; customers: number; share: number }[];
  newVsReturning: { period: ISODate; newCustomers: number; returningCustomers: number }[];
  /** Neighbourhoods placing the most delivery orders. */
  topLocalities: { locality: string; orders: number }[];
}

export interface StaffPerformance {
  employeeId: string;
  name: string;
  role: StaffRole;
  department: Department;
  tasksCompleted: number;
  tasksOpen: number;
  avgRating: number | null;
  minutesWorked: number;
  daysPresent: number;
  lateDays: number;
  onTimeRate: number;
}

// ---------------------------------------------------------------------------
// Team, onboarding requests, tasks, shifts, attendance
// ---------------------------------------------------------------------------

export interface Employee {
  id: string;
  userId: string | null;
  storeId: string;
  storeName: string;
  storeCode: string;
  name: string;
  email: string | null;
  phone: string | null;
  username: string | null;
  employeeCode: string;
  role: StaffRole;
  department: Department;
  designation: string | null;
  joiningDate: ISODate;
  /** null when the viewer is not allowed to see wages */
  wageType: WageType | null;
  wageAmount: number | null;
  status: EmployeeStatus;
  exitDate: ISODate | null;
  exitReason: string | null;
  reportsTo: PersonRef | null;
  lastLoginAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface CandidateDetails {
  fullName: string;
  email: string;
  phone: string;
  role: RequestableRole;
  department: Department;
  designation: string | null;
  joiningDate: ISODate;
  wageType: WageType;
  wageAmount: number;
  dateOfBirth: ISODate | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  idProofType: IdProofType | null;
  idProofLast4: string | null;
  notes: string | null;
  reportsToId: string | null;
}

export interface CredentialRequestEvent {
  id: string;
  action: CredentialRequestAction;
  actorName: string;
  actorRole: string;
  comment: string | null;
  fromStatus: CredentialRequestStatus | null;
  toStatus: CredentialRequestStatus;
  at: ISODateTime;
}

export interface CredentialRequest {
  id: string;
  requestNumber: string;
  storeId: string;
  storeName: string;
  storeCode: string;
  status: CredentialRequestStatus;
  revision: number;
  candidate: CandidateDetails;
  requestedBy: PersonRef & { role: StaffRole };
  lastComment: string | null;
  events: CredentialRequestEvent[];
  issued: { employeeId: string; employeeCode: string; username: string } | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface IssuedCredentials {
  employeeId: string;
  employeeCode: string;
  username: string;
  temporaryPassword: string;
  loginUrl: string;
}

export interface Task {
  id: string;
  storeId: string;
  title: string;
  description: string | null;
  category: TaskCategory;
  priority: Priority;
  status: TaskStatus;
  assignee: PersonRef & { role: StaffRole; department: Department };
  assignedBy: PersonRef & { role: StaffRole };
  aisle: number | null;
  dueAt: ISODateTime | null;
  isOverdue: boolean;
  startedAt: ISODateTime | null;
  completedAt: ISODateTime | null;
  completionNote: string | null;
  completionPhotoUrl: string | null;
  review: { rating: number | null; comment: string | null; reviewerName: string; reviewedAt: ISODateTime } | null;
  restockAlertId: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ShiftTemplate {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  color: string;
}

export interface EmployeeRef extends PersonRef {
  role: StaffRole;
  department: Department;
  employeeCode: string;
}

export interface Shift {
  id: string;
  storeId: string;
  employee: EmployeeRef;
  date: ISODate;
  startAt: ISODateTime;
  endAt: ISODateTime;
  label: string | null;
  breakMinutes: number;
  notes: string | null;
  status: ShiftStatus;
  attendance: { id: string; clockInAt: ISODateTime; clockOutAt: ISODateTime | null; lateByMinutes: number } | null;
}

export interface AttendanceRecord {
  id: string;
  storeId: string;
  employee: EmployeeRef;
  shiftId: string | null;
  shiftStartAt: ISODateTime | null;
  shiftEndAt: ISODateTime | null;
  clockInAt: ISODateTime;
  clockOutAt: ISODateTime | null;
  workedMinutes: number;
  clockInMethod: ClockMethod;
  clockOutMethod: ClockMethod | null;
  lateByMinutes: number;
  leftEarlyByMinutes: number;
  notes: string | null;
  editedByName: string | null;
}

export interface AttendanceSummaryRow {
  employee: EmployeeRef;
  daysScheduled: number;
  daysPresent: number;
  absences: number;
  lateDays: number;
  minutesWorked: number;
  scheduledMinutes: number;
  overtimeMinutes: number;
  avgClockIn: string | null;
  avgClockOut: string | null;
  estimatedPay: number | null;
}

export interface AttendanceBoard {
  date: ISODate;
  onDuty: AttendanceRecord[];
  completed: AttendanceRecord[];
  notYetIn: Shift[];
}

export interface MyAttendance {
  open: AttendanceRecord | null;
  todayShift: Shift | null;
  upcoming: Shift[];
  recent: AttendanceRecord[];
  weekMinutes: number;
}

// ---------------------------------------------------------------------------
// Store requests (tickets), notifications, devices, admin
// ---------------------------------------------------------------------------

export interface TicketMessage {
  id: string;
  author: PersonRef & { side: 'STORE' | 'ADMIN' };
  body: string;
  isInternal: boolean;
  createdAt: ISODateTime;
}

export interface Ticket {
  id: string;
  ticketNumber: string;
  storeId: string;
  storeName: string;
  storeCode: string;
  category: TicketCategory;
  priority: Priority;
  status: TicketStatus;
  subject: string;
  description: string;
  raisedBy: PersonRef & { role: StaffRole | null };
  assignedAdmin: PersonRef | null;
  relatedEmployee: PersonRef | null;
  messageCount: number;
  messages: TicketMessage[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  resolvedAt: ISODateTime | null;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface Device {
  id: string;
  storeId: string;
  type: DeviceType;
  name: string;
  apiKeyPrefix: string;
  isActive: boolean;
  lastSeenAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface DeviceWithKey extends Device {
  /** Shown once on creation or rotation. */
  apiKey: string;
}

export interface KioskCode {
  code: string;
  uri: string;
  expiresAt: ISODateTime;
}

export interface AdminOverview {
  stores: { total: number; active: number };
  employees: { total: number; active: number };
  customers: number;
  pendingRequests: number;
  openTickets: number;
  today: { netSales: number; orders: number };
  last30: { netSales: number; orders: number; grossProfit: number };
  salesByStore: { storeId: string; storeName: string; storeCode: string; netSales: number; orders: number }[];
  trend: TrendPoint[];
}

export interface AdminStoreRow extends StoreSummary {
  owner: { userId: string; name: string; email: string | null; phone: string | null } | null;
  employeeCount: number;
  activeEmployeeCount: number;
  monthlyWageBill: number;
  netSales30d: number;
  orders30d: number;
  openTickets: number;
  pendingRequests: number;
}

export interface AdminStoreDetail {
  store: StoreDetail & { settings: StoreSettings };
  owner: AdminStoreRow['owner'];
  employees: Employee[];
  devices: Device[];
  stats: { netSales30d: number; orders30d: number; grossProfit30d: number; openTickets: number; pendingRequests: number };
}

export interface CreatedStore {
  store: StoreDetail;
  ownerCredentials: IssuedCredentials | null;
}

export interface AuditLogEntry {
  id: string;
  actorName: string | null;
  actorKind: UserKind | 'DEVICE' | 'SYSTEM';
  action: string;
  entityType: string;
  entityId: string | null;
  storeName: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  createdAt: ISODateTime;
}

export interface Offer {
  id: string;
  storeId: string | null;
  code: string | null;
  title: string;
  description: string | null;
  type: OfferType;
  value: number;
  minOrderValue: number;
  maxDiscount: number | null;
  productId: string | null;
  categoryId: string | null;
  buyQty: number | null;
  getQty: number | null;
  channels: OrderChannel[];
  startsAt: ISODateTime;
  endsAt: ISODateTime;
  isActive: boolean;
  usageLimitPerUser: number | null;
  bannerColor: string;
  redemptions: number;
}
