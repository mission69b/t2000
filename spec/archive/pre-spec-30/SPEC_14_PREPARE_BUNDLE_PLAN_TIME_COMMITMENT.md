# Spec 14: `prepare_bundle` — plan-time bundle commitment

*Version 0.2 — Decisions locked · May 3 2026 (evening) · Internal · **local-only, gitignored***
*Status: APPROVED. All five open questions resolved with author recommendations. Ready for Phase 1 implementation.*
*Author: Drafted during the May 3 root-cause review pass after `1.14.3` (the confirm-of-bundle override block) was identified by the user as a band-aid.*

**Trigger:** Across the SPEC 7 P2.7 / SPEC 13 Phase 2 soaks, four consecutive "fixes" all targeted the same symptom — Sonnet (or Haiku) splitting a confirmed multi-write Payment Stream into solo writes during the confirm turn:

| Iteration | Layer | Fix shape | Outcome |
|---|---|---|---|
| 1.14.1 | host | Detect `confirm-of-bundle` from regex over the prior text turn, promote `low → medium` | Got Haiku off the confirm turn. Sonnet still occasionally split. |
| 1.14.2 | host | Broaden the detector marker (`/\bconfirm\b/i` → `/\b(confirm\|proceed)\b/i`) + tighten `update_todo` rule in static prompt | 2-op flows passed. 3-op flows still split on confirm. |
| 1.14.3 | host | Append a STRICT `[CONFIRM-OF-BUNDLE TURN — STRICT OVERRIDE]` system block on `confirm_promoted=true` turns | Reverted (`faa4ba5`). Caller called it a band-aid; correctly. |
| 1.14.x | host | … (would have been the next prompt-engineering attempt) | — |

Each iteration was a tighter prompt. None addressed the load-bearing bug: **the bundle invariant is decided at LLM emission time from parallel `tool_use` blocks, not at plan time from a structured artifact.** The LLM's emission timing is non-deterministic; coercing it via prompt rules is structurally fragile.

This spec replaces the symptom-chasing path with a structural fix. The bundle commits at PLAN time as a typed tool call (`prepare_bundle`), is persisted in Redis with a 60s TTL, and on user confirmation is yielded through SSE WITHOUT round-tripping the LLM. The LLM's confirm-turn behavior becomes irrelevant by construction.

**Engine version target:** unchanged (no engine bump required — host-only).
**SDK version target:** unchanged.
**Audric version target:** `audric/web` patch (no @t2000/engine dependency change).
**Backward compat (locked):** Legacy path — LLM emits parallel writes in the confirm turn and the engine bundles them — stays operational. `prepare_bundle` is opt-in via a new tool the LLM can choose to call. If the LLM doesn't call it, nothing changes.

---

## Revision log

| Version | Date | Changes |
|---|---|---|
| 0.2 | 2026-05-03 (evening) | All five open questions resolved with author recommendations: (1) tool name = `prepare_bundle`; (2) stash TTL = 60s; (3) second-proposal semantics = overwrite; (4) scope = N≥2 writes only (single writes use the existing direct path); (5) Phase 3 retirement gate = metric-based (≥100 successful `audric.bundle.fast_path_dispatched` AND zero `audric.bundle.fast_path_skipped reason=...` due to LLM-side bugs). Spec is decision-ready; Phase 1 implementation can start. |
| 0.1 | 2026-05-03 | Initial draft. Triggered by user pushback on `1.14.3` ("not a band-aid solution"). Captures the architectural failure mode of `1.14.0 → 1.14.3`, proposes the host-side `prepare_bundle` tool + Redis stash + chat-route bypass, lays out the test corpus + retirement plan for `1.14.1` / `1.14.2`. |

---

## TL;DR

