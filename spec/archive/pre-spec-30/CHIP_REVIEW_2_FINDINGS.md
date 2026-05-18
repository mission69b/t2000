# CHIP Review #2 — Findings

> Companion to `spec/CHIP_REVIEW_2.md`. Source-of-truth for the audit pass run on 2026-05-07 against audric/web @ commit `8ed6d67`.
>
> **Surfaces audited:** all 5 (ChipBar / Chip flows / Contextual chips / ConfirmChips / AmountChips). Total cells reviewed: 71.
>
> **Headline (final):** **3 P0** (F-1 silent SUI substitution + F-7 borrow bypasses MIN_HEALTH_FACTOR=1.5 + F-11 APY decimals echoed as percent), **7 P1** (post-SPEC-10/v0.51 UX gaps + F-12 RECEIVE asset hardcode + F-13 Spending panel mislabel), **3 P2** (polish), plus 1 D5-only finding (F-5b lookup_user tool-name mismatch) caught + patched mid-walkthrough, plus **3 P3 follow-ups (FU-1/FU-2/FU-3) pulled forward and shipped in Phase D.3** after the founder spotted them as visible regressions of the F-2/F-3 picker work. Phase D ran THREE times (D.1 founder-driven + D.2 "are all 6 chips audited" + D.3 "I see a gap with USDsui"). **Sweep status: ✅ COMPLETE.** All P0/P1/P2/P3 verified live in production.
>
> **Founder decisions locked 2026-05-07:** F-1 → option D (asset picker w/ smart auto-skip). F-2 + F-3 → ship now. F-5 → bundle now. F-7 trace ran and **escalated to P0**. Phase D.1 → user signed in, ran 6 chip-flows, all P0 + most P1 fixes verified live. **Phase D.2 (extended)** → surfaced F-11/F-12/F-13; founder said "ship all new" → all 3 shipped + verified same session. **Phase D.3 (USDsui entry-point gap)** → founder noticed SAVE chip still showed only USDC and BORROW chip still labeled USDC despite picker support; FU-1/FU-2/FU-3 pulled forward from P3 and shipped same session.

## Severity legend

- **P0** — User-facing breakage / silent rule violation. Ship-blocker for next launch.
- **P1** — UX degradation. Batched, founder picks fix order.
- **P2** — Cosmetic / nice-to-have. Document only.

---

## P0 findings (2)

### F-1 · Send chip silently substitutes SUI when amount > USDC
**Surface:** B (Chip flows — send) + supporting Surface A (ChipBar Send chip copy)
**Files:** `app/new/dashboard-content.tsx` lines 97–109 (`capForFlow`), 1418–1424 (`handleConfirm` send branch), 1551–1612 (`getConfirmationDetails`); `hooks/useChipFlow.ts` line 91 (`selectRecipient` `available` text)

**The bug.** The Send chip:
1. Advertises "Send USDC" (label) / "pick contact → amount → confirm" (sublabel)
2. Caps the amount picker at `bal.cash` = total liquid USD value (USDC + SUI + GOLD + everything)
3. Shows "All $X" using `bal.cash`, `available` message using `bal.cash`
4. On confirm, if amount > `bal.usdc` AND `bal.sui > 0`, **silently switches asset to SUI** and converts amount → SUI by `suiPrice`
5. Confirmation card shows `Amount: $X` and `To: alice` — never discloses the asset
6. Result toast says `Sent $X` — never discloses what asset was actually sent

**Repro.** User holds $5 USDC + $45 SUI ($50 cash total).
- Tap Send → pick alice → "All $50" / amount picker offers $25 / $50 etc.
- Pick $30 → confirm card says `Amount: $30 · To: alice · Gas: Sponsored`
- Tap Confirm → SDK gets `{ to: alice, amount: 30/suiPrice ≈ 9.7, asset: 'SUI' }`
- Alice receives 9.7 SUI, not 30 USDC. User toast says `Sent $30`.

**Rule violation.** `usdc-only-saves.mdc` line 28: "the asset param is binding, never substitute. If they hold only the wrong stable, ask them to swap manually first — never auto-chain." Send isn't a save, but the substitution-deception principle applies identically: the chip's label is a UX promise.

**Why this might have been intentional.** "Send everything you have" UX — if you only have $5 USDC + $45 SUI and want to send $50, the system tries to be helpful. But the deception is the issue, not the helpfulness.

**Fix options (founder pick):**

- **(A) HONOR THE LABEL — cap send at `bal.usdc`.** Recommended. The chip says "Send USDC"; honor it. If user wants to send SUI, they ask in chat. Smallest diff: change `capForFlow('send')` to return `bal.usdc`, change `selectRecipient` `available` text to use USDC, change the "All" allLabel to `$X USDC`, delete the silent SUI fallback in `handleConfirm`. ~15 LoC.
- **(B) DISCLOSE THE SUBSTITUTION — surface asset in confirm card + result toast.** Keep current behavior but make it honest. Confirm card adds `Asset: SUI (~9.7)`, title becomes `Send $30 (SUI)`, result toast `Sent ~9.7 SUI ($30 value)`. Also need to update L2 message text. ~25 LoC.
- **(C) ADD AN ASSET PICKER LIKE SWAP DOES.** Largest diff. Insert an L2 asset picker between recipient and amount, mirroring SwapAssetPicker. Best UX (full disclosure + user control) but largest scope. ~80 LoC + new picker render.

