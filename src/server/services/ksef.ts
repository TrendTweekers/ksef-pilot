import crypto from "node:crypto";
import type { KsefInvoice, Shop } from "@prisma/client";
import {
  FORM_CODES,
  KSeFApiError,
  KSeFBadRequestError,
  KSeFClient,
  KSeFForbiddenError,
  KSeFRateLimitError,
  KSeFUnauthorizedError,
  openOnlineSession,
  type SessionInvoiceStatusResponse,
  type EnvironmentName
} from "ksef-client-ts";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { decryptSecret } from "./crypto.js";
import { validateFa3XmlAgainstOfficialXsd } from "./fa3Schema.js";

const maxAttempts = 3;

export async function testKsefToken(encryptedToken: string, sellerNip?: string | null) {
  const token = decryptSecret(encryptedToken);
  const checkedAt = new Date().toISOString();

  if (!sellerNip) {
    return {
      connected: false,
      checkedAt,
      environment: ksefEnvironment(),
      error: "ERR_KSEF_006: Seller NIP is required before testing a KSeF token."
    };
  }

  if (!env.KSEF_LIVE_SUBMISSION_ENABLED) {
    return {
      connected: false,
      checkedAt,
      environment: ksefEnvironment(),
      error:
        "ERR_KSEF_001: KSeF API calls are disabled on this server. Set KSEF_LIVE_SUBMISSION_ENABLED=true before saving a real KSeF token."
    };
  }

  try {
    const client = createClient();
    await client.crypto.init();
    const login = await client.loginWithToken(token, sellerNip.replace(/\D/g, ""));
    await client.logout().catch(() => undefined);

    return {
      connected: true,
      checkedAt,
      environment: ksefEnvironment(),
      clientIp: login.clientIp
    };
  } catch (error) {
    return {
      connected: false,
      checkedAt,
      environment: ksefEnvironment(),
      error: errorMessage(error)
    };
  }
}

function xmlHash(xml: string) {
  return crypto.createHash("sha256").update(xml, "utf8").digest("hex");
}

function reference(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function retryDelay(attempts: number) {
  const minutes = [5, 15, 60][Math.min(Math.max(attempts - 1, 0), 2)] ?? 60;
  return new Date(Date.now() + minutes * 60 * 1000);
}

function ksefEnvironment(): EnvironmentName {
  if (env.KSEF_API_BASE_URL?.includes("api-demo.ksef")) {
    return "DEMO";
  }

  if (env.KSEF_API_BASE_URL?.includes("api.ksef.mf.gov.pl") && !env.KSEF_API_BASE_URL.includes("test")) {
    return "PROD";
  }

  return env.KSEF_ENVIRONMENT;
}

function createClient() {
  return new KSeFClient({
    environment: ksefEnvironment(),
    ...(env.KSEF_API_BASE_URL ? { baseUrl: env.KSEF_API_BASE_URL } : {}),
    timeout: 30_000,
    retry: {
      maxRetries: 2,
      baseDelayMs: 1_000,
      maxDelayMs: 10_000
    },
    circuitBreaker: {
      failureThreshold: 3,
      openMs: 60_000,
      scope: "global"
    }
  });
}

async function authenticatedClient(shop: Shop) {
  if (!env.KSEF_LIVE_SUBMISSION_ENABLED) {
    throw new Error(
      "ERR_KSEF_001: Live KSeF API calls are disabled. Set KSEF_LIVE_SUBMISSION_ENABLED=true only for real KSeF testing."
    );
  }

  if (!shop.ksefToken) {
    throw new Error("ERR_KSEF_001: KSeF token is required.");
  }

  if (!shop.sellerNip) {
    throw new Error("ERR_KSEF_006: Seller NIP is required.");
  }

  const client = createClient();
  await client.crypto.init();
  await client.loginWithToken(decryptSecret(shop.ksefToken), shop.sellerNip);
  return client;
}

function technicalCodeForError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (error instanceof KSeFUnauthorizedError || lower.includes("unauthorized") || lower.includes("token")) {
    return "ERR_KSEF_001";
  }

  if (lower.includes("duplicate") || lower.includes("duplikat") || lower.includes("already")) {
    return "ERR_KSEF_002";
  }

  if (error instanceof KSeFRateLimitError || lower.includes("rate limit") || lower.includes("too many")) {
    return "ERR_KSEF_003";
  }

  if (error instanceof KSeFBadRequestError || lower.includes("validation") || lower.includes("schema")) {
    return "ERR_KSEF_005";
  }

  if (error instanceof KSeFForbiddenError || lower.includes("forbidden") || lower.includes("permission")) {
    return "ERR_KSEF_006";
  }

  return "ERR_KSEF_004";
}

