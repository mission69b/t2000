# SPEC 8 — Eval Corpus + Baseline-Capture Methodology

**Version:** 1.0 (P3.1 deliverable)
**Date:** 2026-05-01
**Owner:** Whoever is implementing SPEC 8 v0.5.1
**Parent spec:** `spec/SPEC_8_INTERACTIVE_HARNESS.md` § "Eval methodology"
**Status:** Locked corpus + capture-harness design. Baseline run scheduled BEFORE any P3.2 engine work begins.

---

## Why this document exists

P3.1 is the first work item in the SPEC 8 build. It produces two artifacts:

1. **A locked corpus** — 30 representative user prompts split into 4 shape tiers (LEAN / STANDARD / RICH / MAX). Locked means no edits during the build; if a prompt is wrong we add a footnote and ship anyway.
2. **A reproducible capture harness** — the script that takes a corpus + an environment (engine version, audric URL, test JWT) and produces a baseline directory at `loadtest/eval/spec8-baseline-<date>/`.

Without the baseline captured BEFORE engine changes land, we can't tell whether SPEC 8 regressed cost / latency / final-text terseness on existing flows. The acceptance gates in the parent spec (TTFVP p50 < 800ms, final-text p50 ≤ baseline + 20%, total cost p50 ≤ 1.10× baseline, etc.) are all defined relative to this baseline.

> **One-line success criterion for P3.1:** A second person, given only this document + repo access, can produce an identical baseline directory by running one command.

---

## Corpus — 30 prompts (LOCKED)

Each row carries: a stable ID, the prompt text, the expected harness shape, the rationale for that shape, and any v0.3/v0.4 special-case flags.

### LEAN (8 prompts) — single-fact reads

`classifyEffort()` should route every LEAN prompt to `effort: 'low'` → `harness_shape: 'lean'` (zero thinking blocks; no `update_todo`).

| ID | Prompt | Tools expected | Rationale |
|---|---|---|---|
| L1 | `balance` | `balance_check` | Canonical single-fact read. Highest-volume tier. |
| L2 | `what's my health factor` | `health_check` | Single-tool read, no calculation. |
| L3 | `USDC rate` | `rates_info` | Single-tool read. |
| L4 | `what's GOLD worth` | `token_prices` | Tests BlockVision price fetch + Tier-2 token. |
| L5 | `rate for USDsui` | `rates_info` | P1 USDsui surface — confirms LEAN routing for the second saveable. |
| L6 | `show my last 5 transactions` | `transaction_history` | Single-tool read with `limit: 5`. |
| L7 | `wallet address for funkii.sui` | `resolve_suins` | **v1.3.0 surface** — confirms the new `resolve_suins` tool stays LEAN. Lookup-only, no rendering. |
| L8 | `yield summary for last 30 days` | `yield_summary` | Single-tool read with date range. |

**Acceptance for LEAN baseline:** every L1–L8 row should show ≤1 thinking block and 0 `update_todo` events in baseline capture (confirming today's behavior matches the SPEC 8 LEAN tier — no regression intended).

### STANDARD (10 prompts) — single-write or 2-step asks

Should route to `effort: 'medium'` → `harness_shape: 'standard'` (≤3 thinking blocks, 8k thinking budget, no `update_todo` unless 3+ tools).

| ID | Prompt | Tools expected | Rationale | Flags |
|---|---|---|---|---|
| S1 | `save 5 USDC` | `balance_check` → `save_deposit` | Canonical write — yields `pending_action`. |  |
| S2 | `swap 0.5 SUI to USDC` | `swap_quote` → `swap_execute` | **v0.3 long-tool baseline** (Cetus aggregator p50 ~2.5s). Confirms today's static-spinner dead-air; SPEC 8 progress events should kill it. | LONG-TOOL |
| S3 | `send 0.1 USDC to funkii` | `balance_check` → `send_transfer` | Tests contact resolution (saved contact `funkii`). |  |
| S4 | `create payment link for 1 USDC` | `create_payment_link` | Single-tool write. |  |
| S5 | `withdraw 5 USDC from savings` | `savings_info` → `withdraw` | 2-step (read then write). |  |
| S6 | `borrow 5 USDC` | `health_check` → `borrow` | 2-step (HF check then write). |  |
| S7 | `repay $2 of my USDC debt` | `health_check` → `repay_debt` | 2-step. Tests P1.7 repay symmetry rule (USDC debt repaid with USDC). |  |
| S8 | `create invoice for $50 due in 7 days` | `create_invoice` | Single-tool write with date math. |  |
| S9 | `save 1 USDsui` | `balance_check` → `save_deposit` (asset: USDsui) | **P1 surface** — confirms USDsui flows route correctly. |  |
| S10 | `send 0.5 USDC to alex.sui` | `resolve_suins` → `send_transfer` | **v1.3.0 surface** — SuiNS recipient resolution into a write. | SUINS |

**Acceptance for STANDARD baseline:** today's flow yields `pending_action` correctly on every write; engine emits 1–2 thinking accordions concatenated into one string (the bug SPEC 8 fixes). No `update_todo` (tool doesn't exist yet).

