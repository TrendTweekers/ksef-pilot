# KSeF Pilot

**Polish e-invoices for Shopify**

Automate Polish KSeF e-invoices for B2B Shopify orders. Built by FakturaFlow.

KSeF Pilot is built for everyday Shopify sellers, not accounting teams. The merchant marks B2B orders, keeps buyer NIPs on file, and can either export accountant packets or submit validated invoices to KSeF when live submission is enabled.

## Stack

- Backend: Express.js + TypeScript
- Frontend: React + Shopify Polaris + App Bridge-ready embedded shell
- Database: PostgreSQL + Prisma ORM
- Hosting: Railway
- i18n: react-i18next, Polish default with English switch

## Phase 1 Scope

This scaffold starts the MVP with:

- Shopify OAuth install flow with offline access token storage
- Prisma schema for shops, sessions, B2B order flags, invoices, invoice items, and retry metadata
- AES-256-GCM encryption helpers for merchant KSeF tokens
- KSeF Settings UI for saving and testing a token
- Seller invoice settings for FA(3) generation
- Shopify order import, manual B2B flagging, buyer NIP capture, and draft FA(3) invoice generation
- FA(3) XML validation before submission
- KSeF test-mode submission workflow and live submission adapter using the KSeF API v2 TypeScript client
- Retry queue metadata and a Railway-callable retry worker endpoint
- Linked correction invoice drafts for Shopify refunds or order corrections
- Shopify refund/order edit webhooks that flag existing invoices as needing correction
- Embedded Polaris admin shell with Orders, Settings, and Billing views
- Railway deployment config