function errorMessage(error: unknown) {
  if (error instanceof KSeFApiError) {
    return `${technicalCodeForError(error)}: ${error.message}`;
  }

  if (error instanceof Error) {
    return `${technicalCodeForError(error)}: ${error.message}`;
  }

  return `${technicalCodeForError(error)}: ${String(error)}`;
}

function retryAfter(error: unknown, attempts: number) {
  if (error instanceof KSeFRateLimitError) {
    if (error.retryAfterDate) {
      return error.retryAfterDate;
    }

    if (error.retryAfterSeconds) {
      return new Date(Date.now() + error.retryAfterSeconds * 1000);
    }
  }

  return retryDelay(attempts);
}

function isInvoiceFailure(status: SessionInvoiceStatusResponse) {
  const description = status.status.description.toLowerCase();
  return description.includes("failed") || description.includes("rejected") || description.includes("błąd");
}

async function createFailedSubmission(shop: Shop, invoice: KsefInvoice, error: string, attempts = 1) {
  const retryable = error.startsWith("ERR_KSEF_003") || error.startsWith("ERR_KSEF_004");
  const submission = await prisma.ksefSubmission.create({
    data: {
      shopId: shop.id,
      invoiceId: invoice.id,
      mode: shop.ksefTestMode ? "test" : "live",
      status: retryable && attempts < maxAttempts ? "retrying" : "failed",
      attempts,
      nextRetryAt: retryable && attempts < maxAttempts ? retryDelay(attempts) : null,
      lastError: error,
      requestHash: xmlHash(invoice.fa3Xml)
    }
  });

  await prisma.ksefInvoice.update({
    where: { id: invoice.id },
    data: {
      status: submission.status === "failed" ? "error" : "retrying",
      retryCount: attempts,
      nextRetryAt: submission.nextRetryAt,
      lastError: error
    }
  });

  return submission;
}

async function submitInvoiceInTestMode(shop: Shop, invoice: KsefInvoice) {
  const requestHash = xmlHash(invoice.fa3Xml);
  const sessionReferenceNumber = reference("TEST-SESSION");
  const invoiceReferenceNumber = reference("TEST-INVOICE");
  const ksefNumber = `${invoice.nip}-${new Date().getFullYear()}-KSEF-TEST-${invoice.id.slice(0, 8).toUpperCase()}`;

  const submission = await prisma.ksefSubmission.create({
    data: {
      shopId: shop.id,
      invoiceId: invoice.id,
      mode: "test",
      status: "submitted",
      sessionReferenceNumber,
      invoiceReferenceNumber,
      ksefNumber,
      attempts: 1,
      requestHash,
      responsePayload: {
        testMode: true,
        message: "No request was sent to KSeF. This is a local test submission for UI and workflow validation."
      },
      submittedAt: new Date()
    }
  });

  await prisma.ksefInvoice.update({
    where: { id: invoice.id },
    data: {
      status: "submitted",
      ksefNumber,
      ksefSessionRef: sessionReferenceNumber,
      submittedAt: new Date(),
      retryCount: 0,
      nextRetryAt: null,
      lastError: null
    }
  });

  return submission;
}

