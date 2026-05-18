# SPEC 21 — Agent Harness UX Polish

**Status:** **v0.1 LOCKED 2026-05-09 ~20:00 AEST (S.139)** — all 9 D-questions locked to founder-approved recommendations. Implementation begins after SPEC 20 closes.
**Owner:** Founder + assistant
**Slot:** Immediately after SPEC 20 closes; before SPEC 11 (PayButton inherits the polished harness, not the rough one)
**Estimated effort:** ~4.5d total (2d streaming choreography + 1d narration discipline + 1d thinking visibility + 0.5d card-vs-prose contract)
**Locked sequencing:** **21.1 → 21.2 → 21.3 → 21.4** (founder approved 2026-05-09 ~19:50 AEST)
**Triggered by:** S.137 acceptance smoke surfaced 5 new UX findings (S19-F3..F7). 4 of them close in this SPEC; the 5th (S19-F7 stale route) closes structurally in SPEC 20.2 (pre-SPEC-21).
**Founder framing:** "the harness should stream like magic with transitions" — UX-class work distinct from SPEC 20's perf architecture work. Tactical prompt-nudging has been tried (S.126) and decays; this SPEC is the structural answer.

---

## TL;DR

S.137's 5 new UX findings share a common root: **the LLM is the source of truth for narration, but the LLM's context is messy.** Symptoms:

- **S19-F3 — visible repetitive thinking** ("Same request as before", "Same pattern as before") on bundle saturation turns 8/9/10
- **S19-F4 — full tx hash dropped into narration prose** ruins line layout and is redundant (card already shows it)
- **S19-F5 — stray `</thinking>` literal in text content** (turn 4) — engine `stripPseudoThinking` regex misses orphan closing tags
- **S19-F6 — smushed text + state contradiction** ("Executing now.The quote expired") — missing space + LLM contradicting itself in one sentence
- **S19-F7 — quote-card route mismatch** (turn 3) — narration cites OBRIC route, card cites CETUS route. Same class as S19-F2 (LLM cites stale route). **Closes in SPEC 20.2, NOT this SPEC.**

The 4 in-scope findings are not random. They're symptoms of three structural gaps:

1. **No state-transition vocabulary** — UI shows "TASK INITIATED" → silence → giant narration block. No magic-feel transitions between routing/quoting/confirming/settling. Founder asked for "stream like magic with transitions" — this is the gap.
2. **No card-vs-prose contract** — system prompt doesn't tell the LLM what belongs on the card vs. in the prose. Result: tx hashes, route descriptions, full balance breakdowns get duplicated in prose, often with stale data (because LLM's context is older than the card's data).
3. **No thinking visibility policy** — native `thinking` content blocks render unconditionally. Useful on turn 1; pure noise by turn 8 ("Same pattern again"). Need a render-time + system-prompt policy for when thinking adds signal vs. when it's spam.

**Targets:**
- 0 raw tx hashes in narration prose across 11-prompt smoke
- 0 stray `<thinking>` or `</thinking>` literals visible in UI text
- 0 "Same request as before" / "Same pattern" meta-thinking in repeated bundles
- Prose narration ≤ 80 chars per turn (1-sentence ack contract)
- Stream events emit on every state transition (routing → quoting → confirming → settling → done)
- Quote card renders ≤ 200ms after `routing` event fires (no perceived latency between transition copy and card render)

**Out of scope:**
- Any LLM model / prompt-tier work that affects accuracy (S.126 + SPEC 19 covered that)
- Any perf work (SPEC 19 + SPEC 20 covered that)
- Pre-SPEC-21 UX surface beyond agent-harness (e.g., dashboard, settings, payment-link UX — all separate SPECs if needed)
- New canvas templates (this SPEC polishes existing chat surface, not new visualizations)
- Mobile-specific responsive polish (separate sweep if needed; not surfaced in S.137)

---

## Background — what S.137 surfaced

The acceptance smoke for SPEC 19 v1.24.14 (5 bundles + 6 standalone swaps + 1 final bundle, 12 turns total) passed all perf gates but exposed a polish gap that didn't show up in earlier smokes:

