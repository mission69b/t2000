# Phase 7 Scoping — Engine-side `MemoryStore` + `prepareStep` wiring

> **Status:** scoping draft, 2026-05-18. Re-read before any Phase 7 implementation work.
>
> **TL;DR:** Phase 7's engine-side architecture decomposes into 4 surgical additions: `MemoryStore` interface + `InMemoryMemoryStore` mock, `EngineConfig.memoryStore` opt-in, `prepareStep` wiring (first time it's used in v2 — currently unwired), and a deterministic 5-layer system-prompt assembler (`system → financial_context → memory → skill → user`). All four ship engine-side and can be verified end-to-end against the mock with zero MemWal dependency. Total scope: **~1.5-2 days** for the engine prototype, then ~2 days of audric wiring when MemWal stabilizes (post-2026-05-29 checkpoint). The 4 BENEFITS_SPEC §1886 D-questions resolve as: **manual SDK** (not `withMemWal` middleware), delegate-key design deferred to audric, **manual recall** (not `Ask` API), MCP export deferred to v0.7c.

---

## 1. What Phase 7 commits to (BENEFITS_SPEC §1903)

Five benefits realize at Phase 7 close:

| ID | Benefit | Verification |
|---|---|---|
| **O-1** | ECS daily Claude inference cron eliminated | $50-200/mo savings; AWS console: ECS task removed |
| **F-4** | `prepareStep` (per-step tool gating) | LLM injection: `system → financial_context → memory → skill → user message` — all 5 layers in correct order |
| **F-11** | Memory infrastructure scales (vector retrieval) | MemWal retrieval p95 sub-linear; <200ms at 100k records |
| **F-12** | Top-K retrieval > 30-day SQL window | AdviceLog uses top-K vector retrieval; relevance > recency |
| **S-1** | Mysten partnership alignment (engine layer) | Engine uses MemWal at production |
| **S-10** | E2E encrypted memory (Audric Passport "Yours" pillar extension) | Packet inspection: no plaintext memory leaves browser |

Note: S-1 + S-10 + F-11 are MemWal-stability-gated (2026-06-26 hard deadline; Plan B fallback queued). O-1 + F-4 + F-12 can realize against any vector store, including the in-memory mock for design verification.

---

## 2. Current state — what the engine has today (measured)

### 2a. `streamText` call site (`packages/engine/src/v2/engine.ts:968-980`)

```typescript
const stream = streamText({
  model: this.anthropic(this.config.model ?? 'claude-sonnet-4-5'),
  tools,
  messages: toAISDKMessages(validatedMessages),
  system: this.systemPromptString(),       // ← static string per turn
  experimental_context: internal,
  stopWhen: stepCountIs(this.config.maxTurns ?? 10),
  abortSignal: this.abortController?.signal,
  onStepFinish,
  onError: (err) => { console.error('[AISDKEngine] streamText error:', err); },
});
```

**Not wired:** `prepareStep`, `temperature`, `maxOutputTokens`, `toolChoice`, `thinking` / `providerOptions`. The v2 engine simplified vs the legacy `AISDKAnthropicProvider` — guards moved out of `prepareStep` into `tool.execute()` per `v2/guard-runner.ts:7-14`. **`prepareStep` is greenfield.**

### 2b. System prompt is host-owned

The engine treats `EngineConfig.systemPrompt` as opaque — joins `SystemBlock[]` with `\n\n` and forwards. None of the 4 expected per-turn builders (`buildFinancialContextBlock`, `buildProfileContext`, `buildMemoryContext`, `buildAdviceContext`) live in `@t2000/engine` — they're **all audric-side**. The engine has no ordering authority today.

### 2c. Multi-step is on by default

`stopWhen: stepCountIs(maxTurns ?? 10)` enables up to 10 LLM round-trips per turn. So `prepareStep` (when wired) fires N times per turn — memory recall must be turn-cached to avoid N × 700ms penalty.

### 2d. `ToolContext` threading

