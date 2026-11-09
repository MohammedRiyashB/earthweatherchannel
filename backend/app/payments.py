"""Server-side dynamic NOWPayments checkout and verified webhook handling."""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

router = APIRouter(prefix="/api/payments", tags=["payments"])
logger = logging.getLogger("earthweather.payments")
NOWPAYMENTS_BASE = "https://api.nowpayments.io/v1"
HTTP_TIMEOUT = httpx.Timeout(20.0, connect=5.0)
_CURRENCY_RE = re.compile(r"^[a-z0-9]{2,24}$")
_firestore = None
_firebase_auth = None


def _services() -> dict[str, dict[str, Any]]:
    """Server-owned catalogue: {id: {name, price_per_day}}; amounts are USD."""
    try:
        data = json.loads(os.getenv("EARTH_WEATHER_API_SERVICES", "{}"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=503, detail="API service pricing configuration is invalid") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=503, detail="API service pricing configuration is invalid")
    result: dict[str, dict[str, Any]] = {}
    for key, value in data.items():
        if not isinstance(key, str) or not re.fullmatch(r"[a-z0-9_-]{2,64}", key):
            continue
        if not isinstance(value, dict):
            continue
        try:
            rate = round(float(value.get("price_per_day")), 4)
        except (TypeError, ValueError):
            continue
        if rate <= 0 or rate > 10000:
            continue
        result[key] = {"name": str(value.get("name") or key)[:100], "price_per_day": rate}
    return result


def _provider_key() -> str:
    value = os.getenv("NOWPAYMENTS_API_KEY", "").strip()
    if not value:
        raise HTTPException(status_code=503, detail="Crypto checkout is not configured yet")
    return value


def _db():
    global _firestore, _firebase_auth
    if _firestore is not None:
        return _firestore
    raw = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    if not raw:
        raise HTTPException(status_code=503, detail="Payment storage is not configured yet")
    try:
        import firebase_admin
        from firebase_admin import auth, credentials, firestore
        if not firebase_admin._apps:
            app = firebase_admin.initialize_app(credentials.Certificate(json.loads(raw)))
        else:
            app = firebase_admin.get_app()
        _firebase_auth = auth
        _firestore = firestore.client(app)
        return _firestore
    except Exception as exc:
        logger.exception("Firebase Admin initialization failed")
        raise HTTPException(status_code=503, detail="Payment storage is unavailable") from exc


def _verified_user(authorization: str | None) -> dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Sign in is required")
    _db()
    try:
        return _firebase_auth.verify_id_token(authorization[7:].strip(), check_revoked=True)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired sign-in token") from exc


