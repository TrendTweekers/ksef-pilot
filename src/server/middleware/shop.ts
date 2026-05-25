import type { NextFunction, Request, Response } from "express";
import type { Shop } from "@prisma/client";
import { env, shopifyScopes } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { exchangeSessionTokenForOfflineToken, normalizeShop, shopFromSessionToken } from "../services/shopify.js";
import { registerCoreWebhooks } from "../services/webhookSubscriptions.js";
import { notifyTelegram } from "../services/telegram.js";

// Re-acquire the offline token at most this often per shop (token exchange should
// not run on every request). Stored tokens are non-expiring offline tokens.
const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;
const lastTokenRefresh = new Map<string, number>();
const inFlightRefresh = new Map<string, Promise<Shop>>();

function tokenNeedsRefresh(shopDomain: string, shop: Shop | null) {
  if (!shop || !shop.accessToken) {
    return true;
  }
  return Date.now() - (lastTokenRefresh.get(shopDomain) ?? 0) > REFRESH_INTERVAL_MS;
}

// Obtain (or refresh) the shop's offline access token via token exchange and
// persist it. Replaces the legacy OAuth authorization-code install and also
// heals tokens that Shopify has invalidated. registerCoreWebhooks is idempotent.
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

  // Best-effort: a transient webhook failure must not block the merchant.
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

// Deduplicate concurrent refreshes (a page load fires several API calls at once).
function refreshAccessToken(shopDomain: string, sessionToken: string, existing: Shop | null) {
  const pending = inFlightRefresh.get(shopDomain);
  if (pending) {
    return pending;
  }

  const promise = installViaTokenExchange(shopDomain, sessionToken, existing)
    .then((shop) => {
      lastTokenRefresh.set(shopDomain, Date.now());
      return shop;
    })
    .finally(() => {
      inFlightRefresh.delete(shopDomain);
    });

  inFlightRefresh.set(shopDomain, promise);
  return promise;
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

  // With a verified session token, mint a fresh access token when missing or
  // stale. This installs new shops and heals tokens Shopify has invalidated.
  if (sessionToken && tokenNeedsRefresh(shopDomain, shop)) {
    try {
      shop = await refreshAccessToken(shopDomain, sessionToken, shop);
    } catch (error) {
      if (!shop || !shop.accessToken) {
        console.error("Token exchange failed", error);
        res.status(401).json({ error: "Could not authorize this shop with Shopify. Please reopen the app." });
        return;
      }
      console.warn("Token refresh failed; continuing with existing token", error);
    }
  }

  if (!shop || !shop.accessToken) {
    res.status(401).json({ error: "Shop is not installed" });
    return;
  }

  res.locals.shop = shop;
  next();
}
