# SmartCart

Groceries in minutes, pickup on your schedule, and **Scan & Go** shopping with no checkout lines.

SmartCart is a quick-commerce platform in the style of Blinkit and Zepto, extended into the physical store:

- **Delivery** in about 10 minutes from the nearest store.
- **Scheduled pickup**: order online, collect at the counter in the slot you chose.
- **Scan & Go in the store**: say or type what you need and the app shows exactly where it is ("Aisle 4 · Row 2 · Shelf 3") with a
  running total. The family's shared list syncs live and is sorted into the shortest walk through the aisles. Scan items with the phone
  (or drop them into a paired smart cart), tap **Checkout**, pay with Apple Pay, Google Pay, UPI or card, and walk out: the exit gate
  scans the digital receipt and opens.

It comes with a **Store OS** for owners, managers and staff, and an **admin console** for the SmartCart team.

| App                                 | For                                                   | Where                       |
| ----------------------------------- | ----------------------------------------------------- | --------------------------- |
| Shop (web)                          | Shoppers                                              | `apps/web` → `/`            |
| SmartCart app (iOS + Android, Expo) | Shoppers, plus a staff mode for store employees       | `apps/mobile`               |
| Store OS                            | Store owners, store managers, floor managers, workers | `apps/web` → `/ops`         |
| Admin console                       | The SmartCart operations team                         | `apps/web` → `/admin`       |
| Device simulators                   | Exit gate and smart cart (kiosk is in Store OS)       | `apps/web` → `/devices`     |
| API                                 | REST + realtime (Socket.IO) for all of the above      | `apps/api` → `:4000/api/v1` |

## Features

### Shoppers (web and mobile)

- **Shop**: home feed with offers, categories, search that also answers "where is the peanut butter?", product pages with the aisle
  location in the selected store, dietary tags and allergen warnings.
- **Cart and one-tap checkout**: live price quotes, coupons, delivery/handling/small-cart fees, rider tips, saved addresses (GPS pin on
  mobile), and payment with **Stripe** (cards, **Apple Pay**, **Google Pay**), **PayPal** or **UPI** (Razorpay), including saved methods.
- **Order tracking**: live status timeline, rider details, cancel and refund, pay again for an unpaid order, reorder.
- **Scheduled pickup**: pick a 30-minute slot; the order screen shows a pickup QR and code that counter staff verify.
- **Scan & Go**:
  - Start a session at the store with a family list attached; the list is planned as the shortest route from the entrance through the
    aisles to the exit, with the next stop, the walk in metres and an estimated time.
  - Find any item by text or voice and see it on the store map.
  - Scan barcodes with the camera (continuous scanning on mobile) or pair a **smart cart** that adds and removes items as they go in and
    out. The running total updates live.
  - Pay on the phone, receive a **digital receipt with a one-time exit pass** (QR and barcode, screen brightness turned up on mobile).
    The gate opens once for a paid pass from that store; a reused, expired or unpaid pass is refused.
- **Family lists**: create, share by code or invite, and see every add and tick instantly on everyone's phone, including the person in the
  store. Order a whole list for delivery or pickup in one tap.
- **Accounts**: phone OTP, email and password, Google, Apple. Profiles hold dietary preferences and allergies, addresses, payment
  methods, purchase history and notifications (in-app and push).
- **Stores and stock**: store locator with opening hours and directions, and "is it in stock?" across every store before leaving home.

### Store OS

| Capability                                                         | Owner | Store manager | Floor manager | Worker |
| ------------------------------------------------------------------ | :---: | :-----------: | :-----------: | :----: |
| Clock in/out, own tasks, restock alerts, orders board, gate/pickup |   ✓   |       ✓       |       ✓       |   ✓    |
| Assign and review tasks, attendance board, store support requests  |   ✓   |       ✓       |       ✓       |        |
| Stock corrections and product settings                             |   ✓   |       ✓       |       ✓       |        |
| Shifts, attendance corrections, wages, analytics, offers, settings |   ✓   |       ✓       |               |        |
| Raise login-credential requests for new employees                  |   ✓   |       ✓       |               |        |
| Approve requests (owner review step)                               |   ✓   |               |               |        |

- **Onboarding**: a store manager raises a login request for a new employee → the store owner reviews it (approve or send back) → a
  SmartCart admin reviews it and issues the username and a temporary password, or sends it back with comments. The employee must set
  their own password at first sign-in.
