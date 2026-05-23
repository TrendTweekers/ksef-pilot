# KSeF Pilot

**Polish e-invoices for Shopify**

Automate Polish KSeF e-invoices for B2B Shopify orders. Built by FakturaFlow.

KSeF Pilot is built for everyday Shopify sellers, not accounting teams. The merchant marks B2B orders, keeps buyer NIPs on file, and can either export accountant packets or submit validated invoices to KSeF when live submission is enabled.

## Stack

- Backend: Express.js + TypeScript
- Frontend: React + Shopify Polaris + App Bridge-ready embedded shell
- Database: PostgreSQL + Prisma ORM
- Hosting: Railway
- i18n: react-i18next, English default and Polish ready

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
- Embedded Polaris admin shell with Orders, Settings, and Billing views
- Railway deployment config

The next implementation slices are KSeF status/UPO refresh, production token validation hardening, corrections, and final App Store polish.

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

## Shopify Scopes

The app requests the minimal MVP scopes:

```text
read_orders,read_customers,read_products
```

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

## Critical Compliance Notes

- KSeF tokens must remain encrypted at rest.
- FA(3) XML must be validated against the official XSD before any KSeF API submission.
- Phase 1 supports only standard Polish B2B VAT at 23%.
- The app reads Shopify orders only and must not modify orders.
- KSeF submission failures should be retried with exponential backoff.
