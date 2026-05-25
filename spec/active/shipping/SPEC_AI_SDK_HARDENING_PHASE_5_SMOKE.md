# SPEC_AI_SDK_HARDENING — Phase 5 Smoke Checklist

> **Status:** PASSED 2026-05-24 ~13:54 AEST — all P5 items verified end-to-end on prod (`audric.ai`, audric `fdadfd4` post-S.295 redeploy). Headline signals captured below; full breakdown in `audric-build-tracker.md` S.294 "Post-redeploy smoke" block. This file is kept as the smoke template for the next phase close-out.
> **Original status:** active · drafted 2026-05-24 13:15 AEST · target: founder · est. 10–15 min
> **Builds smoked:** audric `fdadfd4` (Phase 5 hotfix + P5.6 + LT self-audit fix) · t2000 `7b5f575c`
> **Live URL:** [audric.ai](https://audric.ai)
> **Pre-req wallet state:** signed in with a Passport that has BOTH supplied USDC AND an active USDC (or USDsui) borrow on NAVI. This is the wallet state that exercises the LT bug fix end-to-end.

## Headline pass signals (founder smoke, 2026-05-24)

1. All 4 row actions (Copy / Edit / Vote / Regenerate) appear on hover for both user + assistant rows — S.294 hotfix confirmed.
2. PermissionCard for `Borrow 5 USDC` rendered `Borrow rate 4.87% APY` (P5.6 `borrowApyBps`) + `Health factor ∞ → 1.83` (P5.6 `currentHF` / `projectedHF`).
3. Math check: agent stated max-safe borrow = $6.09 with $0 debt → `collateral × LT = 9.135` → projected HF for borrow 5 = `9.135 / 5 = 1.83 ✓`. If the S.293 LT fix had not shipped, the card would have shown ~1.10 (warning). The 1.83 number is the in-vivo proof S.293 is correct.
4. HF guard blocked `Borrow 50 USDC` with "max is $6.09, want me to use that?" — Layer 3 safety stack confirmed.
5. Deny flow clean — `User denied the action` tool result + graceful narration.

---

## Why this exists

Phase 5 of `SPEC_AI_SDK_HARDENING.md` (6 P-items, 3 commits) shipped over the last few hours. The pre-ship self-audit caught one bug (P5.6 LT back-derivation). Before moving to Phase 6, run this checklist to confirm every shipped item works in live prod, AND that the LT fix actually corrects the numbers.

Each item names the **verifiable signal** — the specific thing you should see / click / read that proves it works. If the signal doesn't match, that's the regression and you stop + tell me.

---

## Setup (1 min)

1. Open `https://audric.ai` in a fresh tab.
2. Sign in with the test Google account whose Passport has the supplied + borrowed NAVI position.
3. Open browser devtools → Console tab. Keep it open through the smoke run — most P5 items emit log lines you can correlate.
4. Open a new chat (don't resume an old one — fresh state is cleaner).

---

## P5.1 — Edit user message + re-send (3 min)

This was the biggest UX win. Send a message, get a response, then edit the original to verify truncation works at BOTH the client AND DB level.

### Steps

1. Type `What's my balance?` → Enter.
2. Wait for the assistant's full response (should include a balance card with your wallet + savings).
3. Hover the message bubble of `What's my balance?` → click the Edit icon (pencil) in the action row.
4. The bubble swaps to an inline `<Textarea>`. Type `What's my health factor?` (clear the original first).
5. Click Save (or press Enter).

### Verifiable signals

- ✅ The textarea swaps back to a normal message bubble showing `What's my health factor?` — the **original** balance response should disappear from the chat (truncated client-side).
- ✅ A NEW assistant response streams in below — should narrate your HF (something like "Your health factor is 2.3 — comfortably above the 1.5 safety threshold").
- ✅ Reload the page (Cmd+R). The chat should ONLY show `What's my health factor?` + its assistant response. The original `What's my balance?` + its response should be GONE (DB truncation worked).
- ✅ Devtools console should show a log line like `[audric-chat] edit-detected chatId=<id> anchorId=<msg-id> deleted=<N>` where `deleted >= 2` (the wiped messages).

### What would be a regression

- ❌ Original message still visible after reload → DB truncation failed.
- ❌ Edit textarea doesn't appear when you click the icon.
- ❌ "Send" button stays disabled even with text in the textarea.
- ❌ A second assistant response from the ORIGINAL question shows up after the edit (the abort didn't fire).

---

## P5.2 — Copy buttons (1 min)

### Steps

1. Hover the assistant's HF response from P5.1.
2. Click the Copy icon (clipboard) in the action row.
3. Paste into the chat input (or anywhere else) with Cmd+V.

### Verifiable signals

- ✅ Clipboard contains the assistant's NARRATION TEXT only — not the raw JSON, not the tool call output, not the thinking trace.
- ✅ Copy icon briefly shows a checkmark / confirmation state then reverts.
- ✅ Test the same on your OWN user message — should copy your typed text.

### What would be a regression

- ❌ Clipboard contains `{"toolCallId":...}` or any JSON markup → `getMessageText` helper isn't filtering correctly.
- ❌ No icon visible on hover → MessageAction wiring broke.
- ❌ Clipboard is empty.

---

## P5.3 — Vote hydration on reload (2 min)

### Steps

1. On the same assistant HF response, click the 👍 (thumbs up) vote icon. Should visually indicate "voted up."
2. Reload the page (Cmd+R).
3. After reload, look at the same assistant message.

### Verifiable signals

- ✅ The 👍 icon is still highlighted/active after reload — the vote persisted to DB AND rehydrated on mount.
- ✅ Devtools Network tab on reload should show a SINGLE `GET /api/vote?chatId=<id>` call (batched) — NOT N calls per message.
- ✅ Vote down works too (and overrides the previous up).

### What would be a regression

- ❌ Icon resets to neutral after reload → vote not persisting OR not hydrating.
- ❌ Multiple `/api/vote` requests in Network tab → N+1 problem (regression of P5.3 fix).

---

## P5.4 — Regenerate last assistant (1 min)

### Steps

1. Hover the most recent assistant response.
2. Click the Regenerate icon (↻).

### Verifiable signals

- ✅ The assistant message disappears and a NEW response streams in (likely similar content, since the question was the same).
- ✅ Regenerate icon only appears on the LAST assistant message (NOT on older ones — per-message regenerate was deferred to backlog).

### What would be a regression

- ❌ Regenerate icon shows on every message (P5.4 scope creep — should only be the tail).
- ❌ Clicking does nothing or duplicates the message instead of replacing.

---

## P5.5 — Stop button (2 min)

### Steps

1. Type a deliberately long-running prompt: `Give me a deep analysis of my portfolio: every position, every yield source, every risk factor, with specific recommendations.`
2. Wait for streaming to START (you should see text appearing).
3. Click the Stop button (square icon, replaces the Send button while streaming).

### Verifiable signals

- ✅ Streaming text STOPS immediately (within ~1 sec).
- ✅ Partial response is preserved in the chat (NOT wiped).
- ✅ Send button comes back enabled — you can immediately send another message.
- ✅ Devtools console should show telemetry lines mentioning `stop` / `abort`.

### What would be a regression

- ❌ Text keeps streaming after click → AbortController wiring broke.
- ❌ Whole partial response disappears → over-aggressive cleanup.
- ❌ Send button stuck disabled → state not transitioning out of streaming.

---

## P5.6 — Live HF/APY metadata on PermissionCard ⭐ MOST CRITICAL (5 min)

This is where the audit bug lived. We need to verify BOTH that the rows light up AND that the projected HF number is correct (not the buggy too-low value).

### Step A: Borrow flow — checks LT back-derivation directly

Use a wallet with existing USDC supplied AND active USDC borrow. Note your CURRENT HF before starting (check NAVI directly or ask Audric `what's my health factor?` first).

1. Type `Borrow 5 USDC against my savings`.
2. Wait for the PermissionCard (confirm-tier write).

### Verifiable signals on the card

- ✅ **`Borrow rate` row** shows a real APY (e.g. `Borrow rate · 4.67%`) — NOT the italic "Variable rate — locked at execute time" disclaimer (that's the pre-P5.6 / first-time-borrower fallback; with existing position you should get the live number).
- ✅ **`Health factor` row** shows TWO numbers: `current → projected` format.
- ✅ The **current HF** matches what `what's my health factor?` would return (the answer you noted before starting).
- ✅ The **projected HF** is LOWER than current (you're adding $5 of debt).
- 🚨 **Sanity-check projected HF arithmetic** — quick mental math to confirm the LT fix is live:
  - Real projected HF ≈ `current_HF × current_borrowed / (current_borrowed + 5)`.
  - Example: current $300 borrowed, HF 2.50 → projected ≈ 2.50 × 300/305 ≈ 2.459. Should drop by ~1.6%, NOT by ~40%.
  - **Pre-fix bug** would have shown projected ~1.50 or lower (way too pessimistic).

DO NOT TAP APPROVE. Just observe the card.

3. Tap Deny (or wait 60s for the deny timer).

### Step B: Save_deposit flow — verifies HF rises, not falls

1. Type `Save 5 USDC` (or `Deposit 5 USDC into savings`).
2. Wait for the PermissionCard.

### Verifiable signals

- ✅ **`Health factor` row** shows `current → projected`, with **projected HIGHER than current** (more collateral = safer HF).
- ✅ `Pool APY` row shows a real number (e.g. `4.62%`).
- ✅ The `0.10% NAVI overlay` fee row shows the right fee.

Tap Deny.

### Step C: Repay_debt — verifies HF→∞ when fully repaying

If your existing borrow is small (< $50), try repaying it fully.

1. Type `Repay all my USDC debt`.
2. Observe the PermissionCard.

### Verifiable signals

- ✅ **`Health factor` row** shows `current → ∞` (infinity symbol) — repaying all debt = no debt = infinitely safe.
- ✅ `Borrow rate cleared` row shows the rate you were paying.

Tap Deny (unless you actually want to repay).

### Step D: Cold-reload preserves enrichment

Hot critical: if you got a PermissionCard up but DIDN'T tap approve/deny, reload the page. Verify the card AND its HF/APY rows still render correctly (not dark / blank). Then deny it.

### What would be regressions

- ❌ HF row not visible at all on save / borrow / repay / withdraw PermissionCards → metadata threading broken.
- ❌ HF row visible but shows ONLY current (no arrow, no projected) → `projectedHF` not threading.
- ❌ Borrow rate row says "Variable rate" disclaimer when you DO have an existing position in that asset → `borrowApyByAsset` map lookup broken.
- ❌ 🚨 **Projected HF drops FAR more than the math says it should** (e.g., borrowing $5 against $300 debt drops HF from 2.50 to 1.13 instead of ~2.46) → **LT FIX DIDN'T DEPLOY** — this is the exact pre-fix bug, and means audric/web-v2 is still on `09c9f31` (P5.6 pre-fix) instead of `b7057fb`. Hard-refresh / wait 2 min and retry.

---

## Wrap-up

After running all 6 P-items:

- All ✅ signals → respond with "Phase 5 smoke clean, proceed to Phase 6"
- Any ❌ regression → screenshot + console copy + paste back to me; we triage before Phase 6
- Any ambiguous signal you're not sure about → ask me

---

## Done? Cleanup

This file lives at `spec/active/shipping/SPEC_AI_SDK_HARDENING_PHASE_5_SMOKE.md`. Once you confirm clean, I'll:
1. Add an S.294 tracker entry with the smoke verdict.
2. Either archive this file (move to `spec/archive/v07e/`) or delete (it's a transient checklist, not a long-lived reference).
3. Start Phase 6 (error handling).
