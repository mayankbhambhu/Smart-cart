/**
 * Domain constants shared by the API, web and mobile apps.
 * Every enum is declared once as a readonly tuple so it can drive
 * database enums, zod schemas and UI labels from a single source.
 */

export const CURRENCY = 'INR';
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

// ---------------------------------------------------------------------------
// Identity & roles
// ---------------------------------------------------------------------------

export const USER_KINDS = ['CUSTOMER', 'STAFF', 'ADMIN'] as const;
export type UserKind = (typeof USER_KINDS)[number];

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const STAFF_ROLES = ['OWNER', 'STORE_MANAGER', 'FLOOR_MANAGER', 'WORKER'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  OWNER: 'Store Owner',
  STORE_MANAGER: 'Store Manager',
  FLOOR_MANAGER: 'Floor Manager',
  WORKER: 'Worker',
};

/** Higher rank = more authority inside a store. */
export const STAFF_ROLE_RANK: Record<StaffRole, number> = {
  OWNER: 4,
  STORE_MANAGER: 3,
  FLOOR_MANAGER: 2,
  WORKER: 1,
};

/** Roles that may be requested through the onboarding (credential) workflow. */
export const REQUESTABLE_ROLES = ['STORE_MANAGER', 'FLOOR_MANAGER', 'WORKER'] as const;
export type RequestableRole = (typeof REQUESTABLE_ROLES)[number];

export const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  SUPPORT: 'Support',
};

export const DEPARTMENTS = [
  'MANAGEMENT',
  'FLOOR',
  'WAREHOUSE',
  'PICKING',
  'DELIVERY',
  'CUSTOMER_SERVICE',
  'SECURITY',
] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_LABELS: Record<Department, string> = {
  MANAGEMENT: 'Management',
  FLOOR: 'Shop Floor',
  WAREHOUSE: 'Warehouse & Restock',
  PICKING: 'Order Picking',
  DELIVERY: 'Delivery',
  CUSTOMER_SERVICE: 'Customer Service',
  SECURITY: 'Security & Exit',
};

export const EMPLOYEE_STATUSES = ['ACTIVE', 'ON_LEAVE', 'LEFT', 'TERMINATED'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: 'Active',
  ON_LEAVE: 'On leave',
  LEFT: 'Left (resigned)',
  TERMINATED: 'Terminated',
};

export const WAGE_TYPES = ['MONTHLY', 'DAILY', 'HOURLY'] as const;
export type WageType = (typeof WAGE_TYPES)[number];

export const WAGE_TYPE_LABELS: Record<WageType, string> = {
  MONTHLY: 'per month',
  DAILY: 'per day',
  HOURLY: 'per hour',
};

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export const DIETARY_TAGS = [
  'VEGETARIAN',
  'VEGAN',
  'GLUTEN_FREE',
  'DAIRY_FREE',
  'NUT_FREE',
  'EGG_FREE',
  'SUGAR_FREE',
  'KETO',
  'HIGH_PROTEIN',
  'ORGANIC',
  'JAIN',
  'HALAL',
] as const;
export type DietaryTag = (typeof DIETARY_TAGS)[number];

export const DIETARY_TAG_META: Record<DietaryTag, { label: string; emoji: string }> = {
  VEGETARIAN: { label: 'Vegetarian', emoji: '🥗' },
  VEGAN: { label: 'Vegan', emoji: '🌱' },
  GLUTEN_FREE: { label: 'Gluten-free', emoji: '🌾' },
  DAIRY_FREE: { label: 'Dairy-free', emoji: '🥛' },
  NUT_FREE: { label: 'Nut-free', emoji: '🥜' },
  EGG_FREE: { label: 'Egg-free', emoji: '🥚' },
  SUGAR_FREE: { label: 'Sugar-free', emoji: '🍬' },
  KETO: { label: 'Keto', emoji: '🥑' },
  HIGH_PROTEIN: { label: 'High protein', emoji: '💪' },
  ORGANIC: { label: 'Organic', emoji: '🍃' },
  JAIN: { label: 'Jain', emoji: '🪷' },
  HALAL: { label: 'Halal', emoji: '☪️' },
};

export const ALLERGENS = ['MILK', 'EGGS', 'PEANUTS', 'TREE_NUTS', 'SOY', 'WHEAT', 'FISH', 'SHELLFISH', 'SESAME'] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const ADDRESS_LABELS = ['HOME', 'WORK', 'OTHER'] as const;
export type AddressLabel = (typeof ADDRESS_LABELS)[number];

