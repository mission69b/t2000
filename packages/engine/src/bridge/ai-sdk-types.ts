// ---------------------------------------------------------------------------
// AI SDK type aliases used by the v0.7a bridge layer
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 0 deliverables 1 + 5. Original Phase 0 session 2
// shipped this file as a 280 LoC LOCAL STUB of the AI SDK v5 stream-event
// shapes (because AI SDK was not yet a dependency). Phase 0 deliverable 5
// (this session) pinned `ai@^6.0.182` + `@ai-sdk/anthropic@^3.0.77` —
// version 6, NOT 5. Pinning revealed 8 real shape mismatches between the
// v5-mental-model stubs and v6 reality:
//
//   1. `text-delta` carries `text` (was `delta`)
//   2. `reasoning-delta` carries `text` (was `delta`)
//   3. Raw stream tool-call completion: `tool-call` (was `tool-input-available`)
//   4. Raw stream tool-result: `tool-result` (was `tool-output-available` —
//      and v6 `tool-result` carries `toolName` directly, eliminating the
//      `toolNameByCallId` carry mechanism the bridge needed for v5)
//   5. Raw stream tool-error: `tool-error` (was `tool-output-error`)
//   6. `finish.totalUsage` (was `finish.usage`)
//   7. Usage uses nested `inputTokenDetails.cacheReadTokens` (was flat
//      `cachedInputTokens`)
//   8. `FinishReason` enum has 6 values (`'unknown'` removed in v6)
//
// All 8 mismatches are now pinned at the source: this file binds the
// bridge's translation surface to upstream `ai` types via `import type`,
// which is the single source of truth. Future v6 → v7 breaking changes
// surface as TypeScript errors here at upgrade time, not as runtime
// drift.
//
// This module DOES NOT use `import * from 'ai'` — `ai` is a 6 MB+
// runtime package, but `import type` is fully erased by tsc/tsup at
// build time. No runtime cost.
//
// The two surfaces
// ----------------
// • `AISDKStreamEvent` — what `streamText().fullStream` yields. Consumed
//   by `event-bridge.ts` (Phase 1+ hot path: raw LLM stream → EngineEvent).
// • `UIMessageStreamPart` — what `createUIMessageStream` yields. Consumed
//   by `sse-format-adapter.ts` (Phase 5 hot path: UI-protocol stream →
//   legacy SSEEvent → wire bytes).
//
// We alias the upstream type names through this module so consumers
// (event-bridge, sse-format-adapter, their tests) bind to a stable name
// while the upstream package can rename internally without us chasing
// every import site.
// ---------------------------------------------------------------------------

import type {
  TextStreamPart,
  UIMessageChunk,
  ToolSet,
  FinishReason,
  LanguageModelUsage,
  ProviderMetadata,
} from 'ai';

/**
 * Alias for `LanguageModelV3StreamPart` (the part the SDK calls
 * `TextStreamPart<TOOLS>` at the public surface). The bridge consumes
 * the union with the default `ToolSet` because we run untyped at the
 * bridge layer — engine code wires real tool typings ONE LAYER UP via
 * `streamText({ tools })`.
 */
export type AISDKStreamEvent = TextStreamPart<ToolSet>;

/**
 * Alias for AI SDK's UI-protocol stream chunk type. SSE format adapter
 * (Phase 5) consumes this and translates back into the legacy SSEEvent
 * the wire format expects.
 *
 * Default generics: untyped metadata + untyped data parts. The bridge
 * doesn't need to constrain these — engine-side data parts use the
 * `data-{name}` convention and the adapter dispatches by suffix.
 */
export type UIMessageStreamPart = UIMessageChunk;

/** Upstream finish-reason enum. Six values: stop, length, content-filter, tool-calls, error, other. */
export type AISDKFinishReason = FinishReason;

/**
 * Upstream usage shape. v6 nests cache fields under `inputTokenDetails`
 * (rename of v5's flat `cachedInputTokens`).
 */
export type AISDKLanguageModelUsage = LanguageModelUsage;

/** Upstream provider-metadata bag. Anthropic's signed-thinking signature lives at `[provider].anthropic.signature`. */
export type AISDKProviderMetadata = ProviderMetadata;
