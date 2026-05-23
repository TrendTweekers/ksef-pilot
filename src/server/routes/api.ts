import { Router } from "express";
import JSZip from "jszip";
import { z } from "zod";
import { loadShop } from "../middleware/shop.js";
import { encryptSecret } from "../services/crypto.js";
import { testKsefToken } from "../services/ksef.js";
import { prisma } from "../config/prisma.js";
import { buildFa3Xml, buildSampleFa3Invoice, validateFa3Input } from "../services/fa3.js";
import { fetchShopifyOrders, generateDraftInvoiceForOrder, saveOrderFlag } from "../services/orders.js";

export const apiRouter = Router();

const ksefSettingsSchema = z.object({
  token: z.string().min(10).optional(),
  sellerNip: z.string().optional(),
  sellerName: z.string().optional(),
  sellerAddress: z.string().optional(),
  placeOfIssue: z.string().optional()
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
    placeOfIssue: shop.placeOfIssue ?? ""
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
        placeOfIssue: input.placeOfIssue?.trim() || null
      }
    });

    res.json({
      connected: updated.ksefConnected,
      checkedAt: testResult?.checkedAt,
      sellerNip: updated.sellerNip ?? "",
      sellerName: updated.sellerName ?? "",
      sellerAddress: updated.sellerAddress ?? "",
      placeOfIssue: updated.placeOfIssue ?? ""
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
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
      return;
    }

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

    res.json({
      invoices: invoices.map((invoice) => ({
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
        itemCount: invoice.items.length
      }))
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
      orderBy: { createdAt: "desc" }
    });

    const zip = new JSZip();
    const manifest = invoiceManifestRows(invoices);

    for (const invoice of invoices) {
      zip.file(invoiceFileName(invoice.orderName, invoice.id), invoice.fa3Xml);
    }

    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    zip.file("manifest.csv", invoiceManifestCsv(invoices));

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
