"""NOWPayments crypto checkout and verified webhook handling.

Provider secrets and Firebase Admin credentials are server-only environment variables.
Never expose NOWPayments keys in the browser.
"""
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
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/payments", tags=["payments"])
logger = logging.getLogger("earthweather.payments")
NOWPAYMENTS_BASE = "https://api.nowpayments.io/v1"
HTTP_TIMEOUT = httpx.Timeout(20.0, connect=5.0)
_CURRENCY_RE = re.compile(r"^[a-z0-9]{2,24}$")
_firestore = None
_firebase_auth = None


def _plans() -> dict[str, dict[str, Any]]:
    try:
        data = json.loads(os.getenv("EARTH_WEATHER_CRYPTO_PLANS", "{}"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=503, detail="Crypto plan configuration is invalid") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=503, detail="Crypto plan configuration is invalid")
    return {
        str(key): value for key, value in data.items()
        if isinstance(value, dict)
        and isinstance(value.get("price_amount"), (int, float))
        and float(value["price_amount"]) > 0
        and isinstance(value.get("price_currency", "usd"), str)
        and isinstance(value.get("duration_days"), int)
        and value["duration_days"] > 0
    }


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
    plan_id: str = Field(min_length=1, max_length=64)
    pay_currency: str = Field(min_length=2, max_length=24, pattern=r"^[a-zA-Z0-9]+$")


@router.get("/config")
async def payment_config() -> dict[str, Any]:
    plans = _plans()
    return {
        "provider": "NOWPayments",
        "enabled": bool(os.getenv("NOWPAYMENTS_API_KEY") and os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON") and plans),
        "plans": [
            {"id": key, "name": str(value.get("name", key)), "price_amount": value["price_amount"],
             "price_currency": value.get("price_currency", "usd"), "duration_days": value["duration_days"]}
            for key, value in plans.items()
        ],
    }


@router.get("/currencies")
async def payment_currencies() -> dict[str, Any]:
    payload = await _provider_get("/currencies")
    currencies = payload.get("currencies", []) if isinstance(payload, dict) else []
    return {"currencies": currencies, "provider": "NOWPayments"}


@router.post("/checkout")
async def create_checkout(payload: CheckoutRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _verified_user(authorization)
    plan = _plans().get(payload.plan_id)
    if not plan:
        raise HTTPException(status_code=422, detail="Unknown subscription plan")
    pay_currency = payload.pay_currency.lower()
    if not _CURRENCY_RE.fullmatch(pay_currency):
        raise HTTPException(status_code=422, detail="Unsupported payment currency")
    public_url = os.getenv("PUBLIC_BACKEND_URL", "").rstrip("/")
    if not public_url.startswith("https://"):
        raise HTTPException(status_code=503, detail="Public HTTPS backend URL is not configured")
    order_id = f"ew_{uuid.uuid4().hex}"
    frontend_origin = os.getenv("FRONTEND_PUBLIC_URL", "https://earthweatherchannel.web.app").rstrip("/")
    request_body = {
        "price_amount": float(plan["price_amount"]),
        "price_currency": str(plan.get("price_currency", "usd")).lower(),
        "pay_currency": pay_currency,
        "order_id": order_id,
        "order_description": f"EARTH WEATHER API - {plan.get('name', payload.plan_id)}",
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
        "customer_email": user.get("email"), "plan_id": payload.plan_id,
        "plan_name": str(plan.get("name", payload.plan_id)),
        "price_amount": float(plan["price_amount"]),
        "price_currency": str(plan.get("price_currency", "usd")).lower(),
        "pay_currency": pay_currency, "status": "waiting",
        "created_at": datetime.now(timezone.utc), "provider": "nowpayments",
    })
    return {"order_id": order_id, "invoice_id": str(invoice_id), "checkout_url": invoice_url, "status": "waiting"}


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
    update: dict[str, Any] = {
        "status": payment_status, "provider_payment_id": str(payload.get("payment_id", "")),
        "pay_amount": payload.get("actually_paid"), "pay_currency": payload.get("pay_currency", payment.get("pay_currency")),
        "updated_at": datetime.now(timezone.utc),
    }
    if payment_status == "finished" and payment.get("status") != "finished":
        plan = _plans().get(payment.get("plan_id"))
        if not plan:
            raise HTTPException(status_code=503, detail="Subscription plan is no longer configured")
        now = datetime.now(timezone.utc)
        expiry = now + timedelta(days=int(plan["duration_days"]))
        subscription_id = f"crypto_{order_id}"
        update.update({"status": "finished", "subscription_id": subscription_id, "paid_at": now})
        db.collection("earthWeatherSubscriptions").document(subscription_id).set({
            "subscription_id": subscription_id, "customer_uid": payment["customer_uid"],
            "plan_id": payment["plan_id"], "status": "active", "started_at": now,
            "expires_at": expiry, "source_order_id": order_id, "payment_provider": "nowpayments",
        })
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
            "plan_id": payment.get("plan_id"), "updated_at": updated.isoformat() if updated else None}