async function submitInvoiceLive(shop: Shop, invoice: KsefInvoice) {
  const attempts = invoice.retryCount + 1;

  if (!env.KSEF_LIVE_SUBMISSION_ENABLED) {
    return createFailedSubmission(
      shop,
      invoice,
      "ERR_KSEF_001: Live KSeF submission is disabled. Set KSEF_LIVE_SUBMISSION_ENABLED=true only after testing with a real KSeF test/demo token.",
      attempts
    );
  }

  if (!shop.ksefToken) {
    return createFailedSubmission(shop, invoice, "ERR_KSEF_001: KSeF token is required for live submission.", attempts);
  }

  if (!shop.sellerNip) {
    return createFailedSubmission(shop, invoice, "ERR_KSEF_006: Seller NIP is required for live KSeF submission.", attempts);
  }

  const requestHash = xmlHash(invoice.fa3Xml);
  const submission = await prisma.ksefSubmission.create({
    data: {
      shopId: shop.id,
      invoiceId: invoice.id,
      mode: "live",
      status: "processing",
      attempts,
      requestHash,
      responsePayload: {
        environment: ksefEnvironment(),
        startedAt: new Date().toISOString()
      }
    }
  });

  try {
    const client = await authenticatedClient(shop);

    const session = await openOnlineSession(client, {
      formCode: FORM_CODES.FA_3,
      validate: false
    });

    let invoiceReferenceNumber: string | null = null;
    try {
      invoiceReferenceNumber = await session.sendInvoice(invoice.fa3Xml);
    } finally {
      await session.close().catch(() => undefined);
    }

    const updatedSubmission = await prisma.ksefSubmission.update({
      where: { id: submission.id },
      data: {
        status: "submitted",
        sessionReferenceNumber: session.sessionRef,
        invoiceReferenceNumber,
        lastError: null,
        responsePayload: {
          environment: ksefEnvironment(),
          sessionReferenceNumber: session.sessionRef,
          invoiceReferenceNumber,
          message:
            "Invoice was accepted into the KSeF online session. KSeF number/UPO status can be refreshed after government processing completes."
        },
        submittedAt: new Date(),
        nextRetryAt: null
      }
    });

    await prisma.ksefInvoice.update({
      where: { id: invoice.id },
      data: {
        status: "submitted",
        ksefSessionRef: session.sessionRef,
        submittedAt: new Date(),
        retryCount: 0,
        nextRetryAt: null,
        lastError: null
      }
    });

    return updatedSubmission;
  } catch (error) {
    const lastError = errorMessage(error);
    const retryable = lastError.startsWith("ERR_KSEF_003") || lastError.startsWith("ERR_KSEF_004");
    const nextRetryAt = retryable && attempts < maxAttempts ? retryAfter(error, attempts) : null;
    const status = nextRetryAt ? "retrying" : "failed";

    const updatedSubmission = await prisma.ksefSubmission.update({
      where: { id: submission.id },
      data: {
        status,
        nextRetryAt,
        lastError,
        responsePayload: {
          environment: ksefEnvironment(),
          error: lastError
        }
      }
    });

    await prisma.ksefInvoice.update({
      where: { id: invoice.id },
      data: {
        status: status === "retrying" ? "retrying" : "error",
        retryCount: attempts,
        nextRetryAt,
        lastError
      }
    });

    return updatedSubmission;
  }
}

export async function submitInvoiceToKsef(shop: Shop, invoiceId: string) {
  const invoice = await prisma.ksefInvoice.findFirst({
    where: {
      id: invoiceId,
      shopId: shop.id
    }
  });

  if (!invoice) {
    throw new Error("Invoice not found.");
  }

  if (invoice.ksefNumber) {
    const existing = await prisma.ksefSubmission.findFirst({
      where: { invoiceId: invoice.id },
      orderBy: { createdAt: "desc" }
    });

    return { invoice, submission: existing, reused: true };
  }

  if (invoice.fa3ValidationStatus !== "valid") {
    throw new Error("Validate FA(3) XML before submitting this invoice to KSeF.");
  }

  const validation = await validateFa3XmlAgainstOfficialXsd(invoice.fa3Xml);
  if (!validation.valid) {
    const validationError = `FA(3) XML failed XSD validation with ${validation.issueCount} issue(s).`;
    await prisma.ksefInvoice.update({
      where: { id: invoice.id },
      data: {
        fa3ValidatedAt: new Date(),
        fa3ValidationStatus: "invalid",
        fa3ValidationError: validation.issues.slice(0, 5).map((issue) => `${issue.code}: ${issue.message}`).join("\n"),
        lastError: validationError
      }
    });
    const submission = await createFailedSubmission(
      shop,
      invoice,
      validationError
    );
    return { invoice, submission, reused: false };
  }

  await prisma.ksefInvoice.update({
    where: { id: invoice.id },
    data: {
      fa3ValidatedAt: new Date(),
      fa3ValidationStatus: "valid",
      fa3ValidationError: null
    }
  });

  const submission = shop.ksefTestMode
    ? await submitInvoiceInTestMode(shop, invoice)
    : await submitInvoiceLive(shop, invoice);

  const updatedInvoice = await prisma.ksefInvoice.findUniqueOrThrow({
    where: { id: invoice.id }
  });

  return { invoice: updatedInvoice, submission, reused: false };
}