`prepare_bundle({ steps })` is a new audric-host tool. The LLM calls it ONCE during the plan turn for any multi-write Payment Stream. The tool runs preflight + guards + adjacency-whitelist validation, persists the typed steps in Redis at `bundle:proposal:{sessionId}` with a 60-second TTL, and returns `{ bundleId, summary }`. The LLM writes its plan text and asks the user to confirm.

When the user replies affirmatively, the audric chat route (`/api/engine/chat`) checks Redis FIRST. If a fresh `prepare_bundle` proposal exists for this session AND the user's message matches the existing affirmative-confirmation pattern, the route synthesises a `pending_action_bundle` SSE event directly from the stashed steps and ends the stream. **The engine is NEVER called for that turn.** The user gets the bundle confirm card in ~50ms instead of waiting for an LLM round-trip.

If no fresh proposal exists, the route falls through to the existing `engine.submitMessage(...)` path. Single writes, plain Q&A, balance reads, and any flow where the LLM didn't pre-commit a bundle still work exactly as today.

This decouples the bundle invariant from the LLM's emission timing. The LLM only needs to plan correctly ONCE — in the plan turn, with a typed tool call. The confirm turn is deterministic.

---

## What this spec does NOT touch

- **`@t2000/engine`.** No engine code changes. `prepare_bundle` is a host-side tool registered via the existing `tools` array.
- **`@t2000/sdk`.** No SDK changes. The stashed `steps` use the existing `WriteStep` shape (post-SPEC 13 Phase 2: `{ toolName, input, inputCoinFromStep? }`).
- **Single-write flows.** A user saying "save 10 USDC" still goes through the LLM's `tool_use` for `save_deposit`. `prepare_bundle` is for N≥2 atomic flows only.
- **Plain Q&A and read flows.** No change.
- **The legacy parallel-`tool_use` bundle path.** Stays operational as the fallback. `prepare_bundle` is the preferred path; the legacy path is the safety net.
- **`@cetusprotocol` / NAVI / Volo SDK builders.** Unchanged.
- **Sponsored-tx flow (`/api/transactions/prepare` / `/api/transactions/execute`).** Unchanged. The bundle still goes through the same execution path; only the COMMITMENT moment moves from confirm-turn-emission to plan-turn-tool-call.
- **SPEC 13 (PTB chaining) work — Phase 0/1/2 already shipped.** SPEC 14 is orthogonal. Once the proposal is yielded, SPEC 13's `inputCoinFromStep` chaining handles the on-chain composition. SPEC 14 just changes WHEN the chain is committed (plan time vs confirm time).

---

## The architectural problem (current state)

### The bundle invariant lives in three places at once

1. **The user's intent.** "Withdraw 3 USDC, swap to USDsui, then save it" — clear, unambiguous, structured in the user's head.
2. **The LLM's plan turn.** The LLM emits text describing the 3 ops and asks "Shall I proceed?". It MAY also emit `update_todo` or `swap_quote` depending on complexity.
3. **The LLM's confirm turn.** When the user says "Yes", the LLM is supposed to emit ALL writes as parallel `tool_use` blocks in its FIRST assistant message. The engine's `compose-bundle.ts` then fuses them into a single PTB.

Steps 1→2 work fine. Step 3 is the failure point. **The bundle invariant becomes load-bearing on LLM emission timing**, which is non-deterministic.

### The exact failure mode (verified, 1.14.2 soak, May 3 2026)

3-op prompt: `Withdraw 3 USDC, swap to USDsui, then save it`.

Plan turn (Sonnet) — *correct*:
- `[5] thinking + update_todo([...4 items...])`
- `[7] swap_quote(...)`
- `[9] thinking + update_todo([... mark quote ✓ ...])`
- `[11] text("Quote: 3 USDC → 2.998 USDsui ... Shall I proceed?")`

