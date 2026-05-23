ALTER TABLE "Shop"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "uninstalledAt" TIMESTAMP(3),
  ADD COLUMN "billingSubscriptionId" TEXT,
  ADD COLUMN "billingStatus" TEXT,
  ADD COLUMN "reviewDismissedAt" TIMESTAMP(3),
  ADD COLUMN "reviewRequestedAt" TIMESTAMP(3);
