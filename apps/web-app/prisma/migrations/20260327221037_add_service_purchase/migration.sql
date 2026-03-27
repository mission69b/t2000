-- CreateTable
CREATE TABLE "ServicePurchase" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "productId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServicePurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServicePurchase_address_createdAt_idx" ON "ServicePurchase"("address", "createdAt");
