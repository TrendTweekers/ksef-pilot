import type { Shop } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import type { Fa3InvoiceData } from "./fa3.js";
import { buildFa3Xml, validateFa3Input } from "./fa3.js";
import { shopifyGraphql } from "./shopify.js";
import { assertCanGenerateInvoice } from "./billing.js";

const CUSTOMER_NIP_METAFIELDS = [
  { namespace: "custom", key: "nip" },
  { namespace: "fakturaflow", key: "nip" },
  { namespace: "ksef", key: "nip" }
];

interface Money {
  amount: string;
  currencyCode: string;
}

interface Address {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  zip?: string | null;
  country?: string | null;
}

interface ShopifyLineItemNode {
  id: string;
  name: string;
  quantity: number;
  discountedTotalSet: { shopMoney: Money };
}

interface ShopifyOrderNode {
  id: string;
  name: string;
  createdAt: string;
  currencyCode: string;
  currentTotalPriceSet: { shopMoney: Money };
  customer?: {
    id: string;
    displayName?: string | null;
    defaultAddress?: Address | null;
    nip1?: { value: string } | null;
    nip2?: { value: string } | null;
    nip3?: { value: string } | null;
  } | null;
  lineItems: { nodes: ShopifyLineItemNode[] };
}

interface ShopifyOrdersResponse {
  orders: {
    nodes: ShopifyOrderNode[];
  };
}

interface ShopifyOrderResponse {
  order: ShopifyOrderNode | null;
}

export interface OrderListItem {
  id: string;
  name: string;
  createdAt: string;
  currency: string;
  totalGross: number;
  buyerName: string;
  buyerNip: string;
  nipSource?: string;
  isB2b: boolean;
  processed: boolean;
  invoiceStatus?: string;
  ksefNumber?: string;
}

const orderFields = `
  id
  name
  createdAt
  currencyCode
  currentTotalPriceSet {
    shopMoney {
      amount
      currencyCode
    }
  }
  customer {
    id
    displayName
    defaultAddress {
      address1
      address2
      city
      zip
      country
    }
    nip1: metafield(namespace: "${CUSTOMER_NIP_METAFIELDS[0].namespace}", key: "${CUSTOMER_NIP_METAFIELDS[0].key}") { value }
    nip2: metafield(namespace: "${CUSTOMER_NIP_METAFIELDS[1].namespace}", key: "${CUSTOMER_NIP_METAFIELDS[1].key}") { value }
    nip3: metafield(namespace: "${CUSTOMER_NIP_METAFIELDS[2].namespace}", key: "${CUSTOMER_NIP_METAFIELDS[2].key}") { value }
  }
  lineItems(first: 50) {
    nodes {
      id
      name
      quantity
      discountedTotalSet {
        shopMoney {
          amount
          currencyCode
        }
      }
    }
  }
`;

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeNip(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "").slice(0, 10);
}

function addressLine(address?: Address | null) {
  if (!address) return undefined;
  return [address.address1, address.address2, address.zip, address.city, address.country]
    .filter(Boolean)
    .join(", ");
}

function customerNip(customer: ShopifyOrderNode["customer"]) {
  return normalizeNip(customer?.nip1?.value ?? customer?.nip2?.value ?? customer?.nip3?.value);
}

function customerId(order: ShopifyOrderNode) {
  return order.customer?.id ?? null;
}

function orderBuyer(order: ShopifyOrderNode) {
  const customer = order.customer ?? null;

  return {
    name: customer?.displayName ?? "Shopify buyer",
    nip: customerNip(customer),
    address: addressLine(customer?.defaultAddress)
  };
}

function toOrderListItem(
  order: ShopifyOrderNode,
  flags: Map<string, Awaited<ReturnType<typeof prisma.orderFlag.findMany>>[number]>,
  invoices: Map<string, Awaited<ReturnType<typeof prisma.ksefInvoice.findMany>>[number]>,
  buyerProfiles: Map<string, Awaited<ReturnType<typeof prisma.customerBuyerProfile.findMany>>[number]>
): OrderListItem {
  const buyer = orderBuyer(order);
  const flag = flags.get(order.id);
  const invoice = invoices.get(order.id);
  const profile = order.customer?.id ? buyerProfiles.get(order.customer.id) : undefined;
  const buyerNip = flag?.nip || buyer.nip || profile?.nip || "";
  const nipSource = flag?.nip
    ? "saved on order"
    : buyer.nip
      ? "customer metafield"
      : profile?.nip
        ? "remembered customer"
        : undefined;

  return {
    id: order.id,
    name: order.name,
    createdAt: order.createdAt,
    currency: order.currencyCode,
    totalGross: toNumber(order.currentTotalPriceSet.shopMoney.amount),
    buyerName: flag?.buyerName ?? profile?.buyerName ?? buyer.name,
    buyerNip,
    nipSource,
    isB2b: flag?.isB2b ?? Boolean(buyerNip),
    processed: Boolean(flag?.processedAt ?? invoice),
    invoiceStatus: invoice?.status,
    ksefNumber: invoice?.ksefNumber ?? undefined
  };
}

