import { Router } from "express";
import { z } from "zod";
import { loadShop } from "../middleware/shop.js";
import { encryptSecret } from "../services/crypto.js";
import { testKsefToken } from "../services/ksef.js";
import { prisma } from "../config/prisma.js";
import { buildFa3Xml, buildSampleFa3Invoice, validateFa3Input } from "../services/fa3.js";

export const apiRouter = Router();

const ksefSettingsSchema = z.object({
  token: z.string().min(10)
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
    hasToken: Boolean(shop.ksefToken)
  });
});

apiRouter.put("/ksef/settings", loadShop, async (req, res, next) => {
  try {
    const shop = res.locals.shop!;
    const input = ksefSettingsSchema.parse(req.body);
    const encryptedToken = encryptSecret(input.token);
    const testResult = await testKsefToken(encryptedToken);

    await prisma.shop.update({
      where: { id: shop.id },
      data: {
        ksefToken: encryptedToken,
        ksefConnected: testResult.connected
      }
    });

    res.json({
      connected: testResult.connected,
      checkedAt: testResult.checkedAt
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
