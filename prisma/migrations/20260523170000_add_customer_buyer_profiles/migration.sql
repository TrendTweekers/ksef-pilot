CREATE TABLE "CustomerBuyerProfile" (
    "id" TEXT NOT NULL,
    "shopId" INTEGER NOT NULL,
    "customerId" TEXT NOT NULL,
    "nip" TEXT NOT NULL,
    "buyerName" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerBuyerProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerBuyerProfile_shopId_customerId_key" ON "CustomerBuyerProfile"("shopId", "customerId");
CREATE INDEX "CustomerBuyerProfile_shopId_nip_idx" ON "CustomerBuyerProfile"("shopId", "nip");

ALTER TABLE "CustomerBuyerProfile" ADD CONSTRAINT "CustomerBuyerProfile_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
