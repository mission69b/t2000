# Subagent Pilot — Deferred

> **Status:** DEFERRED — no current pain; revisit triggers documented below
> **Closes:** `SPEC_AI_SDK_HARDENING.md` P4.3 ("Subagent pilot for context-heavy reads")
> **Tracked by:** `audric-build-tracker.md` S.311 (2026-05-24)
> **Last reviewed:** 2026-05-24

---

## The decision in one paragraph

The [Vercel subagent doc](https://ai-sdk.dev/docs/agents/subagents) describes a pattern where a parent `Experimental_Agent` delegates a context-heavy task to an inner agent (own context window, own tool subset, own system prompt). The inner agent returns a focused summary via `toModelOutput`, keeping the parent's context clean. P4.3 of the AI SDK Hardening plan proposed piloting this pattern by wrapping `portfolio_analysis` as a subagent — Vercel's canonical "concrete, not speculative" alternative to a multi-agent orchestrator design doc. **Audric will not pilot subagent against `portfolio_analysis` today.** The three rationales the plan cites for the pattern (context-budget pressure, progress-stream UX, no-needsApproval safety) don't hold up when measured against the 2026-05-24 production reality: the engine's `portfolio_analysis` returns ~500-800 tokens of structured data (not the 5-10k the plan speculated), an 800ms operation doesn't need a streaming progress UX, and the no-needsApproval property is intrinsic to read-only subagents, not a reason to introduce one here. We defer the pattern until ONE of four named triggers materializes — at which point the canonical pilot architecture is documented inline below so a future agent can execute it surgically without re-litigating the design space.

---

## Why we're deferring (each plan rationale, re-examined)

### Rationale 1 — "Parent agent context budget gets bloated by portfolio_analysis (~5-10k tokens)"

**Reality check.** Reading `packages/engine/src/tools/portfolio-analysis.ts:39-76` (the `PortfolioResult` interface): 6 scalar numbers (`totalValue`, `walletValue`, `savingsValue`, `defiValue`, `debtValue`, `healthFactor`) + `allocations: AssetAllocation[]` capped at top 10 + 2-4 short insight strings + ~10 metadata fields. **Realistic JSON size: ~500-800 tokens**, often less. The plan's 5-10k speculation was unmeasured.

Today's actual prompt cost driver (from production smoke logs, 2026-05-24):

```
prompt~12388tok lastUser="..."
prompt~12462tok lastUser="..."
prompt~12631tok lastUser="..."
```

~12.4-12.6k tokens per turn — distributed across:
- System prompt: ~4-5k (post-P3.1 active-tools narrowing cut tool schemas from ~7k to ~1-2k)
- Memory recall block: ~320 chars (~80 tokens)
- Financial context block: ~500-1k tokens (daily snapshot)
- Conversation history: ~3-6k (grows per turn; compactMessages keeps the ceiling)
- Tool RESULTS in conversation history: ~500-1500 tokens per past tool call

The `portfolio_analysis` RESULT (~500-800 tokens) is **5-7%** of a typical turn's prompt budget. Replacing it with a subagent summary at ~200 tokens saves ~300-600 tokens per turn — meaningful but not transformative. The whole rationale "subagent unlocks bigger context budget" presupposes a budget pressure that doesn't exist.

### Rationale 2 — "UI streams progress via `preliminary` tool-result chunks"

`portfolio_analysis` takes ~800ms today (per the plan's own note, confirmed by the smoke logs' total tool dispatch latency). A subagent introduces an LLM-loop overhead — Vercel's subagent example uses 1.5-3s additional latency. That's a NET LATENCY ADD of 2-4x for the deep-analysis verb.

Adding subagent machinery to stream "Fetching NAVI positions..." for an 800ms operation is over-engineering. The progress-stream UX shines for genuinely-long operations (10+ seconds) where the user is at risk of thinking the system has hung. 800ms with a spinner is fine — and a sub-2-second perceived response is faster than the subagent path even before counting the summary-generation step.

Where progress-stream genuinely matters: Audric Store generation tasks (P4.5's locked workflows surface — ebooks, music, art) which are minute-scale. That's where preliminaries will be load-bearing. Not portfolio_analysis.

### Rationale 3 — "Read-only subagent — no `needsApproval` complications"

This is a fact about read-only subagents in general, not a reason to PILOT one against this tool. It's not even a reason; it's a property. We could equally cite "subagents don't have write tools to abuse" — true, but doesn't justify introducing one.

### What the production smoke actually surfaced (2026-05-24)

The user's smoke session that triggered S.309 / S.310 caught:

1. Intent classifier missing `save_deposit` on a typo'd follow-up (S.309 — fixed)
2. Dead `temperature: 0.3` config emitting warnings every turn (S.309 — fixed)
3. Canvas `yield_projector` showing $1000/4.5% defaults instead of user's actual position (S.310 — fixed via `positionFetcher` fallback)

**Zero of these would have been prevented or improved by a subagent.** The smoke was about (a) tool-availability bugs, (b) config noise, (c) state-resolution bugs. None of them are context-budget or progress-streaming problems.

---

## When to re-litigate (named triggers)

Re-open the subagent pilot ONLY when ONE of these materializes. Each trigger has a clear measurement target so the decision is data-driven, not speculative.

### Trigger 1 — Context budget pressure becomes measurable

- Production telemetry shows `cacheReadTokens` regularly within 10% of Anthropic's prompt cache ceiling (currently ~200k for Sonnet 4.6), AND
- `compactMessages` fires aggressively (visible in `audricObservabilityMiddleware` logs as `compaction` events on >5% of turns), AND
- A specific tool's result is responsible for >2k tokens of context per call.

**Threshold:** any one tool whose result averages >2k tokens AND that's called on >30% of turns. Audit by adding a one-line log to each read tool's `call()` reporting JSON-size in tokens.

### Trigger 2 — A new context-heavy tool ships

When we add a tool whose canonical use case requires aggregating across 10+ protocols / chains / data sources (e.g., a hypothetical "cross-chain portfolio" tool spanning Sui + Ethereum + Solana + Base + L2s), the subagent pattern becomes natural — the tool needs LLM-driven orchestration of sub-fetches, not a single `Promise.all` fan-out.

**Threshold:** tool design where the single-fetch implementation would exceed ~150 LoC of orchestration logic OR require >5 sequential primitive tool calls.

### Trigger 3 — Audric Store Phase 5 generation tasks ship

The LLM_CACHING + LONG_RUNNING_WORKFLOWS decision docs both note that Audric Store generation (ebooks, music, art) is the workflows-surface flagship. Those tasks are minute-scale, benefit massively from streaming progress, and are read-only from the user's perspective (the generation IS the result). A subagent wrapping the generation pipeline is the canonical pattern there.

**Threshold:** Audric Store Phase 5 design hits implementation. Subagent + workflows ship together as the harness, not as separate concerns.

### Trigger 4 — User complaint that a deep-analysis verb feels "stalled"

If users complain about portfolio_analysis (or any analytical tool) feeling unresponsive, AND the latency budget shows we can't make the underlying tool faster, THEN preliminary-chunk streaming via subagent becomes the right escape valve.

**Threshold:** ≥3 distinct user complaints in a single quarter about a specific tool's perceived speed, where root-cause analysis confirms the tool is already optimally implemented.

---

## What we'd implement IF a trigger fires (the canonical pilot)

This section is documentation, not implementation. It exists so a future agent doesn't have to re-derive the architecture when one of the triggers materializes.

### Pilot scope (when activated)

- ONE tool migrated to subagent pattern. Choose based on the trigger:
  - Trigger 1 → migrate the specific bloated tool
  - Trigger 2 → ship the new tool AS a subagent from day 1
  - Trigger 3 → ship Audric Store generation tools as subagents
  - Trigger 4 → migrate the specific tool with the perceived-speed problem

### Architecture (per-request agent construction)

```ts
// audric/apps/web-v2/lib/audric/<tool-name>-subagent.ts

export function buildXSubagentTool(opts: {
  model: LanguageModel;          // SAME wrapped model as parent
  internalContext: unknown;      // Parent's InternalContext envelope
  toolSubset: ToolSet;           // Pre-wrapped primitives the subagent uses
  walletAddress?: string;
  signal?: AbortSignal;
}) {
  // Per-request agent construction — InternalContext is per-request,
  // so the agent captures it in closure. `experimental_context` is on
  // `ToolLoopAgentSettings` (constructor), NOT on `AgentStreamParameters`.
  const subagent = new Experimental_Agent({
    model: opts.model,
    tools: opts.toolSubset,
    instructions: `You are a <tool-specific> specialist. Use the available read tools to gather state. Return a CONCISE 2-3 paragraph summary covering: <tool-specific bullets>. Be terse — your summary embeds inside a larger conversation.`,
    stopWhen: stepCountIs(5),  // Bound the inner loop
    experimental_context: opts.internalContext,
    experimental_telemetry: { isEnabled: true, functionId: 'x_subagent' },
  });

  return tool({
    description: '<same as the tool being replaced>',
    inputSchema: z.object({ /* same shape */ }),
    execute: async function* (input, { abortSignal }) {
      const result = subagent.stream({
        prompt: `<tool-specific prompt with input baked in>`,
        abortSignal,
      });
      // Yield preliminary chunks for progress UX
      for await (const message of readUIMessageStream({
        stream: result.toUIMessageStream(),
      })) {
        yield message;
      }
    },
    toModelOutput: ({ output: message }) => {
      const lastText = message?.parts.findLast((p) => p.type === 'text');
      return {
        type: 'text',
        value: lastText?.text ?? '<tool-specific> analysis complete.',
      };
    },
  });
}
```

### Route wiring (when activated)

```ts
// route.ts — filter the engine tool out + inject the subagent wrapper

const engineTools = toAISDKTools([...READ_TOOLS, ...WRITE_TOOLS]);
const { x_tool: _engineX, ...engineToolsMinusX } = engineTools;
const tools: ToolSet = {
  ...engineToolsMinusX,
  x_tool: buildXSubagentTool({
    model,
    internalContext,
    toolSubset: pick(engineTools, ['balance_check', 'savings_info', ...]),
    walletAddress,
    signal: abortController.signal,
  }),
};
```

### Pilot success criteria (when activated)

Two-week production observation window measuring:

1. **Latency p50 / p95** — subagent wrapper vs current direct tool. Target: p50 < 2x current, p95 < 3x.
2. **Token economics** — total prompt tokens per turn (parent + subagent), measured against pre-pilot baseline. Target: ≥20% reduction in parent's prompt budget on turns that invoke the subagent.
3. **Quality regression** — manual review of 20 production conversations comparing subagent summaries against direct tool outputs. Target: zero hallucinations, zero "lost detail" complaints.
4. **UX feedback** — explicit user surveys on the 3 most-impacted verbs. Target: net positive sentiment vs control.

If 3 of 4 criteria pass → extend the pattern to a second tool. If 2 of 4 → defer for 1 month + re-measure. If 1 of 4 or fewer → abandon and document the failure mode in this file.

### Risks to flag during the pilot

- **`AgentStreamParameters` does NOT carry `experimental_context`** — only `ToolLoopAgentSettings` does. The subagent MUST be constructed per-request (small cost, ~5-10ms) to capture the per-request InternalContext. Module-level singleton won't work.
- **Subagent `onStepFinish` integration** — the parent's `buildStepFinishHandler` wires guards, sessionSpend, cache invalidation, trustedAddresses. The subagent doesn't need most of this (read-only), but cache invalidation IS still relevant if the subagent's reads should mutate the parent's per-request cache. Document whether to share `portfolioCache` or use a fresh map.
- **UI rendering of `preliminary` chunks** — `tool-result-router.tsx` must handle preliminary chunks differently from final results (e.g., show as ephemeral "Fetching X..." status that's replaced by final summary, NOT as a permanent message). Verify before shipping.
- **Smoke testing** — the subagent pattern is a behavioral change visible to users. Staging deployment + manual smoke against the 5 most common conversation shapes is REQUIRED before production.

---

## Cross-references

- **Plan source** — `spec/active/shipping/SPEC_AI_SDK_HARDENING.md` P4.3 (now marked DEFERRED with link here)
- **Companion decision docs:**
  - `CANVAS_VS_ARTIFACT.md` (P4.2) — canvas templates stay inline, artifacts are separate
  - `PRISMA_VS_DRIZZLE.md` (P4.4) — no ORM migration
  - `LONG_RUNNING_WORKFLOWS.md` (P4.5) — workflows ship with Audric Store Phase 5
  - `LLM_CACHING_DECISION.md` (P4.6) — Gateway prompt cache only
- **The smoke that triggered the deferral analysis** — `audric-build-tracker.md` S.309 (intent classifier hotfix) + S.310 (canvas positionFetcher fallback), 2026-05-24

---

## Anti-pattern flag for future agents

> **Do not implement a subagent against `portfolio_analysis` without a documented trigger firing first.** The Vercel doc's example uses `portfolio_analysis` as the illustrative case, which is naturally suggestive. But Audric's `portfolio_analysis` is not context-heavy enough to justify the pattern's overhead — and the production smoke that surfaced our actual pain points (S.309 / S.310) had nothing to do with subagents. Re-implementing this rationale without new evidence is wheel-reinventing and should be pushed back on.
