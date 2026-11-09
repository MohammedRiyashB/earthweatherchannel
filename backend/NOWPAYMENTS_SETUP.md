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

Example schema only; the IDs and values below are placeholders, not approved production pricing:

```json
{
  "current-weather": {"name": "Current Weather API", "price_per_day": 0.50},
  "hourly-forecast": {"name": "Hourly Forecast API", "price_per_day": 0.30}
}
```

Do not use those sample prices as a live price list. The IDs must correspond to real commercial API products and the prices must be approved by the service operator.

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
