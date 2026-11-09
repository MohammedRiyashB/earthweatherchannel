# NOWPayments backend setup

This repository adds a server-side NOWPayments invoice flow to the existing FastAPI backend and a typed frontend API client.

## Render environment variables

Set these on the **earth-weather-api** service in Render. Do not put provider secrets in Vite variables or frontend source:

- `NOWPAYMENTS_API_KEY`: server API key.
- `NOWPAYMENTS_IPN_SECRET`: IPN signing secret.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: Firebase service-account JSON as a single-line JSON value. The service account must have Firestore access and Firebase Auth token verification permission.
- `PUBLIC_BACKEND_URL`: exact HTTPS URL of the Render API service.
- `FRONTEND_PUBLIC_URL`: public website origin.
- `EARTH_WEATHER_CRYPTO_PLANS`: JSON map of plan IDs to server-controlled price and duration. Example:
  `{"starter_monthly":{"name":"Starter Monthly","price_amount":9.99,"price_currency":"usd","duration_days":30}}`

The sample plan above is illustrative only. Replace it with the actual prices and plans before enabling checkout.

## Endpoints

- `GET /api/payments/config`: provider state and server-defined plans.
- `GET /api/payments/currencies`: provider-supported currency codes (network-specific symbols are returned by NOWPayments).
- `POST /api/payments/checkout`: authenticated Firebase user creates a hosted invoice. Body: `{"plan_id":"starter_monthly","pay_currency":"usdttrc20"}`.
- `POST /api/payments/nowpayments/ipn`: public callback; verifies `x-nowpayments-sig`, validates order/amount/currency and activates the subscription only on `finished`.
- `GET /api/payments/status/{order_id}`: authenticated owner-only payment status.

## Security and rollout

1. Rotate the API key and IPN secret shown in the previously shared screenshot before using this integration.
2. Configure Firebase Admin service-account JSON and Firestore access in Render.
3. Set the environment variables above. Never send secrets to the frontend or commit them.
4. Confirm NOWPayments merchant eligibility and Indian compliance before accepting live payments.
5. Configure actual subscription plans; checkout remains unavailable if plans or server secrets are missing.
6. Test using provider test mode/small controlled transactions before public launch.

The frontend helper is in `frontend/src/lib/cryptoPayments.ts`. It sends Firebase ID tokens for checkout and status requests. A visible checkout page still needs to call these functions from the existing API purchase UI.