// ---------------------------------------------------------------------------
// Orders, payments, offers
// ---------------------------------------------------------------------------

export const ORDER_CHANNELS = ['DELIVERY', 'PICKUP', 'IN_STORE'] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

export const ORDER_CHANNEL_LABELS: Record<OrderChannel, string> = {
  DELIVERY: 'Delivery',
  PICKUP: 'Scheduled pickup',
  IN_STORE: 'In-store (Scan & Go)',
};

export const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PLACED',
  'PACKING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'PICKED_UP',
  'COMPLETED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PLACED: 'Order placed',
  PACKING: 'Packing your order',
  READY_FOR_PICKUP: 'Ready for pickup',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  PICKED_UP: 'Picked up',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

/** The happy-path timeline for each channel (used for progress UIs). */
export const ORDER_FLOW: Record<OrderChannel, OrderStatus[]> = {
  DELIVERY: ['PLACED', 'PACKING', 'OUT_FOR_DELIVERY', 'DELIVERED'],
  PICKUP: ['PLACED', 'PACKING', 'READY_FOR_PICKUP', 'PICKED_UP'],
  IN_STORE: ['COMPLETED'],
};

/** Status changes store staff are allowed to make, per channel. */
export const ORDER_STAFF_TRANSITIONS: Record<OrderChannel, Partial<Record<OrderStatus, OrderStatus[]>>> = {
  DELIVERY: {
    PLACED: ['PACKING', 'CANCELLED'],
    PACKING: ['OUT_FOR_DELIVERY', 'CANCELLED'],
    OUT_FOR_DELIVERY: ['DELIVERED'],
  },
  PICKUP: {
    PLACED: ['PACKING', 'CANCELLED'],
    PACKING: ['READY_FOR_PICKUP', 'CANCELLED'],
    READY_FOR_PICKUP: ['PICKED_UP', 'CANCELLED'],
  },
  IN_STORE: {},
};

export const TERMINAL_ORDER_STATUSES: OrderStatus[] = ['DELIVERED', 'PICKED_UP', 'COMPLETED', 'CANCELLED'];

export const PAYMENT_METHODS = ['UPI', 'CARD', 'APPLE_PAY', 'GOOGLE_PAY', 'PAYPAL', 'CASH_ON_DELIVERY'] as const;
export type PaymentMethodType = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodType, string> = {
  UPI: 'UPI',
  CARD: 'Credit / Debit card',
  APPLE_PAY: 'Apple Pay',
  GOOGLE_PAY: 'Google Pay',
  PAYPAL: 'PayPal',
  CASH_ON_DELIVERY: 'Cash on delivery',
};

/** Methods a customer can save to their profile. */
export const SAVEABLE_PAYMENT_METHODS = ['UPI', 'CARD', 'PAYPAL'] as const;
export type SaveablePaymentMethod = (typeof SAVEABLE_PAYMENT_METHODS)[number];