`buildToolContext(config, { signal, portfolioCache })` (`v2/tool-context.ts:40-76`) is the per-request DI surface. Adding `memoryStore` here plus a per-turn `memoryCache: { query: string; results: MemoryRecord[] } | null` slot is the natural extension.

### 2e. Cache pattern precedent

The 3 production cache modules (`cache/defi`, `cache/wallet`, `navi/cache`) follow an identical structural pattern: `XCacheStore` interface (`get`/`set`/`delete`/`clear` async) + `InMemoryXCacheStore` impl + `setX`/`getX`/`resetX` injection helpers. Per `engineering-principles.mdc` Principle 6, they're kept separate (not factored into a base). MemoryStore should follow the same shape AS LONG AS its operations are read/write keyed — but MemWal's ops are `remember(text)` + `recall(query, topK)`, NOT `get(key)`/`set(key, val)`. So MemoryStore's interface needs a different shape from the existing caches.

---

## 3. The `MemoryStore` interface (proposed)

Modeled on MemWal's actual SDK (`@mysten-incubation/memwal@0.0.4` — see `packages/engine/scripts/memwal-smoke.ts:182-228` for live usage):

```typescript
// packages/engine/src/memory/store.ts (NEW)

export interface MemoryRecord {
  /** The plaintext recalled from storage. */
  text: string;
  /** Similarity score (lower = more similar) — depends on backend. */
  distance: number;
  /** Optional metadata (timestamp, source, etc.) — backend-specific. */
  metadata?: Record<string, unknown>;
}

export interface MemoryStore {
  /**
   * Ingest one record. Called by the engine after each turn finishes
   * (via onStepFinish or onTurnEnd) to capture turn intent + outcome.
   *
   * MemWal note: end-to-end latency p50 25s / p95 42s (post-Mysten patch
   * 2026-05-15). MUST be fire-and-forget for the engine — never blocking
   * the response stream.
   */
  remember(text: string, opts?: { namespace?: string }): Promise<void>;

  /**
   * Retrieve top-K similar records. Called by the engine at turn start
   * via prepareStep injection. Result is turn-cached in
   * ToolContext.memoryCache; subsequent steps in the same turn read
   * from cache (no re-recall).
   *
   * MemWal note: live single-recall p95 = 470-675ms; session-cached
   * recall hits in <5ms. Engine MUST cache per turn.
   */
  recall(query: string, opts: { topK?: number; namespace?: string }): Promise<MemoryRecord[]>;

  /**
   * Cleanup hook — wipe in-memory credentials, close connections.
   *
   * v2.7.0 NOTE: engine does NOT auto-invoke; hosts call manually at
   * teardown. The slot exists on the interface for forward compatibility
   * (a future engine version may add an `onEngineDispose()` lifecycle
   * point that auto-invokes destroy when defined).
   */
  destroy?(): void;
}
```

**Mock for testing:**

```typescript
// packages/engine/src/memory/in-memory-store.ts (NEW)

export class InMemoryMemoryStore implements MemoryStore {
  private records: Array<{ text: string; timestamp: number; namespace?: string }> = [];

  async remember(text: string, opts: { namespace?: string } = {}) {
    this.records.push({ text, timestamp: Date.now(), namespace: opts.namespace });
  }

  async recall(query: string, opts: { topK?: number; namespace?: string } = {}): Promise<MemoryRecord[]> {
    // Mock: bag-of-words overlap with query, return top-K by overlap+recency
    const ns = opts.namespace;
    const topK = opts.topK ?? 5;
    const queryTokens = new Set(query.toLowerCase().split(/\s+/));
    return this.records
      .filter((r) => !ns || r.namespace === ns)
      .map((r) => {
        const overlap = r.text.toLowerCase().split(/\s+/).filter((t) => queryTokens.has(t)).length;
        return { text: r.text, distance: -overlap, metadata: { timestamp: r.timestamp } };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, topK);
  }

  destroy() {
    this.records = [];
  }
}
```

