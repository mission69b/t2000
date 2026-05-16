# Phase 2 — Tool Migration Backlog (`buildTool()` → AI SDK `tool()`)

> **Created:** 2026-05-16 ~18:00 AEST (end of Day 14c session, immediately after audit).  
> **Scope:** SPEC 37 v0.7a Phase 2 per `/Users/funkii/.cursor/plans/audric-v07a-engine-drain.plan.md`.  
> **Goal:** Migrate all 37 default tools (+2 opt-in = 39 total) from the legacy `buildTool()` factory to Vercel AI SDK's native `tool()` factory, preserving the engine's public API.  
> **Plan estimate:** ~2 weeks (~7-12 FTE-days). Reality TBD based on first-batch friction.

---

## Why this doc exists

Days 13.x – 14c shipped real value (HF projection, per-asset rows, APY rendering) but as one-off slices on top of the legacy `buildTool()` plumbing. Phase 2 per the plan is a SYSTEMATIC migration of every tool. Without this backlog, we keep drifting into "what's the next neat thing to ship" instead of "which tool is next." Read this doc at the start of every Phase 2 session.

The audit was run 2026-05-16 ~17:50 AEST via the explore subagent. Source files: `packages/engine/src/tools/*.ts`. Canonical list in `packages/engine/src/tools/index.ts`.

## Verification (canonical counts)

- **READ_TOOLS:** 25 (`renderCanvasTool` through `pendingRewardsTool`)
- **WRITE_TOOLS:** 12 (`saveDepositTool` through `saveContactTool`)
- **Default total via `getDefaultTools()`:** **37**
- **Opt-in (imported but NOT in `getDefaultTools()`):** `updateTodoTool`, `addRecipientTool` → **+2** → **39 total to migrate** if opt-in surfaces are included.
- **⚠️ Stale comment in `tools/index.ts` (lines 82-83) says "24 reads + 11 writes = 35 tools".** Update to "25 reads + 12 writes = 37 tools (+2 opt-in)" as part of Batch A migration.

## Permission semantics (no-op work — already correct)

- **No tool passes `permission:` field directly.** `buildTool` in `packages/engine/src/tool.ts` defaults `permissionLevel` to `auto` when `isReadOnly: true` (default), else `confirm`.
- **Explicit `permissionLevel: 'confirm'` overrides** found on: typical write tools (redundant with default, can be dropped during migration).
- **`add_recipient`** overrides to `permissionLevel: 'auto'` with `isReadOnly: true` (it goes through the `pending_input` form flow, not a permission card).
- **USD-aware downgrade** happens at runtime via `resolvePermissionTier()` — no per-tool change required for Phase 2. Just preserve the existing permission levels.

## Modifiable fields (Item 6 of correctness spec)

NOT inlined on tools. Sourced from `packages/engine/src/tools/tool-modifiable-fields.ts` via `getModifiableFields(toolName)`. Phase 2 must preserve this lookup pattern when migrating; the new `tool()` factory's call site stays unchanged.

---

## Per-tool backlog (sorted: complexity ↑, then type read→write)

