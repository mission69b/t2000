# Long-Running Workflows

> **Status:** LOCKED — no migration today; trigger criteria documented for Audric Store Phase 5
> **Closes:** `SPEC_AI_SDK_HARDENING.md` P4.5
> **Tracked by:** `audric-build-tracker.md` S.307 (2026-05-24)
> **Last reviewed:** 2026-05-24

---

## The decision in one paragraph

The AI SDK supports a [workflows pattern](https://ai-sdk.dev/docs/agents/workflows) (sequential / parallel / orchestrator-evaluator) for durable, long-running agent execution that survives tab closes, network blips, and cold starts. Audric's current chat surface does NOT need workflows — every chat turn completes in 2-15 seconds via inline `streamText`, sponsored-tx prep is 1-2s, multi-step bundles are atomic in a single PTB (the PTB IS the workflow). **Adopting workflows today would add infrastructure complexity (durable execution backend, checkpoint storage, resume semantics) for zero user-facing benefit.** Audric Store (Phase 5 of `audric-roadmap.md`) — generated ebooks, music, art with 10s-2min job durations — is the first natural workflow consumer. When Phase 5 lands, `render_artifact` (per `CANVAS_VS_ARTIFACT.md`) becomes the first workflow-backed tool. Until then, the chat loop's inline streaming is correct.

---

## Why workflows don't fit Audric chat today

### Current long-running surface (none of these need workflows)

| Surface | Duration | Why inline streaming is sufficient |
|---|---|---|
| Sponsored transaction prep | ~1-2s end-to-end (Enoki call + PTB build + signing prep) | Fast enough that user wait is dominated by transaction signing UX, not server latency. Already streams progress via tool-result chunks. |
| Multi-step bundles (swap + save, send-many) | Atomic on-chain — single PTB | The PTB itself IS the durable workflow. Sui's atomic execution guarantees both legs succeed or both revert. Adding a server-side workflow layer would duplicate guarantees the chain already provides. |
| Daily cron snapshots (financial-context, portfolio) | Background, separate from chat | Already a separate job — not part of the chat tool loop. Workflow infrastructure overlaps zero with chat. |
| Heavy DeFi read tools (`portfolio_analysis`) | 800ms-10s | Single `streamText` call handles this. The P4.3 subagent pilot reduces this further (~1-2k context tokens via summarized output). |
| Chat turn total wall time | 2-15s typical, up to 30s for compound reads | AI SDK's `streamText` + page-reload resume (SPEC_AUDRIC_STREAM_RESUME, S.287-S.289) cover the durability story. Cross-instance abort via Redis pub/sub (S.289) handles cleanup. |

### What we already have that COVERS the durability story for chat

`SPEC_AUDRIC_STREAM_RESUME` (Phases 1-3 shipped via S.287-S.289) gives audric/web-v2:

1. **Page-reload resume** — `useChat({ resume: true })` + `resumable-stream@2.2.12` + server-side wiring (S.287)
2. **Cross-instance abort** — Redis pub/sub on `stream:abort:{id}` channel (S.289), so Stop button cancels actual LLM compute + Anthropic token spend
3. **Auto-migrate** of legacy chats — S.288

This is the chat-tier durability layer. It's NOT workflows (no orchestrator-evaluator pattern, no checkpoint state machine), but it IS the right durability granularity for sub-30s chat turns: resume the STREAM, not a multi-step state machine.

### What workflows ADD on top of stream resume

[Vercel workflows](https://ai-sdk.dev/docs/agents/workflows) introduce:

| Workflow feature | Chat use case fit |
|---|---|
| Sequential workflow (step A → step B → step C, each checkpointed) | None — chat steps are LLM-driven, not predefined. AI SDK's stepCountIs handles multi-step within a single `streamText`. |
| Parallel workflow (fan-out to N tools, gather results) | Partially covered — AI SDK natively dispatches read-only concurrent tools mid-stream. Workflow's fan-out adds server-side parallelism boundary but the chat already parallelizes via `isConcurrencySafe`. |
| Orchestrator-evaluator (one agent supervises another) | Maps cleanly to P4.3's subagent pilot — but that's a TOOL pattern, not a workflow. Same orchestration win without workflow infrastructure. |
| Durable execution (resume after server restart / timeout) | Overkill for sub-30s chat turns; under-powered for cron snapshots (those need scheduled triggers, not durable execution). The fit lands when generation tasks run minutes, not seconds. |
| Checkpoint storage | Adds a durable-state table + commit/restore semantics. Worth it for multi-minute jobs; expensive for 2-15s chat turns. |

**Conclusion:** workflows are the right primitive for **generation tasks** (minutes long, server-side, durable-state-required), not chat tool loops.

---

## Where workflows WILL matter — Audric Store Phase 5

`audric-roadmap.md` Phase 5 — **Audric Store** — introduces creator-marketplace generation surfaces that have completely different runtime characteristics from chat:

### Audric Store generation tasks (10s-2min each)

| Task | Duration | Why workflow-shaped |
|---|---|---|
| AI ebook chapter generation | 30-60s per chapter, 5-15 chapters | Sequential workflow with checkpoint per chapter. User closes tab on chapter 7? Resume from chapter 8 on next visit. |
| AI music track generation | 1-3 minutes | Single-step durable execution with progress streaming. Audio render must survive tab close. |
| AI art generation (image) | 10-30s per image, often N images | Parallel workflow — fan out to N image generation calls, gather, present grid. |
| Listing finalization (Walrus upload + payment-link mint + storefront index) | 30-60s sequential | Sequential workflow with retry boundaries — Walrus may rate-limit, payment-link contract may need re-retry, indexer may be lagging. |

These tasks share three properties that chat tools don't:

1. **Durations measured in minutes, not seconds** — user expects to leave and come back.
2. **Resumability is user-facing** — if you start an ebook and close the tab, you expect "chapter 7 of 12, resuming…" on reload, not "start over."
3. **Server-side work continues without an active client** — chat dies when tab closes (the client drives the LLM); Audric Store generation should continue (a tab close doesn't cancel a song mid-render).

These are exactly the properties workflows address.

### The shape Audric Store will likely adopt

Per [Vercel workflows](https://ai-sdk.dev/docs/agents/workflows) + `CANVAS_VS_ARTIFACT.md`:

```ts
// Future (Audric Store Phase 5 — not built yet)
const ebookWorkflow = workflow({
  steps: [
    generateOutline,           // ~10s — checkpoint
    generateChapters,          // parallel, N chapters — checkpoint per chapter
    generateCoverArt,          // ~30s — checkpoint
    walrusUpload,              // ~5s — retry boundary
    mintPaymentLink,           // ~3s — retry boundary
    indexInStorefront,         // ~2s — retry boundary
  ],
  storage: workflowStorage,    // Prisma `Artifact` + `WorkflowState` tables
});

render_artifact({
  kind: 'ebook',
  workflowId,                  // run the ebook workflow, stream progress via preliminary tool-results
});
```

The `render_artifact` tool from `CANVAS_VS_ARTIFACT.md` is the user-facing entry point; the workflow is the durable execution backend that powers it.

---

## When to revisit this decision

Re-read this doc and **adopt workflows** when ANY of these lands:

1. **Audric Store Phase 5 kickoff** — generation tasks become real work. This doc becomes the playbook reference; `render_artifact` should be workflow-backed from the start (not "ship inline first, migrate later" — migration cost for a brand-new tool is silly).
2. **A "rebalance my portfolio" verb that takes 1-5 minutes** — deep portfolio audit + multi-leg swap planning + safety simulation + bundle prep. The duration crosses the chat-tier threshold; workflows become the right primitive.
3. **An advisory product that runs background analysis** — e.g. "watch my position 24/7, alert + propose rebalance when HF < 1.5". Continuous server-side execution, durable state, user-async — workflow-native.
4. **AI SDK promotes workflows out of any `experimental_` prefix** with breaking-change protection — risk of upstream churn drops, adoption cost drops.

**Do NOT adopt workflows for chat** as part of any future SPEC unless the chat loop's durability story (stream resume + cross-instance abort) has demonstrably failed in production. It hasn't.

---

## What we DO commit to (today, without workflows)

- Chat loop stays on `streamText` + `Experimental_Agent` + `prepareStep` / `onStepFinish` lifecycle. Resume via `SPEC_AUDRIC_STREAM_RESUME`'s page-reload + abort primitives.
- Sub-agent pattern (P4.3 — `portfolio_analysis` pilot) handles context-heavy reads without crossing into workflow territory. Subagents return summaries; they don't checkpoint state across server restarts.
- Sponsored-tx flow stays inline (1-2s budget).
- Cron snapshots stay as separate scheduled jobs.

---

## What gets re-evaluated when workflows land (Phase 5 prep checklist)

When Audric Store kicks off, this doc should grow a "Phase 5 adoption playbook" section covering:

- Workflow storage backend: Vercel Queues vs Prisma-backed checkpoint table vs Inngest vs custom. Decision per cost / Vercel-alignment / debuggability.
- `WorkflowState` Prisma model — schema, indexes, retention.
- Streaming progress UX — `preliminary` tool-result chunks, side-panel artifact pane updates (per `CANVAS_VS_ARTIFACT.md`).
- Retry semantics per step — exponential backoff, max retries, dead-letter handling.
- Cancellation — workflow `abortSignal` plumbing across server restarts.
- Observability — workflow run history, step-level latency, failure modes.

Until then, none of those are open questions; they're future-Phase 5 work scaffolding.

---

## Cross-references

- `audric/audric-roadmap.md` — Audric Store Phase 5 description.
- `spec/reference/CANVAS_VS_ARTIFACT.md` — sibling decision doc; `render_artifact` is the first workflow consumer.
- `spec/active/shipping/SPEC_AUDRIC_STREAM_RESUME.md` — the chat-tier durability layer (Phases 1-3 shipped).
- `spec/active/shipping/SPEC_AI_SDK_HARDENING.md` P4.5 — the SPEC item this doc closes.
- `audric-build-tracker.md` S.307 — ship record for this decision doc.
- [ai-sdk.dev/docs/agents/workflows](https://ai-sdk.dev/docs/agents/workflows) — the AI SDK workflows pattern.
- [ai-sdk.dev/docs/agents/subagents](https://ai-sdk.dev/docs/agents/subagents) — sibling pattern that DOES apply today via P4.3 subagent pilot.
- `t2000/CLAUDE.md` — Audric Intelligence + Audric Store sections both cross-reference this doc.
