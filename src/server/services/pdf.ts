import PDFDocument from "pdfkit";

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

export async function buildInvoicePdf(invoice: PdfInvoice) {
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.font("Helvetica-Bold").fontSize(20).text("KSeF Pilot draft invoice", { align: "left" });
  doc.moveDown(0.25);
  doc.font("Helvetica").fontSize(10).fillColor("#6b7280").text("Draft preview generated from Shopify order data. The XML remains the legal KSeF payload.");
  doc.moveDown(1.2);

  doc.fillColor("#101729").font("Helvetica-Bold").fontSize(13).text(`Order ${invoice.orderName}`);
  doc.font("Helvetica").fontSize(10).text(`Status: ${invoice.status}`);
  doc.text(`Created: ${invoice.createdAt.toISOString().slice(0, 10)}`);
  doc.text(`KSeF number: ${textOrDash(invoice.ksefNumber)}`);
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
