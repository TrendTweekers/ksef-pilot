import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.js";
import { apiRouter } from "./routes/api.js";
import { webhookRouter } from "./routes/webhooks.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false,
    frameguard: false
  })
);
app.use((_req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors https://admin.shopify.com https://*.myshopify.com;"
  );
  next();
});
app.use(cors({ origin: env.NODE_ENV === "development" ? true : env.APP_URL, credentials: true }));
app.use(cookieParser());
app.use("/webhooks", express.raw({ type: "application/json" }), webhookRouter);
app.use(express.json({ limit: "1mb" }));

app.use("/auth", authRouter);
app.use("/api", apiRouter);

if (env.NODE_ENV === "production") {
  const webRoot = path.resolve(__dirname, "../web");
  app.use(express.static(webRoot));
  app.get("*", (_req, res) => res.sendFile(path.join(webRoot, "index.html")));
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", issues: error.flatten() });
    return;
  }

  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(env.PORT, () => {
  console.log(`KSeF Pilot API listening on :${env.PORT}`);
});
