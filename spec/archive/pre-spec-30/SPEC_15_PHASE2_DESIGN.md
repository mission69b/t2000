# SPEC 15 Phase 2 — Confirm Chips Design

**Date:** 2026-05-04
**Status:** v0.7 (+ two follow-ups, both shipped 2026-05-04) — Commits 1 + 2 (core Confirm/Cancel chips) remain shipped + working. Refresh chip retired after three production gaps in 24h. PermissionCard regenerate (SPEC 7 P2.4b) is the only quote-refresh surface. **Follow-up #1 (engine ≥1.16.0):** single-write confirm-tier actions whose composition consumed a same-turn regeneratable read now also carry `canRegenerate=true` — closes the gap surfaced when smoke-testing a 6 USDC swap. **Follow-up #2 (engine ≥1.17.0):** Audric's chip-Confirm fast-path now calls the engine's canonical `composeBundleFromToolResults` directly. Closes two bugs that surfaced during smoke-testing #1: (a) bundle PermissionCard had no Refresh button on chip-Confirm, (b) bundle steps silently lacked `modifiableFields`. Both bugs were drift between the engine composer and audric's local fast-path composer; the fix collapses them into a single source of truth.
**Local-only — gitignored** (per `audric-roadmap.md` policy).
**Builds on:** `SPEC_15_CONFIRM_FLOW_DESIGN.md` v0.2 (Phase 1 + 1.5 shipped 2026-05-04) + `SPEC 7 P2.4b` (PermissionCard quote-refresh)

---

## v0.7 follow-up #2 — Single-source bundle composer (2026-05-04)

### Why this commit exists

Two bugs surfaced during smoke-testing follow-up #1's release:

1. **Bundle PermissionCard had no `↻ Refresh quote` button on the chip-Confirm path.** User reproduced with `swap 10 USDC for SUI then save 10 USDC` → tap Confirm chip → PermissionCard rendered without a Refresh slot. User: *"I dont want to play whack-a-mole and just keep hacking away."*
2. **Chip-confirmed bundles never carried `modifiableFields`** — a latent bug, never noticed because the inline-edit affordances were silently missing on every chip-Confirm bundle since SPEC 14 Phase 2 shipped. User would tap a step's amount or recipient and nothing would happen.

Both traced back to the same structural cause: `audric/apps/web/lib/engine/fast-path-bundle.ts` maintained its own `buildPendingActionFromProposal` (~200 LOC: `describeStep` switch, step assembly, regenerate-fields derivation) that drifted from `composeBundleFromToolResults` in `@t2000/engine` three times in 24 hours. Per `engineering-principles.mdc` §2 ("Single source of truth — never duplicate") + §4 ("Fix at the root, not the symptom"), the right fix wasn't another patch on the local composer — it was making the local composer go away.

### The fix

Engine v1.17.0 promotes `composeBundleFromToolResults`, `computeRegenerateFields`, and `BundleCompositionInput` from internal helpers to public API exports. Strictly additive — no behavior change, no breaking signature edits.

