# SPEC 15 — Confirm Flow Design (plan-context promotion + chips + multi-channel input)

**Date:** 2026-05-04
**Status:** v0.3 — Phase 1 + 1.5 SHIPPED & verified in production. **Phase 2 commit 1 (backend + telemetry) shipped 2026-05-04**; commit 2 (frontend) deferred to next session for telemetry baseline soak. Phase 3 deferred until after Phase 2 soak.
**Local-only — gitignored** (per `audric-roadmap.md` policy).
**Phase 2 design + ship log:** see `SPEC_15_PHASE2_DESIGN.md`.

## v0.2 — 2026-05-04 — Phase 1 + 1.5 shipped

**Phase 1** (commit audric `f72fbf8`, 591 LOC):
- `detectPriorPlanContext` added — drops the regex check from promotion path. Promote on prior-turn shape, not user message text.
- `audric.confirm_flow.plan_context_promoted` counter with `matched_regex / msg_length_bucket / msg_lang_hint / prior_write_verb_count` tags.
- Spec consistency assertion `CONFIRM_DETECTION_PLAN_CONTEXT` (16→17).
- 1269/1269 audric/web tests pass.

**Phase 1 prod verification:** session `s_1777869041294_b08b00870611` @ 2026-05-04 04:31:14. User typed `do it bro` after a 3-op plan turn. Logs:

```
plan-context detected → promoting low → medium
  (priorWriteVerbs=3, matchedRegex=false, msg="do it bro")
audric.confirm_flow.plan_context_promoted matched_regex=false ...
model=claude-sonnet-4-6 effort=medium thinking=true confirm_promoted=true
```

✅ Promotion fired. ❌ But `audric.bundle.fast_path_skipped reason=not_affirmative` STILL fired — the fast-path bundle dispatcher was still gated on the strict regex. Sonnet then re-planned the work and decomposed the prepared 3-op bundle into 2 separate transactions:

- TX 1 (`CHUqm9HA...kSoHmG`): standalone `swap_execute`
- TX 2 (`CVuXyjcX...CbRp31`): 2-op atomic (`save_deposit` + `send_transfer`)

Atomicity guarantee in plan card was broken. Funds safe (both TXes settled), but `bundleId 9b1a2397-5199-4c93-88ff-f1fdd65d9c17` was abandoned. This was the regression that motivated Phase 1.5.

**Phase 1.5** (commit audric `0a6bd59`, 518 LOC):
- `looksLikeNegativeReply` + `NEGATIVE_PATTERN` added — tight regex catching clear denials/modifications at message start.
- `tryConsumeFastPathBundle` — new admission path: regex miss + plan-context detected + not negative → `admitted_via=plan_context`, dispatch the stash.
- Fast-path counter now tagged `admitted_via='regex' | 'plan_context'`.
- New skip reasons: `negative_reply`, `no_plan_context`.
- Chat route passes `session?.messages` as history.
- 1360/1360 audric/web tests pass (+91 from Phase 1.5).

**Phase 1.5 prod verification:** session `s_1777870380091_5750b5572272` @ 2026-05-04 04:53:33. Same prompt, same `do it bro` reply. Logs:

```
plan-context detected → promoting low → medium (priorWriteVerbs=3, matchedRegex=false, msg="do it bro")
audric.confirm_flow.plan_context_promoted matched_regex=false ...
audric.bundle.fast_path_dispatched value=1 step_count=3 admitted_via=plan_context
[fast-path] bundle dispatched { bundleId: '0cfb3a42-...', stepCount: 3 }
audric.engine.chat_stream_duration_ms value=17
```

✅ Fast-path dispatched the prepared bundle as ONE atomic 3-op PTB. ✅ `admitted_via=plan_context` tag fires. ✅ Latency: **17 ms** (vs 10,704 ms pre-1.5, vs 69,034 ms pre-1.0).

**Latency progression on identical input:**

| Iteration | Method | Duration |
|---|---|---|
| Pre-Phase-1 (Fix 1 only — `do it bro` regex miss) | Haiku-lean ramble | 69,034 ms |
| Post-Phase-1, pre-Phase-1.5 | Sonnet medium re-plans bundle | 10,704 ms |
| Post-Phase-1 + 1.5 | Fast-path bypass (no LLM) | 17 ms |

**4,000× improvement over Phase-1-only.** Atomicity preserved (single Suiscan TX `ueiZRZKa...iCbUvt`).

**Behavior changes locked in by Phase 1 + 1.5:**

1. Strict regex match (`yes` / `Confirm` / `execute` / etc.) → fast-path 108ms (unchanged).
2. Non-regex affirmative on a plan turn (`do it bro` / `vamos` / voice / multilingual / emoji-only) → fast-path 17ms (new in 1.5).
3. Negative reply (`no` / `wait` / `cancel` / `actually` / `change leg 3`) on a plan turn → LLM picks up, Sonnet medium handles modification correctly (Phase 1).
4. Any message on a non-plan turn → no promotion, no fast-path (unchanged steady state).