### RICH (8 prompts) — recipe-triggering / multi-tool asks (write recommendations)

Should route to `effort: 'high'` → `harness_shape: 'rich'` (≤5 thinking blocks, 16k thinking budget, `update_todo` emitted).

| ID | Prompt | Tools expected | Rationale | Flags |
|---|---|---|---|---|
| R1 | `should I save my idle USDC` | `balance_check` ∥ `rates_info` → recommendation text | **Canonical write-recommendation** — diffs against `audric/audric_demos_v2/demos/01-save-50.html`. Primary `<eval_summary>` / HowIEvaluated test target post-SPEC-8. | WRITE-REC, V2-DEMO |
| R2 | `swap 0.5 SUI to USDsui and save it` | `swap_quote` → `swap_execute` → `save_deposit` | **R3 retest from real-world QA** (S.37). Today: 2 confirms. Post-SPEC-7: 1 Payment Stream. | LONG-TOOL |
| R3 | `what's the safest way to borrow $5` | `health_check` ∥ `rates_info` ∥ `balance_check` → recommendation | `safe_borrow` recipe trigger. Write-recommendation. | WRITE-REC |
| R4 | `deep dive on NAVI` | `protocol_deep_dive` | **v0.3 long-tool baseline** (DefiLlama fetch p50 ~3s). | LONG-TOOL |
| R5 | `what's the best stable to save right now` | `rates_info` ∥ `balance_check` → recommendation | Tests USDC vs USDsui APY comparison (per `savings-usdc-only.mdc`). Write-recommendation. | WRITE-REC |
| R6 | `explain my latest sent transaction` | `transaction_history` → `explain_tx` | 2-tool sequence. |  |
| R7 | `what should I do with my idle balances` | `portfolio_analysis` → recommendation | **v0.3 long-tool** (BlockVision p50 ~1.5s) + write-recommendation. | LONG-TOOL, WRITE-REC |
| R8 | `is my health factor safe to borrow another $10` | `health_check` ∥ `rates_info` → recommendation | Multi-tool read + write-recommendation. | WRITE-REC |

**Acceptance for RICH baseline:** today's flow shows the "long pause → all tools → one accordion → final text" pattern that SPEC 8 fixes. Long-tool rows (R2, R4, R7) should show ≥2s of dead-air spinner — that's the regression target the `tool_progress` event kills.

### MAX (4 prompts) — multi-write Payment Stream candidates

Should route to `effort: 'max'` → `harness_shape: 'max'` (≤8 thinking blocks, 32k thinking budget, `update_todo` with rich step labels).

> **Important sequencing note:** MAX prompts are **post-SPEC-7** ideal flows (one Payment Stream, one signature). At baseline-capture time (PRE-SPEC-7), they will yield N separate `pending_action`s requiring N confirms. The baseline captures **today's** N-confirm flow; SPEC 7's eval pass (P2.6) re-baselines these prompts after multi-write bundling lands. That's intentional — SPEC 8 doesn't change MAX-tier mechanics; only its visual surface.

