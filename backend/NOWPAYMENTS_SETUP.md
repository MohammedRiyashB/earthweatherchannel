# NOWPayments dynamic API checkout

NOWPayments invoices are created dynamically for each customer checkout. The browser sends selected service IDs, a duration (1–30 days), and the requested crypto currency. The backend loads authoritative per-service daily prices from Render, calculates the USD total, and creates the invoice. The client cannot submit or override the amount.

## Render environment variables

Keep the existing server-side variables:

- `NOWPAYMENTS_API_KEY`: NOWPayments API key.
- `NOWPAYMENTS_IPN_SECRET`: IPN signing secret.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: Firebase Admin service-account JSON.
- `PUBLIC_BACKEND_URL`: exact HTTPS Render backend URL.
- `FRONTEND_PUBLIC_URL`: public website origin.

Replace the old fixed-plan variable `EARTH_WEATHER_CRYPTO_PLANS` with:

- `EARTH_WEATHER_API_SERVICES`: JSON object mapping each purchasable API service ID to a display name and USD price per day.

Example schema (illustrative prices only; replace with the actual approved catalogue and IDs used by the API):

```json
{
  "forecast": {"name": "Weather Forecast API", "price_per_day": 0.50},
  "satellite": {"name": "Satellite Data API", "price_per_day": 0.75},
  "air_quality": {"name": "Air Quality API", "price_per_day": 0.35}
}
```

The example IDs and prices are not assumed to match the live product catalogue. Checkout remains unavailable until this variable is configured with the real service IDs and prices. Do not paste secrets into frontend variables or commit them.

## Dynamic endpoints

- `GET /api/payments/config`: returns enabled state, service catalogue, USD per-day rates and duration limits.
- `GET /api/payments/currencies`: retrieves NOWPayments-supported currency codes.
- `POST /api/payments/checkout`: authenticated body:
  ```json
  {"service_ids":["forecast","satellite"],"duration_days":7,"pay_currency":"usdttrc20"}
  ```
  The server calculates `sum(service.price_per_day) × duration_days`, creates a unique NOWPayments invoice, and stores the order in Firestore.
- `POST /api/payments/nowpayments/ipn`: verifies the IPN signature and expected fiat price/currency. A `finished` payment creates subscription and per-service entitlement records.
- `GET /api/payments/status/{order_id}`: authenticated owner-only status.

## Rollout checklist

1. Remove `EARTH_WEATHER_CRYPTO_PLANS` from Render; it is no longer used.
2. Add `EARTH_WEATHER_API_SERVICES` using the actual API service IDs and prices. Keep all prices server-side.
3. Deploy the backend and frontend changes.
4. Confirm Firebase Firestore rules and API authorization enforce the new `earthWeatherServiceEntitlements` records before exposing paid API access. The payment webhook records entitlements; existing API routes must check them to enforce access.
5. Test invoice creation with a controlled provider/test setup and verify signed webhook handling before accepting live payments.

A successful invoice/webhook does not itself prove that every API route is enforcing entitlements. Connect the entitlement check to the API authentication middleware before public paid access is enabled.
