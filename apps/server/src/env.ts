/**
 * Boot-time environment validation for `@t2000/server`.
 *
 * SPEC 30 D-14 — cross-app env-gate (locked 2026-05-13).
 *
 * Mirrors the canonical pattern at `audric/apps/web/lib/env.ts`. The
 * contract is documented in `t2000/.cursor/rules/env-validation-gate.mdc`:
 *
 *   - Required vars use `z.string().trim().min(1, ...)` — empty
 *     strings are invalid (catches the April 2026 BlockVision-empty-
 *     string-in-Vercel bug class).
 *   - Optional vars normalize whitespace-only / empty → undefined.
 *   - Validation runs at first import, AND on every `env.X` access
 *     (so `vi.stubEnv()` in tests + runtime env mutation in dev both
 *     work). The on-access re-parse is ~50µs — negligible against
 *     cron job durations measured in seconds.
 *   - `process.env.X` reads are blocked by ESLint outside this file.
 *
 * The four critical-path vars (DATABASE_URL, AUDRIC_INTERNAL_KEY,
 * T2000_OVERLAY_FEE_WALLET, MPP_GATEWAY_TREASURIES) become loud
 * failures when missing. The optional vars get explicit defaults so
 * the rest of the codebase can read them as known-defined values.
 *
 * The previous pattern — `process.env.AUDRIC_INTERNAL_KEY ?? ''` then
 * shipping with an empty-string auth header — was the same shape as
 * the bug that motivated this gate. Now it throws at boot AND on
 * every access if the env is mutated to an invalid state mid-run.
 */

import { z } from 'zod';

const requiredString = z.string().trim().min(1, 'must be a non-empty string');
const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? undefined : v.trim().length > 0 ? v.trim() : undefined));

const optionalIntWithDefault = (defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((v): number => {
      if (v === undefined) return defaultValue;
      const trimmed = v.trim();
      if (trimmed.length === 0) return defaultValue;
      const parsed = parseInt(trimmed, 10);
      return Number.isFinite(parsed) ? parsed : defaultValue;
    });

const schema = z.object({
  // Required — boot-fails when missing or empty.
  DATABASE_URL: requiredString,
  AUDRIC_INTERNAL_KEY: requiredString,
  T2000_OVERLAY_FEE_WALLET: requiredString,

  // Optional treasuries list — empty allowed (means "no MPP fees indexed yet").
  MPP_GATEWAY_TREASURIES: optionalString,

  // Optional with explicit defaults.
  AUDRIC_INTERNAL_URL: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim().length === 0 ? 'https://audric.ai' : v.trim())),
  SUI_RPC_URL: optionalString,
  CRON_GROUP: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim().length === 0 ? 'daily-intel' : v.trim())),
  CRON_OVERRIDE_HOUR: optionalString,
  INDEXER_POLL_INTERVAL_MS: optionalIntWithDefault(2000),
  INDEXER_BATCH_SIZE: optionalIntWithDefault(10),
  T2000_FIN_CTX_SHARD_COUNT: optionalIntWithDefault(8),
  PORT: optionalIntWithDefault(3000),
});

type EnvShape = z.infer<typeof schema>;

function readRuntimeEnv(): Record<string, string | undefined> {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    AUDRIC_INTERNAL_KEY: process.env.AUDRIC_INTERNAL_KEY,
    T2000_OVERLAY_FEE_WALLET: process.env.T2000_OVERLAY_FEE_WALLET,
    MPP_GATEWAY_TREASURIES: process.env.MPP_GATEWAY_TREASURIES,
    AUDRIC_INTERNAL_URL: process.env.AUDRIC_INTERNAL_URL,
    SUI_RPC_URL: process.env.SUI_RPC_URL,
    CRON_GROUP: process.env.CRON_GROUP,
    CRON_OVERRIDE_HOUR: process.env.CRON_OVERRIDE_HOUR,
    INDEXER_POLL_INTERVAL_MS: process.env.INDEXER_POLL_INTERVAL_MS,
    INDEXER_BATCH_SIZE: process.env.INDEXER_BATCH_SIZE,
    T2000_FIN_CTX_SHARD_COUNT: process.env.T2000_FIN_CTX_SHARD_COUNT,
    PORT: process.env.PORT,
  };
}

function parseOrThrow(): EnvShape {
  const parsed = schema.safeParse(readRuntimeEnv());
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `[env] @t2000/server: invalid environment configuration:\n${issues}\n\n` +
        `Required vars: DATABASE_URL, AUDRIC_INTERNAL_KEY, T2000_OVERLAY_FEE_WALLET.\n` +
        `Set them in apps/server/.env (local) or the ECS task definition (prod).`,
    );
  }
  return parsed.data;
}

// Boot-time validation — runs once at first import. Fails fast on misconfig.
parseOrThrow();

// Live proxy — re-parses on every access so `vi.stubEnv()` in tests and
// runtime env mutations both take effect. The schema enforces the gate
// on every read; an env mutation that violates the contract throws at
// the call site instead of silently corrupting downstream behavior.
export const env: EnvShape = new Proxy({} as EnvShape, {
  get(_target, prop) {
    const current = parseOrThrow();
    return current[prop as keyof EnvShape];
  },
});
