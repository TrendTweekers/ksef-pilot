import { Router } from "express";
import { z } from "zod";
import { loadShop } from "../middleware/shop.js";
import { encryptSecret } from "../services/crypto.js";
import { testKsefToken } from "../services/ksef.js";
import { prisma } from "../config/prisma.js";

export const apiRouter = Router();

const ksefSettingsSchema = z.object({
  token: z.string().min(10)
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
