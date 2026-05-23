import crypto from "node:crypto";
import type { KsefInvoice, Shop } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { decryptSecret } from "./crypto.js";
import { validateFa3XmlAgainstOfficialXsd } from "./fa3Schema.js";

export async function testKsefToken(encryptedToken: string) {
  const token = decryptSecret(encryptedToken);

  return {
    connected: token.trim().length > 0,
    checkedAt: new Date().toISOString()
  };
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

async function createFailedSubmission(shop: Shop, invoice: KsefInvoice, error: string, attempts = 1) {
  const submission = await prisma.ksefSubmission.create({
    data: {
      shopId: shop.id,
      invoiceId: invoice.id,
      mode: shop.ksefTestMode ? "test" : "live",
      status: attempts >= 3 ? "failed" : "retrying",
      attempts,
      nextRetryAt: attempts >= 3 ? null : retryDelay(attempts),
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
  if (!env.KSEF_LIVE_SUBMISSION_ENABLED) {
    return createFailedSubmission(
      shop,
      invoice,
      "Live KSeF submission is disabled. Keep test mode on until KSeF auth, encryption, and online session endpoints are configured."
    );
  }

  if (!shop.ksefToken) {
    return createFailedSubmission(shop, invoice, "KSeF token is required for live submission.");
  }

  throw new Error("Live KSeF submission client is not implemented yet.");
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

  const validation = await validateFa3XmlAgainstOfficialXsd(invoice.fa3Xml);
  if (!validation.valid) {
    const submission = await createFailedSubmission(
      shop,
      invoice,
      `FA(3) XML failed XSD validation with ${validation.issueCount} issue(s).`
    );
    return { invoice, submission, reused: false };
  }

  const submission = shop.ksefTestMode
    ? await submitInvoiceInTestMode(shop, invoice)
    : await submitInvoiceLive(shop, invoice);

  const updatedInvoice = await prisma.ksefInvoice.findUniqueOrThrow({
    where: { id: invoice.id }
  });

  return { invoice: updatedInvoice, submission, reused: false };
}