Confirm turn (Sonnet, post-1.14.2 promotion to medium) — *broken*:
- `[13] thinking + update_todo([... mark withdraw → in_progress ...])`  ← **alone**
- `[14] tool_result`
- → engine sees `guardPassedWrites.length === 0` → no bundle, continues loop
- `[15] withdraw(...)` ← **alone, in next iteration**
- → engine sees `guardPassedWrites.length === 1` → `pending_action_single` → bundle is dead
- ... user gets 3 separate confirm cards instead of one atomic Payment Stream

The LLM is mimicking the cadence it established during the plan turn (`update_todo → tool → update_todo → tool`). The cadence is fine for plan turns (it makes the UX nicer). It is fatal on confirm turns.

### Why the prompt-engineering path fails structurally

`packages/engine/src/engine.ts:1567-1660` decides bundling reactively:

```ts
if (guardPassedWrites.length >= 2 && allBundleable) {
  // → bundle
} else {
  // → pending_action_single (or zero)
}
```

`guardPassedWrites` is the writes from ONE assistant message. There is no way for the engine to fuse writes from MULTIPLE assistant messages — once it sees a single write with no siblings, it must yield `pending_action_single` and pause. After the user confirms that one write, it executes, and the LLM gets a NEW turn to emit the next write, which is again solo, and the cycle repeats.

The engine's design assumes the LLM emits all parallel writes in one message. We've spent four iterations trying to make the LLM honor that assumption via prompt. **The assumption itself is the bug.**

### What "fix at the root" looks like

The user's plan IS structured. It exists at the moment the LLM finishes the plan turn ("Withdraw 3 USDC, swap, save"). We're throwing that structure away and asking the LLM to re-derive it from its own text on a future turn.

The fix is to capture the structure when it's first known — during the plan turn, as a typed tool call — and use it directly to build the bundle when the user confirms. The LLM never has to re-emit it.

This is the standard pattern for production agents: PLAN as structured artifact, CONFIRM as deterministic execution of the artifact. (See: claude-code's tool-use plan mode, LangChain's structured-output planning, etc.)

---

## The contract

### `prepare_bundle` tool shape

```ts
// audric/apps/web/lib/engine/prepare-bundle-tool.ts (NEW)

import type { WriteStep } from '@t2000/sdk';

interface PrepareBundleInput {
  steps: WriteStep[];        // 2 ≤ steps.length ≤ MAX_BUNDLE_OPS (3 today)
  reason?: string;            // optional user-facing rationale (≤ 200 chars)
}

interface PrepareBundleOutput {
  ok: true;
  bundleId: string;           // UUID v4. Returned to the LLM. Stashed in Redis.
  summary: string;            // 1-line human-readable summary of the bundle
  expiresAt: number;          // unix ms — 60s from now
  validatedChain: boolean;    // true if every (i, i+1) pair is whitelisted
} | {
  ok: false;
  reason: 'preflight_failed' | 'guard_blocked' | 'pair_not_whitelisted' | 'too_many_steps' | 'asset_mismatch';
  details: string;             // full diagnostic for the LLM to re-plan
}
```

The tool is registered with `permission: 'auto'` (read-tier — it has no on-chain side-effect; it just validates and stashes). The LLM can call it freely without a confirm gate.

### Redis stash schema

```
KEY:    bundle:proposal:{sessionId}
VALUE:  JSON {
  bundleId,
  steps: WriteStep[],
  validatedAt: number,      // unix ms
  walletAddress: string,    // sanity-check at confirm time
  summary: string,
  reason?: string,
}
TTL:    60s
```

One proposal per session at a time. A second `prepare_bundle` call within the TTL OVERWRITES the prior one (the LLM may re-quote, and the most recent proposal wins).

### Chat-route bypass logic

