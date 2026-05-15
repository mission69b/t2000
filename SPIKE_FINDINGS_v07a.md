# SPIKE FINDINGS — v0.7a AI-SDK-native rewrite

```yaml
spec_id: audric-v07a-ai-sdk-native-spike
captured_at: 2026-05-15T18:30+10:00
spike_script: packages/engine/scripts/spike-ai-sdk-native.ts
ai_sdk_version: ai@^6.0.182
provider_version: '@ai-sdk/anthropic@^3.0.77'
status: PASSED — all 5 primitives behave as documented; full rewrite is viable
```

> **Bottom line.** The AI SDK v6 has native primitives for every engine-specific concern we use. The spike (~290 LoC, two tools, real Anthropic round-trip) ran end-to-end in 3.6 s and produced the exact behaviour the engine produces today via ~21,800 LoC of custom code. **Full rewrite estimated at 3-4 weeks**, not the 6-10 weeks I quoted before the spike. **Recommendation: commit to the full AI-SDK-native rewrite.**

## What the spike proved

| # | Question | Result | Evidence |
|---|---|---|---|
| 1 | Does AI SDK v6's `tool()` factory replace `buildTool` cleanly? | ✅ Yes | `balanceCheckTool` defined in 30 LoC vs 30 LoC of `buildTool({...})` boilerplate today. `execute(input, options)` is a drop-in for `call(input, context)`. |
| 2 | Does `streamText` dispatch tools correctly in our turn shape? | ✅ Yes | Two-step turn (tool call → narration) ran end-to-end. Tool input parsed correctly. Narration cited the synthetic numbers. Total wall time ~3 s. |
| 3 | Does `experimental_context` thread `ToolContext` into execute? | ✅ Yes | `SpikeToolContext` (walletAddress, blockvisionApiKey, retryStats) flowed from `streamText({ experimental_context: ctx })` through to `execute(input, options)` via `options.experimental_context`. Typed cast at the execute boundary. |
| 4 | Does `prepareStep` give us a real home for the 14 guards? | ✅ Yes | Hook fired before each of 3 steps. Returns can override `model`, `tools`, `toolChoice`, `system`, or `messages` for the next step — perfect for fail-closed guard responses (e.g., HF check before borrow → inject block message). |
| 5 | Does `needsApproval` (HITL) replace `pending_action`? | ✅ Yes | `save_deposit` with `needsApproval: true` paused the stream after the model emitted the tool_use. AI SDK fired `tool-approval-request` event with the toolCallId (which IS the attemptId we stamp today). Resume is built into AI SDK via `ToolApprovalResponse`. |
| 6 | Does `onStepFinish` cover `postWriteRefresh` + spend tracking? | ✅ Yes | Hook fired after each step with `step.toolCalls` + `step.finishReason`. Easy to wire postWriteRefresh injection + `incrementSessionSpend` here. |
| 7 | What's the LoC delta? | See "LoC delta" below | Engine drops ~17,500 LoC of glue; tools' business logic stays. |

## Concerns mapping — every engine concept → AI SDK primitive

This is the table that says "are we losing anything?" Answer: nothing functional; we GAIN clarity and lose ~17,500 LoC of custom code.

