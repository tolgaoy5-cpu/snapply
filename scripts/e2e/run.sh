#!/bin/bash
# Weekly live check of the real extension on random UK job application pages (see live.mjs).
# Uses a temporary data directory and a made-up CV on a local test server (port 8797), never the
# user's ~/.job-copilot data. Reports go to ~/.snapply-e2e/reports (outside the repository).
#   ./scripts/e2e/run.sh [count]          random adverts (default 30)
#   ./scripts/e2e/run.sh --urls file.txt  a fixed list of application pages
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
E2E="$HOME/.snapply-e2e"
CHROME="$E2E/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
[ -x "$CHROME" ] || { echo "Chrome for Testing is not installed in $E2E"; exit 1; }
PY="$ROOT/backend/.venv/bin/python"
PORT=8797
DATA="$(mktemp -d -t snapply-e2e-data)"
cleanup() { [ -n "${API_PID:-}" ] && kill "$API_PID" 2>/dev/null || true; rm -rf "$DATA"; }
trap cleanup EXIT

"$PY" "$ROOT/scripts/e2e/make_cv.py" "$DATA/Sam-Taylor-CV.pdf" >/dev/null
(cd "$ROOT/backend" && JOB_COPILOT_DATA_DIR="$DATA" SNAPPLY_MODE= OPENAI_API_KEY= exec "$PY" -m uvicorn server:app --host 127.0.0.1 --port $PORT --log-level warning) &
API_PID=$!
for i in $(seq 1 40); do curl -sf "http://127.0.0.1:$PORT/health" >/dev/null && break; sleep 0.5; done
curl -sf -F "file=@$DATA/Sam-Taylor-CV.pdf;type=application/pdf" "http://127.0.0.1:$PORT/v1/profile/import" >/dev/null \
  || { echo "Test CV import failed"; exit 1; }

ARGS=(--count "${1:-30}")
[ "${1:-}" = "--urls" ] && ARGS=(--urls "$2")
node "$ROOT/scripts/e2e/live.mjs" --chrome "$CHROME" --ext "$ROOT/extension" --api "http://127.0.0.1:$PORT" --out "$E2E/reports" "${ARGS[@]}"
# What the server received from the extension's anonymous fill counts (same numbers real users send).
(cd "$ROOT/backend" && JOB_COPILOT_DATA_DIR="$DATA" "$PY" admin.py fills 1)
