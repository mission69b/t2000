-- CreateTable
CREATE TABLE "mpp_payments" (
    "id" SERIAL NOT NULL,
    "service" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "digest" TEXT,
    "sender" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mpp_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mpp_payments_created_at_idx" ON "mpp_payments"("created_at" DESC);

-- CreateIndex
CREATE INDEX "mpp_payments_service_idx" ON "mpp_payments"("service");