| Finding | Severity | Where it lives | What the user saw |
|---|---|---|---|
| **S19-F3** | P2 UX | UI thinking renderer + LLM | `THINKING / THOUGHT [Same request as before. Same pattern as before. Same pattern again.]` on turns 8/9/10 |
| **S19-F4** | P2 UX | LLM (system prompt) | `Swapped 0.05 USDC for 0.04862 SUI (tx: Feqh6VHCAJYT8TzHuv6br3hHeZ9kuQuYSFHgq4bvqZvg). Your SUI balance is now 4.46...` — unbroken hash string ruins the line |
| **S19-F5** | P2 UX | Engine `stripPseudoThinking` | Turn 4 text: `[native thinking block] ... text(has been testing these swaps and come full circle.\n</thinking>\nSwapped 0.04 SUI...)` |
| **S19-F6** | P2 UX | LLM (system prompt) | Turn 5: `Quote: 0.05 USDC → 0.04869 SUI (0.019% impact). Executing now.The quote expired — fetching a fresh one now.` |
| **S19-F7** | P2 UX | engine `pending_action` payload | Turn 3 narration says route OBRIC + FLOWX + AFTERMATH; card shows CETUS + FLOWX + AFTERMATH. **Closes in SPEC 20.2, not here.** |

### Why tactical fixes don't work

We've tried system-prompt nudges before:
- **S.126** — added "narrate concisely, single sentence" rule. Decayed within 2 weeks as new tools landed.
- **S.134** — added explicit `<thinking>` tag forbiddance. Engine v1.24.13 strip-on-persist patched the leaked-into-history symptom but doesn't address LLM behavior on the originating turn.
- **S.137 round-2 v1.24.14 smoke** — same Haiku narrate cost spikes recur on turn 2 (504 output tokens vs ~70 average). The fix is documented as carry-forward to SPEC 21 Phase 21.2.

The pattern: tactical prompt nudges at the LLM layer trade off against other prompt rules. **The structural fix is to pull data out of the LLM's hands and let the UI render it.** Card shows the route, card shows the tx hash, card shows the post-balance. Prose is reserved for 1-sentence acks ("Done." / "Quote refreshed." / "Routing…"). LLM stops competing with the card; UI stops needing to filter LLM output.

---

## Scope (locked sequencing 21.1 → 21.2 → 21.3 → 21.4)

### IN SCOPE

| Phase | What | Closes | Effort | Risk |
|---|---|---|---|---|
| **21.1** | Streaming choreography — engine emits typed `stream_state` events for state transitions; audric UI subscribes + renders state-driven transition copy with motion. Pattern: `routing` (find_route in flight) → `quoting` (route returned, building quote card) → quote card slides in → `confirming` (user tap) → `settling` (sponsored tx in flight) → `done` (receipt). | Founder framing ("stream like magic with transitions"); also reduces perceived latency on routing-stage delays. | ~2d | Medium — touches engine stream protocol + audric UI render path. Backward compat: feature-flagged transition copy that gracefully falls back to current behavior on older engine. |
| **21.2** | Narration discipline — audric system-prompt rewrite + engine `stripPseudoThinking` extension (handle orphan closing tags). Card-vs-prose contract enforced at LLM layer: never cite raw tx hashes (card has them), never repeat info already on a card, never emit stray `<thinking>` tags. Engine extension: handle orphan closing tags + `[narration omitted]` placeholder when LLM produces only thinking. | S19-F4, S19-F5, S19-F6 | ~1d | Low-medium — system-prompt iteration is high-velocity, low blast-radius. Risk concentrated in regression smoke (need to verify no other narration class breaks). |
| **21.3** | Thinking visibility policy — native `thinking` content blocks render only when they ADD signal. Repetitive meta-thinking suppressed via similarity check at render time (Jaccard >0.7 vs prior turn → collapse) AND system prompt forbidding it. Define carve-outs (error recovery, ambiguous input, multi-step planning, first-time explanations). | S19-F3 | ~1d | Low — render-layer decision, no engine touch. Risk: false-collapse on legitimately-similar-but-distinct thinking (e.g., "evaluating the route again because the first quote expired"). Mitigation: similarity threshold tunable + prefix-aware (`evaluating again` ≠ `same request as before`). |
| **21.4** | Card-vs-prose contract codification — write the rule into `audric/.cursor/rules/agent-harness-narration.mdc` (new). Adds a lint check on snapshot tests (regex hits for raw tx hashes / route names / dollar amounts in prose → fail). Adds system-prompt block referencing the rule. | Future regression prevention (S19-F4 class returning) | ~0.5d | Low — documentation + lint, no production code. |

**Total: ~4.5d.** UX-class, audric-heavy, low engine touch (only 21.1 + 21.2 touch engine).

### OUT OF SCOPE

Same as SPEC 19 + SPEC 20 OUT OF SCOPE lists, plus:

