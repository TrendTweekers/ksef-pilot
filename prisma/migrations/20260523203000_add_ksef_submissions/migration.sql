ALTER TABLE "Shop" ADD COLUMN "ksefTestMode" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "KsefSubmission" (
  "id" TEXT NOT NULL,
  "shopId" INTEGER NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'test',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "sessionReferenceNumber" TEXT,
  "invoiceReferenceNumber" TEXT,
  "ksefNumber" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMP(3),
  "lastError" TEXT,
  "requestHash" TEXT,
  "responsePayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "submittedAt" TIMESTAMP(3),

  CONSTRAINT "KsefSubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KsefSubmission_shopId_status_nextRetryAt_idx" ON "KsefSubmission"("shopId", "status", "nextRetryAt");
CREATE INDEX "KsefSubmission_invoiceId_createdAt_idx" ON "KsefSubmission"("invoiceId", "createdAt");

ALTER TABLE "KsefSubmission" ADD CONSTRAINT "KsefSubmission_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KsefSubmission" ADD CONSTRAINT "KsefSubmission_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "KsefInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