export async function fetchShopifyOrders(shop: Shop, onlyUnprocessedB2b: boolean) {
  const data = await shopifyGraphql<ShopifyOrdersResponse>(
    shop.domain,
    shop.accessToken,
    `query KsefPilotOrders {
      orders(first: 25, query: "status:any", sortKey: CREATED_AT, reverse: true) {
        nodes {
          ${orderFields}
        }
      }
    }`
  );

  const orderIds = data.orders.nodes.map((order) => order.id);
  const customerIds = data.orders.nodes.map(customerId).filter((id): id is string => Boolean(id));
  const [flags, invoices, buyerProfiles] = await Promise.all([
    prisma.orderFlag.findMany({ where: { shopId: shop.id, orderId: { in: orderIds } } }),
    prisma.ksefInvoice.findMany({
      where: { shopId: shop.id, orderId: { in: orderIds } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.customerBuyerProfile.findMany({ where: { shopId: shop.id, customerId: { in: customerIds } } })
  ]);

  const flagMap = new Map(flags.map((flag) => [flag.orderId, flag]));
  const invoiceMap = new Map(invoices.map((invoice) => [invoice.orderId, invoice]));
  const buyerProfileMap = new Map(buyerProfiles.map((profile) => [profile.customerId, profile]));
  const profileBackfills = data.orders.nodes.flatMap((order) => {
    const flag = flagMap.get(order.id);
    const nip = normalizeNip(flag?.nip);

    if (!order.customer?.id || !nip || buyerProfileMap.has(order.customer.id)) {
      return [];
    }

    buyerProfileMap.set(order.customer.id, {
      id: `pending-${order.customer.id}`,
      shopId: shop.id,
      customerId: order.customer.id,
      nip,
      buyerName: flag?.buyerName ?? orderBuyer(order).name,
      source: "order-flag",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return [
      prisma.customerBuyerProfile.upsert({
        where: { shopId_customerId: { shopId: shop.id, customerId: order.customer.id } },
        create: {
          shopId: shop.id,
          customerId: order.customer.id,
          nip,
          buyerName: flag?.buyerName ?? orderBuyer(order).name,
          source: "order-flag"
        },
        update: {
          nip,
          buyerName: flag?.buyerName ?? orderBuyer(order).name,
          source: "order-flag"
        }
      })
    ];
  });

  await Promise.all(profileBackfills);
  const orders = data.orders.nodes.map((order) => toOrderListItem(order, flagMap, invoiceMap, buyerProfileMap));

  return onlyUnprocessedB2b ? orders.filter((order) => order.isB2b && !order.processed) : orders;
}

async function fetchShopifyOrder(shop: Shop, orderId: string) {
  const data = await shopifyGraphql<ShopifyOrderResponse>(
    shop.domain,
    shop.accessToken,
    `query KsefPilotOrder($id: ID!) {
      order(id: $id) {
        ${orderFields}
      }
    }`,
    { id: orderId }
  );

  if (!data.order) {
    throw new Error("Shopify order was not found.");
  }

  return data.order;
}

function orderToFa3(shop: Shop, order: ShopifyOrderNode, buyerNip: string, buyerName: string): Fa3InvoiceData {
  if (!shop.sellerNip || !shop.sellerName) {
    throw new Error("Seller NIP and seller name are required in KSeF Settings before invoice generation.");
  }

  if (order.currencyCode !== "PLN" && !env.ALLOW_NON_PLN_TEST_INVOICES) {
    throw new Error("MVP supports PLN invoices only.");
  }

  const invoiceCurrency = order.currencyCode === "PLN" ? "PLN" : "PLN";

  const buyer = orderBuyer(order);
  const lineItems = order.lineItems.nodes.map((line) => {
    const gross = roundMoney(toNumber(line.discountedTotalSet.shopMoney.amount));
    const net = roundMoney(gross / 1.23);
    const vat = roundMoney(gross - net);
    const quantity = Math.max(1, line.quantity);

    return {
      name: line.name,
      unit: "szt.",
      quantity,
      unitPrice: roundMoney(net / quantity),
      vatRate: "23" as const,
      totalNet: net,
      totalVat: vat,
      totalGross: gross
    };
  });

  const amountNet = roundMoney(lineItems.reduce((sum, item) => sum + item.totalNet, 0));
  const amountVat = roundMoney(lineItems.reduce((sum, item) => sum + item.totalVat, 0));
  const amountGross = roundMoney(lineItems.reduce((sum, item) => sum + item.totalGross, 0));

  return {
    invoiceNumber: `KSEF-${order.name.replace(/[^A-Za-z0-9-]/g, "")}`,
    issueDate: new Date().toISOString().slice(0, 10),
    saleDate: order.createdAt.slice(0, 10),
    placeOfIssue: shop.placeOfIssue ?? "Warszawa",
    sellerNip: shop.sellerNip,
    sellerName: shop.sellerName,
    sellerAddress: shop.sellerAddress ?? shop.placeOfIssue ?? undefined,
    buyerNip,
    buyerName,
    buyerAddress: buyer.address,
    amountNet,
    amountVat,
    amountGross,
    currency: invoiceCurrency,
    sourceSystem: "KSeF Pilot Shopify",
    lineItems
  };
}

export async function saveOrderFlag(shop: Shop, input: { orderId: string; orderName: string; isB2b: boolean; nip?: string; buyerName?: string }) {
  const flag = await prisma.orderFlag.upsert({
    where: { shopId_orderId: { shopId: shop.id, orderId: input.orderId } },
    create: {
      shopId: shop.id,
      orderId: input.orderId,
      orderName: input.orderName,
      isB2b: input.isB2b,
      nip: normalizeNip(input.nip),
      buyerName: input.buyerName
    },
    update: {
      orderName: input.orderName,
      isB2b: input.isB2b,
      nip: normalizeNip(input.nip),
      buyerName: input.buyerName
    }
  });

  if (input.isB2b && normalizeNip(input.nip)) {
    const order = await fetchShopifyOrder(shop, input.orderId);
    await rememberBuyerProfile(shop, order, normalizeNip(input.nip), input.buyerName, "manual");
  }

  return flag;
}

async function rememberBuyerProfile(
  shop: Shop,
  order: ShopifyOrderNode,
  nip: string,
  buyerName: string | undefined,
  source: "manual" | "invoice"
) {
  if (!order.customer?.id || !nip) return;

  await prisma.customerBuyerProfile.upsert({
    where: { shopId_customerId: { shopId: shop.id, customerId: order.customer.id } },
    create: {
      shopId: shop.id,
      customerId: order.customer.id,
      nip,
      buyerName: buyerName?.trim() || orderBuyer(order).name,
      source
    },
    update: {
      nip,
      buyerName: buyerName?.trim() || orderBuyer(order).name,
      source
    }
  });
}

export async function generateDraftInvoiceForOrder(shop: Shop, input: { orderId: string; buyerNip: string; buyerName: string }) {
  const order = await fetchShopifyOrder(shop, input.orderId);
  const buyerNip = normalizeNip(input.buyerNip);
  const buyerName = input.buyerName.trim() || orderBuyer(order).name;

  const existing = await prisma.ksefInvoice.findFirst({
    where: { shopId: shop.id, orderId: order.id, correctionOf: null },
    orderBy: { createdAt: "desc" },
    include: { items: true }
  });

  if (existing) {
    return { invoice: existing, reused: true };
  }

  await assertCanGenerateInvoice(shop);

  const fa3 = orderToFa3(shop, order, buyerNip, buyerName);
  const validation = validateFa3Input(fa3);

  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }

  const fa3Xml = buildFa3Xml(fa3);

  const invoice = await prisma.ksefInvoice.create({
    data: {
      shopId: shop.id,
      orderId: order.id,
      orderName: order.name,
      nip: buyerNip,
      buyerName,
      fa3Xml,
      status: "draft",
      totalGross: fa3.amountGross,
      items: {
        create: fa3.lineItems.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          vatRate: item.vatRate,
          totalNet: item.totalNet,
          totalVat: item.totalVat
        }))
      }
    },
    include: { items: true }
  });

  await prisma.orderFlag.upsert({
    where: { shopId_orderId: { shopId: shop.id, orderId: order.id } },
    create: {
      shopId: shop.id,
      orderId: order.id,
      orderName: order.name,
      isB2b: true,
      nip: buyerNip,
      buyerName,
      processedAt: new Date()
    },
    update: {
      orderName: order.name,
      isB2b: true,
      nip: buyerNip,
      buyerName,
      processedAt: new Date()
    }
  });

  await rememberBuyerProfile(shop, order, buyerNip, buyerName, "invoice");

  return { invoice, reused: false };
}
