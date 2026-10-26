import { z } from 'zod';
import {
  ADDRESS_LABELS,
  ALLERGENS,
  ALERT_STATUSES,
  CLOCK_METHODS,
  CREDENTIAL_REQUEST_STATUSES,
  DEPARTMENTS,
  DEVICE_TYPES,
  DIETARY_TAGS,
  EMPLOYEE_STATUSES,
  ID_PROOF_TYPES,
  OFFER_TYPES,
  ORDER_CHANNELS,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PRIORITIES,
  REQUESTABLE_ROLES,
  STAFF_ROLES,
  STORE_STATUSES,
  TASK_CATEGORIES,
  TASK_STATUSES,
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  WAGE_TYPES,
} from './constants';
import { normalizePhone } from './format';

/**
 * Request validation schemas. The API validates every request body/query
 * with these, and the apps reuse them for client-side form validation.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const IdSchema = z.uuid('Invalid id');
export const EmailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));
export const PhoneSchema = z
  .string()
  .trim()
  .min(8, 'Enter a valid phone number')
  .transform(normalizePhone)
  .pipe(z.string().regex(/^\+[1-9]\d{9,14}$/, 'Enter a valid phone number'));
export const PasswordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Password is too long')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');
export const NameSchema = z.string().trim().min(2, 'Name is too short').max(80, 'Name is too long');
export const OtpCodeSchema = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code');
export const IsoDateSchema = z.iso.date('Use YYYY-MM-DD');
export const IsoDateTimeSchema = z.iso.datetime({ offset: true, message: 'Invalid date/time' });
export const TimeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24h)');
export const MoneySchema = z.number().int('Use whole paise').min(0).max(1_000_000_000);
export const LimitSchema = z.coerce.number().int().min(1).max(200).default(50);
export const OffsetSchema = z.coerce.number().int().min(0).default(0);

/** Comma-separated query parameter -> validated array. */
function csvOf<T extends readonly [string, ...string[]]>(values: T) {
  return z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',').map((v) => v.trim()).filter(Boolean) : []))
    .pipe(z.array(z.enum(values)));
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const RegisterSchema = z.object({
  name: NameSchema,
  email: EmailSchema,
  password: PasswordSchema,
  phone: PhoneSchema.optional(),
});

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Enter your password'),
});

export const OtpRequestSchema = z.object({ phone: PhoneSchema });

export const OtpVerifySchema = z.object({
  phone: PhoneSchema,
  code: OtpCodeSchema,
  name: NameSchema.optional(),
});

export const SocialLoginSchema = z.object({
  idToken: z.string().min(20),
  /** Apple only shares the user's name on the very first sign-in. */
  name: NameSchema.optional(),
  nonce: z.string().max(200).optional(),
});

export const DemoSocialLoginSchema = z.object({
  provider: z.enum(['google', 'apple']),
  email: EmailSchema,
  name: NameSchema,
});

export const StaffLoginSchema = z.object({
  identifier: z.string().trim().toLowerCase().min(3, 'Enter your username, employee code or email'),
  password: z.string().min(1, 'Enter your password'),
});

export const AdminLoginSchema = LoginSchema;

export const RefreshSchema = z.object({ refreshToken: z.string().min(20).optional() });

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: PasswordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'New password must be different',
    path: ['newPassword'],
  });

export const ForgotPasswordSchema = z.object({ email: EmailSchema });

export const ResetPasswordSchema = z.object({
  email: EmailSchema,
  code: OtpCodeSchema,
  newPassword: PasswordSchema,
});

// ---------------------------------------------------------------------------
// Customer profile
// ---------------------------------------------------------------------------

export const UpdateProfileSchema = z.object({
  name: NameSchema.optional(),
  email: EmailSchema.optional(),
  phone: PhoneSchema.optional(),
  avatarUrl: z.url().max(500).nullable().optional(),
  dietaryPreferences: z.array(z.enum(DIETARY_TAGS)).max(DIETARY_TAGS.length).optional(),
  allergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length).optional(),
  defaultStoreId: IdSchema.nullable().optional(),
});

export const AddressSchema = z.object({
  label: z.enum(ADDRESS_LABELS).default('HOME'),
  line1: z.string().trim().min(3, 'Enter house / flat and street').max(200),
  line2: z.string().trim().max(200).optional().nullable(),
  landmark: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a 6-digit PIN code'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  receiverName: NameSchema.optional().nullable(),
  receiverPhone: PhoneSchema.optional().nullable(),
  isDefault: z.boolean().optional(),
});

