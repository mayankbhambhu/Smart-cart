CREATE TYPE "public"."address_label" AS ENUM('HOME', 'WORK', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."admin_role" AS ENUM('SUPER_ADMIN', 'ADMIN', 'SUPPORT');--> statement-breakpoint
CREATE TYPE "public"."alert_level" AS ENUM('LOW', 'OUT_OF_STOCK');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('OPEN', 'ACKNOWLEDGED', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."clock_method" AS ENUM('APP', 'KIOSK', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."credential_request_action" AS ENUM('SUBMITTED', 'RESUBMITTED', 'EDITED', 'OWNER_APPROVED', 'OWNER_REQUESTED_CHANGES', 'ADMIN_APPROVED', 'ADMIN_REQUESTED_CHANGES', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."credential_request_status" AS ENUM('PENDING_OWNER', 'OWNER_CHANGES_REQUESTED', 'PENDING_ADMIN', 'ADMIN_CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."department" AS ENUM('MANAGEMENT', 'FLOOR', 'WAREHOUSE', 'PICKING', 'DELIVERY', 'CUSTOMER_SERVICE', 'SECURITY');--> statement-breakpoint
CREATE TYPE "public"."device_type" AS ENUM('EXIT_GATE', 'SMART_CART', 'KIOSK');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('ACTIVE', 'ON_LEAVE', 'LEFT', 'TERMINATED');--> statement-breakpoint
CREATE TYPE "public"."exit_pass_status" AS ENUM('ACTIVE', 'USED', 'EXPIRED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."gate_reason" AS ENUM('OK', 'NOT_FOUND', 'ALREADY_USED', 'EXPIRED', 'REVOKED', 'WRONG_STORE', 'UNPAID', 'MALFORMED');--> statement-breakpoint
CREATE TYPE "public"."gate_result" AS ENUM('OPENED', 'DENIED');--> statement-breakpoint
CREATE TYPE "public"."id_proof_type" AS ENUM('AADHAAR', 'PAN', 'VOTER_ID', 'PASSPORT', 'DRIVING_LICENCE');--> statement-breakpoint
CREATE TYPE "public"."list_role" AS ENUM('OWNER', 'EDITOR');--> statement-breakpoint
CREATE TYPE "public"."inventory_movement_type" AS ENUM('CART_ADD', 'CART_REMOVE', 'CART_EXPIRED', 'ORDER_RESERVE', 'ORDER_RELEASE', 'RESTOCK', 'RECEIVE', 'ADJUSTMENT', 'DAMAGE');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('ORDER_STATUS', 'LIST_ITEM_ADDED', 'LIST_SHARED', 'TASK_ASSIGNED', 'TASK_COMPLETED', 'TASK_REVIEWED', 'RESTOCK_ALERT', 'SHIFT_ASSIGNED', 'CREDENTIAL_REQUEST', 'TICKET_UPDATE', 'GENERAL');--> statement-breakpoint
CREATE TYPE "public"."offer_type" AS ENUM('PERCENT_OFF', 'FLAT_OFF', 'BOGO', 'FREE_DELIVERY');--> statement-breakpoint
CREATE TYPE "public"."order_channel" AS ENUM('DELIVERY', 'PICKUP', 'IN_STORE');--> statement-breakpoint
CREATE TYPE "public"."order_payment_status" AS ENUM('UNPAID', 'PAID', 'FAILED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PENDING_PAYMENT', 'PLACED', 'PACKING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PICKED_UP', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."otp_purpose" AS ENUM('LOGIN', 'RESET_PASSWORD');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('UPI', 'CARD', 'APPLE_PAY', 'GOOGLE_PAY', 'PAYPAL', 'CASH_ON_DELIVERY');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('stripe', 'paypal', 'razorpay', 'demo', 'cash');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('CREATED', 'REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT');--> statement-breakpoint
CREATE TYPE "public"."session_item_source" AS ENUM('APP', 'SMART_CART');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('ACTIVE', 'CHECKOUT', 'PAID', 'ABANDONED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."shift_status" AS ENUM('SCHEDULED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('OWNER', 'STORE_MANAGER', 'FLOOR_MANAGER', 'WORKER');--> statement-breakpoint
CREATE TYPE "public"."store_status" AS ENUM('ACTIVE', 'ONBOARDING', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."task_category" AS ENUM('RESTOCK', 'CLEANING', 'INVENTORY_COUNT', 'ORDER_PICKING', 'CUSTOMER_SERVICE', 'MAINTENANCE', 'DISPLAY_SETUP', 'DELIVERY', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('TODO', 'IN_PROGRESS', 'DONE', 'APPROVED', 'REOPENED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."ticket_category" AS ENUM('TECHNICAL', 'HARDWARE', 'PAYMENTS', 'INVENTORY', 'STAFFING', 'EMPLOYEE_OFFBOARDING', 'BILLING', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('OPEN', 'IN_PROGRESS', 'WAITING_ON_STORE', 'RESOLVED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."user_kind" AS ENUM('CUSTOMER', 'STAFF', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'SUSPENDED', 'DEACTIVATED');--> statement-breakpoint
CREATE TYPE "public"."wage_type" AS ENUM('MONTHLY', 'DAILY', 'HOURLY');--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" "address_label" DEFAULT 'HOME' NOT NULL,
	"line1" text NOT NULL,
	"line2" text,
	"landmark" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"pincode" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"receiver_name" text,
	"receiver_phone" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"shift_id" uuid,
	"clock_in_at" timestamp with time zone NOT NULL,
	"clock_out_at" timestamp with time zone,
	"clock_in_method" "clock_method" DEFAULT 'APP' NOT NULL,
	"clock_out_method" "clock_method",
	"clock_in_lat" double precision,
	"clock_in_lng" double precision,
	"worked_minutes" integer DEFAULT 0 NOT NULL,
	"late_by_minutes" integer DEFAULT 0 NOT NULL,
	"left_early_by_minutes" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"edited_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_kind" text NOT NULL,
	"actor_name" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"store_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"emoji" text NOT NULL,
	"color" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"key" text PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credential_request_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_name" text NOT NULL,
	"actor_role" text NOT NULL,
	"action" "credential_request_action" NOT NULL,
	"comment" text,
	"from_status" "credential_request_status",
	"to_status" "credential_request_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credential_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_number" text NOT NULL,
	"store_id" uuid NOT NULL,
	"requested_by_id" uuid NOT NULL,
	"requested_by_role" "staff_role" NOT NULL,
	"status" "credential_request_status" NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"candidate" jsonb NOT NULL,
	"candidate_name" text NOT NULL,
	"last_comment" text,
	"owner_reviewed_by_id" uuid,
	"owner_reviewed_at" timestamp with time zone,
	"admin_reviewed_by_id" uuid,
	"admin_reviewed_at" timestamp with time zone,
	"issued_employee_id" uuid,
	"issued_username" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credential_requests_requestNumber_unique" UNIQUE("request_number")
);
--> statement-breakpoint
CREATE TABLE "customer_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"dietary_preferences" text[] DEFAULT '{}'::text[] NOT NULL,
	"allergens" text[] DEFAULT '{}'::text[] NOT NULL,
	"default_store_id" uuid,
	"loyalty_points" integer DEFAULT 0 NOT NULL,
	"stripe_customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"type" "device_type" NOT NULL,
	"name" text NOT NULL,
	"api_key_hash" text NOT NULL,
	"api_key_prefix" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"store_id" uuid NOT NULL,
	"employee_code" text NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"role" "staff_role" NOT NULL,
	"department" "department" NOT NULL,
	"designation" text,
	"joining_date" date NOT NULL,
	"wage_type" "wage_type" DEFAULT 'MONTHLY' NOT NULL,
	"wage_amount" integer DEFAULT 0 NOT NULL,
	"status" "employee_status" DEFAULT 'ACTIVE' NOT NULL,
	"exit_date" date,
	"exit_reason" text,
	"reports_to_id" uuid,
	"date_of_birth" date,
	"address" text,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"id_proof_type" "id_proof_type",
	"id_proof_last4" text,
	"credential_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_employeeCode_unique" UNIQUE("employee_code")
);
--> statement-breakpoint
CREATE TABLE "exit_passes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"token_hint" text NOT NULL,
	"status" "exit_pass_status" DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_at_device_id" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gate_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"device_id" uuid,
	"exit_pass_id" uuid,
	"order_id" uuid,
	"result" "gate_result" NOT NULL,
	"reason" "gate_reason" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instore_session_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"store_product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"added_via" "session_item_source" DEFAULT 'APP' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instore_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "session_status" DEFAULT 'ACTIVE' NOT NULL,
	"pairing_code" text NOT NULL,
	"list_id" uuid,
	"cart_device_id" uuid,
	"order_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"store_product_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"type" "inventory_movement_type" NOT NULL,
	"shelf_delta" integer DEFAULT 0 NOT NULL,
	"storage_delta" integer DEFAULT 0 NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"actor_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"product_id" uuid,
	"name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"note" text,
	"is_checked" boolean DEFAULT false NOT NULL,
	"checked_by_id" uuid,
	"checked_at" timestamp with time zone,
	"added_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "list_members" (
	"list_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "list_role" DEFAULT 'EDITOR' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_members_list_id_user_id_pk" PRIMARY KEY("list_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"discount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid,
	"code" text,
	"title" text NOT NULL,
	"description" text,
	"type" "offer_type" NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"min_order_value" integer DEFAULT 0 NOT NULL,
	"max_discount" integer,
	"product_id" uuid,
	"category_id" uuid,
	"buy_qty" integer,
	"get_qty" integer,
	"channels" text[] DEFAULT '{}'::text[] NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"usage_limit_per_user" integer,
	"banner_color" text DEFAULT '#0f8a4b' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"status" "order_status" NOT NULL,
	"note" text,
	"actor_id" uuid,
	"actor_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"brand" text NOT NULL,
	"unit" text NOT NULL,
	"emoji" text NOT NULL,
	"color" text NOT NULL,
	"barcode" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"mrp" integer NOT NULL,
	"unit_cost" integer NOT NULL,
	"tax_rate" integer NOT NULL,
	"line_total" integer NOT NULL,
	"aisle" smallint,
	"row" smallint,
	"shelf" smallint
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"user_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"channel" "order_channel" NOT NULL,
	"status" "order_status" NOT NULL,
	"payment_status" "order_payment_status" DEFAULT 'UNPAID' NOT NULL,
	"payment_method" "payment_method",
	"item_count" integer NOT NULL,
	"item_total" integer NOT NULL,
	"mrp_total" integer NOT NULL,
	"coupon_discount" integer DEFAULT 0 NOT NULL,
	"delivery_fee" integer DEFAULT 0 NOT NULL,
	"handling_fee" integer DEFAULT 0 NOT NULL,
	"small_cart_fee" integer DEFAULT 0 NOT NULL,
	"tip" integer DEFAULT 0 NOT NULL,
	"tax_included" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"cost_total" integer DEFAULT 0 NOT NULL,
	"offer_id" uuid,
	"coupon_code" text,
	"address" jsonb,
	"scheduled_for" timestamp with time zone,
	"slot_end" timestamp with time zone,
	"pickup_code" text,
	"session_id" uuid,
	"notes" text,
	"cancel_reason" text,
	"picker_id" uuid,
	"rider_name" text,
	"rider_phone" text,
	"delivery_eta_minutes" integer,
	"idempotency_key" text,
	"placed_at" timestamp with time zone,
	"packing_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"out_for_delivery_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_orderNumber_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target" text NOT NULL,
	"purpose" "otp_purpose" NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "payment_method" NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"label" text NOT NULL,
	"brand" text,
	"last4" text,
	"exp_month" smallint,
	"exp_year" smallint,
	"upi_id" text,
	"email" text,
	"provider_ref" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" "payment_status" DEFAULT 'CREATED' NOT NULL,
	"provider_ref" text,
	"provider_payment_id" text,
	"saved_payment_method_id" uuid,
	"failure_reason" text,
	"refunded_amount" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"succeeded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"barcode" text NOT NULL,
	"name" text NOT NULL,
	"brand" text NOT NULL,
	"description" text,
	"category_id" uuid NOT NULL,
	"unit" text NOT NULL,
	"mrp" integer NOT NULL,
	"default_price" integer NOT NULL,
	"default_cost" integer NOT NULL,
	"tax_rate" integer DEFAULT 5 NOT NULL,
	"emoji" text NOT NULL,
	"color" text NOT NULL,
	"image_url" text,
	"dietary_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"allergens" text[] DEFAULT '{}'::text[] NOT NULL,
	"max_order_qty" integer DEFAULT 10 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku"),
	CONSTRAINT "products_barcode_unique" UNIQUE("barcode")
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"family" uuid NOT NULL,
	"user_agent" text,
	"ip" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restock_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"store_product_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"status" "alert_status" DEFAULT 'OPEN' NOT NULL,
	"level" "alert_level" NOT NULL,
	"shelf_qty_at_trigger" integer NOT NULL,
	"threshold" integer NOT NULL,
	"acknowledged_by_id" uuid,
	"acknowledged_at" timestamp with time zone,
	"resolved_by_id" uuid,
	"resolved_at" timestamp with time zone,
	"restocked_qty" integer,
	"task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"break_minutes" integer DEFAULT 30 NOT NULL,
	"color" text DEFAULT '#0f8a4b' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"date" date NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"label" text,
	"break_minutes" integer DEFAULT 30 NOT NULL,
	"notes" text,
	"status" "shift_status" DEFAULT 'SCHEDULED' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"emoji" text DEFAULT '🛒' NOT NULL,
	"store_id" uuid,
	"share_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopping_lists_shareCode_unique" UNIQUE("share_code")
);
--> statement-breakpoint
CREATE TABLE "store_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"price" integer NOT NULL,
	"cost" integer NOT NULL,
	"shelf_qty" integer DEFAULT 0 NOT NULL,
	"storage_qty" integer DEFAULT 0 NOT NULL,
	"reorder_threshold" integer DEFAULT 5 NOT NULL,
	"restock_target" integer DEFAULT 24 NOT NULL,
	"aisle" smallint NOT NULL,
	"row" smallint NOT NULL,
	"shelf" smallint NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_products_shelf_nonneg" CHECK ("store_products"."shelf_qty" >= 0),
	CONSTRAINT "store_products_storage_nonneg" CHECK ("store_products"."storage_qty" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"address_line" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"pincode" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"opening_time" text DEFAULT '07:00' NOT NULL,
	"closing_time" text DEFAULT '23:00' NOT NULL,
	"status" "store_status" DEFAULT 'ACTIVE' NOT NULL,
	"supports_delivery" boolean DEFAULT true NOT NULL,
	"supports_pickup" boolean DEFAULT true NOT NULL,
	"supports_in_store" boolean DEFAULT true NOT NULL,
	"layout" jsonb NOT NULL,
	"settings" jsonb NOT NULL,
	"kiosk_secret" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stores_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" "task_category" DEFAULT 'OTHER' NOT NULL,
	"priority" "priority" DEFAULT 'MEDIUM' NOT NULL,
	"status" "task_status" DEFAULT 'TODO' NOT NULL,
	"assignee_id" uuid NOT NULL,
	"assigned_by_id" uuid NOT NULL,
	"aisle" smallint,
	"due_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"completion_note" text,
	"completion_photo_url" text,
	"review_rating" smallint,
	"review_comment" text,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone,
	"restock_alert_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"side" text NOT NULL,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_number" text NOT NULL,
	"store_id" uuid NOT NULL,
	"raised_by_id" uuid NOT NULL,
	"raised_by_role" "staff_role",
	"category" "ticket_category" NOT NULL,
	"priority" "priority" DEFAULT 'MEDIUM' NOT NULL,
	"status" "ticket_status" DEFAULT 'OPEN' NOT NULL,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"assigned_admin_id" uuid,
	"related_employee_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_ticketNumber_unique" UNIQUE("ticket_number")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "user_kind" NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"username" text,
	"password_hash" text,
	"google_sub" text,
	"apple_sub" text,
	"avatar_url" text,
	"admin_role" "admin_role",
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"token_version" integer DEFAULT 0 NOT NULL,
	"phone_verified_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_edited_by_id_users_id_fk" FOREIGN KEY ("edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_request_events" ADD CONSTRAINT "credential_request_events_request_id_credential_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."credential_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_request_events" ADD CONSTRAINT "credential_request_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_requests" ADD CONSTRAINT "credential_requests_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_requests" ADD CONSTRAINT "credential_requests_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_requests" ADD CONSTRAINT "credential_requests_owner_reviewed_by_id_users_id_fk" FOREIGN KEY ("owner_reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_requests" ADD CONSTRAINT "credential_requests_admin_reviewed_by_id_users_id_fk" FOREIGN KEY ("admin_reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_requests" ADD CONSTRAINT "credential_requests_issued_employee_id_employees_id_fk" FOREIGN KEY ("issued_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_default_store_id_stores_id_fk" FOREIGN KEY ("default_store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_reports_to_id_employees_id_fk" FOREIGN KEY ("reports_to_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exit_passes" ADD CONSTRAINT "exit_passes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exit_passes" ADD CONSTRAINT "exit_passes_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exit_passes" ADD CONSTRAINT "exit_passes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_events" ADD CONSTRAINT "gate_events_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_events" ADD CONSTRAINT "gate_events_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_events" ADD CONSTRAINT "gate_events_exit_pass_id_exit_passes_id_fk" FOREIGN KEY ("exit_pass_id") REFERENCES "public"."exit_passes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_events" ADD CONSTRAINT "gate_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instore_session_items" ADD CONSTRAINT "instore_session_items_session_id_instore_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."instore_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instore_session_items" ADD CONSTRAINT "instore_session_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instore_session_items" ADD CONSTRAINT "instore_session_items_store_product_id_store_products_id_fk" FOREIGN KEY ("store_product_id") REFERENCES "public"."store_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instore_sessions" ADD CONSTRAINT "instore_sessions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instore_sessions" ADD CONSTRAINT "instore_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instore_sessions" ADD CONSTRAINT "instore_sessions_list_id_shopping_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."shopping_lists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instore_sessions" ADD CONSTRAINT "instore_sessions_cart_device_id_devices_id_fk" FOREIGN KEY ("cart_device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_store_product_id_store_products_id_fk" FOREIGN KEY ("store_product_id") REFERENCES "public"."store_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_list_id_shopping_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."shopping_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_checked_by_id_users_id_fk" FOREIGN KEY ("checked_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_list_id_shopping_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."shopping_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_redemptions" ADD CONSTRAINT "offer_redemptions_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_redemptions" ADD CONSTRAINT "offer_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_redemptions" ADD CONSTRAINT "offer_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_redemptions" ADD CONSTRAINT "offer_redemptions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_picker_id_employees_id_fk" FOREIGN KEY ("picker_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_saved_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("saved_payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_alerts" ADD CONSTRAINT "restock_alerts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_alerts" ADD CONSTRAINT "restock_alerts_store_product_id_store_products_id_fk" FOREIGN KEY ("store_product_id") REFERENCES "public"."store_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_alerts" ADD CONSTRAINT "restock_alerts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_alerts" ADD CONSTRAINT "restock_alerts_acknowledged_by_id_users_id_fk" FOREIGN KEY ("acknowledged_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_alerts" ADD CONSTRAINT "restock_alerts_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_created_by_id_employees_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_employees_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_by_id_employees_id_fk" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reviewed_by_id_employees_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_restock_alert_id_restock_alerts_id_fk" FOREIGN KEY ("restock_alert_id") REFERENCES "public"."restock_alerts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_raised_by_id_users_id_fk" FOREIGN KEY ("raised_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_admin_id_users_id_fk" FOREIGN KEY ("assigned_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_related_employee_id_employees_id_fk" FOREIGN KEY ("related_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "addresses_user_idx" ON "addresses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "attendance_store_in_idx" ON "attendance_records" USING btree ("store_id","clock_in_at");--> statement-breakpoint
CREATE INDEX "attendance_employee_in_idx" ON "attendance_records" USING btree ("employee_id","clock_in_at");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_one_open_uq" ON "attendance_records" USING btree ("employee_id") WHERE "attendance_records"."clock_out_at" is null;--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_store_idx" ON "audit_logs" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "credential_request_events_request_idx" ON "credential_request_events" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE INDEX "credential_requests_status_idx" ON "credential_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "credential_requests_store_idx" ON "credential_requests" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_api_key_uq" ON "devices" USING btree ("api_key_hash");--> statement-breakpoint
CREATE INDEX "devices_store_idx" ON "devices" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "employees_store_idx" ON "employees" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "employees_user_idx" ON "employees" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_store_user_active_uq" ON "employees" USING btree ("store_id","user_id") WHERE "employees"."status" in ('ACTIVE', 'ON_LEAVE');--> statement-breakpoint
CREATE UNIQUE INDEX "exit_passes_order_uq" ON "exit_passes" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exit_passes_token_uq" ON "exit_passes" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "gate_events_store_idx" ON "gate_events" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "instore_session_items_uq" ON "instore_session_items" USING btree ("session_id","product_id");--> statement-breakpoint
CREATE INDEX "instore_sessions_user_idx" ON "instore_sessions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "instore_sessions_store_idx" ON "instore_sessions" USING btree ("store_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "instore_sessions_pairing_uq" ON "instore_sessions" USING btree ("store_id","pairing_code") WHERE "instore_sessions"."status" in ('ACTIVE', 'CHECKOUT');--> statement-breakpoint
CREATE INDEX "inventory_movements_sp_idx" ON "inventory_movements" USING btree ("store_product_id","created_at");--> statement-breakpoint
CREATE INDEX "inventory_movements_store_idx" ON "inventory_movements" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "list_items_list_idx" ON "list_items" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "list_members_user_idx" ON "list_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_redemptions_order_uq" ON "offer_redemptions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "offer_redemptions_offer_idx" ON "offer_redemptions" USING btree ("offer_id","user_id");--> statement-breakpoint
CREATE INDEX "offers_code_idx" ON "offers" USING btree ("code");--> statement-breakpoint
CREATE INDEX "offers_store_idx" ON "offers" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_product_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "orders_store_placed_idx" ON "orders" USING btree ("store_id","placed_at");--> statement-breakpoint
CREATE INDEX "orders_store_status_idx" ON "orders" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_user_idempotency_uq" ON "orders" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "otp_codes_target_idx" ON "otp_codes" USING btree ("target","purpose","created_at");--> statement-breakpoint
CREATE INDEX "payment_methods_user_idx" ON "payment_methods" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_ref_uq" ON "payments" USING btree ("provider","provider_ref");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_tokens_token_uq" ON "push_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "push_tokens_user_idx" ON "push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_hash_uq" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "restock_alerts_store_status_idx" ON "restock_alerts" USING btree ("store_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "restock_alerts_one_active_uq" ON "restock_alerts" USING btree ("store_product_id") WHERE "restock_alerts"."status" in ('OPEN', 'ACKNOWLEDGED');--> statement-breakpoint
CREATE INDEX "shifts_store_date_idx" ON "shifts" USING btree ("store_id","date");--> statement-breakpoint
CREATE INDEX "shifts_employee_date_idx" ON "shifts" USING btree ("employee_id","date");--> statement-breakpoint
CREATE INDEX "shopping_lists_owner_idx" ON "shopping_lists" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "store_products_store_product_uq" ON "store_products" USING btree ("store_id","product_id");--> statement-breakpoint
CREATE INDEX "store_products_store_aisle_idx" ON "store_products" USING btree ("store_id","aisle","row");--> statement-breakpoint
CREATE INDEX "tasks_store_status_idx" ON "tasks" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE INDEX "ticket_messages_ticket_idx" ON "ticket_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tickets_store_idx" ON "tickets" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_kind_email_uq" ON "users" USING btree ("kind","email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_kind_phone_uq" ON "users" USING btree ("kind","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_uq" ON "users" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "users_kind_google_uq" ON "users" USING btree ("kind","google_sub");--> statement-breakpoint
CREATE UNIQUE INDEX "users_kind_apple_uq" ON "users" USING btree ("kind","apple_sub");