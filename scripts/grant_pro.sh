#!/bin/bash
# Gives a complimentary Pro plan to someone who has signed in to Snapply once.
# Usage: ./scripts/grant_pro.sh someone@gmail.com      (revoke: ./scripts/grant_pro.sh --revoke someone@gmail.com)
set -euo pipefail
FLY="$HOME/.fly/bin/flyctl"; command -v flyctl >/dev/null && FLY=flyctl
cmd=grant-pro; [ "${1:-}" = "--revoke" ] && { cmd=revoke-pro; shift; }
[ -n "${1:-}" ] || { echo "Usage: $0 [--revoke] email"; exit 2; }
curl -s -m 40 -o /dev/null https://snapply-api.fly.dev/health   # wake the server if it is idle
# Run as the server's own user: files written by root are unreadable to the server, which then treats
# the account as new and overwrites it as Free on the next sign-in.
"$FLY" ssh console --app snapply-api -C "su snapply -s /bin/sh -c 'cd /app && python admin.py $cmd $1'"
