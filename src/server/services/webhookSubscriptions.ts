import type { Shop } from "@prisma/client";
import { env } from "../config/env.js";
import { shopifyGraphql } from "./shopify.js";

interface WebhookCreateResponse {
  webhookSubscriptionCreate: {
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

async function registerWebhook(shop: Shop, topic: "APP_UNINSTALLED" | "APP_SUBSCRIPTIONS_UPDATE") {
  const data = await shopifyGraphql<WebhookCreateResponse>(
    shop.domain,
    shop.accessToken,
    `mutation WebhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $callbackUrl: URL!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: { callbackUrl: $callbackUrl, format: JSON }) {
        userErrors {
          field
          message
        }
      }
    }`,
    {
      topic,
      callbackUrl: `${env.APP_URL}/webhooks/shopify`
    }
  );

  const errors = data.webhookSubscriptionCreate.userErrors;
  if (errors.length) {
    throw new Error(errors.map((error) => error.message).join(" "));
  }
}

export async function registerCoreWebhooks(shop: Shop) {
  const topics: Array<"APP_UNINSTALLED" | "APP_SUBSCRIPTIONS_UPDATE"> = [
    "APP_UNINSTALLED",
    "APP_SUBSCRIPTIONS_UPDATE"
  ];

  for (const topic of topics) {
    try {
      await registerWebhook(shop, topic);
    } catch (error) {
      console.warn(`Could not register ${topic} webhook for ${shop.domain}`, error);
    }
  }
}
