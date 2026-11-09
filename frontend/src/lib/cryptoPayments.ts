const API_BASE = (import.meta.env.VITE_API_BASE_URL || "https://earthweather-api.onrender.com").replace(/\/$/, "");

export type CryptoService = {
  id: string;
  name: string;
  price_per_day: number;
  requests_per_day: number;
};
export type CryptoCheckoutConfig = {
  provider: "NOWPayments";
  enabled: boolean;
  provider_configured: boolean;
  checkout_configured: boolean;
  paid_api_access_ready: boolean;
  missing_configuration: string[];
  launch_blockers: string[];
  currency: "usd";
  duration_min_days: number;
  duration_max_days: number;
  services: CryptoService[];
};
export type DynamicCheckoutInput = {
  service_ids: string[];
  duration_days: number;
  pay_currency: string;
};
export type DynamicCheckoutResult = {
  order_id: string;
  invoice_id: string;
  checkout_url: string;
  amount: number;
  price_currency: string;
  duration_days: number;
  service_ids: string[];
  status: string;
};
export type CustomerApiKey = {
  id: string;
  api_key: string;
  key_prefix: string;
  service_ids: string[];
  quotas_per_day: Record<string, number>;
  status: "active" | "expired";
  created_at?: string;
  expires_at: string;
  duration_days: number;
};
export type PaymentStatus = {
  order_id: string;
  status: string;
  service_ids: string[];
  duration_days: number;
  amount: number;
  price_currency: string;
  updated_at?: string;
};

async function request<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : body.detail?.message || "Crypto checkout request failed");
  return body as T;
}
export const getCryptoCheckoutConfig = () => request<CryptoCheckoutConfig>("/api/payments/config");
export const getCryptoCurrencies = () => request<{ currencies: Array<string | { currency?: string; code?: string }>; provider: string }>("/api/payments/currencies");
export const createCryptoCheckout = (input: DynamicCheckoutInput, firebaseIdToken: string) =>
  request<DynamicCheckoutResult>("/api/payments/checkout", firebaseIdToken, {
    method: "POST", body: JSON.stringify(input),
  });
export const getCryptoPaymentStatus = (orderId: string, firebaseIdToken: string) =>
  request<PaymentStatus>(`/api/payments/status/${encodeURIComponent(orderId)}`, firebaseIdToken);
export const getCustomerApiKeys = (firebaseIdToken: string) =>
  request<{ keys: CustomerApiKey[] }>("/api/payments/keys", firebaseIdToken);