- **New chat surface designs** — this SPEC polishes the existing surface, doesn't redesign it. Major redesigns would be a separate SPEC.
- **Voice / audio output** — UX-class but different surface. Separate SPEC if scoped.
- **Multi-turn narration personalization** — "Audric is friendlier on turn 10 than turn 1" — separate UX-research-driven SPEC.
- **Internationalization of stream copy** — single-language for now; i18n SPEC if/when audric ships in non-English markets.
- **Accessibility audit (a11y)** — separate SPEC; recommended but doesn't block this work.
- **Stream-state telemetry** — `stream_state.duration_ms` per transition is interesting but adds scope. If we want it, file as separate Tier-2 instrumentation work.

---

## Phase 21.1 — Streaming choreography (~2d)

**Goal:** Replace the "TASK INITIATED → silence → giant narration block" pattern with magic-feel transitions where every state change has a visible UI moment.

**Today's pattern (broken):**
1. User taps "Swap 0.05 USDC → SUI"
2. UI shows `TASK INITIATED` chip
3. Long pause (LLM thinks, calls `swap_quote` tool, builds card)
4. Quote card appears suddenly
5. User taps confirm
6. UI shows another `TASK INITIATED` chip (?)
7. Long pause (sponsored tx)
8. Receipt appears suddenly

**Magic-feel pattern (target):**
1. User taps "Swap 0.05 USDC → SUI"
2. UI shows `Routing 0.05 USDC → SUI…` with subtle pulse animation
3. Engine emits `stream_state: 'routing'` → UI swaps to `Found best route via Cetus` (~300ms after Cetus returns)
4. Engine emits `stream_state: 'quoting'` → quote card slides in from below with the route + impact + balance shown
5. User taps confirm
6. UI swaps to `Confirming…` with the same pulse
7. Engine emits `stream_state: 'settling'` → UI swaps to `Settling on Sui (~2s)…`
8. Engine emits `stream_state: 'done'` → receipt slides in, prose says "Done."

**Engine changes:**
- New event in `EngineEvent` discriminated union: `{ type: 'stream_state'; state: 'routing' | 'quoting' | 'confirming' | 'settling' | 'done'; copyHint?: string }`
- Emitted at:
 - `routing` — start of `swap_quote` / `find_route_ms` instrumentation block
 - `quoting` — after route returned, before pending_action emit
 - `confirming` — when client posts to `/api/transactions/prepare` with the pending action
 - `settling` — after sponsor success, while waiting for `waitForTransaction`
 - `done` — on `tx_settled` confirmation
- Backward compat: events are additive; older audric without subscription ignores them silently.

**Audric changes:**
- New `useStreamState` hook subscribing to the new SSE event
- `ChatMessage` renders a `<TransitionChip>` for each emitted state, with Framer Motion crossfade between states
- Existing `TASK INITIATED` chip retired (it was always a placeholder)
- Quote card render gated on `quoting` state (currently renders on first `pending_action` arrival; same trigger, but with the chip transition before it)

**Acceptance for 21.1:**
- G21-1 stream events emit on every state transition (verified in Vercel logs + UI screenshot)
- G21-2 quote card shows ≤ 200ms after `routing` event fires (no perceived latency between transition copy and card)
- 11-prompt smoke shows visible state chips for every write turn

---

## Phase 21.2 — Narration discipline (~1d)

**Goal:** Eliminate raw tx hashes in prose, eliminate stray `<thinking>` literals, eliminate state contradictions like "Executing now.The quote expired".

**System-prompt rewrite (audric-side, ~50 LoC delta):**
- New section "Card vs prose contract":
 - **On the card (the user sees these visually):** route, tx hash, fees, balance changes, route impact %, dollar amounts, slippage, gas
 - **In your prose (≤ 1 sentence, ≤ 80 chars):** ack of what just happened, no numbers that are already on a card, no tx hashes
- New rule "Never narrate state transitions you can't observe":
 - Forbidden: "Executing now." / "Confirming…" / "Settling…" — UI handles these via 21.1 transitions
 - Forbidden: "The quote expired" if you didn't observe an `expired_quote` tool result
 - Allowed: "Done." / "Quote refreshed." / "Routing again with new constraints." (post-action acks)
- New rule "Never repeat info already on a card": if the previous tool result rendered a card with route X, your narration MUST NOT say "Route: X" again

