"""Server-side dynamic NOWPayments checkout and verified webhook handling."""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import math
import os
import re
import secrets
import uuid
from cryptography.fernet import Fernet, InvalidToken
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


def _firestore_database_id() -> str:
    """Return the explicitly configured Firestore database ID."""
    return os.getenv("CLOUD_FIRESTORE_DATABASE", "").strip() or "(default)"


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
        if not math.isfinite(rate) or rate <= 0 or rate > 10000:
            continue
        try:
            base_rate = round(float(value.get("base_price_per_day", rate)), 6)
        except (TypeError, ValueError):
            base_rate = rate
        if not math.isfinite(base_rate) or base_rate <= 0 or base_rate > 10000:
            continue
        try:
            quota = int(value.get("requests_per_day", 1000))
        except (TypeError, ValueError):
            quota = 1000
        if quota < 1 or quota > 1_000_000:
            quota = 1000
        result[key] = {"name": str(value.get("name") or key)[:100], "base_price_per_day": base_rate, "price_per_day": rate, "requests_per_day": quota}
    return result


def _fernet() -> Fernet:
    key = os.getenv("EARTH_WEATHER_API_KEY_ENCRYPTION_KEY", "").strip()
    if not key:
        raise HTTPException(status_code=503, detail="API key encryption is not configured")
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as exc:
        raise HTTPException(status_code=503, detail="API key encryption configuration is invalid") from exc


def calculate_checkout_amount(services: dict[str, dict[str, Any]], service_ids: list[str], duration_days: int) -> float:
    """Server-side USD pricing: service daily rates, with a 15% discount from 28 days."""
    if not 1 <= duration_days <= 30:
        raise ValueError("duration_days must be between 1 and 30")
    if not service_ids:
        raise ValueError("at least one API service must be selected")
    unknown = [service_id for service_id in service_ids if service_id not in services]
    if unknown:
        raise ValueError(f"unknown API service IDs: {', '.join(unknown)}")
    first = services[service_ids[0]]
    subtotal_per_day = float(first.get("base_price_per_day", first["price_per_day"]))
    subtotal_per_day += sum(float(services[item]["price_per_day"]) for item in service_ids[1:])
    subtotal = subtotal_per_day * duration_days
    return round(subtotal * (0.85 if duration_days >= 28 else 1.0), 2)


def _firestore_database_ready() -> bool:
    """Verify the project's default Firestore database exists and is reachable."""
    try:
        _db().collection("_earthWeatherSystem").document("readiness").get()
        return True
    except Exception as exc:
        logger.warning("Cloud Firestore readiness check failed: %s", exc.__class__.__name__)
        return False


def _paid_api_access_ready(firestore_ready: bool | None = None) -> bool:
    """True only when provider, service catalogue, Firebase, Firestore and key encryption are configured."""
    if not _services() or not os.getenv("EARTH_WEATHER_API_KEY_ENCRYPTION_KEY", "").strip():
        return False
    if not all(os.getenv(name, "").strip() for name in (
        "NOWPAYMENTS_API_KEY", "NOWPAYMENTS_IPN_SECRET",
        "FIREBASE_SERVICE_ACCOUNT_JSON", "PUBLIC_BACKEND_URL", "CLOUD_FIRESTORE_DATABASE",
    )):
        return False
    if firestore_ready is None:
        firestore_ready = _firestore_database_ready()
    if not firestore_ready:
        return False
    try:
        _fernet()
    except HTTPException:
        return False
    return True


def _issue_or_get_api_key(db: Any, order_id: str, payment: dict[str, Any], now: datetime, expires_at: datetime) -> str:
    """Create one encrypted, owner-bound API key per paid order; repeated IPNs reuse it."""
    from google.api_core.exceptions import AlreadyExists

    key_ref = db.collection("earthWeatherApiKeys").document(order_id)
    existing = key_ref.get()
    if existing.exists:
        record = existing.to_dict() or {}
        try:
            return _fernet().decrypt(record["api_key_encrypted"].encode()).decode()
        except (KeyError, InvalidToken, UnicodeDecodeError) as exc:
            logger.exception("Could not decrypt the existing API key for order %s", order_id)
            raise HTTPException(status_code=503, detail="Stored API key could not be recovered") from exc

    raw_key = "ew_live_" + secrets.token_urlsafe(32)
    services = payment.get("services") or []
    quotas = {item["id"]: int(item.get("requests_per_day", 1000)) for item in services if item.get("id")}
    record = {
        "order_id": order_id, "customer_uid": payment["customer_uid"],
        "key_hash": hashlib.sha256(raw_key.encode()).hexdigest(),
        "api_key_encrypted": _fernet().encrypt(raw_key.encode()).decode(),
        "key_prefix": raw_key[:15], "service_ids": payment.get("service_ids", []),
        "quotas_per_day": quotas, "status": "active", "created_at": now,
        "expires_at": expires_at, "duration_days": int(payment["duration_days"]),
        "source_order_id": order_id,
    }
    try:
        key_ref.create(record)
    except AlreadyExists:
        saved = key_ref.get().to_dict() or {}
        try:
            raw_key = _fernet().decrypt(saved["api_key_encrypted"].encode()).decode()
        except (KeyError, InvalidToken, UnicodeDecodeError) as exc:
            raise HTTPException(status_code=503, detail="Stored API key could not be recovered") from exc
    return raw_key