| ID | Prompt | Tools expected (today / post-SPEC-7) | Rationale | Flags |
|---|---|---|---|---|
| M1 | `swap 10% to SUI, save 50% of remaining USDC, send $1 to funkii` | 4 tool_use blocks → 3 `pending_action`s today / 1 Payment Stream post-SPEC-7 | **Headline SPEC 7 use case.** | LONG-TOOL, MULTI-WRITE |
| M2 | `rebalance my portfolio to 70% stables` | `portfolio_rebalance` recipe → 2-3 swaps | `portfolio_rebalance` recipe trigger. | LONG-TOOL, MULTI-WRITE |
| M3 | `withdraw all and send to my wallet` | `emergency_withdraw` recipe → withdraw + send | `emergency_withdraw` recipe trigger. | MULTI-WRITE |
| M4 | `pay off my $5 USDsui debt and re-borrow $5 in USDC` | `repay_debt(USDsui)` → `borrow(USDC)` | **Refinance use case** (SPEC 7 Use Case 3). Tests P1.7 repay symmetry. | MULTI-WRITE |

**Acceptance for MAX baseline:** today shows N confirms over N seconds. Captured for the SPEC 7 P2.6 re-baseline.

---

## PTB CHAINING (SPEC 13 acceptance) — 11 prompts

Phase-tagged corpus rows for SPEC 13's chained-coin handoff foundation. Engine ship history: `1.12.0` (Phase 0 — cap 2 + whitelist), `1.13.0` (Phase 1 — `inputCoinFromStep` primitive), `1.14.0` (Phase 2 — cap=3 strict-adjacency), `1.15.0` (**Phase 3a — cap=4 DAG-aware**). Captured against the live test address; outcome assertion runs on `engine.turn_outcome` + `audric.engine.{chat,resume}_stream_close` + `engine.bundle_chain_mode_set` (1.13.1+) + `audric.bundle.fast_path_dispatched` (1.14.0+) instrumentation, not on visual diff.

