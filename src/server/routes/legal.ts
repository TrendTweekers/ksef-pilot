import { Router } from "express";
import { env } from "../config/env.js";

export const legalRouter = Router();

function page(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} - KSeF Pilot</title>
    <style>
      body { margin: 0; background: #f8f4ec; color: #101729; font: 16px/1.55 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      main { max-width: 760px; margin: 0 auto; padding: 48px 24px; }
      h1 { margin: 0 0 8px; font-size: 32px; }
      h2 { margin-top: 28px; font-size: 20px; }
      a { color: #b81424; }
      .eyebrow { color: #da1b2d; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      .card { padding: 24px; border: 1px solid #e5dfcc; border-radius: 8px; background: #fff; }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">KSeF Pilot</div>
      <div class="card">${body}</div>
    </main>
  </body>
</html>`;
}

legalRouter.get("/privacy", (_req, res) => {
  res.type("html").send(page("Privacy Policy", `
    <h1>Privacy Policy</h1>
    <p>KSeF Pilot is a Shopify embedded app by FakturaFlow for creating and submitting Polish FA(3) e-invoices from B2B Shopify orders.</p>
    <h2>Data we process</h2>
    <p>We process the minimum data needed to provide the app: shop domain, Shopify offline access token, order identifiers, buyer name, buyer NIP, invoice totals, generated FA(3) XML, KSeF submission status, and encrypted KSeF API tokens when a merchant chooses to connect one.</p>
    <h2>Purpose</h2>
    <p>Data is used only to detect B2B orders, generate FA(3) invoices, export accountant packets, submit invoices to KSeF when enabled, track submission status, and enforce app billing limits.</p>
    <h2>Security</h2>
    <p>KSeF tokens are encrypted at rest with AES-256-GCM. Traffic is encrypted in transit by the hosting platform. The app reads Shopify orders and does not modify them.</p>
    <h2>Retention</h2>
    <p>Invoice records may be retained where needed for tax compliance. Shopify customer helper profiles used for NIP prefill are deleted when Shopify sends a customer redaction webhook.</p>
    <h2>Contact</h2>
    <p>Questions or data requests: <a href="mailto:${env.SUPPORT_EMAIL}">${env.SUPPORT_EMAIL}</a>.</p>
  `));
});

legalRouter.get("/terms", (_req, res) => {
  res.type("html").send(page("Terms of Service", `
    <h1>Terms of Service</h1>
    <p>KSeF Pilot helps Shopify merchants prepare Polish B2B e-invoices for KSeF. Merchants remain responsible for reviewing invoice data, tax treatment, KSeF credentials, and legal compliance before live submission.</p>
    <h2>MVP limitations</h2>
    <p>Phase 1 supports PLN invoices with standard 23% VAT only. Orders with unsupported currency, exempt tax lines, or other VAT rates are blocked and must be handled manually until support is added.</p>
    <h2>Billing</h2>
    <p>Subscription changes are handled by Shopify Managed Pricing. The app reads the active Shopify plan to apply invoice limits.</p>
    <h2>Support</h2>
    <p>Contact <a href="mailto:${env.SUPPORT_EMAIL}">${env.SUPPORT_EMAIL}</a> for help.</p>
  `));
});

legalRouter.get("/support", (_req, res) => {
  res.type("html").send(page("Support", `
    <h1>Support</h1>
    <p>Email: <a href="mailto:${env.SUPPORT_EMAIL}">${env.SUPPORT_EMAIL}</a></p>
    <p>Include your Shopify shop domain, invoice/order name, and whether you are using test mode or live KSeF mode.</p>
  `));
});