export async function refreshInvoiceKsefStatus(shop: Shop, invoiceId: string) {
  const invoice = await prisma.ksefInvoice.findFirst({
    where: {
      id: invoiceId,
      shopId: shop.id
    }
  });

  if (!invoice) {
    throw new Error("Invoice not found.");
  }

  const submission = await prisma.ksefSubmission.findFirst({
    where: {
      invoiceId: invoice.id,
      mode: "live",
      sessionReferenceNumber: { not: null },
      invoiceReferenceNumber: { not: null }
    },
    orderBy: { createdAt: "desc" }
  });

  if (!submission?.sessionReferenceNumber || !submission.invoiceReferenceNumber) {
    throw new Error("No live KSeF submission reference is available for this invoice.");
  }

  try {
    const client = await authenticatedClient(shop);
    const status = await client.sessionStatus.getSessionInvoice(
      submission.sessionReferenceNumber,
      submission.invoiceReferenceNumber
    );
    const ksefNumber = status.ksefNumber ?? null;
    let upoXml: string | null = null;

    if (ksefNumber) {
      const upo = await client.sessionStatus
        .getInvoiceUpoByReference(submission.sessionReferenceNumber, submission.invoiceReferenceNumber)
        .catch(() => null);
      upoXml = upo?.upo ?? null;
    }

    const invoiceStatus = ksefNumber ? "submitted" : isInvoiceFailure(status) ? "error" : "submitted";
    const lastError = isInvoiceFailure(status) ? `${status.status.code}: ${status.status.description}` : null;

    const [updatedInvoice, updatedSubmission] = await prisma.$transaction([
      prisma.ksefInvoice.update({
        where: { id: invoice.id },
        data: {
          status: invoiceStatus,
          ksefNumber: ksefNumber ?? invoice.ksefNumber,
          upoXml: upoXml ?? invoice.upoXml,
          upoStatus: status.status.description,
          upoFetchedAt: upoXml ? new Date() : invoice.upoFetchedAt,
          lastError
        }
      }),
      prisma.ksefSubmission.update({
        where: { id: submission.id },
        data: {
          status: ksefNumber ? "confirmed" : invoiceStatus,
          ksefNumber: ksefNumber ?? submission.ksefNumber,
          lastError,
          responsePayload: {
          environment: ksefEnvironment(),
          sessionReferenceNumber: submission.sessionReferenceNumber,
          invoiceReferenceNumber: submission.invoiceReferenceNumber,
          invoiceStatus: {
            code: status.status.code,
            description: status.status.description,
            details: status.status.details ?? null,
            extensions: status.status.extensions ?? null
          },
          ksefNumber,
          upoFetched: Boolean(upoXml)
        }
        }
      })
    ]);

    return {
      invoice: updatedInvoice,
      submission: updatedSubmission,
      status,
      upoFetched: Boolean(upoXml)
    };
  } catch (error) {
    const lastError = errorMessage(error);
    await prisma.ksefSubmission.update({
      where: { id: submission.id },
      data: {
        status: lastError.startsWith("ERR_KSEF_003") || lastError.startsWith("ERR_KSEF_004") ? "submitted" : "failed",
        lastError,
        responsePayload: {
          environment: ksefEnvironment(),
          error: lastError
        }
      }
    });

    await prisma.ksefInvoice.update({
      where: { id: invoice.id },
      data: {
        lastError
      }
    });

    throw new Error(lastError);
  }
}

export async function processPendingKsefStatusRefreshes(limit = 10) {
  const submissions = await prisma.ksefSubmission.findMany({
    where: {
      mode: "live",
      status: { in: ["submitted"] },
      ksefNumber: null,
      sessionReferenceNumber: { not: null },
      invoiceReferenceNumber: { not: null }
    },
    include: {
      invoice: true,
      shop: true
    },
    orderBy: {
      submittedAt: "asc"
    },
    take: limit
  });

  const results = [];
  for (const submission of submissions) {
    try {
      const result = await refreshInvoiceKsefStatus(submission.shop, submission.invoiceId);
      results.push({
        invoiceId: submission.invoiceId,
        orderName: submission.invoice.orderName,
        status: result.invoice.status,
        ksefNumber: result.invoice.ksefNumber,
        upoFetched: result.upoFetched
      });
    } catch (error) {
      results.push({
        invoiceId: submission.invoiceId,
        orderName: submission.invoice.orderName,
        status: "error",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    processed: results.length,
    results
  };
}

export async function processDueKsefRetries(limit = 10) {
  const dueInvoices = await prisma.ksefInvoice.findMany({
    where: {
      status: "retrying",
      ksefNumber: null,
      nextRetryAt: {
        lte: new Date()
      }
    },
    include: {
      shop: true
    },
    orderBy: {
      nextRetryAt: "asc"
    },
    take: limit
  });

  const results = [];
  for (const invoice of dueInvoices) {
    if (invoice.shop.ksefTestMode) {
      results.push({ invoiceId: invoice.id, skipped: true, reason: "Shop is in test mode." });
      continue;
    }

    const submission = await submitInvoiceLive(invoice.shop, invoice);
    results.push({
      invoiceId: invoice.id,
      orderName: invoice.orderName,
      submissionId: submission.id,
      status: submission.status,
      nextRetryAt: submission.nextRetryAt
    });
  }

  return {
    processed: results.length,
    results
  };
}