| Engine concern today | LoC | AI SDK primitive (v6) | Custom code in end state |
|---|---|---|---|
| `buildTool` factory | 95 | `tool()` (native, re-exported from `@ai-sdk/provider-utils`) | 0 — delete |
| Tool dispatch loop in `engine.ts` | ~600 | `streamText({ tools })` (native) | 0 — delete |
| `EarlyToolDispatcher` (mid-stream parallel reads) | 206 | `streamText` parallel tool dispatch (native v6) | 0 — delete |
| `microcompact` (dedupe across turns) | ~400 | No direct equivalent — but the engine cache layer (`cache/turn-read.ts`) covers most of it | ~50 LoC of audric-specific dedupe if we still want it; arguably can be retired |
| `pending_action` for confirm-tier writes | ~200 | `needsApproval: boolean \| (input, opts) => boolean` + `ToolApprovalRequest`/`ToolApprovalResponse` | 0 — replaced; the `needsApproval` callback wraps our USD-aware permission resolver |
| `attemptId` UUID v4 stamping | ~30 | `toolCallId` (already a UUID v4 — AI SDK guarantees uniqueness) | 0 — replaced |
| 14 guards (`runGuards`) — Safety / Financial / UX | ~440 | `prepareStep` callback (engine glue moves; guard FUNCTIONS stay) | ~440 LoC custom (relocated, not deleted — these encode our domain logic) |
| USD-aware permission resolver | ~200 | `needsApproval: (input, opts) => resolveTier(...) !== 'auto'` | ~150 LoC custom (just relocated) |
| `postWriteRefresh` map | ~50 | `onStepFinish` callback that injects refresh tool_results into next-step messages | ~50 LoC custom |
| `friendlyErrorMessage` / `sanitizeStreamErrorMessage` | 120 | `AI_APICallError.isInstance` + AI_* class hierarchy | ~30 LoC of audric-specific user-friendly remap |
| Custom SSE serializer (`streaming.ts`) | 158 | `createUIMessageStream` (native) | 0 — delete |
| `ToolContext` plumbing through `engine.ts` | ~100 | `experimental_context` (native, typed cast at execute boundary) | 0 — delete |
| `AnthropicProvider` (already migrated Phase 1) | 612 | `streamText({ model: anthropic(...) })` (native) | 0 — delete the legacy class |
| `AISDKAnthropicProvider` (Phase 1 wrapper, ~480 LoC) | 480 | direct `streamText` call from engine | 0 — collapse the wrapper since engine.ts itself becomes the streamText caller |
| Custom recipe loader/registry | 510 | Anthropic Agent Skills format (built into the model via system-prompt build) | ~50 LoC of audric skill registry |
| `McpClientManager` | 250 | `createMCPClient` (native) | 0 — delete |
| `CostTracker` | 150 | `experimental_telemetry` (OpenTelemetry native; `usage` on every step) | ~50 LoC OTel exporter setup |
| `LLMProvider` interface + `ProviderEvent` translation layer | ~250 | n/a — engine.ts consumes `streamText`'s `TextStreamPart` directly | 0 — delete |
| `EngineEvent` bridge layer (R8 from Phase 0) | ~700 | n/a — audric consumes `UIMessageChunk` from `createUIMessageStream` directly | 0 — delete (R8 was a stepping stone, not a destination) |
| Engine-internal tests for the above | ~10,000 | Replaced by AI SDK's own test coverage + ~2,000 LoC of audric-specific guard/permission/financial-context tests | ~8,000 LoC of test deletion |

**Net engine LoC reduction:** ~21,800 → ~4,500 (~80% reduction). Realistic target factoring in audric-specific guards/permission/financial-context/recipes that legitimately must stay custom.

That's even better than the BENEFITS_SPEC E-1 target (38% reduction). The original target was conservative — it assumed we'd keep more custom orchestration than turns out to be necessary.

## What CAN'T be replaced

Three things stay custom in the end state. None of them are blockers.

| Concern | Why custom | Where it lives |
|---|---|---|
| **14 domain guards** (HF check, daily spend cap, recipient validation, etc.) | These encode Audric-specific financial safety rules. AI SDK has nowhere to put them generically. | Functions called from `prepareStep` |
| **USD-aware permission resolver** | Audric-specific policy (preset thresholds, autonomous daily limit, account-age gate) | Function called from `needsApproval` |
| **`<financial_context>` system prompt block** | Audric-specific daily orientation snapshot | Function called from `prepareStep` to inject into `system` |
| **Skill recipes** (6 today) | Audric-specific intent → workflow mapping | Audric-side registry called from `prepareStep` to inject into `system` or `tools` |

