import "dotenv/config";

class SmokeFailure extends Error {}

process.on("uncaughtException", (error) => {
  if (error instanceof SmokeFailure) {
    console.error(error.message);
    process.exit(1);
  }

  throw error;
});

function fail(message: string): never {
  throw new SmokeFailure(`FAIL: ${message}`);
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    fail(`${name} is required.`);
  }
  return value;
}

function assertSafeKsefTarget() {
  if (process.env.KSEF_LIVE_SUBMISSION_ENABLED !== "true") {
    fail("KSEF_LIVE_SUBMISSION_ENABLED=true is required so the real live submission path is exercised.");
  }

  const baseUrl = process.env.KSEF_API_BASE_URL?.trim().toLowerCase() ?? "";
  const environment = process.env.KSEF_ENVIRONMENT?.trim().toUpperCase() ?? "";
  const looksProduction =
    environment === "PROD" ||
    (baseUrl.includes("api.ksef.mf.gov.pl") && !baseUrl.includes("demo") && !baseUrl.includes("test"));

  if (looksProduction) {
    fail("KSeF smoke test must run against DEMO/TEST, never PRD.");
  }

  requireEnv("KSEF_TEST_TOKEN");
  requireEnv("ENCRYPTION_KEY");
}

assertSafeKsefTarget();

const keepRows = process.argv.includes("--keep");
const testToken = requireEnv("KSEF_TEST_TOKEN");
const testNip = process.env.KSEF_TEST_NIP?.replace(/\D/g, "") || "5252763266";
const smokeDomain = process.env.KSEF_SMOKE_SHOP_DOMAIN || "smoke-ksef-submit.myshopify.com";

const { prisma } = await import("../src/server/config/prisma.js");
const { encryptSecret } = await import("../src/server/services/crypto.js");
const { buildFa3Xml, buildSampleFa3Invoice } = await import("../src/server/services/fa3.js");
const { validateFa3XmlAgainstOfficialXsd } = await import("../src/server/services/fa3Schema.js");
const { refreshInvoiceKsefStatus, submitInvoiceToKsef } = await import("../src/server/services/ksef.js");

let shopId: number | null = null;
let invoiceId: string | null = null;

async function cleanup() {
  if (keepRows) {
    console.log(`Keeping smoke rows for debugging. shop=${smokeDomain} invoice=${invoiceId ?? "-"}`);
    return;
  }

  if (shopId) {
    await prisma.shop.delete({ where: { id: shopId } }).catch(() => undefined);
  }
}

try {
  console.log(`KSeF smoke target: ${process.env.KSEF_API_BASE_URL || process.env.KSEF_ENVIRONMENT || "TEST"}`);
  console.log(`Seeding disposable smoke shop: ${smokeDomain}`);

  await prisma.shop.delete({ where: { domain: smokeDomain } }).catch(() => undefined);
  const shop = await prisma.shop.create({
    data: {
      domain: smokeDomain,
      accessToken: "smoke-test-access-token",
      isActive: true,
      ksefToken: encryptSecret(testToken),
      ksefConnected: true,
      ksefTestMode: false,
      sellerNip: testNip,
      sellerName: "KSeF Pilot Smoke Seller",
      sellerAddress: "Testowa 1, 00-001 Warszawa",
      placeOfIssue: "Warszawa",
      plan: "unlimited",
      billingStatus: "smoke-test"
    }
  });
  shopId = shop.id;

  const sample = buildSampleFa3Invoice();
  sample.invoiceNumber = `SMOKE/KSEF/${Date.now()}`;
  sample.sellerNip = testNip;
  sample.sellerName = shop.sellerName ?? sample.sellerName;
  sample.sellerAddress = shop.sellerAddress ?? sample.sellerAddress;
  sample.placeOfIssue = shop.placeOfIssue ?? sample.placeOfIssue;

  const fa3Xml = buildFa3Xml(sample);
  const validation = await validateFa3XmlAgainstOfficialXsd(fa3Xml);
  if (!validation.valid) {
    console.error(validation.issues.slice(0, 10));
    fail(`sample FA(3) XML failed XSD validation with ${validation.issueCount} issue(s).`);
  }
  console.log("XSD validation: OK");

  const invoice = await prisma.ksefInvoice.create({
    data: {
      shopId: shop.id,
      orderId: `smoke-ksef-submit-${Date.now()}`,
      orderName: sample.invoiceNumber,
      nip: sample.buyerNip,
      buyerName: sample.buyerName,
      fa3Xml,
      status: "draft",
      currency: sample.currency ?? "PLN",
      totalGross: sample.amountGross,
      totalGrossPln: sample.amountGross,
      fa3ValidatedAt: new Date(),
      fa3ValidationStatus: "valid",
      fa3ValidationError: null,
      items: {
        create: sample.lineItems.map((item) => ({
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
  invoiceId = invoice.id;

  console.log(`Submitting via real submitInvoiceToKsef. invoice=${invoice.id}`);
  const submitted = await submitInvoiceToKsef(shop, invoice.id);
  const submission = submitted.submission;

  if (!submission?.sessionReferenceNumber || !submission.invoiceReferenceNumber) {
    console.error(submission);
    fail("KSeF submit did not return both session and invoice reference numbers.");
  }

  console.log(`Session reference: ${submission.sessionReferenceNumber}`);
  console.log(`Invoice reference: ${submission.invoiceReferenceNumber}`);

  let finalKsefNumber: string | null = null;
  let finalUpoFetched = false;
  let lastStatus = "submitted";
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));

    try {
      const refreshed = await refreshInvoiceKsefStatus(shop, invoice.id);
      lastStatus = refreshed.status.status.description;
      finalKsefNumber = refreshed.invoice.ksefNumber;
      finalUpoFetched = refreshed.upoFetched;
      console.log(`Status: ${refreshed.status.status.code} ${refreshed.status.status.description}`);

      if (finalKsefNumber) {
        break;
      }
    } catch (error) {
      console.log(`Status refresh pending/error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!finalKsefNumber) {
    fail(`Timed out waiting for KSeF reference. Last status: ${lastStatus}`);
  }

  console.log(`KSeF reference: ${finalKsefNumber}`);
  console.log(`UPO retrievable: ${finalUpoFetched ? "yes" : "no"}`);
  console.log("PASS: real KSeF live submission path completed.");
} catch (error) {
  console.error(error instanceof SmokeFailure ? error.message : error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
} finally {
  await cleanup();
  await prisma.$disconnect();
}
