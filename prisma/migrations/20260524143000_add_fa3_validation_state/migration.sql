ALTER TABLE "KsefInvoice"
ADD COLUMN "fa3ValidatedAt" TIMESTAMP(3),
ADD COLUMN "fa3ValidationStatus" TEXT,
ADD COLUMN "fa3ValidationError" TEXT;

CREATE INDEX "KsefInvoice_shopId_fa3ValidationStatus_idx" ON "KsefInvoice"("shopId", "fa3ValidationStatus");
