# Shopify App Store Review Prep

KSeF Pilot is now past the core technical gate: `npm run smoke:ksef` has proven the real KSeF DEMO path from encrypted token to online session, FA(3) submission, KSeF reference, and UPO retrieval.

## Positioning

App name:

```text
KSeF Pilot
```

Tagline:

```text
Polish e-invoices for Shopify
```

Short description:

```text
Automate Polish KSeF e-invoices for B2B Shopify orders. Built by FakturaFlow.
```

Primary user:

```text
Everyday Shopify sellers who need Polish B2B KSeF compliance without using an accounting cockpit.
```

Do not position it as an accountant-only product. Accountants are downstream reviewers through XML/PDF/ZIP export and optional email delivery.

## Functional Review Notes

What the reviewer should be able to test without real KSeF submission:

1. Install the embedded app on a Shopify dev store.
2. Open KSeF Settings.
3. Save seller identity fields.
4. Refresh Shopify orders.
5. Mark an order as B2B and enter a buyer NIP.
6. Generate a draft FA(3) invoice.
7. Validate FA(3).
8. Preview/download XML.
9. Download PDF.
10. Export weekly/monthly ZIP.
11. View Billing and open Shopify Managed Pricing with top-frame navigation.

Live KSeF submission should stay disabled for Shopify review unless you intentionally provide a DEMO KSeF token and reviewer instructions. The app must clearly explain that test mode/local drafts do not send to the government.

## Required Shopify Partner Dashboard Settings

App setup:

```text
App URL: ${APP_URL}
Allowed redirection URL: ${APP_URL}/auth/callback
Embedded app: enabled
Scopes: read_orders,read_customers,read_products
```

App-level privacy webhooks:

```text
Customer data request: ${APP_URL}/webhooks/shopify
Customer redact: ${APP_URL}/webhooks/shopify
Shop redact: ${APP_URL}/webhooks/shopify
```

Runtime webhooks registered by OAuth install:

```text
APP_UNINSTALLED
APP_SUBSCRIPTIONS_UPDATE
REFUNDS_CREATE
ORDERS_EDITED
ORDERS_UPDATED
```

Managed Pricing:

```text
Free: 5 invoices/month
Basic: 50 invoices/month
Pro: 200 invoices/month
Unlimited: unlimited
```

The app must not create charges itself. It sends merchants to Shopify Managed Pricing and reads subscription updates from Shopify.

## Data Protection Answers

Use these truths consistently in Shopify review forms:

- The app processes the minimum personal data required to generate B2B invoices: shop domain, Shopify offline token, order IDs, buyer name, buyer NIP, invoice totals, generated FA(3) XML, KSeF status, and encrypted KSeF token if connected.
- Data is used only for invoice generation, export, KSeF submission/status, billing limits, and support.
- KSeF tokens are encrypted at rest with AES-256-GCM.
- Traffic is encrypted in transit by Railway/HTTPS.
- The app reads Shopify orders and never modifies them.
- Customer helper profiles used for NIP prefill are deleted on `customers/redact`.
- Shops are deleted on `shop/redact`.
- Test and production data should be separated by store/environment.

## URLs For Review

The app serves:

```text
${APP_URL}/privacy
${APP_URL}/terms
${APP_URL}/support
${APP_URL}/healthz
${APP_URL}/readyz
```

Before submission, verify these URLs load over HTTPS from the deployed Railway domain.

## Reviewer Test Data

Use fake/dev-store data for Shopify workflow review:

```text
Seller NIP: 1234567890
Seller name: Demo Seller Sp. z o.o.
Seller address: Testowa 1, 00-001 Warszawa
Place of issue: Warszawa
Buyer NIP: 9876543210
```

For real KSeF DEMO smoke testing only:

```text
KSEF_TEST_NIP=5252763266
KSEF_API_BASE_URL=https://api-demo.ksef.mf.gov.pl
```

Do not paste KSeF tokens into review notes, chat, GitHub, or screenshots.

## Assets Still Needed

- Upload the `public/app-icon.svg`-derived PNG/JPG icon in Shopify Partner Dashboard.
- App Store screenshots showing:
  - Orders with B2B/NIP workflow
  - Invoice drafts and XML/PDF export
  - KSeF Settings with test-mode explanation
  - Billing page with Managed Pricing CTA
  - KSeF Queue/status page
- Short demo video or reviewer instructions for the end-to-end dev store flow.

## Blockers Before Submission

- Railway production variables must not contain local DEMO smoke settings. See `docs/railway-production-variables.md`.
- Confirm `SHOPIFY_MANAGED_PRICING_URL_TEMPLATE` opens the hosted Shopify plan picker instead of a 404.
- Confirm privacy webhook URLs are configured in the Partner Dashboard.
- Confirm protected customer data access is saved in the Partner Dashboard for order/customer data.
- Confirm `SUPPORT_EMAIL` is monitored.
