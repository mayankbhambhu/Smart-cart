# Devices: exit gates, smart carts and attendance kiosks

In-store hardware talks to the API under `/api/v1/devices` and authenticates with a per-device key in the `X-Device-Key` header. The web
app has simulators for the gate and the smart cart at `/devices`, and the kiosk screen at `/ops/kiosk`; they use exactly this API.

## Device keys

A store owner or manager creates devices in **Store OS → Settings → Gates, carts & kiosks**. The key is shown once; the API stores only
its hash. Keys can be rotated there (the old key stops working at once) and devices can be disabled.

The development seed gives every store two gates, three carts and a kiosk with predictable keys, `scdev_<store code>_<device>`:

```
scdev_blr-ind-01_gate1    scdev_blr-ind-01_gate2
scdev_blr-ind-01_cart01   scdev_blr-ind-01_cart02   scdev_blr-ind-01_cart03
scdev_blr-ind-01_kiosk
```

(the same for `blr-kor-02` and `mum-ban-01`). Never use these outside development.

Device endpoints have their own, higher rate limit (1,200 requests a minute per IP address). Errors use the API's usual shape: `{"error": {"code": "...", "message": "..."}}`.

```bash
curl -H "X-Device-Key: scdev_blr-ind-01_gate1" http://localhost:4000/api/v1/devices/me
# {"id":"…","storeId":"…","type":"EXIT_GATE","name":"Exit Gate 1","storeName":"SmartCart Indiranagar","storeCode":"BLR-IND-01"}
```

## Exit gate

The gate scans the shopper's exit pass (a QR with `smartcart://exit/<token>`, or a Code 128 barcode with the token) and asks the API
whether to open:

```bash
curl -X POST http://localhost:4000/api/v1/devices/gate/verify \
  -H "X-Device-Key: scdev_blr-ind-01_gate1" -H "Content-Type: application/json" \
  -d '{"code": "<exactly what the scanner read>"}'
```

```json
{
  "open": true,
  "result": "OPENED",
  "reason": "OK",
  "message": "Payment verified. Thank you for shopping!",
  "order": { "orderNumber": "SC-…", "itemCount": 7, "total": 84600, "customerName": "Priya Sharma", "paidAt": "…" }
}
```

Open the barrier only when `open` is `true`. Otherwise show `message`; `reason` is one of `NOT_FOUND`, `ALREADY_USED`, `EXPIRED`,
`REVOKED`, `WRONG_STORE`, `UNPAID` or `MALFORMED`. A pass opens a gate exactly once, even if two gates scan it at the same moment. Every
decision appears live in Store OS (**Live store**), and when the gate opens the shopper's receipt switches to "Gate opened". Staff can
make the same check from their phone (app staff mode → **Scan → Exit pass**).

## Smart cart

A smart cart is a trolley with a scanner (or weight / vision sensors) that adds items to the shopper's Scan & Go session as they go in.
The shopper still pays on their phone.

1. **Pair.** The shopper taps **Pair cart** in the app, which shows a 6-digit code and a QR (`smartcart://cart-pair/<code>`). The cart
   scans the QR or the shopper types the code on the cart's screen:

   ```bash
   curl -X POST http://localhost:4000/api/v1/devices/cart/pair \
     -H "X-Device-Key: scdev_blr-ind-01_cart01" -H "Content-Type: application/json" \
     -d '{"pairingCode": "105614"}'
   ```

   The response is the session (store, items, bill, `cartDevice`).

2. **Items in and out.** Send the product barcode with `quantity` `+n` when an item goes in and `-n` when it comes out (between -50 and
   50, never 0):

   ```bash
   curl -X POST http://localhost:4000/api/v1/devices/cart/items \
     -H "X-Device-Key: scdev_blr-ind-01_cart01" -H "Content-Type: application/json" \
     -d '{"barcode": "8900010000026", "quantity": 1}'
   ```

   ```json
   {
     "session": { "id": "…", "items": [ … ], "bill": { "itemCount": 1, "total": 14900, … } },
     "change": { "type": "ADDED", "productId": "…", "productName": "Apple Shimla", "quantity": 1, "source": "SMART_CART" }
   }
   ```

   The store's shelf stock is deducted (or restored) in the same transaction, which can raise a restock alert, and the shopper's app
   updates live with the new total.

3. **Current session**: `GET /api/v1/devices/cart/session` returns `{"session": … | null}`, for example after the cart restarts.

4. **Unpair**: `POST /api/v1/devices/cart/unpair` (204). A cart is also free again as soon as the shopper pays, leaves or their session
   expires; scans then return `CART_NOT_PAIRED` until the next shopper pairs it.

## Attendance kiosk

A screen at the staff entrance shows a QR that employees scan with the app to clock in. The code changes every 60 seconds:

```bash
curl -H "X-Device-Key: scdev_blr-ind-01_kiosk" http://localhost:4000/api/v1/devices/kiosk/code
# {"code":"RM7VNY2A","uri":"smartcart://clock-in/<storeId>/RM7VNY2A","expiresAt":"2026-10-27T11:29:00.000Z"}
```

Render `uri` as a QR and refresh at `expiresAt`. The code under the QR can also be typed into the app. The API accepts the current and
the previous code, so a scan right at the change-over still works.