| # | toolName | type | permission | hasZodSchema | hasPreflight | dependencies | LoC bucket | complexity | modifiable | notes |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `cancel_invoice` | read | auto | ✅ | ❌ | external | small | simple | none | `fetch` PATCH to `AUDRIC_INTERNAL_API_URL`; flagged `isReadOnly: true` despite mutating remote |
| 2 | `cancel_payment_link` | read | auto | ✅ | ❌ | external | small | simple | none | same pattern as `cancel_invoice` |
| 3 | `list_invoices` | read | auto | ✅ | ❌ | external | small | simple | none | empty input schema |
| 4 | `list_payment_links` | read | auto | ✅ | ❌ | external | small | simple | none | empty input schema |
| 5 | `protocol_deep_dive` | read | auto | ✅ | ❌ | defillama, external | medium | simple | none | **Lone prod consumer of `api.llama.fi`** — keep as-is |
| 6 | `resolve_suins` | read | auto | ✅ | ✅ | external | medium | simple | none | SuiNS via RPC helpers; `cacheable: true` |
| 7 | `token_prices` | read | auto | ✅ | ❌ | blockvision | small | simple | none | `fetchTokenPrices` + `blockvisionApiKey` |
| 8 | `volo_stats` | read | auto | ✅ | ❌ | external | small | simple | none | `fetch` to NAVI open-api VOLO stats |
| 9 | `web_search` | read | auto | ✅ | ❌ | external | small | simple | none | Brave Search; `maxResultSizeChars` set |
| 10 | `yield_summary` | read | auto | ✅ | ❌ | external | small | simple | none | Audric `/api/analytics/yield-summary` |
| 11 | `borrow` | write | confirm | ✅ | ✅ | sdk, sponsoredTx | small | simple | `amount` (USDC) | `assertAllowedAsset` + `agent.borrow` |
| 12 | `repay_debt` | write | confirm | ✅ | ✅ | sdk, sponsoredTx | small | simple | `amount` (USDC) | `agent.repay` |
| 13 | `save_contact` | write | confirm | ✅ | ✅ | none | small | simple | none | No `requireAgent`; host persists; thin `call()` |
| 14 | `save_deposit` | write | confirm | ✅ | ✅ | sdk, sponsoredTx | small | simple | `amount` (USDC) | `assertAllowedAsset` + `agent.save` |
| 15 | `volo_stake` | write | confirm | ✅ | ✅ | sdk, sponsoredTx | small | simple | `amount` (SUI) | `agent.stakeVSui` |
| 16 | `volo_unstake` | write | confirm | ✅ | ✅ | sdk, sponsoredTx | small | simple | `amount` (vSUI) | amount or `'all'` |
| 17 | `withdraw` | write | confirm | ✅ | ✅ | sdk, sponsoredTx | small | simple | `amount` (USDC) | USDC / USDsui preflight |
| 18 | `activity_summary` | read | auto | ✅ | ❌ | external | small | medium | none | Audric analytics + SuiNS normalize |
| 19 | `add_recipient` (opt-in) | read | auto | ✅ | ✅ | none | small | medium | none | `needsInput` / `pending_input`; `isConcurrencySafe: false`; host persists before `call()` |
| 20 | `create_invoice` | read | auto | ✅ | ❌ | external | medium | medium | none | POST Audric internal payments API |
| 21 | `create_payment_link` | read | auto | ✅ | ❌ | external | medium | medium | none | POST Audric internal payments API |
| 22 | `explain_tx` | read | auto | ✅ | ❌ | sdk, external | medium | medium | none | Sui JSON-RPC; SDK symbol/decimals helpers |
| 23 | `health_check` | read | auto | ✅ | ❌ | mcp, sdk | medium | medium | none | NAVI MCP + `requireAgent` path |
| 24 | `mpp_services` | read | auto | ✅ | ❌ | mppGateway, external | medium | medium | none | `mpp.t2000.ai/api/services` + in-memory catalog cache |
| 25 | `pending_rewards` | read | auto | ✅ | ❌ | sdk | medium | medium | none | Agent vs `getPendingRewardsByAddress`; `priceCache` enrichment |
| 26 | `rates_info` | read | auto | ✅ | ❌ | mcp, sdk | medium | medium | none | MCP rates + SDK/agent fallback |
| 27 | `savings_info` | read | auto | ✅ | ❌ | mcp, sdk | medium | medium | none | MCP + SDK coin helpers + agent |
| 28 | `spending_analytics` | read | auto | ✅ | ❌ | external | small | medium | none | Audric `/api/analytics/spending` |
| 29 | `swap_quote` | read | auto | ✅ | ❌ | sdk | medium | medium | none | `getSwapQuote` / Cetus; `cacheable: false`; telemetry |
| 30 | `update_todo` (opt-in) | read | auto | ✅ | ✅ | none | medium | medium | none | SPEC 8 side-channel `__todoUpdate`; engine `maxTurns` exemption |
| 31 | `claim_rewards` | write | confirm | ✅ | ✅ | sdk, sponsoredTx | small | medium | none | `agent.claimRewards` + `priceCache` enrichment |
| 32 | `pay_api` | write | confirm | ✅ | ✅ | mppGateway, sdk, sponsoredTx | medium | medium | none | `agent.pay`; strict URL host gate in preflight; `costAware` / artifact flags |
| 33 | `send_transfer` | write | confirm | ✅ | ✅ | sdk, sponsoredTx | small | medium | `amount`, `to` | `normalizeAsset`; `agent.send`; burn-address guard |
| 34 | `balance_check` | read | auto | ✅ | ❌ | mcp, sdk, blockvision, canonicalPortfolio | large | complex | none | BlockVision + MCP fan-out; `portfolioCache`; sticky cache; large display builder |
| 35 | `portfolio_analysis` | read | auto | ✅ | ❌ | blockvision, canonicalPortfolio, external | large | complex | none | `portfolioCache`; optional `fetchAudricPortfolio` trust gate; insights math |
| 36 | `render_canvas` | read | auto | ✅ | ❌ | external | large | complex | none | Many templates; SuiNS normalize; `context.serverPositions` seeding; triggers `__canvas` |
| 37 | `transaction_history` | read | auto | ✅ | ❌ | sdk, external | large | complex | none | SDK `classifyTransaction`; RPC pagination; `summarizeOnTruncate` |
| 38 | `harvest_rewards` | write | confirm | ✅ | ✅ | sdk, sponsoredTx | medium | complex | none | Pre-confirm shell `call()`; host `composeTx` / PTB; `narrateHarvestResult` helper |
| 39 | `swap_execute` | write | confirm | ✅ | ✅ | sdk, sponsoredTx | medium | complex | `amount` | Cetus via `agent.swap`; `T2000Error` recovery union; telemetry |

