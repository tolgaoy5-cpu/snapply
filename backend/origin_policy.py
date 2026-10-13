"""Browser-origin guard for the local API.

CORS response headers alone do not prevent a cross-origin simple POST from
reaching a route, so reject unwanted Origins before request handlers run.
Requests without an Origin remain available to local command-line clients.
"""
from __future__ import annotations

import re

EXTENSION_ORIGIN = r'chrome-extension://[a-p]{32}'
_EXTENSION_ORIGIN = re.compile(rf'\A{EXTENSION_ORIGIN}\Z')


def origin_allowed(origin: str | None) -> bool:
    return origin is None or bool(_EXTENSION_ORIGIN.fullmatch(origin))