The mock is simple enough that engine tests can verify the 5-layer ordering + caching + degradation behaviors without any external infra.

---

## 4. `prepareStep` wiring — the 5-layer assembler

### 4a. The contract

Wire `prepareStep` in `runStream` for the first time. Its sole job: assemble the system prompt in F-4 order from named segments delivered by config + the turn-cached memory recall.

```typescript
// packages/engine/src/v2/engine.ts (modification to runStream)

const stream = streamText({
  model: this.anthropic(this.config.model ?? 'claude-sonnet-4-5'),
  tools,
  messages: toAISDKMessages(validatedMessages),
  // NOTE: do NOT set static `system` when memoryStore is configured —
  // prepareStep owns assembly. Keep static `system` as the fallback
  // for hosts that don't opt in.
  ...(this.config.memoryStore
    ? { prepareStep: this.buildPrepareStepHook(internal) }
    : { system: this.systemPromptString() }),
  experimental_context: internal,
  stopWhen: stepCountIs(this.config.maxTurns ?? 10),
  abortSignal: this.abortController?.signal,
  onStepFinish,
  onError: (err) => { console.error('[AISDKEngine] streamText error:', err); },
});
```

### 4b. The prepareStep callback

```typescript
private buildPrepareStepHook(internal: InternalContext) {
  return async ({ stepNumber, messages }: PrepareStepOptions): Promise<PrepareStepResult> => {
    // Memory recall — fires ONCE per turn (at stepNumber 0); cached
    // in internal.toolContext.memoryCache for subsequent steps.
    if (stepNumber === 0 && this.config.memoryStore) {
      const userMessage = extractLatestUserMessage(messages);
      try {
        const records = await this.config.memoryStore.recall(userMessage, { topK: 5 });
        internal.toolContext.memoryCache = { query: userMessage, results: records };
      } catch (err) {
        // Honest-degrade: memory recall failure does NOT block the turn.
        console.warn('[AISDKEngine] memory recall failed; continuing without:', err);
        internal.toolContext.memoryCache = { query: userMessage, results: [] };
      }
    }

    // Assemble system prompt in F-4 order
    const layers: string[] = [
      this.systemPromptString() ?? '',           // 1. base system
      this.config.financialContextBlock ?? '',   // 2. <financial_context>
      buildMemoryBlock(internal.toolContext.memoryCache?.results ?? []), // 3. memory (NEW)
      this.config.skillRecipeBlock ?? '',        // 4. skill recipe
    ];

    return {
      system: layers.filter((l) => l.length > 0).join('\n\n'),
    };
  };
}

function buildMemoryBlock(records: MemoryRecord[]): string {
  if (records.length === 0) return '';
  const items = records
    .map((r, i) => `  ${i + 1}. ${r.text}`)
    .join('\n');
  return `<memory_recall>\n${items}\n</memory_recall>`;
}
```

### 4c. Config additions

```typescript
// packages/engine/src/types.ts (extension to EngineConfig)

interface EngineConfig {
  // ... existing fields ...

  /**
   * [Phase 7] Pluggable memory backend. When set, the engine wires
   * `prepareStep` to recall once per turn (cached) and inject results
   * as a `<memory_recall>` block in the F-4 5-layer order.
   *
   * When undefined, the engine falls back to static system prompt
   * assembly (legacy v0.7a Phase 6 and earlier behavior).
   *
   * Production wiring: audric injects `MemWalMemoryStore` here once
   * MemWal stabilizes (post-2026-05-29 checkpoint, Plan A active per
   * BENEFITS_SPEC §1810).
   *
   * Testing: engine ships `InMemoryMemoryStore` for unit + integration
   * tests; CLI / MCP / examples use it as the default no-op.
   */
  memoryStore?: MemoryStore;

  /**
   * [Phase 7 / F-4] Pre-built `<financial_context>` XML block from the
   * host's daily snapshot cron. Engine inserts at layer 2 of the F-4
   * order via prepareStep. Optional — when undefined, layer 2 is empty.
   */
  financialContextBlock?: string;

  /**
   * [Phase 7 / F-4] Pre-built skill recipe block (e.g. from
   * McpPromptAdapter.buildPrepareStepSystemPrefix() output). Engine
   * inserts at layer 4. Optional — when undefined, layer 4 is empty.
   */
  skillRecipeBlock?: string;
}
```

