# Architecture

## Components

| Component         | Stack                                                                                        | Notes                                                           |
| ----------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `apps/api`        | Node 22, Express 5, Socket.IO 4, Drizzle ORM, PostgreSQL 16, zod, jose                       | REST under `/api/v1`, realtime on `/socket.io`, background jobs |
| `apps/web`        | React 19, Vite, Tailwind CSS 4, TanStack Query, React Router, Recharts, Leaflet, ZXing       | Shop, Store OS (`/ops`), admin console (`/admin`), simulators   |
| `apps/mobile`     | Expo SDK 58, React Native, expo-router, expo-camera, Stripe React Native, expo-notifications | Shop, Scan & Go, lists, orders, account, staff mode             |
| `packages/shared` | TypeScript source consumed directly by all three                                             | Types, schemas, pricing, routing, layout, QR / Code 128         |

Everything that must agree between client and server lives in `packages/shared`: request schemas (validated by the API, reused by
forms), money maths (paise as integers), order and task state machines, the in-store route planner, store-layout geometry, and the
encoders for exit-pass, pickup, smart-cart pairing and kiosk codes.

## Data model (main tables)

- **People**: `users` (customers, staff and admins, by `kind`), `customer_profiles` (dietary preferences, allergies, home store),
  `employees` (one record per store with role, department, wages and status), `refresh_tokens`, `otp_codes`, `push_tokens`,
  `notifications`, `audit_logs`.
- **Stores and catalogue**: `stores` (hours, settings, aisle layout as JSON, kiosk secret), `categories`, `products`,
  `store_products` (price, shelf and storage quantities, reorder threshold, aisle / row / shelf), `inventory_movements` (ledger of every
  change), `restock_alerts`, `offers`, `offer_redemptions`, `devices`.
- **Shopping**: `addresses`, `payment_methods`, `shopping_lists`, `list_members`, `list_items`, `orders`, `order_items`,
  `order_events`, `payments`, `instore_sessions`, `instore_session_items`, `exit_passes`, `gate_events`.
- **Workforce**: `shift_templates`, `shifts`, `attendance_records`, `tasks`, `credential_requests` and `credential_request_events`
  (onboarding and its timeline), `tickets` and `ticket_messages` (store requests to SmartCart).

Migrations live in `apps/api/drizzle` and are generated from `apps/api/src/db/schema.ts` with `npm run db:generate`.

## Realtime

Clients connect to Socket.IO with their access token. On connect the server joins the socket to its user room, to the admin room for
admins, and to the operations room of every store a staff member belongs to. Other rooms are joined on request, after an access check:

| Room             | Joined by                            | Events                                                                                                                                                            |
| ---------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user:<id>`      | Everyone, automatically              | `notification:new`, `session:updated`, `order:changed`, `list:updated`                                                                                            |
| `list:<id>`      | List members viewing the list        | `list:updated` (item added / ticked / removed, members)                                                                                                           |
| `order:<id>`     | The customer, or staff of that store | `order:changed` (status, rider, exit pass used)                                                                                                                   |
| `session:<id>`   | The shopper                          | `session:updated` (cart contents, smart-cart scans, paid)                                                                                                         |
| `store:<id>:ops` | Staff of that store                  | `inventory:updated`, `alert:changed`, `task:changed`, `attendance:changed`, `gate:event`, `order:changed`, `session:updated`, `request:changed`, `ticket:changed` |
| `admins`         | Admins, automatically                | `request:changed`, `ticket:changed`                                                                                                                               |

Broadcasts are sent after the database transaction commits. With `REDIS_URL` set, the Socket.IO Redis adapter fans events out across
several API instances.

## Key flows

### Scan & Go

1. `POST /instore/sessions` opens a session for a store, optionally linked to a family list.
2. The app plans the route with `planRoute` from `packages/shared` (see below) using each item's aisle location in that store, and
   re-plans from the last scanned item as the shopper moves.
3. Items are added by scanning (`POST /instore/sessions/:id/items` with a barcode) or by a paired smart cart (`POST /devices/cart/items`).
   Each add deducts the store's shelf stock in the same transaction, writes a stock movement and may raise a restock alert; removing an
   item puts the stock back. The running bill uses the same pricing code as delivery orders, without delivery or handling fees.
4. Checkout creates an in-store order and a payment. When the payment is confirmed, the session is marked paid and a one-time exit pass
   is issued.
5. Idle sessions expire after the store's `sessionIdleMinutes` (default 120) and their items go back to stock.

### Exit pass

- The token is `SC` + 18 random characters (Crockford base32, about 90 bits). Only its SHA-256 hash is stored, with the last four
  characters as a support hint.
- The QR encodes `smartcart://exit/<token>` and the barcode encodes the token in Code 128, so any gate scanner can read one or the other.
- Showing the pass (`POST /orders/:id/exit-pass`) rotates the token, so an old screenshot stops working.
- The gate sends what it scanned to `POST /devices/gate/verify`. The pass must belong to this store, the order must be paid, and the pass
  must be unexpired (store setting `exitPassTtlMinutes`, default 60) and unused. Marking it used is a single conditional update, so two
  gates can never both open for one pass. Every decision is logged as a gate event and shown live in Store OS.

