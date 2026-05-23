import { Router } from "express";
import JSZip from "jszip";
import { z } from "zod";
import { loadShop } from "../middleware/shop.js";
import { encryptSecret } from "../services/crypto.js";
import { submitInvoiceToKsef, testKsefToken } from "../services/ksef.js";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { billingPlans, getBillingSummary } from "../services/billing.js";
import { buildFa3Xml, buildSampleFa3Invoice, validateFa3Input } from "../services/fa3.js";
import { describeSchemaValidation, validateFa3XmlAgainstOfficialXsd } from "../services/fa3Schema.js";
import { fetchShopifyOrders, generateDraftInvoiceForOrder, saveOrderFlag } from "../services/orders.js";
import { buildInvoicePdf } from "../services/pdf.js";
import { notifyTelegram } from "../services/telegram.js";

export const apiRouter = Router();

const ksefSettingsSchema = z.object({
  token: z.string().min(10).optional(),
  sellerNip: z.string().optional(),
  sellerName: z.string().optional(),
  sellerAddress: z.string().optional(),
  placeOfIssue: z.string().optional(),
  ksefTestMode: z.boolean().optional()
});

const orderFlagSchema = z.object({
  orderId: z.string().min(1),
  orderName: z.string().min(1),
  isB2b: z.boolean(),
  nip: z.string().optional(),
  buyerName: z.string().optional()
});

const generateInvoiceSchema = z.object({
  orderId: z.string().min(1),
  buyerNip: z.string().regex(/^\D*\d\D*\d\D*\d\D*\d\D*\d\D*\d\D*\d\D*\d\D*\d\D*\d\D*$/),
  buyerName: z.string().min(1)
});

const invoicePeriodSchema = z.enum(["week", "month", "all"]).default("month");

const fa3LineSchema = z.object({
  name: z.string().min(1),
  unit: z.string().optional(),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative(),
  vatRate: z.enum(["23", "8", "5", "0", "zw"]).default("23"),
  totalNet: z.coerce.number().nonnegative(),
  totalVat: z.coerce.number().nonnegative(),
  totalGross: z.coerce.number().nonnegative()
});

const fa3PreviewSchema = z.object({
  invoiceNumber: z.string().min(1),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sellerNip: z.string().regex(/^\d{10}$/),
  sellerName: z.string().min(1),
  sellerAddress: z.string().optional(),
  buyerNip: z.string().regex(/^\d{10}$/),
  buyerName: z.string().min(1),
  buyerAddress: z.string().optional(),
  amountNet: z.coerce.number().nonnegative(),
  amountVat: z.coerce.number().nonnegative(),
  amountGross: z.coerce.number().nonnegative(),
  currency: z.literal("PLN").default("PLN"),
  lineItems: z.array(fa3LineSchema).min(1)
});

function invoicePeriodRange(period: z.infer<typeof invoicePeriodSchema>) {
  const now = new Date();

  if (period === "all") {
    return {};
  }

  if (period === "week") {
    const start = new Date(now);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    start.setHours(0, 0, 0, 0);
    return { gte: start };
  }

  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { gte: start };
}

function invoiceFileName(orderName: string, invoiceId: string) {
  const safeOrderName = orderName.replace(/[^A-Za-z0-9-]/g, "") || "order";
  return `${safeOrderName}-${invoiceId.slice(0, 8)}.xml`;
}