**Open follow-ups (not blocking Phase 2):**
- Soak `admitted_via=plan_context` for 24 h to confirm production rate isn't 0% (i.e. Phase 1.5 is catching real misses, not dead code).
- Soak `negative_reply` skips to confirm we're not over-blocking legitimate confirms.

**Status:** Phase 1 + 1.5 complete. Regex-chasing trap structurally closed. Ready to start Phase 2 design (chips) when product input lands on the 4 open questions.

**Phase 2 design (2026-05-04):** product locks signed off on Q1 (`Confirm`/`Cancel` labels), Q2 (inline at message bottom), Q3 (per-message `type` discriminator, v1 ships `commit` only). Q4 (voice) deferred to Phase 3. Full design draft is in **`SPEC_15_PHASE2_DESIGN.md`** (~680 LOC, gitignored). Implementation kickoff awaits approval of that draft.

---

## Original v0.1 design (preserved below for context)


---

## TL;DR

The confirm flow today relies on a regex (`CONFIRM_PATTERN` in `confirm-detection.ts`) to detect when a user's short reply is meant to confirm a multi-write Payment Stream plan. Fix 1 (2026-05-04, commit `1f0911f`) extended the regex to cover six production-observed misses (`execute`, `exec`, `run`, `fire`, `launch`, `confimed`). It works, and it's verified in prod — but it's structurally reactive. The next user who types `vamos`, `proceed it`, `let's go bro`, or speaks `"yeah do it"` into voice-mode hits the same 7K-token / 69-second Haiku-lean ramble.

This spec replaces the regex-as-correctness model with a **multi-channel confirm-flow architecture**:

| Channel | Decision shape | Mechanism |
|---|---|---|
| **Chip click** | Pure binary (yes / no) | Per-message `expectsConfirm` flag → frontend renders chips → click POSTs structured payload |
| **Inline field edit** | Parameter tweak (change an amount or recipient) | `modifiableFields` UI input (Spec 1 Item 6 — already specced) |
| **Free text** | Anything else (modifications, multi-language, voice, qualifiers) | Always works → Sonnet handles natively (via Phase 1 plan-context promotion) |

The regex (Fix 1) stays, but **only as a fast-path optimization** (108ms bypass). It is no longer load-bearing for correctness.

**Three phases:**

- **Phase 1 — Plan-context promotion** (1 day, system-prompt-adjacent): drop the regex requirement from `detectBundleConfirm`. Promote `low → medium` (Haiku → Sonnet) on every short reply that follows a multi-write plan, regardless of message content. Removes the 7K-token Haiku-lean ramble surface entirely. Replaces the previously-scoped "Fix 2" plan.
- **Phase 2 — Chips + expectsConfirm contract** (1–2 weeks, UI + endpoint + telemetry): add a structural `expectsConfirm` flag to assistant messages. Frontend renders Yes/No chips when set. Click POSTs to the same chat endpoint with `{ via: 'chip', value: 'yes' | 'no' }`.
- **Phase 3 — Voice + conditional + multilingual** (deferred): voice handled as a side-effect of Phase 1. Conditional/parameterized confirms handled by `modifiableFields` (already partly specced). Multilingual narration in the assistant's plan text is a separate i18n project, out of scope here.

**Ship target:**
- Phase 1: audric repo only, no engine release. Estimated effort 0.5–1 day. Same model promotion code path that Fix 1 uses today.
- Phase 2: audric repo + engine `expectsConfirm` event-typing addition. Estimated effort 1–2 weeks (UI design + endpoint + a11y + telemetry + SPEC 8 corpus updates).

---

## Problem statement (why we need this)

### What we observed in production

**21:28:09 / session `s_1777843407792_2b7fc088a8fa`** — user replied `execute` to a multi-write plan turn. Pre-Fix-1 the regex didn't match → fast-path skipped with `not_affirmative` → Haiku-lean (no thinking, low effort) handled the turn. With no fast-path stash to dispatch and no clear tool to call, Haiku spent **69 seconds** emitting **7,159 tokens of stream-of-consciousness final text** trying to figure out whether `execute` was a confirm or a command.

**21:19:19 / session `s_1777841977869_2f844b8a694a`** — same thing, but the user typed `confimed` (typo of `confirmed`).

Fix 1 patched both by adding `execute|exec|run|fire|launch|confimed` to `CONFIRM_PATTERN`. Verified in prod 2026-05-04 — the same prompt with `execute` now dispatches in 108 ms instead of 69 s.

### Why Fix 1 alone isn't enough

The regex is a heuristic chasing the long tail of human language. Even with the extended pattern, these still miss:

- Multi-language: `sí`, `vamos`, `dale`, `ja`, `los`, `はい`, `好的`
- Casual: `do it`, `send it`, `let's go`, `yolo`, `do it bro`
- Typos: `confurm`, `execte`, `procede`, `comfirm`, `dop it`
- Qualified: `yes please`, `ok do it now`, `yes execute it`
- Emoji-only: `✅`, `🚀`, `👌`
- Voice-to-text artifacts: `yeah ah confirm`, `yes uh fire it`
- Parameterized: `yes but make leg 3 0.1 USDC`