```ts
// audric/apps/web/app/api/engine/chat/route.ts (NEW BRANCH at the top of the
// stream-build closure, BEFORE engine.submitMessage(...))

const stash = await readBundleProposal(sessionId);     // GET bundle:proposal:{sessionId}
const isConfirm = matchAffirmativeShortReply(trimmedMessage);   // existing CONFIRM_PATTERN

if (stash && isConfirm && stash.expiresAt > Date.now() && stash.walletAddress === walletAddress) {
  // FAST PATH: yield pending_action_bundle directly. Skip the LLM.
  await deleteBundleProposal(sessionId);              // consume the stash atomically
  const action = composeBundleFromStashedSteps(stash);  // existing helpers, just from stash not LLM
  controller.enqueue(encoder.encode(serializeSSE({ type: 'pending_action', action })));
  controller.enqueue(encoder.encode(serializeSSE({ type: 'turn_complete', stopReason: 'pending_action' })));
  controller.close();
  recordMetric('audric.bundle.fast_path_dispatched', { stepCount: stash.steps.length });
  return;
}

// SLOW PATH (legacy): no fresh proposal, fall through to engine.submitMessage(...)
```

Critical detail: the stash is **consumed** (deleted) on dispatch. If the user re-confirms (e.g., presses "Yes" twice), the second confirmation falls through to the legacy path where the LLM responds with "I already executed that — anything else?".

### Plan-turn LLM directive

The static system prompt grows ONE rule (must fit inside the 10,200-token ceiling — current usage 10,197 / 3 tokens headroom):

```
Multi-write Payment Streams (N≥2 writes): in your PLAN turn, call `prepare_bundle({ steps: [...] })` ONCE
with the full typed plan, then write your text plan and ask "Shall I proceed?". Do NOT emit the writes
themselves in the plan turn or in the confirm turn — `prepare_bundle` is the commitment, the user's
confirmation is the execution trigger.
```

That's ~360 chars / ~90 tokens. Static prompt currently has 14 chars of headroom. To fit, we either:
- Compress 350 chars elsewhere (likely targets: trim verbose `update_todo` example list, drop redundant invariants section)
- OR move this rule into the dynamic block (which is uncached but cost-acceptable since it adds ~90 tokens per turn)

**Decision (locked at draft time):** put the new rule in the **dynamic** block. It's only relevant when there's an active session that might multi-write. Cache cost stays the same; the marginal ~90 tokens per turn cost ~$0.000045 per turn at Sonnet rates. Cheap.

(If we want to retire `confirm-detection.ts` + the override block + the engine-factory promotion logic — see § Retirement plan — we get the budget back, and then some.)

---

## Implementation surface

### New files (audric/apps/web)

| File | Purpose | LOC estimate |
|---|---|---|
| `lib/engine/prepare-bundle-tool.ts` | Tool definition (input schema, validator, Redis writer) | ~120 |
| `lib/engine/bundle-proposal-store.ts` | Redis CRUD: read / write / delete / TTL | ~60 |
| `lib/engine/__tests__/prepare-bundle-tool.test.ts` | Unit tests for validator | ~150 |
| `lib/engine/__tests__/bundle-proposal-store.test.ts` | Unit tests against in-memory Redis mock | ~80 |
| `app/api/engine/chat/__tests__/bundle-fast-path.test.ts` | Integration test: stash + confirm → bundle SSE event, no LLM | ~120 |

### Modified files (audric/apps/web)

| File | Change | LOC delta |
|---|---|---|
| `app/api/engine/chat/route.ts` | Add fast-path branch before `engine.submitMessage(...)` | +40 |
| `lib/engine/engine-factory.ts` | Register `prepare_bundle` in tools list | +5 |
| `lib/engine/engine-context.ts` | Add the plan-turn directive to the dynamic block builder | +15 |
| `lib/engine/buildDynamicBlock` location (find from the codebase) | Inject the rule conditionally (only when session has writes enabled) | +8 |

### NO changes to

- `@t2000/engine` (no engine bump)
- `@t2000/sdk` (no SDK bump)
- `@t2000/cli` / `@t2000/mcp` (not affected)
- `audric/.cursor/rules` (existing rules cover this — nothing new to enforce)

### Package version change

- Audric: regular Vercel deploy. No npm bump.

