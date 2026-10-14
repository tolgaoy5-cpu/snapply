#!/bin/bash
# Stores the hosted API's secret keys on Fly.io without printing them.
# Asks for the Stripe secret key, creates (or reuses) the Stripe webhook endpoint for the API and
# saves its signing secret, and optionally sets the OpenAI key. Leave an answer empty to skip it.
set -euo pipefail
APP="${APP:-snapply-api}"
API_URL="${API_URL:-https://snapply-api.fly.dev}"
FLY="$HOME/.fly/bin/flyctl"; command -v flyctl >/dev/null && FLY=flyctl
HOOK_URL="$API_URL/v1/billing/webhook"
EVENTS=(checkout.session.completed customer.subscription.created customer.subscription.updated customer.subscription.deleted)

secrets=()
read -r -s -p "Stripe secret key (sk_test_... or sk_live_..., Enter to skip): " SK; echo
SK="$(printf '%s' "$SK" | tr -d '[:space:]')"
if [ -n "$SK" ]; then
  case "$SK" in sk_test_*|sk_live_*|rk_test_*|rk_live_*) ;; *) echo "That does not look like a Stripe secret key (it should start with sk_test_). Run the script again."; exit 1;; esac
  existing=$(curl -s -u "$SK:" "https://api.stripe.com/v1/webhook_endpoints?limit=100" |
    python3 -c "import json,sys; d=json.load(sys.stdin); print(next((e['id'] for e in d.get('data',[]) if e.get('url')=='$HOOK_URL'),''))")
  if [ -n "$existing" ]; then
    # A signing secret is only returned at creation, so replace the old endpoint.
    curl -s -u "$SK:" -X DELETE "https://api.stripe.com/v1/webhook_endpoints/$existing" >/dev/null
  fi
  args=(-d "url=$HOOK_URL" -d "description=Snapply API")
  for e in "${EVENTS[@]}"; do args+=(-d "enabled_events[]=$e"); done
  WHSEC=$(curl -s -u "$SK:" "${args[@]}" https://api.stripe.com/v1/webhook_endpoints |
    python3 -c "
import json, sys
d = json.load(sys.stdin)
if not d.get('secret'):
    sys.exit('Stripe error: ' + str(d.get('error', {}).get('message')))
print(d['secret'])")
  secrets+=("STRIPE_SECRET_KEY=$SK" "STRIPE_WEBHOOK_SECRET=$WHSEC")
  echo "Stripe webhook endpoint ready: $HOOK_URL"
fi

read -r -s -p "OpenAI API key (sk-..., Enter to skip): " OK; echo
OK="$(printf '%s' "$OK" | tr -d '[:space:]')"
[ -n "$OK" ] && secrets+=("OPENAI_API_KEY=$OK")

read -r -p "Google OAuth client ID (...apps.googleusercontent.com, Enter to skip): " GID
[ -n "$GID" ] && secrets+=("GOOGLE_CLIENT_ID=$GID")

if [ ${#secrets[@]} -eq 0 ]; then echo "Nothing to set."; exit 0; fi
"$FLY" secrets set --app "$APP" "${secrets[@]}" >/dev/null
echo "Saved ${#secrets[@]} secret(s) on $APP. Values were not printed."
"$FLY" secrets list --app "$APP" | awk 'NR==1 || /STRIPE|OPENAI|GOOGLE|SNAPPLY/ {print $1}'
