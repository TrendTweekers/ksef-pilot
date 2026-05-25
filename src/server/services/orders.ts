import type { Shop } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import type { Fa3InvoiceData } from "./fa3.js";
import { buildFa3Xml, validateFa3Input } from "./fa3.js";
import { shopifyGraphql } from "./shopify.js";
import { assertCanGenerateInvoice } from "./billing.js";
import { getNbpTableARateForPreviousBusinessDay, type NbpExchangeRateResult } from "./nbp.js";

const CUSTOMER_NIP_METAFIELDS = [
  { namespace: "custom", key: "nip" },
  { namespace: "fakturaflow", key: "nip" },
  { namespace: "ksef", key: "nip" },
  { namespace: "custom", key: "nip_number" },
  { namespace: "custom", key: "vat_id" },
  { namespace: "custom", key: "vat_number" },
  { namespace: "custom", key: "tax_id" },
  { namespace: "custom", key: "company_nip" }
];

const nipMetafieldKeys = CUSTOMER_NIP_METAFIELDS.map((field) => `${field.namespace}.${field.key}`);

const nipMetafieldKeysGraphql = `[${nipMetafieldKeys.map((key) => `"${key}"`).join(", ")}]`;

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

interface MetafieldConnection {
  nodes: Array<{
    namespace: string;
    key: string;
    value: string;
  }>;
}

interface CompanyAddress {
  address1: string;
  address2?: string | null;
  city?: string | null;
  zip?: string | null;
  country?: string | null;
  companyName: string;
  formattedAddress: string[];
}

interface PurchasingEntityCompany {
  __typename: "PurchasingCompany";
  company: {
    id: string;
    name: string;
    externalId?: string | null;
    metafields: MetafieldConnection;
  };
  location: {
    id: string;
    name: string;
    externalId?: string | null;
    taxRegistrationId?: string | null;
    billingAddress?: CompanyAddress | null;
    taxSettings: {
      taxRegistrationId?: string | null;
    };
    metafields: MetafieldConnection;
  };
}

interface PurchasingEntityCustomer {
  __typename: "Customer";
  id: string;
  displayName?: string | null;
  metafields?: MetafieldConnection;
}

interface ShopifyLineItemNode {
  id: string;
  name: string;
  quantity: number;
  discountedTotalSet: { shopMoney: Money };
  taxLines: Array<{
    rate: number;
    title?: string | null;
    priceSet: { shopMoney: Money };
  }>;
}

interface ShopifyRefundLineItemNode {
  id: string;
  quantity: number;
  subtotalSet: { shopMoney: Money };
  totalTaxSet: { shopMoney: Money };
  lineItem: {
    id: string;
    name: string;
  };
}

interface ShopifyRefundNode {
  id: string;
  createdAt: string;
  note?: string | null;
  refundLineItems: {
    nodes: ShopifyRefundLineItemNode[];
  };
}

interface ShopifyOrderNode {
  id: string;
  name: string;
  createdAt: string;
  currencyCode: string;
  taxesIncluded: boolean;
  currentTotalPriceSet: { shopMoney: Money };
  poNumber?: string | null;
  metafields: MetafieldConnection;
  purchasingEntity?: PurchasingEntityCompany | PurchasingEntityCustomer | null;
  customer?: {
    id: string;
    displayName?: string | null;
    defaultAddress?: Address | null;
    metafields: MetafieldConnection;
  } | null;
  lineItems: { nodes: ShopifyLineItemNode[] };
  refunds?: ShopifyRefundNode[];
}