function invoicePdfFileName(orderName: string, invoiceId: string) {
  const safeOrderName = orderName.replace(/[^A-Za-z0-9-]/g, "") || "order";
  return `${safeOrderName}-${invoiceId.slice(0, 8)}.pdf`;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function invoiceManifestRows(invoices: Array<{
  id: string;
  orderName: string;
  buyerName: string;
  nip: string;
  status: string;
  ksefNumber: string | null;
  totalGross: { toString(): string };
  createdAt: Date;
}>) {
  return invoices.map((invoice) => ({
    order: invoice.orderName,
    buyer: invoice.buyerName,
    nip: invoice.nip,
    gross_pln: invoice.totalGross.toString(),
    status: invoice.status,
    ksef_number: invoice.ksefNumber ?? "",
    created_at: invoice.createdAt.toISOString(),
    xml_file: invoiceFileName(invoice.orderName, invoice.id)
  }));
}

function invoiceManifestCsv(invoices: Parameters<typeof invoiceManifestRows>[0]) {
  const rows = invoiceManifestRows(invoices);
  const headers = ["order", "buyer", "nip", "gross_pln", "status", "ksef_number", "created_at", "xml_file"];
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header as keyof typeof row])).join(","))
  ].join("\n");
}

apiRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    app: "KSeF Pilot",
    tagline: "Polish e-invoices for Shopify"
  });
});

apiRouter.get("/config", (_req, res) => {
  res.json({
    appName: "KSeF Pilot",
    tagline: "Polish e-invoices for Shopify",
    description:
      "Automate Polish KSeF e-invoices for B2B Shopify orders. Built by FakturaFlow."
  });
});

apiRouter.get("/ksef/fa3/schema", (_req, res) => {
  res.json(describeSchemaValidation());
});

apiRouter.get("/ksef/fa3/sample", (_req, res) => {
  const sample = buildSampleFa3Invoice();
  const validation = validateFa3Input(sample);
  const xml = buildFa3Xml(sample);

  res.json({
    validation,
    xml
  });
});

