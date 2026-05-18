# SPEC 23C Motion Polish — Smoke Test Report

**Date:** 2026-05-13 09:30 AEST
**Tester:** Automated browser smoke (cursor-ide-browser MCP) + funkii at the keyboard for sign-in
**Environment:** Production (audric.ai), funkii @audric account, conservative permission preset
**Real cost incurred:** ~$0.16 (1× $0.05 failed DALL-E + 2× $0.02 TTS + ~$0.07 in NAVI fees on $1 save / 2× borrow / 1× repay)
**Conversation 1:** `/chat/s_1778627920694_555aa8b8bf64` (financial writes)
**Conversation 2:** `/chat/s_1778628817107_1221365b5085` (MPP + regen)

---

## Verdict

| C-item | Wired | Visually verified | Notes |
|---|---|---|---|
| C1 MountAnimate | ✅ | ⚠ partial | Wraps every block + intra-cluster stagger. Animation timing not capturable in screenshots — needs human eye. |
| C2 SkeletonCard | ✅ | ⚠ partial | Wired in ToolBlockView when `state === 'running'`. Skeleton flash is sub-second, screenshots after-the-fact. |
| C3 NumberTicker | ✅ | ⚠ partial | Renders sync on first mount (correct per design), animates on subsequent value changes. |
| C4 smoothScrollIntoView | ✅ | ✅ | Chip drawer expand visible; helper used in UnifiedTimeline + ChipExpand + SaveDrawer. |
| C5 TypingDots | ✅ | ⚠ partial | Wired in ThinkingState. TTFVP gap is sub-second. |
| C6 ApprovingIndicator | ✅ | ⚠ partial | PermissionCard rendered for borrow $1 → Approve clicked → state transition window too short to screenshot. |
| C7 ReceiptChoreography | ✅ | ⚠ partial | Wraps every transaction receipt. 0.6s pulse fires on receipt mount. Screenshots taken too late. |
| C8 reduced-motion | ✅ | ✅ (code) | Spinner has `motion-reduce:animate-none`, framer-motion primitives use `useReducedMotion()`, vitest matchMedia mock satisfies all unit tests. |
| C9 Regen spinner | ✅ | ⚠ partial | Visible at ReviewCard.tsx:295-297. TTS regen completed but spinner window too short. |
| **C10 Footer collapse** | ✅ (code) | **❌ FAIL** | **POSSIBLE REGRESSION — see Issue #1 below.** |

---

## Critical issues found

### Issue #1 — C10 footer collapse not firing in production (HIGH)

**Symptom:** After regenerating a TTS audio clip, BOTH the original ReviewCard and the new (regenerated) ReviewCard show full Regenerate + Cancel button footers. The original's footer should collapse to nothing per the C10 spec (`ReviewCard.tsx:226` — `showFooter = clicked !== 'regenerated'`).

**Evidence:** `smoke-23c-05c-regen-final.png` + DOM search confirmed two "Regenerate" buttons at (895, 496) and (1211, 496). Original card refs e102-e105 still expose Play + Suiscan + Regenerate + Cancel; regenerated card refs e106-e109 expose the same set. No console errors.

**Likely root cause** (needs verification): the `handleRegenerateToolCall` resolves a NEW pay_api turn that re-renders the regen-cluster grid. The original ReviewCard component may be UNMOUNTED + REMOUNTED in this re-render, losing its local `clicked: 'regenerated'` state. The state needs to be lifted to a parent that survives the cluster reflow, OR the cluster needs `key` stability + parent-controlled state.

