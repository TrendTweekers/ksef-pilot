export type InvoiceType = "VAT" | "KOR" | "ZAL" | "ROZ" | "UPR" | "KOR_ZAL" | "KOR_ROZ";

export interface Fa3LineItem {
  name: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  vatRate: "23" | "8" | "5" | "0" | "zw";
  totalNet: number;
  totalVat: number;
  totalGross: number;
}

export interface Fa3InvoiceData {
  invoiceNumber: string;
  issueDate: string;
  saleDate?: string;
  invoiceType?: InvoiceType;
  placeOfIssue?: string;
  sellerNip: string;
  sellerName: string;
  sellerAddress?: string;
  buyerNip: string;
  buyerName: string;
  buyerAddress?: string;
  amountNet: number;
  amountVat: number;
  amountGross: number;
  currency?: string;
  sourceSystem?: string;
  correctionOfInvoiceNumber?: string;
  correctionReason?: string;
  lineItems: Fa3LineItem[];
}

export interface Fa3ValidationResult {
  valid: boolean;
  errors: string[];
}

function escapeXml(value: string | undefined | null) {
  if (!value) {
    return "";
  }

  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function amount(value: number) {
  return value.toFixed(2);
}

function isoNowSecondPrecision() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function normalizeVatRate(vatRate: Fa3LineItem["vatRate"]) {
  return vatRate === "zw" ? "ZW" : vatRate;
}

export function validateFa3Input(data: Fa3InvoiceData): Fa3ValidationResult {
  const errors: string[] = [];

  if (!data.invoiceNumber) errors.push("Invoice number is required.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.issueDate)) errors.push("Issue date must use YYYY-MM-DD.");
  if (!/^\d{10}$/.test(data.sellerNip)) errors.push("Seller NIP must be 10 digits.");
  if (!data.sellerName) errors.push("Seller name is required.");
  if (!/^\d{10}$/.test(data.buyerNip)) errors.push("Buyer NIP must be 10 digits.");
  if (!data.buyerName) errors.push("Buyer name is required.");
  if (data.currency && data.currency !== "PLN") errors.push("MVP supports PLN invoices only.");
  if (!data.lineItems.length) errors.push("At least one invoice line item is required.");
  if (data.invoiceType === "KOR" && !data.correctionReason) errors.push("Correction reason is required.");

  const net = data.lineItems.reduce((sum, item) => sum + item.totalNet, 0);
  const vat = data.lineItems.reduce((sum, item) => sum + item.totalVat, 0);
  const gross = data.lineItems.reduce((sum, item) => sum + item.totalGross, 0);
  const withinOneGrosz = (left: number, right: number) => Math.abs(left - right) <= 0.01;

  if (!withinOneGrosz(net, data.amountNet)) errors.push("Line net total does not match invoice net total.");
  if (!withinOneGrosz(vat, data.amountVat)) errors.push("Line VAT total does not match invoice VAT total.");
  if (!withinOneGrosz(gross, data.amountGross)) errors.push("Line gross total does not match invoice gross total.");
  if (!withinOneGrosz(data.amountNet + data.amountVat, data.amountGross)) {
    errors.push("Invoice net plus VAT does not match gross total.");
  }

  for (const [index, item] of data.lineItems.entries()) {
    if (!item.name) errors.push(`Line ${index + 1}: name is required.`);
    if (item.vatRate !== "23") errors.push(`Line ${index + 1}: MVP supports only 23% VAT.`);
    if (item.quantity <= 0) errors.push(`Line ${index + 1}: quantity must be greater than zero.`);
    if (item.unitPrice < 0 && data.invoiceType !== "KOR") errors.push(`Line ${index + 1}: unit price cannot be negative.`);
  }

  return { valid: errors.length === 0, errors };
}

export function buildFa3Xml(data: Fa3InvoiceData) {
  const validation = validateFa3Input(data);

  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }

  const currency = data.currency ?? "PLN";
  const placeOfIssue = data.placeOfIssue ?? "Warszawa";
  const invoiceType = data.invoiceType ?? "VAT";
  const systemInfo = data.sourceSystem ?? "KSeF Pilot Shopify";

  const lineItemsXml = data.lineItems
    .map(
      (item, index) => `
    <fa:FaWiersz>
      <fa:NrWierszaFa>${index + 1}</fa:NrWierszaFa>
      <fa:P_7>${escapeXml(item.name)}</fa:P_7>
      <fa:P_8A>${escapeXml(item.unit ?? "szt.")}</fa:P_8A>
      <fa:P_8B>${amount(item.quantity)}</fa:P_8B>
      <fa:P_9A>${amount(item.unitPrice)}</fa:P_9A>
      <fa:P_11>${amount(item.totalNet)}</fa:P_11>
      <fa:P_12>${escapeXml(normalizeVatRate(item.vatRate))}</fa:P_12>
    </fa:FaWiersz>`
    )
    .join("");
  const correctionXml =
    invoiceType === "KOR"
      ? `
    <fa:PrzyczynaKorekty>${escapeXml(data.correctionReason ?? "Korekta faktury")}</fa:PrzyczynaKorekty>
    <fa:NrFaKorygowanej>${escapeXml(data.correctionOfInvoiceNumber ?? data.invoiceNumber.replace(/-KOR$/, ""))}</fa:NrFaKorygowanej>`
      : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<fa:Faktura xmlns:fa="http://crd.gov.pl/wzor/2025/06/25/13775/"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
            xsi:schemaLocation="http://crd.gov.pl/wzor/2025/06/25/13775/ http://crd.gov.pl/wzor/2025/06/25/13775/schemat.xsd">
  <fa:Naglowek>
    <fa:KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</fa:KodFormularza>
    <fa:WariantFormularza>3</fa:WariantFormularza>
    <fa:DataWytworzeniaFa>${isoNowSecondPrecision()}</fa:DataWytworzeniaFa>
    <fa:SystemInfo>${escapeXml(systemInfo)}</fa:SystemInfo>
  </fa:Naglowek>
  <fa:Podmiot1>
    <fa:DaneIdentyfikacyjne>
      <fa:NIP>${escapeXml(data.sellerNip)}</fa:NIP>
      <fa:Nazwa>${escapeXml(data.sellerName)}</fa:Nazwa>
    </fa:DaneIdentyfikacyjne>
    <fa:Adres>
      <fa:KodKraju>PL</fa:KodKraju>
      <fa:AdresL1>${escapeXml(data.sellerAddress ?? placeOfIssue)}</fa:AdresL1>
    </fa:Adres>
  </fa:Podmiot1>
  <fa:Podmiot2>
    <fa:DaneIdentyfikacyjne>
      <fa:NIP>${escapeXml(data.buyerNip)}</fa:NIP>
      <fa:Nazwa>${escapeXml(data.buyerName)}</fa:Nazwa>
    </fa:DaneIdentyfikacyjne>
    <fa:Adres>
      <fa:KodKraju>PL</fa:KodKraju>
      <fa:AdresL1>${escapeXml(data.buyerAddress ?? "Polska")}</fa:AdresL1>
    </fa:Adres>
    <fa:JST>2</fa:JST>
    <fa:GV>2</fa:GV>
  </fa:Podmiot2>
  <fa:Fa>
    <fa:KodWaluty>${escapeXml(currency)}</fa:KodWaluty>
    <fa:P_1>${escapeXml(data.issueDate)}</fa:P_1>
    <fa:P_1M>${escapeXml(placeOfIssue)}</fa:P_1M>
    <fa:P_2>${escapeXml(data.invoiceNumber)}</fa:P_2>
    <fa:P_13_1>${amount(data.amountNet)}</fa:P_13_1>
    <fa:P_14_1>${amount(data.amountVat)}</fa:P_14_1>
    <fa:P_15>${amount(data.amountGross)}</fa:P_15>
    <fa:Adnotacje>
      <fa:P_16>2</fa:P_16>
      <fa:P_17>2</fa:P_17>
      <fa:P_18>2</fa:P_18>
      <fa:P_18A>2</fa:P_18A>
      <fa:Zwolnienie>
        <fa:P_19N>1</fa:P_19N>
      </fa:Zwolnienie>
      <fa:NoweSrodkiTransportu>
        <fa:P_22N>1</fa:P_22N>
      </fa:NoweSrodkiTransportu>
      <fa:P_23>2</fa:P_23>
      <fa:PMarzy>
        <fa:P_PMarzyN>1</fa:P_PMarzyN>
      </fa:PMarzy>
    </fa:Adnotacje>
    <fa:RodzajFaktury>${escapeXml(invoiceType)}</fa:RodzajFaktury>${correctionXml}${lineItemsXml}
  </fa:Fa>
</fa:Faktura>`;
}

export function buildSampleFa3Invoice(): Fa3InvoiceData {
  return {
    invoiceNumber: `SHOPIFY/${Date.now()}`,
    issueDate: new Date().toISOString().slice(0, 10),
    sellerNip: "5252763266",
    sellerName: "FakturaFlow Demo Seller",
    buyerNip: "5260207427",
    buyerName: "Demo B2B Buyer",
    amountNet: 100,
    amountVat: 23,
    amountGross: 123,
    currency: "PLN",
    lineItems: [
      {
        name: "Shopify order item",
        unit: "szt.",
        quantity: 1,
        unitPrice: 100,
        vatRate: "23",
        totalNet: 100,
        totalVat: 23,
        totalGross: 123
      }
    ]
  };
}
