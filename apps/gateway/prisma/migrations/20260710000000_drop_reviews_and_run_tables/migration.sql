-- Clean-slate pivot (SPEC_HUB_V1, 2026-07-10): reviews + R1 hosted handlers
-- deleted. Data was test-only (both features shipped <48h before removal).
DROP TABLE IF EXISTS "commerce_reviews";
DROP TABLE IF EXISTS "run_deployments";
DROP TABLE IF EXISTS "run_invocations";