async def _provider_get(path: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        response = await client.get(
            f"{NOWPAYMENTS_BASE}{path}",
            headers={"x-api-key": _provider_key(), "Accept": "application/json"},
        )
    if response.is_error:
        logger.warning("NOWPayments GET %s returned %s", path, response.status_code)
        raise HTTPException(status_code=502, detail="Crypto provider request failed")
    return response.json()


class CheckoutRequest(BaseModel):
    service_ids: list[str] = Field(min_length=1, max_length=20)
    duration_days: int = Field(ge=1, le=30)
    pay_currency: str = Field(min_length=2, max_length=24, pattern=r"^[a-zA-Z0-9]+$")

    @field_validator("service_ids")
    @classmethod
    def unique_service_ids(cls, value: list[str]) -> list[str]:
        cleaned = list(dict.fromkeys(item.strip().lower() for item in value if isinstance(item, str)))
        if not cleaned or len(cleaned) != len(value):
            raise ValueError("Choose one or more unique API services")
        return cleaned


@router.get("/config")
async def payment_config() -> dict[str, Any]:
    """Expose safe readiness diagnostics; never return provider secrets."""
    def configured(name: str) -> bool:
        return bool(os.getenv(name, "").strip())

    services = _services()
    missing: list[str] = []
    for variable in ("NOWPAYMENTS_API_KEY", "NOWPAYMENTS_IPN_SECRET", "FIREBASE_SERVICE_ACCOUNT_JSON"):
        if not configured(variable):
            missing.append(variable)

    public_url = os.getenv("PUBLIC_BACKEND_URL", "").strip()
    if not public_url.startswith("https://"):
        missing.append("PUBLIC_BACKEND_URL (must be a public HTTPS URL)")
    if not services:
        missing.append("EARTH_WEATHER_API_SERVICES (valid service IDs and USD/day prices)")

    provider_configured = configured("NOWPAYMENTS_API_KEY") and configured("NOWPAYMENTS_IPN_SECRET")
    checkout_configured = not missing
    # Do not accept customer money until paid API-key issuance and per-key quota
    # enforcement are connected to the commercial API routes.
    paid_api_access_ready = False
    launch_blockers = [] if paid_api_access_ready else [
        "Paid API-key issuance and per-key request-quota enforcement are not yet implemented."
    ]
    return {
        "provider": "NOWPayments",
        "provider_configured": provider_configured,
        "enabled": checkout_configured and paid_api_access_ready,
        "checkout_configured": checkout_configured,
        "paid_api_access_ready": paid_api_access_ready,
        "missing_configuration": missing,
        "launch_blockers": launch_blockers,
        "currency": "usd",
        "duration_min_days": 1,
        "duration_max_days": 30,
        "services": [{"id": key, "name": value["name"], "price_per_day": value["price_per_day"]}
                     for key, value in services.items()],
    }


@router.get("/currencies")
async def payment_currencies() -> dict[str, Any]:
    payload = await _provider_get("/currencies")
    currencies = payload.get("currencies", []) if isinstance(payload, dict) else []
    return {"currencies": currencies, "provider": "NOWPayments"}


@router.post("/checkout")
async def create_checkout(payload: CheckoutRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _verified_user(authorization)
    catalogue = _services()
    unknown = [service_id for service_id in payload.service_ids if service_id not in catalogue]
    if unknown:
        raise HTTPException(status_code=422, detail={"message": "Unknown API service", "service_ids": unknown})
    selected = [{"id": service_id, **catalogue[service_id]} for service_id in payload.service_ids]
    total = round(sum(item["price_per_day"] for item in selected) * payload.duration_days, 2)
    if total <= 0:
        raise HTTPException(status_code=422, detail="Calculated checkout amount must be positive")
    pay_currency = payload.pay_currency.lower()
    if not _CURRENCY_RE.fullmatch(pay_currency):
        raise HTTPException(status_code=422, detail="Unsupported payment currency")
    public_url = os.getenv("PUBLIC_BACKEND_URL", "").rstrip("/")
    if not public_url.startswith("https://"):
        raise HTTPException(status_code=503, detail="Public HTTPS backend URL is not configured")
    order_id = f"ew_{uuid.uuid4().hex}"
    frontend_origin = os.getenv("FRONTEND_PUBLIC_URL", "https://earthweatherchannel.web.app").rstrip("/")
    service_names = ", ".join(item["name"] for item in selected)
    request_body = {
        "price_amount": total,
        "price_currency": "usd",
        "pay_currency": pay_currency,
        "order_id": order_id,
        "order_description": f"EARTH WEATHER API: {service_names} ({payload.duration_days} days)"[:255],
        "ipn_callback_url": f"{public_url}/api/payments/nowpayments/ipn",
        "success_url": f"{frontend_origin}/api/payment/success?order_id={order_id}",
        "cancel_url": f"{frontend_origin}/api/payment/cancel?order_id={order_id}",
    }
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        response = await client.post(
            f"{NOWPAYMENTS_BASE}/invoice",
            headers={"x-api-key": _provider_key(), "Content-Type": "application/json"},
            json=request_body,
        )
    if response.is_error:
        logger.warning("NOWPayments invoice creation failed: %s", response.status_code)
        raise HTTPException(status_code=502, detail="Could not create crypto checkout invoice")
    invoice = response.json()
    invoice_url, invoice_id = invoice.get("invoice_url"), invoice.get("id")
    if not invoice_url or not invoice_id:
        raise HTTPException(status_code=502, detail="Crypto provider returned an incomplete invoice")
    _db().collection("earthWeatherCryptoPayments").document(order_id).set({
        "order_id": order_id, "invoice_id": str(invoice_id), "customer_uid": user["uid"],
        "customer_email": user.get("email"), "service_ids": payload.service_ids,
        "services": selected, "duration_days": payload.duration_days,
        "price_amount": total, "price_currency": "usd", "pay_currency": pay_currency,
        "status": "waiting", "created_at": datetime.now(timezone.utc), "provider": "nowpayments",
    })
    return {"order_id": order_id, "invoice_id": str(invoice_id), "checkout_url": invoice_url,
            "amount": total, "price_currency": "usd", "duration_days": payload.duration_days,
            "service_ids": payload.service_ids, "status": "waiting"}


def _sort_recursively(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _sort_recursively(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [_sort_recursively(item) for item in value]
    return value


def _valid_ipn_signature(payload: dict[str, Any], supplied: str | None) -> bool:
    secret = os.getenv("NOWPAYMENTS_IPN_SECRET", "").strip()
    if not secret or not supplied:
        return False
    canonical = json.dumps(_sort_recursively(payload), separators=(",", ":"), ensure_ascii=False)
    expected = hmac.new(secret.encode(), canonical.encode(), hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, supplied.strip())


@router.post("/nowpayments/ipn")
async def nowpayments_ipn(request: Request, x_nowpayments_sig: str | None = Header(default=None)) -> dict[str, str]:
    try:
        payload = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid webhook JSON") from exc
    if not isinstance(payload, dict) or not _valid_ipn_signature(payload, x_nowpayments_sig):
        raise HTTPException(status_code=401, detail="Invalid provider signature")
    order_id = str(payload.get("order_id", ""))
    payment_status = str(payload.get("payment_status", "")).lower()
    allowed = {"waiting", "confirming", "confirmed", "sending", "partially_paid", "finished", "failed", "refunded", "expired"}
    if not order_id or payment_status not in allowed:
        raise HTTPException(status_code=400, detail="Invalid payment notification")
    db = _db()
    ref = db.collection("earthWeatherCryptoPayments").document(order_id)
    snapshot = ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Unknown payment order")
    payment = snapshot.to_dict() or {}
    if str(payload.get("price_currency", "")).lower() != payment.get("price_currency"):
        raise HTTPException(status_code=400, detail="Payment currency mismatch")
    try:
        notified_amount = float(payload.get("price_amount"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid payment amount")
    if abs(notified_amount - float(payment["price_amount"])) > 0.000001:
        raise HTTPException(status_code=400, detail="Payment amount mismatch")
    now = datetime.now(timezone.utc)
    update: dict[str, Any] = {
        "status": payment_status, "provider_payment_id": str(payload.get("payment_id", "")),
        "pay_amount": payload.get("actually_paid"),
        "paid_currency": payload.get("pay_currency", payment.get("pay_currency")),
        "updated_at": now,
    }
    if payment_status == "finished" and payment.get("status") != "finished":
        service_ids = payment.get("service_ids") or []
        if not service_ids or not payment.get("duration_days"):
            raise HTTPException(status_code=503, detail="Payment entitlement data is incomplete")
        expiry = now + timedelta(days=int(payment["duration_days"]))
        subscription_id = f"crypto_{order_id}"
        update.update({"status": "finished", "subscription_id": subscription_id, "paid_at": now})
        db.collection("earthWeatherSubscriptions").document(subscription_id).set({
            "subscription_id": subscription_id, "customer_uid": payment["customer_uid"],
            "service_ids": service_ids, "services": payment.get("services", []),
            "duration_days": int(payment["duration_days"]), "status": "active",
            "started_at": now, "expires_at": expiry, "source_order_id": order_id,
            "payment_provider": "nowpayments",
        })
        for service_id in service_ids:
            db.collection("earthWeatherServiceEntitlements").document(f"{payment['customer_uid']}_{service_id}").set({
                "customer_uid": payment["customer_uid"], "service_id": service_id,
                "status": "active", "expires_at": expiry, "source_order_id": order_id,
                "updated_at": now,
            }, merge=True)
    ref.update(update)
    return {"received": "true"}


@router.get("/status/{order_id}")
async def payment_status(order_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _verified_user(authorization)
    snapshot = _db().collection("earthWeatherCryptoPayments").document(order_id).get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Payment not found")
    payment = snapshot.to_dict() or {}
    if payment.get("customer_uid") != user["uid"]:
        raise HTTPException(status_code=404, detail="Payment not found")
    updated = payment.get("updated_at")
    return {"order_id": order_id, "status": payment.get("status", "waiting"),
            "service_ids": payment.get("service_ids", []), "duration_days": payment.get("duration_days"),
            "amount": payment.get("price_amount"), "price_currency": payment.get("price_currency"),
            "updated_at": updated.isoformat() if updated else None}