### 4d. Why NOT extend the existing `systemPromptString()` helper

The subagent recommendation was: "extend `systemPromptString()` to concatenate `base + financial + memory + skill`." This is simpler but loses two properties:

1. **Memory recall happens at turn start**, before step 0's LLM call. Calling it from `systemPromptString()` means `runStream` must `await` the recall before invoking `streamText` — that's fine, but it conflates the recall lifecycle with prompt assembly.
2. **`prepareStep` enables future per-step recall** (e.g., if a tool result triggers a topic shift that warrants fresh recall mid-turn). Wiring `prepareStep` now is the right architecture for v0.7b/v0.7c extensions.

The `prepareStep`-based design also delivers F-4 literally ("`prepareStep` (per-step tool gating)") as named in BENEFITS_SPEC, which makes the verification check trivially documented.

---

## 5. 4 BENEFITS_SPEC §1886 D-questions resolved

Per BENEFITS_SPEC's "Phase 7 design refinements" table:

| # | Question | Answer | Why |
|---|---|---|---|
| **D-1** | `withMemWal` middleware vs manual SDK calls? | **Manual SDK** | `withMemWal(model, config)` injects memory in a fixed position the middleware decides. We need F-4 ordering control (financial_context BEFORE memory, memory BEFORE skill). The middleware cannot deliver F-4 by construction. |
| **D-2** | Per-app delegate keys with scoped permissions? | **Deferred to audric wiring** | Engine-side `MemoryStore` interface is key-agnostic — it accepts whatever `MemoryStore` impl the host provides. Audric's `MemWalMemoryStore` decides whether to use a delegate key pool. Out of engine scope. |
| **D-3** | `Ask` API vs manual recall + system-prompt injection? | **Manual recall + injection** | Same reason as D-1: `Ask` does retrieval + LLM in one call inside MemWal. We need to retrieve plaintext records, render them into our system-prompt layer 3, and let our own LLM (Anthropic, possibly Qwen later) reason. Server-side LLM at MemWal bypasses our prompt caching + F-1 portability. |
| **D-4** | Expose Audric memory as MCP? | **Deferred to v0.7c** | Cross-product memory sharing is a product feature; engine-side scope is just `MemoryStore` consumption. Audric can wrap its `MemWalMemoryStore` in an MCP server later if the product team prioritizes it. |

---

## 6. Implementation slices (proposed)

### Slice 1 — `MemoryStore` interface + mock (~3-4h)

- NEW: `packages/engine/src/memory/store.ts` — `MemoryStore` interface + `MemoryRecord` type
- NEW: `packages/engine/src/memory/in-memory-store.ts` — `InMemoryMemoryStore` mock
- NEW: `packages/engine/src/memory/in-memory-store.test.ts` — mock unit tests (remember + recall + topK + namespace + destroy)
- MOD: `packages/engine/src/index.ts` — export `MemoryStore`, `MemoryRecord`, `InMemoryMemoryStore`

### Slice 2 — `EngineConfig` extension (~1h)

- MOD: `packages/engine/src/types.ts` — add `memoryStore?: MemoryStore`, `financialContextBlock?: string`, `skillRecipeBlock?: string` to `EngineConfig` (with JSDoc citing this spec)
- MOD: `packages/engine/src/v2/tool-context.ts` — add `memoryCache?: { query: string; results: MemoryRecord[] }` to `ToolContext`
- VERIFY: typecheck passes; no consumer code break (all 3 new fields are optional)

