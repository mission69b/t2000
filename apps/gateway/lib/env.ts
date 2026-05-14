/**
 * Boot-time environment validation for `@t2000/gateway`.
 *
 * SPEC 30 D-14 — cross-app env-gate (locked 2026-05-13).
 *
 * Mirrors the canonical pattern at `audric/apps/web/lib/env.ts`. The
 * contract is documented in `t2000/.cursor/rules/env-validation-gate.mdc`.
 *
 * The gateway hosts ~88 endpoints across ~40 vendor APIs. Every vendor
 * API key is required for its specific endpoint; an empty/whitespace
 * value silently turns into a 401 from the upstream which manifests as
 * a "service is broken" report from a user — the same shape as the
 * BlockVision-empty-string-in-Vercel bug class that motivated this
 * gate. We catch ALL of them at boot.
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
  // ---- Vendor API keys (required — each backs ≥1 production endpoint) ----
  ALPHAVANTAGE_API_KEY: requiredString,
  ANTHROPIC_API_KEY: requiredString,
  ASSEMBLYAI_API_KEY: requiredString,
  BRAVE_SEARCH_API_KEY: requiredString,
  COHERE_API_KEY: requiredString,
  COINGECKO_API_KEY: requiredString,
  DEEPL_API_KEY: requiredString,
  DEEPSEEK_API_KEY: requiredString,
  E2B_API_KEY: requiredString,
  ELEVENLABS_API_KEY: requiredString,
  EXA_API_KEY: requiredString,
  EXCHANGERATE_API_KEY: requiredString,
  FAL_KEY: requiredString,
  FIRECRAWL_API_KEY: requiredString,
  GEMINI_API_KEY: requiredString,
  GOOGLE_MAPS_API_KEY: requiredString,
  GOOGLE_TRANSLATE_API_KEY: requiredString,
  GROQ_API_KEY: requiredString,
  HUNTER_API_KEY: requiredString,
  IPINFO_API_KEY: requiredString,
  JINA_API_KEY: requiredString,
  LOB_API_KEY: requiredString,
  MISTRAL_API_KEY: requiredString,
  NEWSAPI_API_KEY: requiredString,
  OPENAI_API_KEY: requiredString,
  OPENWEATHER_API_KEY: requiredString,
  PDFSHIFT_API_KEY: requiredString,
  PERPLEXITY_API_KEY: requiredString,
  PRINTFUL_API_KEY: requiredString,
  PRINTFUL_STORE_ID: requiredString,
  PUSHOVER_API_TOKEN: requiredString,
  RAPIDAPI_KEY: requiredString,
  REPLICATE_API_KEY: requiredString,
  RESEND_API_KEY: requiredString,
  SCREENSHOTONE_API_KEY: requiredString,
  SERPAPI_API_KEY: requiredString,
  SERPER_API_KEY: requiredString,
  SHORTIO_API_KEY: requiredString,
  STABILITY_API_KEY: requiredString,
  TOGETHER_API_KEY: requiredString,
  VIRUSTOTAL_API_KEY: requiredString,

  // ---- Required infrastructure ----
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
