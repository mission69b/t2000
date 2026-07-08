-- CreateTable
CREATE TABLE "commerce_reviews" (
    "id" SERIAL NOT NULL,
    "collect_digest" TEXT NOT NULL,
    "seller" TEXT NOT NULL,
    "buyer" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commerce_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commerce_reviews_collect_digest_key" ON "commerce_reviews"("collect_digest");

-- CreateIndex
CREATE INDEX "commerce_reviews_seller_created_at_idx" ON "commerce_reviews"("seller", "created_at" DESC);