def consume_api_key_quota(raw_key: str | None, service_id: str) -> dict[str, Any]:
    """Validate a key and atomically charge one request against its UTC daily service quota."""
    if not raw_key or not raw_key.startswith("ew_live_"):
        raise HTTPException(status_code=401, detail="A valid x-api-key header is required")
    db = _db()
    digest = hashlib.sha256(raw_key.encode()).hexdigest()
    matches = list(db.collection("earthWeatherApiKeys").where("key_hash", "==", digest).limit(1).stream())
    if not matches:
        raise HTTPException(status_code=401, detail="API key is invalid")
    key_doc = matches[0]
    record = key_doc.to_dict() or {}
    if record.get("status") != "active":
        raise HTTPException(status_code=403, detail="API key is inactive")
    if service_id not in (record.get("service_ids") or []):
        raise HTTPException(status_code=403, detail="This API key does not include the requested service")
    expires_at = record.get("expires_at")
    if not isinstance(expires_at, datetime):
        raise HTTPException(status_code=403, detail="API key expiry is invalid")
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    if expires_at <= now:
        key_doc.reference.update({"status": "expired", "expired_at": now})
        raise HTTPException(status_code=403, detail="API key has expired")
    quota = int((record.get("quotas_per_day") or {}).get(service_id, 1000))
    day = now.strftime("%Y%m%d")
    usage_ref = db.collection("earthWeatherApiUsage").document(f"{key_doc.id}_{service_id}_{day}")
    from firebase_admin import firestore
    transaction = db.transaction()

    @firestore.transactional
    def _increment(tx: Any) -> int:
        snapshot = usage_ref.get(transaction=tx)
        used = int((snapshot.to_dict() or {}).get("count", 0)) if snapshot.exists else 0
        if used >= quota:
            raise HTTPException(status_code=429, detail="Daily API request quota exceeded")
        tx.set(usage_ref, {
            "key_order_id": key_doc.id, "customer_uid": record["customer_uid"],
            "service_id": service_id, "utc_day": day, "count": used + 1,
            "quota": quota, "updated_at": now,
        }, merge=True)
        return used + 1

    used = _increment(transaction)
    return {
        "used": used, "quota": quota, "remaining": max(0, quota - used),
        "reset_at": (now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)).isoformat(),
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
        _firestore = firestore.client(app, database_id=_firestore_database_id())
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
    for variable in ("NOWPAYMENTS_API_KEY", "NOWPAYMENTS_IPN_SECRET", "FIREBASE_SERVICE_ACCOUNT_JSON", "EARTH_WEATHER_API_KEY_ENCRYPTION_KEY", "CLOUD_FIRESTORE_DATABASE"):
        if not configured(variable):
            missing.append(variable)

    public_url = os.getenv("PUBLIC_BACKEND_URL", "").strip()
    if not public_url.startswith("https://"):
        missing.append("PUBLIC_BACKEND_URL (must be a public HTTPS URL)")
    if not services:
        missing.append("EARTH_WEATHER_API_SERVICES (valid service IDs and USD/day prices)")

    provider_configured = configured("NOWPAYMENTS_API_KEY") and configured("NOWPAYMENTS_IPN_SECRET")
    account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    if account_json:
        try:
            account = json.loads(account_json)
            if not isinstance(account, dict) or not all(account.get(key) for key in ("project_id", "client_email", "private_key")):
                missing.append("FIREBASE_SERVICE_ACCOUNT_JSON (valid Firebase Admin service-account JSON)")
        except json.JSONDecodeError:
            missing.append("FIREBASE_SERVICE_ACCOUNT_JSON (valid Firebase Admin service-account JSON)")

    firestore_ready = _firestore_database_ready() if configured("FIREBASE_SERVICE_ACCOUNT_JSON") else False
    if not firestore_ready:
        missing.append("CLOUD_FIRESTORE_DATABASE (set to the existing Firestore database ID: earthweather, and verify backend access)")

    checkout_configured = not missing
    paid_api_access_ready = _paid_api_access_ready(firestore_ready=firestore_ready)
    launch_blockers = [] if paid_api_access_ready else [
        "Complete the missing configuration above. Paid API key issuance and quota enforcement are implemented but checkout stays closed until every required secret and the service catalogue validate."
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
        "services": [{"id": key, "name": value["name"], "base_price_per_day": value["base_price_per_day"], "price_per_day": value["price_per_day"], "requests_per_day": value["requests_per_day"]}
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
    if not _paid_api_access_ready():
        raise HTTPException(
            status_code=503,
            detail="Paid API checkout is not enabled yet: customer API-key issuance and per-key quota enforcement must be completed first.",
        )
    catalogue = _services()
    unknown = [service_id for service_id in payload.service_ids if service_id not in catalogue]
    if unknown:
        raise HTTPException(status_code=422, detail={"message": "Unknown API service", "service_ids": unknown})
    try:
        total = calculate_checkout_amount(catalogue, payload.service_ids, payload.duration_days)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    selected = [{"id": service_id, **catalogue[service_id]} for service_id in payload.service_ids]
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
        "success_url": f"{frontend_origin}/api/dashboard?payment=success&order_id={order_id}",
        "cancel_url": f"{frontend_origin}/api/dashboard?payment=cancelled&order_id={order_id}",
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
        _issue_or_get_api_key(db, order_id, payment, now, expiry)
        update.update({"status": "finished", "subscription_id": subscription_id, "paid_at": now})
        db.collection("earthWeatherSubscriptions").document(subscription_id).set({
            "subscription_id": subscription_id, "customer_uid": payment["customer_uid"],
            "service_ids": service_ids, "services": payment.get("services", []),
            "duration_days": int(payment["duration_days"]), "status": "active",
            "started_at": now, "expires_at": expiry, "source_order_id": order_id,
            "payment_provider": "nowpayments", "api_key_order_id": order_id,
        }, merge=True)
        for service_id in service_ids:
            db.collection("earthWeatherServiceEntitlements").document(f"{payment['customer_uid']}_{service_id}").set({
                "customer_uid": payment["customer_uid"], "service_id": service_id,
                "status": "active", "expires_at": expiry, "source_order_id": order_id,
                "api_key_order_id": order_id, "updated_at": now,
            }, merge=True)
    ref.update(update)
    return {"received": "true"}


@router.get("/keys")
async def customer_api_keys(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _verified_user(authorization)
    items = _db().collection("earthWeatherApiKeys").where("customer_uid", "==", user["uid"]).stream()
    keys: list[dict[str, Any]] = []
    for item in items:
        record = item.to_dict() or {}
        expires_at = record.get("expires_at")
        if not isinstance(expires_at, datetime):
            continue
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        status = "revoked" if record.get("status") == "revoked" else ("active" if record.get("status") == "active" and expires_at > datetime.now(timezone.utc) else "expired")
        try:
            raw_key = _fernet().decrypt(record["api_key_encrypted"].encode()).decode()
        except (KeyError, InvalidToken, UnicodeDecodeError):
            logger.exception("API key decryption failed for %s", item.id)
            continue
        keys.append({
            "id": item.id, "api_key": raw_key, "key_prefix": record.get("key_prefix"),
            "service_ids": record.get("service_ids", []), "quotas_per_day": record.get("quotas_per_day", {}),
            "status": status, "created_at": record.get("created_at").isoformat() if record.get("created_at") else None,
            "expires_at": expires_at.isoformat(), "duration_days": record.get("duration_days"),
        })
    keys.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    return {"keys": keys}


@router.delete("/keys/{order_id}")
async def revoke_customer_api_key(order_id: str, authorization: str | None = Header(default=None)) -> dict[str, str]:
    user = _verified_user(authorization)
    ref = _db().collection("earthWeatherApiKeys").document(order_id)
    snapshot = ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="API key not found")
    record = snapshot.to_dict() or {}
    if record.get("customer_uid") != user["uid"]:
        raise HTTPException(status_code=404, detail="API key not found")
    if record.get("status") != "revoked":
        ref.update({"status": "revoked", "revoked_at": datetime.now(timezone.utc)})
    return {"order_id": order_id, "status": "revoked"}


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
