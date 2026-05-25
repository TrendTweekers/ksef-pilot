import type { Shop } from "@prisma/client";
import { env } from "../config/env.js";
import { shopifyGraphql } from "./shopify.js";

interface WebhookCreateResponse {
  webhookSubscriptionCreate: {
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

export type CoreWebhookTopic =
  | "APP_UNINSTALLED"
  | "APP_SUBSCRIPTIONS_UPDATE"
  | "REFUNDS_CREATE"
  | "ORDERS_EDITED"
  | "ORDERS_UPDATED";

export const coreWebhookTopics: CoreWebhookTopic[] = [
  "APP_UNINSTALLED",
  "APP_SUBSCRIPTIONS_UPDATE",
  "REFUNDS_CREATE",
  "ORDERS_EDITED",
  "ORDERS_UPDATED"
];

async function registerWebhook(shop: Shop, topic: CoreWebhookTopic) {
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
  let installedTopics = new Set<string>();

  try {
    const status = await listCoreWebhookStatus(shop);
    installedTopics = new Set(status.filter((entry) => entry.installed).map((entry) => entry.topic));
  } catch (error) {
    console.warn(`Could not list existing webhooks for ${shop.domain}; attempting registration anyway`, error);
  }

  for (const topic of coreWebhookTopics) {
    if (installedTopics.has(topic)) {
      continue;
    }

    try {
      await registerWebhook(shop, topic);
    } catch (error) {
      console.warn(`Could not register ${topic} webhook for ${shop.domain}`, error);
    }
  }
}

interface WebhookListResponse {
  webhookSubscriptions: {
    nodes: Array<{
      id: string;
      topic: CoreWebhookTopic | string;
      endpoint: {
        callbackUrl?: string | null;
      } | null;
    }>;
  };
}

export async function listCoreWebhookStatus(shop: Shop) {
  const data = await shopifyGraphql<WebhookListResponse>(
    shop.domain,
    shop.accessToken,
    `query KsefPilotWebhookStatus {
      webhookSubscriptions(first: 100) {
        nodes {
          id
          topic
          endpoint {
            ... on WebhookHttpEndpoint {
              callbackUrl
            }
          }
        }
      }
    }`
  );
  const expectedCallbackUrl = `${env.APP_URL}/webhooks/shopify`;

  return coreWebhookTopics.map((topic) => {
    const match = data.webhookSubscriptions.nodes.find(
      (node) => node.topic === topic && node.endpoint?.callbackUrl === expectedCallbackUrl
    );

    return {
      topic,
      installed: Boolean(match),
      callbackUrl: match?.endpoint?.callbackUrl ?? null
    };
  });
}
