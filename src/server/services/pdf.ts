import PDFDocument from "pdfkit";
import crypto from "node:crypto";
import QRCode from "qrcode";
import { env } from "../config/env.js";

interface PdfInvoiceItem {
  name: string;
  quantity: number;
  unitPrice: { toString(): string } | string | number;
  vatRate: string;
  totalNet: { toString(): string } | string | number;
  totalVat: { toString(): string } | string | number;
}

export interface PdfInvoice {
  id: string;
  orderName: string;
  buyerName: string;
  nip: string;
  status: string;
  ksefNumber: string | null;
  fa3Xml: string;
  currency: string;
  exchangeRate: { toString(): string } | string | number | null;
  exchangeRateDate: Date | null;
  exchangeRateTableNo: string | null;
  totalGross: { toString(): string } | string | number;
  totalGrossPln: { toString(): string } | string | number | null;
  createdAt: Date;
  items: PdfInvoiceItem[];
  shop: {
    sellerNip: string | null;
    sellerName: string | null;
    sellerAddress: string | null;
    placeOfIssue: string | null;
  };
}

function money(value: { toString(): string } | string | number, currency = "PLN") {
  return `${Number(value.toString()).toFixed(2)} ${currency}`;
}

function textOrDash(value: string | null | undefined) {
  return value?.trim() || "-";
}

function statusLabel(invoice: PdfInvoice) {
  if (invoice.ksefNumber) return "Submitted to KSeF";
  if (invoice.status === "exported") return "Exported draft";
  if (invoice.status === "correction_needed") return "Needs correction review";
  if (invoice.status === "corrected") return "Corrected";
  return "Draft for review";
}

function drawField(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width: number) {
  doc.fillColor("#6b5b4a").font("Helvetica-Bold").fontSize(7).text(label.toUpperCase(), x, y, { width });
  doc.fillColor("#101729").font("Helvetica").fontSize(9).text(value, x, y + 12, { width, lineGap: 2 });
}

function qrHost() {
  if (env.KSEF_API_BASE_URL?.includes("demo")) return "https://qr-demo.ksef.mf.gov.pl";
  if (env.KSEF_API_BASE_URL?.includes("test")) return "https://qr-test.ksef.mf.gov.pl";

  if (env.KSEF_ENVIRONMENT === "PROD") return "https://qr.ksef.mf.gov.pl";
  if (env.KSEF_ENVIRONMENT === "DEMO") return "https://qr-demo.ksef.mf.gov.pl";
  return "https://qr-test.ksef.mf.gov.pl";
}

function formatQrIssueDate(value: string | null, fallback: Date) {
  const source = value?.trim() || fallback.toISOString().slice(0, 10);
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  return fallback.toISOString().slice(0, 10).split("-").reverse().join("-");
}

function issueDateFromXml(xml: string) {
  return xml.match(/<(?:\w+:)?P_1>([^<]+)<\/(?:\w+:)?P_1>/)?.[1] ?? null;
}

export function buildKsefInvoiceVerificationUrl(invoice: PdfInvoice) {
  const sellerNip = invoice.shop.sellerNip?.replace(/\D/g, "");

  if (!invoice.ksefNumber || !sellerNip || !invoice.fa3Xml) {
    return null;
  }

  const issueDate = formatQrIssueDate(issueDateFromXml(invoice.fa3Xml), invoice.createdAt);
  const invoiceHash = crypto.createHash("sha256").update(invoice.fa3Xml, "utf8").digest("base64url");

  return `${qrHost()}/invoice/${sellerNip}/${issueDate}/${invoiceHash}`;
}