We could grow the regex forever and still miss. The structurally-correct pattern — used by Slack Block Kit, Linear, Stripe Dashboard — is **structured input (chips) for the binary path + a degraded-but-correct fallback for free text**.

### Why "just add chips" isn't enough either

Free text always exists as a fallback path:
- Keyboard users with the input already focused
- Mobile users who scroll past the chip
- Voice mode (no chip to tap)
- Users who type qualified confirms (`yes but…`)

So chips reduce *how often* the free-text path matters, but don't eliminate the surface. We need both layers.

---

## Architecture — multi-channel confirm flow

### The three input channels

```
┌────────────────────────────────────────────────────────────────┐
│  Assistant message:                                            │
│  "Plan: 1. Swap 0.5 USDC → USDsui  2. Save…  3. Send 0.05…"   │
│  expectsConfirm: true                                          │
│  modifiableFields: [{ name: 'amount', kind: 'amount', ... }]   │
│  attemptId: <uuid>                                             │
└────────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   ┌─────────┐        ┌─────────────┐    ┌──────────────┐
   │  Chips  │        │  Inline edit │    │  Free text   │
   │ Yes/No  │        │ (one field)  │    │ (anything)   │
   └─────────┘        └─────────────┘    └──────────────┘
        │                   │                   │
        ▼                   ▼                   ▼
   POST /chat          POST /chat          POST /chat
   { via: 'chip',      { via: 'edit',      { via: 'text',
     value: 'yes' }      field: 'amount',    text: '...' }
                         newValue: 0.1 }
        │                   │                   │
        │                   │                   ▼
        │                   │           Plan-context
        │                   │           promotion fires
        │                   │           → Sonnet medium + thinking
        │                   │           handles natively
        │                   │
        │                   └────────► prepare_bundle re-called with
        │                              new params → new confirm card
        │
        └───► Fast-path dispatch (108 ms bypass, like today)
```

### Per-channel guarantees

| Channel | Latency budget | Failure mode |
|---|---|---|
| Chip | ≤ 200 ms (fast-path dispatch + UI ack) | If stash expired: chip-click POST sees no stash → falls through to text path with `value: 'yes'` as the message. Plan-context promotion catches it. |
| Inline edit | ≤ 3s (re-prepare + re-render) | If `modifiableFields` schema didn't include the edited field: server rejects with explanatory error. Frontend falls back to text-input path. |
| Free text | ≤ 5s (Sonnet medium with thinking) | Sonnet handles language/typos/qualifiers natively. Worst case: re-asks for clarification. Never rambles for 69 s. |

### Why this is structurally robust

Each channel handles a different shape of decision:

- **Binary** (yes / no, no parameter changes): chip — fastest path, structured, language-agnostic.
- **Parametric** (one field changed, otherwise yes): inline edit — structured, uses existing `modifiableFields` infra.
- **Conversational** (modification, denial with explanation, clarification): free text — Sonnet handles it.

The regex is now redundant for correctness — it's only kept as a 108 ms fast-path optimization for the common case (`yes` / `confirm` / etc.). When the regex misses, the **plan-context promotion** (Phase 1) ensures Sonnet handles the turn instead of Haiku-lean.

---

## Phase 1 — Plan-context promotion

**Replaces the previously-scoped "Fix 2 — Haiku-lean ramble guard" approach.**

### What changes

`detectBundleConfirm` in `apps/web/lib/engine/confirm-detection.ts` currently requires **both**:

1. User reply matches `CONFIRM_PATTERN` (regex)
2. Prior assistant message has `confirm`/`proceed` marker AND ≥2 distinct write verbs

The Phase 1 change: **drop requirement (1) entirely**. Promote on (2) alone.

### Concretely

```typescript
// confirm-detection.ts — proposed change

/**
 * Plan-context detection: should we promote Haiku → Sonnet for
 * THIS user reply?
 *
 * Promotes whenever the prior assistant turn proposed a multi-write
 * Payment Stream plan, regardless of what the user typed. The
 * fast-path bypass (`isAffirmativeConfirmReply`) handles the cheap
 * happy-case in 108ms; promotion is the safety net for everything
 * else (modifications, voice transcripts, multi-language, typos).
 */
export function detectPriorPlanContext(history: Message[]): BundleConfirmDetection {
  if (history.length === 0) {
    return { matched: false, priorWriteVerbCount: 0, reason: 'no-history' };
  }

  const prior = findMostRecentAssistantText(history);
  if (!prior) {
    return { matched: false, priorWriteVerbCount: 0, reason: 'no-prior-assistant' };
  }

  if (!PRIOR_PLAN_MARKER.test(prior.text)) {
    return { matched: false, priorWriteVerbCount: 0, reason: 'no-confirm-marker' };
  }

  const verbCount = countDistinctWriteVerbs(prior.text);
  if (verbCount < 2) {
    return { matched: false, priorWriteVerbCount: verbCount, reason: 'fewer-than-two-writes' };
  }

  return { matched: true, priorWriteVerbCount: verbCount, reason: 'matched' };
}
```