**Confidence:** Medium-high — the unit test passes (because it doesn't simulate the cluster remount), but the production behavior contradicts the documented design at `ReviewCard.tsx:113-118`.

**Recommended fix:** lift `clicked` state to `MppReceiptGrid` or higher and key by `toolUseId`. OR persist `clicked` in a ref + sessionStorage map keyed by `toolUseId`.

---

### Issue #2 — `agentBudget = $0.50` default bypasses `borrow autoBelow:0` invariant (P0 CRITICAL — pre-existing, NOT 23C)

**Symptom:** `borrow 0.5 USDC` AUTO-EXECUTED without rendering a PermissionCard. Per `.cursor/rules/safeguards-defense-in-depth.mdc`: *"`borrow` is always `confirm` (`autoBelow: 0` across every preset) — debt is too consequential to silently take on."*

**Root cause:**
- `app/new/dashboard-content.tsx:648` — `const [agentBudget, setAgentBudget] = useState(0.50);` — default $0.50 budget per session.
- `lib/engine/permission-tiers-client.ts:312-314` — agentBudget fast-path runs BEFORE the tier resolver:
  ```
  if (agentBudget > 0 && Number.isFinite(usdValue) && usdValue <= agentBudget) {
    return 'auto';
  }
  ```
- A $0.50 borrow → `0.50 <= 0.50` → returns `'auto'` → bypasses `borrow.autoBelow: 0` (which would otherwise force confirm).

**Severity:** P0. Every new user gets a default $0.50 silent-borrow window. The invariant is "borrow ALWAYS confirms" — this violates it.

**Recommended fix:** add an exception in `resolveStepTier` so `borrow` is excluded from the agentBudget fast-path:
```ts
if (operation !== 'borrow' && agentBudget > 0 && Number.isFinite(usdValue) && usdValue <= agentBudget) {
  return 'auto';
}
```
Mirror the same guard in the engine's `permission-rules.ts` resolver (currently doesn't have agentBudget at all, but if/when added, replicate the borrow exception).

---

### Issue #3 — Dashboard chip APY x100 display bug (transient, P2)

**Symptom:** `Savings → $20.20 897.21% APY` chip rendered briefly during Scene 4 setup. Self-corrected to `8.97%` on next refresh.

**Likely root cause:** the chip's APY field receives a value already multiplied by 100 (basis points or fractional) and applies a second × 100 in the display layer. Race between data sources.

**Severity:** P2 (transient + self-corrects). Worth tracing but not blocking.

---

### Issue #4 — MPP DALL-E image gen charges fee but returns no image (PRE-EXISTING)

**Symptom:** "Use OpenAI to generate an image of a small red robot waving" → "The image generation failed, but your payment of $0.05 was charged on-chain (tx 3sMoS9…HRdH). Contact support for a refund — do not retry."

**Severity:** Real money lost ($0.05). Not 23C, not blocking. The error message correctly warns the user not to retry. Refund process needs to be operator-driven.

---

## Operator notes for manual visual verification

I couldn't screenshot animations in flight (the browser MCP doesn't expose JS eval and the timing windows for most C-items are <500ms). To finish the visual sign-off, please open the audric.ai chat and personally:

1. **C5 TypingDots** — open a fresh chat, send any prompt. Watch for 3 pulsing dots in the agent's first response gap. Should pulse roughly 1.4s cycle, dots fade in/out sequentially.
2. **C2 SkeletonCard** — send "show my balance breakdown". Watch for grey-on-grey card-shaped placeholder before the real card lands (~300-800ms window).
3. **C1 MountAnimate** — send "show me my full portfolio with savings APY and current lending rates". Watch the chips cascade in (4 chips × ~80ms stagger). The fade-up should be subtle (~8px translate, ~220ms duration).
4. **C7 ReceiptChoreography** — send "save 1 USDC". Watch for a brief green ring pulse (~0.6s) around the transaction receipt when it lands.
5. **C6 ApprovingIndicator** — send "borrow 1 USDC". When PermissionCard appears, click Approve. Look for the spinner + "Approving…" text crossfade in place of the buttons.
6. **C3 NumberTicker** — same borrow flow. Watch the post-write BalanceCard's $ values count up from the previous (stale) values.
7. **C9 Regen spinner** — generate a TTS clip → click Regenerate. Watch for the brand spinner inside the button next to "Regenerating…" text during the ~3s wait.
8. **C10 Footer collapse** — same flow. **EXPECTED** behavior is the original card's Regenerate + Cancel buttons fade + height-collapse to nothing after the regen succeeds. **OBSERVED** behavior in the smoke is they stay. **Please confirm or refute** Issue #1 with your eye.

For C8 reduced-motion: open System Settings → Accessibility → Display → "Reduce motion" → ON. Reload audric.ai. Re-test 1-7. All animations should snap to final state with zero duration.

---

## Real-money summary