Audric's `fast-path-bundle.ts` is now a thin adapter (~30 LOC):
1. Convert `BundleProposal.steps` → `PendingToolCall[]` (with `id = fastpath_<bundleId>_<i>` to preserve log-analysis prefix).
2. Walk history backwards to extract regeneratable read tool_use IDs from the prior agent turn (now correctly spans MULTIPLE assistant messages — the pre-#2 walk only inspected the last one, missing `swap_quote` calls in earlier loop steps).
3. Build synthetic `readResults` with `timestamp = proposal.validatedAt` (good-enough proxy; UX driver is `quoteAge` which is sub-second-irrelevant).
4. Call the engine's `composeBundleFromToolResults({ tools, pendingWrites, readResults, ... })`.

The chat route plumbs `engine.getTools()` through to `tryConsumeFastPathBundle`. The adapter throws if `tools` is missing — defensive, catches future call sites that copy the pattern but forget the plumbing.

### What this fixes structurally

- **Bug 1 (Bundle Refresh button on chip-Confirm)** is fixed because the engine composer always populates `canRegenerate` + `regenerateInput.toolUseIds` + `quoteAge` from the `readResults` it's passed. The multi-turn history walk feeds it the right reads, so the bundle ships with `canRegenerate=true` and the audric PermissionCard renders the slot via the existing wiring.
- **Bug 2 (`modifiableFields` on chip-Confirm bundles)** is fixed because the engine composer always calls `getModifiableFields(toolName)` on every step. The local audric composer never did.
- **Future bundle-shape additions** (new `PendingActionStep` fields, new flags on `PendingAction`) propagate to chip-Confirm bundles automatically, no audric-side change required. Drift is impossible by construction.

### What landed

| Surface | Change |
|---|---|
| `packages/engine/src/index.ts` | Promote `composeBundleFromToolResults`, `computeRegenerateFields`, `BundleCompositionInput` to public API. JSDoc names the production gaps that motivated the export and points at audric's fast-path as the canonical external consumer. Released as `@t2000/engine@1.17.0`. |
| `audric/apps/web/lib/engine/fast-path-bundle.ts` | Replace local composer with thin adapter that calls `composeBundleFromToolResults`. Rewrite `findContributingReadsFromHistory` to walk back to the most recent **non-synthetic** user message (skipping `tool_result`-bearing user messages) and collect tool_use blocks from EVERY assistant message in between. |
| `audric/apps/web/app/api/engine/chat/route.ts` | Pass `tools: engine.getTools()` to `tryConsumeFastPathBundle`. |
| `audric/apps/web/lib/engine/__tests__/fast-path-bundle.test.ts` | Test surface tightened: `ENGINE_TOOLS = getDefaultTools()` fixture, removed obsolete `describeStep` block, added positive tests for chained-coin auto-wiring + modifiableFields + multi-turn history walk + missing-tools throw. |

### Net diff

| Repo | Commits | Files | Lines |
|---|---|---|---|
| t2000 | `b1f6ea7` | `packages/engine/src/index.ts` | +17 / -0 |
| audric/web | TBD | `fast-path-bundle.ts`, `chat/route.ts`, `fast-path-bundle.test.ts`, `package.json` | ~+30 net (after deleting ~200 lines of local composer) |

### Verification

- Engine: 909 tests passing, typecheck clean, build clean. v1.17.0 published.
- Audric: 1415 tests passing (was 1412), +3 from new positive fast-path tests. Typecheck + lint clean.

### Lessons learned

1. **The history walk was wrong long before #2's smoke test.** The pre-#2 fast-path never looked at history (always `canRegenerate=false`); #2 added the walk but bounded it to the last assistant message. Both shipped because the symptom is invisible until a user actually waits for a quote to expire on a chip-confirmed bundle. Same structural class as the env-validation gate bug — silent UX degradation that takes a smoke test against the right preset to surface.
2. **Engine API surface is the right place to enforce convergence.** Pre-#2, "audric fast-path produces bundles that match the engine composer's output" was a manual invariant that drifted on every engine release. Post-#2, it's a compile-time guarantee — the audric adapter literally calls the engine function. The cost was one engine release + 17 engine LOC + a JSDoc comment.
3. **Defensive-throw on missing tools catches the next caller before they ship.** A future call site that copies the chat-route pattern but forgets to plumb `engine.getTools()` fails in tests instead of silently falling back to no-regenerate behavior. Smaller blast radius for the next would-be drift author.

---

## v0.7 — Chip Refresh removed (2026-05-04)

### Why this commit exists

Within ~30 minutes of v0.4 → v0.5 → v0.6 shipping, the chip Refresh button accumulated three distinct production gaps. User-driven simplicity review (`coding-discipline.mdc` §2) flagged the pattern: every layer of complexity added to make natural-language refresh "work" was a new attack surface for Sonnet's interpretation drift. Removal beats patching.

### The track record (24h window)

| Version | Approach | Production gap |
|---|---|---|
| v0.4 | Send literal `"refresh quote"` | Sonnet read it as quote-only → no `prepare_bundle` → no fresh chips |
| v0.5 (hotfix) | Replay original user intent verbatim (e.g. `"swap 1 USDC for SUI then save 0.5 USDC"`) | Sonnet sometimes read repetition as "user is re-confirming" → auto-tier bundle executed without re-confirmation |
| v0.7 (proposed but **not shipped**) | Server-side system-prompt directive forcing `prepare_bundle` on detected refresh | More machinery to maintain a feature whose unique value was "save 1 retype on auto-tier multi-write bundle expiry" |

The repeated failure mode was not a single bug — it was the LLM-interpretation surface itself. Each fix shifted Sonnet's behavior in a new way. PermissionCard Regenerate has never had this class of bug because it is server-side + deterministic (swaps `action.input` in place via `/api/engine/regenerate`, no LLM round-trip).

### What landed (chip refresh removal)

| Surface | Change |
|---|---|
| `components/engine/ConfirmChips.tsx` | Removed `onRefresh?` prop + the `<Button>Refresh quote</Button>` render path + `refreshing` latch. Reverted expiry copy to the v0.3 baseline `"Quote expired — ask for a fresh one"` |
| `components/engine/__tests__/ConfirmChips.test.tsx` | Deleted the entire `describe('Refresh-on-expiry chip (v0.4)', ...)` block (6 tests). Updated the original "Quote expired" assertion to match the v0.3 copy |
| `lib/engine-types.ts` | Removed `originatingUserText?: string` from `ExpectsConfirmPayload` |
| `hooks/useEngine.ts` | Removed `sendRefreshClick` callback (~50 LOC) + the `originatingUserText` capture in the `expects_confirm` SSE reducer (~22 LOC) + the export. Kept `currentReplayTextRef` (still used by interruption-retry) |
| `components/engine/ChatMessage.tsx` | Removed `onRefreshClick?` prop + `refreshTargetText` + `refreshDispatcher` resolution. Chips block no longer passes `onRefresh` |
| `components/dashboard/UnifiedTimeline.tsx` | Removed `onRefreshClick={engine.sendRefreshClick}` line |
| `app/api/engine/chat/route.ts` | Removed `RefreshDecision` interface + `refreshDecision` body destructure + chip-side `emitQuoteRefreshFired({surface: 'chip'})` call + `emitQuoteRefreshFired` import |

### What we kept (v0.6 valuable parts that survive removal)

| Surface | Why we kept it |
|---|---|
| `lib/engine/quote-refresh-metrics.ts` | Still emits `audric.quote_refresh.fired{surface=permission_card}` from regenerate route. Single counter is still useful telemetry on the surviving surface |
| `lib/engine/__tests__/quote-refresh-metrics.test.ts` (4 tests) | Tests for `emitQuoteRefreshFired` are valid for `surface: 'permission_card'` (and reserve `surface: 'chip'` for any future revisit). All 4 still pass |
| `app/api/engine/regenerate/route.ts` `emitQuoteRefreshFired({surface: 'permission_card'})` | The "user clicked refresh on PermissionCard" intent counter — useful regardless of chip presence |
| PermissionCard "Refreshing…" + aria copy unification | Cross-surface terminology stays uniform if we ever revisit |
| `surface: 'chip' \| 'permission_card'` enum on `QuoteRefreshSurface` | Wire format extensible — keeps the door open without breaking the type if we ever ship a new chip-side surface |

### What the user sees post-removal

- **Multi-write bundle (any tier), quote expires** → "Quote expired — ask for a fresh one" → user retypes. Sonnet runs the standard flow + plan-context promotion → fresh `swap_quote` + `prepare_bundle` → fresh chips. (For auto-tier bundles, this is an extra retype vs. v0.4–v0.6's chip click. **For confirm-tier bundles, the user can also wait for PermissionCard regenerate** which is more efficient anyway.)
- **Single-write, confirm-tier, quote expires** → **PermissionCard renders without a Refresh button** (SPEC 7 P2.4b's regenerate slot is gated to `isBundle && action.steps` — see `PermissionCard.tsx` line 574). User must Confirm-stale, Deny, or wait 60s for the deny-timer to fire. **CLOSED 2026-05-04** by `S.56 v0.7 follow-up` (engine ≥1.16.0). Single-write confirm-tier actions whose composition consumed a same-turn regeneratable read (e.g. a $50 `swap_execute` referencing a prior `swap_quote`) now populate `canRegenerate: true` + `regenerateInput.toolUseIds` + `quoteAge`. The audric `PermissionCard.tsx` lifts the same `↻ Refresh quote` button + age badge into the single-write render branch. Same `/api/engine/regenerate` route runs deterministically.
- **Single-write, auto-tier** → unchanged. No expiry surface exists (executes immediately).

### Lessons learned (the actual moat from this work)

1. **LLM-interpretation surfaces are too fragile to carry critical UX promises.** When a UX affordance's correctness depends on Sonnet reading natural language a particular way, the affordance will break in production for reasons that look obvious in retrospect but are impossible to predict ahead of time.
2. **Server-side, deterministic, no-LLM paths are the right tier for "fix something that's already in flight."** PermissionCard regenerate is the canonical pattern: `swap action.input atomically, no model round-trip, ~500ms`. We should default to this shape for any future "user wants to redo X" UX.
3. **"Save 1 retype" is rarely worth a permanent reliability tax.** If the only argument for a feature is "saves a few keystrokes" but it requires fragile machinery to keep working, the keystrokes are cheaper.
4. **Three production gaps in 24h is a structural signal, not a string of bad luck.** Per `engineering-principles.mdc` §4: "When a fix requires changes in 3+ places or multiple retry attempts, the architecture is wrong. Step back and find the single point of failure." We did, eventually — the architecture *was* the failure.
5. **The v0.6 unification + label work was still worthwhile.** Even though the chip-side surface went away, the telemetry shape + copy unification on PermissionCard is genuine value. Removal does not negate the cleanup that landed alongside it.

### Net diff (v0.7 removal)

```
7 files changed, +35 insertions(-), -262 deletions(-)
  apps/web/components/engine/ConfirmChips.tsx                 -47 / +12 (cleanup comments)
  apps/web/components/engine/__tests__/ConfirmChips.test.tsx -135 / +8  (deleted 6 v0.4 tests, updated 1 expiry assertion)
  apps/web/lib/engine-types.ts                                -16 / +0
  apps/web/hooks/useEngine.ts                                 -88 / +0  (sendRefreshClick + originatingUserText capture)
  apps/web/components/engine/ChatMessage.tsx                  -29 / +9  (cleanup comments)
  apps/web/components/dashboard/UnifiedTimeline.tsx            -1 / +0
  apps/web/app/api/engine/chat/route.ts                       -34 / +0
```

---

## v0.6 — Commit 4: Two layers of quote refresh, by design (2026-05-04) [SUPERSEDED BY v0.7]

> **NOTE (v0.7, 2026-05-04):** The chip Refresh side of this two-layer architecture was removed the same day. The PermissionCard side is preserved. The "five scenarios" + "two layers, by design" framing is kept in this section as a record of the decision and its reversal. Read the v0.7 entry above for the current state.

### Why this commit exists

After Commit 3hotfix shipped, architectural review surfaced a sharp question: *"We may not even need the chip refresh, because we already have the quote refresh on the permission card. Are we creating two paths for no reason?"* Inspection revealed the chip Refresh (`<ConfirmChips />`) and PermissionCard Refresh (`<PermissionCardBlockView />` regenerate slot, SPEC 7 P2.4b) are functionally similar but at different layers of the bundle flow. They look like duplication, but each is required for a distinct scenario.

### The five scenarios — when each surface fires

| Scenario | Example | ConfirmChips Refresh | PermissionCard Refresh |
|---|---|---|---|
| Single-write, auto-tier | "swap $1 USDC for SUI" | ❌ no chip rendered | ❌ no card (auto-executes) |
| Single-write, confirm-tier | "swap $50 USDC for SUI" | ❌ no chip rendered | ✅ **the only path** |
| Multi-write bundle, auto-tier | "swap $1 + save $0.50" | ✅ **the only path** | ❌ no card (all auto) |
| Multi-write bundle, confirm-tier | "swap $200 + save $100" | ✅ pre-dispatch | ✅ post-dispatch (sequential) |
| Multi-write bundle, mixed-tier | "swap $1 + save $100" | ✅ pre-dispatch | ✅ on confirm leg only |

**Where each is uniquely required:**
- Scenario 2 (single-write confirm-tier): no chip exists → only PermissionCard can fix the stale quote.
- Scenario 3 (auto-tier bundle): `shouldClientAutoApprove` skips PermissionCardBlockView entirely → only chip Refresh can.

**Where they overlap (scenarios 4 + 5):** both fire **sequentially on the same flow**, not in parallel. The chip is the "before fast-path dispatch" gate, the PermissionCard is the "before signature" gate. Different moments in the user journey.

### The cost-profile difference

| Surface | Endpoint | Behavior | Cost |
|---|---|---|---|
| `<ConfirmChips />` Refresh | `POST /api/engine/chat` (full LLM turn) | Re-runs `swap_quote` + `prepare_bundle` from scratch via plan-context-promoted Sonnet | ~5–8s |
| `<PermissionCard />` Regenerate slot | `POST /api/engine/regenerate` (server only) | Swaps `action.input` in place, no LLM round-trip | ~500ms |

Different cost profiles match different layers of the flow. **The chip Refresh is "fix it before dispatch and proceed cleanly"; PermissionCard Refresh is "fix it without backing out of the signature step."**

### What we did NOT do (alternatives considered + rejected)

- ❌ **Delete chip Refresh, rely on PermissionCard.** Breaks scenario 3 (auto-tier bundles never render PermissionCard).
- ❌ **Delete PermissionCard regenerate slot, rely on chip.** Breaks scenario 2 (single-write confirm-tier has no chip).
- ❌ **Server-side "auto-refresh stale stash on chip-Confirm".** Adds significant server complexity (re-running prior plan from session state, re-validating balance + HF) for marginal UX gain. The explicit Refresh button is clearer.
- ❌ **Remove the chip-on-expiry disable + let users click Confirm on stale chips.** Worse UX — user thinks they're getting the displayed quote, gets a different one via fall-through.

### What landed

| Surface | File(s) | Notes |
|---|---|---|
| Unified counter module | `lib/engine/quote-refresh-metrics.ts` (NEW) + 4 unit tests | `emitQuoteRefreshFired({ surface: 'chip' \| 'permission_card' })`. Try/catch wrapper matches every other Audric metrics helper |
| PermissionCard surface emission | `app/api/engine/regenerate/route.ts` (modified) | `emitQuoteRefreshFired({ surface: 'permission_card' })` after auth + rate-limit, before doing work |
| Chip surface wiring | `app/api/engine/chat/route.ts` (modified) | New `refreshDecision?: { via: 'chip' }` body field — defensively validated, telemetry-only (route does not branch on it). Emits `surface: 'chip'` when set |
| Client refresh callback | `hooks/useEngine.ts` (modified) | New `sendRefreshClick(text)` callback mirrors `sendChipDecision` shape. POSTs `/api/engine/chat` with `refreshDecision: { via: 'chip' }`. Functionally identical to `sendMessage` from the engine's POV — the field is purely a server-side telemetry tag |
| ChatMessage refresh dispatcher | `components/engine/ChatMessage.tsx` (modified) | New `onRefreshClick?: (text: string) => void` prop. Refresh chip prefers this when wired so the unified counter fires; falls back to `onSendMessage` for legacy callers / tests |
| UnifiedTimeline plumbing | `components/dashboard/UnifiedTimeline.tsx` (modified) | One-line addition: `onRefreshClick={engine.sendRefreshClick}` |
| Label unification | `components/engine/PermissionCard.tsx` (modified) | "Regenerating…" → "Refreshing…" + aria-label "Regenerate bundle with fresh quotes" → "Refresh the quote and prepare a new plan". User-facing button label was already "Refresh quote" pre-v0.6 (matches the chip's). Internal API names (`onRegenerate`, `regenerate.isRegenerating`, `attemptId`) kept as-is — implementation detail, renaming is just churn |
| PermissionCard test | `components/engine/__tests__/PermissionCard.regenerate.test.tsx` (modified) | `/Regenerating/` → `/Refreshing/` to match the unified copy |

### Telemetry contract (locked by tests)

- **Counter name:** `audric.quote_refresh.fired` — top-of-funnel "user wanted a fresh quote" signal
- **Tag:** `surface: 'chip' | 'permission_card'`
- **Pairs with:** existing `audric.harness.regenerate_count{outcome}` (post-decision outcome on the PermissionCard surface) — the new counter is upstream click intent, the existing counter is downstream resolution

Dashboard query example:
```
audric.quote_refresh.fired
  | group by surface
  | over the last 24h
```

This answers "how often does the user refresh a stale quote, broken down by surface" with a single query — instead of joining `audric.confirm_flow.dispatch_count{outcome=cancelled}` (chip cancel ≈ chip Refresh as a signal) with `audric.harness.regenerate_count{outcome=success}` (PermissionCard Refresh).

### Net diff (Commit 4)

```
9 files changed, 256 insertions(+), 11 deletions(-)
  apps/web/lib/engine/quote-refresh-metrics.ts                | +56 (NEW module)
  apps/web/lib/engine/__tests__/quote-refresh-metrics.test.ts | +83 (NEW, 4 tests)
  apps/web/app/api/engine/regenerate/route.ts                 | +9
  apps/web/app/api/engine/chat/route.ts                       | +35
  apps/web/hooks/useEngine.ts                                 | +66
  apps/web/components/engine/ChatMessage.tsx                  | +18
  apps/web/components/dashboard/UnifiedTimeline.tsx           | +1
  apps/web/components/engine/PermissionCard.tsx               | +2 / -2
  apps/web/components/engine/__tests__/PermissionCard.regenerate.test.tsx | +6 / -3
```

Tests: 1410 → 1414 (+4 new from the metrics module). All green. Typecheck + lint clean.

### Lessons

The user's instinct on "are we creating two paths for no reason" was sharp — and the answer was "no, but they should feel like one to telemetry and copy." Defense-in-depth layering is correct architecturally; what was wrong was that the two surfaces had drifted in their language ("Regenerating" vs "Refreshing") and had no unified observability. Fixed both at the same time.

Worth keeping the "two layers, by design" framing for future quote-related UX questions — answer "which scenario fires which surface" first, THEN decide if more unification is needed.

---

## v0.5 — Commit 3 hotfix SHIPPED (2026-05-04, same day as Commit 3)

### What broke + how it surfaced

Commit 3 sent a literal `"refresh quote"` message text on chip click, betting that plan-context promotion + Sonnet's chat history would re-run `swap_quote` AND `prepare_bundle`. **Production caught the gap on first run** — Sonnet read `"refresh quote"` literally and ran `swap_quote` only, skipping `prepare_bundle`. The user saw a fresh quote but no fresh chips, and the original stash was already expired (so typing "confirm" wouldn't help either).

This is the exact v2 escape hatch documented in v0.4's risk table:

> Sonnet interprets "refresh quote" as "give me a new swap quote" but doesn't re-bundle → If telemetry shows otherwise, migrate to `originatingUserText` replay.

Telemetry showed otherwise on N=1. Hotfix shipped immediately.

### Fix: replay the originating user intent verbatim

Instead of sending `"refresh quote"`, the Refresh chip now replays the **literal user message** that triggered the plan turn (e.g. `"swap 1 USDC for SUI then save 0.5 USDC"`). Sonnet sees the exact same input twice → produces the exact same output (swap_quote + prepare_bundle) → fresh chips render.

| Surface | File(s) | Notes |
|---|---|---|
| Type extension | `lib/engine-types.ts` (modified) | `ExpectsConfirmPayload.originatingUserText?: string` (optional for backward compat) |
| SSE reducer capture | `hooks/useEngine.ts` (modified) | When `expects_confirm` arrives, walk back through `messagesRef.current` for the most recent `role: 'user'` message (excluding the streaming assistant). Falls back to `currentReplayTextRef.current` if the walk misses (very early in stream lifecycle, before user message has settled into the rendered list) |
| Refresh wiring | `components/engine/ChatMessage.tsx` (modified) | `chipsBlock` builds `refreshTargetText = message.expectsConfirm?.originatingUserText ?? 'refresh quote'`. Refresh click POSTs that text via `onSendMessage`. Belt-and-braces fallback to legacy `'refresh quote'` ensures pre-v0.5 messages persisted mid-rollout still work |

### Why client-side capture (not server-side SSE field)

Considered adding `originatingUserText` to the `ExpectsConfirmSseEvent` server-side. Rejected because:

1. **No version skew risk.** Pure client-side change — server can stay unchanged. Old clients reading new server output (impossible since this is frontend-only) can't break.
2. **Same data already on the client.** `messagesRef.current` is the source of truth for the rendered chat — the user message is `setMessages`-ed before the stream opens (in both `sendMessage` and `sendChipDecision`), so by the time `expects_confirm` arrives it's deterministically present.
3. **Cheaper.** ~25 LOC client-side vs. ~50 LOC across server + client.

### Edge cases handled

| Case | Behavior |
|---|---|
| User types follow-up between plan + chip click (e.g. "what's my SUI balance?") | Capture happened at `expects_confirm` time, **before** the follow-up. So `originatingUserText` correctly stays as the plan-triggering message |
| User clicked chip then waited expiry (clicked-then-stale) | `!clicked` gate hides Refresh; `originatingUserText` never used |
| Pre-v0.5 message persisted in chat history mid-rollout | Falls back to legacy `'refresh quote'` literal text — same behavior as v0.4 ship |
| User editing the original intent (e.g. "Actually make it 2 USDC") | The follow-up edit IS the latest user message; capture walks back to that one, correctly. Plan turn produced by THAT edit replays THAT edit |
| `messagesRef.current` empty / no user message found | Falls back to `currentReplayTextRef.current` (the active stream's source text), then to `'refresh quote'` literal as final fallback |

### Net diff (Commit 3 hotfix)

```
3 files changed, 51 insertions(+), 5 deletions(-)
  lib/engine-types.ts            | +16   (originatingUserText field + comment)
  hooks/useEngine.ts             | +25   (walk back messagesRef in SSE reducer)
  components/engine/ChatMessage.tsx | +10  (refreshTargetText derivation)
```

Tests: 1410/1410 still pass (component-level Refresh contract unchanged — chip just calls `onRefresh()`, parent decides what text gets replayed). Typecheck: 0 errors. Lint: 0 errors.

### Production smoke (after Vercel deploy)

Repeat the original 3-test plan. The new behavior on Test 3:

1. Trigger multi-write plan with swap. Chips render.
2. Wait 30+ seconds. Confirm/Cancel disable. **Refresh quote button appears.**
3. Tap Refresh. **The chat shows your original intent text (e.g. `"swap 1 USDC for SUI then save 0.5 USDC"`) as the new user message** — not "refresh quote".
4. Sonnet runs `swap_quote` → `prepare_bundle` → emits new `expects_confirm` → fresh chips render with new countdown.
5. End-to-end: one tap, full re-bundle, no typing.

### Lessons

The v0.4 risk table called this exact gap and named the exact fix. Time-to-detect: 1 production turn. Time-to-fix: ~15 min. The "cheap escape hatch" pre-planning was load-bearing — without it the hotfix would have required spec-redesign instead of a 25-LOC change.

---

## v0.4 — Commit 3 SHIPPED (Refresh-on-expiry chip, 2026-05-04)

### Why this commit exists

Commit 2 production smoke (Test 3 — quote expiry) confirmed the expiry flow worked: chips disabled, "Quote expired — ask for a fresh one" rendered. But the user immediately asked: **"shouldnt we have a button to refresh the quote instead of user typing it again?"** Fair point — making the user re-type the original intent breaks the "everything is one tap" UX promise the chips were introduced to deliver.

### What landed

| Surface | File(s) | Notes |
|---|---|---|
| Refresh chip | `components/engine/ConfirmChips.tsx` (modified) | New `onRefresh?: () => void` prop. Renders ONLY when `expired === true && !clicked && !disabled && onRefresh` provided. One-shot click latch on `refreshing` state. |
| Wiring | `components/engine/ChatMessage.tsx` (modified) | `chipsBlock` builds `onRefresh = onSendMessage ? () => onSendMessage('refresh quote') : undefined`. No new prop on `<ChatMessage>` itself — `onSendMessage` was already plumbed for `<RetryInterruptedTurn>`. |
| Tests | `components/engine/__tests__/ConfirmChips.test.tsx` (modified) | +6 tests, total 9 → 15. Covers: hidden pre-expiry, hidden when `onRefresh` omitted (legacy fallback), renders when expired+wired, one-shot click latch, hidden when click latch already set on Confirm/Cancel, hidden when parent `disabled` |

### How it works

1. **Frontend:** Refresh button click calls `onSendMessage('refresh quote')` — a normal `sendMessage` POST to `/api/engine/chat`. **No new SSE events. No new server endpoints. No new chat-route logic.**
2. **Backend (zero changes):** the literal "refresh quote" turn hits the existing chat-route. Plan-context detection (`priorWriteVerbs ≥ 1` + `PRIOR_PLAN_MARKER` matches the prior assistant's "Confirm?" tail) promotes to Sonnet. Sonnet sees the prior `prepare_bundle` plan in chat history and re-runs `swap_quote` + `prepare_bundle`. `expectsConfirmDecorator` emits a fresh `expects_confirm` event. New chips render below.
3. **The user's turn count goes up by 1, then back to a confirmable plan in ~5–8s.** Same end state as if they'd retyped the original intent.

### Why a literal "refresh quote" message instead of replaying the original intent

Considered passing the original user text down through `expects_confirm.originatingUserText` and replaying it. Rejected for two reasons:

1. **No new wire format.** Adds zero fields to the SSE event, no client-side message walking, no new types.
2. **Same outcome with less code.** Plan-context promotion + Sonnet's chat history is sufficient — production logs already show this pathway works for "Confirm" / "Cancel" single-word turns. "refresh quote" is structurally identical: a short directive interpreted in the context of the prior plan.

If telemetry shows Sonnet doesn't deterministically redo the bundle on "refresh quote" (e.g. it just returns a quote without re-bundling), the v2 follow-up is to add `originatingUserText` and replay literally. Cheap to migrate to.

### Why Refresh is hidden until expiry

Pre-expiry, the user's tap-to-confirm UX is unambiguous: Confirm or Cancel. Adding a third co-equal option (Refresh) would force a decision that doesn't need to exist — the quote is fresh, why would they refresh it? Refresh is a **recovery affordance**, not a primary action. Render rules:

```ts
const showRefreshChip = expired && !clicked && !disabled && !!onRefresh;
```

- `expired === true` — the only state where Refresh is meaningful
- `!clicked` — if user already clicked Confirm/Cancel and the response is mid-flight, hide Refresh so they can't trigger contradictory work
- `!disabled` — parent-forced lockout (e.g. multi-tab race) suppresses Refresh too
- `!!onRefresh` — auth-gated (parent didn't wire it on unauth/demo); falls back to legacy "ask for a fresh one" text

### Manual smoke checklist (production)

After Vercel deploys (no new env vars — uses existing `NEXT_PUBLIC_CONFIRM_CHIPS_V1`):

1. **Pre-expiry:** Trigger a multi-write plan with a swap (e.g. `swap 1 USDC for SUI then save 0.5 USDC`). Confirm/Cancel chips render. NO Refresh button. ✓
2. **Expiry:** Wait 30+ seconds. Confirm/Cancel disable. **Refresh quote button appears** + "Quote expired" label. ✓
3. **Refresh click:** Tap Refresh quote. Stream starts (you'll see normal "thinking…" → tool use → new chips). New `expires_at` countdown starts on the new chips. ✓
4. **Refresh idempotency:** Tap Refresh again immediately (multi-click test). Only one stream should start (button locks on click). ✓
5. **Backward compat:** Auth-only — unauth/demo sessions don't render the Refresh button (no `onSendMessage`). Legacy text renders instead.

### Risks evaluated

| Risk | Likelihood | Mitigation |
|---|---|---|
| Sonnet interprets "refresh quote" as "give me a new swap quote" but doesn't re-bundle | Medium | Prior plan in chat history + plan-context promotion makes re-bundle the obvious next step. If telemetry shows otherwise, migrate to `originatingUserText` replay. |
| Multiple Refresh clicks fire multiple streams | Low | One-shot `refreshing` click latch (same pattern as Confirm/Cancel `clicked`) |
| Refresh fires while a Confirm/Cancel response is mid-flight | Very low | `!clicked` gate hides Refresh entirely once chips are clicked |
| Refresh shows up on a stash that's already been cancelled in another tab | Low | Parent-forced `disabled` gate hides Refresh; backend chip-Cancel deletes stash atomically |
| Frontend-only change leaks to legacy clients without `NEXT_PUBLIC_CONFIRM_CHIPS_V1` | None | Refresh inherits the same flag — chips don't render at all when flag is off |

### Net diff (Commit 3)

```
3 files changed, 195 insertions(+), 9 deletions(-)
  components/engine/ConfirmChips.tsx                | 60 +++++-
  components/engine/ChatMessage.tsx                 | 16 ++-
  components/engine/__tests__/ConfirmChips.test.tsx | 128 ++++++++-
```

Tests: 9 → 15 (+6 new). All 1410 web tests pass.

---

## v0.2 — Commit 1 SHIPPED (2026-05-04)

**Audric SHA:** `e8b2f55`
**Files touched:** 10 (3 new, 7 modified)
**Tests:** 71 files / 1395 passing (was 1392; +3 new — stash_mismatch counter, P0-14 ghost-dispatch race × 2)
**Spec consistency:** 17 → 19 assertions (added `EXPECTS_CONFIRM_DECORATOR_PRESENT` + `FAST_PATH_CHIP_ADMISSION`)

### What landed

| Surface | File(s) | Notes |
|---|---|---|
| Audric-only SSE event type | `lib/engine/sse-types.ts` (new) | `ExpectsConfirmSseEvent` with `variant`, `stashId`, `expiresAt`, `stepCount` |
| Decorator | `lib/engine/expects-confirm-decorator.ts` (new) + 12 unit tests | Reads stash via `readBundleProposal` (1 RTT, GET only); reuses `PRIOR_PLAN_MARKER` regex |
| Fast-path chip override | `lib/engine/fast-path-bundle.ts` | New `forceAdmit?: 'chip'` opt skips intent gates only; session/stash/wallet still run. `AdmittedVia` exported + surfaced on `FastPathHit.admittedVia` for accurate downstream telemetry |
| Telemetry counters | `lib/engine/plan-context-metrics.ts` | `emitExpectsConfirmSet({hasSwap, stepCount})` + `emitConfirmFlowDispatch({via, outcome, admittedVia, stepCount})` with `outcome ∈ {dispatched, cancelled, stash_mismatch}` |
| Chat route wiring | `app/api/engine/chat/route.ts` | `chipDecision` body field + 3-path routing (chip-Cancel / chip-Yes / text-confirm) + `case 'turn_complete'` decorator emission |
| Feature flag | `lib/env.ts` | `NEXT_PUBLIC_CONFIRM_CHIPS_V1` (frontend-render gate ONLY — backend ships unflagged for baseline) |
| Spec consistency | `lib/engine/spec-consistency.ts` (+ test) | 17 → 19 assertions |
| Marker export | `lib/engine/confirm-detection.ts` | Promoted `PRIOR_PLAN_MARKER` from `__testOnly__` to top-level so production code doesn't reach into a test surface |

### Chip-POST wire format (frontend contract for commit 2)

```ts
interface ChatRequestBody {
  message: string;
  // ...existing fields
  chipDecision?: {
    via: 'chip';
    value: 'yes' | 'no';
    forStashId: string;
  };
}
```

**Three contract notes the frontend MUST honor in commit 2:**

1. **Chip-Yes contract.** When `chipDecision.value === 'yes'`, the frontend MUST send `message: 'Confirm'` (or another regex-matching string from `CONFIRM_PATTERN`). Why: on stash-mismatch the chat route falls through to text-confirm, which requires regex admission to dispatch. A non-regex message would silently fail-closed.
2. **Chip-No contract.** When `chipDecision.value === 'no'`, the frontend SHOULD send `message: 'Cancel'` (or similar verb-aligned text). Why: the message text is appended to the engine ledger as the user turn for chat-history readability. A misaligned message ("Confirm" with `value: 'no'`) creates confusing-looking chat history but functions correctly.
3. **`forStashId` is NOT a capability token.** Server consumes the stash by `sessionId`. `forStashId` exists for ghost-dispatch race detection — see R7 below. Echoing a malformed value can't elevate auth.

### R7 ghost-dispatch race — closed

The race: user clicks Cancel chip → next turn creates new stash → user clicks delayed Yes on stale chip. Without protection, the new stash dispatches when the user thought they were approving the old plan.

**Closed via** chat-route mismatch validation: chip-Yes with `forStashId !== currentStash.bundleId` → emit `dispatch_count{outcome='stash_mismatch'}` + fall through to text-confirm path. The text-confirm path WILL dispatch the current stash (because chip click sends `message: 'Confirm'` per contract #1) — but the user's intent is already "Confirm"; we just don't honor the stale binding. P0-14 regression test in `__tests__/fast-path-bundle.test.ts`.

### Known optimization opportunity

Chip-Yes path costs **2 Redis RTTs**: chat route reads stash for `forStashId` validation, then `tryConsumeFastPathBundle` does GET+DEL. Could be optimized in v1.5 by passing the pre-read proposal into a `forceProposal?: BundleProposal` opt + replacing fast-path's GET+DEL with a `deleteBundleProposal` call. Not blocking — ~50–80ms extra latency on chip-Yes is acceptable for v1.

### Soak gate before commit 2 (CLOSED 2026-05-04)

Active 4-prompt smoke replaced the 24h passive soak. Production logs from session `s_1777875920912_17d1f1b7570d`:
- `audric.confirm_flow.expects_confirm_set has_swap=true step_count_bucket=2` ✅ (plan turn fired the decorator)
- `audric.confirm_flow.dispatch_count via=text outcome=dispatched admitted_via=plan_context step_count_bucket=2` ✅ (confirm turn fired the dispatch counter; **`admitted_via=plan_context` proves the chat-route accuracy fix from the self-review pass**)
- Single-write turn: NO new counters fired ✅ (decorator gates correctly on `prepare_bundle` having run)
- Read-only turn: NO new counters fired ✅
- Phase 1.5 fast-path regression: 17ms dispatch, atomic 2-op PTB, no behavioral change ✅

Gate closed. Proceeded to commit 2.

---

## v0.3 — Commit 2 SHIPPED (2026-05-04)

**Audric SHA:** `47badca`
**Files touched:** 7 (3 new, 4 modified)
**Tests:** 72 files / 1404 passing (was 1395; +9 new — `<ConfirmChips />` tests covering render, click, disabled, expiry countdown, lock-after-click)
**No engine changes** — frontend-only commit.

### What landed

| Surface | File(s) | Notes |
|---|---|---|
| Env flag helper | `lib/confirm-chips.ts` (new) | `isConfirmChipsEnabled()` mirrors `isInteractiveHarnessEnabled()` pattern — reads `env.NEXT_PUBLIC_CONFIRM_CHIPS_V1`, returns true on `'1'` / `'true'` (case-insensitive, whitespace-trimmed). |
| `<ConfirmChips />` component | `components/engine/ConfirmChips.tsx` (new, ~115 LOC + 145 LOC tests) | Confirm = `Button variant="primary" size="sm"`, Cancel = `variant="secondary" size="sm"`. Click latch (one-click commits the row). `expiresAt` countdown re-renders every 1s; shows "Ns left" when <=10s; locks both chips + shows "Quote expired" past expiry. Design-system-compliant — same `Button` primitives as the rest of the app. |
| Type extension | `lib/engine-types.ts` | Added `ExpectsConfirmPayload` interface + `expectsConfirm?` field on `EngineChatMessage`. |
| SSE reducer | `hooks/useEngine.ts` | New `expects_confirm` SSE handler in `processSSEChunk` — stamps the streaming assistant message with the chip payload. Defensive shape validation rejects malformed events (variant must be one of `commit/acknowledge/choice`, stashId must be non-empty string, stepCount must be number). |
| Chip click POST | `hooks/useEngine.ts` | New `sendChipDecision({ value, forStashId })` callback. Synthesizes user message text per the wire-format contract (`'Confirm'` for yes, `'Cancel'` for no), then POSTs `/api/engine/chat` with `chipDecision: { via: 'chip', value, forStashId }`. Auth-gated (silently no-ops on unauth/demo sessions). |
| ChatMessage rendering | `components/engine/ChatMessage.tsx` | New `onChipDecision?` prop. Renders `<ConfirmChips />` below the assistant body when (a) `message.expectsConfirm` is set AND (b) `isConfirmChipsEnabled()` AND (c) `onChipDecision` callback is wired AND (d) the message is no longer streaming. Shared across v2 timeline + legacy render paths. |
| Wiring | `components/dashboard/UnifiedTimeline.tsx` | Threads `engine.sendChipDecision` as `onChipDecision` to `<ChatMessage>` — single line. |

### Render gate (4 conditions, all required)

```ts
const chipsBlock =
  message.expectsConfirm &&         // server emitted expects_confirm SSE event
  onChipDecision &&                 // caller wired the chip handler (auth path)
  isConfirmChipsEnabled() &&        // NEXT_PUBLIC_CONFIRM_CHIPS_V1 = 1/true
  !message.isStreaming              // turn finished, not in flight
  ? <ConfirmChips ... /> : null;
```

The `!message.isStreaming` gate is what prevents chips rendering before the message text settles — the `expects_confirm` SSE event arrives BEFORE `turn_complete` per the chat-route ordering contract, so we wait for `turn_complete` to flip `isStreaming: false` before rendering.

### Backward-compat / rollback

- Backend ships unflagged → telemetry continues to emit even with chips disabled. Useful for ratio sanity checks.
- Flag default OFF → existing text-confirm path unchanged.
- Flag flip is a Vercel env var — no code rollback needed to disable.
- Old clients without the SSE handler treat `event: expects_confirm` as no-op (the handler returns early on unknown event types). Non-breaking.

### Known UX edge cases (acceptable, documented)

1. **Stale chip after new user text.** If user types a follow-up question (e.g. "show balance") instead of clicking Confirm, the chip on the prior message remains clickable. If clicked later, the chat route's `forStashId` mismatch detection handles it — stash either matches (still valid) → dispatches, or mismatches (replaced by a newer plan) → falls through to text-confirm with `outcome=stash_mismatch` telemetry. Stash TTL caps the staleness window at 60s.
2. **Multi-tab race.** User opens chat in two tabs, clicks Confirm in tab A → stash consumed → tab B's chip click → fast-path returns `no_stash` → silent fall-through to text-confirm (which would also fail because stash is gone). User sees no error; the bundle just doesn't dispatch a second time. Idempotent by design.
3. **Quote expiry with stale chip.** Bundle has `swap_execute` → server stamps `expiresAt` → chip auto-locks at expiry with "Quote expired" message. User must request a fresh quote.

### Verification — pre-flag-flip

- Typecheck clean
- Lint clean (1 pre-existing unrelated warning on `useEngine.ts:667`)
- 1404/1404 tests passing

### Manual smoke checklist (before flag flip in production)

1. Set `NEXT_PUBLIC_CONFIRM_CHIPS_V1=1` in Vercel preview env.
2. Open preview URL. Send: `swap 1 USDC for SUI then save 0.5 USDC`.
3. Confirm chips render below the plan message after streaming settles.
4. Click `Confirm` → bundle dispatches as fast-path with `via=chip` in `dispatch_count` telemetry. Atomic 2-op tx lands on Suiscan.
5. Repeat the prompt. Click `Cancel` → "Cancelled by user — keeping the plan unchanged." appears as assistant turn. No bundle dispatched. `dispatch_count{outcome=cancelled}` fires.
6. Repeat the prompt. Wait 30s+ → "Quote expired" message appears, both chips locked.

If all 6 checks pass: flip `NEXT_PUBLIC_CONFIRM_CHIPS_V1=1` in production.

---

---

## TL;DR

Phase 2 adds a one-tap `Confirm` / `Cancel` chip below every multi-write Payment Stream plan turn. Chips POST to the same `/api/engine/chat` endpoint with `via=chip,value=yes|no`, where the chat route admits them through the existing fast-path with a new `admitted_via='chip'` tag. Free-text confirm (`yes` / `do it bro` / `vamos`) keeps working — chips are **additive**, not replacing.

**Three product locks (signed off 2026-05-04):**

| # | Decision | Choice |
|---|---|---|
| Q1 | Chip labels | **`Confirm`** (primary) / **`Cancel`** (secondary) |
| Q2 | Chip placement | **Inline at bottom of assistant message** |
| Q3 | Multi-step shape | **Per-message `type` discriminator** (`commit` ships in v1; `acknowledge` + `choice` deferred) |

**Scope guarantees for Phase 2 v1:**
- Engine: **NO changes**. Chips are an audric-host feature; engine doesn't need to know they exist (cross-host portability deferred to v2 if CLI/MCP ever want chips).
- Audric: ~600 LOC across new SSE event, decorator, route handler, `ConfirmChips` component, telemetry, tests.
- Backward-compat: old frontends without chip support fall through to free text → Phase 1 plan-context promotion → same outcome, one extra LLM turn.

**Ship target:** 1.5–2 weeks single audric commit. No engine release. Feature flag `NEXT_PUBLIC_CONFIRM_CHIPS_V1` (default OFF in prod until 24h soak passes).

---

## Why this doc exists / What's already shipped

Phase 1 (regex-free plan-context promotion) and Phase 1.5 (regex-miss + plan-context fast-path admission) shipped 2026-05-04 and are verified in production:

- **Pre-Phase-1 worst case:** 69,034 ms Haiku-lean ramble on `execute` regex miss
- **Post-Phase-1+1.5:** 17 ms fast-path bypass on `do it bro` plan-context match
- **4,000× improvement, atomicity preserved** (single 3-op PTB)

Phase 1 + 1.5 closed the **correctness** trap — the regex-chasing model is structurally dead. Free text now always works.

What's still missing: **a one-tap UX**. Median user wants to *click*, not *type*. Today they have to:
1. Read the plan card text ("Plan: 1) Swap... 2) Save... Confirm to proceed?")
2. Move hand to keyboard
3. Type `yes` or `confirm`
4. Hit Enter

Chips collapse steps 2-4 into one tap. Saves ~2-3 seconds per confirm and reduces input friction on mobile. **Not a correctness change — a UX upgrade.**

---

## Architecture — chips as the 4th channel

Phase 1.5 already tagged the fast-path admission cause with `admitted_via='regex' | 'plan_context'`. Phase 2 adds a third value: `'chip'`.

```
┌────────────────────────────────────────────────────────────┐
│  Assistant turn: prepare_bundle resolved → stash created   │
│  → final-text "Plan: 1)... 2)... 3)... Confirm to proceed?"│
│  → audric harness emits `expects_confirm` SSE event        │
└────────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   ┌─────────┐      ┌──────────────┐  ┌──────────────┐
   │  Chips  │      │  Inline edit │  │  Free text   │
   │ (NEW)   │      │ (deferred)   │  │ (Phase 1+1.5)│
   └─────────┘      └──────────────┘  └──────────────┘
        │                 │                 │
        ▼                 ▼                 ▼
   POST /chat       POST /chat        POST /chat
   { via:'chip',    { via:'edit', ... }  { via:'text',
     value:'yes' }                          message:'do it' }
        │                                   │
        ▼                                   ▼
   Fast-path        (deferred)         Phase 1+1.5 path:
   admitted_via                        - Phase 1: Sonnet promotion
     ='chip'                           - Phase 1.5: regex-miss + plan-ctx
        │                              - admitted_via='regex'|'plan_context'
        │                                   │
        └───────► consumeBundleProposal ────┘
                  ↓
                  pending_action SSE → PermissionCard renders → user taps Approve → bundle dispatches
```

### Why chips don't replace PermissionCard

Two distinct gates are at play:

| Gate | When | What | Phase 2 changes? |
|---|---|---|---|
| **A. Plan confirm** | After `prepare_bundle` resolves, before bundle dispatched | "Do you want this plan?" | **YES** — chips replace text-typing |
| **B. PermissionCard** | After fast-path emits `pending_action`, before signing | "Do you want this transaction signed?" | **NO** — Approve/Deny chips already exist |

Phase 2 lives entirely at Gate A. Gate B is unchanged. Auto-collapsing both gates into one tap (chip click → auto-approve PermissionCard) is **explicitly out of scope**. The PermissionCard's "look at the rendered transaction details before signing" pause is a deliberate safety surface; collapsing it would require its own product review.

(Sub-threshold writes that already auto-execute via USD-aware permissions don't show PermissionCard at all — same behavior, unchanged.)

---

## Locked decisions

Carrying forward from v0.1, plus today's product input:

| # | Question | Decision | Why |
|---|---|---|---|
| 1 | Chip labels | **`Confirm` / `Cancel`** | Matches existing assistant copy. Stripe/Linear/GitHub convention for financial actions. Locked 2026-05-04. |
| 2 | Chip placement | **Inline, bottom of assistant message** | Visual association with the plan. Mobile: full-width stacked buttons. Locked 2026-05-04. |
| 3 | Multi-step shape | **Per-message `type` discriminator: `'commit' \| 'acknowledge' \| 'choice'`** | Composes for any future flow shape. Phase 2 v1 ships `commit` only. Locked 2026-05-04. |
| 4 | Where does `expectsConfirm` live? | **Audric-side SSE event.** No engine changes for v1. | Phase 2 v1 doesn't need cross-host portability. Engine integration deferred to a future "Phase 2.5" if/when CLI or MCP host wants chips. Revises v0.1 decision #9. |
| 5 | Drop `CONFIRM_PATTERN` from fast-path bypass too? | **No.** Fast-path keeps strict regex matching for the canonical happy path. | Same reasoning as v0.1 lock #2 — false-positive on the regex path means dispatching a bundle the user didn't confirm. Different risk profile from promotion. |
| 6 | Should chips reuse the `pending_action` mechanism? | **Reuse.** Chip click → fast-path → `pending_action` → PermissionCard, identical downstream. | Don't fork the dispatch path. The only new code is the admission tag (`admitted_via='chip'`) and the SSE event the frontend listens for. |
| 7 | What does "Cancel" chip do? | **Synthetic `Cancelled by user — keeping the plan unchanged.` user message → engine narrates acknowledgment, stash discarded.** | Same code path as a user typing `no`. Don't fork. |
| 8 | Auto-dismiss chips on click? | **Yes.** Chip click immediately removes the chips + dims the input for 200ms. | Prevents accidental double-click double-dispatch. Cleaner conversation log. |
| 9 | Chip expiry tied to quote staleness? | **Yes for swap-bearing plans.** `expiresAt = quoteAt + 60s`. Other plans don't expire. | Mirrors PermissionCard's existing 60s deny-timer for quote-bearing bundles. UI shows greyed-out chips + tooltip after expiry. |
| 10 | Roll out behind a feature flag? | **Yes — `NEXT_PUBLIC_CONFIRM_CHIPS_V1`. Frontend-render gate ONLY.** Backend (decorator + SSE emission + chip POST handling) ships unflagged. Default OFF in prod until 24h soak. | Mirrors SPEC 13 Phase 3b's flag pattern. Backend-unflagged means we collect baseline `expects_confirm_set` telemetry from the moment commit 1 lands — answers "how often WOULD chips have rendered" before any user sees them. Backend ships in a no-op state until commit 2 + flag-on flips chips on. 1% → 10% → 50% → 100% over a week. |
| 11 | What if `expectsConfirm` SSE arrives but the stash is gone? | **Chip click POSTs as `via=chip,value=yes`. Fast-path finds no stash → `recordSkip('no_stash')` → falls through to plan-context promotion → Sonnet handles it as a text-equivalent.** | Graceful degradation. The user's intent is still communicated; path is one model-turn slower. |
| 12 | Server-set or LLM-set? | **Server-set (audric harness).** | LLM forgets fields. Audric inspects the bundle stash + final-text turn AFTER generation. Same lock as v0.1 #3. |
| 13 | Render chips on text-only messages too? | **No — Phase 2 v1 = bundle confirms only.** | Acknowledge / choice chips need their own product locks (deferred to Phase 2.5+). Don't expand surface area. |

---

## The contract

### Server-side SSE event: `expects_confirm`

Audric's chat route emits this event at the END of an assistant turn that had `prepare_bundle` resolve AND produced a final-text message. Frontend renders chips on the most recent assistant message in the same turn.

```typescript
// apps/web/lib/engine/sse-types.ts (new)

interface ExpectsConfirmSseEvent {
  type: 'expects_confirm';
  /** Phase 2 v1 ships 'commit' only. Forward-compat for 'acknowledge' / 'choice'. */
  variant: 'commit';
  /** Bundle stash ID — frontend echoes this back on chip click for telemetry only.
   *  Does NOT serve as auth — the chat route consumes the stash by sessionId. */
  stashId: string;
  /** Quote-staleness expiry. Greyed-out + tooltip past this. Optional —
   *  bundles without swaps don't have a quote and never expire. */
  expiresAt?: number; // epoch ms
  /** Number of writes in the bundle, surfaced in the chip's a11y label
   *  ("Confirm Payment Stream — 3 operations"). */
  stepCount: number;
}
```

**Where it's emitted:** in `app/api/engine/chat/route.ts`, after the assistant text turn finishes streaming AND before `controller.close()`. Decorator (`expectsConfirmDecorator`) inspects post-stream state and returns either an event or null.

### Wire format: chip click POST

Chip click hits the SAME `/api/engine/chat` endpoint as text input. New optional fields:

```typescript
// Existing chat POST body, extended:
{
  sessionId: string,
  walletAddress: string,
  message: string,                  // ← synthesized for back-compat: "yes" or "no"
  // [Phase 2] NEW fields:
  via?: 'chip' | 'text',            // defaults to 'text' when omitted (back-compat)
  value?: 'yes' | 'no',             // only meaningful when via='chip'
  forStashId?: string,              // echo of stashId — used for telemetry, NOT auth
}
```

Server-side handling in `chat/route.ts`:

1. **`via === 'chip' && value === 'yes'`** → call `tryConsumeFastPathBundle({ forceAdmit: 'chip' })`. Bypasses intent checks (regex, plan-context, negative-reply); session/stash/wallet checks still run. Tags `admitted_via=chip` on the dispatch counter.
2. **`via === 'chip' && value === 'no'`** → step 1: call `deleteBundleProposal(sessionId)` to reap the stash explicitly (closes the ghost-dispatch race where a delayed "yes" would otherwise dispatch the cancelled bundle). Step 2: synthesize user message `"Cancelled by user — keeping the plan unchanged."` → engine handles via Sonnet (Phase 1 plan-context promotion still fires for narration quality, and Phase 1.5's `looksLikeNegativeReply` gate ensures the fast-path doesn't accidentally dispatch on this synthetic message).
3. **`via === 'text'` (or omitted)** → existing Phase 1+1.5 path. Unchanged.

### Engine: NO changes in v1

The engine doesn't need to know about chips. The chat route is purely an audric host concern. This deviates from v0.1 lock #9 (which proposed engine type changes) — revised because:

- Cross-host portability isn't needed for v1 (only audric/web has chips)
- Engine release adds friction (CI + npm publish + audric bump) that we don't need to pay for
- Adding the field later (v2) is non-breaking — old engine consumers ignore unknown SSE events

Future Phase 2.5 (deferred): if CLI/MCP hosts want chips, promote `expects_confirm` to an engine `EngineEvent` discriminated-union member. Engine bumps to minor; audric continues passing through.

---

## Audric implementation

### File-level changes

| File | Change | LOC | Risk |
|---|---|---|---|
| `apps/web/lib/engine/expects-confirm-decorator.ts` (new) | Server-side function: inspect bundle-stash state + assistant turn → return `ExpectsConfirmSseEvent \| null`. Uses **existing** `readBundleProposal` (read without DEL) — does NOT need a new `peekBundleProposal` helper. | ~75 | Low |
| `apps/web/lib/engine/__tests__/expects-confirm-decorator.test.ts` (new) | 12+ unit tests: stash exists, no stash, prepare-bundle wasn't called this turn, swap quote expires at, swapless bundle no-expiry, decorator does NOT consume stash | ~150 | Low |
| `apps/web/app/api/engine/chat/route.ts` | (1) After fast-path + assistant turn streams, call decorator + emit `expects_confirm` SSE if non-null. (2) Handle `via=chip,value=yes` POST body — call `tryConsumeFastPathBundle({ forceAdmit: 'chip' })` (skips intent checks, keeps session/stash/wallet checks). (3) Handle `via=chip,value=no` — call **`deleteBundleProposal(sessionId)` first** (prevents ghost-dispatch if user later types "yes"), then synthesize `Cancelled by user — keeping the plan unchanged.` user message → engine narrates. | ~90 | Medium |
| `apps/web/lib/engine/__tests__/chat-route-chip.test.ts` (new) | Integration tests: chip-yes dispatches bundle, chip-no narrates cancellation, chip-yes with no-stash falls through to plan-context, expired stash → degrade to free-text | ~180 | Medium |
| `apps/web/lib/engine/fast-path-bundle.ts` | Extend `AdmittedVia` union to include `'chip'`. Extend `tryConsumeFastPathBundle` opts with `forceAdmit?: 'chip'`. **When set:** skip the user-intent checks (`isAffirmativeConfirmReply`, `looksLikeNegativeReply`, `detectPriorPlanContext`). **Still run:** session-validity (`no_session`, `no_wallet`), stash existence (`consumeBundleProposal` returns null → `no_stash`), wallet match (`wallet_mismatch`). Chip is a 100% intent signal but NOT a session-state signal. | ~30 | Low |
| `apps/web/lib/engine/__tests__/fast-path-bundle.test.ts` | Add `admitted_via=chip` test cases (forceAdmit path) | ~40 | Low |
| `apps/web/components/engine/ConfirmChips.tsx` (new) | Two-button chip component: `Confirm` (primary) + `Cancel` (secondary). Keyboard (Cmd/Ctrl+Enter, Esc), expiry handling, click handler, a11y. Mobile: full-width stacked. | ~140 | Medium (UI surface) |
| `apps/web/components/engine/__tests__/ConfirmChips.test.tsx` (new) | Unit tests: render, click, expiry-greyed, keyboard, a11y label structure | ~100 | Low |
| `apps/web/components/engine/ChatMessage.tsx` (or `MessageRenderer`) | Wire `<ConfirmChips />` to render below assistant message when `expects_confirm` event has arrived for this message id | ~30 | Medium |
| `apps/web/lib/use-engine.ts` (or wherever SSE events are reduced into state) | Handle the new `expects_confirm` event — attach to message state by turn boundary | ~25 | Medium |
| `apps/web/lib/engine/plan-context-metrics.ts` | Add `audric.confirm_flow.dispatch_count` counter (tags: `via`, `outcome`). Add `audric.confirm_flow.expects_confirm_set` counter. | ~30 | Low |
| `apps/web/lib/engine/__tests__/plan-context-metrics.test.ts` | Tests for new counters | ~40 | Trivial |
| `apps/web/lib/engine/spec-consistency.ts` | New assertion `EXPECTS_CONFIRM_DECORATOR_PRESENT` — verify the decorator export exists. New assertion `FAST_PATH_CHIP_ADMISSION` — verify `forceAdmit='chip'` path exists in fast-path. Bump count 17 → 19. | ~25 | Low |
| `apps/web/lib/engine/spec-consistency.test.ts` | Bump expected count + ID list | ~5 | Trivial |
| `apps/web/lib/env.ts` | Add `NEXT_PUBLIC_CONFIRM_CHIPS_V1` to client schema (boolean, default false) | ~5 | Trivial |
| `spec/SPEC_8_CORPUS.md` | Add P0-13 (chip Confirm), P0-14 (chip Cancel), P0-15 (chip after stash expiry → degrades to free text), P0-16 (rapid double-click race), P0-17 (chip click while user typing in input) | ~50 | — |
| `spec/SPEC_15_CONFIRM_FLOW_DESIGN.md` | Bump v0.2 → v0.3 once Phase 2 ships, append "Phase 2 — Chips shipped" section with prod verification | ~30 | — |

**Total Phase 2 v1:** ~1,040 LOC including tests. Single audric commit (or 3 logical commits: backend, frontend, telemetry). No engine release. **Estimated effort: 1.5–2 weeks.**

### Decorator logic detail

```typescript
// apps/web/lib/engine/expects-confirm-decorator.ts — sketch

import type { ExpectsConfirmSseEvent } from './sse-types';
import { readBundleProposal } from './bundle-proposal-store';
import { __testOnly__ } from './confirm-detection';

interface DecoratorInput {
  sessionId: string;
  /** Did the just-finished assistant turn call prepare_bundle? */
  preparedBundleThisTurn: boolean;
  /** assistantContent of the just-finished turn — last text block content */
  finalText: string | undefined;
}

// Reuse the EXISTING marker from confirm-detection.ts to avoid drift.
// (Phase 1 + 1.5 already validated this regex against production traffic;
// duplicating it here would invite skew the next time the planner copy
// changes.)
const { PRIOR_PLAN_MARKER } = __testOnly__;

export async function expectsConfirmDecorator(
  input: DecoratorInput,
): Promise<ExpectsConfirmSseEvent | null> {
  // Phase 2 v1 scope: bundle confirms only. Acknowledge + choice
  // are deferred (would need product input + their own decorator
  // branches).
  if (!input.preparedBundleThisTurn) return null;

  // Stash MUST exist — otherwise the user can click but the click
  // dispatches nothing. The frontend handles graceful no-stash
  // degradation, but we don't render chips for a no-op state.
  // Uses readBundleProposal (1 RTT, GET only) — NOT consumeBundleProposal
  // (2 RTT, GET+DEL), because the decorator runs at end-of-stream
  // BEFORE the user has chip-clicked. Consuming here would dispose
  // the stash before the chip click can use it.
  const stash = await readBundleProposal(input.sessionId);
  if (!stash) return null;

  // Belt-and-suspenders: only render chips if the assistant text
  // actually asks for a confirmation. Prevents false-positive chip
  // render on a turn that prepared the bundle but for some reason
  // narrated something else (e.g. clarifying question that ALSO
  // happens to call prepare_bundle).
  if (!input.finalText || !PRIOR_PLAN_MARKER.test(input.finalText)) return null;

  // Quote-bearing bundles get a 60s expiry tied to the bundle's
  // own expiresAt (which the prepare-bundle tool already set to
  // ~quoteAt + 60s on swap-bearing proposals). Other bundles never
  // expire client-side; their stash TTL still kicks in server-side.
  const hasSwap = stash.steps.some((s) => s.toolName === 'swap_execute');
  const expiresAt = hasSwap ? stash.expiresAt : undefined;

  return {
    type: 'expects_confirm',
    variant: 'commit',
    stashId: stash.bundleId,
    expiresAt,
    stepCount: stash.steps.length,
  };
}
```

**Existing primitives used (no new helpers needed):**
- `readBundleProposal(sessionId)` — already exported from `bundle-proposal-store.ts`. Returns the proposal without consuming it. 1 Redis RTT (~50-80ms on Upstash global). Cheap enough to run on every plan turn, even when the env flag is OFF (collects baseline telemetry).
- `consumeBundleProposal(sessionId)` — already exported. Used by `tryConsumeFastPathBundle` on chip-Yes click (existing behavior, unchanged).
- `deleteBundleProposal(sessionId)` — already exported. **Phase 2 ADDS one new caller:** the chip-No / chip-Cancel branch in `chat/route.ts`. Reaps the stash explicitly so a delayed "yes" can't ghost-dispatch a cancelled bundle.

### Frontend `ConfirmChips` component sketch

```typescript
// apps/web/components/engine/ConfirmChips.tsx — sketch

interface ConfirmChipsProps {
  expectsConfirm: ExpectsConfirmSseEvent;
  onResolve: (value: 'yes' | 'no') => Promise<void>;
}

export function ConfirmChips({ expectsConfirm, onResolve }: ConfirmChipsProps) {
  const [resolved, setResolved] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Re-render every 1s if expiry is set (greyed-out tick)
  useEffect(() => {
    if (!expectsConfirm.expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expectsConfirm.expiresAt]);

  const expired = expectsConfirm.expiresAt
    ? now >= expectsConfirm.expiresAt
    : false;

  const handle = async (value: 'yes' | 'no') => {
    if (resolved || expired) return;
    setResolved(true);
    await onResolve(value);
  };

  // Keyboard: Cmd/Ctrl+Enter = Confirm, Esc = Cancel
  useEffect(() => {
    if (resolved) return;
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handle('yes');
      if (e.key === 'Escape') handle('no');
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [resolved, expired]);

  if (resolved) return null; // auto-dismiss

  return (
    <div
      role="group"
      aria-label={`Confirm Payment Stream — ${expectsConfirm.stepCount} operations`}
      className="flex gap-2 mt-2"
    >
      <button
        onClick={() => handle('no')}
        disabled={expired}
        className="flex-1 rounded-lg border border-border-subtle bg-surface-page py-2 text-xs font-medium text-fg-secondary hover:text-fg-primary disabled:opacity-50"
        aria-keyshortcuts="Escape"
      >
        Cancel
      </button>
      <button
        onClick={() => handle('yes')}
        disabled={expired}
        className="flex-1 rounded-lg bg-fg-primary py-2 text-xs font-semibold text-fg-inverse hover:opacity-90 disabled:opacity-50"
        aria-keyshortcuts="Meta+Enter Control+Enter"
      >
        {expired ? 'Quote expired' : 'Confirm'}
      </button>
    </div>
  );
}
```

---

## Telemetry

New counters (extend `apps/web/lib/engine/plan-context-metrics.ts`):

```typescript
audric.confirm_flow.expects_confirm_set
  tags: {
    has_swap: 'true' | 'false',     // bundles with swap_execute carry expiresAt
    step_count_bucket: '2' | '3' | '4',  // post-Phase-3a: max=4
  }

audric.confirm_flow.dispatch_count
  tags: {
    via: 'chip' | 'text',           // 'edit' deferred to Phase 2.5+
    outcome: 'dispatched' | 'cancelled',
    admitted_via: 'chip' | 'regex' | 'plan_context',  // for via='text', mirror fast-path
    step_count_bucket: '2' | '3' | '4',
  }
```

Extend existing counter (no schema change, just new tag value):

```typescript
audric.bundle.fast_path_dispatched
  tags: {
    step_count: ...,
    admitted_via: 'regex' | 'plan_context' | 'chip',  // 'chip' is NEW
  }
```

### Soak ratios to watch post-launch

| Metric | Target | Tells us |
|---|---|---|
| Chip adoption: `dispatch_count{via=chip} / dispatch_count{*}` | ≥ 60% within 14 days | Users prefer the chip over typing |
| Text fallback p50 latency | ≤ 3,000 ms | Phase 1+1.5 path stays healthy when chips don't fire |
| `expects_confirm_set / prepare_bundle_resolved` | ≈ 100% | Decorator fires when it should |
| `dispatch_count{outcome=cancelled,via=chip} / dispatch_count{via=chip}` | < 10% | False-positive chip render rate (chips appearing when user actually wanted to modify, not commit) |
| Double-dispatch rate | 0 | R2 mitigation holds |

---

## Risks (from v0.1, updated for Phase 2 v1)

### R1 — Chips render on a turn where they shouldn't

**Scenario:** Decorator heuristic mis-fires. Most likely path: assistant calls `prepare_bundle` in turn N, the stash exists, but the final-text on the SAME turn is a clarifying question ("Do you want me to swap into USDsui or vSUI first?") rather than a plan-with-confirm-prompt.

**Probability:** Medium.
**Impact:** Low. User taps Confirm → fast-path consumes stash → bundle dispatches with whatever was prepared. If prepared was wrong (the LLM intended to clarify, not commit), the user has to cancel via PermissionCard.

**Mitigation:**
1. Decorator's `PLAN_MARKER` regex requires the text to contain `confirm` / `proceed` / `approve` AND end in `?`. Tightens the false-positive surface.
2. Telemetry tag `outcome=cancelled,via=chip` — if this ratio crosses 10%, the heuristic is firing too liberally and we tighten further.
3. **Locked invariant:** Phase 2 v1 only renders chips when `prepare_bundle` was called THIS TURN. Stash from a prior turn doesn't trigger chips on a fresh turn (would feel ghost-y).

### R2 — Double-dispatch race (chip click + text submit in quick succession)

**Scenario:** User taps Confirm chip → 50ms later, presses Enter on a queued `yes` they were about to send. Two POSTs hit `/api/engine/chat` for the same session.

**Probability:** Medium.
**Impact:** **Critical** — double-spend if both dispatch.

**Mitigation:**
1. **Load-bearing:** `consumeBundleProposal` is atomic (Redis `GET + DEL`). Whichever request wins gets the stash; loser sees `no_stash` → `recordSkip('no_stash')` → falls through to plan-context promotion → engine narrates "already dispatched" naturally.
2. UI: chip click immediately auto-dismisses chips (`setResolved(true)`) AND dims text input for 200ms. Reduces race window without blocking.
3. `attemptId` deduplication on the resume route — even if both POSTs reached fast-path, `updateMany({ where: { attemptId }})` collides cleanly per Spec 1 Item 3.

### R3 — `expects_confirm` SSE event lost (frontend connection drops)

**Scenario:** Network blip drops the SSE event between `text_delta` and `expects_confirm`. Assistant message renders without chips. User has to type instead.

**Probability:** Low (SSE is in-order over HTTP/1.1 within a single response).
**Impact:** Low — degrades to free-text path → Phase 1+1.5 catches it.

**Mitigation:**
1. Emit `expects_confirm` BEFORE `turn_complete` so the close handler sees both or neither.
2. Frontend logs `[chip] no expectsConfirm event` warning when an assistant message resolves without chips after a `prepare_bundle` tool_use was observed in the same turn — operators can grep.

### R4 — Chip-click POST hits `/chat` while engine is mid-stream

**Scenario:** User is fast — taps Confirm before the SSE stream finishes. Chat route receives chip POST while a prior session lock is still held.

**Probability:** Low (stream finishes ≤ 100ms post-`expects_confirm` for fast-path turns).
**Impact:** Low — session lock returns 409, frontend retries with backoff.

**Mitigation:**
1. Frontend doesn't enable chips until the assistant turn's `turn_complete` event has been seen.
2. If chips are clicked early, frontend queues the POST and waits for stream-close.

### R5 — Chip a11y / keyboard parity

**Scenario:** Screen reader user can't tell chips are interactive. Keyboard-only user can't trigger Cancel without mouse.

**Probability:** Medium (a11y bugs are common in custom components).
**Impact:** Medium — excludes accessibility-dependent users.

**Mitigation:**
1. `role="group"` on chip container, `aria-label` describing the action.
2. `aria-keyshortcuts="Meta+Enter Control+Enter"` on Confirm, `aria-keyshortcuts="Escape"` on Cancel.
3. Focus management: when `expects_confirm` arrives, auto-focus the Confirm chip (allows immediate Enter without keyboard nav).
4. Test with VoiceOver + JAWS (manual QA, gated on rollout).

### R6 — Spec drift: new write tools added without updating the bundle stash flow

**Scenario:** Future PR adds a write tool (e.g., `subscribe`) and includes it in `prepare_bundle`'s allowed tools, but the chip flow doesn't know about it. Chip click → fast-path → stash dispatches → SDK rejects the unknown tool.

**Probability:** Low (would also break SPEC 14, not just chips).
**Impact:** Low (rejects at compose time, not on-chain).

**Mitigation:** Spec consistency assertion `BUNDLE_STASH_TOOL_COVERAGE` — walks the engine's bundleable-tool registry and asserts every entry has a `describeStep` case in `fast-path-bundle.ts`. Already in the SPEC 14 invariant set.

### R7 — Ghost-dispatch race (Cancel chip then delayed "yes")

**Scenario:** User clicks Cancel chip → engine narrates "cancelled" → 30 seconds later (still within the bundle's 60s TTL) user types "yes" thinking they changed their mind. Without explicit cleanup, the still-living stash gets consumed by the fast-path → bundle dispatches → result contradicts the cancellation narration the user just saw.

**Probability:** Medium-low (humans do change their minds quickly).
**Impact:** **High (correctness)** — funds move when the conversation said they wouldn't.

**Mitigation:**
1. **Load-bearing:** `via=chip,value=no` calls `deleteBundleProposal(sessionId)` IMMEDIATELY (one Redis RTT, before the synthetic "Cancelled…" message even hits the engine). Closes the race deterministically — once cancelled, the stash is gone, period.
2. Test P0-14 specifically asserts this race is closed (chip cancel → 30s wait → typed yes → no_stash skip → no dispatch).
3. Telemetry: `audric.confirm_flow.dispatch_count{outcome=cancelled,via=chip}` counts cancellations; if we ever see a `dispatched` event for the same `sessionId+bundleId` AFTER a `cancelled` event, that's the regression alarm.

### R8 — Mobile chip ergonomics

**Scenario:** On small screens, chips push the chat input down → user can't see what they're confirming.

**Probability:** Medium (not all confirm cards fit in one viewport on mobile).
**Impact:** Low (annoyance, not correctness).

**Mitigation:**
1. Chips are full-width stacked on `< sm` breakpoint (vertical layout).
2. On chip click, scroll the page so the assistant message is in view (smooth scroll, brief).

---

## Test plan

### Unit tests (vitest)

- `expects-confirm-decorator.test.ts` (12 tests)
  - Stash exists + plan marker + prepare_bundle this turn → returns event
  - Stash exists + no plan marker → returns null
  - Stash missing → returns null
  - prepare_bundle wasn't called this turn → returns null
  - Bundle has swap → expiresAt = quoteAt + 60s
  - Bundle has no swap → expiresAt undefined
  - stepCount surfaced on event
  - Decorator does NOT consume stash (peek only)

- `ConfirmChips.test.tsx` (10 tests)
  - Renders Confirm + Cancel buttons
  - Click Confirm → onResolve('yes')
  - Click Cancel → onResolve('no')
  - Auto-dismisses after click
  - Disabled past `expiresAt`
  - Cmd+Enter triggers Confirm
  - Esc triggers Cancel
  - aria-label includes step count
  - Mobile: stacked layout class applied at `< sm`
  - Greyed-out + "Quote expired" when expired

- `chat-route-chip.test.ts` (10 tests)
  - via=chip,value=yes → fast-path called with forceAdmit='chip'
  - via=chip,value=no → `deleteBundleProposal` called BEFORE engine receives synthetic "Cancelled by user…" message
  - via=chip,value=no,delayed-yes-typed-30s-later → second POST sees no_stash → ghost-dispatch race CLOSED (regression test for gap #2)
  - via=chip,value=yes,no-stash → falls through to plan-context promotion
  - via=text → existing path unchanged
  - chip dispatch tags admitted_via=chip on counter
  - chip cancel tags outcome=cancelled
  - via missing → defaults to text (back-compat)
  - chip POST without sessionId → 400
  - via=chip skips intent checks but `wallet_mismatch` skip still fires when stash wallet ≠ request wallet

### Integration tests

- `MessageRenderer.test.tsx`: assistant message + expects_confirm event → chips render below the message
- `useEngine.test.ts`: SSE event reducer attaches expects_confirm to correct message id

### Corpus additions (`SPEC_8_CORPUS.md`)

- **P0-13** — Chip Confirm. User asks for "swap 0.5 USDC, save USDsui, send 0.05 to Mom". Plan turn renders chips. User clicks Confirm. Bundle dispatches as one atomic PTB.
- **P0-14** — Chip Cancel + delayed-yes (ghost-dispatch race). Same prompt. User clicks Cancel. 30s later user types "yes" thinking they changed their mind. Expected: the second turn sees no_stash → plan-context promotion → Sonnet replies "I don't have an active plan — what would you like to do?". Atomicity invariant: the cancelled bundle must NOT dispatch under any timing. Regression test for gap #2.
- **P0-15** — Chip after stash expired (≥ 60s, swap-bearing bundle). Chip click → no_stash → falls through to plan-context promotion. Sonnet handles re-quote.
- **P0-16** — Rapid double-click. Two clicks within 100ms. First wins; second sees auto-dismissed UI + atomic stash drain.
- **P0-17** — Chip click while user typing. User has "yes pl" in input field. Chip click fires; text input dims for 200ms; user's pending text stays in the input but DOESN'T submit (input dim is suggestive).

### Manual QA checklist (gated on 1% rollout)

- [ ] VoiceOver: announces "Confirm Payment Stream, 3 operations, button" on chip focus
- [ ] JAWS: same a11y label structure
- [ ] iPhone Safari: full-width stacked chips, smooth scroll on click
- [ ] Pixel Chrome: same
- [ ] Tab order: Confirm chip is in the natural tab order after the message text
- [ ] Esc closes any modal AND triggers Cancel chip if focused
- [ ] Double-click prevention: 50 rapid clicks → 1 dispatch

---

## Day-by-day rollout

### Week 1

**Day 1 — Telemetry + decorator.**
- Add `dispatch_count` + `expects_confirm_set` counters
- Implement `expects-confirm-decorator.ts` (uses existing `readBundleProposal`, no new helper) + 12 unit tests
- Pass `pnpm test + typecheck + lint` clean

**Day 2 — Backend wiring.**
- Extend `tryConsumeFastPathBundle` with `forceAdmit` opt
- Modify chat route: emit `expects_confirm` SSE post-stream + handle `via=chip` POST
- Add 8 chat-route-chip integration tests
- Pass `pnpm test`

**Day 3-4 — Frontend.**
- Build `ConfirmChips.tsx` + 10 unit tests
- Wire into `ChatMessage.tsx` / `MessageRenderer`
- Wire SSE event reducer in `use-engine.ts`
- Pass `pnpm test`

**Day 5 — End-to-end.**
- Manual smoke in DEV: chip render → click → bundle settles
- Manual smoke: chip cancel → narration
- Manual smoke: stash expiry → degrade to text
- Spec consistency assertions added (17 → 19)

### Week 2

**Day 6 — Soak prep.**
- Save Vercel Observability queries for chip adoption, double-dispatch rate, expects_confirm_set rate. Counters route automatically through `VercelTelemetrySink` (`apps/web/lib/engine/vercel-sink.ts`) — both as `{ kind: 'metric', ... }` structured logs (queryable in the Observability tab) and as `@vercel/analytics` `track()` events (visible in the Analytics tab). No new ingestion pipeline.
- Add `NEXT_PUBLIC_CONFIRM_CHIPS_V1` env flag (default OFF)
- Push to main; Vercel auto-deploys; flag remains OFF

**Day 7-8 — 1% rollout.**
- Flip flag to 1% via Vercel split (or feature-flag SDK if installed)
- 24h soak: monitor counters, review for double-dispatch (R2), false-positive chips (R1), accessibility issue reports
- Manual QA pass on iOS + Android + screen readers

**Day 9-12 — Gradual ramp.**
- 1% → 10% (24h) → 50% (24h) → 100% (24h, only if all metrics healthy)
- Revert criteria: any of:
  - Double-dispatch rate > 0
  - `dispatch_count{outcome=cancelled,via=chip}` > 15%
  - p50 chip-to-dispatch latency > 500 ms
  - Any P0 a11y regression

**Day 13-14 — Lock in.**
- Update SPEC 15 v0.2 → v0.3 with Phase 2 shipped section + prod verification
- Add P0-13..P0-17 to `SPEC_8_CORPUS.md`
- Bump engine consumer count or add note that audric is the lone Phase 2 v1 consumer

---

## Open questions deferred to Phase 3+

These were identified during Phase 2 design but explicitly OUT OF SCOPE for v1. Each becomes its own design draft when ready.

### Phase 2.5 — Inline edit channel

When user wants to commit "yes BUT change leg 3 amount to 0.1": chips can't express this — needs an inline editor on the modifiable field, then a Confirm. Partially specced via `modifiableFields` on `PendingActionStep` (Spec 1 Item 6) but not yet wired into the plan-confirm flow. Requires:
- New `expectsConfirm.variant: 'commit_with_edits'`
- New chip variant: `[Confirm] [Edit & confirm] [Cancel]`
- Reuse `ModifiableField` component from `PermissionCard`

### Phase 2.5 — `acknowledge` chip variant

For slippage warnings + fee notices: single "Got it" button. Requires:
- `expectsConfirm.variant: 'acknowledge'`
- New decorator branch (heuristic for "this turn was a warning, not a plan")
- Engine: optional `acknowledgmentRequired: true` on tool result (engine-side change)

### Phase 2.5 — `choice` chip variant

For "Save as USDC or USDsui?": N buttons, each POSTing a different free-text reply. Requires:
- `expectsConfirm.variant: 'choice'` with `options: Array<{ label, value }>`
- Frontend: dynamic-N button row (max 4 visible, overflow → "More…" dropdown)
- Decorator: heuristic to detect choice-shaped questions (regex on assistant text — questionable; alternative is server-side LLM classifier turn, expensive)

### Phase 3 — Voice mode integration

Voice users can't see chips. Need spoken cues: "I've prepared 3 operations. Say *confirm* or *cancel*." Phase 1+1.5 handles this for FREE-text inputs (transcript "yeah do it" promotes to Sonnet, fast-path admits via plan_context). What's missing: the spoken plan readout. Out of scope until voice mode lands as a product surface.

### Phase 3 — Multilingual chip labels

Chip labels are currently English-only. Once i18n lands (separate project), `Confirm` / `Cancel` must localize. Requires:
- i18n bundle entry for the two strings
- Decorator: emit lang hint based on user's recent message language detection (already collected in `plan-context-metrics.ts`)

### Phase 3 — Chip auto-approve PermissionCard

Today: chip click → fast-path → PermissionCard renders → user taps Approve (2 taps total). Compress to 1 tap by carrying chip-confirmed signal through to PermissionCard, which then renders in "auto-approving in 3s" mode (cancel still possible). Risk: removes the "look at the rendered transaction details before signing" pause; needs product review. Deferred.

---

## Cross-references

- Phase 1 + 1.5 implementation:
  - `apps/web/lib/engine/confirm-detection.ts` (`detectPriorPlanContext`, `looksLikeNegativeReply`)
  - `apps/web/lib/engine/fast-path-bundle.ts` (`tryConsumeFastPathBundle`, `AdmittedVia`)
  - `apps/web/lib/engine/engine-factory.ts` (Sonnet promotion gate)
- Bundle stash mechanism:
  - `apps/web/lib/engine/bundle-proposal-store.ts` — Phase 2 reuses existing exports (`readBundleProposal` for the decorator, `consumeBundleProposal` for chip-Yes via fast-path, `deleteBundleProposal` for chip-Cancel ghost-dispatch closure). No new helpers added.
  - `SPEC_14_PREPARE_BUNDLE_PLAN_TIME_COMMITMENT.md`
- PermissionCard + PendingAction (downstream of Gate A):
  - `apps/web/components/engine/PermissionCard.tsx` (lines 614–728 = bundle render branch)
  - `packages/engine/src/types.ts` (`PendingAction`, `PendingActionStep`, `PendingActionModifiableField`)
- Multi-write Payment Stream:
  - `SPEC_7_MULTI_WRITE_PTB.md`
  - `SPEC_13_PHASE3_DESIGN.md` (DAG-aware validator, cap=4)
- Telemetry scaffolding:
  - `apps/web/lib/engine/plan-context-metrics.ts`
  - `packages/engine/src/telemetry.ts`
- Env validation gate:
  - `apps/web/lib/env.ts` (`NEXT_PUBLIC_CONFIRM_CHIPS_V1` add)
  - `.cursor/rules/env-validation-gate.mdc`
- Corpus tests:
  - `SPEC_8_CORPUS.md` (P0-13..P0-17 to add)
- Confirm-flow ancestor doc:
  - `SPEC_15_CONFIRM_FLOW_DESIGN.md` v0.2 (Phase 1 + 1.5 shipped 2026-05-04)

---

## Implementation guardrails (locked from this design)

These hold true after Phase 2 v1 ships:

1. **Engine isn't aware of chips.** v1 = audric-only. Cross-host portability is Phase 2.5+.
2. **Chips are additive.** Free-text path (Phase 1+1.5) keeps working. Old frontends without chip support degrade gracefully.
3. **Two gates are preserved.** Plan confirm (Gate A) is chip-driven; PermissionCard (Gate B) stays as-is. Don't collapse them in v1.
4. **Stash atomicity is the load-bearing primitive.** All double-dispatch defenses route back to Redis `GET + DEL`. Don't add lock-based coordination.
5. **Phase 2 v1 = bundle confirms only.** Acknowledge + choice variants are explicitly Phase 2.5+. Don't expand surface area.
6. **Server-set, not LLM-set.** Decorator inspects state post-stream. LLM doesn't decide whether chips render.
7. **Telemetry tag `admitted_via=chip` is the contract.** Without it, we can't tell chip dispatches from regex/plan-context dispatches in soak.
8. **Feature flag `NEXT_PUBLIC_CONFIRM_CHIPS_V1` is mandatory for rollout AND is frontend-render-only.** Backend (decorator, SSE emission, chip POST handling) ships unflagged so baseline telemetry (`expects_confirm_set`) collects from commit-1-merge onward. Default OFF in prod until 24h 1% soak passes; frontend gates on flag, backend doesn't.
9. **Cancel chip MUST explicitly delete the stash via `deleteBundleProposal(sessionId)`.** Relying on TTL alone admits a ghost-dispatch race: user clicks Cancel → narration "cancelled" → 30s later user types "yes" → fast-path consumes the still-living stash → bundle dispatches despite the cancellation narration. The explicit delete closes the race in one Redis RTT.
10. **Decorator uses `readBundleProposal` (1 RTT, GET only), NOT `consumeBundleProposal` (2 RTT, GET+DEL).** The decorator runs at end-of-stream BEFORE the chip click; consuming would dispose the stash before the user can use it.
11. **`forceAdmit='chip'` skips intent checks ONLY.** Session validity (sessionId, walletAddress), stash existence, and wallet-mismatch checks ALL still run. Chip is a 100% intent signal but NOT a session-state signal.

---

## Sign-off checklist before coding

- [x] Q1 chip labels — locked: Confirm / Cancel
- [x] Q2 placement — locked: inline bottom of message
- [x] Q3 multi-step shape — locked: type discriminator, v1 ships `commit` only
- [x] Server-set vs LLM-set — locked: server-set
- [x] Engine vs audric — locked: audric-only for v1
- [ ] Design review pass on `ConfirmChips.tsx` styling against Agentic Design System (defer to design partner)
- [ ] Vercel Observability query strings drafted for chip adoption + double-dispatch monitoring (counters auto-emit via `VercelTelemetrySink`; saved queries are the only artifact to add)
- [ ] Manual QA plan reviewed (a11y, mobile, screen readers)
- [ ] Feature flag wiring confirmed in `lib/env.ts` schema
- [ ] PR plan: 1 commit or 3 (backend / frontend / telemetry)? Recommend 3 for review ergonomics.