| ID | Prompt | Phase | Expected | Acceptance |
|---|---|---|---|---|
| P0-1 | `swap 0.5 USDC to USDsui and save it` | 1 | 2-op atomic bundle (`swap_execute → save_deposit` — whitelisted, asset-aligned). One PermissionCard, one signature, one PTB. Chain-mode fires once. | `engine.turn_outcome` = `pending_action_bundle` (n=2). `engine.bundle_chain_mode_set` fires once with `{producer: swap_execute, consumer: save_deposit}`. Resume yields ONE `tx_executed`. |
| P0-2 | `withdraw 0.5 USDsui from savings and convert it to USDC` | 1 | 2-op atomic bundle (`withdraw → swap_execute` — whitelisted, asset-aligned). One PermissionCard, one signature, one PTB. | `engine.turn_outcome` = `pending_action_bundle` (n=2). `engine.bundle_chain_mode_set` fires once. Resume yields ONE `tx_executed`. |
| P0-3 | `swap 10% of my USDC to SUI, save 50% of remaining USDC, then send $1 to mom.audric.sui` | **3a** | **3-op atomic bundle (Phase 3a unlock).** Pre-3a this rejected with `pair_not_whitelisted` because `save_deposit → send_transfer` isn't whitelisted. Phase 3a permits the bundle: step 1 (swap) and step 0 → step 1 chain via `swap_execute → save_deposit` if assets align (USDC swap output funds USDC save? no — swap output is SUI). Actually step 0→1 doesn't chain (output SUI ≠ input USDC); both saves run wallet-mode. Step 2 runs wallet-mode for the send. Composes as 3-op bundle with zero `inputCoinFromStep` populated. | `engine.turn_outcome` = `pending_action_bundle` (n=3). `engine.bundle_chain_mode_set` fires zero or once depending on swap.to. Resume yields ONE `tx_executed`. |
| P0-4 | `repay my USDsui debt then swap 5 USDC to SUI` | **3a** | **2-op atomic bundle (Phase 3a unlock).** Pre-3a `repay_debt → swap_execute` rejected with `pair_not_whitelisted`. Phase 3a permits: both legs run wallet-mode independently. One PermissionCard, one signature, one PTB. | `engine.turn_outcome` = `pending_action_bundle` (n=2). `engine.bundle_chain_mode_set` fires zero (wallet-mode both legs). Resume yields ONE `tx_executed`. |
| P0-5 | `swap 10% to SUI, swap 50% to USDsui, save the USDsui, then send 0.1 USDC to funkii.sui` | **3a** | **4-op atomic bundle (Phase 3a unlock).** Pre-3a 4 writes exceeded cap=3 → cap-split. Phase 3a cap=4 admits; pair 1→2 (swap→swap) runs wallet-mode (not whitelisted), pair 2→3 (swap→save) chains, pair 3→4 (save→send) runs wallet-mode. One PermissionCard, one PTB. | `engine.turn_outcome` = `pending_action_bundle` (n=4). `engine.bundle_chain_mode_set` fires once `{producer: swap_execute, consumer: save_deposit}`. `audric.bundle.fast_path_dispatched` fires with `step_count=4`. Resume yields ONE `tx_executed`. |
| P0-6 | `withdraw 5 USDC, swap it to SUI, then send 1 SUI to alex.audric.sui` | 2 | **3-op atomic bundle.** Both adjacent pairs whitelisted: `withdraw → swap_execute` ✓, `swap_execute → send_transfer` ✓. Asset-aligned end-to-end (USDC withdrawn, swapped to SUI, sent as SUI). One PermissionCard with 3 step rows, one signature, one PTB. Chain-mode fires twice. | `engine.turn_outcome` = `pending_action_bundle` (n=3). `engine.bundle_chain_mode_set` fires twice: `{producer: withdraw, consumer: swap_execute}` then `{producer: swap_execute, consumer: send_transfer}`. Resume yields ONE `tx_executed`. |
| P0-7 | `withdraw 5 USDC and convert to USDsui then save it` | 2 | **3-op atomic bundle.** Both adjacent pairs whitelisted: `withdraw → swap_execute` ✓, `swap_execute → save_deposit` ✓. Asset-aligned end-to-end. One PermissionCard with 3 step rows, one signature, one PTB. Chain-mode fires twice. | `engine.turn_outcome` = `pending_action_bundle` (n=3). `engine.bundle_chain_mode_set` fires twice. Resume yields ONE `tx_executed`. |
| **P0-8** | `swap 10% to SUI, swap 900 USDC to USDsui, save the USDsui, send 100 USDC to mom.audric.sui` | **3a** | **4-op DAG bundle (Demo 1 — headline Phase 3a unlock).** One mid-bundle chain (`swap_execute → save_deposit` at steps 1→2 — whitelisted + USDsui-aligned); steps 0 (independent SUI swap) + 3 (independent USDC send) run wallet-mode. One PermissionCard with 4 step rows, one signature, one PTB. | `engine.turn_outcome` = `pending_action_bundle` (n=4). `engine.bundle_chain_mode_set` fires once `{producer: swap_execute, consumer: save_deposit}`. `audric.bundle.fast_path_dispatched` fires with `step_count=4`. Resume yields ONE `tx_executed`. |
| **P0-9** | `withdraw 5 USDC, swap to SUI, send 1 SUI to alex, send 1 USDC to bob` | **3a** | **4-op partial-chain bundle.** Steps 0→1 chain (`withdraw → swap_execute` — USDC-aligned), steps 1→2 chain (`swap_execute → send_transfer` — SUI-aligned), step 3 runs wallet-mode (independent USDC send). One PermissionCard with 4 step rows, one signature, one PTB. | `engine.turn_outcome` = `pending_action_bundle` (n=4). `engine.bundle_chain_mode_set` fires twice (steps 0→1 and 1→2). Resume yields ONE `tx_executed`. |
| **P0-10** | `send 5 USDC to alice.audric.sui and send 3 USDC to bob.audric.sui` | **3a** | **2-op zero-chain bundle.** Both legs run wallet-mode independently. Permitted under Phase 3a — atomicity + one-tap UX is the value, not chain semantics. | `engine.turn_outcome` = `pending_action_bundle` (n=2). `engine.bundle_chain_mode_set` fires zero. `audric.bundle.fast_path_dispatched` fires with `step_count=2`. Resume yields ONE `tx_executed` with two `BalanceChange` rows. |
| **P0-11** | `withdraw 1 USDC, swap to SUI, send 0.1 SUI, swap 1 USDC to USDsui, save it` | **3a** | **5-op cap rejection.** Cap=4 refuses; engine emits `_gate: 'max_bundle_ops'` per write. LLM splits sequentially. | `engine.turn_outcome` includes `max_bundle_ops_continue`. Five `tool_result` errors with `_gate: 'max_bundle_ops'`. Final outcome = sequential `pending_action_single` events. |