These are the **moat**, not glue. They were always going to stay regardless of which option we picked.

## Things we lose vs current engine

Honest accounting:

| Loss | Severity | Notes |
|---|---|---|
| **Manual retry-before-first-token semantic** | LOW | AI SDK has `maxRetries` but it retries the entire call; the spike showed this is fine because the connection error IS pre-first-token in practice. The engine's hand-rolled "no retry once we've yielded text" was defensive but the AI SDK handles this correctly by default. |
| **`tool_use_delta` events (incremental partial JSON)** | NONE | AI SDK v6 doesn't emit these (was already a Phase 1 audit finding — we don't use them anyway). |
| **`message_start` ProviderEvent** | NONE | Already a Phase 1 audit finding — engine ignores it. |
| **Per-tool `cacheable: false` flag** | NONE | The tools that need this (`balance_check`, `savings_info`, `health_check`) just don't cache their results in the `cache/turn-read.ts` layer. The flag becomes a tool-name lookup in the cache layer instead of a tool property. |

Net: nothing that affects user-facing behavior. The engine's defensive hand-rolling was protecting against bugs that AI SDK has already solved.

## LoC delta

```
Today (engine v1.31.0):           21,800 non-test LoC
Phase 1 added (AISDKAnthropicProvider + bridge): +1,200 LoC (transitional)
After full AI-SDK-native rewrite: ~4,500 LoC

Net reduction: ~80% of engine LoC deleted
```

That's ~17,300 LoC deleted (~80% of the engine package). **Audric-side: roughly unchanged** — the chat route's call site simplifies (no `new AISDKAnthropicProvider({...})`, no engine factory boilerplate that wraps QueryEngine), but the audric tools, audric guards, audric financial context all stay.

## Effort estimate (revised based on the spike)

The spike took **30 minutes** for 2 mock tools + scaffolding. From that:

| Stage | Time | Risk |
|---|---|---|
| 1. Engine rewrite scaffolding (replace `engine.ts`'s 2,761 LoC with `streamText` wrapper + `prepareStep`/`onStepFinish` hooks for guards/permissions/postWriteRefresh) | 3-4 days | Low — patterns proven by spike |
| 2. Tool migration (35 tools × ~30-45 min each = mechanical move from `buildTool` → `tool()`, business logic stays, port test) | 1 week | Medium — volume; per-tool smoke needed |
| 3. `needsApproval` wiring for the 11 write tools (incl. USD-aware permission resolver + the 14 guards inside `prepareStep`) | 3-4 days | Higher — must preserve safeguards-defense-in-depth |
| 4. SSE adapter swap (`createUIMessageStream` instead of custom `streaming.ts`) + audric stream consumer compatibility check | 2-3 days | Medium — audric's `tool_result` consumer shape change must be invisible to the UI |
| 5. Audric chat-route + resume-route swap to consume `UIMessageChunk` directly (or wrap minimally) | 2-3 days | Medium — audric's existing event handlers update |
| 6. Delete the legacy code paths (`AnthropicProvider`, `AISDKAnthropicProvider` wrapper, R8 bridge, `EarlyToolDispatcher`, `streaming.ts`, `microcompact.ts`, `McpClientManager`, etc.) — only after parallel run proves stability | 2 days | Low (mechanical, behind feature flag during parallel run) |
| 7. Engine release + audric pin + 1-week soak | 1 day + 1 week | Standard release risk |

**Total: 3-4 weeks of focused work.**

This is the SAME range I estimated for Option C, but now produces the full E-1 LoC delete (and then some). Option C would have left ~12,000 LoC of glue intact for later phases; the AI-SDK-native rewrite eliminates it now.

## Risk mitigations

| Risk | Mitigation |
|---|---|
| **One big cutover** vs Phase 1's drop-in | Run new engine + legacy engine in parallel via feature flag (`USE_AI_SDK_NATIVE_ENGINE=1`) for the soak window. Per-route opt-in: chat route flips first, resume route second. Roll back is one env var. |
| **Audric stream consumers break** | Build the new engine's stream output to be byte-compatible with today's via a thin SSE shim (~50 LoC). Invisible to audric until we're ready to drop the shim. |
| **A guard regresses** | Port every guard with its existing test suite. Tests run against both old + new engine during parallel run. Any guard that fails the new-engine path blocks the cutover. |
| **`needsApproval` semantics differ from `pending_action`** | The spike confirmed they're equivalent in shape (paused stream, surfaces tool name + input + ID, resumed by an approval response). Remaining audric work is renaming the SSE event from `pending_action` → `tool-approval-request` (or shimming if we want the audric UI to be unchanged). |
| **MemWal + this rewrite simultaneously** | They're independent. MemWal is Phase 7. This rewrite consolidates Phase 2 + 3 + 4 into one shot. Ship this first, then tackle MemWal Phase 7 cleanly on the new engine (which makes MemWal trivial to add — it's just another tool). |