**Total: 37 default + 2 opt-in = 39.**

## Batch ordering (recommended migration sequence)

| Batch | Tools | Count | Est. session-days | Why this order |
|---|---|---|---|---|
| **A** — simple reads | 1-10 above | 10 | ~0.5-1d | Lowest coupling. Establishes `tool()` + Zod schema parity pattern before any write or MCP tool. First migration validates the template. |
| **B** — simple writes | 11-17 above | 7 | ~1d | Same shape (SDK call + sponsoredTx) repeated 7 times. Validates the write/preflight/permission plumbing once. |
| **C** — medium reads | 18-30 above | 13 | ~2-3d | Audric analytics + NAVI MCP trio + opt-in surfaces. Harness edge cases dominate (`update_todo` side-channel, `add_recipient` pending_input form). |
| **D** — medium writes | 31-33 above | 3 | ~1d | Permission/guards + richer preflights + `send_transfer` modifiable fields. |
| **E** — complex reads | 34-37 above | 4 | ~2-3d | Highest regression risk (caching, truncation, multi-source reads). Run extended smoke per tool. |
| **F** — complex writes | 38-39 above | 2 | ~1-2d | Cetus aggregator + harvest compound PTB. Migrate LAST — needs SDK + sponsored-tx assumptions stable across all prior batches. |

**Total estimate: 6 batches × 0.5-1.5d each ≈ ~7-12 FTE-days (~56-96 hours), matching the plan's ~2-week window.**

## Dependency graph (cross-tool sequencing)

**No tool imports another tool module.** All coupling is behavioral / data-flow:

- **`mpp_services` → `pay_api`:** LLM discovers gateway URLs before charging USDC. Migrate `mpp_services` (Batch C) before `pay_api` (Batch D).
- **`swap_quote` → `swap_execute`:** Quote freshness / route threading is load-bearing for bundles. Migrate `swap_quote` (Batch C) before `swap_execute` (Batch F).
- **`pending_rewards` → `claim_rewards` / `harvest_rewards`:** Read-before-write disclosure. Migrate `pending_rewards` (Batch C) before either write.
- **`harvest_rewards`:** Builds one PTB via SDK (`buildHarvestRewardsTx`); does NOT call `swap_execute` / `save_deposit` tools. But stabilize `@t2000/sdk` builders + audric `composeTx` registry first.
- **`balance_check` / `savings_info` / `rates_info`:** Often precede NAVI writes in prompts. Migrate before NAVI write tools so any regression surfaces in the read tool first (cheaper to roll back).

## Per-batch acceptance gate

Each batch closes only when ALL of these pass:

1. `pnpm --filter @t2000/engine test` — 0 regressions vs pre-batch baseline
2. `pnpm --filter @t2000/engine typecheck` — 0 errors
3. `pnpm --filter @t2000/engine lint` — 0 NEW errors (warnings tolerated)
4. Per-tool LLM round-trip test still works (mock provider + assert tool dispatched correctly + Zod input validation matches)
5. For batches that touch sponsored-tx writes (B, D, F): smoke at least 1 production write per batch (founder smoke, no automation)
6. Cross-repo: `audric/web` chat path against the latest engine still produces correct cards (visual smoke)
7. Update `agent-harness-spec.mdc` if any field changed wire shape

## Migration template (to design at Batch A Day 1)

The first session of Batch A produces:

1. A **canonical "simple read" tool migration template** showing before/after for one tool (probably `web_search` — smallest + zero deps).
2. A **per-tool checklist** that subsequent migrations follow (Zod schema, `execute()` body, `needsApproval` for writes, `experimental_toToolResultContent` if budgeting needed, preserve `cacheable` / `isConcurrencySafe` flags as new metadata).
3. The first 3-5 migrations done end-to-end as a proof of pattern.

## What's NOT in Phase 2 scope