The next implementation slices are App Store polish, deeper self-serve KSeF onboarding, and production monitoring refinements.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env` from `.env.example`:

   ```bash
   cp .env.example .env
   ```

3. Generate a 32-byte encryption key:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

4. Create a PostgreSQL database and set `DATABASE_URL`.

5. Create a Shopify app and set:

   - `SHOPIFY_API_KEY`
   - `SHOPIFY_API_SECRET`
   - `SHOPIFY_API_VERSION` (defaults to `2026-04`)
   - `APP_URL`
   - Redirect URL: `${APP_URL}/auth/callback`

6. Run Prisma:

   ```bash
   npm run prisma:migrate
   ```

7. Start development:

   ```bash
   npm run dev
   ```

## Railway Deployment

`railway.json` runs `npm run prisma:deploy` before starting the new process. This keeps schema changes ahead of the deployed code.

Operational health endpoints:

```text
GET /healthz  - process liveness
GET /readyz   - process + database readiness
```

Railway uses `/readyz` as the deploy healthcheck so a release does not become healthy until Postgres is reachable after migrations.

## Compliance Smoke Test

```bash
npm run test:fa3
```

This validates a domestic multi-rate FA(3) invoice with JST/GV buyer flags against the vendored official XSD. Run it after changing invoice mapping logic.

## Shopify Scopes

The app requests the minimal MVP scopes:

```text
read_orders,read_customers,read_products
```

By default the Orders page scans the newest 250 orders visible to Shopify's Admin API. Set `SHOPIFY_ORDER_SCAN_LIMIT` in Railway if a larger store needs a deeper scan. The app caps this at 500 to keep the embedded UI responsive.

KSeF Pilot pre-fills buyer NIP when it can find one in Shopify B2B Company tax registration, company/location external IDs, order metafields, customer metafields, or a remembered buyer profile from earlier manual entry. Supported metafield keys are `custom.nip`, `fakturaflow.nip`, `ksef.nip`, `custom.nip_number`, `custom.vat_id`, `custom.vat_number`, `custom.tax_id`, and `custom.company_nip`.

## Shopify Partner Dashboard Setup

Use these values for the Shopify app before testing on a dev store or submitting for review:

```text
App URL: ${APP_URL}
Allowed redirection URL: ${APP_URL}/auth/callback
Embedded app: enabled
Requested scopes: read_orders,read_customers,read_products
```

Mandatory privacy webhook endpoints:

```text
Customer data request: ${APP_URL}/webhooks/shopify
Customer redact: ${APP_URL}/webhooks/shopify
Shop redact: ${APP_URL}/webhooks/shopify
```

Runtime webhooks are registered during OAuth install:

```text
APP_UNINSTALLED
APP_SUBSCRIPTIONS_UPDATE
REFUNDS_CREATE
ORDERS_EDITED
ORDERS_UPDATED
```

The KSeF Queue tab shows whether these runtime webhooks are installed for the current shop. Privacy webhooks are app-level compliance URLs and should still be configured in the Partner Dashboard.

## App Store URLs

The Railway app serves basic listing/support URLs:

```text
${APP_URL}/privacy
${APP_URL}/terms
${APP_URL}/support
```

Set `SUPPORT_EMAIL` in Railway before App Store submission. Defaults to `support@fakturaflow.pl`.

## Optional Email Delivery

Invoice rows can email the FA(3) XML and PDF preview through Resend. This is optional; downloads and ZIP exports work without it.

```text
RESEND_API_KEY=...
RESEND_FROM_EMAIL=KSeF Pilot <support@fakturaflow.pl>
```

Use a verified Resend sender/domain for `RESEND_FROM_EMAIL`. If `RESEND_API_KEY` is missing, the email endpoint fails closed and the merchant sees a configuration message.

## Safe Dev Store Testing

You can test the current MVP without sending anything real to KSeF:

1. Install the app on a Shopify development store.
2. Create a test product and a fake order in the dev store.
3. Open KSeF Settings and enter fake seller details:
   - Seller NIP: `1234567890`
   - Seller legal name: `Demo Seller Sp. z o.o.`
   - Seller address: `Testowa 1, 00-001 Warszawa`
   - Place of issue: `Warszawa`
4. Leave the KSeF API token empty.
5. Open Orders, mark the order as B2B, enter a fake buyer NIP such as `9876543210`, and generate the invoice.

At this stage, "Generate invoice" creates only a local draft invoice and FA(3) XML in the app database. If KSeF Settings remains in test mode, "Submit to KSeF" creates a local fake KSeF reference number and does not call the government API. The public SVG app icon is available at `public/app-icon.svg` for upload in the Shopify app dashboard.

## Live KSeF Submission

Live submission is disabled by default. To test with a real KSeF test/demo token:

```text
KSEF_ENVIRONMENT=TEST
KSEF_LIVE_SUBMISSION_ENABLED=true
KSEF_WORKER_SECRET=generate-a-long-random-secret
KSEF_WORKER_AUTORUN=false
```

Optional base URL override:

```text
KSEF_API_BASE_URL=https://api-test.ksef.mf.gov.pl
```

When live mode is enabled, "Test connection" authenticates against KSeF if a seller NIP is saved. When a shop then turns off "Safe test mode", KSeF Pilot decrypts the merchant token, authenticates for the seller NIP, opens an online FA(3) session, sends the validated XML, stores the session/invoice reference, and queues retryable failures. Railway can trigger retries by POSTing to:

```text
POST /api/ksef/retry-due
Authorization: Bearer <KSEF_WORKER_SECRET>
```

KSeF processing is asynchronous. After an invoice has a session reference and invoice reference, the app can refresh its government status and store the final KSeF number/UPO:

```text
POST /api/invoices/:invoiceId/refresh-status
GET /api/invoices/:invoiceId/upo.xml
```

Railway can also refresh pending submitted invoices:

```text
POST /api/ksef/refresh-statuses
Authorization: Bearer <KSEF_WORKER_SECRET>
```

Recommended Railway cron setup:

- Every 5 minutes: `POST ${APP_URL}/api/ksef/retry-due?limit=10`
- Every 10 minutes: `POST ${APP_URL}/api/ksef/refresh-statuses?limit=10`
- Header: `Authorization: Bearer <KSEF_WORKER_SECRET>`

Alternative Railway setup: enable the built-in worker loop on a single replica:

```text
KSEF_WORKER_AUTORUN=true
KSEF_WORKER_INTERVAL_SECONDS=300
KSEF_WORKER_BATCH_LIMIT=10
```

When autorun is enabled, the web process checks due retries and pending KSeF status refreshes on the interval above. Keep this off if you use external Railway cron or run multiple replicas.

The app's KSeF Queue tab exposes an automation health panel with due retries, pending status refreshes, failed submissions, and whether `KSEF_WORKER_SECRET` is configured.

## KSeF DEMO Smoke Test

Use this only with a KSeF DEMO/TEST token. It seeds a disposable shop and invoice, validates the FA(3) XML, submits through the real `submitInvoiceToKsef` production path, polls for the KSeF reference, and deletes the test rows unless `--keep` is passed.

Required local env:

```text
KSEF_LIVE_SUBMISSION_ENABLED=true
KSEF_ENVIRONMENT=DEMO
KSEF_API_BASE_URL=https://api-demo.ksef.mf.gov.pl
KSEF_TEST_TOKEN=<put the DEMO token in .env, not chat>
KSEF_TEST_NIP=5252763266
ENCRYPTION_KEY=<base64 32-byte key>
```

Run:

```bash
npm run smoke:ksef
```

The script refuses to run if the target looks like production KSeF.

## Shopify Managed Pricing

KSeF Pilot does not create charges inside the app. Merchants are sent to Shopify's Managed Pricing page, and the app only reads the resulting plan state from Shopify subscription webhooks.

- Free: 5 invoices/month
- Basic: 50 invoices/month
- Pro: 200 invoices/month
- Unlimited: unlimited invoices

If a paid subscription is cancelled, declined, expired, or otherwise not active, KSeF Pilot falls back to the Free limit until Shopify sends an active subscription update again. Keep the `APP_SUBSCRIPTIONS_UPDATE` webhook registered so Railway receives plan changes immediately.

The default Managed Pricing URL is:

```text
https://admin.shopify.com/store/{store}/charges/{SHOPIFY_APP_HANDLE}/pricing_plans
```

If Shopify shows a 404 for the plan picker, the app handle in Railway does not match Shopify's billing route for this app. Set `SHOPIFY_MANAGED_PRICING_URL_TEMPLATE` to the exact working route from Shopify. The template supports `{store}`, `{store_handle}`, `{shop}`, `{shop_domain}`, and `{app_handle}`.

Billing is updated from the `APP_SUBSCRIPTIONS_UPDATE` webhook. As a safety net, Railway can reconcile active Shopify subscriptions daily:

```text
POST /api/billing/reconcile?limit=50
Authorization: Bearer <KSEF_WORKER_SECRET>
```

## Critical Compliance Notes

- KSeF tokens must remain encrypted at rest.
- FA(3) XML must be validated against the official XSD before any KSeF API submission.
- Phase 1 supports domestic B2B invoices with 23%, 8%, and 5% VAT rates. PLN invoices are generated directly. Foreign-currency domestic invoices use cached NBP Table A rates and include VAT-in-PLN fields (`P_14_xW`) plus `KursWalutyZ`.
- The NBP lookup endpoint is `/api/nbp/rate?currency=EUR&date=YYYY-MM-DD`; it uses the last available published rate before the selected date and stores the exact table/rate used on the invoice.
- 0%, exempt, WDT/export, reverse charge, split payment, and OSS are intentionally blocked until implemented safely.
- The app reads Shopify orders only and must not modify orders.
- KSeF submission failures should be retried with exponential backoff.
