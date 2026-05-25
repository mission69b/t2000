# SPEC_AI_SDK_HARDENING — v3.0.0 / v3.1.0 Prod Smoke Checklist

> **Status:** ACTIVE · drafted 2026-05-25 ~14:50 AEST · target: founder · est. 12-15 min
> **Builds smoked:**
> - t2000 `5d621e9d` — engine `@t2000/engine@3.1.0` (P4.1 + v3.1.0 cleanup) + Phase 7 P7.2/P7.3 engine tests
> - audric `77e3f1b` — `apps/web-v2` consuming engine 3.1.0 + Phase 7 P7.2/P7.3 bundle plumbing
> **Live URL:** [audric.ai](https://audric.ai)
> **Pre-req wallet state:**
> - Passport signed in with **non-trivial USDC balance** (>$20 in wallet AND >$5 already deposited in NAVI savings).
> - At least **one active small USDC borrow** on NAVI (used to exercise the HF math + repay path; if none, the borrow smoke item creates it).
> - Optional bonus coverage: holds some non-USDC asset (SUI, USDsui) for the chain-mode bundle smoke.

---

## Why this exists

Engine **v3.0.0** (P4.1 — `defineTool` → native AI SDK `tool()` migration; full legacy `Tool` interface + `READ_TOOLS`/`WRITE_TOOLS` arrays removed; `update_todo` deleted) and **v3.1.0** (dead `LLMProvider` pathway + `AISDKAnthropicProvider` deleted; CLI/MCP ESLint configs landed; `TurnMetrics.todoUpdateCount` Prisma column dropped via migration `20260525000000_p41_drop_todo_update_count`) shipped on 2026-05-25. Both releases changed engine-internal surfaces but the runtime tool call protocol stayed identical. The audric `apps/web-v2` deploy at `3ea7fd2` (consuming `3.1.0`) is the surface that exercises every tool — if anything broke in the migration, it surfaces here.

Phase 7 P7.2 (`inputCoinFromStep`) + P7.3 (`cetusRoute` fast-path) shipped same day in audric `77e3f1b` (S.314). The bundle smoke item below exercises both.

Each item names the **verifiable signal** — the specific thing you should see / click / read that proves it works. If the signal doesn't match, that's the regression and you stop + report.

---

## Setup (1 min)

1. Open `https://audric.ai` in a fresh tab.
2. Sign in with the test Google account whose Passport has the prereq position.
3. Open browser devtools → Console tab. Keep it open through the smoke run.
4. Open Network tab in devtools too — filter for `/api/chat` to confirm streaming + filter for `/api/transactions/*` to confirm prepare → sponsor → execute.
5. Open a **new chat** (don't resume an old one — fresh state is cleaner).

---

## V3-SMOKE-1 — Save flow: HITL round-trip + receipt (3 min)

Verifies the core write loop is intact after P4.1: tool call → `pending_action` event → user confirm tap → `/api/transactions/prepare` → user signs → `/api/transactions/execute` → narration with on-chain digest.

### Steps

1. Type `Save 2 USDC into NAVI`.
2. Wait for the **PermissionCard** to render (confirm-tier write).
3. Verify the card fields (see signals below) — do NOT approve yet.
4. Tap **Approve**.
5. Wait for the wallet popup → sign.
6. Wait for the assistant to narrate the receipt.

### Verifiable signals

- ✅ PermissionCard shows: `Save 2 USDC` + `Pool APY` row with a real number (~4-6%) + `Health factor` row showing `current → projected` with projected ≥ current (more collateral = safer).
- ✅ `0.10% NAVI overlay` fee row present.
- ✅ After approve, wallet popup shows a sponsored tx (no SUI gas charged from your wallet).
- ✅ After sign, narration includes the on-chain digest (`0x…` clickable) and the new savings balance.
- ✅ Console emits `[engine] pending_action attemptId=<uuid>` (or similar — exact log line may vary) on first dispatch, then `[resume]` lines on confirm callback.
- ✅ Network tab: exactly ONE `POST /api/chat` (initial dispatch) → ONE `POST /api/transactions/prepare` → ONE `POST /api/transactions/execute` → ONE `POST /api/chat` (resume turn for narration).

### What would be a regression

- ❌ PermissionCard never appears → write tool not yielding `pending_action`.
- ❌ Card shows tool input as raw JSON (no human-readable copy) → describe-action surface broke in P4.1.
- ❌ Console emits `update_todo` calls anywhere → P4.1 cleanup missed a prompt reference.
- ❌ Narration crashes / no digest shown → resume route or onAutoExecuted hook broke.
- ❌ Two PermissionCards appear (one per save call) → tool got called twice.

---

## V3-SMOKE-2 — Borrow flow: HF math + LT correctness (3 min)

Verifies the `currentHF` / `projectedHF` enrichment shipped in P5.6 still works after the P4.1 tool surface migration. Also re-exercises the S.293 LT back-derivation fix.

### Steps

1. Type `What's my current health factor?` (note the number — call it `HF_now`).
2. Type `Borrow 1 USDC against my savings`.
3. Wait for PermissionCard.

### Verifiable signals

- ✅ Card `Borrow rate` row shows a real APY (e.g. `4.67%`) — NOT italic "Variable rate" fallback (you have existing position so live rate should resolve).
- ✅ Card `Health factor` row shows `HF_now → projected` with projected slightly lower than HF_now (you're adding $1 of debt).
- 🚨 **HF math sanity check**: projected ≈ `HF_now × current_borrowed / (current_borrowed + 1)`. With $50 current debt, HF 2.0 → projected ≈ 1.961 (drops ~2%). NOT projected ~1.10 (that's the pre-S.293 LT bug).
- ✅ Tap **Deny** (or wait for auto-deny). Narration acknowledges deny gracefully without crashing.

### What would be a regression

- ❌ `Borrow rate` row says "Variable rate — locked at execute time" despite existing position → `borrowApyByAsset` map lookup broken.
- ❌ Projected HF drops by 30%+ on a $1 borrow → S.293 LT fix regressed.
- ❌ HF row not visible at all → P5.6 metadata threading broke in P4.1.
- ❌ Deny stalls / errors → resume turn not handling `permission_denied` correctly.

---

## V3-SMOKE-3 — Swap flow: quote → execute → receipt (3 min)

Verifies the `swap_quote` (read) + `swap_execute` (write) pair still composes correctly after P4.1. Also implicitly verifies Cetus aggregator integration.

### Steps

1. Type `Swap 1 USDC to SUI`.
2. Wait for PermissionCard (confirm-tier).

### Verifiable signals

- ✅ Card shows: `Swap 1 USDC → ~N SUI` (with the receive estimate visible).
- ✅ Card shows `0.10% Cetus overlay` fee.
- ✅ Slippage cap row visible (default 1% or similar).
- ✅ Tap **Approve** → sign → narration shows on-chain digest + final received amount.
- ✅ Final received amount is within slippage of the quote.

### What would be a regression

- ❌ Card shows raw `swap_execute` input as JSON → describe-action surface broke.
- ❌ Two PermissionCards (one for quote, one for execute) → engine confused tool permission levels (`swap_quote` should auto-execute, only `swap_execute` confirms).
- ❌ Received amount more than 1% below quote → slippage guard didn't engage.

---

## V3-SMOKE-4 — `update_todo` regression check (1 min)

P4.1 deleted the `update_todo` tool entirely + dropped its metrics column. Verify no system prompt still mentions it (would cause the model to hallucinate the call → 400 or silent drop).

### Steps

1. Type `Help me plan a savings strategy for the next month — what do you suggest?`.
2. Watch streaming output AND console + Network tabs.

### Verifiable signals

- ✅ Assistant responds with a plain text strategy. No tool calls to `update_todo` anywhere in the stream.
- ✅ Console contains no error lines like `Unknown tool: update_todo` or `400 Bad Request — invalid tool name`.
- ✅ Network tab: `/api/chat` response stream contains no `tool-call` chunks with `toolName: "update_todo"`.

### What would be a regression

- ❌ Stream contains a `tool-call` chunk for `update_todo` → some system prompt fragment or skill file still references the deleted tool.
- ❌ Server-side 500 with stack trace mentioning `todoUpdateCount` → telemetry writer still references the dropped Prisma column (should already be removed in f1).

---

## V3-SMOKE-5 — Chain-mode bundle (Phase 7 P7.2 + P7.3) ⭐ NEW (3 min)

Exercises the S.314 fix: a 2-op bundle where the second step's input asset is produced by the first step's output. Pre-P7.2 this reverted at PREPARE; post-P7.2 it succeeds.

### Steps

1. Type `Swap 2 USDC to USDsui and save it into NAVI in one go`.
2. Wait for the BatchPermissionCard (or sequential cards if BatchPermissionCard not wired — either is fine; the test is whether PREPARE succeeds).
3. Verify card content — do NOT approve yet.
4. Tap **Approve**.

### Verifiable signals

- ✅ Card shows 2 steps clearly labeled: `1. Swap 2 USDC → USDsui` then `2. Save USDsui into NAVI`.
- ✅ After approve, the prepare phase succeeds — **no "Insufficient USDsui balance" error before signing**. (Pre-P7.2 the SDK's wallet pre-fetch would've failed here because the USDsui doesn't exist yet at compose time.)
- ✅ ONE wallet sign popup for the bundled PTB (not two separate ones).
- ✅ Network tab `/api/transactions/prepare` request body contains `inputCoinFromStep: 0` on the save step (devtools → expand request payload).
- ✅ If you swapped in this same chat session earlier in the same turn (or `swap_quote` was called same-turn before `swap_execute`), the prepare request body shows `cetusRoute: {...}` populated on the swap step → fast-path active.
- ✅ Narration shows both digests + final USDsui balance reflected in savings.

### What would be a regression

- ❌ "Insufficient USDsui balance" error before sign → P7.2 wiring broken; `inputCoinFromStep` not flowing to SDK.
- ❌ Two separate sign popups → bundle didn't compose into one PTB.
- ❌ Prepare body missing `inputCoinFromStep` → engine populated it but marker layer dropped it again.
- ❌ Bundle PREPARE 500s with "step 0 has no producer" → adjacency/whitelist check misfired.

### Bypass / fallback note

If the LLM declines the bundle ("I'll do these one at a time for safety") that's also acceptable — the engine isn't forced to bundle. Try a more explicit phrasing: `Bundle these as one transaction: swap 2 USDC to USDsui, then save it`. If the engine still refuses to bundle, the chain-mode path is just not exercised in this smoke — not a regression. Note it and move on.

---

## V3-SMOKE-6 — Read tools sample (2 min)

Spot-check that the 18 read tools still resolve correctly after the `defineTool` → `tool()` migration (P4.1 changed every tool definition).

### Steps

1. Type `Show me my portfolio` (exercises `portfolio_analysis` + `balance_check` + `savings_info`).
2. Type `What's the current NAVI USDC rate?` (exercises `rates_info`).
3. Type `Show me my last 5 transactions` (exercises `transaction_history`).

### Verifiable signals

- ✅ Each query returns a coherent narration with real numbers (not "I don't have that data").
- ✅ Console shows no `tool execution failed` lines.
- ✅ Portfolio response includes both wallet holdings AND savings rows (proves the partial-zero degradation handling still works).

### What would be a regression

- ❌ Any tool returns `Error: tool definition invalid` → P4.1 migration left a broken definition.
- ❌ Portfolio shows all zeros despite known position → BlockVision integration regressed (independent of P4.1, but the smoke catches it).

---

## Wrap-up

After running all 6 V3-SMOKE items:

- All ✅ signals → respond with **"v3.0.0 + v3.1.0 + S.314 smoke clean"** in the session.
- Any ❌ regression → screenshot + console + Network panel paste back; triage before next phase.
- Any ambiguous signal → ask.

---

## Done? Cleanup

This file lives at `spec/active/shipping/SPEC_AI_SDK_HARDENING_V3_SMOKE.md`. Once you confirm clean, the next agent will:

1. Add an `S.NNN` tracker entry with the smoke verdict.
2. Move this file to `spec/archive/v07f/SPEC_AI_SDK_HARDENING_V3_SMOKE.md` (consistent with how Phase 5 smoke was archived — see `spec/archive/v07e/SPEC_AI_SDK_HARDENING_PHASE_5_SMOKE.md`).
3. If `SPEC_AI_SDK_HARDENING.md` Phase 7 P7.5 hasn't been picked up by then, promote the whole SPEC to `archive/v07f/` with P7.5 explicitly deferred (the trigger criteria are documented in the SPEC itself).

If any signal regressed, the file stays here until the regression is fixed + re-smoke passes.