export async function buildInvoicePdf(invoice: PdfInvoice) {
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const chunks: Buffer[] = [];
  const verificationUrl = buildKsefInvoiceVerificationUrl(invoice);
  const currency = invoice.currency || "PLN";
  const qrPng = verificationUrl
    ? await QRCode.toBuffer(verificationUrl, { errorCorrectionLevel: "M", margin: 1, width: 140 })
    : null;

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.rect(0, 0, 595, 132).fill("#fff8ef");
  doc.rect(0, 0, 7, 842).fill("#e21d2f");
  doc.fillColor("#e21d2f").font("Helvetica-Bold").fontSize(8).text("KSEF PILOT BY FAKTURAFLOW", 48, 42, {
    characterSpacing: 0.6
  });
  doc.fillColor("#101729").font("Helvetica-Bold").fontSize(23).text("FA(3) invoice packet", 48, 58, {
    width: qrPng ? 330 : 500
  });
  doc.fillColor("#6b5b4a").font("Helvetica").fontSize(9).text(
    invoice.ksefNumber
      ? "KSeF number and verification QR included."
      : "Review preview generated from Shopify order data. The attached XML is the KSeF payload.",
    48,
    88,
    { width: qrPng ? 330 : 500 }
  );

  if (qrPng) {
    doc.roundedRect(429, 30, 118, 118, 6).fill("#ffffff").strokeColor("#eadfca").stroke();
    doc.image(qrPng, 447, 42, { width: 82 });
    doc.fillColor("#101729").font("Helvetica-Bold").fontSize(6.5).text(invoice.ksefNumber ?? "", 435, 127, {
      width: 105,
      align: "center"
    });
  }

  const statusX = 48;
  const statusY = 152;
  doc.roundedRect(statusX, statusY, 500, 62, 7).fill("#ffffff").strokeColor("#eadfca").stroke();
  drawField(doc, "Order", invoice.orderName, statusX + 16, statusY + 14, 110);
  drawField(doc, "Status", statusLabel(invoice), statusX + 145, statusY + 14, 130);
  drawField(doc, "Created", invoice.createdAt.toISOString().slice(0, 10), statusX + 295, statusY + 14, 80);
  drawField(doc, "KSeF number", textOrDash(invoice.ksefNumber), statusX + 392, statusY + 14, 92);

  if (verificationUrl) {
    doc.fillColor("#6b5b4a").font("Helvetica").fontSize(7).text(`Verification: ${verificationUrl}`, 64, 220, {
      width: 468
    });
  }

  const leftX = 48;
  const rightX = 315;
  const startY = verificationUrl ? 246 : 232;

  doc.roundedRect(leftX, startY, 233, 96, 7).fill("#ffffff").strokeColor("#eadfca").stroke();
  doc.roundedRect(rightX, startY, 233, 96, 7).fill("#ffffff").strokeColor("#eadfca").stroke();

  doc.fillColor("#101729").font("Helvetica-Bold").fontSize(11).text("Seller", leftX + 16, startY + 15);
  doc.fillColor("#101729").font("Helvetica").fontSize(9);
  doc.text(textOrDash(invoice.shop.sellerName), leftX + 16, startY + 35, { width: 200 });
  doc.text(`NIP: ${textOrDash(invoice.shop.sellerNip)}`, leftX + 16, startY + 50, { width: 200 });
  doc.text(textOrDash(invoice.shop.sellerAddress), leftX + 16, startY + 65, { width: 200 });
  doc.text(`Place: ${textOrDash(invoice.shop.placeOfIssue)}`, leftX + 16, startY + 80, { width: 200 });

  doc.fillColor("#101729").font("Helvetica-Bold").fontSize(11).text("Buyer", rightX + 16, startY + 15);
  doc.fillColor("#101729").font("Helvetica").fontSize(9);
  doc.text(textOrDash(invoice.buyerName), rightX + 16, startY + 35, { width: 200 });
  doc.text(`NIP: ${invoice.nip}`, rightX + 16, startY + 50, { width: 200 });

  const tableTop = startY + 122;
  const columns = {
    name: 64,
    qty: 274,
    net: 322,
    vat: 393,
    gross: 472
  };

  doc.roundedRect(48, tableTop, 500, 28, 6).fill("#101729");
  doc.fillColor("#101729").font("Helvetica-Bold").fontSize(9);
  doc.fillColor("#ffffff").text("Item", columns.name, tableTop + 10, { width: 200 });
  doc.text("Qty", columns.qty, tableTop + 10, { width: 34, align: "right" });
  doc.text("Net", columns.net, tableTop + 10, { width: 58, align: "right" });
  doc.text("VAT", columns.vat, tableTop + 10, { width: 64, align: "right" });
  doc.text("Gross", columns.gross, tableTop + 10, { width: 60, align: "right" });

  let y = tableTop + 40;
  doc.font("Helvetica").fontSize(9);

  invoice.items.forEach((item, index) => {
    if (y > 705) {
      doc.addPage();
      y = 64;
    }

    if (index % 2 === 0) {
      doc.rect(48, y - 8, 500, 30).fill("#fffdfa");
    }
    doc.fillColor("#101729");
    doc.text(item.name, columns.name, y, { width: 200 });
    doc.text(String(item.quantity), columns.qty, y, { width: 34, align: "right" });
    doc.text(money(item.totalNet, currency), columns.net, y, { width: 58, align: "right" });
    doc.text(`${money(item.totalVat, currency)} (${item.vatRate}%)`, columns.vat, y, { width: 64, align: "right" });
    doc.text(money(Number(item.totalNet.toString()) + Number(item.totalVat.toString()), currency), columns.gross, y, { width: 60, align: "right" });
    y += 30;
  });

  y += 8;
  const summaryHeight = currency === "PLN" ? 46 : 68;
  doc.roundedRect(330, y, 218, summaryHeight, 7).fill("#fff8ef").strokeColor("#eadfca").stroke();
  doc.fillColor("#6b5b4a").font("Helvetica-Bold").fontSize(8).text("TOTAL GROSS", 348, y + 11, { width: 80 });
  doc.fillColor("#101729").font("Helvetica-Bold").fontSize(15).text(money(invoice.totalGross, currency), 430, y + 9, {
    width: 100,
    align: "right"
  });
  if (currency !== "PLN") {
    doc.fillColor("#6b5b4a").font("Helvetica").fontSize(7).text(
      `VAT converted to PLN for FA(3) using NBP ${textOrDash(invoice.exchangeRateTableNo)} from ${invoice.exchangeRateDate?.toISOString().slice(0, 10) ?? "-"}. Gross PLN: ${money(invoice.totalGrossPln ?? invoice.totalGross, "PLN")}`,
      348,
      y + 34,
      { width: 180, align: "right" }
    );
  }

  doc.font("Helvetica").fontSize(8).fillColor("#6b5b4a");
  doc.text("KSeF Pilot by FakturaFlow. Review the FA(3) XML before live KSeF submission. The app reads Shopify orders and never modifies them.", 48, 760, {
    width: 500,
    align: "center"
  });

  doc.end();
  return finished;
}
