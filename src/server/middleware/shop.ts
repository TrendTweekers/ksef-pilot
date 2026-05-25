import type { NextFunction, Request, Response } from "express";
import type { Shop } from "@prisma/client";
import { env, shopifyScopes } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { exchangeSessionTokenForOfflineToken, normalizeShop, shopFromSessionToken } from "../services/shopify.js";
import { registerCoreWebhooks } from "../services/webhookSubscriptions.js";
import { notifyTelegram } from "../services/telegram.js";

// Obtain (or refresh) the shop's offline access token via token exchange and
// persist it. Used the first time an embedded shop has no stored token, which
// replaces the legacy OAuth authorization-code install for managed installs.
async function installViaTokenExchange(shopDomain: string, sessionToken: string, existing: Shop | null) {
  const token = await exchangeSessionTokenForOfflineToken(shopDomain, sessionToken);
  const wasInstalled = Boolean(existing?.accessToken);

  const shop = await prisma.shop.upsert({
    where: { domain: shopDomain },
    create: { domain: shopDomain, accessToken: token.access_token },
    update: { accessToken: token.access_token, isActive: true, uninstalledAt: null }
  });

  await prisma.shopifySession.upsert({
    where: { id: `${shopDomain}:offline` },
    create: {
      id: `${shopDomain}:offline`,
      shopId: shop.id,
      state: "token-exchange",
      isOnline: false,
      scope: token.scope || shopifyScopes.join(",")
    },
    update: { scope: token.scope || shopifyScopes.join(",") }
  });

  // Webhook registration is best-effort: a transient failure must not block the
  // merchant from using the app on this request.
  try {
    await registerCoreWebhooks(shop);
  } catch (error) {
    console.warn("Webhook registration after token exchange failed", error);
  }

  if (!wasInstalled) {
    await notifyTelegram(`Installed via token exchange: ${shopDomain}`);
  }

  return shop;
}

export async function loadShop(req: Request, res: Response, next: NextFunction) {
  let shopDomain: string | null = null;
  let sessionToken: string | null = null;

  const authHeader = req.header("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    sessionToken = authHeader.slice("Bearer ".length).trim();
    shopDomain = shopFromSessionToken(sessionToken);
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

  let shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });

  // No stored access token yet (new managed install): exchange the verified
  // session token for one. Existing installs keep their token untouched.
  if (sessionToken && (!shop || !shop.accessToken)) {
    try {
      shop = await installViaTokenExchange(shopDomain, sessionToken, shop);
    } catch (error) {
      console.error("Token exchange failed", error);
      res.status(401).json({ error: "Could not authorize this shop with Shopify. Please reopen the app." });
      return;
    }
  }

  if (!shop || !shop.accessToken) {
    res.status(401).json({ error: "Shop is not installed" });
    return;
  }

  res.locals.shop = shop;
  next();
}
