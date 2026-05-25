import crypto from "node:crypto";
import { env, shopifyScopes } from "../config/env.js";

const shopPattern = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

export function normalizeShop(shop: unknown) {
  if (typeof shop !== "string") {
    return null;
  }

  const trimmed = shop.trim().toLowerCase();
  return shopPattern.test(trimmed) ? trimmed : null;
}

export function buildOAuthUrl(shop: string, state: string) {
  const callbackUrl = new URL("/auth/callback", env.APP_URL).toString();
  const params = new URLSearchParams({
    client_id: env.SHOPIFY_API_KEY,
    scope: shopifyScopes.join(","),
    redirect_uri: callbackUrl,
    state,
    "grant_options[]": ""
  });

  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

export function verifyShopifyHmac(query: Record<string, unknown>) {
  const hmac = query.hmac;

  if (typeof hmac !== "string") {
    return false;
  }

  const message = Object.entries(query)
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : String(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  if (!/^[a-f0-9]{64}$/i.test(hmac)) {
    return false;
  }

  const digest = crypto.createHmac("sha256", env.SHOPIFY_API_SECRET).update(message).digest("hex");
  const expected = Buffer.from(digest, "hex");
  const received = Buffer.from(hmac, "hex");

  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

interface SessionTokenPayload {
  iss?: string;
  dest?: string;
  aud?: string;
  sub?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  sid?: string;
}

function base64UrlToBuffer(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

// Verifies a Shopify App Bridge session token (HS256 JWT signed with the app secret).
// Returns the decoded payload only when the signature, algorithm, audience and lifetime all check out.
export function verifySessionToken(token: string): SessionTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [headerSegment, payloadSegment, signatureSegment] = parts;

  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(base64UrlToBuffer(headerSegment).toString("utf8"));
  } catch {
    return null;
  }

  if (header.alg !== "HS256") {
    return null;
  }

  const expected = crypto
    .createHmac("sha256", env.SHOPIFY_API_SECRET)
    .update(`${headerSegment}.${payloadSegment}`)
    .digest();
  const received = base64UrlToBuffer(signatureSegment);

  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return null;
  }

  let payload: SessionTokenPayload;
  try {
    payload = JSON.parse(base64UrlToBuffer(payloadSegment).toString("utf8"));
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const leeway = 5;

  if (typeof payload.exp !== "number" || payload.exp <= now - leeway) {
    return null;
  }
  if (typeof payload.nbf === "number" && payload.nbf > now + leeway) {
    return null;
  }
  if (payload.aud !== env.SHOPIFY_API_KEY) {
    return null;
  }

  try {
    if (new URL(String(payload.iss)).host !== new URL(String(payload.dest)).host) {
      return null;
    }
  } catch {
    return null;
  }

  return payload;
}

export function shopFromSessionToken(token: string) {
  const payload = verifySessionToken(token);
  if (!payload?.dest) {
    return null;
  }

  try {
    return normalizeShop(new URL(payload.dest).host);
  } catch {
    return null;
  }
}

export async function exchangeCodeForAccessToken(shop: string, code: string) {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      client_id: env.SHOPIFY_API_KEY,
      client_secret: env.SHOPIFY_API_SECRET,
      code
    })
  });

  if (!response.ok) {
    throw new Error(`Shopify token exchange failed with ${response.status}`);
  }

  const payload = (await response.json()) as { access_token: string; scope: string };
  return payload;
}

const shopifyApiVersion = process.env.SHOPIFY_API_VERSION ?? "2026-04";

interface ShopifyGraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export async function shopifyGraphql<T>(
  shop: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>
) {
  const response = await fetch(`https://${shop}/admin/api/${shopifyApiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Shopify-Access-Token": accessToken
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    throw new Error(`Shopify Admin API request failed with ${response.status}`);
  }

  const payload = (await response.json()) as ShopifyGraphqlResponse<T>;

  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join(" "));
  }

  if (!payload.data) {
    throw new Error("Shopify Admin API returned an empty response.");
  }

  return payload.data;
}
