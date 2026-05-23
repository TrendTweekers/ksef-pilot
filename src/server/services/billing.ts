import type { Shop } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { shopifyGraphql } from "./shopify.js";

export const billingPlans = {
  free: { name: "Free", price: 0, limit: 5 },
  basic: { name: "Basic", price: 9.99, limit: 50 },
  pro: { name: "Pro", price: 19.99, limit: 200 },
  unlimited: { name: "Unlimited", price: 39.99, limit: null }
} as const;

export type BillingPlanHandle = keyof typeof billingPlans;

export function normalizePlan(plan: string | null | undefined): BillingPlanHandle {
  return plan && plan in billingPlans ? (plan as BillingPlanHandle) : "free";
}

export function monthStart(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function getBillingSummary(shop: Shop) {
  const planHandle = normalizePlan(shop.plan);
  const plan = billingPlans[planHandle];
  const used = await prisma.ksefInvoice.count({
    where: {
      shopId: shop.id,
      createdAt: { gte: monthStart() }
    }
  });

  return {
    plan: planHandle,
    planName: plan.name,
    limit: plan.limit,
    used,
    remaining: plan.limit === null ? null : Math.max(0, plan.limit - used),
    billingStatus: shop.billingStatus ?? (planHandle === "free" ? "free" : "unknown"),
    subscriptionId: shop.billingSubscriptionId,
    canGenerate: plan.limit === null || used < plan.limit
  };
}

export async function assertCanGenerateInvoice(shop: Shop) {
  const summary = await getBillingSummary(shop);

  if (!summary.canGenerate) {
    throw new Error(
      `Monthly invoice limit reached for ${summary.planName}. Upgrade your plan to generate more invoices.`
    );
  }
}

interface AppSubscriptionCreateResponse {
  appSubscriptionCreate: {
    confirmationUrl: string | null;
    appSubscription: { id: string } | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

export async function createBillingSubscription(shop: Shop, planHandle: BillingPlanHandle) {
  const plan = billingPlans[planHandle];

  if (planHandle === "free") {
    const updated = await prisma.shop.update({
      where: { id: shop.id },
      data: {
        plan: "free",
        billingStatus: "free",
        billingSubscriptionId: null
      }
    });
    return { confirmationUrl: null, shop: updated };
  }

  const data = await shopifyGraphql<AppSubscriptionCreateResponse>(
    shop.domain,
    shop.accessToken,
    `mutation AppSubscriptionCreate($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!, $test: Boolean!) {
      appSubscriptionCreate(name: $name, returnUrl: $returnUrl, lineItems: $lineItems, test: $test, replacementBehavior: APPLY_IMMEDIATELY) {
        confirmationUrl
        appSubscription {
          id
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      name: `KSeF Pilot ${plan.name}`,
      returnUrl: `${env.APP_URL}/api/billing/confirm?shop=${encodeURIComponent(shop.domain)}&plan=${planHandle}`,
      test: env.SHOPIFY_BILLING_TEST,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: {
                amount: plan.price,
                currencyCode: "USD"
              },
              interval: "EVERY_30_DAYS"
            }
          }
        }
      ]
    }
  );

  const result = data.appSubscriptionCreate;
  if (result.userErrors.length) {
    throw new Error(result.userErrors.map((error) => error.message).join(" "));
  }

  if (!result.confirmationUrl) {
    throw new Error("Shopify did not return a billing confirmation URL.");
  }

  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      plan: planHandle,
      billingStatus: "pending",
      billingSubscriptionId: result.appSubscription?.id ?? null
    }
  });

  return { confirmationUrl: result.confirmationUrl, shop };
}

export async function markBillingConfirmed(shop: Shop, planHandle: BillingPlanHandle) {
  return prisma.shop.update({
    where: { id: shop.id },
    data: {
      plan: planHandle,
      billingStatus: planHandle === "free" ? "free" : "active"
    }
  });
}
