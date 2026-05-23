import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  SHOPIFY_API_KEY: z.string().min(1),
  SHOPIFY_API_SECRET: z.string().min(1),
  SHOPIFY_SCOPES: z.string().default("read_orders,read_customers,read_products"),
  ENCRYPTION_KEY: z.string().min(32),
  KSEF_API_BASE_URL: z.string().url().default("https://ksef-test.mf.gov.pl"),
  RESEND_API_KEY: z.string().optional()
});

export const env = envSchema.parse(process.env);

export const shopifyScopes = env.SHOPIFY_SCOPES.split(",")
  .map((scope) => scope.trim())
  .filter(Boolean);
