"""Accounts for the hosted (cloud) mode: Google sign-in, session tokens, plans and AI quotas.

Local mode (the default, SNAPPLY_MODE unset) has a single implicit user and keeps using
~/.job-copilot exactly as before. Cloud mode (SNAPPLY_MODE=cloud) requires a session token on
every /v1 request and stores each user's data in its own directory under the data root.
"""
from __future__ import annotations

import base64
import contextvars
import hashlib
import hmac
import json
import os
import tempfile
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Any

_LOCK = RLock()
# Directory of the user the current request belongs to (None = local single-user mode).
current_user_dir: contextvars.ContextVar[Path | None] = contextvars.ContextVar("current_user_dir", default=None)
current_uid: contextvars.ContextVar[str | None] = contextvars.ContextVar("current_uid", default=None)

SESSION_DAYS = 30
PLANS = {
    # AI drafts (answers + cover letters) per calendar month.
    "free": int(os.environ.get("SNAPPLY_FREE_AI_PER_MONTH", "3")),
    "pro": int(os.environ.get("SNAPPLY_PRO_AI_PER_MONTH", "300")),
}


class AuthError(Exception):
    pass


class QuotaError(Exception):
    pass


def cloud_mode() -> bool:
    return os.environ.get("SNAPPLY_MODE", "").strip().lower() == "cloud"


def data_root() -> Path:
    override = os.environ.get("JOB_COPILOT_DATA_DIR")
    return Path(override).expanduser().resolve() if override else Path.home() / ".job-copilot"


def _secret() -> bytes:
    secret = os.environ.get("SNAPPLY_SECRET", "")
    if len(secret) < 32:
        raise AuthError("Server is not configured (SNAPPLY_SECRET must be at least 32 characters)")
    return secret.encode()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def user_id_for(google_sub: str) -> str:
    # Stable, non-reversible id: the Google subject never appears in paths or tokens.
    return hashlib.sha256(("google:" + google_sub).encode()).hexdigest()[:32]


def issue_session(uid: str, now: float | None = None) -> str:
    payload = _b64(json.dumps({"uid": uid, "exp": int((now or time.time()) + SESSION_DAYS * 86400)}).encode())
    sig = _b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{sig}"


def verify_session(token: str, now: float | None = None) -> str:
    try:
        payload, sig = token.split(".", 1)
    except ValueError:
        raise AuthError("Malformed session") from None
    expected = _b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        raise AuthError("Invalid session")
    data = json.loads(_unb64(payload))
    if data.get("exp", 0) < (now or time.time()):
        raise AuthError("Session expired, please sign in again")
    uid = str(data.get("uid") or "")
    if len(uid) != 32 or not all(c in "0123456789abcdef" for c in uid):
        raise AuthError("Invalid session")
    return uid


def _fetch_google_tokeninfo(id_token: str) -> dict[str, Any]:
    # Google validates the signature and expiry; we check audience, issuer and email ourselves.
    url = "https://oauth2.googleapis.com/tokeninfo?" + urllib.parse.urlencode({"id_token": id_token})
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:  # HTTP 400 for an invalid token
        raise AuthError("Google sign-in could not be verified") from e


def verify_google_id_token(id_token: str, fetch=_fetch_google_tokeninfo) -> dict[str, str]:
    client_ids = {c.strip() for c in os.environ.get("GOOGLE_CLIENT_ID", "").split(",") if c.strip()}
    if not client_ids:
        raise AuthError("Server is not configured (GOOGLE_CLIENT_ID)")
    info = fetch(id_token)
    if info.get("aud") not in client_ids:
        raise AuthError("Sign-in token was issued for another app")
    if info.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise AuthError("Sign-in token has an unexpected issuer")
    if str(info.get("email_verified")).lower() != "true" or not info.get("email"):
        raise AuthError("Google account email is not verified")
    if not info.get("sub"):
        raise AuthError("Sign-in token has no subject")
    return {"sub": str(info["sub"]), "email": str(info["email"]).lower(), "name": str(info.get("name") or "")}


def user_dir(uid: str) -> Path:
    return data_root() / "users" / uid


def _account_path(uid: str) -> Path:
    return user_dir(uid) / "account.json"


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix="acct-", suffix=".json", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def load_account(uid: str) -> dict[str, Any]:
    path = _account_path(uid)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def save_account(uid: str, account: dict[str, Any]) -> dict[str, Any]:
    with _LOCK:
        _write_json(_account_path(uid), account)
        return account


def sign_in(google: dict[str, str]) -> tuple[str, dict[str, Any]]:
    uid = user_id_for(google["sub"])
    with _LOCK:
        account = load_account(uid)
        now = datetime.now(timezone.utc).isoformat()
        account.update({"email": google["email"], "name": google.get("name", ""), "last_sign_in": now})
        account.setdefault("created_at", now)
        account.setdefault("plan", "free")
        save_account(uid, account)
    return issue_session(uid), public_account(uid)


def _month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


# Applications filled per calendar month (None = unlimited).
APPLICATION_LIMITS: dict[str, int | None] = {
    "free": int(os.environ.get("SNAPPLY_FREE_APPLICATIONS_PER_MONTH", "5")),
    "pro": None,
}