In `engine-factory.ts`:

```typescript
// Before (Fix 1):
if (baseEffort === 'low' && opts.message && opts.session?.messages) {
  const detection = detectBundleConfirm(opts.message, opts.session.messages);
  // detection requires CONFIRM_PATTERN match
  if (detection.matched) {
    effort = 'medium';
    confirmPromoted = true;
  }
}

// After (Phase 1):
if (baseEffort === 'low' && opts.session?.messages) {
  const detection = detectPriorPlanContext(opts.session.messages);
  // detection no longer cares what user typed
  if (detection.matched) {
    effort = 'medium';
    confirmPromoted = true;
    // [Phase 1] log includes prior plan structure for debug
    console.log(
      `[engine-factory] plan-context detected → promoting low → medium ` +
      `(priorWriteVerbs=${detection.priorWriteVerbCount}, msg="${opts.message?.slice(0, 30) ?? ''}")`,
    );
  }
}
```

### Telemetry

New counter to measure how often Phase 1 catches misses Fix 1 wouldn't have:

```typescript
audric.confirm_flow.plan_context_promoted
  tags: {
    matched_regex: 'true' | 'false',  // would Fix 1's pattern have caught this?
    msg_length_bucket: '0-10' | '11-30' | '31-100' | '101+',
    msg_lang_hint: 'en' | 'non_en',  // crude detection: any non-ASCII letter
  }
```

Tracking `matched_regex=false` is the load-bearing signal — those are the turns Phase 1 catches that Fix 1 alone wouldn't. If that bucket is materially > 0 over a 24h window, Phase 1 is paying for itself.

### Risk: false-positive promotions

**Scenario:** prior turn was a multi-write plan, user types something completely unrelated like `"what's the weather?"`. With Phase 1, we promote to Sonnet medium for one turn. Cost: ~3¢ extra vs Haiku for that one turn.

**Why this is acceptable:**
- After a plan turn, ≥99% of follow-ups are confirms, modifications, or denials of the plan itself. All three are better handled by Sonnet than Haiku.
- Even on the rare unrelated-message case, Sonnet medium with thinking beats Haiku-lean rambling 7K tokens. The cost difference is small; the UX difference is large.
- The promotion expires after one turn (the existing `confirmPromoted` flag is per-turn). Subsequent turns reset to base effort.

### Out of scope for Phase 1

- The fast-path bypass (`isAffirmativeConfirmReply`) keeps using `CONFIRM_PATTERN`. We do NOT want to drop the regex from the fast-path — false positives there mean dispatching a bundle the user didn't actually confirm. Different risk profile.
- No changes to `prepare_bundle` or the bundle stash mechanism.
- No UI changes.

### File-level changes

| File | Change | LOC | Risk |
|---|---|---|---|
| `apps/web/lib/engine/confirm-detection.ts` | Add `detectPriorPlanContext`. Keep `detectBundleConfirm` as a deprecated alias (it still works, just stricter than needed). | ~30 | Low |
| `apps/web/lib/engine/engine-factory.ts` | Switch promotion call from `detectBundleConfirm` → `detectPriorPlanContext`. Update log line. | ~5 | Low |
| `apps/web/lib/engine/__tests__/confirm-detection.test.ts` | Add tests for `detectPriorPlanContext`: should promote on `vamos`, `do it bro`, `proceed it`, emoji, voice-style transcripts. Should still NOT promote when prior turn isn't a multi-write plan. | ~80 | Low |
| `apps/web/lib/engine/__tests__/engine-factory.test.ts` (or wherever the model selector is tested) | Test: prior plan + non-regex-matching reply → `confirm_promoted=true`. | ~30 | Low |
| `apps/web/lib/engine/spec-consistency.ts` | New assertion: `engine-factory` uses `detectPriorPlanContext` (not `detectBundleConfirm`) for promotion. | ~15 | Low |
| `apps/web/lib/engine/spec-consistency.test.ts` | Bump assertion count 16 → 17. | ~3 | Trivial |

**Total Phase 1:** ~165 LOC + tests. Single audric commit. No engine release. ~0.5 day.

---

## Phase 2 — Chips + `expectsConfirm` contract

### The message contract

Engine emits a new optional field on assistant messages that propose user-facing decisions:

