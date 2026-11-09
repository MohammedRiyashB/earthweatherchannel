# NOWPayments dynamic checkout — EARTH WEATHER

The backend contains a dynamic invoice endpoint: the server calculates the invoice total from its own service catalogue, not from an amount sent by the browser. However, the API sales flow must not be opened to customers until API credentials are issued and request quotas are enforced on the paid API routes.

## Required Render environment variables

Set these on the existing `earthweather-api` service:

- `NOWPAYMENTS_API_KEY`: merchant API key.
- `NOWPAYMENTS_IPN_SECRET`: IPN signature secret.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: Firebase Admin service-account JSON, stored as a single-line JSON value.
- `PUBLIC_BACKEND_URL`: `https://earthweather-api.onrender.com`.
- `FRONTEND_PUBLIC_URL`: `https://earthweatherchannel.web.app`.
- `EARTH_WEATHER_API_SERVICES`: JSON object of the actual purchasable service IDs and approved USD daily prices.

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

## Current production limitation

The payment webhook currently records successful subscriptions and service entitlements in Firestore. It does **not yet issue customer API keys or enforce per-key quotas on paid API routes**. Therefore, the API dashboard must keep customer checkout disabled until those paid-access controls are completed and tested. This is intentional protection against taking customer payment without delivering usable API credentials.

## Dynamic invoice flow already present in the backend

- `POST /api/payments/checkout`: Firebase-authenticated, service IDs + duration + crypto currency; backend calculates USD amount from `EARTH_WEATHER_API_SERVICES` and creates a NOWPayments invoice.
- `POST /api/payments/nowpayments/ipn`: validates the NOWPayments HMAC-SHA512 signature and order amount/currency; records subscription and entitlements when payment is finished.
- `GET /api/payments/status/{order_id}`: authenticated owner-only payment status.

Before enabling paid checkout, add and test: server-side API-key generation and protected retrieval, per-key quota/expiry checks on commercial endpoints, duplicate-IPN-safe key activation, and a real provider webhook test. Never commit or paste secrets into chat.
