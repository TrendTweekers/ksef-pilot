import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { normalizeShop, shopFromSessionToken } from "../services/shopify.js";

export async function loadShop(req: Request, res: Response, next: NextFunction) {
  let shopDomain: string | null = null;

  const authHeader = req.header("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    shopDomain = shopFromSessionToken(authHeader.slice("Bearer ".length).trim());
  }

  // Local development runs the app outside the Shopify iframe, so no session token
  // is available. Fall back to the shop query param only there, never in production.
  if (!shopDomain && env.NODE_ENV === "development") {
    shopDomain = normalizeShop(req.query.shop);
  }

  if (!shopDomain) {
    res.status(401).json({ error: "Missing or invalid Shopify session token" });
    return;
  }

  const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });

  if (!shop) {
    res.status(401).json({ error: "Shop is not installed" });
    return;
  }

  res.locals.shop = shop;
  next();
}