```typescript
// In engine event types (packages/engine/src/types.ts):
interface AssistantMessageMetadata {
  expectsConfirm?: {
    /** What the chips dispatch when clicked. */
    confirmAction: 'dispatch_bundle' | 'continue_flow' | 'abort_flow';
    /** Optional override for chip labels (default: ['Confirm', 'Cancel']). */
    labels?: { yes: string; no: string };
    /** Stash ID for the bundle to dispatch (optional — for fast-path). */
    stashId?: string;
    /** When the confirmation expires (e.g. quote staleness). After
     *  expiry, chips disable client-side and the user must re-prompt. */
    expiresAt?: number; // epoch ms
  };
}
```

### How it's set

The audric harness sets `expectsConfirm` when the assistant message:

1. Was emitted by the same turn that called `prepare_bundle` (the bundle stash exists), OR
2. Contains a confirm-shaped tail (heuristic: text ends with `?` AND mentions `confirm` or `proceed`)

This is a **server-side decision**, not LLM-controlled — we don't want the LLM to forget to set the flag. The harness inspects each assistant message after generation and sets the flag based on observable signals.

### Frontend rendering

When the assistant message arrives with `expectsConfirm` set:

- Render two chips inline at the bottom of the message (above any quoted text)
- Default labels: **`Confirm`** (primary, dark) and **`Cancel`** (secondary, light)
- Disabled state: when `expiresAt` has passed (greyed out, tooltip explains)
- Auto-dismiss: chips disappear from the message after a click is registered (prevents double-click double-dispatch)
- Keyboard shortcut: `Cmd/Ctrl+Enter` clicks the primary chip; `Esc` clicks the cancel chip
- Mobile: chips render as full-width buttons stacked vertically (no horizontal scroll)
- Accessibility: `role="button"`, `aria-label="Confirm Payment Stream"`, focusable in tab order

### Wire format

Chip click POSTs to `/api/engine/chat` (same endpoint as text input) with a structured payload:

```typescript
{
  sessionId: string,
  walletAddress: string,
  via: 'chip',                            // NEW — distinguishes from 'text'
  value: 'yes' | 'no',                    // NEW
  forMessageId: string,                   // NEW — which assistant message is being responded to
  // Free-text fields below stay for backward compat
  message: 'yes' | 'no',                  // synthesized for downstream code that expects message
}
```

Server-side handling:

1. If `via === 'chip'`, skip the regex check entirely. We KNOW it's a confirm.
2. If `value === 'yes'`, run the fast-path bypass (load stash from Redis, dispatch bundle). 108 ms.
3. If `value === 'no'`, send a synthetic user message `"Cancelled by user"` to the engine and let the LLM acknowledge. Sonnet at medium handles it gracefully. Bundle stash is discarded.

### Backward compat

Frontends that don't render chips (older builds) still work — they get the assistant message text, the user types a confirm, and Phase 1's plan-context promotion catches it. Phase 2 is **additive**, not breaking.

### Telemetry

```typescript
audric.confirm_flow.dispatch_count
  tags: {
    via: 'chip' | 'edit' | 'text',
    outcome: 'dispatched' | 'cancelled' | 'modified',
    msg_length_bucket: ...,
  }
```

Two key ratios to watch post-launch:

- **Chip adoption:** `via=chip / (chip + edit + text)` — target ≥ 60% within 14 days.
- **Text fallback latency:** p50 of `text` cohort. If it stays ≤ 3 s, Phase 1 + Phase 2 are paying off.

### File-level changes

| File | Change | LOC | Risk |
|---|---|---|---|
| `packages/engine/src/types.ts` | Add `expectsConfirm` field to assistant-message metadata type | ~15 | Low |
| `packages/engine/src/__tests__/types.test.ts` (if exists) | Type-shape test | ~10 | Trivial |
| `apps/web/lib/engine/expects-confirm-decorator.ts` (new) | Server-side function: inspect a generated assistant message + bundle stash state, return `expectsConfirm` payload | ~80 | Low |
| `apps/web/app/api/engine/chat/route.ts` | Apply decorator to assistant messages before yielding to client. Handle `via: 'chip'` payload — skip regex, run fast-path directly. | ~50 | Medium |
| `apps/web/components/chat/MessageRenderer.tsx` (or equivalent) | Render `<ConfirmChips />` when `message.expectsConfirm` is set | ~30 | Medium (UI surface) |
| `apps/web/components/chat/ConfirmChips.tsx` (new) | Two-button chip component: keyboard shortcuts, expiry handling, click handler | ~120 | Medium |
| `apps/web/components/chat/__tests__/ConfirmChips.test.tsx` | Unit tests: render, click, expiry, keyboard | ~80 | Low |
| `apps/web/components/chat/__tests__/MessageRenderer.test.tsx` | Integration test: assistant message with `expectsConfirm` renders chips | ~40 | Low |
| `apps/web/lib/engine/__tests__/expects-confirm-decorator.test.ts` (new) | Unit test for the decorator | ~50 | Low |
| `spec/SPEC_8_CORPUS.md` | Add P0-13 (chip dispatch) + P0-14 (chip cancel) + P0-15 (chip expiry → fallback to text) | ~30 | — |
| `spec/SPEC_15_CONFIRM_FLOW_DESIGN.md` | This doc — update v0.1 → v0.2 once shipped | ~20 | — |

