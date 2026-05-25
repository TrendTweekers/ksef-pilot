ALTER TABLE "InvoiceItem"
ADD COLUMN "shopifyLineItemId" TEXT;

CREATE INDEX "InvoiceItem_invoiceId_shopifyLineItemId_idx" ON "InvoiceItem"("invoiceId", "shopifyLineItemId");