**Engine `stripPseudoThinking` extension (~20 LoC delta):**
- Current regex: `<thinking>[\s\S]*?<\/thinking>` (paired tags only)
- New: also match orphan closing `<\/thinking>\s*` at start-of-text and `<thinking>[^<]*$` at end-of-text
- Add unit test for S19-F5 regression case (orphan closing tag on turn 4)
- Edge case: if the entire assistant text ends up empty after stripping, replace with `[narration omitted — see card]` placeholder so the UI doesn't render an empty bubble

**Acceptance for 21.2:**
- G21-3 0 raw tx hashes in narration prose across 11-prompt smoke (only on cards)
- G21-4 0 stray `<thinking>` or `</thinking>` literals visible in UI text across 11-prompt smoke
- Engine unit tests cover orphan tag stripping (4 new test cases)

---

## Phase 21.3 — Thinking visibility policy (~1d)

**Goal:** Native `thinking` content blocks add signal on turn 1 and during error recovery; they're noise on bundle saturation. Suppress the noise without suppressing the signal.

**Two-layer fix:**

1. **Render-time similarity collapse** (audric UI, no engine touch):
 - When rendering a `thinking` block, compute Jaccard similarity to the last 3 turns' thinking blocks
 - If Jaccard >0.7 against any of them, render as collapsed: `THINKING — same as turn N (click to expand)`
 - Threshold tunable via `THINKING_SIMILARITY_COLLAPSE_THRESHOLD` env var (default 0.7)
 - Edge case: prefix detection — `Evaluating route again because…` is similar to `Evaluating route…` but distinct intent. If first 3 words differ, don't collapse even if Jaccard >0.7.

2. **System-prompt forbiddance** (audric, ~10 LoC):
 - "Do not narrate meta-observations about the conversation. Never write 'Same request as before', 'Same pattern again', 'Same as last time'. If your reasoning is identical to a prior turn, just execute — don't comment on the repetition."

**Carve-outs (when thinking SHOULD render fully):**
- First turn of session (always show thinking, sets user expectation)
- Error recovery (preceded by `tool_result` with `isError: true`)
- Ambiguous input requiring clarification (preceded by tool result that yielded `clarification_needed`)
- Multi-step planning (when thinking enumerates ≥3 distinct steps)

**Acceptance for 21.3:**
- G21-5 0 "Same request as before" / "Same pattern" meta-thinking in repeated bundles (turns 8-11 of bundle saturation smoke)
- G21-6 prose narration ≤ 80 chars per turn (1-sentence ack contract) on the same 11-prompt smoke

---

## Phase 21.4 — Card-vs-prose contract codification (~0.5d)

**Goal:** Make the rules from 21.2 + 21.3 enforceable so they don't decay.

**Cursor rule (`audric/.cursor/rules/agent-harness-narration.mdc`):**
- Documents the card-vs-prose contract with examples
- Lists the forbidden narration patterns
- References the SPEC 21 acceptance smoke as the regression test
- Cross-links to engine `stripPseudoThinking` for the cleanup layer

**Lint check on snapshot tests:**
- New test file: `audric/apps/web/lib/__tests__/narration-contract.test.ts`
- Loads recorded conversation snapshots from prior smoke runs
- Asserts:
 - No prose contains a base58 string of length ≥40 (matches a Sui tx hash)
 - No prose contains `<thinking>` or `</thinking>` literals
 - No prose contains "Same request as before" / "Same pattern as before" / "Same as last time"
 - No prose exceeds 200 chars (soft target ≤80, fail at 200 for slack)
- Run as part of `pnpm test`; failure means a recent system-prompt change broke the contract

**System-prompt referencing the rule:**
- Add a "Narration contract" block to `engine-context.ts` with the 4 forbidden patterns + 1-sentence ack target

**Acceptance for 21.4:**
- G21-7 all audric + engine typecheck + lint + test clean
- Cursor rule + lint test in place

---

## 9 D-questions to lock at founder review

### Phase 21.1 (3 D-questions)

**D-1 — Stream event vocabulary**

How rich should the typed enum be?