export const UpiIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9.\-_]{2,256}@[a-z][a-z0-9]{2,64}$/, 'Enter a valid UPI ID, e.g. name@okicici');

export const SavePaymentMethodSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('UPI'),
    upiId: UpiIdSchema,
    isDefault: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('CARD'),
    /** Stripe PaymentMethod id when Stripe is live; omitted in demo mode. */
    stripePaymentMethodId: z.string().startsWith('pm_').optional(),
    brand: z.string().trim().min(2).max(20),
    last4: z.string().regex(/^\d{4}$/),
    expMonth: z.number().int().min(1).max(12),
    expYear: z.number().int().min(2024).max(2100),
    holderName: NameSchema.optional(),
    isDefault: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('PAYPAL'),
    email: EmailSchema,
    isDefault: z.boolean().optional(),
  }),
]);

export const PushTokenSchema = z.object({
  token: z.string().min(10).max(300),
  platform: z.enum(['ios', 'android', 'web']),
});

// ---------------------------------------------------------------------------
// Catalogue & stores
// ---------------------------------------------------------------------------

export const CatalogQuerySchema = z.object({
  storeId: IdSchema,
  categoryId: IdSchema.optional(),
  q: z.string().trim().max(100).optional(),
  dietary: csvOf(DIETARY_TAGS),
  inStockOnly: z.stringbool().optional(),
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'discount', 'name']).default('relevance'),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  offset: OffsetSchema,
});

export const ProductLookupQuerySchema = z.object({
  storeId: IdSchema,
  barcode: z.string().trim().min(4).max(32),
});

export const NearbyStoresQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  q: z.string().trim().max(80).optional(),
});

export const StockCheckQuerySchema = z.object({
  q: z.string().trim().min(2, 'Type at least 2 letters').max(100),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

export const PickupSlotsQuerySchema = z.object({
  storeId: IdSchema,
  days: z.coerce.number().int().min(1).max(7).default(3),
});

// ---------------------------------------------------------------------------
// Collaborative lists
// ---------------------------------------------------------------------------

export const CreateListSchema = z.object({
  name: z.string().trim().min(1, 'Give your list a name').max(60),
  emoji: z.string().trim().max(8).optional(),
  storeId: IdSchema.nullable().optional(),
});

export const UpdateListSchema = CreateListSchema.partial();

export const AddListItemSchema = z
  .object({
    productId: IdSchema.optional(),
    name: z.string().trim().min(1).max(120).optional(),
    quantity: z.number().int().min(1).max(99).default(1),
    note: z.string().trim().max(200).optional(),
  })
  .refine((v) => Boolean(v.productId || v.name), { message: 'Pick a product or type an item name' });

export const UpdateListItemSchema = z.object({
  quantity: z.number().int().min(1).max(99).optional(),
  note: z.string().trim().max(200).nullable().optional(),
  isChecked: z.boolean().optional(),
  productId: IdSchema.nullable().optional(),
  name: z.string().trim().min(1).max(120).optional(),
});

export const InviteToListSchema = z.object({
  contact: z.string().trim().min(5, 'Enter an email or phone number').max(120),
});

export const JoinListSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6,10}$/, 'Enter the invite code'),
});

// ---------------------------------------------------------------------------
// Online orders (delivery & scheduled pickup)
// ---------------------------------------------------------------------------

export const CartLineSchema = z.object({
  productId: IdSchema,
  quantity: z.number().int().min(1).max(50),
});

export const QuoteSchema = z.object({
  storeId: IdSchema,
  channel: z.enum(['DELIVERY', 'PICKUP']),
  items: z.array(CartLineSchema).min(1, 'Your cart is empty').max(100),
  couponCode: z.string().trim().toUpperCase().max(20).optional(),
  tip: z.number().int().min(0).max(50_000).optional(),
});

