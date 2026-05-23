import crypto from "node:crypto";
import { Router } from "express";
import { env, shopifyScopes } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import {
  buildOAuthUrl,
  exchangeCodeForAccessToken,
  normalizeShop,
  verifyShopifyHmac
} from "../services/shopify.js";
import { notifyTelegram } from "../services/telegram.js";
import { registerCoreWebhooks } from "../services/webhookSubscriptions.js";

export const authRouter = Router();

authRouter.get("/", (req, res) => {
  const shop = normalizeShop(req.query.shop);

  if (!shop) {
    res.status(400).send("Missing or invalid shop parameter.");
    return;
  }

  const state = crypto.randomBytes(24).toString("hex");

  res.cookie("shopify_oauth_state", state, {
    httpOnly: true,
    sameSite: "none",
    secure: env.NODE_ENV === "production",
    maxAge: 10 * 60 * 1000
  });

  res.redirect(buildOAuthUrl(shop, state));
});

authRouter.get("/callback", async (req, res, next) => {
  try {
    const shop = normalizeShop(req.query.shop);
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : null;

    if (!shop || !code || !state) {
      res.status(400).send("Missing OAuth callback parameters.");
      return;
    }

    if (req.cookies.shopify_oauth_state !== state) {
      res.status(403).send("Invalid OAuth state.");
      return;
    }

    if (!verifyShopifyHmac(req.query)) {
      res.status(403).send("Invalid Shopify OAuth signature.");
      return;
    }

    const token = await exchangeCodeForAccessToken(shop, code);
    const savedShop = await prisma.shop.upsert({
      where: { domain: shop },
      create: {
        domain: shop,
        accessToken: token.access_token
      },
      update: {
        accessToken: token.access_token,
        isActive: true,
        uninstalledAt: null
      }
    });

    await prisma.shopifySession.upsert({
      where: { id: `${shop}:offline` },
      create: {
        id: `${shop}:offline`,
        shopId: savedShop.id,
        state,
        isOnline: false,
        scope: token.scope || shopifyScopes.join(",")
      },
      update: {
        state,
        scope: token.scope || shopifyScopes.join(",")
      }
    });

    res.clearCookie("shopify_oauth_state");
    await registerCoreWebhooks(savedShop);
    await notifyTelegram(`Installed or reconnected: ${shop}`);
    res.redirect(`/?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(String(req.query.host ?? ""))}`);
  } catch (error) {
    next(error);
  }
});
