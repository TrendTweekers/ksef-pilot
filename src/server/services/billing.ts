import type { Shop } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";

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

function shopAdminHandle(domain: string) {
  return domain.replace(/\.myshopify\.com$/i, "");
}

export function managedPricingUrl(shop: Shop) {
  return `https://admin.shopify.com/store/${shopAdminHandle(shop.domain)}/charges/${env.SHOPIFY_APP_HANDLE}/pricing_plans`;
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
    canGenerate: plan.limit === null || used < plan.limit,
    managedPricingUrl: managedPricingUrl(shop)
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