def application_key(url: str) -> str:
    """One key per job application, so the several pages/steps of one application count once.

    Workday steps share the path up to the job id (".../job/<location>/<title>_<id>/apply/..."),
    Greenhouse/Lever/Ashby share the path up to the job id, TRAC uses one application id.
    """
    parsed = urllib.parse.urlsplit(url.strip())
    host = (parsed.hostname or "").lower()
    path = parsed.path.rstrip("/")
    query = urllib.parse.parse_qs(parsed.query)
    for marker in ("/apply", "/application", "/applyManually", "/autofillWithResume"):
        if marker.lower() in path.lower():
            path = path[: path.lower().index(marker.lower())]
            break
    job = (query.get("gh_jid") or query.get("jobId") or query.get("job") or query.get("vacancy_id") or [""])[0]
    return f"{host}{path}?{job}" if job else f"{host}{path}"


def record_application(uid: str | None, url: str) -> dict[str, Any]:
    """Count a job application against the monthly allowance (no-op in local mode).

    Returns the usage; raises QuotaError when a new application would exceed the plan's limit.
    The same application (any of its pages) is only counted once per month.
    """
    if uid is None:
        return {"counted": False, "applications_used": 0, "applications_limit": None}
    key = application_key(url)
    if not key:
        raise QuotaError("This page has no address Snapply can count.")
    with _LOCK:
        account = load_account(uid)
        usage = account.setdefault("application_usage", {})
        month = _month()
        seen = usage.setdefault(month, [])
        limit = APPLICATION_LIMITS[plan_of(account)]
        new = key not in seen
        if new and limit is not None and len(seen) >= limit:
            raise QuotaError(f"You have used your {limit} free applications this month. "
                             "Upgrade to Pro for unlimited applications.")
        if new:
            seen.append(key)
            for old in sorted(usage)[:-3]:
                usage.pop(old, None)
            save_account(uid, account)
        return {"counted": new, "applications_used": len(seen), "applications_limit": limit}


def plan_of(account: dict[str, Any]) -> str:
    plan = account.get("plan")
    return plan if plan in PLANS else "free"


def public_account(uid: str) -> dict[str, Any]:
    account = load_account(uid)
    plan = plan_of(account)
    used = int((account.get("ai_usage") or {}).get(_month(), 0))
    apps = len((account.get("application_usage") or {}).get(_month(), []))
    return {"email": account.get("email", ""), "name": account.get("name", ""), "plan": plan,
            "ai_used": used, "ai_limit": PLANS[plan], "applications_used": apps,
            "applications_limit": APPLICATION_LIMITS[plan], "subscription_status": account.get("subscription_status", "")}


def consume_ai(uid: str | None, units: int = 1) -> None:
    """Count AI drafts against the user's monthly allowance (no-op in local mode)."""
    if uid is None:
        return
    with _LOCK:
        account = load_account(uid)
        usage = account.setdefault("ai_usage", {})
        month = _month()
        used = int(usage.get(month, 0))
        limit = PLANS[plan_of(account)]
        if used + units > limit:
            raise QuotaError(f"You have used your {limit} AI drafts for this month."
                             + (" Upgrade to Pro for more." if plan_of(account) == "free" else ""))
        usage[month] = used + units
        # Keep only the last few months.
        for key in sorted(usage)[:-3]:
            usage.pop(key, None)
        save_account(uid, account)


def set_plan(uid: str, plan: str, *, status: str = "", customer: str | None = None) -> None:
    with _LOCK:
        account = load_account(uid)
        if not account:
            return
        account["plan"] = plan if plan in PLANS else "free"
        account["subscription_status"] = status
        if customer:
            account["stripe_customer"] = customer
            _write_json(data_root() / "stripe_customers" / f"{_safe(customer)}.json", {"uid": uid})
        save_account(uid, account)


def uid_for_customer(customer: str) -> str | None:
    try:
        return json.loads((data_root() / "stripe_customers" / f"{_safe(customer)}.json").read_text()).get("uid")
    except (OSError, json.JSONDecodeError):
        return None


def _safe(text: str) -> str:
    return "".join(c for c in text if c.isalnum() or c in "_-")[:80]


def delete_user(uid: str) -> None:
    """Remove everything stored for a user (account deletion / GDPR erasure)."""
    import shutil
    with _LOCK:
        customer = load_account(uid).get("stripe_customer")
        shutil.rmtree(user_dir(uid), ignore_errors=True)
        if customer:
            (data_root() / "stripe_customers" / f"{_safe(customer)}.json").unlink(missing_ok=True)


def add_to_waitlist(email: str) -> int:
    """Remember an email address that asked to be told when Snapply is in the Chrome Web Store."""
    path = data_root() / "waitlist.json"
    with _LOCK:
        try:
            entries = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            entries = []
        email = email.strip().lower()
        if all(e.get("email") != email for e in entries) and len(entries) < 50000:
            entries.append({"email": email, "added_at": datetime.now(timezone.utc).isoformat()})
            _write_json(path, entries)  # type: ignore[arg-type]
        return len(entries)
