/**
 * Boot-time environment validation for `@t2000/gateway`.
 *
 * SPEC 30 D-14 — cross-app env-gate (locked 2026-05-13, optional-keys
 * fix shipped 2026-05-14).
 *
 * Mirrors the canonical pattern at `audric/apps/web/lib/env.ts`. The
 * contract is documented in `t2000/.cursor/rules/env-validation-gate.mdc`.
 *
 * Per-vendor API keys are `optionalString`, NOT `requiredString`. The
 * gateway is a multi-vendor router by design: each vendor key is read
 * inside exactly one `chargeProxy` route, and a missing key turns into
 * an upstream 401 at request time (graceful per-service degradation).
 * Marking them required would force every vendor key to be set in every
 * Vercel environment before the gateway can boot at all — which broke
 * production deploys for 5+ commits before the fix below.
 *
 * The empty-string-bug-class that motivated this gate is still caught:
 * `optionalString` normalises `""` and whitespace-only values to
 * `undefined`, so an accidentally-empty Vercel var manifests as
 * "vendor not configured" rather than as a phantom-truthy key that
 * silently 401s the upstream.
 *
 * The three `requiredString` entries below are infrastructure the
 * gateway literally cannot run without (auth boundary + Upstash
 * payment ledger). Everything else is per-vendor and optional.
 *
 * Reading vars: import `env` from `@/lib/env` and read `env.X`. The
 * `env` proxy re-parses on every access so `vi.stubEnv()` in tests +
 * runtime mutations both work. ESLint blocks `process.env.X` outside
 * this file (NODE_ENV exempted as a build-time constant).
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

const schema = z.object({
  // ---- Vendor API keys (optional — gateway is a multi-vendor router;
  // each key backs exactly one chargeProxy route, missing key → upstream
  // 401 at request time, gateway as a whole still boots and serves the
  // routes whose keys ARE configured) ----
  ALPHAVANTAGE_API_KEY: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  ASSEMBLYAI_API_KEY: optionalString,
  BRAVE_SEARCH_API_KEY: optionalString,
  COHERE_API_KEY: optionalString,
  COINGECKO_API_KEY: optionalString,
  DEEPL_API_KEY: optionalString,
  DEEPSEEK_API_KEY: optionalString,
  E2B_API_KEY: optionalString,
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
  PRINTFUL_API_KEY: optionalString,
  PRINTFUL_STORE_ID: optionalString,
  PUSHOVER_API_TOKEN: optionalString,
  RAPIDAPI_KEY: optionalString,
  REPLICATE_API_KEY: optionalString,
  RESEND_API_KEY: optionalString,
  SCREENSHOTONE_API_KEY: optionalString,
  SERPAPI_API_KEY: optionalString,
  SERPER_API_KEY: optionalString,
  SHORTIO_API_KEY: optionalString,
  STABILITY_API_KEY: optionalString,
  TOGETHER_API_KEY: optionalString,
  VIRUSTOTAL_API_KEY: optionalString,

  // ---- Required infrastructure (the gateway literally cannot run
  // without these — INTERNAL_API_KEY is the audric ↔ gateway auth
  // boundary; KV_* is the Upstash payment ledger) ----
  INTERNAL_API_KEY: requiredString,
  KV_REST_API_URL: requiredString,
  KV_REST_API_TOKEN: requiredString,

  // ---- Optional with explicit defaults ----
  TREASURY_ADDRESS: optionalStringWithDefault(
    '0x76d70cf9d3ab7f714a35adf8766a2cb25929cae92ab4de54ff4dea0482b05012',
  ),
  GATEWAY_URL: optionalStringWithDefault('https://mpp.t2000.ai'),
  NEXT_PUBLIC_GATEWAY_URL: optionalStringWithDefault('https://mpp.t2000.ai'),
  SUI_NETWORK: optionalStringWithDefault('mainnet'),
  NEXT_PUBLIC_SUI_NETWORK: optionalStringWithDefault('mainnet'),
  SHORTIO_DOMAIN: optionalString,
  BLOB_READ_WRITE_TOKEN: optionalString, // Vercel Blob — only required for OpenAI image normalization

  // ---- Test-only ----
  E2E_TEST_PRIVATE_KEY: optionalString,
  DIGEST: optionalString,
});

type EnvShape = z.infer<typeof schema>;

const KEYS = Object.keys(schema.shape) as Array<keyof EnvShape>;

function readRuntimeEnv(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const k of KEYS) {
    out[k] = process.env[k];
  }
  return out;
}

function parseOrThrow(): EnvShape {
  const parsed = schema.safeParse(readRuntimeEnv());
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `[env] @t2000/gateway: invalid environment configuration:\n${issues}\n\n` +
        `Set vars in apps/gateway/.env.local (dev) or Vercel project settings (prod).`,
    );
  }
  return parsed.data;
}

// Boot-time validation — runs once at first import. Fails fast on misconfig.
parseOrThrow();

// Live proxy — re-parses on access so `vi.stubEnv()` in tests and
// runtime env mutations both take effect.
export const env: EnvShape = new Proxy({} as EnvShape, {
  get(_target, prop) {
    const current = parseOrThrow();
    return current[prop as keyof EnvShape];
  },
});
