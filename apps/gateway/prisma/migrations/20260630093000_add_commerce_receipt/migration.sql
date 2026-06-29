-- CreateTable
CREATE TABLE "commerce_receipts" (
    "id" SERIAL NOT NULL,
    "buyer" TEXT NOT NULL,
    "seller" TEXT NOT NULL,
    "resource" TEXT,
    "gross_micros" INTEGER NOT NULL,
    "fee_micros" INTEGER NOT NULL,
    "net_micros" INTEGER NOT NULL,
    "fee_bps" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "collect_digest" TEXT NOT NULL,
    "forward_digest" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commerce_receipts_collect_digest_key" ON "commerce_receipts"("collect_digest");

-- CreateIndex
CREATE INDEX "commerce_receipts_seller_idx" ON "commerce_receipts"("seller");

-- CreateIndex
CREATE INDEX "commerce_receipts_created_at_idx" ON "commerce_receipts"("created_at" DESC);