export const PlaceOrderSchema = QuoteSchema.extend({
  addressId: IdSchema.optional(),
  pickupSlotStart: IsoDateTimeSchema.optional(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  savedPaymentMethodId: IdSchema.optional(),
  notes: z.string().trim().max(300).optional(),
  idempotencyKey: z.string().trim().min(8).max(80).optional(),
}).superRefine((value, ctx) => {
  if (value.channel === 'DELIVERY' && !value.addressId) {
    ctx.addIssue({ code: 'custom', message: 'Choose a delivery address', path: ['addressId'] });
  }
  if (value.channel === 'PICKUP' && !value.pickupSlotStart) {
    ctx.addIssue({ code: 'custom', message: 'Choose a pickup slot', path: ['pickupSlotStart'] });
  }
  if (value.channel === 'PICKUP' && value.paymentMethod === 'CASH_ON_DELIVERY') {
    ctx.addIssue({ code: 'custom', message: 'Pay online for pickup orders', path: ['paymentMethod'] });
  }
});

export const OrdersQuerySchema = z.object({
  channel: z.enum(ORDER_CHANNELS).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: OffsetSchema,
});

export const CancelOrderSchema = z.object({ reason: z.string().trim().max(300).optional() });

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export const RetryPaymentSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  savedPaymentMethodId: IdSchema.optional(),
});

export const ConfirmPaymentSchema = z.object({
  /** Provider-specific fields, e.g. razorpay_payment_id / razorpay_signature or PayPal's token. */
  payload: z.record(z.string(), z.string().max(500)).optional(),
});

export const DemoPaymentSchema = z.object({
  outcome: z.enum(['success', 'failure']).default('success'),
});

// ---------------------------------------------------------------------------
// In-store scan & go / smart carts / exit gates
// ---------------------------------------------------------------------------

export const StartSessionSchema = z.object({
  storeId: IdSchema,
  listId: IdSchema.optional(),
});

export const SessionAddItemSchema = z
  .object({
    productId: IdSchema.optional(),
    barcode: z.string().trim().min(4).max(32).optional(),
    quantity: z.number().int().min(1).max(50).default(1),
  })
  .refine((v) => Boolean(v.productId || v.barcode), { message: 'Scan a barcode or pick a product' });

export const SessionUpdateItemSchema = z.object({
  quantity: z.number().int().min(0).max(50),
});

export const SessionLinkListSchema = z.object({ listId: IdSchema.nullable() });

export const SessionCheckoutSchema = z.object({
  paymentMethod: z.enum(['UPI', 'CARD', 'APPLE_PAY', 'GOOGLE_PAY', 'PAYPAL']),
  savedPaymentMethodId: IdSchema.optional(),
  couponCode: z.string().trim().toUpperCase().max(20).optional(),
});

export const DevicePairSchema = z.object({
  pairingCode: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code shown in the app'),
});

export const DeviceCartItemSchema = z.object({
  barcode: z.string().trim().min(4).max(32),
  quantity: z
    .number()
    .int()
    .min(-50)
    .max(50)
    .refine((q) => q !== 0, 'Quantity cannot be zero'),
});

export const GateVerifySchema = z.object({
  code: z.string().trim().min(4).max(512),
});

// ---------------------------------------------------------------------------
// Store operations: inventory, alerts, orders
// ---------------------------------------------------------------------------

export const InventoryQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: IdSchema.optional(),
  status: z.enum(['ALL', 'LOW', 'OUT', 'OK']).default('ALL'),
  aisle: z.coerce.number().int().min(1).max(99).optional(),
  sort: z.enum(['name', 'shelf_asc', 'location', 'updated']).default('location'),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: OffsetSchema,
});

export const UpdateStoreProductSchema = z.object({
  price: MoneySchema.optional(),
  reorderThreshold: z.number().int().min(0).max(10_000).optional(),
  restockTarget: z.number().int().min(1).max(10_000).optional(),
  aisle: z.number().int().min(1).max(99).optional(),
  row: z.number().int().min(1).max(50).optional(),
  shelf: z.number().int().min(1).max(10).optional(),
  isAvailable: z.boolean().optional(),
});

export const RestockSchema = z.object({
  quantity: z.number().int().min(1).max(10_000),
  note: z.string().trim().max(300).optional(),
});

export const ReceiveStockSchema = z.object({
  quantity: z.number().int().min(1).max(100_000),
  note: z.string().trim().max(300).optional(),
});

export const StockCountSchema = z.object({
  shelfQty: z.number().int().min(0).max(100_000).optional(),
  storageQty: z.number().int().min(0).max(100_000).optional(),
  reason: z.enum(['ADJUSTMENT', 'DAMAGE']).default('ADJUSTMENT'),
  note: z.string().trim().max(300).optional(),
});

