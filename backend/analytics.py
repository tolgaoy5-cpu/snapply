"""Anonymous daily counts for the funnel (site visits → installs → sign-ups → Pro). No cookies,
no identifiers: each event only adds 1 to a counter for its day, name and source."""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from threading import RLock

from accounts import _write_json, data_root

EVENTS = {"site_visit", "add_to_chrome_click", "get_pro_click", "waitlist_join", "welcome_page",
          "signup", "checkout_started", "pro_converted", "referral_rewarded", "guide_visit"}
_LOCK = RLock()


def _clean_source(source: str) -> str:
    return re.sub(r"[^a-z0-9_.-]", "", str(source or "").lower())[:40] or "direct"


def record(name: str, source: str = "") -> bool:
    if name not in EVENTS:
        return False
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    path = data_root() / "analytics" / f"{day}.json"
    with _LOCK:
        try:
            counts = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            counts = {}
        bucket = counts.setdefault(name, {})
        key = _clean_source(source)
        bucket[key] = int(bucket.get(key, 0)) + 1
        _write_json(path, counts)
    return True


def summary(days: int = 30) -> dict:
    totals: dict = {}
    today = datetime.now(timezone.utc).date()
    for i in range(days):
        day = (today - timedelta(days=i)).strftime("%Y-%m-%d")
        try:
            counts = json.loads((data_root() / "analytics" / f"{day}.json").read_text())
        except (OSError, json.JSONDecodeError):
            continue
        for name, by_source in counts.items():
            for source, n in by_source.items():
                totals.setdefault(name, {}).setdefault(source, 0)
                totals[name][source] += n
    return totals


# Fill quality per site: after each "Fill this page" the extension sends counts only (no values,
# no labels, no page path, no user id), so sites where Snapply fills poorly can be found and fixed.
FILL_FIELDS = ("detected", "filled", "required_total", "required_missing", "cv_slots", "cv_attached")


def _clean_host(host: str) -> str:
    host = re.sub(r"[^a-z0-9.-]", "", str(host or "").lower())
    return (host[4:] if host.startswith("www.") else host)[:80] or "unknown"


def record_fill(host: str, ats: str = "", **counts: int) -> None:
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    path = data_root() / "fills" / f"{day}.json"
    with _LOCK:
        try:
            data = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            data = {}
        row = data.setdefault(_clean_host(host), {"fills": 0, **{k: 0 for k in FILL_FIELDS}})
        row["fills"] += 1
        for k in FILL_FIELDS:
            row[k] = row.get(k, 0) + max(0, min(500, int(counts.get(k) or 0)))
        if ats:
            row["ats"] = _clean_source(ats)
        _write_json(path, data)


def fill_summary(days: int = 7) -> dict:
    totals: dict = {}
    today = datetime.now(timezone.utc).date()
    for i in range(days):
        day = (today - timedelta(days=i)).strftime("%Y-%m-%d")
        try:
            data = json.loads((data_root() / "fills" / f"{day}.json").read_text())
        except (OSError, json.JSONDecodeError):
            continue
        for host, row in data.items():
            t = totals.setdefault(host, {"fills": 0, **{k: 0 for k in FILL_FIELDS}})
            t["fills"] += row.get("fills", 0)
            for k in FILL_FIELDS:
                t[k] += row.get(k, 0)
            t["ats"] = row.get("ats", t.get("ats", ""))
    return totals
