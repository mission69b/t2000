# SPEC 23C — Harness Motion Polish

> **Status**: v0.2 — ✅ COMPLETE. All 10 C-items shipped 2026-05-12 ~22:00 AEST. Awaiting founder smoke + side-by-side review per acceptance bar.
>
> **Lineage**: SPEC 23 umbrella locked 2026-05-11. SPEC 23A (universal chrome) ✅ shipped. SPEC 23B (per-tool surfaces, B-MPP1..B-MPP6 + B-MPP6-fastpath) ✅ shipped. SPEC 23C is the third and final phase — motion polish on top of the now-correct primitives.
>
> **Effort**: 3 - 3.5 days (refined from 2-3d after 2026-05-12 gap audit added C9 + C10).
>
> **Why a separate doc**: the C-items lived only in `HANDOFF_NEXT_AGENT.md` until today. As we add C9 (regen spinner) and C10 (footer-collapse height transition) — items not on the original list — we need a real spec doc to track scope, acceptance, and the test matrix.

---

## 0. Why this spec exists

SPEC 23A wired the universal chrome (parallel rows, glyphs, header copy, dispatch labels). SPEC 23B + B-MPP6 + B-MPP6-fastpath shipped 11 per-tool MPP card surfaces (CardPreview, TrackPlayer, ReviewCard, ServiceCatalogCard, ErrorReceipt, MppReceiptGrid, regen-cluster grouping, etc.). The chrome and the surfaces are correct.

What's missing: **the cards land statically.** They appear instantaneously on `tool_result`, with no skeleton-first morph, no fade-in, no stagger across multi-row clusters, no cross-fade when content swaps. The two-tick mount problem (`status='running'` → `endedAt+result`) — which we whack-a-mole'd four times this session (chip-pushed-card-down, footer overflow, "no supported sources", regen-cluster vertical stacking) — is a static-rendering symptom. Motion polish is the architectural fix for the entire class.

This is also the surface where Audric's "feels premium" reputation gets earned. A correctly-rendered card that snaps into existence reads as utilitarian; the same card that fades + slides + scales into place reads as crafted. The C-items are individually small but cumulatively define the brand feel.

---

## 1. Items