export const PAYMENT_PROVIDERS = ['stripe', 'paypal', 'razorpay', 'demo', 'cash'] as const;
export type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_STATUSES = [
  'CREATED',
  'REQUIRES_ACTION',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const ORDER_PAYMENT_STATUSES = ['UNPAID', 'PAID', 'FAILED', 'REFUNDED'] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

export const OFFER_TYPES = ['PERCENT_OFF', 'FLAT_OFF', 'BOGO', 'FREE_DELIVERY'] as const;
export type OfferType = (typeof OFFER_TYPES)[number];

export const OFFER_TYPE_LABELS: Record<OfferType, string> = {
  PERCENT_OFF: '% off',
  FLAT_OFF: 'Flat off',
  BOGO: 'Buy X get Y',
  FREE_DELIVERY: 'Free delivery',
};

// ---------------------------------------------------------------------------
// In-store: smart carts, exit passes, devices
// ---------------------------------------------------------------------------

export const SESSION_STATUSES = ['ACTIVE', 'CHECKOUT', 'PAID', 'ABANDONED', 'EXPIRED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const EXIT_PASS_STATUSES = ['ACTIVE', 'USED', 'EXPIRED', 'REVOKED'] as const;
export type ExitPassStatus = (typeof EXIT_PASS_STATUSES)[number];

export const DEVICE_TYPES = ['EXIT_GATE', 'SMART_CART', 'KIOSK'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  EXIT_GATE: 'Exit gate',
  SMART_CART: 'Smart cart',
  KIOSK: 'Attendance kiosk',
};

export const GATE_RESULTS = ['OPENED', 'DENIED'] as const;
export type GateResult = (typeof GATE_RESULTS)[number];

export const GATE_REASONS = [
  'OK',
  'NOT_FOUND',
  'ALREADY_USED',
  'EXPIRED',
  'REVOKED',
  'WRONG_STORE',
  'UNPAID',
  'MALFORMED',
] as const;
export type GateReason = (typeof GATE_REASONS)[number];

export const GATE_REASON_LABELS: Record<GateReason, string> = {
  OK: 'Payment verified. Thank you for shopping!',
  NOT_FOUND: 'Receipt not recognised',
  ALREADY_USED: 'This receipt has already been used to exit',
  EXPIRED: 'This exit pass has expired. Please see a staff member.',
  REVOKED: 'This exit pass was revoked. Please see a staff member.',
  WRONG_STORE: 'This receipt belongs to a different store',
  UNPAID: 'Payment not completed',
  MALFORMED: 'Unreadable code. Please scan again.',
};

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export const STOCK_STATUSES = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  IN_STOCK: 'In stock',
  LOW_STOCK: 'Only a few left',
  OUT_OF_STOCK: 'Out of stock',
};

/** Customer-facing "low stock" cut-off for total available units. */
export const LOW_STOCK_DISPLAY_THRESHOLD = 5;

export const INVENTORY_MOVEMENT_TYPES = [
  'CART_ADD',
  'CART_REMOVE',
  'CART_EXPIRED',
  'ORDER_RESERVE',
  'ORDER_RELEASE',
  'RESTOCK',
  'RECEIVE',
  'ADJUSTMENT',
  'DAMAGE',
] as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export const INVENTORY_MOVEMENT_LABELS: Record<InventoryMovementType, string> = {
  CART_ADD: 'Added to smart cart',
  CART_REMOVE: 'Removed from smart cart',
  CART_EXPIRED: 'Abandoned cart returned',
  ORDER_RESERVE: 'Reserved for online order',
  ORDER_RELEASE: 'Released from cancelled order',
  RESTOCK: 'Shelf restocked from storage',
  RECEIVE: 'Stock received',
  ADJUSTMENT: 'Manual adjustment',
  DAMAGE: 'Damaged / expired',
};

export const ALERT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const ALERT_LEVELS = ['LOW', 'OUT_OF_STOCK'] as const;
export type AlertLevel = (typeof ALERT_LEVELS)[number];

// ---------------------------------------------------------------------------
// Work management
// ---------------------------------------------------------------------------

export const TASK_CATEGORIES = [
  'RESTOCK',
  'CLEANING',
  'INVENTORY_COUNT',
  'ORDER_PICKING',
  'CUSTOMER_SERVICE',
  'MAINTENANCE',
  'DISPLAY_SETUP',
  'DELIVERY',
  'OTHER',
] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  RESTOCK: 'Restock',
  CLEANING: 'Cleaning',
  INVENTORY_COUNT: 'Inventory count',
  ORDER_PICKING: 'Order picking',
  CUSTOMER_SERVICE: 'Customer service',
  MAINTENANCE: 'Maintenance',
  DISPLAY_SETUP: 'Display setup',
  DELIVERY: 'Delivery',
  OTHER: 'Other',
};

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'APPROVED', 'REOPENED', 'CANCELLED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  DONE: 'Done (awaiting review)',
  APPROVED: 'Approved',
  REOPENED: 'Reopened',
  CANCELLED: 'Cancelled',
};

/** Tasks in these states still need the assignee to act. */
export const OPEN_TASK_STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'REOPENED'];

export const SHIFT_STATUSES = ['SCHEDULED', 'CANCELLED'] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

export const CLOCK_METHODS = ['APP', 'KIOSK', 'MANUAL'] as const;
export type ClockMethod = (typeof CLOCK_METHODS)[number];

/** Minutes after shift start before a clock-in counts as late. */
export const LATE_GRACE_MINUTES = 10;

// ---------------------------------------------------------------------------
// Onboarding (credential) requests
// ---------------------------------------------------------------------------

