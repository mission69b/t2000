-- Remove duplicate digests, keeping only the earliest row per digest
DELETE FROM "mpp_payments" a
  USING "mpp_payments" b
  WHERE a.id > b.id
    AND a.digest IS NOT NULL
    AND a.digest = b.digest;

-- CreateIndex
CREATE UNIQUE INDEX "mpp_payments_digest_key" ON "mpp_payments"("digest");
