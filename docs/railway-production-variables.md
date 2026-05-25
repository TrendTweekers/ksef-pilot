# Railway Production Variable Review

Review this before applying Railway variable changes or deploying production.

## Current Risk From The DEMO Smoke Test

The KSeF DEMO smoke test should be local-only. Do not apply pending Railway changes if they switch the production Shopify app into DEMO mode.

Reject or revert these values in Railway production unless you intentionally want the installed Shopify app to use the DEMO KSeF API:

```text
KSEF_LIVE_SUBMISSION_ENABLED=true
KSEF_ENVIRONMENT=DEMO
KSEF_API_BASE_URL=https://api-demo.ksef.mf.gov.pl
KSEF_TEST_TOKEN=...
KSEF_TEST_NIP=5252763266
```

`KSEF_TEST_TOKEN` should not be stored in Railway production. It belongs in local `.env` only for `npm run smoke:ksef`.

## Production-Safe Defaults Before App Store Review

Use this posture while the app is connected to real Shopify dev stores but not yet intentionally doing real KSeF submissions:

```text
KSEF_LIVE_SUBMISSION_ENABLED=false
KSEF_ENVIRONMENT=PROD
KSEF_API_BASE_URL=
KSEF_TEST_TOKEN=
KSEF_TEST_NIP=
```

With `KSEF_LIVE_SUBMISSION_ENABLED=false`, merchants can still create drafts, validate FA(3), export accountant ZIP files, and use local test submissions without calling KSeF.

## Required Production Variables

These must be present and non-placeholder:

```text
APP_URL=https://<railway-app-domain>
DATABASE_URL=<Railway Postgres URL>
ENCRYPTION_KEY=<base64 encoded 32-byte key>
SHOPIFY_API_KEY=<Shopify app client ID>
VITE_SHOPIFY_API_KEY=<same Shopify app client ID>
SHOPIFY_API_SECRET=<Shopify app client secret>
SHOPIFY_SCOPES=read_orders,read_customers,read_products
SHOPIFY_APP_HANDLE=ksef-pilot
SUPPORT_EMAIL=support@fakturaflow.pl
```

Optional but recommended before public review:

```text
KSEF_WORKER_SECRET=<random long secret>
KSEF_WORKER_AUTORUN=true
KSEF_WORKER_INTERVAL_SECONDS=300
KSEF_WORKER_BATCH_LIMIT=10
TELEGRAM_BOT_TOKEN=<bot token>
TELEGRAM_CHAT_ID=<chat id>
RESEND_API_KEY=<resend key>
RESEND_FROM_EMAIL=KSeF Pilot <support@fakturaflow.pl>
SHOPIFY_REVIEW_URL=<Shopify App Store review URL after listing exists>
SHOPIFY_MANAGED_PRICING_URL_TEMPLATE=https://admin.shopify.com/store/{store}/charges/{app_handle}/pricing_plans
```

## Deploy Checklist

1. Confirm `KSEF_TEST_TOKEN` is empty or absent in Railway production.
2. Confirm `KSEF_LIVE_SUBMISSION_ENABLED=false` until live KSeF merchant testing is intentionally enabled.
3. Confirm `APP_URL` matches the Railway public app URL and the Shopify app URL.
4. Confirm the Shopify Partner Dashboard redirect URL is `${APP_URL}/auth/callback`.
5. Confirm `railway.json` still has `preDeployCommand: npm run prisma:deploy`.
6. Deploy only after the pending variable diff matches this document.