### Slice 3 — `prepareStep` wiring + 5-layer assembler (~3-4h)

- MOD: `packages/engine/src/v2/engine.ts` — add `buildPrepareStepHook(internal)` private method
- MOD: `packages/engine/src/v2/engine.ts` `runStream` — branch on `this.config.memoryStore` to set `prepareStep` vs static `system`
- NEW: `packages/engine/src/memory/build-memory-block.ts` — pure helper `buildMemoryBlock(records: MemoryRecord[]): string` (XML `<memory_recall>` formatter)
- NEW: `packages/engine/src/memory/extract-user-message.ts` — pure helper to pull latest user message text from `messages[]`

### Slice 4 — 5-layer ordering integration test (~2-3h)

- NEW: `packages/engine/src/memory/five-layer-ordering.test.ts`:
  - Setup: `AISDKEngine` with `InMemoryMemoryStore` + pre-loaded records + `financialContextBlock` + `skillRecipeBlock` + base `systemPrompt`
  - Spy on the streamText `system` argument (via mock anthropic provider)
  - Assert order: base appears before `<financial_context>`, before `<memory_recall>`, before skill block
  - Assert per-turn caching: 5 steps in one turn → 1 call to `recall()`
  - Assert degradation: `recall()` throws → engine continues, empty `<memory_recall>` block

### Slice 5 — Documentation (~1-2h)

- NEW: `.cursor/rules/memory-injection-architecture.mdc` — codifies the 5-layer order, the cache lifecycle, the degradation contract
- MOD: `packages/engine/README.md` — add Phase 7 section pointing at the new interface + this spec
- MOD: `CLAUDE.md` — add `MemoryStore` to the import patterns block + add a "Phase 7 (memory)" section to the engine notes

### Total

**~9-13 hours of engine-side work** (1.5-2 working days). Ships as engine v2.6.0.

### Post-MemWal-stabilization (audric work, ~2 days when MemWal is ready)

- audric: `MemWalMemoryStore` implementation (~half day)
- audric: wire `EngineConfig.memoryStore` in `engine-factory.ts` (~1h)
- audric: cron job for daily `remember()` of user financial snapshot (~half day)
- audric: E2E test against live MemWal (~half day)
- audric: instrumentation for `[memory-recall]` Vercel telemetry tag (~1h, parallel to `[stream-resume]` pattern)

---

## 7. Open questions for the implementation slice

1. **Memory namespace strategy** — `MemoryStore.recall(query, { namespace })` accepts an optional namespace. MemWal uses one namespace per user; per-product or per-session sub-namespaces are optional. Engine-side interface stays generic; audric's `MemWalMemoryStore` decides the namespace scheme. **Decision: defer; expose namespace as opt-in opts field.**
2. **Memory record write timing** — Do we `remember()` after every turn (assistant response + tool outcomes) or only on opt-in (user explicitly says "remember this")? MemWal ingest is fire-and-forget but takes p50 25s — if we trigger on every turn, the cumulative write throughput must not exceed MemWal's ingestion bandwidth. **Decision: ship the interface; defer write-trigger policy to audric integration; mock test uses every-turn writes for verification.**
3. **Topic-shift detection** — cached recall stays warm until topic shifts. Detection options: keyword-overlap classifier vs LLM-based classifier vs none (always recall fresh). **Decision: out of v0.7a scope; ship cache-once-per-turn semantics; v0.7b can add detector via `onUserMessage` hook.**
4. **`<memory_recall>` block format** — proposed minimal XML format: `<memory_recall>\n  1. <text>\n  2. <text>\n</memory_recall>`. Could add similarity scores, timestamps, source tags. **Decision: minimal-shape v1; iterate based on prompt engineering needs.**
5. **`onTurnStart` lifecycle hook** — not strictly needed for v1 (recall happens inside `prepareStep` at step 0). Adding `onTurnStart` would let hosts pre-seed memory based on the user message before any LLM call. **Decision: defer; revisit if Phase 7 close evidence motivates it.**
6. **Pre-MemWal mock in audric** — should audric ship `InMemoryMemoryStore` immediately in production (no memory, but exercises the F-4 wiring) and swap in `MemWalMemoryStore` later? OR wait until MemWal is ready? **Decision: ship the engine prototype first (this scoping); audric integration waits for the 2026-05-29 checkpoint.**