- $1.00 USDC deposited to NAVI savings (still there — earns ~$0.0009/day at 4.74%)
- $0.50 USDC borrowed (auto-executed via Issue #2) → repaid as part of $1.50 total repay
- $1.00 USDC borrowed (PermissionCard confirmed) → repaid
- $1.50 USDC repaid in full
- $0.05 USDC charged for failed DALL-E image (refund needed via Issue #4)
- $0.04 USDC charged for 2× successful TTS audio
- ~$0.07 in NAVI sponsored gas + protocol fees (estimated)

**Net cost to founder:** ~$0.16 + ~$0.0001 borrow interest accrued during the ~5 min the debt was open.

---

## Greenlight decision

**SPEC 23C is mostly shippable** — 9 of 10 C-items pass code wiring + show DOM evidence consistent with the spec. C10 needs investigation before declaring full ship.

**Do NOT block on the smoke for the parallel work** (sessions/day numbers, eval harness, F5 smoke harness) — those are independent and don't depend on C10's footer collapse.

**P0 blockers found in side-of-road work:**
1. **Fix Issue #2 (agentBudget bypass) BEFORE next release.** Real users on production right now have a silent $0.50 borrow window. Hotfix is ~6 lines.
2. Investigate Issue #1 (C10 regression) — may be a 1-line state-lift fix or may need bigger surgery.

**Pre-existing bugs to file but not block:**
- Issue #3 (dashboard chip APY x100, transient)
- Issue #4 (MPP DALL-E charge-without-result, refund process)

---

## Screenshots captured

Located at `/var/folders/78/z51h95352f1679kjny_tztsw0000gn/T/cursor/screenshots/`:

- `smoke-23c-00-baseline.png` — empty fresh chat
- `smoke-23c-01a-typing-dots.png` — moment after sending "what's my balance"
- `smoke-23c-01b-balance-final.png` — final state with prose answer
- `smoke-23c-01c-balance-fullpage.png` — full page version
- `smoke-23c-01d-balance-tool-block.png` — scrolled to tool block header
- `smoke-23c-02a-multi-tool-typing.png` — moment after sending multi-tool prompt
- `smoke-23c-02b-multi-tool-skeletons.png` — 3s after click
- `smoke-23c-02c-multi-tool-final.png` — final state with cluster
- `smoke-23c-02d-multi-tool-fullpage.png` — full page version
- `smoke-23c-03a-portfolio-overview.png` — portfolio page
- `smoke-23c-04a-save-receipt.png` — save 1 USDC receipt
- `smoke-23c-04b-permission-card-pre.png` — borrow 1 USDC PermissionCard
- `smoke-23c-04c-approving-indicator.png` — moment after Approve click (window too short)
- `smoke-23c-04d-borrow-receipt.png` — borrow 1 USDC receipt + post-write
- `smoke-23c-04e-repay-receipt.png` — repay receipt
- `smoke-23c-05a-tts-pre-regen.png` — TTS card with Play + Regenerate buttons
- `smoke-23c-05b-regen-spinner.png` — moment after Regenerate click
- `smoke-23c-05c-regen-final.png` — both ReviewCards visible (C10 issue)
- `smoke-23c-06a-chip-drawer.png` — SAVE chip drawer expanded

---

## Next steps

You said: "move onto Fill in the actual numbers for sessions/day + monthly Anthropic and Build the Phase 1 eval harness in parallel with SPEC 24 F5 smoke harness."

I'm ready to start that. Two parallel tracks:

**Track A — Self-hosted LLM cost numbers (re-rewrite of `SELF_HOSTED_LLM_STRATEGY.md` cost section)**
- Pull current sessions/day from production telemetry (which table? — need pointer to the right Prisma model)
- Pull monthly Anthropic cost from the API spend table
- Recompute break-even with real numbers + realistic prompt-cache hit rate

**Track B — Phase 1 eval harness scaffolding**
- Spec out the harness shape (per the rewritten strategy doc): finance-eval split (250 prompts), distillation pipeline (Anthropic-as-teacher), constrained-decoding test-bench
- Target the same `scripts/` location as F5

**Or, if you want C10 + Issue #2 fixed first** — both are small surgical fixes; I can do them in <30 min and re-smoke before moving to the parallel track.

Tell me which order you want and I'll start.
