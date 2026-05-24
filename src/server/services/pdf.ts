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
  totalGross: { toString(): string } | string | number;
  createdAt: Date;
  items: PdfInvoiceItem[];
  shop: {
    sellerNip: string | null;
    sellerName: string | null;
    sellerAddress: string | null;
    placeOfIssue: string | null;
  };
}

function money(value: { toString(): string } | string | number) {
  return `${Number(value.toString()).toFixed(2)} PLN`;
}

function textOrDash(value: string | null | undefined) {
  return value?.trim() || "-";
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
  const qrPng = verificationUrl
    ? await QRCode.toBuffer(verificationUrl, { errorCorrectionLevel: "M", margin: 1, width: 140 })
    : null;

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.font("Helvetica-Bold").fontSize(20).text("KSeF Pilot draft invoice", { align: "left", width: qrPng ? 340 : 500 });
  doc.moveDown(0.25);
  doc.font("Helvetica").fontSize(10).fillColor("#6b7280").text("Draft preview generated from Shopify order data. The XML remains the legal KSeF payload.", {
    width: qrPng ? 340 : 500
  });
  if (qrPng) {
    doc.image(qrPng, 440, 48, { width: 82 });
    doc.fillColor("#101729").font("Helvetica-Bold").fontSize(7).text(invoice.ksefNumber ?? "", 405, 134, {
      width: 150,
      align: "center"
    });
  }
  doc.moveDown(1.2);

  doc.fillColor("#101729").font("Helvetica-Bold").fontSize(13).text(`Order ${invoice.orderName}`);
  doc.font("Helvetica").fontSize(10).text(`Status: ${invoice.status}`);
  doc.text(`Created: ${invoice.createdAt.toISOString().slice(0, 10)}`);
  doc.text(`KSeF number: ${textOrDash(invoice.ksefNumber)}`);
  if (verificationUrl) {
    doc.text(`Verification link: ${verificationUrl}`, { width: 500 });
  }
  doc.moveDown();

  const leftX = doc.x;
  const rightX = 315;
  const startY = doc.y;

  doc.font("Helvetica-Bold").fontSize(11).text("Seller", leftX, startY);
  doc.font("Helvetica").fontSize(10);
  doc.text(textOrDash(invoice.shop.sellerName), leftX);
  doc.text(`NIP: ${textOrDash(invoice.shop.sellerNip)}`, leftX);
  doc.text(textOrDash(invoice.shop.sellerAddress), leftX);
  doc.text(`Place of issue: ${textOrDash(invoice.shop.placeOfIssue)}`, leftX);

  doc.font("Helvetica-Bold").fontSize(11).text("Buyer", rightX, startY);
  doc.font("Helvetica").fontSize(10);
  doc.text(textOrDash(invoice.buyerName), rightX);
  doc.text(`NIP: ${invoice.nip}`, rightX);

  doc.y = Math.max(doc.y, startY + 88);
  doc.moveDown();

  const tableTop = doc.y;
  const columns = {
    name: 48,
    qty: 265,
    net: 315,
    vat: 390,
    gross: 465
  };

  doc.rect(48, tableTop, 500, 24).fill("#f8f4ec");
  doc.fillColor("#101729").font("Helvetica-Bold").fontSize(9);
  doc.text("Item", columns.name, tableTop + 8, { width: 205 });
  doc.text("Qty", columns.qty, tableTop + 8, { width: 38, align: "right" });
  doc.text("Net", columns.net, tableTop + 8, { width: 60, align: "right" });
  doc.text("VAT", columns.vat, tableTop + 8, { width: 55, align: "right" });
  doc.text("Gross", columns.gross, tableTop + 8, { width: 75, align: "right" });

  let y = tableTop + 32;
  doc.font("Helvetica").fontSize(9);

  for (const item of invoice.items) {
    if (y > 720) {
      doc.addPage();
      y = 48;
    }

    doc.fillColor("#101729");
    doc.text(item.name, columns.name, y, { width: 205 });
    doc.text(String(item.quantity), columns.qty, y, { width: 38, align: "right" });
    doc.text(money(item.totalNet), columns.net, y, { width: 60, align: "right" });
    doc.text(`${money(item.totalVat)} (${item.vatRate}%)`, columns.vat, y, { width: 65, align: "right" });
    doc.text(money(Number(item.totalNet.toString()) + Number(item.totalVat.toString())), columns.gross, y, { width: 75, align: "right" });
    y += 28;
  }

  doc.moveTo(48, y).lineTo(548, y).strokeColor("#e5dfcc").stroke();
  y += 18;
  doc.fillColor("#101729").font("Helvetica-Bold").fontSize(12);
  doc.text(`Total gross: ${money(invoice.totalGross)}`, 365, y, { width: 183, align: "right" });

  doc.moveDown(3);
  doc.font("Helvetica").fontSize(9).fillColor("#6b7280");
  doc.text("KSeF Pilot by FakturaFlow. This PDF is a review aid; verify and submit the FA(3) XML according to Polish KSeF rules.", 48, 760, {
    width: 500,
    align: "center"
  });

  doc.end();
  return finished;
}