- **Real-time inventory**: shelf and storage stock per product, deducted the moment an item sells or drops into a smart cart. Crossing the
  reorder threshold raises a restock alert (low or empty shelf) for the warehouse team, flags a supplier reorder when storage is low too,
  and can auto-assign a restock task to an on-duty worker. One tap moves stock from storage to the shelf.
- **Business analysis**: net sales and gross profit for today, this month, this year or any custom range with comparisons; trends; top
  sellers; categories; the offers customers use most; rush hours by day and hour; payment mix; baskets; customers; staff; CSV export.
- **Live store**: shoppers in the store with their carts, exit-gate events, and an orders board for packing, pickers, riders and pickup
  hand-over.
- **Work**: tasks with priority, due time and aisle; the assignee is alerted, starts, completes with a remark, and the manager approves
  with a rating or sends it back.
- **Shifts and attendance**: weekly shift planner; clock-in by GPS (geofenced to the store) or by the rotating QR on the staff-entrance
  kiosk; who is in, when they arrived and left, lateness, hours and days present, estimated pay; manual corrections with an audit trail.
- **Settings**: store hours, fees, pickup slots, exit-pass validity, geofence, the aisle layout, and device keys for gates, carts and
  kiosks.

### Admin console

- Review credential requests from stores, issue credentials or send them back.
- Stores and their owners; open new stores.
- Every employee across stores with phone, joining date and wages; offboard people who left or were let go, which revokes their access
  and signs them out everywhere; reset passwords.
- Requests and issues raised by stores (tickets) with internal notes; an audit log of sensitive actions.

## Architecture

```
  Web (React 19, Vite)  ─┐                                  ┌─ PostgreSQL 16 (Drizzle ORM)
  Mobile (Expo / RN)    ─┼─ REST /api/v1 + Socket.IO ── API ┤
  Gates · carts · kiosk ─┘        (Express 5, Node 22)       └─ Redis (optional, for several API instances)
                                      │
                                      ├─ Payments: Stripe · PayPal · Razorpay (simulated when not configured)
                                      ├─ Identity: Google · Apple · phone OTP (Twilio)
                                      └─ Push: Expo push service
```

- **Monorepo** with npm workspaces: `packages/shared` holds the domain types, zod schemas, pricing, route planning, store-layout geometry
  and QR/barcode encoders used by the API, the web app and the mobile app alike.
- **Realtime**: Socket.IO rooms per user, family list, order, Scan & Go session and store; lists, carts, orders, inventory, tasks,
  attendance and alerts update live.
- **Security**: short-lived access tokens with rotating refresh tokens (reuse revokes the family), scrypt passwords, role checks per store,
  rate limiting, hashed single-use exit-pass tokens, hashed device keys, an audit log.

More in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Run it

### With Docker

```bash
docker compose up --build -d
docker compose run --rm api node dist/scripts/seed.js   # demo data (empties the database first)
```

Open http://localhost:8080. The API listens on http://localhost:4000, which the mobile app can use too. Demo payments and demo
Google/Apple sign-in are on in this stack; see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for production.

### For development

Requirements: Node.js 22.12+, PostgreSQL 16.

```bash
npm install

# PostgreSQL, if you do not have one running:
docker run -d --name smartcart-db -p 5432:5432 \
  -e POSTGRES_USER=smartcart -e POSTGRES_PASSWORD=smartcart -e POSTGRES_DB=smartcart postgres:16-alpine
docker exec smartcart-db createdb -U smartcart smartcart_test   # for the API test suite

cp apps/api/.env.example apps/api/.env
npm run db:migrate
npm run db:seed
npm run dev            # API on :4000 and web on :5173
```

### Mobile app

```bash
npm run dev:mobile     # expo start
```

