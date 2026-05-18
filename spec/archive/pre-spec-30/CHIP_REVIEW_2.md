# CHIP Review #2 — Post-SPEC-12 chip-surface audit

> **Status:** v0.1 DRAFT 2026-05-07. Owner: assistant + founder review.
> **Predecessor:** S.85 B1 chip-flow walkthrough (April 2026, closed). The S.85 entry framed it as "13 chips × 3 paths = 39 cells"; today's actual surface is ~71 cells across 5 component families (see § Surface inventory below). The undercount is not S.85's fault — the surface grew during SPEC 8 (interactive harness contextual chips), SPEC 10 (Passport identity), and v0.51 (USDsui strategic exception).
> **Successor:** any deferred items become inputs to SPEC 18 (Pre-Launch Regression).
> **Scope:** audric/web only. t2000/CLI is fee-free + chipless; not in scope.
> **Local-only:** lives in `t2000/spec/CHIP_REVIEW_2.md` (not gitignored — keep it).

## TL;DR

Re-walk every chip surface in audric/web one cell at a time, score each against 6 review dimensions, fix what's safe inline, batch the rest into a P0/P1/P2-ranked findings doc. Acceptance closes when all 6 gates (G1–G6) are green AND the live walkthrough on the 6 chip-flows produces zero P0 bugs.

## Why this exists

The chip surface is the most user-facing part of audric/web. Every other surface (chat, canvases, settings) is downstream of the chip the user just tapped. A drift here is a drift the user touches before they touch any other surface.

S.85 closed the original chip walkthrough in April 2026. Since then we've shipped:

- **SPEC 8** (interactive harness) — added contextual-chip rendering after every tool call (`suggested-actions.ts`)
- **SPEC 10** (Audric Passport identity) — added `resolve_suins` engine tool, `username.audric.sui` handles, share-to-X surface
- **SPEC 17** (Savings Goals removal) — deleted SavingsGoal model + 4 engine tools + UI panel
- **v0.51** (USDsui strategic exception) — `save_deposit` and `borrow` now accept USDC OR USDsui
- **SPEC 12** (cross-repo sweep) — taxonomy + tool-count + Passport-pillar fixes

Each of those is a potential drift vector for the chip surface. This review verifies each landed cleanly OR catches what didn't.

## Surface inventory

| # | Surface | File | Cells | Risk |
| --- | --- | --- | --- | --- |
| A | ChipBar (top-of-chat quick actions) | `lib/chip-configs.ts` | 6 chips × 3 actions = **18** | Taxonomy, copy, accuracy |
| B | Chip flows (direct execution, bypass LLM) | `hooks/useChipFlow.ts` | **6 flows** (save / swap / borrow / repay / send / receive) | Bug paths — multi-step, asset/amount pickers |
| C | Contextual chips (post-tool suggestions) | `lib/suggested-actions.ts` | 19 tool-keyed groups × 2 chips = **38** + 2 default fallbacks = **40** | Stale tool keys, missing tools (SPEC 10), accuracy |
| D | ConfirmChips (yes/no on pending action) | `components/engine/ConfirmChips.tsx` + `lib/confirm-chips.ts` | ~5 confirm patterns | Button copy consistency (F5 carryover from S.85) |
| E | AmountChips (¼ ½ ¾ All inside flows) | `components/dashboard/AmountChips.tsx` | 4 presets × N flow contexts | `financial-amounts.mdc` floor-safety, preset precision |

**Cross-cutting checks (cell-independent):**

- **X1.** SPEC 10 surfacing — does any chip mention `username.audric.sui` / Passport identity where useful (Send-to-contact, Receive-share)?
- **X2.** SPEC 17 cleanup — zero `savings_goal_*` / `SavingsGoal` references in any chip surface (excluding the 1 `goal_progress` proactive-type kept intentionally for conversational goals).
- **X3.** v0.51 USDsui — Save / Borrow / Repay flows expose USDsui in their asset picker when balance > 0 per `usdc-only-saves.mdc`.

## Review dimensions

