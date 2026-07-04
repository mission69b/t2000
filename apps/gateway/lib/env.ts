/**
 * Boot-time environment validation for `@t2000/gateway`.
 *
 * SPEC 30 D-14 — cross-app env-gate (locked 2026-05-13, optional-keys
 * fix shipped 2026-05-14, **server/client split fix 2026-05-16**).
 *
 * Mirrors the canonical pattern at `audric/apps/web/lib/env.ts`. The
 * contract is documented in `t2000/.cursor/rules/env-validation-gate.mdc`.
 *
 * ## Why this file split server/client schemas (the 2026-05-16 fix)
 *
 * The previous version had a single `schema` and a dynamic
 * `readRuntimeEnv` that looped `process.env[k]`. Two bugs:
 *
 *   1. **No runtime split.** When `app/explorer/page.tsx` and
 *      `app/components/LiveFeed.tsx` (both `'use client'`) imported
 *      `@/lib/env`, the env module evaluated in the browser bundle
 *      and crashed validating server-only `INTERNAL_API_KEY` /
 *      `KV_REST_API_*` (always `undefined` in the browser).
 *   2. **Dynamic `process.env[k]` access** prevented Next.js's static
 *      replacement of `NEXT_PUBLIC_*` vars in client bundles —
 *      Next.js's webpack plugin only inlines syntactic
 *      `process.env.NEXT_PUBLIC_X` references, NOT computed-property
 *      access. So even after fix #1, `env.NEXT_PUBLIC_SUI_NETWORK`
 *      would have returned `undefined` in the browser.
 *
 * Both fixed by mirroring audric/web: separate `serverSchema` +
 * `clientSchema`, literal `process.env.X` references in `runtimeEnv`,
 * `isServer` detection, conditional schema selection.
 *
 * ## Design notes
 *
 * Per-vendor API keys are `optionalString`, NOT `requiredString`. The
 * gateway is a multi-vendor router by design: each vendor key is read
 * inside exactly one `chargeProxy` route, and a missing key turns into
 * an upstream 401 at request time (graceful per-service degradation).
 * Marking them required would force every vendor key to be set in every
 * Vercel environment before the gateway can boot at all.
 *
 * The empty-string-bug-class that motivated this gate is still caught:
 * `optionalString` normalises `""` and whitespace-only values to
 * `undefined`, so an accidentally-empty Vercel var manifests as
 * "vendor not configured" rather than as a phantom-truthy key that
 * silently 401s the upstream.
 *
 * The three `requiredString` entries are infrastructure the gateway
 * literally cannot run without (auth boundary + Upstash payment
 * ledger). Everything else is per-vendor and optional.
 *
 * Reading vars: import `env` from `@/lib/env` and read `env.X`. The
 * `env` proxy re-parses on every access so `vi.stubEnv()` in tests +
 * runtime mutations both work. ESLint blocks `process.env.X` outside
 * this file (NODE_ENV exempted as a build-time constant).
 *
 * Client-side reads are restricted to `NEXT_PUBLIC_*` vars only — the
 * proxy guard throws on server-only var access from the browser.
 */

import { z } from 'zod';

const requiredString = z.string().trim().min(1, 'must be a non-empty string');
const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? undefined : v.trim().length > 0 ? v.trim() : undefined));

const optionalStringWithDefault = (defaultValue: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim().length === 0 ? defaultValue : v.trim()));