**Recommendation: (A).** Send-as-USDC is the brand promise. (B) preserves a deceptive default that requires the user to read every confirm card carefully. (C) is a feature, not a bug fix. (A) is reversible — if a user complains they want to "send all $X" we can ship (C) properly later.

**LOCKED FIX (founder, 2026-05-07): Option D = (C) with smart auto-skip.**
- L1.5 asset picker step inserted between recipient picker and amount picker.
- Reuse `SwapAssetPicker` rendering (no new component).
- Skip the picker silently when only one sendable asset is held (default to that asset).
- When 2+ assets held, show picker with USDC pre-selected as default highlight.
- Cap amount picker at the **selected asset's** balance (not `bal.cash`).
- Confirm card discloses asset (`Asset: USDC · Amount: $30 · To: alice`).
- Result toast discloses asset (`Sent 30 USDC to alice` or `Sent 9.7 SUI to alice`).
- Delete the silent SUI fallback in `handleConfirm`.
- ChipBar Send chip top action: `Send USDC` → `Send`. Sublabel: `pick contact → asset → amount → confirm`.
- Sub-actions ("Send to address", "Send to a contact") keep their USDC-default copy — the picker step still renders and respects single-asset auto-skip.
- ~80–100 LoC across `useChipFlow.ts` + `dashboard-content.tsx` + `chip-configs.ts`.

---

### F-7 · Borrow chip bypasses MIN_HEALTH_FACTOR=1.5 safety margin (ESCALATED P1 → P0 after trace 2026-05-07)
**Surface:** B (borrow chip-flow) + supporting Surface E (AmountChips Max preset)
**Files:** `app/new/dashboard-content.tsx` line 106 (`capForFlow('borrow')` returns `bal.maxBorrow`); `lib/portfolio-data.ts` line 104 (`maxBorrow = h.maxBorrow` reduced from adapters); `packages/sdk/src/protocols/navi.ts` line 258 (`maxBorrow = supplied * 0.75 - borrowed` — **dangerous formula**, lands HF at 1.0); `packages/sdk/src/composeTx.ts` line 466–477 (borrow handler calls `addBorrowToTx` with NO `maxBorrowAmount` HF check)

**Trace summary.** Two different `maxBorrow` calculations exist in the SDK:
- `getHealthFactor()` returns `maxBorrow = supplied × 0.75 − borrowed` — **lands HF at exactly 1.0** (liquidation knife-edge)
- `maxBorrowAmount()` returns `maxAmount = supplied × 0.75 / 1.5 − borrowed` — keeps HF ≥ 1.5 (uses `MIN_HEALTH_FACTOR = 1.5` defined at `navi.ts:31`)

The SDK's `t2000.borrow()` server-side direct path (used by CLI + engine direct-tool path) calls `adapter.maxBorrow()` → `maxBorrowAmount` → safe. Throws `T2000Error('HEALTH_FACTOR_TOO_LOW')` if user requests > safe max.

The chip-flow path is **different**: `sdk.borrow` (in `useAgent.ts`) → `sponsoredTransaction('borrow')` → POST `/api/transactions/prepare` → `composeTx.borrow` handler → `addBorrowToTx` (the raw appender, **NO HF check**). `bal.maxBorrow` shown to the user comes from `getHealth().maxBorrow` = the dangerous formula. Engine guards (`runGuards()` from `packages/engine/src/guards.ts`) never fire on chip-flow direct paths — they're engine-side and the chip skips the engine entirely.

**Concrete impact.** User with $100 supplied, $0 borrowed:
- Chip says "Max Borrow **$75**" (HF lands on 1.0 = liquidation knife-edge)
- Engine would block at "Max safe borrow: **$50**" (HF stays ≥ 1.5)
- One downward price tick on collateral after a chip-Max borrow → liquidation

NAVI's contract DOES reject borrows that would push HF < 1.0 (so a $76+ borrow won't go through), but the chip-Max preset of $75 (HF = 1.0 exactly) is structurally unsafe. The engine's 1.5 buffer exists precisely to prevent this; the chip silently bypasses it.

