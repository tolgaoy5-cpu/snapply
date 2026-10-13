#!/bin/bash
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/backend"
python3 - <<'PY'
import sys
if sys.version_info < (3, 10):
    raise SystemExit('Snapply requires Python 3.10 or newer.')
PY
if [ ! -d .venv ]; then python3 -m venv .venv; fi
source .venv/bin/activate
CURRENT_REQUIREMENTS="$(shasum -a 256 requirements.txt | awk '{print $1}')"
INSTALLED_REQUIREMENTS="$(cat .venv/job-copilot-requirements.sha256 2>/dev/null || true)"
if [ "$CURRENT_REQUIREMENTS" != "$INSTALLED_REQUIREMENTS" ] || ! python -c 'import fastapi, uvicorn, multipart, reportlab, docx, pypdf' >/dev/null 2>&1; then
  python -m pip install -r requirements.txt
  printf '%s\n' "$CURRENT_REQUIREMENTS" > .venv/job-copilot-requirements.sha256
fi
exec uvicorn server:app --host 127.0.0.1 --port 8787