interface ShopifyOrdersResponse {
  orders: {
    nodes: ShopifyOrderNode[];
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
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
  buyerJst: boolean;
  buyerGv: boolean;
  isB2b: boolean;
  processed: boolean;
  invoiceStatus?: string;
  ksefNumber?: string;
  unsupportedReason?: "non_pln" | "mixed_vat" | "missing_tax_lines";
}

interface OrderToFa3Options {
  buyerJst?: boolean;
  buyerGv?: boolean;
  exchangeRate?: number;
}

const orderFields = `
  id
  name
  createdAt
  currencyCode
  taxesIncluded
  currentTotalPriceSet {
    shopMoney {
      amount
      currencyCode
    }
  }
  poNumber
  metafields(first: 20, keys: ${nipMetafieldKeysGraphql}) {
    nodes {
      namespace
      key
      value
    }
  }
  purchasingEntity {
    __typename
    ... on Customer {
      id
      displayName
      metafields(first: 20, keys: ${nipMetafieldKeysGraphql}) {
        nodes {
          namespace
          key
          value
        }
      }
    }
    ... on PurchasingCompany {
      company {
        id
        name
        externalId
        metafields(first: 20, keys: ${nipMetafieldKeysGraphql}) {
          nodes {
            namespace
            key
            value
          }
        }
      }
      location {
        id
        name
        externalId
        taxRegistrationId
        taxSettings {
          taxRegistrationId
        }
        billingAddress {
          address1
          address2
          city
          zip
          country
          companyName
          formattedAddress
        }
        metafields(first: 20, keys: ${nipMetafieldKeysGraphql}) {
          nodes {
            namespace
            key
            value
          }
        }
      }
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
    metafields(first: 20, keys: ${nipMetafieldKeysGraphql}) {
      nodes {
        namespace
        key
        value
      }
    }
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
      taxLines {
        title
        rate
        priceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
      }
    }
  }
  refunds(first: 10) {
    id
    createdAt
    note
    refundLineItems(first: 50) {
      nodes {
        id
        quantity
        subtotalSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalTaxSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        lineItem {
          id
          name
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

function firstNip(values: Array<string | null | undefined>) {
  for (const value of values) {
    const nip = normalizeNip(value);
    if (nip.length === 10) return nip;
  }

  return "";
}

function addressLine(address?: Address | null) {
  if (!address) return undefined;
  return [address.address1, address.address2, address.zip, address.city, address.country]
    .filter(Boolean)
    .join(", ");
}

function companyAddressLine(address?: CompanyAddress | null) {
  if (!address) return undefined;
  if (address.formattedAddress?.length) return address.formattedAddress.join(", ");
  return [address.address1, address.address2, address.zip, address.city, address.country].filter(Boolean).join(", ");
}

function metafieldNip(metafields?: MetafieldConnection | null) {
  return firstNip(metafields?.nodes.map((metafield) => metafield.value) ?? []);
}

function purchasingCompany(order: ShopifyOrderNode) {
  return order.purchasingEntity?.__typename === "PurchasingCompany" ? order.purchasingEntity : null;
}

function orderNip(order: ShopifyOrderNode) {
  const company = purchasingCompany(order);

  return firstNip([
    company?.location.taxSettings.taxRegistrationId,
    company?.location.taxRegistrationId,
    company?.location.externalId,
    metafieldNip(company?.location.metafields),
    company?.company.externalId,
    metafieldNip(company?.company.metafields),
    metafieldNip(order.metafields),
    metafieldNip(order.customer?.metafields)
  ]);
}

function customerId(order: ShopifyOrderNode) {
  return order.customer?.id ?? null;
}

function orderBuyer(order: ShopifyOrderNode) {
  const customer = order.customer ?? null;
  const company = purchasingCompany(order);

  return {
    name: company?.location.billingAddress?.companyName || company?.company.name || customer?.displayName || "Shopify buyer",
    nip: orderNip(order),
    address: companyAddressLine(company?.location.billingAddress) || addressLine(customer?.defaultAddress)
  };
}

function buyerNipSource(order: ShopifyOrderNode) {
  const company = purchasingCompany(order);

  if (firstNip([company?.location.taxSettings.taxRegistrationId, company?.location.taxRegistrationId])) {
    return "Shopify B2B tax registration";
  }

  if (firstNip([company?.location.externalId, company?.company.externalId])) {
    return "Shopify B2B external ID";
  }

  if (firstNip([metafieldNip(company?.location.metafields), metafieldNip(company?.company.metafields)])) {
    return "Shopify company metafield";
  }

  if (metafieldNip(order.metafields)) {
    return "order metafield";
  }

  if (metafieldNip(order.customer?.metafields)) {
    return "customer metafield";
  }

  return undefined;
}

function domesticVatRateFromTaxLines(taxLines: ShopifyLineItemNode["taxLines"]): "23" | "8" | "5" | null {
  if (taxLines.length !== 1) {
    return null;
  }

  const rate = Number(taxLines[0]?.rate);
  if (Math.abs(rate - 0.23) < 0.001) return "23";
  if (Math.abs(rate - 0.08) < 0.001) return "8";
  if (Math.abs(rate - 0.05) < 0.001) return "5";
  return null;
}

function invoiceSupportIssue(order: ShopifyOrderNode): OrderListItem["unsupportedReason"] {
  for (const line of order.lineItems.nodes) {
    if (!line.taxLines.length) {
      return "missing_tax_lines";
    }

    if (!domesticVatRateFromTaxLines(line.taxLines)) {
      return "mixed_vat";
    }
  }

  return undefined;
}

function lineTaxAmount(line: ShopifyLineItemNode) {
  return roundMoney(line.taxLines.reduce((sum, taxLine) => sum + toNumber(taxLine.priceSet.shopMoney.amount), 0));
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
      ? buyerNipSource(order)
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
    buyerJst: flag?.buyerJst ?? false,
    buyerGv: flag?.buyerGv ?? false,
    isB2b: flag?.isB2b ?? Boolean(buyerNip),
    processed: Boolean(flag?.processedAt ?? invoice),
    invoiceStatus: invoice?.status,
    ksefNumber: invoice?.ksefNumber ?? undefined,
    unsupportedReason: invoiceSupportIssue(order)
  };
}

export async function fetchShopifyOrders(shop: Shop, onlyUnprocessedB2b: boolean) {
  const scanLimit = env.SHOPIFY_ORDER_SCAN_LIMIT;
  const nodes: ShopifyOrderNode[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage && nodes.length < scanLimit) {
    const first = Math.min(250, scanLimit - nodes.length);
    const data: ShopifyOrdersResponse = await shopifyGraphql<ShopifyOrdersResponse>(
      shop.domain,
      shop.accessToken,
      `query KsefPilotOrders($first: Int!, $after: String) {
        orders(first: $first, after: $after, query: "status:any", sortKey: CREATED_AT, reverse: true) {
          nodes {
            ${orderFields}
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`,
      { first, after: cursor }
    );

    nodes.push(...data.orders.nodes);
    cursor = data.orders.pageInfo.endCursor;
    hasNextPage = data.orders.pageInfo.hasNextPage && Boolean(cursor);
  }

  const orderIds = nodes.map((order) => order.id);
  const customerIds = nodes.map(customerId).filter((id): id is string => Boolean(id));
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
  const profileBackfills = nodes.flatMap((order) => {
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
  const orders = nodes.map((order) => toOrderListItem(order, flagMap, invoiceMap, buyerProfileMap));

  return {
    orders: onlyUnprocessedB2b ? orders.filter((order) => order.isB2b && !order.processed) : orders,
    scanned: nodes.length,
    scanLimit,
    hasMore: hasNextPage
  };
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

function orderToFa3(shop: Shop, order: ShopifyOrderNode, buyerNip: string, buyerName: string, options?: OrderToFa3Options): Fa3InvoiceData {
  if (!shop.sellerNip || !shop.sellerName) {
    throw new Error("Seller NIP and seller name are required in KSeF Settings before invoice generation.");
  }

  const supportIssue = invoiceSupportIssue(order);
  if (supportIssue === "missing_tax_lines") {
    throw new Error("This order is not yet supported because at least one line item has no Shopify tax line. Tax-exempt and zero-tax invoices should be issued manually for now.");
  }

  if (supportIssue === "mixed_vat") {
    throw new Error("This order is not yet supported because it contains VAT rates outside the supported 23%, 8%, and 5% range, or multiple Shopify tax lines on one item. Issue this invoice manually for now.");
  }

  const invoiceCurrency = order.currencyCode;

  const buyer = orderBuyer(order);
  const lineItems = order.lineItems.nodes.map((line) => {
    const lineAmount = roundMoney(toNumber(line.discountedTotalSet.shopMoney.amount));
    const vat = lineTaxAmount(line);
    const net = order.taxesIncluded ? roundMoney(lineAmount - vat) : lineAmount;
    const gross = order.taxesIncluded ? lineAmount : roundMoney(net + vat);
    const quantity = Math.max(1, line.quantity);

    return {
      name: line.name,
      unit: "szt.",
      quantity,
      unitPrice: roundMoney(net / quantity),
      vatRate: domesticVatRateFromTaxLines(line.taxLines) ?? "23",
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
    buyerJst: options?.buyerJst ?? false,
    buyerGv: options?.buyerGv ?? false,
    amountNet,
    amountVat,
    amountGross,
    currency: invoiceCurrency,
    exchangeRate: options?.exchangeRate,
    sourceSystem: "KSeF Pilot Shopify",
    lineItems
  };
}

async function exchangeRateForOrder(order: ShopifyOrderNode) {
  if (order.currencyCode === "PLN") {
    return null;
  }

  const rate = await getNbpTableARateForPreviousBusinessDay(order.currencyCode, new Date());

  if (!rate) {
    throw new Error(`Could not find an NBP Table A exchange rate for ${order.currencyCode}. Issue this invoice manually for now.`);
  }

  return rate;
}

function exchangeRateData(rate: NbpExchangeRateResult | null, gross: number) {
  if (!rate) {
    return {
      exchangeRate: null,
      exchangeRateDate: null,
      exchangeRateTableNo: null,
      totalGrossPln: gross
    };
  }

  return {
    exchangeRate: rate.rate,
    exchangeRateDate: new Date(`${rate.rateDate}T00:00:00.000Z`),
    exchangeRateTableNo: rate.tableNo,
    totalGrossPln: roundMoney(gross * rate.rate)
  };
}

function refundCorrectionItems(order: ShopifyOrderNode) {
  const refundItems = (order.refunds ?? []).flatMap((refund) =>
    refund.refundLineItems.nodes.map((refundItem) => ({
      refund,
      refundItem
    }))
  );

  if (!refundItems.length) {
    return [];
  }

  return refundItems.map(({ refundItem }) => {
    const quantity = Math.max(1, refundItem.quantity);
    const totalNet = -roundMoney(toNumber(refundItem.subtotalSet.shopMoney.amount));
    const totalVat = -roundMoney(toNumber(refundItem.totalTaxSet.shopMoney.amount));

    return {
      name: `Korekta refundu: ${refundItem.lineItem.name}`,
      unit: "szt.",
      quantity,
      unitPrice: roundMoney(totalNet / quantity),
      vatRate: "23" as const,
      totalNet,
      totalVat,
      totalGross: roundMoney(totalNet + totalVat)
    };
  });
}

export async function saveOrderFlag(shop: Shop, input: { orderId: string; orderName: string; isB2b: boolean; nip?: string; buyerName?: string; buyerJst?: boolean; buyerGv?: boolean }) {
  const flag = await prisma.orderFlag.upsert({
    where: { shopId_orderId: { shopId: shop.id, orderId: input.orderId } },
    create: {
      shopId: shop.id,
      orderId: input.orderId,
      orderName: input.orderName,
      isB2b: input.isB2b,
      nip: normalizeNip(input.nip),
      buyerName: input.buyerName,
      buyerJst: input.buyerJst ?? false,
      buyerGv: input.buyerGv ?? false
    },
    update: {
      orderName: input.orderName,
      isB2b: input.isB2b,
      nip: normalizeNip(input.nip),
      buyerName: input.buyerName,
      buyerJst: input.buyerJst ?? false,
      buyerGv: input.buyerGv ?? false
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

export async function generateDraftInvoiceForOrder(shop: Shop, input: { orderId: string; buyerNip: string; buyerName: string; buyerJst?: boolean; buyerGv?: boolean }) {
  const order = await fetchShopifyOrder(shop, input.orderId);
  const buyerNip = normalizeNip(input.buyerNip);
  const buyerName = input.buyerName.trim() || orderBuyer(order).name;

  const existing = await prisma.ksefInvoice.findFirst({
    where: { shopId: shop.id, orderId: order.id, correctionOf: null },
    orderBy: { createdAt: "desc" },
    include: { items: true }
  });

  if (existing) {
    const buyerChanged = existing.nip !== buyerNip || existing.buyerName !== buyerName;
    if (buyerChanged && existing.status === "draft" && !existing.ksefNumber) {
      const rate = await exchangeRateForOrder(order);
      const fa3 = orderToFa3(shop, order, buyerNip, buyerName, { ...input, exchangeRate: rate?.rate });
      const validation = validateFa3Input(fa3);

      if (!validation.valid) {
        throw new Error(validation.errors.join(" "));
      }

      const fa3Xml = buildFa3Xml(fa3);
      const invoice = await prisma.$transaction(async (tx) => {
        await tx.invoiceItem.deleteMany({ where: { invoiceId: existing.id } });
        return tx.ksefInvoice.update({
          where: { id: existing.id },
          data: {
            nip: buyerNip,
            buyerName,
            fa3Xml,
            currency: fa3.currency ?? "PLN",
            totalGross: fa3.amountGross,
            ...exchangeRateData(rate, fa3.amountGross),
            fa3ValidatedAt: null,
            fa3ValidationStatus: null,
            fa3ValidationError: null,
            lastError: null,
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
          buyerJst: input.buyerJst ?? false,
          buyerGv: input.buyerGv ?? false,
          processedAt: new Date()
        },
        update: {
          orderName: order.name,
          isB2b: true,
          nip: buyerNip,
          buyerName,
          buyerJst: input.buyerJst ?? false,
          buyerGv: input.buyerGv ?? false,
          processedAt: new Date()
        }
      });

      await rememberBuyerProfile(shop, order, buyerNip, buyerName, "manual");

      return { invoice, reused: false };
    }

    return { invoice: existing, reused: true };
  }

  await assertCanGenerateInvoice(shop);

  const rate = await exchangeRateForOrder(order);
  const fa3 = orderToFa3(shop, order, buyerNip, buyerName, { ...input, exchangeRate: rate?.rate });
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
      currency: fa3.currency ?? "PLN",
      totalGross: fa3.amountGross,
      ...exchangeRateData(rate, fa3.amountGross),
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
      buyerJst: input.buyerJst ?? false,
      buyerGv: input.buyerGv ?? false,
      processedAt: new Date()
    },
    update: {
      orderName: order.name,
      isB2b: true,
      nip: buyerNip,
      buyerName,
      buyerJst: input.buyerJst ?? false,
      buyerGv: input.buyerGv ?? false,
      processedAt: new Date()
    }
  });

  await rememberBuyerProfile(shop, order, buyerNip, buyerName, "invoice");

  return { invoice, reused: false };
}

export async function generateCorrectionForInvoice(shop: Shop, invoiceId: string, reason = "Zwrot lub korekta zamówienia Shopify") {
  const original = await prisma.ksefInvoice.findFirst({
    where: {
      id: invoiceId,
      shopId: shop.id,
      correctionOf: null
    },
    include: {
      items: true
    }
  });

  if (!original) {
    throw new Error("Original invoice was not found.");
  }

  const existing = await prisma.ksefInvoice.findFirst({
    where: {
      shopId: shop.id,
      correctionOf: original.id
    },
    orderBy: { createdAt: "desc" },
    include: { items: true }
  });

  if (existing) {
    return { invoice: existing, reused: true };
  }

  await assertCanGenerateInvoice(shop);

  if (!shop.sellerNip || !shop.sellerName) {
    throw new Error("Seller NIP and seller name are required in KSeF Settings before correction generation.");
  }

  const order = await fetchShopifyOrder(shop, original.orderId);
  const refundedItems = refundCorrectionItems(order);
  const lineItems = refundedItems.length
    ? refundedItems
    : original.items.map((item) => {
        const unitPrice = -roundMoney(Number(item.unitPrice));
        const totalNet = -roundMoney(Number(item.totalNet));
        const totalVat = -roundMoney(Number(item.totalVat));

        return {
          name: `Korekta: ${item.name}`,
          unit: "szt.",
          quantity: Math.max(1, item.quantity),
          unitPrice,
          vatRate: item.vatRate as "23",
          totalNet,
          totalVat,
          totalGross: roundMoney(totalNet + totalVat)
        };
      });

  const amountNet = roundMoney(lineItems.reduce((sum, item) => sum + item.totalNet, 0));
  const amountVat = roundMoney(lineItems.reduce((sum, item) => sum + item.totalVat, 0));
  const amountGross = roundMoney(lineItems.reduce((sum, item) => sum + item.totalGross, 0));
  const issueDate = new Date().toISOString().slice(0, 10);
  const originalInvoiceNumber = `KSEF-${original.orderName.replace(/[^A-Za-z0-9-]/g, "")}`;
  const invoiceNumber = `${originalInvoiceNumber}-KOR`;

  const fa3: Fa3InvoiceData = {
    invoiceNumber,
    issueDate,
    saleDate: issueDate,
    invoiceType: "KOR",
    placeOfIssue: shop.placeOfIssue ?? "Warszawa",
    sellerNip: shop.sellerNip,
    sellerName: shop.sellerName,
    sellerAddress: shop.sellerAddress ?? shop.placeOfIssue ?? undefined,
    buyerNip: original.nip,
    buyerName: original.buyerName,
    amountNet,
    amountVat,
    amountGross,
    currency: "PLN",
    sourceSystem: "KSeF Pilot Shopify",
    correctionOfInvoiceNumber: originalInvoiceNumber,
    correctionReason: refundedItems.length ? `${reason}. Wykryto pozycje refundu Shopify.` : reason,
    lineItems
  };
  const validation = validateFa3Input(fa3);

  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }

  const fa3Xml = buildFa3Xml(fa3);

  const correction = await prisma.ksefInvoice.create({
    data: {
      shopId: shop.id,
      orderId: original.orderId,
      orderName: `${original.orderName} correction`,
      nip: original.nip,
      buyerName: original.buyerName,
      fa3Xml,
      status: "draft",
      correctionOf: original.id,
      totalGross: amountGross,
      items: {
        create: lineItems.map((item) => ({
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

  await prisma.ksefInvoice.update({
    where: { id: original.id },
    data: { status: original.status === "submitted" ? "corrected" : original.status }
  });

  return { invoice: correction, reused: false };
}