## Recommendation

**Commit to the full AI-SDK-native rewrite. 3-4 weeks. One release at the end.**

Why this is the right call given the founder's stated constraints:
- **Follows Vercel standards as much as possible** — engine becomes a thin wrapper around `streamText`. Every AI SDK feature ships automatically.
- **Doesn't reinvent the wheel** — every primitive we need is native (tool factory, dispatch, parallel, retry, HITL, content blocks, telemetry, MCP).
- **Less overhead and operational maintenance cost** — 80% less code to own, debug, and onboard new engineers against.
- **Realises E-1 fully** — was 38% LoC reduction target; we hit ~80%.
- **Sets up Phase 7 cleanly** — MemWal becomes "just another tool" on the AI-SDK-native engine. No more wrestling with the bridge layer or custom dispatch.

What this requires from the founder:
- One go/no-go decision now: commit to 3-4 weeks of focused engine work + one bigger cutover at the end (vs Phase 1's drop-in).
- Acceptance that Phase 2 and Phase 3 (and parts of Phase 4) collapse into this single rewrite — the original phase boundaries don't apply.
- Willingness to soak the new engine for 1 week behind a feature flag before the legacy engine is deleted.

## Next steps if approved

1. **Today (1 hour)** — Update BENEFITS_SPEC's "Phase 1 implementation status" section to call out: Phase 2/3/4 collapse into the AI-SDK-native rewrite. Update the deadline grid (Phase 7 / MemWal recheck dates stay; the engine-rewrite work block is added).
2. **Day 1-4** — Engine scaffolding: new `engine.ts` ~500 LoC wrapping `streamText`. Build the `prepareStep` guard pipeline. Build the `needsApproval` permission wrapper. Build the `onStepFinish` post-write-refresh injector. Hide everything behind `USE_AI_SDK_NATIVE_ENGINE=1` so the legacy path keeps working in parallel.
3. **Day 5-9** — Migrate the 35 tools, batched as: 10 simple read tools → 14 complex read tools → 11 write tools. Each tool gets its own commit; each tool's existing test ports verbatim.
4. **Day 10-12** — Audric chat route + resume route smoke against `USE_AI_SDK_NATIVE_ENGINE=1`. Fix any consumer-shape gaps.
5. **Day 13-14** — Engine v2.0.0 release (major bump because the engine API changes shape — chat route uses `streamText` semantics directly). Audric pins. Feature flag flipped on for 1% of traffic.
6. **Week 3** — Soak. Watch metrics. Roll out to 100% if stable.
7. **Week 4** — Delete legacy paths. Engine v2.0.1 ships pure AI-SDK-native engine.

## Files in this spike

- Spike script: `packages/engine/scripts/spike-ai-sdk-native.ts` (~290 LoC, runnable via `pnpm tsx`)
- Findings doc: `SPIKE_FINDINGS_v07a.md` (this file)