Open it in Expo Go on a phone on the same Wi-Fi, or in an iOS simulator / Android emulator. The app talks to the API and website on the
machine running Expo (ports 4000 and 5173); set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WEB_URL` to point it elsewhere.

Demo payments, scanning, Scan & Go, lists and staff mode all work in Expo Go. Real Stripe payments with Apple Pay / Google Pay, Sign in
with Apple for your own bundle ID, and push notifications need a development build (`npx expo run:ios`, `npx expo run:android`, or EAS
Build). Store employees use **Account → Staff mode**.

## Demo data

`npm run db:seed` creates three stores (Bengaluru Indiranagar and Koramangala, Mumbai Bandra West) with aisle layouts, 146 products, 240+
customers, four months of order history (about 16,000 orders), staff with shifts and attendance, tasks and open restock alerts.

| Who                | Sign in                                                        | Where                    |
| ------------------ | -------------------------------------------------------------- | ------------------------ |
| Shopper            | `priya@example.com` / `Customer@123`, or phone `99000 00001`   | Shop, app                |
| Family member      | `rohit@example.com` / `Customer@123` (list code `FAMILY42`)    | Shop, app                |
| Store owner        | `arjun.mehta` / `Staff@1234` (Indiranagar and Koramangala)     | Store OS, app staff mode |
| Store manager      | `kavya.reddy` / `Staff@1234`                                   | Store OS, app staff mode |
| Floor manager      | `vikram.singh` / `Staff@1234`                                  | Store OS, app staff mode |
| Worker (warehouse) | `rahul.yadav` / `Staff@1234`                                   | Store OS, app staff mode |
| SmartCart admin    | `admin@smartcart.dev` / `Admin@1234` (also `ops@`, `support@`) | Admin console            |

In development the OTP for phone sign-in is shown on screen, and Google / Apple open a simulated consent screen until you configure
real OAuth clients ([docs/AUTH.md](docs/AUTH.md)).

**Devices**: each store has gates, smart carts and a kiosk with development keys `scdev_<store code>_<device>`, for example
`scdev_blr-ind-01_gate1`, `scdev_blr-ind-01_cart01` and `scdev_blr-ind-01_kiosk`. The simulators at `/devices` fill them in.

### Try the in-store flow

1. Sign in as Priya, open **Scan & Go**, choose _SmartCart Indiranagar_ and the _Weekly Groceries_ list, and tap **I'm in the store**.
2. Follow the route, or ask where something is. Add items with **Scan item** (type a barcode in the browser, or use the camera on the
   phone). To use a smart cart, tap **Pair cart** and enter the code in the cart simulator at `/devices/cart`.
3. Meanwhile, sign in as Rohit in another browser and add something to the list: it appears on Priya's route straight away.
4. Tap **Checkout**, pay with UPI (simulated), and the exit pass appears.
5. Open the gate simulator at `/devices/gate` and scan or paste the pass: the gate opens. Try the same pass again: it is refused.
6. In Store OS (`/ops`, as `kavya.reddy`), watch the shopper on **Live store**, the stock drop on **Inventory**, and restock alerts.

## Payments

With no provider keys and `PAYMENTS_DEMO_MODE=true`, every method is simulated end to end (approve or decline in a sheet). Add keys to
go live per provider:

| Provider | Methods                      | Settings                                                               | Webhook                               |
| -------- | ---------------------------- | ---------------------------------------------------------------------- | ------------------------------------- |
| Stripe   | Cards, Apple Pay, Google Pay | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | `/api/v1/payments/webhooks/stripe`    |
| Razorpay | UPI (intent, collect, QR)    | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`    | `/api/v1/payments/webhooks/razorpay`  |
| PayPal   | PayPal wallet                | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV`               | — (captured when the shopper returns) |

Orders count as paid only after the server confirms the payment with the provider (or a signed webhook arrives). Unpaid orders are
released after 20 minutes.

## Tests

```bash
npm run format:check
npm run typecheck                 # all workspaces, including the mobile app
npm test                          # shared unit tests + API integration tests (needs the smartcart_test database)
npm run test:e2e                  # Playwright: starts the API and web dev servers against the seeded database
(cd apps/mobile && npx expo export --platform ios --platform android)   # bundles both mobile platforms
```

The end-to-end journeys cover Scan & Go with a smart cart and the exit gate, live family-list sync between two shoppers, delivery from
checkout through packing to live tracking, and employee onboarding from request to first sign-in. CI
([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs all of the above and builds both Docker images.

## Repository layout

```
apps/
  api/          Express API, Socket.IO, Drizzle schema and migrations, seed, background jobs, tests
  web/          React app: shop, Store OS (/ops), admin console (/admin), device simulators, Playwright tests
  mobile/       Expo app (expo-router): shop, Scan & Go, lists, orders, account, staff mode
packages/
  shared/       Types, schemas, pricing, route planning, store layout, QR/barcode encoders
docs/           Architecture, sign-in, devices and deployment notes
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): components, realtime events, key flows and algorithms
- [docs/AUTH.md](docs/AUTH.md): sessions, OTP, Google and Apple setup, staff onboarding
- [docs/DEVICES.md](docs/DEVICES.md): the hardware API for exit gates, smart carts and attendance kiosks
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): production configuration, scaling and mobile release builds
- [apps/api/.env.example](apps/api/.env.example): every API setting
