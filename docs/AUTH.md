# Sign-in and accounts

SmartCart has three kinds of account, each signed in separately:

| Realm        | Who                                                   | How they sign in                                                                          |
| ------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Customer** | Shoppers (web shop and mobile app)                    | Phone number + OTP, email + password, Google, Apple                                       |
| **Staff**    | Store owners, store managers, floor managers, workers | Username / employee code / email + the password issued through onboarding (Store OS, app) |
| **Admin**    | The SmartCart operations team                         | Email + password (admin console)                                                          |

A phone can be signed in as a shopper and as an employee at the same time (the app's staff mode).

## Sessions

- Access tokens are short-lived JWTs (`ACCESS_TOKEN_TTL_MINUTES`, default 15) sent as `Authorization: Bearer`.
- Refresh tokens last `REFRESH_TOKEN_TTL_DAYS` (default 30) and rotate on every use. The server stores only a hash. Using a refresh
  token twice revokes its whole family, so a stolen token stops working as soon as the real owner refreshes.
- The website keeps refresh tokens in `httpOnly` cookies, one per realm (`sc_refresh_customer`, `sc_refresh_staff`,
  `sc_refresh_admin`). Set `COOKIE_SECURE=true` behind HTTPS.
- The mobile app keeps refresh tokens in the iOS Keychain / Android Keystore (expo-secure-store) and sends them in the request body
  with the realm.
- Sign-in endpoints are rate limited per IP: `AUTH_RATE_LIMIT` attempts per 15 minutes (default 30 in production).

## Phone OTP

`POST /api/v1/auth/otp/request` sends a 6-digit code, `POST /api/v1/auth/otp/verify` checks it. A first-time number is asked for a name
and becomes a new account.

- **Development:** with `OTP_DEV_ECHO=true` (default outside production) and no SMS provider, the API returns the code in the response
  and both apps pre-fill it.
- **Production:** set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER` to send real SMS. Codes are never echoed in
  production.

## Email and password

Passwords need at least 8 characters with a letter and a number, and are stored with scrypt. `POST /auth/password/forgot` creates a
6-digit reset code and `POST /auth/password/reset` sets a new password with it. No email provider is wired in yet: the API writes the
code to its log (and returns it in development, like the OTP). Connect your email service in `apps/api/src/modules/auth/routes.ts`
before relying on resets in production.

## Google

The API verifies Google ID tokens against Google's signing keys and accepts the client IDs in `GOOGLE_WEB_CLIENT_ID`,
`GOOGLE_IOS_CLIENT_ID` and `GOOGLE_ANDROID_CLIENT_ID`.

1. In Google Cloud Console → APIs & Services → Credentials, create an **OAuth client ID** of type **Web application**.
2. Add every origin the website is served from to **Authorized JavaScript origins**, for example `http://localhost:5173` and
   `https://shop.example.com`.
3. Set `GOOGLE_WEB_CLIENT_ID` on the API.

The website then shows Google's own "Continue with Google" button (Google Identity Services).

The **mobile app** uses the same web client: it opens `/auth/google-bridge` on the website in an auth browser session (Safari /
Chrome Custom Tab, not an embedded web view), the page signs the shopper in with Google and hands the ID token back to the app through
its `smartcart://` link, and the app exchanges it at `POST /auth/google`. Point the app at the website with `EXPO_PUBLIC_WEB_URL`.

`GOOGLE_IOS_CLIENT_ID` and `GOOGLE_ANDROID_CLIENT_ID` are only needed if you add a native Google Sign-In SDK to the app; the API then
accepts tokens issued to those clients too.

## Sign in with Apple

The API verifies Apple identity tokens against Apple's keys, accepting the audiences in `APPLE_CLIENT_IDS` (comma-separated) plus
`APPLE_SERVICE_ID`, and checks the nonce.

**iOS app (native):**

1. In the Apple Developer portal, enable **Sign in with Apple** for the app ID `dev.smartcart.app` (change the bundle identifier in
   `apps/mobile/app.config.ts` for your own team).
2. Add the bundle identifier to `APPLE_CLIENT_IDS`, for example `APPLE_CLIENT_IDS=dev.smartcart.app`.

The app config already sets `usesAppleSignIn` and the `expo-apple-authentication` plugin, so an EAS / `expo run:ios` build has the
entitlement. The app sends a SHA-256 hashed nonce to Apple and the raw nonce to the API.

**Website:**

1. Create a **Services ID** (for example `dev.smartcart.web`), enable Sign in with Apple for it, and register your website's domain
   and a return URL (for example `https://shop.example.com/login`).
2. Set `APPLE_SERVICE_ID` and `APPLE_REDIRECT_URI` to those values.

The website then opens Apple's sign-in popup (Sign in with Apple JS). Apple only shares the shopper's name on the first sign-in; the
apps forward it so new accounts get a proper name.

Sign in with Apple on Android is offered only in demo mode; Android shoppers can use Google, phone or email.

## Demo mode for Google and Apple

When a provider is not configured and `AUTH_DEMO_SOCIAL=true` (the default outside production), both apps show a simulated consent
screen that asks for a name and email and signs in through `POST /auth/demo-social`. The endpoint is disabled in production.

## Staff and admin accounts

Employee logins are never self-service. A store manager raises a credential request, the store owner reviews it, and a SmartCart admin
issues the username and a temporary password (or sends the request back with comments). On first sign-in the employee must choose a
new password before anything else works. Admins can revoke access for employees who leave or are let go, which signs them out
everywhere.

## Return links on mobile

The payment and Google bridges only return to the app's own schemes (`smartcart:`, and `exp:` / `exps:` for Expo Go during
development). For production builds, consider iOS Universal Links and Android App Links on your own domain for these returns, so no
other app can register the same scheme.