### In-store route planning

`packages/shared/src/routing.ts` models the store as parallel aisles joined by a front and a back cross-aisle. Inside an aisle the walk is
straight; changing aisles means leaving by the front or the back, whichever is shorter. Items at the same aisle and row become one stop.
The visiting order is a travelling-salesman path with fixed ends (entrance, or the last scanned item, to the exit), seeded with
nearest-neighbour and S-shape orders and improved with 2-opt. The result includes the stops, the walking distance between them, the
polyline drawn on the store map and an estimated time.

### Inventory and restock alerts

All stock changes go through one function that updates `store_products`, appends to `stock_movements` and broadcasts
`inventory:updated`. When the shelf falls to the reorder threshold, a restock alert opens (`LOW_STOCK`, or `OUT_OF_STOCK` for an empty
shelf), flagged for a supplier reorder when storage is short too. With `autoCreateRestockTasks` on, a restock task goes to an on-duty
warehouse worker. Restocking moves units from storage to the shelf and resolves the alert.

### Orders

Delivery orders move `PLACED → PACKING → OUT_FOR_DELIVERY → DELIVERED` and pickup orders `PLACED → PACKING → READY_FOR_PICKUP →
PICKED_UP` (see `ORDER_FLOW` in `packages/shared`), with cancellations and refunds. Pickup orders are handed over when counter staff scan the
customer's pickup QR (`smartcart://pickup/<order>/<code>`) or type the code. Orders waiting for payment are released after 20 minutes.

### Employee onboarding

`credential_requests` move `PENDING_OWNER → PENDING_ADMIN → APPROVED`, with `OWNER_CHANGES_REQUESTED` / `ADMIN_CHANGES_REQUESTED`
loops back to the requester, and `REJECTED` / `CANCELLED`. Approval creates the employee and their staff login with a temporary
password that must be changed at first sign-in. Every step is recorded on the request's timeline and notifies the people who act
next; issuing credentials and offboarding are also written to the audit log.

### Attendance

Clock-in from the app is checked against the store's geofence (`geofenceMeters`, default 300 m; the app must share its location).
Alternatively the employee scans the kiosk QR at the staff entrance: its code is an HMAC of the store's kiosk secret and the current
60-second window, so a photo of it is useless a minute later. Shifts decide lateness and leaving early; open records are closed
automatically after the shift if someone forgets to clock out, and managers can correct records (the editor is recorded).

## Background jobs

`apps/api/src/jobs` runs a housekeeping sweep every minute: expire idle Scan & Go sessions (returning stock), release unpaid orders,
expire exit passes and close forgotten attendance records. A PostgreSQL advisory lock makes sure only one instance sweeps at a time.
Set `ENABLE_JOBS=false` on instances that should not run it.