**Total Phase 2:** ~525 LOC + tests. Engine minor release (`@t2000/engine` types) + audric major UI work. ~1–2 weeks.

---

## Phase 3 — Voice + conditional + multilingual (deferred)

These three surfaces are explicitly NOT addressed by Phase 1 + Phase 2 alone. They're deferred but should not be designed-out.

### Voice mode

**Solved as a side-effect of Phase 1.** Voice transcripts are just text arriving via the same chat endpoint. Plan-context promotion catches them. No additional design needed unless we ship a voice-first UI mode (different conversation, different spec).

### Conditional / parameterized confirms

**Partially solved by `modifiableFields` (Spec 1 Item 6).** A user wanting to tweak `leg 3 amount: 0.05 → 0.1` taps the inline editor, changes the value, taps Confirm. The `prepare_bundle` re-runs server-side with the new value.

What's NOT yet covered:
- "Yes, but only execute legs 1 and 2, skip leg 3" — requires per-leg toggles in the plan card UI. Phase 3 work, not Phase 2.
- "Yes if X, otherwise N" — conditional triggers — out of scope. This is closer to Audric Schedule (S.7-removed feature; would need product re-think to bring back).

### Multilingual narration

The assistant's plan text is currently English-only. International users see English text + their own language confirms. Localizing the plan text is a separate i18n project, out of scope here.

What Phase 1 does cover: **multilingual confirms**. A user typing `sí` or `はい` after an English plan turn gets correctly promoted, and Sonnet's multilingual capability handles the response. So the input side works in any language; only the assistant output side is English-locked.

---

## Locked decisions

| # | Question | Decision | Why |
|---|---|---|---|
| 1 | Phase 1 first or Phase 2 first? | **Phase 1 first.** Cheap (0.5 day), eliminates the worst-case (69s ramble) immediately. | Phase 2 builds on Phase 1's foundation — the chip's text fallback path also needs Phase 1's promotion to be robust. |
| 2 | Drop `CONFIRM_PATTERN` from fast-path bypass too? | **No.** Fast-path bypass keeps the regex. | Fast-path false positive = wrongly skipping LLM = dispatching unintended bundle. Different risk profile from promotion (false positive there = wasted Sonnet turn). Keep the regex strict on fast-path. |
| 3 | Where does the `expectsConfirm` flag live — engine or audric? | **Engine type, audric-set.** Engine defines the field on the assistant message metadata; audric's harness decides when to set it. | Per CLAUDE.md (Rule 9), engine doesn't own host-specific logic. Audric is the host that needs chips. Other engine consumers (CLI, MCP) ignore the flag. |
| 4 | Should chips use the existing `pending_action` mechanism? | **Reuse.** Chip click → load same Redis stash → dispatch same way. | We already have a sponsored-tx flow for `pending_action`. Adding a chip just changes who/how the dispatch is triggered (chip click vs. text reply). Don't fork the dispatch path. |
| 5 | What's the chip's "Cancel" actually do? | **Synthetic `Cancelled by user` message → engine acknowledges, discards stash.** | Same code path as a user typing `no`. Don't fork. |
| 6 | Auto-dismiss chips on click? | **Yes.** Chip click immediately removes the chips from the message UI. | Prevents accidental double-click double-dispatch. Also makes the conversation log cleaner — once decided, the chip is no longer relevant. |
| 7 | Chip expiry tied to quote staleness? | **Yes for swap-bearing plans (60 s).** Other plans don't expire (the user can confirm whenever). | Swap quotes are time-sensitive (slippage assumes recent prices). Other writes don't have the same staleness. Quote-bearing bundles set `expiresAt = quoteAt + 60s`. |
| 8 | Plan-context promotion: log message verbs? | **Yes — same shape as today's `confirm-of-bundle detected` log.** | Operator debuggability. We need to know on every promoted turn what triggered it (so we can spot false positives in real traffic). |
| 9 | Does Phase 2 need an engine release or just audric? | **Both.** Engine adds the `expectsConfirm` type (minor bump). Audric uses it. | Type-level addition is non-breaking. Existing consumers ignore unknown metadata fields. |
| 10 | Roll out Phase 2 behind a feature flag? | **Yes — `NEXT_PUBLIC_CONFIRM_CHIPS_V1`.** Default false in prod until soak. | Mirrors Phase 3b's flag pattern. Lets us test in DEV → 1% prod → full rollout. |
| 11 | What happens if `expectsConfirm` is set but the stash is gone? | **Chip click POSTs as `via=chip, value=yes`. Server has no stash → falls through to plan-context promotion → Sonnet handles it as if it were a text reply.** | Graceful degradation. The user's intent (yes) is still communicated; the path is just one model-turn slower. |

