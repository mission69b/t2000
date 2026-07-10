-- S.701 full store cleanup: the commerce lane is deleted; receipts data
-- was wiped first (162 store-era rows).
DROP TABLE IF EXISTS "commerce_receipts";
