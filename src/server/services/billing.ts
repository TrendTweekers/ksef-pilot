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

const paidBillingStatuses = new Set(["active", "accepted", "trial", "trialing"]);
const inactiveBillingStatuses = new Set([
  "cancelled",
  "canceled",
  "declined",
  "expired",
  "frozen",
  "paused",
  "pending",
  "uninstalled"
]);

export function normalizePlan(plan: string | null | undefined): BillingPlanHandle {
  return plan && plan in billingPlans ? (plan as BillingPlanHandle) : "free";
}

export function normalizeBillingStatus(status: string | null | undefined) {
  return status?.trim().toLowerCase() ?? null;
}

export function isPaidBillingStatus(status: string | null | undefined) {
  const normalized = normalizeBillingStatus(status);
  return normalized ? paidBillingStatuses.has(normalized) : false;
}

export function isInactiveBillingStatus(status: string | null | undefined) {
  const normalized = normalizeBillingStatus(status);
  return normalized ? inactiveBillingStatuses.has(normalized) : false;
}

export function effectivePlan(shop: Shop): BillingPlanHandle {
  const storedPlan = normalizePlan(shop.plan);

  if (storedPlan === "free") {
    return "free";
  }

  return isPaidBillingStatus(shop.billingStatus) ? storedPlan : "free";
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
  const storedPlan = normalizePlan(shop.plan);
  const planHandle = effectivePlan(shop);
  const plan = billingPlans[planHandle];
  const used = await prisma.ksefInvoice.count({
    where: {
      shopId: shop.id,
      createdAt: { gte: monthStart() }
    }
  });

  return {
    plan: planHandle,
    storedPlan,
    planName: plan.name,
    limit: plan.limit,
    used,
    remaining: plan.limit === null ? null : Math.max(0, plan.limit - used),
    billingStatus: shop.billingStatus ?? (storedPlan === "free" ? "free" : "unknown"),
    subscriptionId: shop.billingSubscriptionId,
    paidPlanInactive: storedPlan !== "free" && planHandle === "free",
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

function nestedRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const found = stringValue(value);
    if (found) return found;
  }
  return null;
}

function collectPayloadValues(value: unknown, strings: string[], numbers: number[], depth = 0) {
  if (depth > 8 || value === null || value === undefined) return;

  if (typeof value === "string") {
    strings.push(value);
    const numeric = Number.parseFloat(value);
    if (Number.isFinite(numeric)) {
      numbers.push(numeric);
    }
    return;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    numbers.push(value);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => collectPayloadValues(entry, strings, numbers, depth + 1));
    return;
  }

  if (typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((entry) => collectPayloadValues(entry, strings, numbers, depth + 1));
  }
}

function planFromStrings(strings: string[]): BillingPlanHandle | null {
  const haystack = strings.join(" ").toLowerCase();

  if (haystack.includes("unlimited")) return "unlimited";
  if (haystack.includes("pro")) return "pro";
  if (haystack.includes("basic")) return "basic";
  if (haystack.includes("free")) return "free";

  return null;
}

function planFromPrices(numbers: number[]): BillingPlanHandle | null {
  const prices = Object.entries(billingPlans)
    .filter(([handle]) => handle !== "free")
    .map(([handle, plan]) => [handle as BillingPlanHandle, plan.price] as const);

  for (const number of numbers) {
    for (const [handle, price] of prices) {
      if (Math.abs(number - price) < 0.01) {
        return handle;
      }
    }
  }

  return null;
}

export function parseBillingWebhook(payload: Record<string, unknown>) {
  const appSubscription =
    nestedRecord(payload.app_subscription) ??
    nestedRecord(payload.appSubscription) ??
    nestedRecord(payload.subscription) ??
    payload;
  const lineItem = Array.isArray(appSubscription.line_items)
    ? nestedRecord(appSubscription.line_items[0])
    : nestedRecord(appSubscription.lineItem);
  const plan = nestedRecord(appSubscription.plan) ?? nestedRecord(lineItem?.plan);
  const pricingDetails =
    nestedRecord(plan?.pricing_details) ??
    nestedRecord(plan?.pricingDetails) ??
    nestedRecord(lineItem?.pricing_details) ??
    nestedRecord(lineItem?.pricingDetails);

  const status = firstString(appSubscription.status, payload.status);
  const subscriptionId = firstString(
    appSubscription.admin_graphql_api_id,
    appSubscription.adminGraphqlApiId,
    appSubscription.id,
    payload.admin_graphql_api_id,
    payload.subscription_id
  );

  const strings: string[] = [];
  const numbers: number[] = [];
  collectPayloadValues(
    {
      name: appSubscription.name,
      planName: plan?.name,
      pricingName: pricingDetails?.name,
      lineItemName: lineItem?.name
    },
    strings,
    numbers
  );
  collectPayloadValues(pricingDetails, strings, numbers);

  return {
    status,
    subscriptionId,
    plan: planFromStrings(strings) ?? planFromPrices(numbers)
  };
}

export async function applyBillingWebhookUpdate(shopDomain: string, payload: Record<string, unknown>) {
  const parsed = parseBillingWebhook(payload);
  const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });

  if (!shop) {
    return { shop: null, parsed, previousPlan: null, nextPlan: null };
  }

  const previousPlan = normalizePlan(shop.plan);
  const nextPlan =
    parsed.status && isInactiveBillingStatus(parsed.status)
      ? "free"
      : parsed.plan ?? previousPlan;

  const updated = await prisma.shop.update({
    where: { id: shop.id },
    data: {
      plan: nextPlan,
      billingStatus: parsed.status ?? "updated",
      billingSubscriptionId: parsed.status && isInactiveBillingStatus(parsed.status) ? null : parsed.subscriptionId ?? shop.billingSubscriptionId
    }
  });

  return {
    shop: updated,
    parsed,
    previousPlan,
    nextPlan: effectivePlan(updated)
  };
}
