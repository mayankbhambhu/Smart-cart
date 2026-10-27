# Deploying SmartCart

SmartCart runs as:

- **API**: one Node.js service (`apps/api`), stateless, horizontally scalable.
- **Web app**: static files (`apps/web/dist`), served by nginx (the web image) or by the API itself.
- **PostgreSQL 16**.
- **Redis** (optional): needed only when you run more than one API instance, so realtime events reach every instance.
- **Mobile apps**: built with Expo (EAS Build) and pointed at your API and website.

Keep the website and the API on **the same origin** (for example `https://shop.example.com` with `/api` and `/socket.io` proxied to the
API). The website keeps refresh tokens in `SameSite=Lax` cookies, which a browser will not send to an API on another site.

## Production settings

Every setting is listed in [apps/api/.env.example](../apps/api/.env.example). For production:

| Setting                          | Value                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                       | `production`                                                                                            |
| `JWT_ACCESS_SECRET`              | **Required.** A long random value, e.g. `openssl rand -base64 48`. The API refuses to start without it. |
| `DATABASE_URL`                   | Your PostgreSQL URL (add `?sslmode=require` for managed databases)                                      |
| `PUBLIC_WEB_URL`, `CORS_ORIGINS` | The website's public origin                                                                             |
| `COOKIE_SECURE`                  | `true` (HTTPS)                                                                                          |
| `MIGRATE_ON_START`               | `true`, or run `node dist/scripts/migrate.js` as a release step                                         |
| `PAYMENTS_DEMO_MODE`             | `false`, with keys for the providers you use (below)                                                    |
| `TWILIO_*`                       | To send OTP codes by SMS                                                                                |
| `GOOGLE_*`, `APPLE_*`            | Real Google / Apple sign-in, see [AUTH.md](AUTH.md)                                                     |
| `REDIS_URL`                      | When running several API instances                                                                      |
| `EXPO_ACCESS_TOKEN`              | If push security is enabled on your Expo project                                                        |

In production the demo helpers are always off, whatever their settings: no simulated Google/Apple consent screen, no OTP codes in API
responses, and the seed script refuses to run (it empties the database) unless `ALLOW_DEMO_SEED=true` is set explicitly.

The API trusts one reverse proxy in front of it for client IP addresses (rate limiting, audit log). Put exactly one proxy or load
balancer in front of it, or adjust `app.set('trust proxy', …)` in `apps/api/src/app.ts`.

Password-reset codes are only written to the API log until you connect an email provider (see [AUTH.md](AUTH.md)).

## Option 1: the Docker images

```bash
docker build -f apps/api/Dockerfile -t registry.example.com/smartcart-api .
docker build -f apps/web/Dockerfile -t registry.example.com/smartcart-web .
```

- Run the API image with the settings above (it listens on port 4000 and has a health check on `/health`, which also checks the
  database).
- Run the web image with `API_UPSTREAM` set to the API's internal URL (default `http://api:4000`); it serves the app and proxies `/api`
  and `/socket.io`, including WebSocket upgrades.
- `docker-compose.yml` shows the wiring; for production, drop `NODE_ENV: development` and supply real settings through an `.env` file
  or your platform's secrets.

## Option 2: a single Node service

On platforms that run one process (Render, Railway, Fly, a VM), the API can serve the website too:

```bash
npm ci
npm run build                                   # API bundle + web build
WEB_DIST_DIR=apps/web/dist MIGRATIONS_DIR=apps/api/drizzle node apps/api/dist/index.js
```

## Payments

| Provider | Dashboard set-up                                                                                                                  | Webhook URL                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Stripe   | Enable cards, Apple Pay and Google Pay. Add your web domain under Payment method domains and complete its Apple Pay verification. | `/api/v1/payments/webhooks/stripe` with `payment_intent.succeeded` and `payment_intent.payment_failed` |
| Razorpay | Enable UPI.                                                                                                                       | `/api/v1/payments/webhooks/razorpay` with `payment.captured`, `order.paid` and `payment.failed`        |
| PayPal   | Create a REST app (sandbox or live) and set `PAYPAL_ENV`.                                                                         | None: the payment is captured when the shopper returns                                                 |

Set the webhook signing secrets (`STRIPE_WEBHOOK_SECRET`, `RAZORPAY_WEBHOOK_SECRET`); unsigned or wrongly signed webhooks are rejected.
Payments are also confirmed directly with the provider when the shopper returns, so a delayed webhook never blocks the exit gate.

## Scaling

- Run as many API instances as you need behind a load balancer, with `REDIS_URL` set so Socket.IO events reach shoppers and staff
  connected to any instance.
- The website connects over WebSocket and falls back to HTTP long-polling where WebSockets are blocked; that fallback needs sticky
  sessions on the load balancer when there are several instances. The mobile app uses WebSocket only.
- The housekeeping job takes a PostgreSQL advisory lock, so only one instance sweeps at a time; set `ENABLE_JOBS=false` to keep it off
  an instance entirely.

## Mobile apps

Build with [EAS Build](https://docs.expo.dev/build/introduction/) from `apps/mobile`:

1. Change the bundle identifier / package (`dev.smartcart.app`) and the URL scheme in `app.config.ts` if needed.
2. Set the build-time environment: `EXPO_PUBLIC_API_URL=https://shop.example.com` and `EXPO_PUBLIC_WEB_URL=https://shop.example.com`
   (the website hosts the payment and Google sign-in bridges), `EAS_PROJECT_ID` for push notifications, and `STRIPE_MERCHANT_ID` for
   your Apple Pay merchant ID.
3. iOS: enable Sign in with Apple and Apple Pay for the app ID, and add the bundle identifier to the API's `APPLE_CLIENT_IDS`.
4. Android: upload FCM credentials to EAS so Expo can deliver push notifications.
5. `eas build --platform all`, then `eas submit`.

For production return links (payments and Google sign-in), consider iOS Universal Links and Android App Links on your domain instead
of the `smartcart://` scheme.
