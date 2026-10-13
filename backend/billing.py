"""Stripe subscriptions for the hosted mode, using Stripe's REST API directly (no SDK).

Configuration (environment): STRIPE_SECRET_KEY, STRIPE_PRICE_ID, STRIPE_WEBHOOK_SECRET,
SNAPPLY_PUBLIC_URL (where Checkout returns to). Test-mode keys (sk_test_...) work unchanged.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
import urllib.parse
import urllib.request
from typing import Any

import accounts

API = "https://api.stripe.com/v1"
ACTIVE = {"active", "trialing"}


class BillingError(Exception):
    pass


def configured() -> bool:
    return bool(os.environ.get("STRIPE_SECRET_KEY") and os.environ.get("STRIPE_PRICE_ID"))


def _post(path: str, fields: dict[str, str]) -> dict[str, Any]:
    key = os.environ.get("STRIPE_SECRET_KEY", "")
    if not key:
        raise BillingError("Payments are not configured yet")
    req = urllib.request.Request(API + path, data=urllib.parse.urlencode(fields).encode(),
                                 headers={"Authorization": f"Bearer {key}"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            message = json.loads(e.read()).get("error", {}).get("message", "")
        except Exception:
            message = ""
        raise BillingError(message or f"Stripe error {e.code}") from None


def _return_url() -> str:
    return os.environ.get("SNAPPLY_PUBLIC_URL", "https://snapply.co.uk").rstrip("/")


def checkout_url(uid: str) -> str:
    account = accounts.load_account(uid)
    fields = {
        "mode": "subscription",
        "line_items[0][price]": os.environ.get("STRIPE_PRICE_ID", ""),
        "line_items[0][quantity]": "1",
        "client_reference_id": uid,
        "subscription_data[metadata][uid]": uid,
        "allow_promotion_codes": "true",
        "success_url": _return_url() + "/thanks",
        "cancel_url": _return_url() + "/pricing",
    }
    if account.get("stripe_customer"):
        fields["customer"] = account["stripe_customer"]
    elif account.get("email"):
        fields["customer_email"] = account["email"]
    return _post("/checkout/sessions", fields)["url"]


def portal_url(uid: str) -> str:
    customer = accounts.load_account(uid).get("stripe_customer")
    if not customer:
        raise BillingError("No subscription yet")
    return _post("/billing_portal/sessions", {"customer": customer, "return_url": _return_url()})["url"]


def verify_webhook(body: bytes, header: str, secret: str | None = None, tolerance: int = 300, now: float | None = None) -> dict[str, Any]:
    secret = secret or os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    if not secret:
        raise BillingError("Webhook secret is not configured")
    parts: dict[str, list[str]] = {}
    for item in (header or "").split(","):
        k, _, v = item.partition("=")
        parts.setdefault(k.strip(), []).append(v.strip())
    try:
        ts = int(parts["t"][0])
    except (KeyError, ValueError):
        raise BillingError("Bad signature header") from None
    expected = hmac.new(secret.encode(), f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected, sig) for sig in parts.get("v1", [])):
        raise BillingError("Signature mismatch")
    if abs((now or time.time()) - ts) > tolerance:
        raise BillingError("Webhook timestamp outside tolerance")
    return json.loads(body)


def handle_event(event: dict[str, Any]) -> str:
    kind = event.get("type", "")
    obj = (event.get("data") or {}).get("object") or {}
    if kind == "checkout.session.completed":
        uid = obj.get("client_reference_id")
        if uid and accounts.load_account(uid):
            accounts.set_plan(uid, "pro", status="active", customer=obj.get("customer"))
            return "upgraded"
    elif kind in ("customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"):
        customer = obj.get("customer") or ""
        uid = (obj.get("metadata") or {}).get("uid") or accounts.uid_for_customer(customer)
        if uid and accounts.load_account(uid):
            status = obj.get("status", "")
            active = kind != "customer.subscription.deleted" and status in ACTIVE
            accounts.set_plan(uid, "pro" if active else "free", status=status, customer=customer or None)
            return "pro" if active else "free"
    return "ignored"
