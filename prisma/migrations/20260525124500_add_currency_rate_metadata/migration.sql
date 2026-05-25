ALTER TABLE "KsefInvoice"
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'PLN',
ADD COLUMN "exchangeRate" DECIMAL(14, 6),
ADD COLUMN "exchangeRateDate" TIMESTAMP(3),
ADD COLUMN "exchangeRateTableNo" TEXT,
ADD COLUMN "totalGrossPln" DECIMAL(12, 2);

UPDATE "KsefInvoice"
SET "totalGrossPln" = "totalGross"
WHERE "currency" = 'PLN' AND "totalGrossPln" IS NULL;

CREATE TABLE "NbpExchangeRate" (
  "id" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "rateDate" TIMESTAMP(3) NOT NULL,
  "tableNo" TEXT NOT NULL,
  "rate" DECIMAL(14, 6) NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NbpExchangeRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NbpExchangeRate_currency_rateDate_key" ON "NbpExchangeRate"("currency", "rateDate");
