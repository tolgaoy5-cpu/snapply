#!/bin/bash
# Gives a complimentary Pro plan to someone who has signed in to Snapply once.
# Usage: ./scripts/grant_pro.sh someone@gmail.com      (revoke: ./scripts/grant_pro.sh --revoke someone@gmail.com)
set -euo pipefail
FLY="$HOME/.fly/bin/flyctl"; command -v flyctl >/dev/null && FLY=flyctl
cmd=grant-pro; [ "${1:-}" = "--revoke" ] && { cmd=revoke-pro; shift; }
[ -n "${1:-}" ] || { echo "Usage: $0 [--revoke] email"; exit 2; }
curl -s -m 40 -o /dev/null https://snapply-api.fly.dev/health   # wake the server if it is idle
"$FLY" ssh console --app snapply-api -C "python admin.py $cmd $1"
