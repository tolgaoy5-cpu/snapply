"""Browser-origin guard for the API.

CORS response headers alone do not prevent a cross-origin simple POST from
reaching a route, so reject unwanted Origins before request handlers run.
Requests without an Origin remain available to command-line clients and Stripe.
The Snapply website may call the API (sign-in and checkout from the pricing page).
"""
from __future__ import annotations

import re

EXTENSION_ORIGIN = r'chrome-extension://[a-p]{32}'
WEBSITE_ORIGIN = r'https://(www\.)?snapply\.co\.uk'
ALLOWED_ORIGIN = rf'(?:{EXTENSION_ORIGIN}|{WEBSITE_ORIGIN})'
_ALLOWED = re.compile(rf'\A{ALLOWED_ORIGIN}\Z')


def origin_allowed(origin: str | None) -> bool:
    return origin is None or bool(_ALLOWED.fullmatch(origin))