// ─── Server-side schema ────────────────────────────────────────────────
// These vars live only in server code (route handlers, edge functions,
// instrumentation). They MUST NEVER be referenced from client components.
const serverSchema = z.object({
  // ---- Vendor API keys (optional — gateway is a multi-vendor router;
  // each key backs exactly one chargeProxy route, missing key → upstream
  // 401 at request time, gateway as a whole still boots and serves the
  // routes whose keys ARE configured) ----
  ALPHAVANTAGE_API_KEY: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  ASSEMBLYAI_API_KEY: optionalString,
  BRAVE_SEARCH_API_KEY: optionalString,
  BOARD_POSTER_PROXY_KEY: optionalString,
  CMC_API_KEY: optionalString,
  COHERE_API_KEY: optionalString,
  COINGECKO_API_KEY: optionalString,
  DEEPL_API_KEY: optionalString,
  DEEPSEEK_API_KEY: optionalString,
  ELEVENLABS_API_KEY: optionalString,
  EXA_API_KEY: optionalString,
  EXCHANGERATE_API_KEY: optionalString,
  FAL_KEY: optionalString,
  FIRECRAWL_API_KEY: optionalString,
  GEMINI_API_KEY: optionalString,
  GOOGLE_MAPS_API_KEY: optionalString,
  GOOGLE_TRANSLATE_API_KEY: optionalString,
  GROQ_API_KEY: optionalString,
  HUNTER_API_KEY: optionalString,
  IPINFO_API_KEY: optionalString,
  JINA_API_KEY: optionalString,
  LOB_API_KEY: optionalString,
  MISTRAL_API_KEY: optionalString,
  NEWSAPI_API_KEY: optionalString,
  OPENAI_API_KEY: optionalString,
  OPENWEATHER_API_KEY: optionalString,
  PDFSHIFT_API_KEY: optionalString,
  PERPLEXITY_API_KEY: optionalString,
  PUSHOVER_API_TOKEN: optionalString,
  RAPIDAPI_KEY: optionalString,
  REPLICATE_API_KEY: optionalString,
  RESEND_API_KEY: optionalString,
  // [S.630] Notifications v1 sender identity ("t2000 <notifications@t2000.ai>").
  // BOTH this and RESEND_API_KEY must be set (and the domain verified in
  // Resend) for poster emails to send; unset → notify module no-ops.
  NOTIFY_FROM_EMAIL: optionalString,
  SCREENSHOTONE_API_KEY: optionalString,
  SERPAPI_API_KEY: optionalString,
  SERPER_API_KEY: optionalString,
  SHORTIO_API_KEY: optionalString,
  STABILITY_API_KEY: optionalString,
  TINIFY_API_KEY: optionalString,
  TOGETHER_API_KEY: optionalString,
  VIRUSTOTAL_API_KEY: optionalString,
  // t2000 Private API service key (sk-…) — a funded t2000 account's key the
  // gateway uses to call api.t2000.ai for the no-key x402 inference tier. When
  // unset, the /t2000 chat route degrades to 503. Optional like other vendors.
  T2000_PRIVATE_API_KEY: optionalString,

  // ---- Required infrastructure (the gateway literally cannot run
  // without these — INTERNAL_API_KEY is the audric ↔ gateway auth
  // boundary; KV_* is the Upstash payment ledger) ----
  INTERNAL_API_KEY: requiredString,
  KV_REST_API_URL: requiredString,
  KV_REST_API_TOKEN: requiredString,

  // [S.413] HMAC secret binding mppx challenges to this server. Without it
  // an echoed challenge's fields (incl. `expires`) are forgeable, which
  // re-opens the legacy-dialect self-replay window past the digest TTL.
  // [S.415] Kept OPTIONAL (with a loud boot warning in gateway.ts): the
  // S.414 requiredString promotion failed every Vercel build — the var
  // wasn't visible to the BUILD environment (the gate runs during static
  // generation). Re-promote to requiredString only after a green deploy
  // confirms build-time visibility (Vercel: correct project, Production
  // scope, available-at-build).
  MPP_CHALLENGE_SECRET: optionalString,

  // [2.6] Treasury wallet Bech32 secret (suiprivkey1…) — signs the gasless
  // USDC refund (treasury → payer) when an upstream fails AFTER settlement.
  // OPTIONAL (loud boot warning when absent): refunds degrade to the manual
  // `refund_due` log. Set in Vercel (Production, available-at-build) to
  // activate auto-refund. The treasury address must match TREASURY_ADDRESS.
  TREASURY_PRIVATE_KEY: optionalString,

  // Tasks runner wallet Bech32 secret (suiprivkey1…) — the BUYER behind
  // agents.t2000.ai/tasks (§II.16 v2): task rewards are standard rail buys
  // (commerce/pay/{worker}) signed by this wallet. OPTIONAL: unset → the
  // tasks engine is disabled (settlement hooks + /tasks/claim no-op). Its
  // USDC balance is the hard spend ceiling; per-task budgets cap below it.
  TASK_RUNNER_KEY: optionalString,

  // ---- Optional with explicit defaults ----
  TREASURY_ADDRESS: optionalStringWithDefault(
    '0xb012ac774bee4ee6e4e571a13457eeb7a75c4f2319551bf9d436fd497d57aca1',
  ),
  GATEWAY_URL: optionalStringWithDefault('https://mpp.t2000.ai'),
  SUI_NETWORK: optionalStringWithDefault('mainnet'),
  SHORTIO_DOMAIN: optionalString,
  BLOB_READ_WRITE_TOKEN: optionalString, // Vercel Blob — hosts ALL binary upstream responses (audio/image/pdf) as artifact URLs; when unset, binary endpoints degrade to a 503 JSON error rather than corrupting bytes

  // ---- Test-only ----
  E2E_TEST_PRIVATE_KEY: optionalString,
  DIGEST: optionalString,
});

