"""Per-user / per-address request limits for the hosted API (one machine, so in memory is enough).

Normal use never comes close; the limits stop scripted abuse of the paid AI endpoints, sign-in
and the public waitlist.
"""
from __future__ import annotations

import time
from collections import deque
from threading import Lock

# path prefix -> (max requests, window seconds, keyed by 'user' or 'ip')
RULES: list[tuple[str, int, int, str]] = [
    ("/v1/auth/google", 20, 3600, "ip"),
    ("/v1/waitlist", 5, 3600, "ip"),
    ("/v1/fields/classify", 30, 3600, "user"),
    ("/v1/answers/generate", 10, 60, "user"),
    ("/v1/answers/batch", 3, 60, "user"),
    ("/v1/cover-letter/generate", 6, 60, "user"),
    ("/v1/profile/import", 10, 3600, "user"),
    ("/v1/reports", 20, 86400, "user"),
    ("/v1/", 300, 60, "user"),
]
_hits: dict[tuple[str, str], deque] = {}
_lock = Lock()


def _rule(path: str):
    return next((r for r in RULES if path.startswith(r[0])), None)


def check(path: str, user: str | None, ip: str, now: float | None = None) -> int:
    """Return 0 if allowed, otherwise the number of seconds to wait."""
    rule = _rule(path)
    if not rule:
        return 0
    prefix, limit, window, by = rule
    who = (user if by == "user" and user else "ip:" + (ip or "unknown"))
    now = now or time.time()
    key = (prefix, who)
    with _lock:
        q = _hits.setdefault(key, deque())
        while q and q[0] <= now - window:
            q.popleft()
        if len(q) >= limit:
            return max(1, int(q[0] + window - now) + 1)
        q.append(now)
        # Keep memory bounded: drop idle keys now and then.
        if len(_hits) > 50000:
            for k in [k for k, v in _hits.items() if not v or v[-1] <= now - 86400][:10000]:
                _hits.pop(k, None)
    return 0


def client_ip(headers) -> str:
    return (headers.get("fly-client-ip") or (headers.get("x-forwarded-for") or "").split(",")[0]).strip()


def reset() -> None:
    with _lock:
        _hits.clear()