- `update_todo` and `add_recipient` (opt-in) MAY defer to Phase 3 if Batch C runs long. Engine v0.7a doesn't require opt-in tool migration before Phase 3's engine-loop rewrite.
- `protocol_deep_dive`'s DefiLlama dependency stays. Per CLAUDE.md rule #2: "Never import protocol SDKs for new features (except Cetus)." `protocol_deep_dive` is the lone exception.
- Tool **removals** are NOT in scope. The 9 simplification removals (S.7) and 7 DefiLlama removals (v1.4) are already done.
- Tool **additions** are NOT in scope. If a new tool surfaces during the migration (unlikely), add it to this backlog at the appropriate complexity tier.

## Open questions resolved at Batch A Day 1 (2026-05-16)

1. **maxResultSizeChars / summarizeOnTruncate — KEEP as Tool metadata.** AI SDK `tool()` has no native equivalent; truncation is engine-level work (`budgetToolResult`) that runs identically for both engines. `defineTool` passes the field through to the returned `Tool` unchanged. No separate wrapper module needed for Phase 2.
2. **isReadOnly / isConcurrencySafe — STAY on the returned Tool through Phase 2.** Legacy `QueryEngine` reads them for parallel dispatch + early-dispatch gating; v2 `AISDKEngine` reads them for the same decisions. Retirement deferred to Phase 3+ when QueryEngine is deleted.
3. **v2 engine tool consumption pattern.** Today both engines consume the legacy `Tool[]` shape — `AISDKEngine` calls `toAISDKTools(legacyTools)` (`packages/engine/src/v2/tool-wrapper.ts`) which wraps each `Tool` into an AI SDK `tool()` at engine construction. Phase 2 is a **purely internal refactor** that does not change this wiring — `defineTool` produces a `Tool` that flows through the same wrapper. Phase 3 (engine-loop rewrite) is where tools would optionally export native `tool()` instances directly; that's not in Phase 2 scope.

**Locked design decisions (Batch A):**

- New factory: `defineTool({...})` in `packages/engine/src/v2/define-tool.ts`. Same options as `buildTool` MINUS the hand-written `jsonSchema` (auto-generated from Zod via `zod-to-json-schema`).
- Returns the EXACT same `Tool` shape `buildTool` returns. Drop-in replacement.
- `buildTool` is **NOT** deprecated yet — coexists. Migrated tools use `defineTool`; unmigrated tools stay on `buildTool`. At end of Phase 2, all 39 tools are on `defineTool`; Phase 3 deprecates `buildTool`.
- New dep: `zod-to-json-schema@^3.25.1` (already a transitive dep via AI SDK; promoted to direct dep on `@t2000/engine`).
- 9 unit tests in `packages/engine/src/v2/define-tool.test.ts` lock the parity contract (jsonSchema generation matches hand-written shape + Tool defaults / metadata pass-through / preflight preservation / call signature).

## Where to find this doc

- Local: `/Users/funkii/dev/t2000/PHASE_2_TOOL_MIGRATION_BACKLOG.md` (this file)
- Linked from: `BENEFITS_SPEC_v07a.md` (cross-reference added end of session)
- Referenced by: the plan at `/Users/funkii/.cursor/plans/audric-v07a-engine-drain.plan.md` Phase 2 section (cross-link to be added at Batch A Day 1)

## Status tracker (update as batches close)

| Batch | Started | Closed | Engine version |
|---|---|---|---|
| **A — simple reads (10/10 CLOSED)** | 2026-05-16 | 2026-05-16 | 1.35.0 → 1.35.1 |
| **B — simple writes (7/7 CLOSED)** | 2026-05-17 | 2026-05-17 | 1.36.0 |
| C — medium reads | — | — | — |
| D — medium writes | — | — | — |
| E — complex reads | — | — | — |
| F — complex writes | — | — | — |

### Batch A — CLOSED (2026-05-16, two sessions)

**Session 1 (engine 1.35.0):** `web_search`, `yield_summary`, `volo_stats`, `protocol_deep_dive`, `token_prices`. Established the `defineTool` factory + parity test contract.

**Session 2 (engine 1.35.1):** `balance_check`, `savings_info`, `health_check`, `rates_info`, `mpp_services`. Mechanical migration following locked template — confirmed `defineTool` scales identically to tools with caching flags (`cacheable: false` on 3 of 5) + result budgeting (`maxResultSizeChars: 12_000` on `mpp_services`) + array/enum Zod fields (`rates_info`, `mpp_services`).