export const CREDENTIAL_REQUEST_STATUSES = [
  'PENDING_OWNER',
  'OWNER_CHANGES_REQUESTED',
  'PENDING_ADMIN',
  'ADMIN_CHANGES_REQUESTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const;
export type CredentialRequestStatus = (typeof CREDENTIAL_REQUEST_STATUSES)[number];

export const CREDENTIAL_REQUEST_STATUS_LABELS: Record<CredentialRequestStatus, string> = {
  PENDING_OWNER: 'Waiting for store owner',
  OWNER_CHANGES_REQUESTED: 'Changes requested by owner',
  PENDING_ADMIN: 'Waiting for SmartCart admin',
  ADMIN_CHANGES_REQUESTED: 'Changes requested by admin',
  APPROVED: 'Approved, credentials issued',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export const CREDENTIAL_REQUEST_ACTIONS = [
  'SUBMITTED',
  'RESUBMITTED',
  'EDITED',
  'OWNER_APPROVED',
  'OWNER_REQUESTED_CHANGES',
  'ADMIN_APPROVED',
  'ADMIN_REQUESTED_CHANGES',
  'REJECTED',
  'CANCELLED',
] as const;
export type CredentialRequestAction = (typeof CREDENTIAL_REQUEST_ACTIONS)[number];

export const CREDENTIAL_REQUEST_ACTION_LABELS: Record<CredentialRequestAction, string> = {
  SUBMITTED: 'Request submitted',
  RESUBMITTED: 'Resubmitted with changes',
  EDITED: 'Details edited',
  OWNER_APPROVED: 'Approved by owner, sent to admin',
  OWNER_REQUESTED_CHANGES: 'Owner sent back for changes',
  ADMIN_APPROVED: 'Approved by admin, credentials issued',
  ADMIN_REQUESTED_CHANGES: 'Admin sent back for changes',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled by requester',
};

export const ID_PROOF_TYPES = ['AADHAAR', 'PAN', 'VOTER_ID', 'PASSPORT', 'DRIVING_LICENCE'] as const;
export type IdProofType = (typeof ID_PROOF_TYPES)[number];

// ---------------------------------------------------------------------------
// Store requests to SmartCart (support tickets)
// ---------------------------------------------------------------------------

export const TICKET_CATEGORIES = [
  'TECHNICAL',
  'HARDWARE',
  'PAYMENTS',
  'INVENTORY',
  'STAFFING',
  'EMPLOYEE_OFFBOARDING',
  'BILLING',
  'OTHER',
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  TECHNICAL: 'App / technical issue',
  HARDWARE: 'Gate / smart cart hardware',
  PAYMENTS: 'Payments & settlements',
  INVENTORY: 'Inventory & catalogue',
  STAFFING: 'Staffing & accounts',
  EMPLOYEE_OFFBOARDING: 'Employee offboarding',
  BILLING: 'Billing',
  OTHER: 'Other',
};

export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_STORE', 'RESOLVED', 'CLOSED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  WAITING_ON_STORE: 'Waiting on store',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const STORE_STATUSES = ['ACTIVE', 'ONBOARDING', 'INACTIVE'] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];

// ---------------------------------------------------------------------------
// Notifications & realtime
// ---------------------------------------------------------------------------

export const NOTIFICATION_TYPES = [
  'ORDER_STATUS',
  'LIST_ITEM_ADDED',
  'LIST_SHARED',
  'TASK_ASSIGNED',
  'TASK_COMPLETED',
  'TASK_REVIEWED',
  'RESTOCK_ALERT',
  'SHIFT_ASSIGNED',
  'CREDENTIAL_REQUEST',
  'TICKET_UPDATE',
  'GENERAL',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Socket.IO event names. Keep client and server in sync by importing these. */
export const SocketEvents = {
  // client -> server
  JOIN_LIST: 'list:join',
  LEAVE_LIST: 'list:leave',
  JOIN_ORDER: 'order:join',
  LEAVE_ORDER: 'order:leave',
  JOIN_SESSION: 'session:join',
  LEAVE_SESSION: 'session:leave',
  JOIN_STORE_OPS: 'ops:join',
  // server -> client
  NOTIFICATION: 'notification:new',
  LIST_UPDATED: 'list:updated',
  INVENTORY_UPDATED: 'inventory:updated',
  ALERT_CHANGED: 'alert:changed',
  ORDER_CHANGED: 'order:changed',
  TASK_CHANGED: 'task:changed',
  SESSION_UPDATED: 'session:updated',
  GATE_EVENT: 'gate:event',
  ATTENDANCE_CHANGED: 'attendance:changed',
  REQUEST_CHANGED: 'request:changed',
  TICKET_CHANGED: 'ticket:changed',
} as const;
export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];

export const API_PREFIX = '/api/v1';
