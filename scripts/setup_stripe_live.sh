#!/bin/bash
# One-time switch of the hosted API to live Stripe payments. Asks for the live secret key (not
# printed), then in that Stripe account: creates (or reuses) the "Snapply Pro" product with its
# £3.99/week, £9.99/month and £24.99/3 months prices, a customer portal configuration (cancel at period end, update
# card, invoices), and the webhook endpoint for the API; finally stores the key, webhook secret and
# price ids as Fly secrets. Safe to run again: existing prices are found by their lookup keys.
set -euo pipefail
APP="${APP:-snapply-api}"
API_URL="${API_URL:-https://snapply-api.fly.dev}"
SITE="${SITE:-https://snapply.co.uk}"
FLY="$HOME/.fly/bin/flyctl"; command -v flyctl >/dev/null && FLY=flyctl

read -r -s -p "Stripe LIVE secret key (sk_live_...): " SK; echo
SK="$(printf '%s' "$SK" | tr -d '[:space:]')"
case "$SK" in sk_live_*|rk_live_*) ;; *) echo "This needs the live key (sk_live_...). Test keys go in set_server_secrets.sh."; exit 1;; esac

stripe() { curl -s -u "$SK:" "$@"; }
field() { python3 -c "import json,sys; d=json.load(sys.stdin); v=d$1; print(v if v is not None else '')" 2>/dev/null; }
fail_if_error() { python3 -c "import json,sys; d=json.load(sys.stdin); e=d.get('error'); sys.exit('Stripe error: '+e.get('message','')) if e else print(json.dumps(d))"; }

price_for() { # lookup_key amount interval interval_count product
  local id; id=$(stripe -G https://api.stripe.com/v1/prices -d "lookup_keys[]=$1" -d active=true | field "['data'][0]['id'] if d.get('data') else None")
  if [ -z "$id" ]; then
    id=$(stripe https://api.stripe.com/v1/prices -d "product=$5" -d currency=gbp -d "unit_amount=$2" \
      -d "recurring[interval]=$3" -d "recurring[interval_count]=$4" -d "lookup_key=$1" -d tax_behavior=inclusive | fail_if_error | field "['id']")
  fi
  echo "$id"
}

PRODUCT=$(stripe -G https://api.stripe.com/v1/products/search --data-urlencode "query=metadata['snapply']:'pro'" | field "['data'][0]['id'] if d.get('data') else None")
if [ -z "$PRODUCT" ]; then
  PRODUCT=$(stripe https://api.stripe.com/v1/products -d "name=Snapply Pro" -d "metadata[snapply]=pro" \
    -d "description=Unlimited applications, 300 AI drafts a month and cover letters." | fail_if_error | field "['id']")
fi
WEEK=$(price_for snapply_pro_weekly 399 week 1 "$PRODUCT")
MONTH=$(price_for snapply_pro_monthly 999 month 1 "$PRODUCT")
QUARTER=$(price_for snapply_pro_quarterly 2499 month 3 "$PRODUCT")
echo "Product $PRODUCT · weekly $WEEK · monthly $MONTH · 3-monthly $QUARTER"

# Customer portal: cancel at period end, update payment method, invoice history, switch between plan lengths.
stripe https://api.stripe.com/v1/billing_portal/configurations \
  -d "business_profile[privacy_policy_url]=$SITE/privacy" -d "business_profile[terms_of_service_url]=$SITE/terms" \
  -d "features[subscription_cancel][enabled]=true" -d "features[subscription_cancel][mode]=at_period_end" \
  -d "features[payment_method_update][enabled]=true" -d "features[invoice_history][enabled]=true" \
  -d "features[subscription_update][enabled]=true" -d "features[subscription_update][default_allowed_updates][]=price" \
  -d "features[subscription_update][products][0][product]=$PRODUCT" \
  -d "features[subscription_update][products][0][prices][]=$WEEK" -d "features[subscription_update][products][0][prices][]=$MONTH" -d "features[subscription_update][products][0][prices][]=$QUARTER" \
  -d "default_return_url=$SITE" | fail_if_error >/dev/null
echo "Customer portal configured."

HOOK_URL="$API_URL/v1/billing/webhook"
existing=$(stripe -G https://api.stripe.com/v1/webhook_endpoints -d limit=100 | python3 -c "import json,sys; d=json.load(sys.stdin); print(next((e['id'] for e in d.get('data',[]) if e.get('url')=='$HOOK_URL'),''))")
[ -n "$existing" ] && stripe -X DELETE "https://api.stripe.com/v1/webhook_endpoints/$existing" >/dev/null
WHSEC=$(stripe https://api.stripe.com/v1/webhook_endpoints -d "url=$HOOK_URL" -d "description=Snapply API" \
  -d "enabled_events[]=checkout.session.completed" -d "enabled_events[]=customer.subscription.created" \
  -d "enabled_events[]=customer.subscription.updated" -d "enabled_events[]=customer.subscription.deleted" | fail_if_error | field "['secret']")
echo "Webhook endpoint ready: $HOOK_URL"

"$FLY" secrets set --app "$APP" "STRIPE_SECRET_KEY=$SK" "STRIPE_WEBHOOK_SECRET=$WHSEC" "STRIPE_PRICE_ID_WEEKLY=$WEEK" "STRIPE_PRICE_ID=$MONTH" "STRIPE_PRICE_ID_QUARTERLY=$QUARTER" >/dev/null
echo "Live payments are on. Values were not printed. The launch coupon is created automatically on the first checkout."