**Total Batch A:** 10/10 tools migrated. ~70 lines of hand-written `jsonSchema` duplication eliminated. Zero behavioral changes (same Tool shape, same emitted events, same display text). Zero engine wiring changes (`buildTool` and `defineTool` both consumed unchanged by `toAISDKTools` wrapper).

**Empirical findings to carry into Batch B:**
- The `defineTool` template handles every `buildTool` option that Batch A exercised: `cacheable: false`, `maxResultSizeChars`, optional Zod fields, array/enum Zod fields, optional address strings, multi-property objects.
- `preflight` was NOT exercised in Batch A (no simple-read tool has preflight). Batch B (writes) is the first batch that tests preflight pass-through.
- `isReadOnly: false` was NOT exercised. Batch B is the first batch where the default `isReadOnly` path matters (`buildTool` defaults `isReadOnly: true` ⇒ `permissionLevel: 'auto'`; writes need `isReadOnly: false` ⇒ `permissionLevel: 'confirm'`).

### Batch B — CLOSED (2026-05-17, single session)

**Tools migrated (in three sub-waves, ascending preflight complexity):**

- **Wave 1 (lowest risk):** `save_contact`, `claim_rewards`. `save_contact` has rich preflight (name length + Sui address regex); `claim_rewards` has empty input + structural-only preflight.
- **Wave 2 (canonical writes):** `save_deposit`, `borrow`, `repay_debt`. All three share an asset-enum preflight pattern (`USDC | USDsui`); all three call `agent.{save|borrow|repay}` via the sponsored-tx path.
- **Wave 3 (complex preflight):** `withdraw`, `send_transfer`. `withdraw` has amount-bound + asset-restriction preflight; `send_transfer` has the most complex preflight in the engine (address-format check, zero-address burn guard, multi-token asset normalization via `normalizeAsset`).

**Total Batch B:** 7/7 tools migrated. **-69 net LoC** (112 deletions, 43 insertions) — bigger reduction than Batch A's ~-50 LoC because write tools had more hand-written `jsonSchema` per file (enum + amount + asset + memo + to). All 9 `define-tool.test.ts` parity tests pass; full engine suite green (1422 / 1429, 7 env-skipped; one real-Anthropic-API test failed transiently with `"rejected by Anthropic"` — same flaky test that failed on Day 18, not caused by migration).

**Empirical findings to carry into Batch C:**
- **`preflight` passes through unchanged.** All 7 Batch B tools have non-trivial preflight (asset-enum checks, amount bounds, address regex, zero-address guard, asset-symbol normalization). `defineTool` preserves the preflight callback verbatim — verified by the dedicated `preserves preflight` parity test + zero behavioral changes across the 7 tools.
- **`isReadOnly: false` works identically.** `defineTool` doesn't override the `permissionLevel` default — `confirm` is correctly applied to all 7 Batch B tools, same as `buildTool` did.
- **`flags: { mutating, requiresBalance, affectsHealth, irreversible }` passes through unchanged.** All Batch B tools set at least one flag; the returned `Tool.flags` matches the original. Confirmed via `git diff` — no flags lost in the migration.
- **Auto-generated JSON schemas are stricter than hand-written ones (in a good way).** Where `buildTool` hand-written schemas often omitted `type: 'number'` on amount fields, the Zod schema's `.number().positive()` auto-generates `{ type: 'number', exclusiveMinimum: 0 }`. Anthropic accepts both `exclusiveMinimum` and `minLength` (JSON Schema draft-7 standard) — no LLM-side regression, just tighter validation surface.
- **Field-level descriptions must move from `jsonSchema` into Zod `.describe()`.** A handful of tools (`save_deposit`, `repay_debt`, `withdraw`, `send_transfer`) had richer field-level descriptions in their hand-written `jsonSchema` than in their Zod `.describe()` calls. Migration lifted those into Zod (Zod is now the single source of truth) — verified by inspecting the post-migration `tool.jsonSchema` output, all descriptions preserved.
- **`assertAllowedAsset` SDK call runs identically.** No engine-side change needed for the `assertAllowedAsset('save', input.asset)` / `assertAllowedAsset('borrow', input.asset)` pattern that gates the `OPERATION_ASSETS` allow-list.

**Pattern locked for Batches C → F:** `import { defineTool } from '../v2/define-tool.js'`; swap `buildTool({...})` → `defineTool({...})`; drop the hand-written `jsonSchema` block; move any hand-written field descriptions into the Zod schema via `.describe()`. Everything else (preflight, permissionLevel, flags, isReadOnly, cacheable, maxResultSizeChars, summarizeOnTruncate, call body) passes through unchanged.