---

## Phased rollout

### Phase 0 — Preconditions (DONE before this spec lands)

- [x] Revert `1.14.3` (the override block). `faa4ba5` on `audric:main`.
- [x] Verify `1.14.1 / 1.14.2` (detector + prompt rule) still operational. They reduce friction on the legacy path; we keep them running until SPEC 14 ships, then retire them together.

### Phase 1 — `prepare_bundle` tool + Redis stash (no UI hookup)

Goal: tool can be called, validates correctly, stashes in Redis. Engine can read the stash but doesn't yet bypass.

1. Define `PrepareBundleInput` / `PrepareBundleOutput` types in `prepare-bundle-tool.ts`.
2. Implement validator: per-step preflight, adjacency-whitelist, asset alignment (re-uses `compose-bundle.ts` helpers from `@t2000/engine`).
3. Implement Redis CRUD in `bundle-proposal-store.ts`. Key format documented above. Use the existing Upstash client (`upstash-conversation-state-store.ts` is the precedent).
4. Register the tool in `engine-factory.ts`. Permission tier: `auto`.
5. Unit tests for validator + store. **No production traffic exercises this yet.**

**Success criteria (Phase 1 done):**
- Validator unit tests cover every failure path (`preflight_failed`, `guard_blocked`, `pair_not_whitelisted`, `too_many_steps`, `asset_mismatch`).
- Store unit tests cover read / write / delete / TTL.
- `prepare_bundle` returns `ok: true` with a `bundleId` for a valid 3-op chain (`withdraw → swap → save`).
- `prepare_bundle` returns `ok: false` with the right `reason` for every invalid input class.

### Phase 2 — Chat-route fast path

Goal: when the LLM has stashed a proposal AND the user confirms, the chat route yields the bundle without calling the engine.

