-- CreateTable
CREATE TABLE "Shop" (
    "id" SERIAL NOT NULL,
    "domain" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "ksefToken" TEXT,
    "ksefConnected" BOOLEAN NOT NULL DEFAULT false,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifySession" (
    "id" TEXT NOT NULL,
    "shopId" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderFlag" (
    "id" TEXT NOT NULL,
    "shopId" INTEGER NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "isB2b" BOOLEAN NOT NULL DEFAULT false,
    "nip" TEXT,
    "buyerName" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KsefInvoice" (
    "id" TEXT NOT NULL,
    "shopId" INTEGER NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "nip" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "fa3Xml" TEXT NOT NULL,
    "ksefNumber" TEXT,
    "status" TEXT NOT NULL,
    "correctionOf" TEXT,
    "totalGross" DECIMAL(12,2) NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "KsefInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "vatRate" TEXT NOT NULL,
    "totalNet" DECIMAL(12,2) NOT NULL,
    "totalVat" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_domain_key" ON "Shop"("domain");

-- CreateIndex
CREATE INDEX "ShopifySession_shopId_idx" ON "ShopifySession"("shopId");

-- CreateIndex
CREATE INDEX "OrderFlag_shopId_isB2b_processedAt_idx" ON "OrderFlag"("shopId", "isB2b", "processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderFlag_shopId_orderId_key" ON "OrderFlag"("shopId", "orderId");

-- CreateIndex
CREATE INDEX "KsefInvoice_shopId_orderId_idx" ON "KsefInvoice"("shopId", "orderId");

-- CreateIndex
CREATE INDEX "KsefInvoice_status_nextRetryAt_idx" ON "KsefInvoice"("status", "nextRetryAt");

-- AddForeignKey
ALTER TABLE "ShopifySession" ADD CONSTRAINT "ShopifySession_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFlag" ADD CONSTRAINT "OrderFlag_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KsefInvoice" ADD CONSTRAINT "KsefInvoice_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "KsefInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
