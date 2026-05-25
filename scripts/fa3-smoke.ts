import { buildFa3Xml, type Fa3InvoiceData } from "../src/server/services/fa3.js";
import { validateFa3XmlAgainstOfficialXsd } from "../src/server/services/fa3Schema.js";

function baseInvoice(overrides: Partial<Fa3InvoiceData> = {}): Fa3InvoiceData {
  return {
    invoiceNumber: `SMOKE-${Date.now()}`,
    issueDate: "2026-05-25",
    placeOfIssue: "Warszawa",
    sellerNip: "5252763266",
    sellerName: "KSeF Pilot Smoke Seller",
    sellerAddress: "Testowa 1, 00-001 Warszawa",
    buyerNip: "5260207427",
    buyerName: "KSeF Pilot Smoke Buyer",
    buyerAddress: "Prosta 2, 00-002 Warszawa",
    buyerJst: true,
    buyerGv: true,
    amountNet: 175,
    amountVat: 28.25,
    amountGross: 203.25,
    currency: "PLN",
    lineItems: [
      {
        name: "Towar 23%",
        unit: "szt.",
        quantity: 1,
        unitPrice: 100,
        vatRate: "23",
        totalNet: 100,
        totalVat: 23,
        totalGross: 123
      },
      {
        name: "Towar 8%",
        unit: "szt.",
        quantity: 1,
        unitPrice: 50,
        vatRate: "8",
        totalNet: 50,
        totalVat: 4,
        totalGross: 54
      },
      {
        name: "Towar 5%",
        unit: "szt.",
        quantity: 1,
        unitPrice: 25,
        vatRate: "5",
        totalNet: 25,
        totalVat: 1.25,
        totalGross: 26.25
      }
    ],
    ...overrides
  };
}

async function assertValid(name: string, invoice: Fa3InvoiceData) {
  const xml = buildFa3Xml(invoice);
  const validation = await validateFa3XmlAgainstOfficialXsd(xml);

  if (!validation.valid) {
    console.error(`${name}: FA(3) smoke validation failed`);
    console.error(validation.issues.slice(0, 10));
    process.exitCode = 1;
    return;
  }

  console.log(`${name}: OK`);
}

await assertValid("domestic multi-rate VAT with JST/GV flags", baseInvoice());
await assertValid(
  "foreign-currency domestic VAT with VAT-in-PLN fields",
  baseInvoice({
    invoiceNumber: `SMOKE-FX-${Date.now()}`,
    currency: "EUR",
    exchangeRate: 4.321234
  })
);