export const AlertsQuerySchema = z.object({
  status: z.enum([...ALERT_STATUSES, 'ACTIVE']).default('ACTIVE'),
  limit: LimitSchema,
});

export const ResolveAlertSchema = z.object({
  restockQuantity: z.number().int().min(0).max(10_000),
  note: z.string().trim().max(300).optional(),
});

export const AlertToTaskSchema = z.object({
  assigneeId: IdSchema,
  dueAt: IsoDateTimeSchema.optional(),
  priority: z.enum(PRIORITIES).default('HIGH'),
});

export const OpsOrdersQuerySchema = z.object({
  channel: z.enum(ORDER_CHANNELS).optional(),
  status: csvOf(ORDER_STATUSES),
  q: z.string().trim().max(40).optional(),
  date: IsoDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: OffsetSchema,
});

export const UpdateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(300).optional(),
  /** Required when handing over a pickup order. */
  pickupCode: z.string().trim().toUpperCase().max(8).optional(),
  riderName: NameSchema.optional(),
  riderPhone: PhoneSchema.optional(),
});

export const AssignPickerSchema = z.object({ employeeId: IdSchema.nullable() });

export const VerifyPickupSchema = z.object({
  orderNumber: z.string().trim().toUpperCase().min(4).max(20),
  pickupCode: z.string().trim().toUpperCase().min(4).max(8),
});

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export const AnalyticsRangeSchema = z
  .object({
    from: IsoDateSchema,
    to: IsoDateSchema,
    granularity: z.enum(['day', 'week', 'month']).default('day'),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    sort: z.enum(['quantity', 'revenue', 'profit']).default('revenue'),
  })
  .refine((v) => v.from <= v.to, { message: '"from" must be before "to"', path: ['from'] });

// ---------------------------------------------------------------------------
// Work assignment
// ---------------------------------------------------------------------------

export const CreateTaskSchema = z.object({
  title: z.string().trim().min(3, 'Describe the task in a few words').max(120),
  description: z.string().trim().max(2000).optional(),
  category: z.enum(TASK_CATEGORIES).default('OTHER'),
  priority: z.enum(PRIORITIES).default('MEDIUM'),
  assigneeId: IdSchema,
  dueAt: IsoDateTimeSchema.optional(),
  aisle: z.number().int().min(1).max(99).optional(),
  restockAlertId: IdSchema.optional(),
});

export const UpdateTaskSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z.enum(TASK_CATEGORIES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: IdSchema.optional(),
  dueAt: IsoDateTimeSchema.nullable().optional(),
  aisle: z.number().int().min(1).max(99).nullable().optional(),
  status: z.literal('CANCELLED').optional(),
});

export const CompleteTaskSchema = z.object({
  note: z.string().trim().min(2, 'Add a short note about what you did').max(1000),
  photoUrl: z.url().max(500).optional(),
});

export const ReviewTaskSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REOPEN']),
    rating: z.number().int().min(1).max(5).optional(),
    comment: z.string().trim().max(1000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.decision === 'APPROVE' && !v.rating) {
      ctx.addIssue({ code: 'custom', message: 'Rate the work from 1 to 5', path: ['rating'] });
    }
    if (v.decision === 'REOPEN' && !v.comment) {
      ctx.addIssue({ code: 'custom', message: 'Tell the assignee what still needs doing', path: ['comment'] });
    }
  });

export const TasksQuerySchema = z.object({
  scope: z.enum(['mine', 'team', 'all']).default('all'),
  status: csvOf(TASK_STATUSES),
  assigneeId: IdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(300).default(100),
});

// ---------------------------------------------------------------------------
// Shifts & attendance
// ---------------------------------------------------------------------------

