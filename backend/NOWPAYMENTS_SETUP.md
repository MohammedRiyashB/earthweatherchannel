# Firebase database configuration and security

The Firebase project has a **named Cloud Firestore database** with database ID `earthweather`. The FastAPI backend must connect to that exact database, not silently fall back to `(default)`.

Set this Render environment variable on `earthweather-api`:

```text
CLOUD_FIRESTORE_DATABASE=earthweather
```

The backend now calls `firebase_admin.firestore.client(app, database_id="earthweather")`. Its readiness probe checks the same database. The Firebase CLI configuration deploys `firestore.rules` to the named `earthweather` database, and deploys `database.rules.json` to the project's Realtime Database.

## Security model

- The browser uses Firebase Authentication for sign-in and calls the FastAPI backend with Firebase ID tokens.
- The browser currently does not access Firestore or Realtime Database directly.
- Payment orders, subscriptions, API keys, entitlements and quota counters are written by FastAPI using the Firebase Admin SDK.
- Firestore client rules and Realtime Database client rules therefore default-deny all browser reads/writes. The Admin SDK uses privileged service-account credentials and bypasses client Security Rules; keep the service-account JSON only in Render and never in frontend code or the repository.
- Do not add broad `request.auth != null` access. If a future feature needs direct client database access, add a specific owner-scoped rule for its documented data path and test it with the Firebase Emulator Suite first.

## Deploy

The Firebase Hosting deployment workflow deploys the named Firestore rules automatically:

```bash
firebase deploy --only firestore --project earthweatherchannel --non-interactive
```

Realtime Database rules are kept locked in `database.rules.json`. The first automated attempt to deploy them could not retrieve the existing `earthweatherchannel-default-rtdb` instance details using the GitHub deployment identity. Until that service account is granted the Firebase Realtime Database Admin role (or equivalent instance read/write permissions), publish the following in Firebase Console → Realtime Database → Rules:

```json
{
  "rules": {
    ".read": false,
    ".write": false
  }
}
```

Then click **Publish**. To enable automatic RTDB deployment later, grant the deployment service account the minimum required Realtime Database rule-management permissions and change the workflow to run `firebase deploy --only database`. The Firebase project must already contain the named `earthweather` Firestore database and the Realtime Database instance. Security rules do not create databases. Existing data is not deleted by deploying rules.

---

# NOWPayments dynamic checkout — EARTH WEATHER

The backend contains a dynamic invoice endpoint: the server calculates the invoice total from its own service catalogue, not from an amount sent by the browser. However, the API sales flow must not be opened to customers until API credentials are issued and request quotas are enforced on the paid API routes.

## Required Render environment variables

Set these on the existing `earthweather-api` service:

- `NOWPAYMENTS_API_KEY`: merchant API key.
- `NOWPAYMENTS_IPN_SECRET`: IPN signature secret.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: Firebase Admin service-account JSON, stored as a single-line JSON value.
- `PUBLIC_BACKEND_URL`: `https://earthweather-api.onrender.com`.
- `FRONTEND_PUBLIC_URL`: `https://earthweatherchannel.web.app`.
- `EARTH_WEATHER_API_KEY_ENCRYPTION_KEY`: a stable Fernet key used to encrypt customer API keys at rest. Generate once, store only in Render, and do not rotate it unless all stored keys are re-encrypted.
- `EARTH_WEATHER_API_SERVICES`: JSON object of the actual purchasable service IDs, approved USD daily prices, and optional per-service daily quotas. Each service defaults to 1,000 requests/day if `requests_per_day` is omitted.

The current EARTH WEATHER pricing rule is $2.99 for the first selected API service per 7 days, plus $0.99 for each additional selected service per 7 days; 28–30 day purchases receive a 15% discount. Configure the same base and add-on rates per service below.

```json
{
  "current-weather": {"name": "Current Weather API", "base_price_per_day": 0.427143, "price_per_day": 0.141429, "requests_per_day": 1000},
  "hourly-forecast": {"name": "Hourly Forecast API", "base_price_per_day": 0.427143, "price_per_day": 0.141429, "requests_per_day": 1000}
}
```

For each catalogue entry, `base_price_per_day` is used when that service is selected first; `price_per_day` is used for each additional service. These daily rates correspond to the existing $2.99 + $0.99 per 7-day pricing rule. The IDs must match the frontend catalogue exactly.

The old static variable `EARTH_WEATHER_CRYPTO_PLANS` is no longer read by the dynamic checkout code.

## Readiness diagnostics

- `GET /api/payments/config` returns the provider-credential state, missing Render variable names, service catalogue and launch blockers. It never returns secret values.
- When both NOWPayments credentials are present, the API dashboard also calls `GET /api/payments/currencies` to verify that the API key is accepted by NOWPayments.
- A working NOWPayments connection is distinct from a live commercial API checkout.

## Paid API activation

On a verified `finished` IPN, the backend creates one owner-bound API key per order, encrypts the secret in Firestore, records the active subscription and selected services, and sets an expiry. Repeated completed IPNs reuse the same key for that order. The authenticated `GET /api/payments/keys` endpoint decrypts and returns only the signed-in customer's own keys.

Paid API endpoints use `x-api-key`, check the key's status, expiry and selected service, then atomically increment a per-key/per-service UTC daily counter in Firestore. The default daily quota is 1,000 requests per purchased service; override it per service with `requests_per_day`. Rate-limit headers are returned. Existing public website endpoints are unchanged; commercial access uses the dedicated `/api/v1/*` endpoints listed below.

## Dynamic invoice flow already present in the backend

- `POST /api/payments/checkout`: Firebase-authenticated, service IDs + duration + crypto currency; backend calculates USD amount from `EARTH_WEATHER_API_SERVICES` and creates a NOWPayments invoice.
- `POST /api/payments/nowpayments/ipn`: validates the NOWPayments HMAC-SHA512 signature and order amount/currency; records subscription and entitlements when payment is finished.
- `GET /api/payments/status/{order_id}`: authenticated owner-only payment status.
- `GET /api/payments/keys`: authenticated customer API keys.
- `DELETE /api/payments/keys/{order_id}`: owner-only key revocation; the key is rejected immediately on subsequent API calls.

### API-key endpoints

All require an `x-api-key: ew_live_...` header and consume the daily quota for that service:

- `GET /api/v1/current-weather?latitude=...&longitude=...`
- `GET /api/v1/hourly-forecast?latitude=...&longitude=...&days=7`
- `GET /api/v1/daily-forecast?latitude=...&longitude=...&days=7`
- `GET /api/v1/weather-alerts?latitude=...&longitude=...`
- `GET /api/v1/rainfall?latitude=...&longitude=...&days=7`
- `GET /api/v1/wind-data?latitude=...&longitude=...`
- `GET /api/v1/weather-maps`

Before commercial launch, verify the configured service IDs and USD/day rates, configure the stable Fernet key in Render, run the automated tests, and complete a real low-value NOWPayments payment plus signed webhook test. Never commit or paste secrets into chat.
