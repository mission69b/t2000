# `packages/engine/src/bridge/` — v0.7a Engine Drain bridge layer

> **SPEC 37 v0.7a Phase 0 deliverables 1 (R8 — Bridge layer) + 5 (AI SDK pin).** Shipped 2026-05-15. Bound to AI SDK v6 on the same day as part of the empirical R8 validation pass.
>
> Internal to `@t2000/engine`. NOT exported from `index.ts`. The bridge becomes hot during Phase 1 (LLM call swap) and Phase 5 (streaming swap).

## Why this folder exists

v0.7a moves `@t2000/engine` internals onto Vercel AI SDK + MemWal Path C while preserving the public API (`EngineEvent` union + the legacy SSE wire format `audric/web` parses today). The bridge is the foundation: it's the seam that lets the engine swap LLM calls + streaming layers without `audric/web` noticing.

Without the bridge, we'd have to coordinate engine + audric/web releases. With it, we keep the continuous-deployment model SPEC 37 mandates.

## Files

| File | Purpose | Hot in |
|---|---|---|
| `ai-sdk-types.ts` | **Bound to AI SDK v6** via `import type from 'ai'` (Phase 0 deliverable 5 — shipped 2026-05-15). Re-exports `TextStreamPart<ToolSet>` as `AISDKStreamEvent`, `UIMessageChunk` as `UIMessageStreamPart`, plus `FinishReason`/`LanguageModelUsage`/`ProviderMetadata`. Single source of truth for the bridge's translation surface. ~80 LoC (was 280 LoC of stubs pre-pin). | Phase 0 → Phase 5+ |
| `event-bridge.ts` | Translates raw `streamText` events (`TextStreamPart<ToolSet>`) → `EngineEvent` union. Block-index aware for thinking, runs `eval_summary` parser on reasoning-end, normalises errors. v6 simplification: no `toolNameByCallId` carry needed (v6 `tool-result`/`tool-error` carry `toolName` directly — only the v5 stub mistakenly thought it didn't). | Phase 1 (LLM call swap) onwards |
| `event-bridge.test.ts` | **41 tests** against real v6 fixtures. Every TextStreamPart variant maps correctly; ordering preserved; rising blockIndex; Anthropic signature flow-through via `providerMetadata.anthropic.signature`; `<eval_summary>` parser; error normalisation (Error/string/object/null/circular); `abort.reason` interpolation; finish-reason → StopReason exhaustive mapping across v6's 6-value enum; v6 usage shape (`inputTokenDetails.cacheReadTokens`/`cacheWriteTokens`); end-to-end save_deposit turn shape. | — |
| `sse-format-adapter.ts` | Translates `createUIMessageStream` UIMessage parts (`UIMessageChunk`) → legacy `SSEEvent` (then through `serializeSSE`). Engine side-channel events flow via the `data-{name}` convention. v6 finish-event handling: top-level `finishReason` wins via `mapFinishReason` precedence, then host `messageMetadata.stopReason`, then `'end_turn'` default. | Phase 5 (streaming swap), removed in v0.7b |
| `sse-format-adapter.test.ts` | **39 tests**. Includes wire-byte equivalence: 6 fixture turns produce IDENTICAL bytes through the Phase-5 path vs the legacy path. Covers v6 finish-event precedence (top-level vs host-metadata) and end-to-end finish flows. | — |

## Critical invariants

1. **`attemptId` stamping is NOT in the bridge.** Per `agent-harness-spec.mdc` Item 3, `attemptId` is stamped at engine `pending_action` emit time (UUID v4). The bridge never emits `pending_action` directly — it either passes one through unchanged (event-bridge does not handle this; engine orchestration does) or routes a `data-pending-action` UIMessage part to the matching SSEEvent (sse-format-adapter does this with full preservation). Tests pin the preservation behaviour.

2. **Wire-format SSOT.** Both bridges emit `EngineEvent` / `SSEEvent` typed values. The actual byte serialisation lives in `streaming.ts:serializeSSE` — the bridges never hand-roll bytes. This is non-negotiable: any new wire-format authority is a regression.

3. **Engine side-channel events.** `canvas`, `pending_action`, `todo_update`, `proactive_text`, `harness_shape`, `stream_state`, `tool_progress`, `pending_input`, `compaction` are all emitted by engine orchestration code OUTSIDE the LLM stream. The Phase-1 picture: outer engine generator interleaves these with bridge output. The Phase-5 picture: engine code writes them as `data-{name}` UIMessage parts via the `createUIMessageStream` writer; sse-format-adapter dispatches them on the way out.

4. **Forward-compatibility.** Both bridges silently drop unknown event types. Adding new translations later is purely additive.

## How it integrates (Phase 1 onwards)

Phase 1 wires `event-bridge.ts` into the engine's outer loop where the legacy Anthropic provider sits today. Pseudocode:

```ts
// Phase 1 engine outer loop
const aiStream = streamText({ model, messages, tools }).fullStream;
for await (const ev of bridgeAISDKStream(aiStream)) {
  yield ev;
}
```

Phase 5 wires `sse-format-adapter.ts` after engine code adopts `createUIMessageStream`:

```ts
// Phase 5 route handler
const uiStream = createUIMessageStream({ /* engine-produced parts */ });
for await (const wireBytes of bridgeUIMessageStreamToSSE(uiStream)) {
  res.write(wireBytes);
}
```

Until those phases land, this folder is a no-op import surface — landed early so Phase 1 can move without redesigning the seam.

## Removal timeline

- `event-bridge.ts` lives until v0.8 (or whenever AI SDK becomes the only LLM-call path engine-wide; at that point the bridge IS the engine's stream-translation core).
- `sse-format-adapter.ts` is removed in v0.7b when `audric/web` migrates to native AI SDK UI protocol consumption (`useChat` hook).
- `ai-sdk-types.ts` is now a thin re-export of upstream `ai` types (Phase 0 deliverable 5 done). Deletes entirely if/when consumers prefer to `import type from 'ai'` directly. For v0.7a we keep it as a stable seam.

## Post-pin findings (Phase 0 deliverable 5, 2026-05-15)

Pinning `ai@^6.0.182` revealed 8 real shape mismatches between the v5 mental model the stubs encoded and v6 reality. All fixed in this commit:

| # | v5 stub had | v6 reality |
|---|---|---|
| 1 | `text-delta.delta` | `text-delta.text` |
| 2 | `reasoning-delta.delta` | `reasoning-delta.text` |
| 3 | `tool-input-available` event | `tool-call` (TextStreamPart only — UIMessageChunk still uses `tool-input-available`) |
| 4 | `tool-output-available` event | `tool-result` (carries `toolName` directly — eliminates v5 `toolNameByCallId` carry) |
| 5 | `tool-output-error` event | `tool-error` (carries `toolName` + structured `error`) |
| 6 | `finish.usage` flat | `finish.totalUsage` |
| 7 | `cachedInputTokens` flat | `inputTokenDetails.cacheReadTokens` |
| 8 | `FinishReason` 7 values | 6 values (no `'unknown'`) |

**Lesson:** the local-stub decoupling design paid for itself. TypeScript flagged every mismatch in 2 seconds when stubs were swapped for `import type from 'ai'`. Without it, the bridge would have shipped against my unverified v5 mental model and broken silently when the engine actually ran post-Phase-1.

## See also

- Plan: `~/.cursor/plans/audric-v07a-engine-drain.plan.md` (Phase 0 deliverable 1)
- Decision doc: `~/.cursor/plans/audric-engine-decision-doc_8f3c1e92.plan.md`
- Benefits: `BENEFITS_SPEC_v07a.md` (E-1 LoC reduction, F-1 provider portability, S-2 standards adoption)
- Harness contract: `.cursor/rules/agent-harness-spec.mdc` (attemptId, modifiableFields, onAutoExecuted)
- Existing wire-format SSOT: `packages/engine/src/streaming.ts` (`SSEEvent` + `serializeSSE`)