export const ShiftTemplateSchema = z.object({
  name: z.string().trim().min(2).max(40),
  startTime: TimeOfDaySchema,
  endTime: TimeOfDaySchema,
  breakMinutes: z.number().int().min(0).max(240).default(30),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export const CreateShiftsSchema = z.object({
  employeeIds: z.array(IdSchema).min(1, 'Pick at least one employee').max(100),
  dates: z.array(IsoDateSchema).min(1, 'Pick at least one day').max(31),
  startTime: TimeOfDaySchema,
  endTime: TimeOfDaySchema,
  label: z.string().trim().max(40).optional(),
  breakMinutes: z.number().int().min(0).max(240).default(30),
  notes: z.string().trim().max(300).optional(),
});

export const UpdateShiftSchema = z.object({
  employeeId: IdSchema.optional(),
  startTime: TimeOfDaySchema.optional(),
  endTime: TimeOfDaySchema.optional(),
  label: z.string().trim().max(40).nullable().optional(),
  breakMinutes: z.number().int().min(0).max(240).optional(),
  notes: z.string().trim().max(300).nullable().optional(),
  status: z.enum(['SCHEDULED', 'CANCELLED']).optional(),
});

export const DateRangeQuerySchema = z
  .object({
    from: IsoDateSchema,
    to: IsoDateSchema,
    employeeId: IdSchema.optional(),
  })
  .refine((v) => v.from <= v.to, { message: '"from" must be before "to"', path: ['from'] });

export const ClockSchema = z.object({
  method: z.enum(CLOCK_METHODS).default('APP'),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  /** Rotating code from the store's attendance kiosk QR. */
  kioskCode: z.string().trim().toUpperCase().max(12).optional(),
  note: z.string().trim().max(300).optional(),
});

export const ManualAttendanceSchema = z.object({
  employeeId: IdSchema,
  clockInAt: IsoDateTimeSchema,
  clockOutAt: IsoDateTimeSchema.optional(),
  note: z.string().trim().min(3, 'Explain the correction').max(300),
});

export const UpdateAttendanceSchema = z.object({
  clockInAt: IsoDateTimeSchema.optional(),
  clockOutAt: IsoDateTimeSchema.nullable().optional(),
  note: z.string().trim().min(3, 'Explain the correction').max(300),
});

// ---------------------------------------------------------------------------
// Team: onboarding (credential) requests & employees
// ---------------------------------------------------------------------------

export const CandidateSchema = z.object({
  fullName: NameSchema,
  email: EmailSchema,
  phone: PhoneSchema,
  role: z.enum(REQUESTABLE_ROLES),
  department: z.enum(DEPARTMENTS),
  designation: z.string().trim().max(60).optional().nullable(),
  joiningDate: IsoDateSchema,
  wageType: z.enum(WAGE_TYPES),
  wageAmount: MoneySchema,
  dateOfBirth: IsoDateSchema.optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  emergencyContactName: NameSchema.optional().nullable(),
  emergencyContactPhone: PhoneSchema.optional().nullable(),
  idProofType: z.enum(ID_PROOF_TYPES).optional().nullable(),
  idProofLast4: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4}$/, 'Only the last 4 characters of the ID')
    .optional()
    .nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  reportsToId: IdSchema.optional().nullable(),
});

export const CreateCredentialRequestSchema = CandidateSchema;
export const UpdateCredentialRequestSchema = CandidateSchema.partial();

export const ReviewDecisionSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REQUEST_CHANGES', 'REJECT']),
    comment: z.string().trim().max(1000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.decision !== 'APPROVE' && (!v.comment || v.comment.length < 3)) {
      ctx.addIssue({ code: 'custom', message: 'Add a comment explaining what to change', path: ['comment'] });
    }
  });

export const CredentialRequestsQuerySchema = z.object({
  status: csvOf(CREDENTIAL_REQUEST_STATUSES),
  storeId: IdSchema.optional(),
  q: z.string().trim().max(80).optional(),
  limit: LimitSchema,
  offset: OffsetSchema,
});

export const UpdateEmployeeSchema = z.object({
  designation: z.string().trim().max(60).nullable().optional(),
  department: z.enum(DEPARTMENTS).optional(),
  wageType: z.enum(WAGE_TYPES).optional(),
  wageAmount: MoneySchema.optional(),
  phone: PhoneSchema.optional(),
  status: z.enum(['ACTIVE', 'ON_LEAVE']).optional(),
  reportsToId: IdSchema.nullable().optional(),
});

export const EmployeesQuerySchema = z.object({
  storeId: IdSchema.optional(),
  role: z.enum(STAFF_ROLES).optional(),
  status: csvOf(EMPLOYEE_STATUSES),
  q: z.string().trim().max(80).optional(),
  limit: LimitSchema,
  offset: OffsetSchema,
});

export const OffboardEmployeeSchema = z.object({
  reason: z.enum(['LEFT', 'TERMINATED']),
  note: z.string().trim().max(500).optional(),
  exitDate: IsoDateSchema.optional(),
});