**Acceptance for SPEC 13 corpus:** Phase 3a (1.15.0) — all 11 prompts complete without `STREAM_CLOSED_SILENTLY` / `INTERRUPTED_TURN_DETECTED`. P0-3 / P0-4 / P0-5 / P0-8 / P0-9 / P0-10 specifically assert a single `txDigest` covers all bundle legs. P0-11 asserts cap=4 rejection. Phase 3b (deferred) — re-run with `swap_execute → swap_execute` whitelisted; expect P0-5's pair 1→2 to chain instead of falling back to wallet-mode.

**Capture cadence:** Re-baseline on every SPEC 13 phase ship (engine minor version bump). Keep all prior phase captures alongside for regression diffing.

---

## Flag taxonomy

| Flag | Meaning | Used by |
|---|---|---|
| `LONG-TOOL` | Tool with internal latency >1.5s (Cetus swap_execute, protocol_deep_dive, portfolio_analysis). v0.3 progress-bar test target. | S2, R2, R4, R7, M1, M2 |
| `WRITE-REC` | Turn that produces a write recommendation (LLM emits `<eval_summary>` marker per v0.4). HowIEvaluatedBlock test target. | R1, R3, R5, R7, R8 |
| `V2-DEMO` | Has a corresponding mock in `audric/audric_demos_v2/demos/` for visual diffing. | R1 (`01-save-50.html`) |
| `MULTI-WRITE` | Multiple write tools in same turn. SPEC 7 Payment Stream test target; SPEC 8 baseline only. | M1, M2, M3, M4, P0-1 → P0-11 |
| `SUINS` | Recipient or address argument is a `.sui` name. Tests v1.3.0 normalize+resolve flow. | S10, L7, P0-3, P0-5, P0-6, P0-8, P0-9, P0-10 |
| `PTB-CHAIN` | SPEC 13 chained-coin handoff acceptance. Cap+whitelist + chained `inputCoinFromStep` end-to-end. P0-6 / P0-7 lock the Phase 2 3-op acceptance; P0-3 / P0-4 / P0-5 / P0-8 / P0-9 / P0-10 / P0-11 lock the Phase 3a DAG-aware semantics. Re-baselined on every SPEC 13 phase ship. | P0-1 → P0-11 |

---

## Capture harness

### Storage layout

```
loadtest/eval/spec8-baseline-2026-MM-DD/
├── manifest.json                       # corpus version, engine version, audric URL, test address, timestamps
├── L1-balance/
│   ├── desktop.png                     # 1440×900 final visual
│   ├── mobile.png                      # 390×844 (iPhone 13) final visual
│   ├── sse-events.ndjson               # full SSE event log, one JSON per line
│   ├── turn-metrics.json               # the TurnMetrics row Postgres wrote
│   └── meta.json                       # wall-clock start/end, audric session id, turn id
├── L2-health-factor/
│   └── ...
├── ...
└── M4-refinance/
    └── ...
```

`manifest.json` shape:

```json
{
  "corpusVersion": "spec/SPEC_8_CORPUS.md@1.0",
  "capturedAt": "2026-05-15T03:00:00.000Z",
  "engineVersion": "1.3.0",
  "audricBaseUrl": "https://staging.audric.ai",
  "testAddress": "0x40cd...3e62",
  "testHandle": "spec8-baseline.audric.sui",
  "anthropicModel": "claude-sonnet-4-5",
  "rowsCaptured": 30,
  "rowsFailed": 0
}
```

### Pseudocode — `scripts/eval/capture-spec8-baseline.ts`

```typescript
// Inputs (env vars):
//   AUDRIC_BASE_URL    = "https://staging.audric.ai"
//   TEST_JWT           = "<dedicated-baseline-account-zklogin-jwt>"
//   TEST_ADDRESS       = "0x40cd...3e62"
//   ANTHROPIC_API_KEY  = (server-side, used by audric)
//   OUTPUT_DIR         = "loadtest/eval/spec8-baseline-2026-MM-DD/"
//
// Flow:
//   1. For each row in CORPUS:
//      a. Open new audric chat session (POST /api/engine/session)
//      b. Capture wall-clock start
//      c. Stream POST /api/engine/chat with {message: row.prompt, address}
//         - Buffer every SSE event into sse-events.ndjson
//         - When pending_action arrives: APPROVE programmatically (signs via the test
//           account's stored zkLogin material — pre-loaded into the test session)
//           Wait for /api/engine/resume completion before next row.
//      d. After turn_complete:
//         - Render final state with Playwright
//         - Screenshot at 1440x900 → desktop.png
//         - Screenshot at 390x844 → mobile.png
//         - Pull turnMetrics row from Postgres via /api/internal/turn-metrics?sessionId
//         - Write meta.json with timing
//      e. Wait 5s between rows (rate-limit hygiene)
//   2. Write manifest.json
//   3. Exit 0 if all 30 succeed; exit 1 + dump failed-rows.json otherwise.
```

