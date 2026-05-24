import crypto from "node:crypto";
import { Router } from "express";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { applyBillingWebhookUpdate } from "../services/billing.js";
import { notifyTelegram } from "../services/telegram.js";

export const webhookRouter = Router();

function verifyWebhook(rawBody: Buffer, hmacHeader: unknown) {
  if (typeof hmacHeader !== "string") return false;

  const digest = crypto.createHmac("sha256", env.SHOPIFY_API_SECRET).update(rawBody).digest("base64");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
}

function shopifyOrderGids(payload: Record<string, unknown>) {
  const ids = new Set<string>();
  const orderId = payload.order_id ?? payload.id;
  const adminGraphqlApiId = payload.admin_graphql_api_id;
  const nestedOrder = payload.order && typeof payload.order === "object" ? (payload.order as Record<string, unknown>) : null;

  if (typeof orderId === "number" || typeof orderId === "string") {
    ids.add(`gid://shopify/Order/${orderId}`);
  }

  if (typeof adminGraphqlApiId === "string" && adminGraphqlApiId.includes("/Order/")) {
    ids.add(adminGraphqlApiId);
  }

  if (typeof nestedOrder?.admin_graphql_api_id === "string") {
    ids.add(nestedOrder.admin_graphql_api_id);
  }

  if (typeof nestedOrder?.id === "number" || typeof nestedOrder?.id === "string") {
    ids.add(`gid://shopify/Order/${nestedOrder.id}`);
  }

  return [...ids];
}

async function markCorrectionNeeded(shopDomain: string, payload: Record<string, unknown>, reason: string) {
  const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
  if (!shop) return 0;

  const orderIds = shopifyOrderGids(payload);
  if (!orderIds.length) return 0;

  const update = await prisma.ksefInvoice.updateMany({
    where: {
      shopId: shop.id,
      orderId: { in: orderIds },
      correctionOf: null,
      status: { notIn: ["corrected", "correction_needed"] }
    },
    data: {
      status: "correction_needed",
      lastError: reason
    }
  });

  if (update.count > 0) {
    await notifyTelegram(`KSeF Pilot — correction needed: ${shopDomain} ${reason} (${update.count} invoice(s))`);
  }

  return update.count;
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
    const payload = (rawBody.length ? JSON.parse(rawBody.toString("utf8")) : {}) as Record<string, unknown>;

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
      await notifyTelegram(`KSeF Pilot — uninstall: ${shopDomain}`);
    }

    if (topic === "app_subscriptions/update" || topic === "APP_SUBSCRIPTIONS_UPDATE") {
      const update = await applyBillingWebhookUpdate(shopDomain, payload);
      const status = update.parsed.status ?? "updated";
      const planChange =
        update.previousPlan && update.nextPlan && update.previousPlan !== update.nextPlan
          ? `${update.previousPlan} -> ${update.nextPlan}`
          : update.nextPlan ?? "unknown";

      await notifyTelegram(`KSeF Pilot - billing update: ${shopDomain} status ${status}, plan ${planChange}`);
    }

    if (topic === "refunds/create" || topic === "REFUNDS_CREATE") {
      await markCorrectionNeeded(shopDomain, payload, "Shopify refund detected. Create a correction invoice.");
    }

    if (topic === "orders/edited" || topic === "ORDERS_EDITED") {
      await markCorrectionNeeded(shopDomain, payload, "Shopify order edit detected. Review whether a correction invoice is needed.");
    }

    if (topic === "orders/updated" || topic === "ORDERS_UPDATED") {
      const financialStatus = String(payload.financial_status ?? "");
      if (financialStatus.toLowerCase().includes("refund")) {
        await markCorrectionNeeded(shopDomain, payload, "Shopify order refund status detected. Create a correction invoice.");
      }
    }

    res.status(200).send("OK");
  } catch (error) {
    next(error);
  }
});