// ---------------------------------------------------------------------------
// Store requests to SmartCart (tickets)
// ---------------------------------------------------------------------------

export const CreateTicketSchema = z.object({
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(PRIORITIES).default('MEDIUM'),
  subject: z.string().trim().min(4, 'Add a short subject').max(140),
  description: z.string().trim().min(10, 'Describe the issue').max(4000),
  relatedEmployeeId: IdSchema.optional(),
});

export const TicketMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  isInternal: z.boolean().optional(),
});

export const UpdateTicketSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignedAdminId: IdSchema.nullable().optional(),
});

export const TicketsQuerySchema = z.object({
  status: csvOf(TICKET_STATUSES),
  storeId: IdSchema.optional(),
  category: z.enum(TICKET_CATEGORIES).optional(),
  limit: LimitSchema,
  offset: OffsetSchema,
});

// ---------------------------------------------------------------------------
// Offers, store settings, devices
// ---------------------------------------------------------------------------

export const OfferSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{3,20}$/, '3-20 letters or digits')
      .nullable()
      .optional(),
    title: z.string().trim().min(3).max(80),
    description: z.string().trim().max(300).optional().nullable(),
    type: z.enum(OFFER_TYPES),
    value: z.number().int().min(0).max(100_000_00),
    minOrderValue: MoneySchema.default(0),
    maxDiscount: MoneySchema.nullable().optional(),
    productId: IdSchema.nullable().optional(),
    categoryId: IdSchema.nullable().optional(),
    buyQty: z.number().int().min(1).max(20).nullable().optional(),
    getQty: z.number().int().min(1).max(20).nullable().optional(),
    channels: z.array(z.enum(ORDER_CHANNELS)).default([]),
    startsAt: IsoDateTimeSchema,
    endsAt: IsoDateTimeSchema,
    isActive: z.boolean().default(true),
    usageLimitPerUser: z.number().int().min(1).max(1000).nullable().optional(),
    bannerColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (new Date(v.startsAt) >= new Date(v.endsAt)) ctx.addIssue({ code: 'custom', message: 'End must be after start', path: ['endsAt'] });
    if (v.type === 'PERCENT_OFF' && (v.value < 1 || v.value > 90)) {
      ctx.addIssue({ code: 'custom', message: 'Percent must be between 1 and 90', path: ['value'] });
    }
    if (v.type === 'BOGO' && (!v.productId || !v.buyQty || !v.getQty)) {
      ctx.addIssue({ code: 'custom', message: 'Pick the product and the buy/get quantities', path: ['productId'] });
    }
  });

export const StoreSettingsSchema = z.object({
  deliveryFee: MoneySchema,
  freeDeliveryThreshold: MoneySchema,
  handlingFee: MoneySchema,
  smallCartThreshold: MoneySchema,
  smallCartFee: MoneySchema,
  deliveryEtaMinutes: z.number().int().min(5).max(180),
  deliveryRadiusKm: z.number().min(0.5).max(30),
  pickupSlotMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  pickupSlotCapacity: z.number().int().min(1).max(500),
  pickupLeadMinutes: z.number().int().min(10).max(24 * 60),
  exitPassTtlMinutes: z.number().int().min(5).max(24 * 60),
  sessionIdleMinutes: z.number().int().min(15).max(24 * 60),
  autoCreateRestockTasks: z.boolean(),
  geofenceMeters: z.number().int().min(0).max(5000),
});

export const UpdateStoreSchema = z.object({
  name: z.string().trim().min(3).max(80).optional(),
  phone: PhoneSchema.optional(),
  email: EmailSchema.optional().nullable(),
  openingTime: TimeOfDaySchema.optional(),
  closingTime: TimeOfDaySchema.optional(),
  supportsDelivery: z.boolean().optional(),
  supportsPickup: z.boolean().optional(),
  supportsInStore: z.boolean().optional(),
  settings: StoreSettingsSchema.partial().optional(),
});

export const UpdateLayoutSchema = z.object({
  aisles: z
    .array(z.object({ label: z.string().trim().min(2).max(40) }))
    .min(1)
    .max(30),
  rows: z.number().int().min(2).max(20).default(6),
  shelves: z.number().int().min(1).max(8).default(5),
});

