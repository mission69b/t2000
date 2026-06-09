// ---------------------------------------------------------------------------
// v2/config.ts — AISDKEngineConfig (engine config type, standalone)
// ---------------------------------------------------------------------------
//
// [S.391 — 2026-06-09] Extracted from the deleted `v2/engine.ts` when the
// runnable `AISDKEngine` loop + SSE/checkpoint/bridge surface was retired
// (the engine is now a harness LIBRARY — tools/guards/permissions/prompt-
// assembly/internal-context — not a runnable agent; see the S.390 audit
// `SPEC_AUDRIC_CODEBASE_AUDIT.md` §1.2A). `AISDKEngineConfig` survives the
// class deletion because `buildToolContext` (a live host-composition
// primitive used by audric/web-v2's `Experimental_Agent` path) takes it as
// its config param, and it remains the canonical config shape hosts build
// per turn.
//
// The two interfaces below are the verbatim definitions that lived in
// `v2/engine.ts` (lines ~128-249) before the loop retirement — moved here
// unchanged so the public `AISDKEngineConfig` export and `buildToolContext`
// signature are byte-stable for hosts.
// ---------------------------------------------------------------------------

import type { LanguageModel, TelemetrySettings, Tool } from 'ai';
import type { EngineConfig } from '../types.js';

/**
 * Engine config — the subset of the legacy `EngineConfig` that the
 * AI-SDK-native path needs, plus AI-SDK-specific fields. `provider` is
 * dropped (the legacy `LLMProvider` abstraction is gone; hosts pass
 * `modelInstance` for multi-provider / gateway routing).
 *
 * Consumed today by `buildToolContext(config, perTurn)` — the per-turn
 * `ToolContext` builder hosts call when composing `Experimental_Agent`
 * directly (D-15). All the engine-specific config (guards, permissionConfig,
 * priceCache, contacts, postWriteRefresh, onAutoExecuted, mcpManager, …)
 * carries through from `EngineConfig`.
 */
export interface AISDKEngineConfig extends Omit<EngineConfig, 'provider'> {
  /**
   * Anthropic API key — required when `modelInstance` is NOT set. When
   * `modelInstance` is provided (e.g. a `gateway('anthropic/claude-...')`
   * wrapped model from web-v2 per SPEC v0.7c D-6 Day 2c), this field
   * is ignored.
   */
  anthropicApiKey?: string;

  /**
   * [SPEC v0.7c Day 2c / D-6 AI Gateway lock] Pre-built `LanguageModel`
   * to use verbatim. Lets hosts inject a `gateway('anthropic/claude-...')`
   * wrapped model (multi-provider failover + Vercel-native observability),
   * a `wrapLanguageModel({ model, middleware })`, or a `MockLanguageModelV3`
   * for tests. Accepts the AI SDK v6 `LanguageModel` union.
   */
  modelInstance?: LanguageModel;

  /**
   * [SPEC v0.7c Day 2c / D-18 telemetry lock] AI SDK v6
   * `experimental_telemetry` settings. Hosts pass
   * `{ isEnabled: true, functionId: 'audric-chat', metadata: {...} }`
   * to emit OpenTelemetry spans the Vercel AI Gateway dashboard consumes.
   */
  experimentalTelemetry?: TelemetrySettings;

  /**
   * [SPEC v0.7c Day 2c++ / D-6 AI Gateway audit] Vercel AI Gateway
   * provider options forwarded into `streamText` as
   * `providerOptions.gateway` (caching, order, only, sort, byok, …).
   * Only meaningful when `modelInstance` is a `gateway(...)` call.
   */
  gatewayProviderOptions?: AISDKEngineGatewayProviderOptions;

  /**
   * [SPEC v0.7c Day 2c++ Batch 1 / v2.10.0] Host-supplied tools that are
   * NOT engine-native — merged into the AI SDK `ToolSet` alongside the
   * engine's tools (engine tools win on name collision). Intended for
   * hosts routing through Vercel AI Gateway who want gateway-managed
   * tools without forcing every host to carry the vendor dep.
   */
  // biome-ignore lint/suspicious/noExplicitAny: Tool's generic params are
  // covariant + provider-specific (e.g. Vercel gateway tools type their
  // input/output with provider-internal schemas). Hosts pass whatever
  // tool factory produces; engine forwards verbatim.
  gatewayTools?: Record<string, Tool<any, any>>;
}

/**
 * Local subset of Vercel AI Gateway provider options that hosts forward
 * into `streamText.providerOptions.gateway`. Kept local so the engine
 * doesn't need a direct dep on `@ai-sdk/gateway` (transitively available
 * via `ai`'s re-exports).
 */
export interface AISDKEngineGatewayProviderOptions {
  caching?: 'auto';
  order?: string[];
  only?: string[];
  sort?: 'cost' | 'ttft' | 'tps';
  disallowPromptTraining?: boolean;
  zeroDataRetention?: boolean;
  hipaaCompliant?: boolean;
  byok?: Record<string, Record<string, unknown>[]>;
  user?: string;
  tags?: string[];
}