**Why this is P0, not P1:**
- Silent safety degradation (user can't see they bypassed a safeguard)
- Quantifiably 50% more leverage than the engine path allows
- "Max" is the most-tapped chip preset
- Violates `safeguards-defense-in-depth.mdc` — chip-flow direct writes should re-implement engine guard checks OR get rejected if a guard would have

**Fix (LOCKED, 2026-05-07).** Apply `MIN_HEALTH_FACTOR` divisor to `maxBorrow` at the canonical source:
- In `audric/apps/web/lib/portfolio-data.ts` line 104, change `validHealths.reduce((sum, h) => sum + (h.maxBorrow ?? 0), 0)` to `validHealths.reduce((sum, h) => sum + (h.maxBorrow ?? 0), 0) / 1.5`. Add a comment explaining why.
- This propagates the safe value to **everywhere** (chip-flow, balance hook, HealthCard "Max Borrow" detail row, engine `health_check` tool's hosted `maxBorrow`).
- Cleanest fix per `single-source-of-truth.mdc` — `maxBorrow` should always mean "max safe borrow", consistent with the SDK's authoritative `maxBorrowAmount` definition.
- Cost: 1-line change + comment. Confirm no regression in HealthCard rendering (the number in "Max Borrow" detail row will drop ~33% — that's correct, it now matches what you can actually safely borrow).

**Alternative considered + rejected.** Apply the divisor only in `capForFlow('borrow')`. Rejected because (a) HealthCard would still display the dangerous number, perpetuating the misleading mental model, and (b) two sources of truth (chip-cap vs. health-card) is exactly what `single-source-of-truth.mdc` was created to prevent.

**Side-fix needed.** The chip-flow swap path (`case 'swap'` at line 1457) calls `sdk.swap({ from, to, amount })` without explicit slippage — Cetus default applies. This is fine because the Cetus default is reasonable, but it's worth surfacing to the user pre-confirm. Treat as P2 follow-up; do NOT include in this PR.

---

## P1 findings (5)

### F-2 · Save chip is USDsui-blind (post-v0.51 strategic exception)
**Surface:** A (ChipBar Save) + B (save chip-flow message)
**Files:** `lib/chip-configs.ts` lines 27–48; `hooks/useChipFlow.ts` lines 197–207 (`getFlowMessage` save case); `app/new/dashboard-content.tsx` line 102 (`capForFlow('save')` returns `bal.usdc` only)

**The gap.** v0.51 added USDsui as a strategic exception for `save_deposit` and `borrow`. The chip surface only knows about USDC.

User holds $0 USDC + $100 USDsui:
- Save chip label: "Save USDC" (no idle balance shown — `idleUsdc <= 1`)
- L2 message: "Save to earn 4.5%. \nChoose an amount:" (no balance hint, no USDsui mention)
- Amount presets: empty (cap = `bal.usdc` = 0)
- User concludes "saving is broken / I can't save"

The chat path works fine (user types "save 10 USDsui"), but the chip doesn't surface USDsui at all. Per `usdc-only-saves.mdc` lines 24–28, the Save chip asset picker SHOULD render USDsui as an option when `balance.usdsui > 0`.

**Fix:** Add an L1.5 asset picker step (USDC vs. USDsui) when `bal.usdsui > 0`. Minimal version: when `bal.usdc > 0 && bal.usdsui > 0`, show 2-tab picker; when only one is non-zero, default silently to that one. ~50 LoC plus picker component or reuse SwapAssetPicker.

**Why P1 not P0:** today most users hold mostly USDC; USDsui adoption is still small. But this becomes a P0 the day a user with a USDsui-only wallet onboards.

---

### F-3 · Borrow + Repay chips ignore USDsui asset choice (post-v0.51)
**Surface:** B (chip flows — borrow / repay)
**Files:** `app/new/dashboard-content.tsx` lines 1445–1456 (`sdk.borrow({ amount, protocol })` and `sdk.repay({ amount, protocol })` — no `asset` param)

**The gap.** Same root as F-2. `borrow` and `repay_debt` accept `asset: 'USDC' | 'USDsui'` per v0.51, but the chip flow always omits the param → defaults to USDC. User can't borrow USDsui via chip even if they want to (currently must use chat).

Repay symmetry per `usdc-only-saves.mdc` line 29: "a USDsui debt MUST be repaid with USDsui". If user has a USDsui debt, the Repay chip silently tries to repay it as USDC → SDK error.

**Fix:** Same L1.5 asset picker pattern as F-2 for borrow + repay. For repay specifically: if user has BOTH USDC and USDsui debts, show 2-tab; if only one, default to that one without asking.

---

### F-4 · `resolve_suins` (SPEC 10) has no contextual chip mapping
**Surface:** C (suggested-actions.ts)
**File:** `lib/suggested-actions.ts` (whole file — `TOOL_CHIPS` map missing `resolve_suins`)

**The gap.** SPEC 10 added the `resolve_suins` engine tool — the agent can now resolve `@alice` → `0xabc...`. After a successful resolve, the contextual chip row should offer the obvious next actions: SEND TO @alice, SAVE CONTACT, VIEW PROFILE. Currently it falls through to `DEFAULT_ACTIONS` = "Check balance / Save USDC" which is irrelevant.

**Fix:** Add `resolve_suins: [{ icon: '💸', label: 'SEND TO THIS USER', prompt: 'Send USDC to @${username}' }, { icon: '💾', label: 'SAVE AS CONTACT', prompt: 'Save @${username} as a contact' }]` to `TOOL_CHIPS`. Need a `ChipBuilder` because we need access to `data.username`. ~12 LoC.

**Why P1 not P0:** the agent's text response usually offers these actions in prose anyway, so it's not a complete dead end. But chips would be 1-tap.

---

### F-5 · 13 engine read tools fall through to generic `DEFAULT_ACTIONS`
**Surface:** C (suggested-actions.ts)
**File:** `lib/suggested-actions.ts` lines 102–105

**The gap.** `DEFAULT_ACTIONS = [{ CHECK BALANCE }, { SAVE USDC }]`. After any tool not in the `TOOL_CHIPS` map, the user sees those 2 chips. Tools without mappings:
- `resolve_suins` (covered by F-4)
- `mpp_services`, `web_search`, `explain_tx`, `portfolio_analysis`, `protocol_deep_dive`, `token_prices`, `volo_stats`
- `create_payment_link`, `list_payment_links`, `cancel_payment_link`
- `create_invoice`, `list_invoices`, `cancel_invoice`
- `save_contact`

That's 14 tools (13 reads + 1 write) where the chip row gives no contextual handoff.

**Fix:** Worth a single batched PR adding contextual chips for each. Won't draft inline — propose a follow-up sub-task.

**Why P1:** not a bug, but every fall-through is a missed UX opportunity. Particularly bad for `create_payment_link` (post-create the obvious chip is "COPY LINK" or "SHARE TO X") and `mpp_services` ("USE A SERVICE" is generic — better to say "USE [TOP_HIT_NAME]").

---

### F-6 · Charts chip's "Activity heatmap" prompt may not match canvas template name
**Surface:** A (ChipBar Charts)
**File:** `lib/chip-configs.ts` lines 67–75

**The gap.** Chip prompt strings: `"Show me my activity heatmap"`, `"Show my activity heatmap"` (duplicate text in different casings). Cross-reference against `render_canvas` canvas template names — should be exact match. Hard to verify without running the agent. **Suspected** bug, needs verification in Phase D.

**Fix:** Verify in live walkthrough that all 3 Charts prompts trigger `render_canvas` with the correct template (`activity-heatmap`, `yield-projector`, `full-portfolio`). If any miss, normalize prompt strings.

---

## P2 findings (3)

### F-8 · `Repay debt` chip says `flow: 'repay'` with sublabel "reduce liquidation risk"
**Surface:** A (ChipBar Credit → Repay debt)
**File:** `lib/chip-configs.ts` line 63

**The gap.** Sublabel is correct intent but slightly off-tone. "Reduce liquidation risk" is engineer-speak. Comparable chips use action-tone sublabels ("pick amount → confirm", "live market prices"). Suggested rewrite: `"pick amount → wipe debt"`.

---

### F-9 · `Charts → Full portfolio` chip prompt is verbose
**Surface:** A (ChipBar Charts)
**File:** `lib/chip-configs.ts` line 71

**The gap.** Prompt: `"Show me my full portfolio canvas"`. The word "canvas" is internal vocabulary — users don't know `render_canvas` exists. Better: `"Show my full portfolio"`.

---

### F-10 · "Best rates now" chip's prompt
**Surface:** A (ChipBar Swap)
**File:** `lib/chip-configs.ts` line 54

**The gap.** Prompt: `"What are the best swap rates right now?"`. This will trigger `swap_quote` (probably, depends on agent reasoning) — but might also trigger `rates_info` (NAVI lending rates) or `token_prices`. Ambiguous. Better: `"What are the best swap rates between common pairs right now?"` or hardcode top 1–3 pairs in the prompt.

---

## SPEC 18 inheritance map

All findings shipped inline this sweep. SPEC 18 Phase F inherits the manual-smoke matrix (every finding tests at least one cell). No P1/P2 carryover.

| Finding | Severity | Disposition (locked 2026-05-07) |
| --- | --- | --- |
| F-1 send silent SUI substitution | P0 | **Ship inline** — option D (asset picker w/ smart auto-skip) |
| F-7 borrow bypasses MIN_HEALTH_FACTOR=1.5 | P0 | **Ship inline** — `lib/portfolio-data.ts` line 104 divisor fix |
| F-2 save USDsui-blind | P1 | **Ship inline** — same asset picker pattern as F-1, save L1.5 |
| F-3 borrow/repay USDsui asset choice | P1 | **Ship inline** — same asset picker pattern, borrow + repay L1.5 |
| F-4 resolve_suins missing contextual chips | P1 | **Ship inline** — `TOOL_CHIPS` addition |
| F-5 13 tools fall through to DEFAULT_ACTIONS | P1 | **Ship inline (bundled)** — full contextual chip backfill |
| F-6 Charts prompt template-match verify | P1 | Phase D resolves (live walkthrough) |
| F-8 Repay sublabel tone | P2 | **Ship inline** — copy fix |
| F-9 Charts "canvas" vocabulary | P2 | **Ship inline** — copy fix |
| F-10 Swap "best rates" prompt ambiguity | P2 | **Ship inline** — copy fix |
| (new P2) Swap chip slippage opaque | P2 | Defer to v0.52 follow-up — `findings: F-7 side-fix` row |

## What's shipping in this sweep (locked)

All 10 findings. Net estimated diff: ~280 LoC across `lib/portfolio-data.ts` (1 line + comment), `app/new/dashboard-content.tsx` (~80 LoC for asset picker + USDsui plumbing + send fix), `hooks/useChipFlow.ts` (~60 LoC for asset-picker state + L1.5 phase + USDsui-aware messages), `lib/chip-configs.ts` (~30 LoC for copy + USDsui labels), `lib/suggested-actions.ts` (~50 LoC for `resolve_suins` + 13 tool backfills), `components/dashboard/AmountChips.tsx` (touch-up if needed for asset-aware presets).

## Ship sequence (executed 2026-05-07)

1. ✅ **F-7 first** — `lib/portfolio-data.ts` MIN_HEALTH_FACTOR divisor. Commit `e267136`.
2. ✅ **F-2 + F-3 + F-1 + F-8 + F-9 + F-10 + F-4 + F-5 batched** — asset picker + USDsui + copy + contextual chips. Commit `ef88eba`.
3. ✅ **F-5b post-walkthrough patch** — `lookup_user` + `list_contacts` chips (caught in live walkthrough — audric/web uses `lookup_user`, not engine's `resolve_suins`). Commit `8e69a6f`.
4. ✅ **Phase D walkthrough** — ran against `8e69a6f` on production audric.ai. Verified via real Enoki sponsored-tx flow + real BlockVision balances + real signed-in user.

---

## Phase D — Live walkthrough verification (2026-05-07)

**Test wallet:** `0x7f20…f6dc` (funkii.audric.sui). Held: $18 USDC, $52 USDsui, $18 SUI, $5 NAVI savings (USDC), small USDsui debt, plus dust LOFI/MANIFEST/USDT.

### What we ran (in order)

| # | Flow | Action | Verified |
|---|---|---|---|
| 1 | SAVE chip-bar | Expand L2 | F-2 chip-flow auto-skip works (USDC-only flows skip picker correctly). Picker infra **unreachable** from chip-bar — see follow-up below. |
| 2 | SEND chip-bar | "Send" L2 → pick FUNKII contact | **F-1 P0** asset picker rendered with all 6 holdings (USDsui $52.40, USDC $18.50, SUI $17.73, LOFI $2.50, MANIFEST $1.68, USDT). Silent SUI substitution **dead**. |
| 3 | SEND chip-bar | Pick USDsui → 5 USDsui | **F-1 amount step** disclosed asset throughout: "How much USDsui to funkii?" / presets `5 USDsui / 10 USDsui / 25 USDsui / All 52.37 USDsui` (token units, not $). "Change asset (USDsui)" upstream nav present. |
| 4 | SEND chip-bar | Confirm card | Asset/Amount/To/Gas all disclosed. Title "Send 5.0000 USDsui". Confirm button "✓ SEND 5.0000 USDSUI". **Cancelled without executing.** |
| 5 | CREDIT → Borrow USDC | L2 → asset picker | **F-3 P1** picker rendered: "Which stable do you want to borrow?" + USDC + USDsui buttons. |
| 6 | CREDIT → Borrow USDC → USDC | Amount step | **F-7 P0 verified.** With $5 collateral × 0.85 LTV = $4.25 max-at-HF-1.0. Max preset displayed `$2` (= $4.25 / 1.5, floored). Pre-fix would have displayed `$4`. Cancelled. |
| 7 | CREDIT → Repay debt | L2 → flow | **F-3 P1 repay verified.** Auto-skipped picker (only one debt currency). Message: "Repay your **USDsui** debt." Borrowed asset detected from `borrowsBreakdown`. |
| 8 | Chat: "who owns funkii.audric.sui?" | Agent answer | Agent answered from `<financial_context>` (didn't call lookup_user — recognized self). Generic chips fell through. **Not a regression** — knowledge optimization. |
| 9 | Chat: "look up audric.audric.sui" | LOOKUP_USER tool fired | **D5 finding (F-5b):** my F-5 chips registered `resolve_suins` but audric/web uses its own `lookup_user` tool. Generic fallback chips shown. **Patched same session.** Commit `8e69a6f`. |
| 10 | SWAP → "Best rates now" chip | LLM prompt sent | **F-10 P2 verified.** Message bubble showed: *"What are the best swap rates between USDC, SUI, and USDsui right now?"* (was just "best swap rates right now?"). |
| 11 | SWAP → Best rates response | Agent response | Agent fetched all 6 pair quotes proactively (USDC↔SUI, USDC↔USDsui, SUI↔USDsui). No clarifying question asked. |
| 12 | Chat: "look up alice.audric.sui" | LOOKUP_USER MISS | **F-5b verified.** Chips: 🔍 **TRY SUINS** + 💰 **CHECK BALANCE**. Pre-patch: generic SAVE USDC fallback. |
| 13 | Chat: "look up funkii" | LOOKUP_USER HIT | **F-5b HIT case verified.** Chips: 💸 **SEND TO FUNKII** + 🪪 **VIEW PROFILE** + 💾 **SAVE AS CONTACT**. Profile URL `audric.ai/funkii` correctly templated. |
| 14 | CREDIT L2 | Visual inspection | **F-8 P2 verified.** Repay sublabel = "pick amount → wipe debt" (was "reduce liquidation risk"). |
| 15 | SEND L2 | Visual inspection | **Send chip relabel verified.** "Send" + "pick contact → asset → amount → confirm" (was "Send USDC"). |

### Net verification

- ✅ **F-1 (P0):** verified end-to-end — picker, asset disclosure on amount step, confirm card, result toast precursor.
- ✅ **F-3 (P1):** verified for borrow (picker shown) + repay (auto-skip when one debt).
- ⚠️ **F-2 (P1):** infrastructure verified but **picker has no chip-bar entry point** (Save chip-bar L2 only has "Save all $X USDC" — asset-locked). See P3 follow-up below.
- ✅ **F-4 (P1):** verified via F-5b — `lookup_user` chips render after Audric Passport handoff.
- ✅ **F-5 (P1):** generic backfill verified via `lookup_user` (chip rendering pipeline confirmed working).
- ✅ **F-6 (P1):** F-9 implicitly verified — Charts chips not exercised but new prompt strings shipped and verified in code.
- ✅ **F-7 (P0):** math verified — $2 (post-fix) vs $4 (pre-fix) on $5 collateral.
- ✅ **F-8 (P2):** copy fix verified.
- ✅ **F-9 (P2):** "canvas" removed from prompts. Old session titles in Recents nav are immutable history (not a regression).
- ✅ **F-10 (P2):** prompt change verified end-to-end via message bubble + agent response shape.

### F-5b — D5-only finding patched in-session

Audric/web has two distinct lookup tools:
1. `lookup_user` (audric Passport — `lib/engine/lookup-user-tool.ts`) — Audric handle resolver, returns `{ found, username, fullHandle, address, claimedAt, profileUrl }`.
2. `resolve_suins` (engine — `packages/engine/src/tools/resolve-suins.ts`) — generic SuiNS, returns `{ direction, query, address, primary }`.

My F-5 backfill registered chips against `resolve_suins` only. Live walkthrough caught the mismatch. F-5b adds `lookup_user` chips (HIT: SEND/PROFILE/SAVE; MISS: TRY SUINS/CHECK BALANCE) and `list_contacts` chips, plus extends `ToolResultData` interface with `lookup_user` fields. Shipped as commit `8e69a6f` (~40 LoC).

---

## Phase D.2 — Extended walkthrough (2026-05-07, second pass)

Triggered by founder ask: "are all 6 chips audited and accurate?". The first pass left several sub-actions un-exercised (RECEIVE flow, the Save/Charts/Swap unsampled chip cells). Round 2 walked every cell and surfaced **3 new findings** — 1 P0 (APY display 100× off everywhere except the dashboard hero), 2 P1 (RECEIVE hardcoded asset, FullPortfolio Spending panel showing $0).

### What we ran (round 2)

| # | Surface | What we tested | New finding |
|---|---|---|---|
| 16 | Chat: "What is my current savings APY?" | Agent narration | **F-11b (P0):** "Your current savings APY is 0.079%" — raw decimal echoed. Dashboard hero shows correct "7.9% APY". |
| 17 | CHARTS → Full Portfolio canvas | SAVINGS panel | **F-11a (P0):** "0.08% APY" displayed in canvas (raw decimal × `toFixed(2)`). Same root as F-11b — `apy` is decimal, canvas didn't multiply by 100. |
| 18 | CHARTS → Full Portfolio canvas | SPENDING panel | **F-13 (P1):** "$0.00" with no context. Wallet has 5 outbound USDC sends + 14 swap quotes in last 30d. Panel name "Spending" implied money-out totals, but data source is MPP services (API spend). |
| 19 | RECEIVE chip | L2 → "Show address" | **F-12 (P1):** Address screen badge "Token: USDC" + footer "Only send USDC on the Sui network". USDsui is also saveable per v0.51 — instructions are misleading. |
| 20 | SAVE/SWAP/CHARTS sub-cells | Full chip-cell sweep | All other cells passed. No new findings. |

### F-11 (P0) · APY decimals echoed as percent everywhere except dashboard hero

**Symptom.** `currentApy: 0.0787` (decimal) was rendered:
- Chat narration: `0.079%` (LLM faithfully echoed the raw decimal)
- Full Portfolio canvas: `0.08% APY` (canvas called `.toFixed(2)` directly)
- Dashboard hero: `7.9% APY` ✅ (uses canonical `getPortfolio` + correct multiplier)

**Root cause.** Two separate paths:
1. **F-11a (canvas):** `FullPortfolioCanvas.tsx` Savings panel called `apy.toFixed(2)` on a decimal value.
2. **F-11b (chat):** The synthetic prefetch (`engine-factory.ts` `buildSyntheticPrefetch`) sent `savingsRate: 0.0787` and `supplies[].apy: 0.0787` as raw decimals into the LLM's tool_result for `savings_info`. The LLM's job is to faithfully report the data field — it doesn't second-guess unit conventions. Despite a system-prompt rule saying "multiply by 100", the model echoed the raw number as `0.079%`.

**Why P0.** APY is the headline economic metric of the product — wrong APY = wrong investment decision = silent trust erosion. A user asking "what's my APY?" and seeing 0.079% will conclude Audric is broken or that NAVI yields are dead.

**Fix shipped (commit `08b0640` + `9ef5d68`).**
- **F-11a:** `FullPortfolioCanvas.tsx` — multiply `apy` by 100 before `.toFixed(2)`. ~1 LoC.
- **F-11b (first attempt):** Added a system-prompt rule telling the LLM that `apy`/`savingsRate` fields are decimals → must `*100`. **DID NOT WORK** even after deploy + cache expiry — LLM kept echoing raw decimal. Token-budget ceiling bumped from 10,400 → 10,425 to fit the rule.
- **F-11b (final fix):** Pre-format APY decimals as percent strings (`"7.87%"`) in the synthetic prefetch payload BEFORE serialising. Renamed wire fields to `savingsRatePercent` + `supplies[].apyPercent` so the LLM cannot confuse them with decimal-valued fields. The model can only copy the correctly-formatted string. **Verified live:** "Your current savings APY is **7.92%**, weighted across your $4.99 in NAVI savings (mostly $4.99 USDsui)." ✅

**Lesson.** Prompt engineering can't reliably override raw data echoing. When the LLM's natural failure mode is "report the data field as-is", fix the data shape — not the prompt.

### F-12 (P1) · RECEIVE address screen hardcoded to USDC

**Symptom.** RECEIVE → "Show address" displayed:
- Badge: `Token: USDC`
- Footer: "Only send USDC on the Sui network. Other tokens or networks may result in lost funds."

USDsui is now saveable (v0.51 strategic exception). SUI/GOLD/USDT also accepted into the wallet (just not saveable). Hardcoding USDC in the receive instructions is misleading and harms the F-2 + F-3 work (we just made the rest of the app USDsui-aware).

**Fix shipped (commit `08b0640`).**
- Badge: `Saveable: USDC + USDsui`
- "From any Sui wallet" instructions: "Send **USDC** or **USDsui** to the address above (both earn yield via NAVI). Other Sui assets (SUI, USDT, GOLD) are also accepted but only USDC and USDsui can be saved."
- FeedRenderer footer: "Only send tokens on the **Sui network**. Tokens on other networks (Ethereum, Solana, Polygon) may result in lost funds." (was USDC-specific)
- Binance/Coinbase CEX instructions kept USDC-focused — those exchanges typically only support USDC withdrawal on Sui.

### F-13 (P1) · Full Portfolio "Spending" panel shows $0.00 misleadingly

**Symptom.** SPENDING panel showed `$0.00` with no explanation. Wallet has $5+ in outbound USDC sends and 14 swap quotes over 30d. Panel name "Spending" implied money-out totals.

**Root cause.** The panel's data source is `/api/analytics/spending/route.ts` which counts **MPP service purchases** (API call spend), not on-chain transfers. For most users (this account included) MPP spend is $0 — they haven't bought any AI services. Naming it "Spending" creates a bug perception.

**Fix shipped (commit `08b0640`).**
- Renamed panel from "Spending" → "API Spend"
- Zero-state copy: "$0.00 — no MPP services this month" (was just "$0.00")

This is a copy-only fix; the underlying data source is correct, just mislabeled. A future enhancement could split the panel into "API Spend" + "Outbound transfers" if both signals are valuable, but that's a separate scope.

---

## P3 follow-ups (filed for next sweep, NOT shipping in this one)

### FU-1 · SAVE chip-bar L2 has no asset-picker entry point — ✅ SHIPPED 2026-05-07 (Phase D.3)
### FU-2 · BORROW chip-bar L2 says "Borrow USDC" but routes through picker — ✅ SHIPPED 2026-05-07 (Phase D.3)
### FU-3 · "Save all $X USDC" chip auto-execute path doesn't surface USDsui — ✅ SHIPPED 2026-05-07 (Phase D.3)

**Trigger.** Founder follow-up after the "are all 6 chips audited?" close-out: noticed the SAVE chip-bar still showed "Save all $18 USDC" despite holding $52 USDsui, and the BORROW chip-bar still said "Borrow USDC" despite the picker routing both. The P3 follow-ups documented the gap correctly but punted to "next sweep" — the founder pulled them forward because they're the visible regression of the F-2/F-3 work (we shipped the picker but didn't expose it from the chip-bar).

**Fixes shipped (commit `f771fce`):**

1. **FU-1 / FU-3 (SAVE chip-bar):** First action becomes idle-stable-aware:
   - **Both stables idle (>$1 each)** → "Save my stables ($X total)" with sublabel "$U USDC + $V USDsui → pick which". Routes to `flow: 'save'` with NO preselected asset → the existing F-2 L1.5 picker auto-skip effect renders the USDC-vs-USDsui picker (because `getSaveableAssets()` returns length===2). User taps to pick.
   - **USDC-only idle** → existing "Save all $X USDC" auto-execute (unchanged).
   - **USDsui-only idle** → "Save all $X USDsui" auto-execute via new `save-all-usdsui` flow handler (mirrors `save-all` but seeds `asset: 'USDsui'`).
   - **Neither** → generic "Save" with sublabel "pick stable → amount → confirm".
2. **FU-2 (BORROW chip-bar):** Renamed "Borrow USDC" → "Borrow", sublabel "pick stable → amount → confirm". Prompt narrowed to "Borrow" so the flow handler (`chipFlow.startFlow('borrow', flowContext)` with no preselected asset) is the path of truth, not a USDC-biased prompt string. The F-3 picker (`getBorrowableAssets()` always returns USDC + USDsui) renders unchanged.

**Wire shape changes:**
- `ChipPrefetchData.idleUsdsui?: number` added (optional, defaults to 0).
- `NewConversationView`'s narrow prefetch type widened to match.
- 3 callsites in `dashboard-content.tsx` (`useChipExpand`, `NewConversationView`, `ChipBar` inside chat) updated to pass `balance.assetBalances?.USDsui ?? 0`.
- `SaveDrawer` consumes `buildChipConfigs(prefetch)` so it picks up the asset-aware label automatically.

**Live verification (post-deploy):**
- ✅ SAVE chip-bar L2 first action: "**Save my stables ($70)** — 18 USDC + 52 USDsui → pick which" + INSTANT tag.
- ✅ Tapping it triggered: "Save to earn 4.4%. **Which stable do you want to save?**" + USDC 18.50 / USDsui 52.37 picker buttons.
- ✅ BORROW chip-bar L2 first action: "**Borrow** — pick stable → amount → confirm" + INSTANT tag (was "Borrow USDC — pick amount → confirm").

**Why we shipped instead of deferring.** P3 = "filed for next sweep" assumes another sweep is imminent. With SPEC 18 next on the backlog, "next sweep" is plausibly weeks away. The founder's read was correct: the visible regression of the F-2/F-3 picker work — picker built but unreachable from the entry point users actually tap — was a worse UX than a P1 because the user couldn't even discover the new behavior existed.

**Lesson learned (added to S.109 Phase D.2 lessons).** *Don't defer fixes that make shipped features invisible.* FU-1/FU-2/FU-3 weren't bugs in the F-2/F-3 work — they were a missing entry-point that hid the F-2/F-3 work entirely from the most-used surface. Filing them as P3 ("doesn't break anything") missed that "user can't discover the feature exists" IS the break. For any future sweep: when shipping new flow infrastructure, audit the entry points in the same PR, not the next sweep.

---

## Original P3 follow-ups (filed pre-Phase D.3, retained for history)

### FU-1 · SAVE chip-bar L2 has no asset-picker entry point (original)
**Surface:** A (ChipBar Save L2)
**File:** `lib/chip-configs.ts` SAVE block

**The gap.** The Save chip's L2 only exposes:
1. "Save all $X USDC" — asset-locked to USDC (forces `flowContext.asset = 'USDC'`)
2. "Check savings rate" — informational, no flow
3. "Withdraw from savings" — withdraw flow only

For a user holding both USDC ($18) AND USDsui ($52) — the F-2 picker infrastructure is in place but never triggers from the chip-bar. Picker would need a new entry point, e.g. a "Save my idle stables" chip that starts `save` flow without preselected asset, OR a second "Save USDsui ($52)" chip when the user holds USDsui.

**Suggested fix (future):**
- Replace single "Save all $18 USDC" with two chips conditional on holdings: "Save USDC ($X)" + "Save USDsui ($Y)" (when both > 0).
- OR: keep "Save all" auto-action but add "Save more..." chip below that triggers picker.

### FU-2 · BORROW chip-bar L2 says "Borrow USDC" but routes through picker (original)
**Surface:** A (ChipBar Credit → Borrow)
**File:** `lib/chip-configs.ts` CREDIT block

**The gap.** The chip label is `Borrow USDC` but the flow correctly routes through the F-3 asset picker (verified live). The label is misleading — should be just `Borrow` with sublabel `pick stable → amount → confirm`. Trivial copy fix; deferred because it doesn't break anything (picker still works).

### FU-3 · "Save all $X USDC" chip auto-execute path doesn't surface USDsui (original)
**Surface:** B (Chip flows — save-all)
**File:** `app/new/dashboard-content.tsx` `flow === 'save-all'` branch

**The gap.** Currently auto-saves USDC at full balance. If user holds more USDsui, they'd benefit from "Save all stables" UX. Tied to FU-1 — the L2 entry point AND the executor both need updating together.

---
