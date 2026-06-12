import { defineConfig } from 'vitest/config';
import path from 'path';

// [SPEC 30 D-14 — 2026-05-14] Test-time env hydration. The Zod env-gate
// in `lib/env.ts` is intentionally strict: it throws at boot when any
// REQUIRED var is missing or empty (every vendor API key + 3 infra
// vars). For unit tests we don't want a real .env with real secrets;
// the network calls are all mocked. Setting dummy non-empty values
// here keeps the gate active (the contract gets exercised on every
// `env.X` access) while letting the suite run.
//
// Tests that need to assert behavior under specific env conditions
// can `vi.stubEnv()` to override these values per-test — the Proxy
// re-reads `process.env` on access so stubs take effect immediately.
const REQUIRED_KEYS = [
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
  'INTERNAL_API_KEY',
  'IPINFO_API_KEY',
  'JINA_API_KEY',
  'KV_REST_API_TOKEN',
  'KV_REST_API_URL',
  'LOB_API_KEY',
  'MPP_CHALLENGE_SECRET',
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
  'SCREENSHOTONE_API_KEY',
  'SERPAPI_API_KEY',
  'SERPER_API_KEY',
  'SHORTIO_API_KEY',
  'STABILITY_API_KEY',
  'TOGETHER_API_KEY',
  'VIRUSTOTAL_API_KEY',
] as const;
for (const k of REQUIRED_KEYS) {
  process.env[k] ??= `test-${k.toLowerCase()}`;
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['test/e2e/**', 'node_modules/**'],
    alias: {
      '@': path.resolve(__dirname),
    },
  },
});
