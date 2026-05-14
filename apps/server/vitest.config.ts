import { defineConfig } from 'vitest/config';

// [SPEC 30 D-14 — 2026-05-14] Test-time env hydration. The Zod env-gate
// in `src/env.ts` is intentionally strict: it throws at boot when any
// REQUIRED var is missing or empty (DATABASE_URL, AUDRIC_INTERNAL_KEY,
// T2000_OVERLAY_FEE_WALLET). For unit tests we don't want to require an
// .env file with real secrets; the network calls are all mocked. Setting
// dummy non-empty values here keeps the gate active (so the contract
// itself is exercised) while letting the rest of the suite run.
//
// If a test ever wants to assert the gate FAILS on missing vars, it can
// `vi.stubEnv()` to delete one, re-import './env', and assert the throw.
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test_db';
process.env.AUDRIC_INTERNAL_KEY ??= 'test-internal-key';
process.env.T2000_OVERLAY_FEE_WALLET ??= '0x0000000000000000000000000000000000000000000000000000000000000001';

export default defineConfig({
  test: {
    globals: false,
  },
});
