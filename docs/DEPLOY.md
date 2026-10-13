# Deploying the hosted Snapply API

The same backend runs in two modes:

| | Local (default) | Hosted (`SNAPPLY_MODE=cloud`) |
|---|---|---|
| Sign-in | none | Google (OpenID id_token → Snapply session, 30 days) |
| Data | `~/.job-copilot/` | `/data/users/<id>/` per user (id = hash of the Google subject) |
| Legal/personal answers, referees | backend | **browser only** (`chrome.storage.local`), rejected by the API |
| AI drafts | unlimited | Free 5 / Pro 300 per month (`SNAPPLY_FREE_AI_PER_MONTH`, `SNAPPLY_PRO_AI_PER_MONTH`) |
| Payments | — | Pro £9.99/month or £79/year: Stripe Checkout + Customer Portal, plan set by signed webhooks |

## One-time accounts (owner)

1. **Fly.io** — create an account, install `flyctl`.
2. **Google Cloud** — OAuth consent screen (External, scopes `openid email profile`), then an OAuth client
   of type *Web application* with redirect URI `https://<extension-id>.chromiumapp.org/`.
3. **Stripe** — test mode first: a Product "Snapply Pro" with two GBP Prices, £9.99 monthly and £79 yearly; a webhook endpoint
   `https://<api-host>/v1/billing/webhook` for `checkout.session.completed` and
   `customer.subscription.created|updated|deleted`; enable the Customer Portal.
4. **OpenAI** — an API key for the service (with a monthly spend limit).

## Deploy

```bash
fly launch --no-deploy --copy-config        # uses fly.toml (app snapply-api, region lhr)
fly volumes create snapply_data --region lhr --size 1
fly secrets set SNAPPLY_SECRET="$(openssl rand -hex 32)" GOOGLE_CLIENT_ID=... OPENAI_API_KEY=... \
  STRIPE_SECRET_KEY=sk_test_... STRIPE_PRICE_ID=price_... STRIPE_PRICE_ID_YEARLY=price_... STRIPE_WEBHOOK_SECRET=whsec_...
fly deploy
curl https://snapply-api.fly.dev/health      # {"auth":"google", ...}
```

In the extension: *Advanced → Server → Snapply cloud*, then *Sign in with Google*.

## Before public launch

- Fixed extension id (`key` in the manifest, or the Chrome Web Store id) so the OAuth redirect URI is stable.
- Privacy policy and terms pages; data deletion is `DELETE /v1/me`.
- Volume snapshots (Fly takes daily snapshots; keep 5+ days).
