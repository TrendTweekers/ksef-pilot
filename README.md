# KSeF Pilot

**Polish e-invoices for Shopify**

Automate Polish KSeF e-invoices for B2B Shopify orders. Built by FakturaFlow.

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
- Embedded Polaris admin shell with Orders, Settings, and Billing views
- Railway deployment config

The next implementation slices are Shopify order import/manual B2B flagging, FA(3) XML generation with official XSD validation, KSeF submission retries, PDF/QR output, corrections, and billing enforcement.

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

## Critical Compliance Notes

- KSeF tokens must remain encrypted at rest.
- FA(3) XML must be validated against the official XSD before any KSeF API submission.
- Phase 1 supports only standard Polish B2B VAT at 23%.
- The app reads Shopify orders only and must not modify orders.
- KSeF submission failures should be retried with exponential backoff.
