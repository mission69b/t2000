-- CreateTable
CREATE TABLE "reputation_cache" (
    "wallet_address" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "tier" TEXT NOT NULL,
    "total_payments" INTEGER NOT NULL,
    "total_volume_usdc" INTEGER NOT NULL,
    "failure_rate" DOUBLE PRECISION NOT NULL,
    "days_since_first" DOUBLE PRECISION NOT NULL,
    "last_activity" TIMESTAMP(3) NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reputation_cache_pkey" PRIMARY KEY ("wallet_address")
);

-- CreateIndex
CREATE INDEX "reputation_cache_tier_idx" ON "reputation_cache"("tier");
CREATE INDEX "reputation_cache_expires_at_idx" ON "reputation_cache"("expires_at");