| Dim | Question | How to test | Catches |
| --- | --- | --- | --- |
| **D1. Taxonomy** | Does the action belong under this parent chip? | Code read | Mis-categorised chips (e.g. S.19 fixed "Send → Create payment link" mis-categorisation; new instances?) |
| **D2. Copy** | Label / sublabel / prompt accurate, current, in voice? | Code read | Stale references (deleted features, old tool names), tone drift |
| **D3. Accuracy** | Prompt produces the intended tool call? Data shown matches prefetch? | Code read + prompt trace through `suggested-actions.ts` map | Prefetch math wrong, prompts that hit the wrong tool |
| **D4. Flow steps** | For chip-flows: minimal steps, sane defaults, safe presets? | Code read of `useChipFlow.ts` | Excess taps, default-to-100% bugs, off-by-one in presets |
| **D5. Bug paths** | Click → completes successfully? Asset picker shows USDC + USDsui where applicable? | **Live walkthrough** on audric.ai (browser-use) | Broken click handlers, picker missing, post-confirm rendering bugs |
| **D6. New features** | SPEC 10 / SPEC 17 / v0.51 surface where they should? | Code read + cross-ref against shipped specs | Identity layer not surfaced; stale Savings Goals refs; USDsui missing from picker |

## Severity rubric

Every finding gets one of:

- **P0 — Bug.** User-facing breakage. Action doesn't complete, wrong tool fires, money flows wrong, or stale reference contradicts shipped reality (e.g. "earn 5% APY in your savings goal" — Savings Goals are deleted). Ship-blocker for next launch window. Fix inline.
- **P1 — UX.** Action works but degrades the experience: redundant steps, ambiguous copy, off-brand tone, missing affordance (e.g. SPEC 10 username chip slot empty). Batch into findings doc; founder picks fix order.
- **P2 — Polish.** Cosmetic / nice-to-have. Not user-blocking. Document only — don't necessarily fix this sweep.

## Acceptance gates

| Gate | Title | Closed when |
| --- | --- | --- |
| G1 | ChipBar audit (Surface A) | All 18 cells reviewed across D1–D4+D6; no P0 open; P1+P2 documented |
| G2 | Chip flows audit (Surface B) | All 6 flows reviewed across D1–D4+D6; live walkthrough (D5) on each flow finds 0 P0 bugs |
| G3 | Contextual chips audit (Surface C) | All 19 tool-keyed groups + 2 default fallbacks reviewed; missing tool keys flagged (esp. `resolve_suins` post-SPEC-10) |
| G4 | ConfirmChips audit (Surface D) | F5 (button-copy consistency) closed; ConfirmChips matches the 4-button standard from S.85 |
| G5 | AmountChips audit (Surface E) | Every preset uses `Math.floor` per `financial-amounts.mdc`; precision matches asset decimals |
| G6 | Cross-cutting checks (X1–X3) | All 3 cross-cuts verified; SPEC 18 inherits any P1+ residual |

**Sweep closes when:** G1–G6 all green AND P0 count = 0 (P1/P2 may carry forward into SPEC 18 inheritance map).

## SPEC 18 inheritance map

Anything that surfaces here at P1 or P2 severity that the founder defers becomes a row in SPEC 18 Phase F (chip-flow regression). To be filled in during Phase E close-out:

| Finding ID | Severity | Surface | One-line summary | SPEC 18 Phase F row |
| --- | --- | --- | --- | --- |
| _(filled in at close-out)_ | | | | |

## Method

1. **Phase 0 — this spec.** Lock acceptance gates + severity rubric.
2. **Phase A — code audit (~1h).** Walk all 71 cells across the 5 surfaces against D1–D4+D6. Build a finding row for every issue.
3. **Phase B — inline safe fixes (~30 min).** Apply P0 fixes immediately (typos, stale labels, missing chips). P1+P2 batched.
4. **Phase C — `CHIP_REVIEW_2_FINDINGS.md` (~20 min).** Compile P0/P1/P2 ranked findings with proposed fix per row.
5. **Phase D — live walkthrough (~45 min).** Drive `audric.ai` via browser-use, click each of the 6 chip-flows end-to-end, verify D5. Add any live-only findings to the findings doc.
6. **Phase E — close-out.** Update `audric-build-tracker.md` (S.109), close row 5a, populate SPEC 18 inheritance map.

**Stops if:** any P0 surfaces a load-bearing bug that needs more than ~10 min to fix safely (then escalate to founder for scope decision).

## Out of scope

- t2000/CLI chip equivalents (CLI is fee-free + chipless)
- Marketing-site chip mocks (covered by SPEC 12 Phase 3)
- Engine-side tool changes (chips are downstream — engine bugs are SPEC 18's concern)
- Chip telemetry analysis (separate concern; would need another sweep with eval data)

## Decision questions

None. This is a verification sweep, not a feature spec. If a finding needs a design call, it gets escalated as a P1+ in the findings doc.
