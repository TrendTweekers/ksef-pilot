import { Router } from "express";
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