// ─── Client-side schema (NEXT_PUBLIC_*) ────────────────────────────────
// These are statically replaced into client bundles by Next.js. The
// schema validates them at server boot AND at first import in the
// browser (because the literal `process.env.NEXT_PUBLIC_X` reference in
// `runtimeEnv` becomes a string literal in the client bundle).
const clientSchema = z.object({
  /** Sui network for client-rendered links (explorer URLs, etc.). */
  NEXT_PUBLIC_SUI_NETWORK: optionalStringWithDefault('mainnet'),

  /** Gateway base URL for client-rendered references. */
  NEXT_PUBLIC_GATEWAY_URL: optionalStringWithDefault('https://mpp.t2000.ai'),
});

// ─── Runtime env (Next.js requires literal references) ────────────────
// `process.env.X` MUST appear LITERALLY in source so Next.js can
// statically replace `NEXT_PUBLIC_*` vars for client bundles. The
// previous version used a `for (const k of KEYS) out[k] = process.env[k]`
// loop — that's a dynamic computed-property access which Next.js's
// webpack plugin does NOT inline. Hence the literal map below. Don't
// refactor this to a loop or `Object.fromEntries` — the static
// replacement won't fire and `NEXT_PUBLIC_*` reads will be `undefined`
// in the browser.
//
// Wrapped in a function so the proxy below can re-snapshot on every
// access — that's what makes `vi.stubEnv()` in tests work without a
// fresh module reload.
function getRuntimeEnv(): Record<string, string | undefined> {
  return {
    // Server — vendor keys
    ALPHAVANTAGE_API_KEY: process.env.ALPHAVANTAGE_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ASSEMBLYAI_API_KEY: process.env.ASSEMBLYAI_API_KEY,
    BRAVE_SEARCH_API_KEY: process.env.BRAVE_SEARCH_API_KEY,
    BOARD_POSTER_PROXY_KEY: process.env.BOARD_POSTER_PROXY_KEY,
    CMC_API_KEY: process.env.CMC_API_KEY,
    COHERE_API_KEY: process.env.COHERE_API_KEY,
    COINGECKO_API_KEY: process.env.COINGECKO_API_KEY,
    DEEPL_API_KEY: process.env.DEEPL_API_KEY,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
    EXA_API_KEY: process.env.EXA_API_KEY,
    EXCHANGERATE_API_KEY: process.env.EXCHANGERATE_API_KEY,
    FAL_KEY: process.env.FAL_KEY,
    FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
    GOOGLE_TRANSLATE_API_KEY: process.env.GOOGLE_TRANSLATE_API_KEY,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    HUNTER_API_KEY: process.env.HUNTER_API_KEY,
    IPINFO_API_KEY: process.env.IPINFO_API_KEY,
    JINA_API_KEY: process.env.JINA_API_KEY,
    LOB_API_KEY: process.env.LOB_API_KEY,
    MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
    NEWSAPI_API_KEY: process.env.NEWSAPI_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY,
    PDFSHIFT_API_KEY: process.env.PDFSHIFT_API_KEY,
    PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY,
    PUSHOVER_API_TOKEN: process.env.PUSHOVER_API_TOKEN,
    RAPIDAPI_KEY: process.env.RAPIDAPI_KEY,
    REPLICATE_API_KEY: process.env.REPLICATE_API_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    NOTIFY_FROM_EMAIL: process.env.NOTIFY_FROM_EMAIL,
    SCREENSHOTONE_API_KEY: process.env.SCREENSHOTONE_API_KEY,
    SERPAPI_API_KEY: process.env.SERPAPI_API_KEY,
    SERPER_API_KEY: process.env.SERPER_API_KEY,
    SHORTIO_API_KEY: process.env.SHORTIO_API_KEY,
    STABILITY_API_KEY: process.env.STABILITY_API_KEY,
    TINIFY_API_KEY: process.env.TINIFY_API_KEY,
    TOGETHER_API_KEY: process.env.TOGETHER_API_KEY,
    VIRUSTOTAL_API_KEY: process.env.VIRUSTOTAL_API_KEY,
    T2000_PRIVATE_API_KEY: process.env.T2000_PRIVATE_API_KEY,
    // Server — required infra
    INTERNAL_API_KEY: process.env.INTERNAL_API_KEY,
    KV_REST_API_URL: process.env.KV_REST_API_URL,
    KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
    MPP_CHALLENGE_SECRET: process.env.MPP_CHALLENGE_SECRET,
    TREASURY_PRIVATE_KEY: process.env.TREASURY_PRIVATE_KEY,
    TASK_RUNNER_KEY: process.env.TASK_RUNNER_KEY,
    // Server — optional with defaults / optional / test
    TREASURY_ADDRESS: process.env.TREASURY_ADDRESS,
    GATEWAY_URL: process.env.GATEWAY_URL,
    SUI_NETWORK: process.env.SUI_NETWORK,
    SHORTIO_DOMAIN: process.env.SHORTIO_DOMAIN,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    E2E_TEST_PRIVATE_KEY: process.env.E2E_TEST_PRIVATE_KEY,
    DIGEST: process.env.DIGEST,
    // Client (NEXT_PUBLIC_*)
    NEXT_PUBLIC_SUI_NETWORK: process.env.NEXT_PUBLIC_SUI_NETWORK,
    NEXT_PUBLIC_GATEWAY_URL: process.env.NEXT_PUBLIC_GATEWAY_URL,
  };
}

