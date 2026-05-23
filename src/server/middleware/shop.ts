import type { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { normalizeShop } from "../services/shopify.js";

export async function loadShop(req: Request, res: Response, next: NextFunction) {
  const shopDomain = normalizeShop(req.query.shop ?? req.header("x-shopify-shop-domain"));

  if (!shopDomain) {
    res.status(400).json({ error: "Missing or invalid shop domain" });
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
