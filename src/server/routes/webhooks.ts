import crypto from "node:crypto";
import { Router } from "express";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { notifyTelegram } from "../services/telegram.js";

export const webhookRouter = Router();

function verifyWebhook(rawBody: Buffer, hmacHeader: unknown) {
  if (typeof hmacHeader !== "string") return false;

  const digest = crypto.createHmac("sha256", env.SHOPIFY_API_SECRET).update(rawBody).digest("base64");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
}

webhookRouter.post("/shopify", async (req, res, next) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");

    if (!verifyWebhook(rawBody, req.header("x-shopify-hmac-sha256"))) {
      res.status(401).send("Invalid webhook signature");
      return;
    }

    const topic = req.header("x-shopify-topic") ?? "unknown";
    const shopDomain = req.header("x-shopify-shop-domain") ?? "";
    const payload = rawBody.length ? JSON.parse(rawBody.toString("utf8")) : {};

    if (topic === "app/uninstalled") {
      await prisma.shop.updateMany({
        where: { domain: shopDomain },
        data: {
          isActive: false,
          accessToken: "",
          ksefConnected: false,
          ksefToken: null,
          billingStatus: "uninstalled",
          uninstalledAt: new Date()
        }
      });
      await notifyTelegram(`Uninstalled: ${shopDomain}`);
    }

    if (topic === "app_subscriptions/update" || topic === "APP_SUBSCRIPTIONS_UPDATE") {
      await prisma.shop.updateMany({
        where: { domain: shopDomain },
        data: {
          billingStatus: String(payload?.app_subscription?.status ?? payload?.status ?? "updated")
        }
      });
      await notifyTelegram(`Billing update for ${shopDomain}: ${JSON.stringify(payload).slice(0, 500)}`);
    }

    res.status(200).send("OK");
  } catch (error) {
    next(error);
  }
});
