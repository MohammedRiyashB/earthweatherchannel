const API_BASE = (import.meta.env.VITE_API_BASE_URL || "https://earth-weather-api.onrender.com").replace(/\/$/, "");

export type CryptoPlan = {
  id: string;
  name: string;
  price_amount: number;
  price_currency: string;
  duration_days: number;
};
export type CryptoCheckoutConfig = {
  provider: "NOWPayments";
  enabled: boolean;
  plans: CryptoPlan[];
};

async function request<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || "Crypto checkout request failed");
  return body as T;
}
export const getCryptoCheckoutConfig = () => request<CryptoCheckoutConfig>("/api/payments/config");
export const getCryptoCurrencies = () => request<{ currencies: string[]; provider: string }>("/api/payments/currencies");
export const createCryptoCheckout = (input: { plan_id: string; pay_currency: string }, firebaseIdToken: string) =>
  request<{ order_id: string; invoice_id: string; checkout_url: string; status: string }>(
    "/api/payments/checkout", firebaseIdToken, { method: "POST", body: JSON.stringify(input) },
  );
export const getCryptoPaymentStatus = (orderId: string, firebaseIdToken: string) =>
  request<{ order_id: string; status: string; plan_id: string; updated_at?: string }>(
    `/api/payments/status/${encodeURIComponent(orderId)}`, firebaseIdToken,
  );