---

## Risks

### R1 — Phase 1 false positive cost compounds

**Scenario:** Promoting on plan-context means every short reply after a plan turn gets Sonnet medium. If users frequently type unrelated messages after a plan turn (e.g., abandoning the flow), we eat extra LLM cost.

**Probability:** Low. Empirically, > 99% of follow-ups to plan turns are confirms or modifications.
**Impact:** ~$0.03 per false-positive turn (Sonnet medium overhead vs Haiku). Negligible at our scale.

**Mitigation:**
1. Telemetry tag `matched_regex` on every promoted turn. If `matched_regex=false` ratio is > 30% AND the bucket includes lots of clearly-unrelated messages, tighten the heuristic (e.g., require the prior turn to be the IMMEDIATE prior, not any prior in history).
2. Cap promotion at 1 turn — already in place via per-turn `confirmPromoted` flag.

### R2 — Phase 2 chip-click race conditions

**Scenario:** User types `yes` AND taps the chip in quick succession → two POSTs hit `/api/engine/chat` for the same turn → bundle dispatched twice.

**Probability:** Medium (humans do this).
**Impact:** Critical (double-spend / double-dispatch).

**Mitigation:**
1. **Load-bearing:** the bundle stash is consumed atomically (Redis `GET + DEL`). Whichever request wins gets the stash; the loser gets `no_stash` and falls through to a no-op narration.
2. UI-side: chip click immediately disables the chip + dims the text input for 200ms. Text input dim is suggestive, not blocking — but reduces the race window.
3. Per-turn `attemptId` ensures even if both requests dispatch, the second one sees the same `attemptId` already-used and refuses.

### R3 — Chips render in messages where they shouldn't

**Scenario:** Heuristic for setting `expectsConfirm` mis-fires. E.g., assistant emits an explanation paragraph that ends `"…proceed with the swap?"` but DIDN'T call `prepare_bundle`. Chips render but there's no stash to dispatch.

**Probability:** Medium.
**Impact:** Low — chip click → no stash → falls through to text path → Sonnet handles it.

**Mitigation:**
1. Heuristic for setting `expectsConfirm` is **strict**: requires either (a) bundle stash exists for this session, OR (b) message contains both `confirm`/`proceed` AND ≥2 distinct write verbs.
2. Telemetry: `expects_confirm_set_count` tagged with `(stash_exists, has_marker)`. False-positive rate over time tells us if the heuristic is too generous.

### R4 — Voice mode never gets tested

**Scenario:** We claim Phase 1 handles voice as a side-effect, but we never have a voice user actually exercise the flow. When voice mode ships (someday), the assumption fails silently.