// ─── Runtime detection ─────────────────────────────────────────────────
// Two server runtimes: Node.js (functions, vitest) and Edge. Anything
// else is a browser client. See `audric/apps/web/lib/env.ts` for the
// full reasoning — same pattern.
const isServer =
  typeof process !== 'undefined' &&
  ((typeof process.versions === 'object' &&
    process.versions !== null &&
    typeof process.versions.node === 'string') ||
    process.env?.NEXT_RUNTIME === 'edge');

const fullSchema = z.object({ ...serverSchema.shape, ...clientSchema.shape });
type FullEnv = z.infer<typeof fullSchema>;

const SERVER_ONLY_KEYS = new Set<string>([
  // Vendor keys
  'ALPHAVANTAGE_API_KEY',
  'ANTHROPIC_API_KEY',
  'ASSEMBLYAI_API_KEY',
  'BRAVE_SEARCH_API_KEY',
  'COHERE_API_KEY',
  'COINGECKO_API_KEY',
  'DEEPL_API_KEY',
  'DEEPSEEK_API_KEY',
  'ELEVENLABS_API_KEY',
  'EXA_API_KEY',
  'EXCHANGERATE_API_KEY',
  'FAL_KEY',
  'FIRECRAWL_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_MAPS_API_KEY',
  'GOOGLE_TRANSLATE_API_KEY',
  'GROQ_API_KEY',
  'HUNTER_API_KEY',
  'IPINFO_API_KEY',
  'JINA_API_KEY',
  'LOB_API_KEY',
  'MISTRAL_API_KEY',
  'NEWSAPI_API_KEY',
  'OPENAI_API_KEY',
  'OPENWEATHER_API_KEY',
  'PDFSHIFT_API_KEY',
  'PERPLEXITY_API_KEY',
  'PUSHOVER_API_TOKEN',
  'RAPIDAPI_KEY',
  'REPLICATE_API_KEY',
  'RESEND_API_KEY',
  'NOTIFY_FROM_EMAIL',
  'SCREENSHOTONE_API_KEY',
  'SERPAPI_API_KEY',
  'SERPER_API_KEY',
  'SHORTIO_API_KEY',
  'STABILITY_API_KEY',
  'TINIFY_API_KEY',
  'TOGETHER_API_KEY',
  'VIRUSTOTAL_API_KEY',
  'T2000_PRIVATE_API_KEY',
  // Required infra
  'INTERNAL_API_KEY',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'MPP_CHALLENGE_SECRET',
  'TREASURY_PRIVATE_KEY',
  'TASK_RUNNER_KEY',
  // Optional / defaulted server-only
  'TREASURY_ADDRESS',
  'GATEWAY_URL',
  'SUI_NETWORK',
  'SHORTIO_DOMAIN',
  'BLOB_READ_WRITE_TOKEN',
  'E2E_TEST_PRIVATE_KEY',
  'DIGEST',
]);

function parseOrThrow(): FullEnv {
  const schemaToValidate = isServer ? fullSchema : clientSchema;
  const parsed = schemaToValidate.safeParse(getRuntimeEnv());
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `[env] @t2000/gateway: invalid environment configuration:\n${issues}\n\n` +
        `Set vars in apps/gateway/.env.local (dev) or Vercel project settings (prod).`,
    );
  }
  return parsed.data as FullEnv;
}

// Boot-time validation — runs once at first import. Fails fast on misconfig.
parseOrThrow();

// Live proxy — re-parses on access so `vi.stubEnv()` in tests and
// runtime env mutations both take effect. Also enforces the
// server-only guard: any browser-side read of a server-only var
// throws (without this, accidental reads would silently return
// `undefined` because Next.js strips server vars from client bundles).
export const env: FullEnv = new Proxy({} as FullEnv, {
  get(_target, prop) {
    if (typeof prop !== 'string') return undefined;
    if (!isServer && SERVER_ONLY_KEYS.has(prop)) {
      throw new Error(
        `[env] @t2000/gateway: cannot access server-only var '${prop}' from the client. ` +
          `Move this code to a server component / route handler, or expose ` +
          `the value via a NEXT_PUBLIC_* var if it's truly safe to ship to the browser.`,
      );
    }
    const current = parseOrThrow();
    return current[prop as keyof FullEnv];
  },
});