---

## 8. Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| MemWal API surface changes between v0.0.4 and v1 | Medium | `MemoryStore` interface is engine-owned; audric's `MemWalMemoryStore` adapts to whatever SDK lands. Engine is insulated. |
| `prepareStep` per-step overhead | Low | Hook is pure JS (string concatenation + cache lookup); single-digit ms. Memory recall fires once per turn (cached). |
| F-4 ordering verification regresses | Low | Integration test asserts ordering against mock; runs on every CI build. |
| Audric prepareStep + audric's existing chat-route system-prompt wiring conflict | Medium | When audric wires `memoryStore`, it MUST also move its `<financial_context>` + skill recipe assembly OUT of the static `systemPrompt` and INTO the new `financialContextBlock` + `skillRecipeBlock` config fields. Documented in §6 Slice 5. |
| `withMemWal` middleware becomes the "right" answer in MemWal v1 | Low | Decision can be revisited if MemWal v1 ships a middleware that respects F-4 ordering. Our `MemoryStore` interface remains useful as the engine-side abstraction even then. |

---

## 9. Verifiable goals

The Phase 7 engine-side prototype is DONE when:

1. ✅ `MemoryStore` interface + `InMemoryMemoryStore` mock ship in `@t2000/engine` exports
2. ✅ `EngineConfig.memoryStore` + `financialContextBlock` + `skillRecipeBlock` extension is typecheck-clean
3. ✅ `prepareStep` is wired in `runStream` with branch-on-config
4. ✅ Integration test asserts the F-4 ordering against the mock (single tester run + `pnpm --filter @t2000/engine test` green)
5. ✅ Per-turn caching verified: 5 steps → 1 `recall()` call
6. ✅ Degradation verified: `recall()` throws → engine continues, empty `<memory_recall>` block
7. ✅ Documentation in README + new rule file + CLAUDE.md updates
8. ✅ Engine release v2.6.0 with full changelog entry

Phase 7 PRODUCTION (audric + MemWal) is DONE when:

9. ✅ Audric's `MemWalMemoryStore` ships
10. ✅ Audric wires `EngineConfig.memoryStore` in `engine-factory.ts`
11. ✅ Live E2E test against MemWal recall passes p95 budget (700ms single, <50ms cached)
12. ✅ Daily `remember()` cron writes turn intent + outcome to MemWal
13. ✅ `<memory_recall>` block appears in production system prompts (Vercel log inspection)

---

## 10. Cross-references

- BENEFITS_SPEC Phase 7 section → `BENEFITS_SPEC_v07a.md:1810-1895`
- AI SDK v6 `prepareStep` reference → https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text
- MemWal smoke harness (production reference) → `packages/engine/scripts/memwal-smoke.ts`
- MemWal issue → [MystenLabs/MemWal#159](https://github.com/MystenLabs/MemWal/issues/159)
- StreamCheckpointStore pattern reference → `packages/engine/src/stream-checkpoint.ts`
- DefiCacheStore pattern reference (closest existing analog) → `packages/engine/src/cache/defi.ts`
- v2 engine streamText call site → `packages/engine/src/v2/engine.ts:968-980`
- ToolContext builder → `packages/engine/src/v2/tool-context.ts:40-76`
- Existing McpPromptAdapter (skill recipe builder, currently unused in v2) → `packages/engine/src/mcp/prompt-adapter.ts:71-73`
- V0.7b roadmap → `V07B_ROADMAP_DRAFT.md`
- Slice D scoping (companion v0.7b decision) → `SPEC_SLICE_D_DRAFT.md`