1. Add `bundle-proposal-store` import to chat route.
2. Add the fast-path branch at the top of the stream-build closure.
3. Wire `composeBundleFromStashedSteps` (small wrapper around `composeBundleFromToolResults` from `@t2000/engine`).
4. Atomic stash consumption (Redis `GETDEL` if available, else `GET` then `DEL` with idempotent semantics).
5. Telemetry: emit `audric.bundle.fast_path_dispatched`, `audric.bundle.fast_path_skipped` (with reason: `no_stash`, `expired`, `not_confirm`, `wallet_mismatch`).
6. Integration tests: stash + confirm → SSE bundle event, no Anthropic call (mock the provider, assert it wasn't invoked).

**Success criteria (Phase 2 done):**
- 3-op confirm flow (`Withdraw 3 USDC, swap to USDsui, then save it` + `Yes`) produces:
  - `audric.bundle.fast_path_dispatched stepCount=3` in Vercel logs
  - `engine.bundle_chain_mode_set` fires twice (still — chain mode runs at compose time, just from stash not from LLM tool_use)
  - Single `pending_action_bundle` event on the stream
  - Zero Anthropic API calls for the confirm turn (cost telemetry shows 0 input tokens)
  - One on-chain tx digest, three execution rows

### Phase 3 — Retire prompt scaffolding

Once Phase 2 is in production for ≥1 week with zero `audric.bundle.fast_path_skipped` due to LLM-side bugs:

1. Delete `audric/apps/web/lib/engine/confirm-detection.ts` + tests.
2. Delete the `confirm_promoted` branch in `engine-factory.ts` (the `1.14.1` promotion logic).
3. Delete the `update_todo` "NEVER between bundled writes" clause from `engine-context.ts` (the `1.14.2` rule). The new plan-turn directive covers it.
4. Delete the comment block referencing `1.14.0 → 1.14.3` in `engine-factory.ts`. Replace with a single line pointing to SPEC 14.
5. Update `audric-build-tracker.md` with retirement entry.

This is the cleanup that makes "fix at the root" a real reduction, not just a re-layering.

---

## Test corpus

Every entry below is a soak prompt with the exact expected behavior. Run after Phase 2 ships.

| ID | Prompt | Plan turn behavior | Confirm turn behavior | Pass criteria |
|---|---|---|---|---|
| S14-1 | `Withdraw 3 USDC and send 1 USDC to funkii.sui` | LLM calls `prepare_bundle({ steps: [withdraw, send_transfer] })`, writes 1-line plan, asks "Shall I proceed?" | Fast-path bypass: `audric.bundle.fast_path_dispatched stepCount=2` | One tx digest. Bundle confirm card shows 2 ops. No Anthropic call on confirm turn. |
| S14-2 | `Withdraw 3 USDC, swap to USDsui, then save it` | LLM calls `swap_quote`, then `prepare_bundle({ steps: [withdraw, swap_execute, save_deposit] with inputCoinFromStep })`, asks confirm | Fast-path: stepCount=3, `engine.bundle_chain_mode_set` fires twice | One tx digest. Three execution rows. Zero Anthropic input tokens on confirm turn. |
| S14-3 | `Save 10 USDC` (single write) | LLM emits `save_deposit` directly (does NOT call `prepare_bundle` — single write) | Legacy path: `pending_action_single` | Backward compat preserved. |
| S14-4 | `Whats my balance?` (read) | LLM emits `balance_check` directly | Legacy path: turn_complete | No regression. |
| S14-5 | Confirm message arrives 65s after plan turn (TTL expired) | Same as S14-2 plan turn | Fast-path skipped (`audric.bundle.fast_path_skipped reason=expired`), legacy path runs, LLM re-emits writes. May or may not bundle correctly. | This is the fallback path. We expect it to work, but if it breaks, the user can retry within the TTL. |
| S14-6 | LLM calls `prepare_bundle` with non-whitelisted pair (`borrow → swap`) | Tool returns `{ ok: false, reason: 'pair_not_whitelisted' }`. LLM re-plans sequentially. | N/A | Validation at plan time prevents bad bundles from being stashed. |
| S14-7 | LLM calls `prepare_bundle` with 4 steps (cap is 3) | Tool returns `{ ok: false, reason: 'too_many_steps' }`. LLM splits. | N/A | Cap enforcement at plan time. |
| S14-8 | User confirms, then within 60s sends a new multi-write request (e.g. `Actually swap 5 USDC instead`) | New `prepare_bundle` call OVERWRITES prior stash. | Fast-path uses the most recent stash. | One stash slot per session — no leak. |
| S14-9 | Two browser tabs, same session, both confirm at the same time | First confirm consumes the stash (atomic delete). Second confirm sees no stash. | Tab 1: fast-path. Tab 2: legacy path → "I already executed that". | No double-execution. |
| S14-10 | LLM tries to call `prepare_bundle` outside a write context (e.g. mid-conversation about balances) | Tool validates and stashes. No harm — the stash expires. | If user later confirms an unrelated write, the stash is unrelated → bypass should NOT trigger. | Confirm message must contain the affirmative pattern AND there must be a fresh stash. Both conditions required. |

---

## Risk + rollback

### Risks

1. **Stash inconsistency between LLM-time and execute-time prices.** The Cetus quote at plan time may differ from the rate at execute time (30-60s gap). **Mitigation:** the existing `/api/transactions/prepare/route.ts` already re-quotes Cetus at execute time. This is independent of `prepare_bundle`. SPEC 14 doesn't introduce new staleness.
2. **LLM calls `prepare_bundle` with a malformed `steps[]`.** **Mitigation:** the tool validates every step at plan time (preflight + guards + adjacency + asset alignment). Failure modes return `ok: false` with a structured `reason` and full `details` so the LLM can re-plan correctly.
3. **Redis unavailability.** **Mitigation:** `bundle-proposal-store` returns `null` on read errors (treat as "no stash", fall through to legacy path) and logs a structured error. No bundle execution depends on Redis being healthy — the legacy path stays available.
4. **LLM doesn't call `prepare_bundle` (e.g. for a Haiku-routed multi-write turn).** **Mitigation:** legacy path remains operational. Worst case, we get the same `1.14.0 → 1.14.2` behavior we have today (with the same bugs `1.14.1`/`1.14.2` mitigate). No regression.
5. **User confirms across two tabs / two devices, both fast-paths fire on the same stash.** **Mitigation:** Redis `GETDEL` (atomic). Only one tab wins. Other tab gets legacy path → LLM responds "I already executed that".
6. **Spec creep — new tool added on top of an aging architecture.** **Mitigation:** Phase 3 retirement is part of the plan. We delete `confirm-detection.ts` + the override + the engine-factory promotion logic when SPEC 14 is stable. Net code volume goes DOWN, not up.

### Rollback

- **Phase 1:** Tool is registered but unused. Rollback = remove tool registration. ~5 LOC revert. No user-visible effect.
- **Phase 2:** Fast-path branch is gated behind `if (stash && isConfirm && ...)`. Rollback = remove the branch. Legacy path resumes; everything keeps working as today.
- **Phase 3:** Retirement is a follow-up, gated on Phase 2 stability. If Phase 3 breaks something, we re-add the deleted files from git history.

Each phase is independently revertable.

---

## SPEC 13 + SPEC 14 sequencing (PTB work wrap-up)

The two specs are orthogonal but composed:

| Layer | Spec | Status |
|---|---|---|
| SDK / engine: "execute a bundle atomically with chained coin handoff" | SPEC 13 Phase 0-2 | ✓ shipped (1.12.0 / 1.13.0 / 1.13.1 / 1.14.0) |
| Host: "commit the bundle structure at PLAN time so confirm is deterministic" | **SPEC 14** | this spec |
| SDK / engine: "expand bundle topologies — `swap → swap`, DAG chains, cap=4" | SPEC 13 Phase 3 | next |

**Why SPEC 14 must land BEFORE SPEC 13 Phase 3:** Phase 3 raises the cap and adds new (producer, consumer) pairs to the whitelist. Without SPEC 14, the LLM still controls confirm-turn emission timing; expanding to 4-op + new pairs widens the failure surface tonight's bug demonstrates. SPEC 14 makes confirm turns deterministic, which gives Phase 3 a stable foundation to build on.

**Wrap-up sequence:**

1. SPEC 14 Phase 1 (tool + Redis store, ~0.5d) — Mon May 4
2. SPEC 14 Phase 2 (chat-route fast path, ~1.0d) — Tue May 5
3. SPEC 14 soak (≥3 production days) — Wed–Fri May 6-8
4. SPEC 14 Phase 3 (retire confirm-detection / 1.14.1 / 1.14.2 / override scaffolding) — gated on metric, ~0.25d
5. SPEC 13 Phase 3 design re-read + impl (`swap → swap` whitelist + DAG validator + cap → 4) — week of May 11

PTB work wraps up cleanly when both ship. Total: ~2 calendar weeks.

---

## Out of scope / follow-ups

- **DAG bundle planning (non-linear chains).** SPEC 14's `steps[]` is a linear sequence with `inputCoinFromStep`. SPEC 13 Phase 3 is what unlocks DAG-style chains (one producer feeding multiple consumers). When SPEC 13 Phase 3 lands, `prepare_bundle` extends to accept the DAG shape; the tool's validator just calls into the new DAG validator. No architectural change to SPEC 14's fast-path.
- **Multi-session bundles.** One session = one stash. Cross-session bundles are not planned.
- **`prepare_bundle` with `volo_stake` / `volo_unstake`.** Volo flows aren't in any near-term Payment Stream. They get registered when a flow demands it; SPEC 14 doesn't pre-emptively enable them.
- **SPEC 13 Phase 3** (`swap → swap` whitelist + cap raise to 4). Independent. Lands on its own timeline.
- **The "Response interrupted · retry" cascade.** Independent of SPEC 14. SPEC 14 makes confirm turns much faster (~50ms), which incidentally reduces the surface area for stream-close races, but the underlying network/Vercel-timeout bug is owned by host instrumentation work (see `engine.turn_outcome` / `audric.engine.chat_stream_close` telemetry).

---

## Effort estimate

| Phase | Work | Calendar | Engineering days |
|---|---|---|---|
| 0 | Revert `1.14.3` + verify legacy-path stability | DONE | 0 |
| 1 | Tool + store + unit tests | Mon May 4 | 0.5 |
| 2 | Chat-route fast path + integration tests + soak | Tue May 5 | 1.0 |
| 3 | Retire `confirm-detection.ts` + override block + factory promotion | Thu May 7 (after ≥2 day Phase 2 soak) | 0.25 |
| **Total** | | **3.5 calendar days** | **~1.75 dev days** |

---

## Locked decisions

All five open questions resolved 2026-05-03 evening with author recommendations:

| # | Question | Decision | Why |
|---|---|---|---|
| 1 | Tool name | **`prepare_bundle`** | Matches existing host-route naming (`/api/transactions/prepare`). Verb-noun shape parallels how host code already talks about transaction preparation. Avoids re-introducing "Payment Stream" branding into the tool surface (the LLM-facing tool name should describe MECHANISM, not PRODUCT). |
| 2 | Stash TTL | **60 seconds** | Calibrated to ~2× the typical Cetus quote validity window (~30s). Below this and we expire too eagerly during real user think-time; above this and the price-drift exposure widens unproductively. Will instrument `audric.bundle.fast_path_skipped reason=expired` and tune from production data. |
| 3 | Second-proposal semantics | **Overwrite** | LLM may legitimately re-quote and re-prepare (e.g. user says "actually 5 USDC instead of 3" mid-plan). Rejecting the second proposal would force a full session reset. Atomic Redis SET overwrites cleanly. |
| 4 | Single-write scope (N=1) | **N≥2 only** | Single writes go through the existing direct `tool_use` path. No latency regression for the common case. The bug we're fixing is purely a multi-write phenomenon; expanding scope just adds surface. |
| 5 | Phase 3 retirement gate | **Metric-based** | Retire `confirm-detection.ts` + 1.14.1 promotion + 1.14.2 prompt rule after BOTH conditions hold: (a) ≥100 successful `audric.bundle.fast_path_dispatched` events in production, AND (b) zero `audric.bundle.fast_path_skipped` events with reason indicating an LLM-side bug (e.g. malformed `prepare_bundle` arguments). Time-based gates miss real bugs that surface only on production traffic; metric-based forces us to confirm SPEC 14 is actually working before dismantling the safety net. |

Recorded in revision log v0.2.

---

## Cross-references

- The bundle-decision code path → `packages/engine/src/engine.ts:1567-1660`
- Existing chat route + SSE flow → `audric/apps/web/app/api/engine/chat/route.ts:523-640`
- Existing pending-action wiring → `audric/apps/web/hooks/useEngine.ts`
- Existing `WriteStep` type → `packages/sdk/src/composeTx.ts`
- SPEC 13 chain-mode (independent, complementary) → `spec/SPEC_13_PTB_CHAINING_FOUNDATION.md`
- SPEC 7 P2.7 corpus (the soak this spec replaces a chunk of) → `spec/SPEC_8_CORPUS.md`
- The retired band-aid → `audric/apps/web/lib/engine/confirm-detection.ts`, `engine-factory.ts:582-612` (1.14.1 promotion + 1.14.3 override block — already reverted)
- Engineering principles cited by the user as the trigger for this spec → `.cursor/rules/engineering-principles.mdc`, `.cursor/rules/coding-discipline.mdc`, `.cursor/rules/single-source-of-truth.mdc`