**Estimated run time:** ~12 minutes (30 rows × ~24s each median, plus 5s sleeps).

**Cost estimate:** ~$2 in Anthropic spend (mostly RICH/MAX rows; LEAN are pennies).

### Reproducibility constraints (CRITICAL — break any one and the baseline isn't reusable)

1. **Dedicated baseline account.** Sign up a new Audric account (`spec8-baseline+<date>@audric.test`); claim handle `spec8-baseline.audric.sui` via SPEC 10 picker (or skip if pre-SPEC-10). Pre-fund with $50 USDC + $0.50 SUI for gas-eligible writes.
2. **Saved contacts.** Add `funkii` (resolves to `funkii.audric.sui` post-SPEC-10, or to a known 0x today) so S3, R6, M1 work.
3. **Engine version pinned.** `manifest.json` records the exact engine version. If you re-run on a different engine version, write to a new dated directory — never overwrite.
4. **Anthropic model pinned.** `claude-sonnet-4-5` for all rows. If model upgrade lands, treat as a new baseline run.
5. **Same hour-of-day.** APYs and prices drift; capturing all 30 rows in the same ~15-min window minimizes drift.
6. **No browser caches.** Each capture session opens a fresh Playwright context (no localStorage carry-over between rows).

---

## Acceptance criteria for P3.1

P3.1 is **done** when:

- [x] **Corpus locked** — this document exists, 30 prompts in 4 tiers, every row has rationale + flags. ✅ (this document)
- [ ] **Capture harness implemented** — `scripts/eval/capture-spec8-baseline.ts` exists and runs end-to-end against staging.
- [ ] **First baseline captured** — `loadtest/eval/spec8-baseline-2026-MM-DD/` directory committed with all 30 rows. (Date = whenever the harness first runs cleanly; expected ~2026-05-08 to give a week before P3.2 starts.)
- [ ] **Manual sanity review** — eyeball the 30 desktop screenshots; confirm each row produced a sensible-looking final state. If R7 (`portfolio_analysis`) shows `walletValueUsd: null`, the BlockVision key isn't reaching the engine — investigate before proceeding.
- [ ] **Manifest committed** — `manifest.json` shows engine `1.3.0`, audric staging URL, 30/30 rows captured, 0 failed.

If the first capture fails on a row, log it in a `P3.1-baseline-issues.md` and fix before re-running. Don't accept a partial baseline — the comparison gates need all 30 rows.

---

## What happens after P3.1

1. **P3.2 engine work begins** against the baseline.
2. After each major engine PR, re-run the capture harness against the dev branch → `loadtest/eval/spec8-dev-<date>/`.
3. Diff `dev/<row>/turn-metrics.json` vs `baseline/<row>/turn-metrics.json` for cost/tokens/latency regression.
4. Diff `dev/<row>/desktop.png` vs `baseline/<row>/desktop.png` (Pixelmatch or `playwright snapshot` workflow) for visual regression.
5. The hard-fail gates in the parent spec (`SPEC 8 § "Acceptance gates"`) trigger off these diffs.

The baseline directory is THE permanent reference until SPEC 8 ships (P3.7 flag flips to 100%) and we declare it the new normal. After that, baselines for SPEC 9 / SPEC 10 / SPEC 11 are captured fresh against a SPEC-8-on engine.

---

## Cross-references

- Parent spec — `spec/SPEC_8_INTERACTIVE_HARNESS.md` § "Eval methodology" + § "Acceptance gates"
- `audric/audric_demos_v2/demos/01-save-50.html` — visual baseline for R1
- Existing loadtest infrastructure — `loadtest/README.md` (k6 — different tool, different concern; we don't reuse it, but `.env.loadtest` patterns + `TEST_JWT` / `TEST_ADDRESS` env conventions match)
- Eval directory location — `.gitignore` already covers `loadtest/reports/`; the new `loadtest/eval/` directory should be **committed** (small files, durable reference) — confirm `.gitignore` doesn't sweep it.