export const CreateDeviceSchema = z.object({
  type: z.enum(DEVICE_TYPES),
  name: z.string().trim().min(2).max(40),
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const NewOwnerSchema = z.object({
  fullName: NameSchema,
  email: EmailSchema,
  phone: PhoneSchema,
});

export const CreateStoreSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{4,16}$/, '4-16 letters, digits or dashes'),
  name: z.string().trim().min(3).max(80),
  addressLine: z.string().trim().min(5).max(200),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a 6-digit PIN code'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  phone: PhoneSchema,
  email: EmailSchema.optional(),
  openingTime: TimeOfDaySchema.default('07:00'),
  closingTime: TimeOfDaySchema.default('23:00'),
  aisles: z
    .array(z.object({ label: z.string().trim().min(2).max(40) }))
    .min(1)
    .max(30)
    .optional(),
  /** Either link an existing owner account or create a new one. */
  ownerUserId: IdSchema.optional(),
  newOwner: NewOwnerSchema.optional(),
  stockCatalog: z.boolean().default(true),
}).refine((v) => Boolean(v.ownerUserId) !== Boolean(v.newOwner), {
  message: 'Choose an existing owner or enter the new owner details',
  path: ['newOwner'],
});

export const AdminUpdateStoreSchema = z.object({
  name: z.string().trim().min(3).max(80).optional(),
  status: z.enum(STORE_STATUSES).optional(),
  phone: PhoneSchema.optional(),
  email: EmailSchema.nullable().optional(),
});

export const AuditQuerySchema = z.object({
  storeId: IdSchema.optional(),
  action: z.string().trim().max(60).optional(),
  limit: LimitSchema,
  offset: OffsetSchema,
});

// ---------------------------------------------------------------------------
// Inferred input types
// ---------------------------------------------------------------------------

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type OtpVerifyInput = z.infer<typeof OtpVerifySchema>;
export type StaffLoginInput = z.infer<typeof StaffLoginSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
export type AddressInput = z.input<typeof AddressSchema>;
export type SavePaymentMethodInput = z.infer<typeof SavePaymentMethodSchema>;
export type CatalogQuery = z.input<typeof CatalogQuerySchema>;
export type CreateListInput = z.infer<typeof CreateListSchema>;
export type AddListItemInput = z.input<typeof AddListItemSchema>;
export type UpdateListItemInput = z.infer<typeof UpdateListItemSchema>;
export type CartLine = z.infer<typeof CartLineSchema>;
export type QuoteInput = z.infer<typeof QuoteSchema>;
export type PlaceOrderInput = z.infer<typeof PlaceOrderSchema>;
export type SessionCheckoutInput = z.infer<typeof SessionCheckoutSchema>;
export type UpdateStoreProductInput = z.infer<typeof UpdateStoreProductSchema>;
export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;
export type AnalyticsRange = z.infer<typeof AnalyticsRangeSchema>;
export type CreateTaskInput = z.input<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
export type CompleteTaskInput = z.infer<typeof CompleteTaskSchema>;
export type ReviewTaskInput = z.infer<typeof ReviewTaskSchema>;
export type ShiftTemplateInput = z.input<typeof ShiftTemplateSchema>;
export type CreateShiftsInput = z.input<typeof CreateShiftsSchema>;
export type UpdateShiftInput = z.infer<typeof UpdateShiftSchema>;
export type ClockInput = z.input<typeof ClockSchema>;
export type ManualAttendanceInput = z.infer<typeof ManualAttendanceSchema>;
export type CandidateInput = z.infer<typeof CandidateSchema>;
export type ReviewDecisionInput = z.infer<typeof ReviewDecisionSchema>;
export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeSchema>;
export type OffboardEmployeeInput = z.infer<typeof OffboardEmployeeSchema>;
export type CreateTicketInput = z.input<typeof CreateTicketSchema>;
export type TicketMessageInput = z.infer<typeof TicketMessageSchema>;
export type UpdateTicketInput = z.infer<typeof UpdateTicketSchema>;
export type OfferInput = z.input<typeof OfferSchema>;
export type StoreSettingsInput = z.infer<typeof StoreSettingsSchema>;
export type UpdateStoreInput = z.infer<typeof UpdateStoreSchema>;
export type CreateDeviceInput = z.infer<typeof CreateDeviceSchema>;
export type CreateStoreInput = z.input<typeof CreateStoreSchema>;