a. **Typed enum** — `'routing' | 'quoting' | 'confirming' | 'settling' | 'done'` (5 states; matches today's flow). UI maps each to copy. Recommended — minimal, deterministic, easy to extend.
b. **Free-form strings** — engine emits arbitrary copy. Maximally flexible but UI can't choose its own copy / motion / icon per state.
c. **Hybrid** — typed enum + optional `copyHint` string per emission. UI prefers its own copy; falls back to hint if unset. Compromise.

Recommendation: **(a)** for v0.1; promote to (c) only if a tool-specific copy override becomes necessary.

**🔒 LOCKED (a) — founder approved 2026-05-09 20:00 AEST**

**D-2 — UI animation library**

What animates the transitions?

a. **Framer Motion** — already in audric (used in `BlockRouter`). Recommended — no new dep, consistent with existing motion.
b. **CSS-only transitions** — lighter but limited (no spring physics, no orchestration of stagger).
c. **No animation** — text changes only. Simpler but undermines the "magic-feel" goal.

Recommendation: **(a)**.

**🔒 LOCKED (a) — founder approved 2026-05-09 20:00 AEST**

**D-3 — Backward compatibility**

What happens when audric (with subscription) talks to an older engine (without `stream_state` events)?

a. **UI version bump that requires both engine + audric to deploy together** — simpler. Risk: if engine deploys first, old audric clients see nothing weird (no regression); if audric deploys first, new audric sees old "TASK INITIATED" chip until engine catches up.
b. **Feature-flagged transition copy that gracefully falls back to current behavior on older engine** — safer for staged rollout. Requires `NEXT_PUBLIC_HARNESS_TRANSITIONS_V1` env var that defaults off, founder enables after engine deploys.

Recommendation: **(b)** — same pattern as 1.20.x rollouts already follow. ~10 LoC delta vs (a).

**🔒 LOCKED (b) — founder approved 2026-05-09 20:00 AEST** (staged rollout for safety on the engine type contract change; one of three "not (a)" locks in SPEC 21 alongside D-6 → b and D-7 → c)

### Phase 21.2 (3 D-questions)

**D-4 — Tx hash citation in prose**

How do we enforce "no tx hash in prose"?

a. **System-prompt forbid + UI strip-on-render** (defense in depth). LLM may still leak; UI catches. Recommended — never show a leaked hash to a user.
b. **System-prompt forbid only** — trusts the LLM. Simpler but a single prompt regression breaks the contract.
c. **UI strip only** — no prompt rule. Wastes LLM tokens generating then-stripped content.

Recommendation: **(a)**.

**🔒 LOCKED (a) — founder approved 2026-05-09 20:00 AEST**

**D-5 — `stripPseudoThinking` extension**

How do we handle orphan closing tags?

a. **Extend existing helper** to handle orphan closing tags (one regex addition, ~10 LoC). Recommended — keeps the cleanup layer in one place.
b. **Separate `stripOrphanClosingTags` helper** — modular but creates a 2-helper pipeline that's easy to misorder.
c. **UI text post-processor** (ship-zero-engine) — would mean a v1.24.x release isn't needed. Loses the defense-in-depth benefit.

Recommendation: **(a)** for both ergonomics and minimum surface change.

**🔒 LOCKED (a) — founder approved 2026-05-09 20:00 AEST**

**D-6 — Card-vs-prose enforcement**

How is the contract enforced day-to-day?

a. **System prompt + manual review** — relies on author discipline.
b. **System prompt + automated lint on snapshot tests** — CI catches regressions. Recommended.
c. **Strip in UI render** — last-line defense. Could add but adds rendering cost.

Recommendation: **(b)**, with optional (c) added if (b) catches the same regression twice.

**🔒 LOCKED (b) — founder approved 2026-05-09 20:00 AEST**

### Phase 21.3 (3 D-questions)

**D-7 — Repetitive thinking suppression**

How do we suppress meta-thinking?

a. **Render-time similarity check (Jaccard >0.7 vs prior turn → collapse)** — robust to LLM rewording. Tunable threshold.
b. **System-prompt forbid** ("never narrate meta-observations") — cheaper at LLM layer, frees output tokens.
c. **Both** — recommended. (a) catches what (b) misses; (b) reduces what (a) has to handle.

Recommendation: **(c)**.

**🔒 LOCKED (c) — founder approved 2026-05-09 20:00 AEST**

**D-8 — Default thinking visibility**

How visible is `thinking` by default?

a. **Always visible (current)** — what we ship today. Pro: transparency. Con: noisy after turn 5.
b. **Collapsed-by-default with click-to-expand** — cleaner. Reduces vertical space. Pro: less scroll fatigue. Con: hides the reasoning that earned trust.
c. **Hidden after first 3 turns of session** — auto-fade. Pro: signals "we trust you've seen how this works." Con: discoverability.

Recommendation: **(a)** preserved (don't break the trust model), with 21.3's similarity collapse handling the noise.

**🔒 LOCKED (a) — founder approved 2026-05-09 20:00 AEST**

**D-9 — Error/ambiguity carve-out**

When SHOULD thinking always render fully?

a. **Always fully render on first turn of session, error recovery (post `isError: true`), ambiguous input (clarification_needed), multi-step planning (≥3 enumerated steps)** — recommended. 4 carve-outs cover the high-signal cases.
b. **Just first turn + error recovery** — narrower. Risks missing planning cases.
c. **No carve-outs; similarity check is the only filter** — simplest, but Jaccard can false-collapse on legitimately-distinct planning thinking.

Recommendation: **(a)**.

**🔒 LOCKED (a) — founder approved 2026-05-09 20:00 AEST**

---

## Acceptance gates (closeout-level — 8 gates)

| # | Gate | Phase | Verification |
|---|---|---|---|
| **G21-1** | Stream events emit on every state transition (routing → quoting → confirming → settling → done) | 21.1 | Vercel log inspection + UI screenshot per state |
| **G21-2** | Quote card renders ≤ 200ms after `routing` event fires | 21.1 | Performance trace + manual timing in 11-prompt smoke |
| **G21-3** | 0 raw tx hashes in narration prose across 11-prompt smoke (only on cards) | 21.2 | UI transcript inspection + lint on snapshot |
| **G21-4** | 0 stray `<thinking>` or `</thinking>` literals visible in UI text across 11-prompt smoke | 21.2 | UI transcript inspection + engine unit test |
| **G21-5** | 0 "Same request as before" / "Same pattern" meta-thinking in repeated bundles (turns 8-11) | 21.3 | UI transcript inspection on bundle saturation smoke |
| **G21-6** | Prose narration ≤ 80 chars per turn (1-sentence ack contract) on the same 11-prompt smoke | 21.3 | Snapshot lint + manual review |
| **G21-7** | All audric + engine typecheck + lint + test clean | 21.4 | `pnpm typecheck && pnpm lint && pnpm test` in both repos |
| **G21-8** | Forward backlog row 7d marked ✅ FULLY SHIPPED + S.139 (or whatever lands) tracker entry written | closeout | `audric-build-tracker.md` row 7d state + S.X entry presence |

---

## Risks (5)

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| **R-1** | Stream choreography (21.1) over-animates and feels worse than the current "no transitions" baseline | Medium | Tune Framer Motion durations against founder taste in 21.1 dev preview before shipping; revert to (D-2c) "no animation" if motion is wrong |
| **R-2** | Card-vs-prose contract (21.2) regresses an unrelated narration class (e.g., breaks how `claim_rewards` narrates) | Medium | 11-prompt smoke covers swap + bundle + send + claim; expand smoke to include 1 claim_rewards turn before merging |
| **R-3** | Thinking similarity collapse (21.3) false-collapses legitimate planning thinking | Low-medium | Jaccard threshold tunable + prefix-aware (`evaluating again` ≠ `same request as before`); spot-check on 21.3 dev preview |
| **R-4** | System-prompt rewrite (21.2) trades off against existing prompt rules (e.g., financial-amounts safety, savings-USDC-only) | Low | Read both rules before drafting the prompt change; run regression smoke covering 1 save + 1 borrow + 1 swap to confirm no safety class regresses |
| **R-5** | The lint check on snapshot tests (21.4) becomes flaky as snapshots churn | Low | Lint reads snapshot files at test time; if a legitimate copy change is needed, update the snapshot + re-run. Same pattern as audric's existing snapshot tests. |

---

## Cross-references

- Predecessor (S.137): `audric-build-tracker.md` S.137 entry — the acceptance smoke that surfaced S19-F3..F7
- Predecessor (S.138): `audric-build-tracker.md` S.138 entry — the v0.1 lock + path A approval
- SPEC 19: `spec/SPEC_19_PERFORMANCE_RELIABILITY_SWEEP.md` — perf wins this builds on
- SPEC 20: `spec/SPEC_20_PERFORMANCE_ARCHITECTURE_V2.md` — pre-SPEC-21; 20.2 closes S19-F7 structurally
- Engine harness contract: `.cursor/rules/agent-harness-spec.mdc`
- Engine `stripPseudoThinking`: `packages/engine/src/engine.ts` (search "stripPseudoThinking")
- Audric chat surface: `audric/apps/web/components/chat/` (BlockRouter, ReasoningTimeline, ThinkingBlockView)
- Audric system prompt: `audric/apps/web/lib/engine-context.ts`
- New cursor rule (Phase 21.4): `audric/.cursor/rules/agent-harness-narration.mdc` (to be created)