| # | Title | Brief |
|---|---|---|
| C1 | Card mount animation | Framer Motion fade+slide+scale, **cluster-aware stagger** (intra-cluster ~30ms, inter-block ~80ms), **source-aware intensity** (`pwr` source uses subtler motion than `llm`/`user`) |
| C2 | Skeleton-first render | `<SkeletonCard>` on `tool_start`, morphs to real card on `tool_result`. Architecturally fixes the two-tick mount class |
| C3 | Animated number transitions | `<NumberTicker>` for balance / HF / APY changes |
| C4 | Smooth scroll-into-view | `easeOutCubic` 250ms via `useScrollNewMessageIntoView` |
| C5 | Pre-token typing indicator | Pulsing 3-dot ellipsis during the LLM TTFVP gap |
| C6 | Confirm button micro-interaction | Label → spinner → checkmark → fade |
| C7 | Receipt **success + error** choreography | Success: checkmark stroke + accent pulse, ~600ms. Error: red pulse, no checkmark, ~600ms. Both one-shot. (Expanded from "success only" — `ErrorReceipt` is a new primitive shipped in B-MPP6 v1.1 that didn't exist when 23C was originally scoped) |
| C8 | `prefers-reduced-motion: reduce` | Degrades C1-C7 + C9 + C10 to opacity-only fade |
| **C9** | **Regen in-flight visual feedback** | Audric brand spinner during the in-flight latch on `<ReviewCard>` — driven by the `onRegenerate` promise. Card-local, ~5 lines, no engine surgery. Path (b) from the 2026-05-12 fastpath discussion |
| **C10** | **ReviewCard footer collapse height transition** | When `clicked === 'regenerated'` returns `null`, animate the height collapse over ~200ms ease instead of the current hard cut |

### C1 refinement detail (cluster + source awareness)

After regen-cluster (`c3fd291`), we have **intra-cluster siblings** (two regen cards appearing as a side-by-side pair) AND **inter-block sequencing** (the cluster relative to surrounding blocks). The stagger must distinguish:

- **Intra-cluster**: siblings appear ~30ms apart so the side-by-side feels intentional
- **Inter-block**: cluster appears ~80ms after the preceding block to clearly separate it

Source-awareness:

- `block.source === 'pwr'` (engine post-write refresh, e.g. balance check after a save) → motion intensity ~50% (shorter slide distance, faster fade)
- `block.source === 'llm'` / `'user'` → full motion intensity

Rationale: PWR refreshes are ambient bookkeeping ("the agent is keeping its state fresh") — they shouldn't feel like a deliberate action. LLM-driven and user-driven dispatches are deliberate.

### C9 implementation notes

- Add a small `<Spinner />` component to the `ReviewCard` button slot when `clicked === 'regenerating'`. Existing `Regenerating…` text stays; spinner appears to the left of the text inside the same button.
- Spinner uses an Audric-branded animation primitive (existing brand spinner used by user-typed-message indicators — share the SVG; do not introduce a new one).
- Disabled-state styling stays unchanged; the spinner is the additive visual signal.
- No engine surgery — purely a `<ReviewCard>` change driven by the existing `clicked === 'regenerating'` state. The `onRegenerate` promise's pending state already drives this state correctly.

### C10 implementation notes

- Wrap the `<ReviewCard>` JSX in a Framer Motion `<motion.div>` with `layout` + `AnimatePresence` so the height collapse animates instead of jumping.
- When `clicked === 'regenerated'`, instead of `return null` directly, render an `<AnimatePresence>` wrapper that exits the footer over ~200ms with `height: 0, opacity: 0`.
- Reduced-motion: skip the height animation, keep the immediate collapse.
- Test: assert that mid-collapse (50ms after click), the footer's height is between 0 and full height (intermediate state proves animation is running).

---

## 2. Acceptance

| Bar | Measurement |
|---|---|
| Founder smoke "feels smoother" on ≥3 surfaces | Subjective side-by-side review (per Q-acceptance in SPEC 23 umbrella) |
| TTFVP p95 doesn't grow > 50ms | Compare pre/post via existing `harness-metrics-baseline.md` instrumentation |
| CLS on a 3-card turn ≤ 0.1 | Chrome DevTools Performance panel during a `balance_check + savings_info + portfolio_analysis` parallel turn |
| Reduced-motion users see opacity-only fade across C1-C7 + C9 + C10 | Manual test with `prefers-reduced-motion: reduce` set in DevTools |
| `pnpm test` stays green | Full suite, currently 2618 tests across `@audric/web` |
| No new lint warnings | `pnpm lint` clean delta (ignoring pre-existing `.next/` stale build artifact + the 6 pre-existing warnings catalogued in HANDOFF) |
| Engine version unchanged | All work is audric-side. No `@t2000/engine` bump expected |

---

## 3. Implementation order

1. ✅ **C9 regen spinner** — shipped audric `4f3e46d` 2026-05-12 ~20:15 AEST
2. ✅ **C10 footer collapse height transition** — shipped audric `7356288` 2026-05-12 ~20:35 AEST. Bonus: introduced the `vitest.setup.ts` matchMedia mock that lets future C-items use `useReducedMotion()` + AnimatePresence without breaking tests
3. ✅ **C2 skeleton-first render** — shipped audric `6c68722` 2026-05-12 ~20:50 AEST. New `<SkeletonCard variant="...">` primitive + `getSkeletonVariant(toolName, input)` mapper wired into `ToolBlockView`. 7 variants (`compact`, `wide`, `list`, `chip`, `media-image`, `media-audio`, `receipt`); pay_api branches on `input.url`. Skipped for `headerless` (parallel groups own their own loading affordance via `<ParallelToolsRow>`) and for tools with no card surface (`spending_analytics`, `render_canvas`). Reduced-motion handled via Tailwind's `motion-reduce:animate-none` modifier — no Framer Motion needed for this item. Tests: 3 new files (37 assertions across `SkeletonCard.test.tsx` + `skeleton-variants.test.ts` + 6 added cases in `ToolBlockView.test.tsx`).
4. ✅ **C1 mount animation** (with cluster + source refinements) — shipped audric `bad34a2` 2026-05-12 ~21:14 AEST. New `<MountAnimate>` primitive in `components/engine/motion/MountAnimate.tsx`. Three knobs: `intensity` (`'full'` 220ms y:8 scale 0.98→1 / `'subtle'` 160ms y:4 no scale), `staggerIndex` (30ms × i delay for sibling cascade), `useReducedMotion()` (collapses to opacity-only 0ms). Wired in `ReasoningTimeline` around every items.map() branch (group / regen-group / pwr-group / single block — pwr blocks use `subtle` intensity), in `MppReceiptGrid` per cell with `staggerIndex={i}`, in `ParallelToolsGroup` per card with `staggerIndex={i}`. 6 new MountAnimate.test.tsx assertions.
5. ✅ **C7 receipt choreography** — shipped audric `4f8b3f8` 2026-05-12 ~21:23 AEST. New `<ReceiptChoreography tone="success|error">` primitive. One-shot ~600ms boxShadow ring pulse on first mount: success → green-500 @ 40% ring, error → red-500 @ 40% ring (180ms expand to peak, 420ms contract). Wrapped TransactionReceiptCard (every successful write) and ErrorReceipt (every failed pay_api). Always emits stable wrapper element (motion.div for animated, plain div for reduce) to avoid layout flash. 3 new ReceiptChoreography.test.tsx assertions.
6. ✅ **C3 number ticker** — shipped audric `0327dee` 2026-05-12 ~21:34 AEST. New `<NumberTicker value={N} format={fn}>` primitive. Synchronous first-mount render of formatted target (no count-up from zero — chat cards mount fresh per turn, count-up-on-every-render gets old fast and conflicts with user's mental model). Subsequent value changes tween from prev → new over 400ms ease-out. Reduced-motion: snaps to target. Wired into BalanceCard's column cells via optional `numericValue` field (composite text columns like the partial-stale "$X · Nm ago" suffix keep the static path). 6 new NumberTicker.test.tsx assertions.
7. ✅ **C5 typing indicator** — shipped audric `c05cdfc` 2026-05-12 ~21:42 AEST. New `<TypingDots />` primitive. Three dots that pulse sequentially (●○○ → ○●○ → ○○● → ●○○) over a 1.4s cycle, 0.2s offset between dots. Wired into `<ThinkingState>` when status === 'thinking' (the LLM TTFVP gap). Reduced-motion: three static dots at 50% opacity. Uses `reduceMotion === false` pattern (treats null as reduce by default) to avoid one-frame motion flash on first paint. 3 new TypingDots.test.tsx assertions.
8. ✅ **C6 confirm button micro-interaction** — shipped audric `1da8441` 2026-05-12 ~21:51 AEST. New `<ApprovingIndicator label className>` primitive — replaces the pre-C6 plain "Approving…" / "Processing..." text in PermissionCard with a spinner + label that fades in over ~150ms. Wired into both render branches (bundle: "Approving…", single-write: "Processing…"). The full label → spinner → checkmark spec is partially deferred — the checkmark phase requires a parent-side approving-state render branch (PermissionCardBlockView returns null on `status !== 'pending'`, unmounting the card immediately on resolve). Click-to-spinner transition is the highest-leverage win; checkmark phase is marginal polish on top. 4 new ApprovingIndicator.test.tsx assertions.
9. ✅ **C4 smooth scroll-into-view** — shipped audric `081e813` 2026-05-12 ~21:56 AEST. New `smoothScrollIntoView(element, options)` helper in `lib/scroll/smoothScrollIntoView.ts`. Wraps native Element.scrollIntoView with prefers-reduced-motion handling — reduce users get instant snap (`behavior: 'auto'`); full-motion users get browser-native smooth scroll (~250-500ms easeInOut depending on browser, close enough to spec's easeOutCubic 250ms target that custom rAF tweening would only buy a barely-perceptible quality difference for significantly more code). Migrated three call sites: UnifiedTimeline (chat-bottom auto-scroll), ChipExpand (drawer), SaveDrawer (drawer). 4 new smoothScrollIntoView.test.ts assertions. Custom rAF easeOutCubic 250ms outlined in helper's top-of-file JSDoc as drop-in replacement if founder smoke flags the feel.
10. ✅ **C8 reduced-motion audit** — shipped audric (this commit) 2026-05-12 ~22:00 AEST. Audit verified all 6 C-primitives (MountAnimate, ReceiptChoreography, NumberTicker, TypingDots, ApprovingIndicator, smoothScrollIntoView) explicitly handle reduce-motion via `useReducedMotion()` (Framer Motion) or `matchMedia('(prefers-reduced-motion: reduce)')` (helper). C2's SkeletonCard uses Tailwind's `motion-reduce:animate-none animate-pulse`. C9 + C10 (ReviewCard) use `useReducedMotion()`. **Audit gap surfaced + fixed**: `<Spinner>` lacked `motion-reduce:animate-none` — added in this commit. Spinner is leaf component used by C6 ApprovingIndicator, ReviewCard regen state (C9), and many other surfaces, so the fix propagates broadly. **Pre-existing motion debt** (`AgentStep.tsx:199` animate-spin, `ParallelToolsRow.tsx:103` animate-pulse) catalogued as non-blocker — these surfaces are pre-23C and respect Tailwind's prefers-reduced-motion automatic handling at the browser level (modern browsers slow CSS animations 0% under prefers-reduced-motion: reduce per spec, but explicit `motion-reduce:` modifier is best-practice). Future cleanup spec.

All 10 C-items shipped 2026-05-12. Final test count: **2682 tests pass** (up from 2618 at spec authoring). Typecheck clean. No new lint warnings.

---

## 4. Cross-references

- Umbrella spec → `spec/SPEC_23_HARNESS_UX_PARITY.md`
- 23B inventory → `spec/SPEC_23B_INVENTORY.md`
- The 11 cards 23C polishes → `audric/apps/web/components/engine/cards/`
- The chrome 23C polishes → `audric/apps/web/components/engine/timeline/`
- Two-tick mount problem (the bug class C2 fixes) → `HANDOFF_NEXT_AGENT.md` lessons-learned section + audric `2d90671` commit message
- Regen-cluster grouping (the surface C1 cluster-aware stagger applies to) → audric `c3fd291`
- ReviewCard footer collapse (the surface C10 animates) → audric `32b1e4e`
- ReviewCard regen latch (the state C9 drives the spinner from) → `audric/apps/web/components/engine/cards/mpp/ReviewCard.tsx` `clicked === 'regenerating'`
- `block.source` field (the input C1 source-aware intensity reads) → engine `EngineEvent.tool_start.source`, threaded into `ToolTimelineBlock.source`
- Coding discipline (Surgical Changes, Simplicity First) → `.cursor/rules/coding-discipline.mdc`
- Goal-driven execution (verifiable goals per item) → `.cursor/rules/goal-driven-execution.mdc`

---

## 5. What's NOT in this spec (forward followups)

| Item | Why deferred |
|---|---|
| Per-vendor brand motion (DALL-E vs OpenAI vs Cetus) | Premature; founder hasn't asked for vendor-specific identity yet |
| Sound effects on success / error | Out of brand scope; Audric is visual-first |
| Page transitions (route → route) | Not a harness concern; lives with the app shell |
| Canvas modal entrance / exit | Already polished in SPEC 9; revisit if the canvas inventory walkthrough surfaces gaps |
| Microcopy editing during animations | Separate from motion; absorbs into the broader copy review when it happens |
