ALTER TABLE "KsefInvoice"
  ADD COLUMN "ksefSessionRef" TEXT,
  ADD COLUMN "upoXml" TEXT,
  ADD COLUMN "upoStatus" TEXT,
  ADD COLUMN "upoFetchedAt" TIMESTAMP(3);

CREATE INDEX "KsefInvoice_upoStatus_status_idx"
  ON "KsefInvoice"("upoStatus", "status");