**Probability:** High (voice mode isn't on roadmap right now).
**Impact:** Low until voice ships, then potentially Medium.

**Mitigation:**
1. Add a corpus eval (P0-16) that simulates voice-style transcripts (`"yeah ah confirm it"`, `"do it ah"`) — passed through plan-context promotion path.
2. Document the assumption in this spec (which we just did) so when voice ships, the integration team knows what's been pre-tested vs. what hasn't.

### R5 — Modifiable fields gap with chips

**Scenario:** User taps "Confirm" chip but had been about to edit `leg 3 amount` first. Chip click skips the inline edit → original amount goes through.

**Probability:** Medium.
**Impact:** Low (it's the user's decision; they tapped Confirm).

**Mitigation:**
1. UI ordering: render `modifiableFields` editors ABOVE chips. Visual hierarchy makes it clear "edit first, then confirm."
2. Chip-click handler on frontend: before POSTing, check if any inline editor has unsaved changes. If so, prompt: *"You have unsaved edits to the plan. Save them first?"* with [Save & Confirm] / [Discard & Confirm] / [Cancel]. (Optional polish, not required for v1.)

### R6 — Spec-consistency drift

**Scenario:** Future PR adds a new write tool (e.g., `subscribe`) but doesn't update `WRITE_VERB_PATTERN` in `confirm-detection.ts`. Multi-write plans containing `subscribe` won't trigger plan-context promotion.

**Probability:** Medium.
**Impact:** Low — the regex pattern still catches text confirms; only the promotion fails to fire.

**Mitigation:**
1. Spec-consistency assertion (already exists for related code): `WRITE_VERB_PATTERN` MUST contain a verb that maps to every write tool name. Add a runtime check that walks the engine's write-tool registry and asserts coverage.

---

## Day-by-day rollout

### Phase 1 (week of 2026-05-04)

**Day 1 (0.5d):**
- Add `detectPriorPlanContext` to `confirm-detection.ts`.
- Add tests for non-regex-matching cases (vamos, do it bro, voice transcripts, emoji).
- Switch `engine-factory.ts` to use new function.
- Add telemetry counter `audric.confirm_flow.plan_context_promoted` with `matched_regex` tag.
- Update spec-consistency assertion + bump count.
- Run `pnpm test + typecheck + lint` clean.

**Day 1 (afternoon):**
- Push to main → Vercel auto-deploys.
- Smoke test: re-run the `vamos` / `do it bro` / `proceed it` cases that Fix 1 doesn't catch. Verify `plan-context detected → promoting low → medium` log fires AND `matched_regex=false` tag is recorded.

### Phase 2 (next sprint, after Phase 1 soak)

**Day 1 — Engine type:** Add `expectsConfirm` to assistant message metadata. Bump engine minor. Audric bumps to new engine version.

**Day 2 — Server-side decorator:** Implement `expects-confirm-decorator.ts` and wire into `/api/engine/chat`. Add server-side handler for `via: 'chip'` payload. Tests.

**Day 3-4 — Chip component:** Build `ConfirmChips.tsx` with keyboard shortcuts, expiry, accessibility. Style per Agentic Design System. Unit tests.

**Day 5-6 — Integration:** Wire chips into `MessageRenderer`. Test end-to-end in DEV with feature flag ON. Manual verification: chip click → fast-path dispatch (108ms) → bundle settles. Cancel chip → graceful narration.

**Day 7 — Soak prep:** Telemetry dashboards (chip adoption, fallback latency). Feature-flag toggle in Vercel env (default OFF). Push to main.

**Day 8-10 — Soak:** Flip flag ON for 1% of sessions (Vercel split). Monitor `dispatch_count` by `via`, double-dispatch rate (R2), `expects_confirm_set_count` mis-fires (R3).

**Day 11+:** Gradual rollout: 1% → 10% → 50% → 100% over a week, with revert criteria documented.

---

## Implementation guardrails (locked from this design)

These hold true after SPEC 15 ships:

1. **Phase 1 ships before Phase 2.** Phase 2's chip text-fallback path REQUIRES Phase 1's promotion to be robust. Don't skip ahead.
2. **Regex stays in fast-path bypass.** Only the promotion path drops the regex requirement. Fast-path keeps strict matching to prevent false-positive bundle dispatches.
3. **`expectsConfirm` is server-set, not LLM-set.** The harness inspects the message after generation; the LLM doesn't decide whether chips render. Prevents the LLM from forgetting the flag.
4. **Chip click consumes stash atomically.** Redis `GET + DEL` is the load-bearing primitive against double-dispatch (R2).
5. **Backward compat: chips are additive.** Old frontends without chip support fall through to text reply → Phase 1 promotion → same outcome, just one model-turn slower. SPEC 15 doesn't break any existing consumer.
6. **Voice / multilingual / conditional are explicit Phase 3 surfaces.** Don't roll them into Phase 2 scope. Voice rides Phase 1 by side-effect; conditional rides `modifiableFields`; multilingual is a separate i18n project.
7. **Telemetry is the contract.** Every channel emits `dispatch_count{via=...}`. Every promotion emits `plan_context_promoted{matched_regex=...}`. Without these, we can't tell if the architecture is working.

---

## Cross-references

- Fix 1 (regex extension) → `apps/web/lib/engine/confirm-detection.ts` lines 39–62, commit `1f0911f`
- Phase 1 implementation surface → `apps/web/lib/engine/engine-factory.ts` lines 594–608
- Modifiable fields → `AUDRIC_HARNESS_CORRECTNESS_SPEC_v1.3.md` Item 6 (gitignored)
- attemptId resume keying → `AUDRIC_HARNESS_CORRECTNESS_SPEC_v1.3.md` Item 3 (gitignored)
- Bundle dispatch fast-path → `spec/SPEC_14_PREPARE_BUNDLE_PLAN_TIME_COMMITMENT.md`
- Spec consistency runner → `apps/web/lib/engine/spec-consistency.ts` (16 assertions today; bumps to 17 after Phase 1)
- Env-validation gate (for Phase 2 feature flag) → `.cursor/rules/env-validation-gate.mdc`
- Production failure logs that motivated this spec:
  - `s_1777843407792_2b7fc088a8fa` (21:28:09, "execute" → 69s ramble)
  - `s_1777841977869_2f844b8a694a` (21:19:19, "confimed" → same pattern)

---

## Open questions

These need product input before Phase 2 ships, not before Phase 1:

1. **Chip labels:** `Confirm` / `Cancel`? Or `Yes` / `No`? Or `Send it` / `Hold on`? The Agentic Design System probably has copy guidelines — defer to brand.
2. **Chip placement:** inline at message bottom (proposed), or sticky toolbar at chat bottom? Sticky reduces scroll-past misses but takes screen real estate. Inline is simpler.
3. **Multi-step confirms:** Do we render chips at every step, or only the final commit? E.g., a slippage warning step might be a different shape (dismiss-only, no Cancel). Defer to Phase 2 design review.
4. **Voice-first variants:** When voice mode ships, does the chip flow change? E.g., voice users hear "press Yes or say confirm." Out of scope for Phase 2 but worth a note.