apiRouter.post("/ksef/fa3/preview", loadShop, async (req, res, next) => {
  try {
    const input = fa3PreviewSchema.parse(req.body);
    const validation = validateFa3Input(input);

    if (!validation.valid) {
      res.status(400).json({ validation });
      return;
    }

    const xml = buildFa3Xml({
      ...input,
      sourceSystem: "KSeF Pilot Shopify"
    });

    res.json({
      validation,
      xml
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/ksef/settings", loadShop, async (_req, res) => {
  const shop = res.locals.shop!;

  res.json({
    connected: shop.ksefConnected,
    hasToken: Boolean(shop.ksefToken),
    sellerNip: shop.sellerNip ?? "",
    sellerName: shop.sellerName ?? "",
    sellerAddress: shop.sellerAddress ?? "",
    placeOfIssue: shop.placeOfIssue ?? "",
    ksefTestMode: shop.ksefTestMode
  });
});

apiRouter.put("/ksef/settings", loadShop, async (req, res, next) => {
  try {
    const shop = res.locals.shop!;
    const input = ksefSettingsSchema.parse(req.body);
    const encryptedToken = input.token ? encryptSecret(input.token) : undefined;
    const testResult = encryptedToken ? await testKsefToken(encryptedToken) : null;

    const updated = await prisma.shop.update({
      where: { id: shop.id },
      data: {
        ...(encryptedToken
          ? {
              ksefToken: encryptedToken,
              ksefConnected: testResult?.connected ?? false
            }
          : {}),
        sellerNip: input.sellerNip?.replace(/\D/g, "") || null,
        sellerName: input.sellerName?.trim() || null,
        sellerAddress: input.sellerAddress?.trim() || null,
        placeOfIssue: input.placeOfIssue?.trim() || null,
        ...(typeof input.ksefTestMode === "boolean" ? { ksefTestMode: input.ksefTestMode } : {})
      }
    });

    res.json({
      connected: updated.ksefConnected,
      checkedAt: testResult?.checkedAt,
      sellerNip: updated.sellerNip ?? "",
      sellerName: updated.sellerName ?? "",
      sellerAddress: updated.sellerAddress ?? "",
      placeOfIssue: updated.placeOfIssue ?? "",
      ksefTestMode: updated.ksefTestMode
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/ksef/test", loadShop, async (req, res, next) => {
  try {
    const shop = res.locals.shop!;
    const token = typeof req.body?.token === "string" ? encryptSecret(req.body.token) : shop.ksefToken;

    if (!token) {
      res.status(400).json({ error: "KSeF token is required" });
      return;
    }

    const result = await testKsefToken(token);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/orders", loadShop, async (req, res, next) => {
  try {
    const shop = res.locals.shop!;
    const onlyUnprocessedB2b = req.query.onlyUnprocessedB2b === "true";
    const orders = await fetchShopifyOrders(shop, onlyUnprocessedB2b);

    res.json({ orders });
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
      return;
    }

    next(error);
  }
});

apiRouter.put("/orders/flag", loadShop, async (req, res, next) => {
  try {
    const shop = res.locals.shop!;
    const input = orderFlagSchema.parse(req.body);
    const flag = await saveOrderFlag(shop, input);

    res.json({ flag });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/orders/generate-invoice", loadShop, async (req, res, next) => {
  try {
    const shop = res.locals.shop!;
    const input = generateInvoiceSchema.parse(req.body);
    const result = await generateDraftInvoiceForOrder(shop, input);

    res.json({
      reused: result.reused,
      invoice: {
        id: result.invoice.id,
        orderName: result.invoice.orderName,
        status: result.invoice.status,
        totalGross: result.invoice.totalGross,
        createdAt: result.invoice.createdAt
      }
    });
    await notifyTelegram(`Invoice draft generated: ${shop.domain} ${result.invoice.orderName} ${result.invoice.totalGross} PLN`);
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
      return;
    }

    next(error);
  }
});

apiRouter.get("/billing", loadShop, async (_req, res, next) => {
  try {
    const shop = res.locals.shop!;
    const summary = await getBillingSummary(shop);

    res.json({
      ...summary,
      plans: billingPlans
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/review/status", loadShop, async (_req, res, next) => {
  try {
    const shop = res.locals.shop!;
    const invoiceCount = await prisma.ksefInvoice.count({ where: { shopId: shop.id } });
    const exportedCount = await prisma.ksefInvoice.count({
      where: {
        shopId: shop.id,
        status: { in: ["exported", "submitted"] }
      }
    });
    const shouldAsk = !shop.reviewDismissedAt && invoiceCount >= 3 && exportedCount >= 1;

    res.json({
      shouldAsk,
      invoiceCount,
      exportedCount,
      reviewUrl: env.SHOPIFY_REVIEW_URL ?? null
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/setup/status", loadShop, async (_req, res, next) => {
  try {
    const shop = res.locals.shop!;
    const [invoiceCount, exportedCount] = await Promise.all([
      prisma.ksefInvoice.count({ where: { shopId: shop.id } }),
      prisma.ksefInvoice.count({ where: { shopId: shop.id, status: { in: ["exported", "submitted"] } } })
    ]);
    const billing = await getBillingSummary(shop);

    const items = [
      {
        id: "seller",
        label: "Seller identity",
        done: Boolean(shop.sellerNip && shop.sellerName),
        detail: shop.sellerNip && shop.sellerName ? "Seller NIP and legal name saved." : "Add seller NIP and legal name in KSeF Settings."
      },
      {
        id: "billing",
        label: "Billing",
        done: billing.canGenerate,
        detail: `${billing.planName} plan, ${billing.limit === null ? `${billing.used} used` : `${billing.used}/${billing.limit} used this month`}.`
      },
      {
        id: "orders",
        label: "First draft invoice",
        done: invoiceCount > 0,
        detail: invoiceCount > 0 ? `${invoiceCount} draft invoice record created.` : "Mark a B2B order and generate a draft."
      },
      {
        id: "export",
        label: "Accountant export",
        done: exportedCount > 0,
        detail: exportedCount > 0 ? `${exportedCount} invoice exported.` : "Export a ZIP packet with XML, PDF and CSV."
      },
      {
        id: "ksef",
        label: "KSeF token",
        done: shop.ksefConnected,
        detail: shop.ksefConnected ? "KSeF token is connected." : "Optional for draft testing. Required before live submission."
      },
      {
        id: "xsd",
        label: "FA(3) schema validation",
        done: false,
        detail: "Validate each draft invoice against the official CIRFMF FA(3) XSD before submission."
      }
    ];

    res.json({
      complete: items.every((item) => item.done),
      items
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/review/dismiss", loadShop, async (_req, res, next) => {
  try {
    const shop = res.locals.shop!;
    await prisma.shop.update({
      where: { id: shop.id },
      data: { reviewDismissedAt: new Date() }
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/invoices", loadShop, async (req, res, next) => {
  try {
    const shop = res.locals.shop!;
    const period = invoicePeriodSchema.parse(req.query.period ?? "month");
    const createdAt = invoicePeriodRange(period);

    const invoices = await prisma.ksefInvoice.findMany({
      where: {
        shopId: shop.id,
        ...(Object.keys(createdAt).length ? { createdAt } : {})
      },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    const submissions = await prisma.ksefSubmission.findMany({
      where: {
        invoiceId: { in: invoices.map((invoice) => invoice.id) }
      },
      orderBy: { createdAt: "desc" }
    });
    const latestSubmissionByInvoice = new Map<string, (typeof submissions)[number]>();
    for (const submission of submissions) {
      if (!latestSubmissionByInvoice.has(submission.invoiceId)) {
        latestSubmissionByInvoice.set(submission.invoiceId, submission);
      }
    }

    res.json({
      invoices: invoices.map((invoice) => {
        const submission = latestSubmissionByInvoice.get(invoice.id);
        return {
          id: invoice.id,
          orderId: invoice.orderId,
          orderName: invoice.orderName,
          buyerName: invoice.buyerName,
          nip: invoice.nip,
          status: invoice.status,
          ksefNumber: invoice.ksefNumber,
          totalGross: invoice.totalGross,
          createdAt: invoice.createdAt,
          submittedAt: invoice.submittedAt,
          itemCount: invoice.items.length,
          submission: submission
            ? {
                id: submission.id,
                mode: submission.mode,
                status: submission.status,
                attempts: submission.attempts,
                nextRetryAt: submission.nextRetryAt,
                lastError: submission.lastError,
                ksefNumber: submission.ksefNumber,
                sessionReferenceNumber: submission.sessionReferenceNumber,
                invoiceReferenceNumber: submission.invoiceReferenceNumber
              }
            : null
        };
      })
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/invoices/export.zip", loadShop, async (req, res, next) => {
  try {
    const shop = res.locals.shop!;
    const period = invoicePeriodSchema.parse(req.query.period ?? "month");
    const createdAt = invoicePeriodRange(period);
    const invoices = await prisma.ksefInvoice.findMany({
      where: {
        shopId: shop.id,
        ...(Object.keys(createdAt).length ? { createdAt } : {})
      },
      include: {
        items: true,
        shop: true
      },
      orderBy: { createdAt: "desc" }
    });

    const zip = new JSZip();
    const manifest = invoiceManifestRows(invoices);

    for (const invoice of invoices) {
      zip.file(invoiceFileName(invoice.orderName, invoice.id), invoice.fa3Xml);
      zip.file(`pdf/${invoicePdfFileName(invoice.orderName, invoice.id)}`, await buildInvoicePdf(invoice));
    }

    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    zip.file("manifest.csv", invoiceManifestCsv(invoices));

    if (invoices.length) {
      await prisma.ksefInvoice.updateMany({
        where: {
          shopId: shop.id,
          id: { in: invoices.map((invoice) => invoice.id) },
          status: "draft"
        },
        data: { status: "exported" }
      });
      await notifyTelegram(`Invoice packet exported: ${shop.domain} ${invoices.length} invoices (${period})`);
    }

    const content = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const stamp = new Date().toISOString().slice(0, 10);
    res.type("application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="ksef-pilot-${period}-${stamp}.zip"`);
    res.send(content);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/invoices/:invoiceId/xml", loadShop, async (req, res, next) => {
  try {
    const shop = res.locals.shop!;
    const invoiceId = String(req.params.invoiceId);
    const invoice = await prisma.ksefInvoice.findFirst({
      where: {
        id: invoiceId,
        shopId: shop.id
      }
    });

    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    res.type("application/xml");
    res.setHeader("Content-Disposition", `attachment; filename="${invoiceFileName(invoice.orderName, invoice.id)}"`);
    res.send(invoice.fa3Xml);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/invoices/:invoiceId/validate", loadShop, async (req, res, next) => {
  try {
    const shop = res.locals.shop!;
    const invoiceId = String(req.params.invoiceId);
    const invoice = await prisma.ksefInvoice.findFirst({
      where: {
        id: invoiceId,
        shopId: shop.id
      }
    });

    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    const validation = await validateFa3XmlAgainstOfficialXsd(invoice.fa3Xml);
    res.json({
      invoiceId: invoice.id,
      orderName: invoice.orderName,
      validation
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/invoices/:invoiceId/submit", loadShop, async (req, res, next) => {
  try {
    const shop = res.locals.shop!;
    const invoiceId = String(req.params.invoiceId);
    const result = await submitInvoiceToKsef(shop, invoiceId);

    res.json({
      reused: result.reused,
      invoice: {
        id: result.invoice.id,
        orderName: result.invoice.orderName,
        status: result.invoice.status,
        ksefNumber: result.invoice.ksefNumber,
        submittedAt: result.invoice.submittedAt
      },
      submission: result.submission
        ? {
            id: result.submission.id,
            mode: result.submission.mode,
            status: result.submission.status,
            attempts: result.submission.attempts,
            nextRetryAt: result.submission.nextRetryAt,
            lastError: result.submission.lastError,
            ksefNumber: result.submission.ksefNumber,
            sessionReferenceNumber: result.submission.sessionReferenceNumber,
            invoiceReferenceNumber: result.submission.invoiceReferenceNumber
          }
        : null
    });

    await notifyTelegram(
      `KSeF submission ${result.submission?.mode ?? "unknown"}: ${shop.domain} ${result.invoice.orderName} -> ${result.invoice.status}`
    );
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
      return;
    }

    next(error);
  }
});

apiRouter.get("/invoices/:invoiceId/pdf", loadShop, async (req, res, next) => {
  try {
    const shop = res.locals.shop!;
    const invoiceId = String(req.params.invoiceId);
    const invoice = await prisma.ksefInvoice.findFirst({
      where: {
        id: invoiceId,
        shopId: shop.id
      },
      include: {
        items: true,
        shop: true
      }
    });

    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    const pdf = await buildInvoicePdf(invoice);
    res.type("application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${invoicePdfFileName(invoice.orderName, invoice.id)}"`);
    res.send(pdf);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/invoices/:invoiceId", loadShop, async (req, res, next) => {
  try {
    const shop = res.locals.shop!;
    const invoiceId = String(req.params.invoiceId);
    const invoice = await prisma.ksefInvoice.findFirst({
      where: {
        id: invoiceId,
        shopId: shop.id
      },
      include: { items: true }
    });

    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    res.json({
      invoice: {
        id: invoice.id,
        orderId: invoice.orderId,
        orderName: invoice.orderName,
        buyerName: invoice.buyerName,
        nip: invoice.nip,
        fa3Xml: invoice.fa3Xml,
        status: invoice.status,
        ksefNumber: invoice.ksefNumber,
        totalGross: invoice.totalGross,
        createdAt: invoice.createdAt,
        submittedAt: invoice.submittedAt,
        items: invoice.items
      }
    });
  } catch (error) {
    next(error);
  }
});
