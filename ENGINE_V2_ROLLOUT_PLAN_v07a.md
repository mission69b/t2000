# ENGINE v2.0.0 ROLLOUT PLAN — v0.7a Phase 2 → Phase 3 close

```yaml
spec_id: engine-v2-rollout-v07a
version: 1.1
status: locked
locked_at: 2026-05-17T10:45+10:00
related_specs:
  - /Users/funkii/dev/t2000/BENEFITS_SPEC_v07a.md
  - /Users/funkii/dev/t2000/TOOL_UX_DESIGN_v07a.md
  - /Users/funkii/dev/t2000/WHY_v07a.md
endpoint: engine v2.0.0 ships to npm; legacy QueryEngine deleted; audric on AISDKEngine for 100% traffic
estimated_duration: 10 days from Day 1 (calendar)
```

## Locked baseline (Day 0 audit, 2026-05-17 10:45 AEST)

Vercel production has these env vars set:

```
USE_AI_SDK_NATIVE_ENGINE_WALLETS=0x7f2059fb1c395f4800809b4b97ed8e661535c8c55f89b1379b6b9d0208d2f6dc
NEXT_PUBLIC_HEALTH_CARD_V2=1
```

Everything else (`USE_AI_SDK_NATIVE_ENGINE`, 6 other `NEXT_PUBLIC_*_CARD_V2` flags, `NEXT_PUBLIC_WRITE_PREVIEWS_V2`) is **unset** — audric's Zod schema treats missing as undefined → falsy → V1 renders. So in prod today:

- AISDKEngine active ONLY for the founder's wallet (via allowlist)
- HealthCardV2 active for ALL users (already battle-tested → remove from Block B)
- V1 BalanceCard / PortfolioCard / SwapQuoteCard / RatesCard / PendingRewardsCard / PermissionCard active for ALL users

**Two implicit Day 0 tasks already validated:**
1. V1 fallback works — every card except Health is V1 in prod today, rendering cleanly. Kill switch back to V1 is provably functional.
2. AISDKEngine + V1 cards is a tested combination — the founder has been running this combo every smoke today (and via allowlist for weeks). Engine swap and card swap are independent rollouts.

> **Purpose.** Plan backward from "Engine v2.0.0 ships + legacy deleted" as the endpoint. Every step is a flag-gated cutover with explicit kill switch + soak gate. No new building — all the components, V2 cards, preview bodies, and the AISDKEngine itself are already shipped (see § "What's already done" below). The remaining work is a deliberate rollout, not implementation.
>
> **Why a plan, not just "flip the flag":** The 3 bugs we found Days 20c-20e (canvas wrapping, missing side-channel events, analytics-401) all surfaced via founder smoke, not unit tests. Production-only failure modes are real. A sequenced rollout with kill switches catches them one at a time instead of flipping everything and getting a multi-source incident.

---

## What's already done (ship-readiness assessment)

| Layer | Component | Status | Production state |
|---|---|---|---|
| **Engine — AISDKEngine** | `v2/engine.ts` + 13 supporting modules | ✅ Built, 89 focused tests + 1443 suite tests pass | **Per-wallet allowlist** (founder dogfood + manual additions via `USE_AI_SDK_NATIVE_ENGINE_WALLETS` CSV) |
| **Engine — bridge** | `bridge/event-bridge.ts` + parity contract | ✅ Built, 47 event-bridge tests + 13 bridge-parity tests | Live for allowlisted users |
| **Engine — tools** | All 39 tools on `defineTool` | ✅ Phase 2 closed Day 20b | Live for both engines |
| **Engine — SSOT** | `/api/portfolio`, `/api/history`, 5 `/api/analytics/*` routes dual-auth | ✅ Days 20d + 20e | Live; engine reads through SSOT |
| **Audric — shared components (5)** | `AssetAmountBlock`, `HFGauge`, `RouteDiagram`, `PreviewCard`, `APYBlock` | ✅ Built + tested | Imported by V2 cards |
| **Audric — V2 cards (6)** | `BalanceCardV2`, `PortfolioCardV2`, `HealthCardV2`, `SwapQuoteCardV2`, `RatesCardV2`, `PendingRewardsCardV2` | ✅ Built + tested | Gated by 6 `NEXT_PUBLIC_*_CARD_V2` flags; current prod state UNKNOWN — Vercel audit needed |
| **Audric — preview bodies (5)** | `SaveDepositPreviewBody`, `WithdrawPreviewBody`, `BorrowPreviewBody`, `RepayPreviewBody`, `HarvestRewardsPreviewBody` | ✅ Built + 26 dedicated tests | Gated by `NEXT_PUBLIC_WRITE_PREVIEWS_V2`; `.env.local` has it OFF |

**What's NOT done:**
- Production rollout (the 7 V2 flags + the global `USE_AI_SDK_NATIVE_ENGINE` flag flipped to all users)
- Soak window observation
- Engine v2.0.0 release + legacy module deletion
- Downstream consumer (`@t2000/cli`, `@t2000/mcp`) audit for legacy-API usage
- Engine v2.0.0 release notes + breaking-change migration guide

---

## The endpoint — what "v2.0.0 ships" means

A `git tag v2.0.0` is the endpoint when ALL of these are true:

1. **`USE_AI_SDK_NATIVE_ENGINE=1`** in Vercel production for 100% of traffic, soaked clean for ≥5 days.
2. **All 7 `NEXT_PUBLIC_*_CARD_V2` / `NEXT_PUBLIC_WRITE_PREVIEWS_V2`** flags ON in Vercel production for ≥5 days clean.
3. **No founder-reported regressions** for the soak window.
4. **`engine.ts` legacy `QueryEngine`** deleted from `@t2000/engine`.
5. **`providers/anthropic.ts` + `providers/ai-sdk-anthropic.ts` wrapper** deleted.
6. **`streaming.ts`, `microcompact.ts`, `EarlyToolDispatcher`, `McpClientManager`, `mcp/tool-adapter.ts`** deleted.
7. **`@t2000/cli` and `@t2000/mcp`** audited; any legacy-API import migrated.
8. **`EngineConfig` breaking changes documented**: `provider` field → `anthropicApiKey`; `mcpManager` removed (use native AI SDK MCP).
9. **CHANGELOG.md + RELEASE.md** drafted with the breaking-change migration guide for downstream consumers (there are 3 known: audric, t2000 CLI, t2000 MCP — all owned by us).
10. **Bridge-parity test still passes** (no EngineEvent variant orphaned through the cutover).

---

## Rollout schedule (10-11 days, working backward from v2.0.0)

### Day 0 — TODAY (audit + lock)

**Goal:** Establish ground truth on Vercel production env. Lock this plan.

**Tasks:**
- Founder dumps current Vercel production env for these 8 flags:
  - `USE_AI_SDK_NATIVE_ENGINE` (expected: empty/unset OR per-wallet allowlist)
  - `USE_AI_SDK_NATIVE_ENGINE_WALLETS` (founder's wallet + any others)
  - `NEXT_PUBLIC_BALANCE_CARD_V2`
  - `NEXT_PUBLIC_PORTFOLIO_CARD_V2`
  - `NEXT_PUBLIC_HEALTH_CARD_V2`
  - `NEXT_PUBLIC_SWAP_QUOTE_CARD_V2`
  - `NEXT_PUBLIC_RATES_CARD_V2`
  - `NEXT_PUBLIC_PENDING_REWARDS_CARD_V2`
  - `NEXT_PUBLIC_WRITE_PREVIEWS_V2`
- Update this doc's `status: draft → locked` with the actual baseline values.
- Confirm Day 1 sequence is correct based on what's already live.

**Decision point:** if any V2 card flag is already `1` in prod, skip its Block A flip (already done).

### Day 1-2 — Block A: Low-risk read cards (rates, portfolio)

**Why first:** Both are structured-data or near-structured. Both render data the V1 card already renders (no new data shape from engine). Both are called infrequently. Worst case if broken: V1 falls back (no fallback exists today actually — the card returns null; need to verify).

**Wait — risk surfaced:** if `useV2` is false the renderer falls through to V1 logic in `ToolResultCard.tsx`. Need to confirm V1 still works for all 6 cards as a true rollback path. Add to Day 0 checklist.

**Sequence:**
- **Day 1 AM**: Flip `NEXT_PUBLIC_RATES_CARD_V2=1` in Vercel. Founder runs prompt: *"What are NAVI savings + borrow rates right now?"* → V2 rates card with APYBlocks renders.
- **Day 1 PM**: Watch for 4-6h. Pass = no errors in browser console + no founder visual complaints.
- **Day 2 AM**: Flip `NEXT_PUBLIC_PORTFOLIO_CARD_V2=1`. Founder runs: *"Show me a portfolio breakdown."* → V2 portfolio card renders with AssetAmountBlock lists per section.
- **Day 2 PM**: Watch.

**Kill switch:** flip the flag back to `0` in Vercel; ~30s deploy.

**Advancement gate:** both flags on for ≥24h with no founder regression report → advance to Block B.

### Day 3-4 — Block B: High-traffic read cards (balance, swap-quote, pending-rewards)

**Why second:** These are the most-rendered cards (balance every session; swap-quote on demand; pending-rewards when user has claimable). Higher traffic = higher chance of catching edge cases. But still read-only.

**Note:** `HEALTH_CARD_V2` is already `=1` in prod (Day 0 audit) — battle-tested. Block B is now 3 cards, not 4.

**Sequence:**
- **Day 3 AM**: Flip `NEXT_PUBLIC_BALANCE_CARD_V2=1` (most-viewed card; do it alone to isolate any regression). Founder runs full session-load smoke + asks "what's my balance".
- **Day 3 PM**: Watch.
- **Day 4 AM**: Flip `NEXT_PUBLIC_SWAP_QUOTE_CARD_V2=1` + `NEXT_PUBLIC_PENDING_REWARDS_CARD_V2=1` (both lower-traffic; can pair). Founder runs swap-quote prompt + pending-rewards prompt (if rewards available).
- **Day 4 PM**: Watch.

**Kill switch:** per-flag flip back. Independent kill switches.

**Advancement gate:** all 4 flags on for ≥24h clean → advance to Block C.

### Day 5-7 — Block C: WRITE_PREVIEWS_V2 (the highest-impact flag)

**Why this is the riskiest single flip:** Changes the confirm-card UX for every write tool — `save_deposit`, `withdraw`, `borrow`, `repay_debt`, `harvest_rewards`. A bug here = a user taps "Confirm" on a different shape than they thought they were approving = bad trust signal.

**Pre-flip:** review the `PermissionCard.tsx` integration once more, run `pnpm --filter @audric/web test` (all 3243 should still pass).

**Sequence:**
- **Day 5 AM**: Flip `NEXT_PUBLIC_WRITE_PREVIEWS_V2=1`. Founder runs 5 small-dollar write smokes IN ORDER:
  - `save_deposit` 0.10 USDC → SaveDepositPreviewBody renders with AssetAmountBlock + APYBlock + HF projection
  - `withdraw` 0.10 USDC → WithdrawPreviewBody renders with HF projection (since founder has no debt, HF stays ∞)
  - `borrow` 0.10 USDC → BorrowPreviewBody renders with HF projection + interest rate row
  - `repay_debt` 0.10 USDC (if any debt) → RepayPreviewBody renders
  - `harvest_rewards` (if rewards available) → HarvestRewardsPreviewBody renders with RouteDiagram for each non-USDC swap leg
- **Day 5-6**: Watch for 36-48h. Pass = each preview card renders with the right shape AND each Confirm tap leads to the same successful tx that V1 would have produced (the engine path is unchanged — only the preview UI changed).
- **Day 7**: One more cycle of write smokes to confirm 48h+ stability.

**Special concern:** Pre-flip the founder should also test `swap_execute` end-to-end since swap is the other write tool with HITL. Swap uses the existing PermissionCard (not a preview body), but the same flag could affect anything routed through `renderPreviewBody`. Confirm during smoke.

**Kill switch:** flip back. Existing V1 preview UI returns instantly on next request.

**Advancement gate:** all 5 write tools verified working + 48h+ stable → advance to Block D.

### Day 8-10 — Block D: USE_AI_SDK_NATIVE_ENGINE global flip

**Why last:** Changes the underlying engine for 100% of traffic. Currently only the founder's wallet (and any other allowlisted wallets) hit AISDKEngine. After this flip, every user does.

**What changes:**
- LLM stream path: legacy `QueryEngine.agentLoop` → AI SDK `streamText`
- Tool dispatch: legacy `executeTool` / `EarlyToolDispatcher` → AI SDK native
- Confirm flow: legacy `pending_action` mechanism → still emitted by engine bridge, audric consumes identically
- MCP integration: still uses legacy `McpClientManager` until Phase 4 (not in scope for v2.0.0)

**Pre-flip dependencies:**
- Bridge-parity test must still pass (verify in CI before flip).
- Manual review of audric's `engine-factory.ts` to confirm `AISDKEngine` instantiation is bug-free for all account types (zkLogin accounts, watched accounts, etc.).
- Run a full `pnpm --filter @audric/web test` (3243 tests) immediately before flip.

**Sequence:**
- **Day 8 AM**: Flip `USE_AI_SDK_NATIVE_ENGINE=1` in Vercel production. Remove `USE_AI_SDK_NATIVE_ENGINE_WALLETS` allowlist (no longer needed).
- **Day 8 PM**: Founder runs every tool category once: read (balance), parallel reads (balance + savings), single write (save 0.10), HITL write (borrow 0.10), canvas (activity heatmap), todo update (if applicable), tool error path (invalid input), session resume (refresh page mid-stream).
- **Day 9**: Watch. Specifically monitor:
  - TurnMetrics error rate (should be ≤ pre-flip baseline)
  - AdviceLog volume (should be similar)
  - Bridge-parity test in CI (should be green on every audric commit)
- **Day 10**: One more dogfood cycle. If clean → ship-ready.

**Kill switch:** flip `USE_AI_SDK_NATIVE_ENGINE=0` in Vercel; ~30s deploy reverts all users to legacy QueryEngine. Reads + writes resume on legacy path with zero data loss (engine path is stateless per turn; persisted state is engine-agnostic).

**Advancement gate:** 5+ days clean on global flag → ship v2.0.0.

### Day 11 — Engine v2.0.0 ships

**Pre-ship checklist:**
- [ ] All 7 V2 flags + USE_AI_SDK_NATIVE_ENGINE green in production for 5+ days
- [ ] No founder-reported regressions in the soak window
- [ ] CHANGELOG.md drafted (breaking changes: `provider` → `anthropicApiKey`; `mcpManager` removed)
- [ ] `@t2000/cli` audit complete — any legacy-API imports migrated
- [ ] `@t2000/mcp` audit complete — any legacy-API imports migrated
- [ ] BENEFITS_SPEC_v07a.md E-1 target re-checked (~80% engine LoC reduction)

**Ship sequence:**
1. **Code deletion PR** (one commit, big diff):
   - `packages/engine/src/engine.ts` (legacy QueryEngine class) → DELETE
   - `packages/engine/src/providers/anthropic.ts` → DELETE
   - `packages/engine/src/providers/ai-sdk-anthropic.ts` → DELETE (the wrapper)
   - `packages/engine/src/streaming.ts` → DELETE
   - `packages/engine/src/microcompact.ts` → DELETE
   - `packages/engine/src/streamingEarlyToolDispatcher.ts` (if separate) → DELETE
   - `packages/engine/src/mcp/client.ts` + `tool-adapter.ts` → DELETE
   - `packages/engine/src/v2/engine.ts` → MOVE to `packages/engine/src/engine.ts` (the canonical now)
   - `packages/engine/src/index.ts` exports cleaned — `QueryEngine` removed; `AISDKEngine` renamed to `Engine` (or kept as alias)
   - All legacy tests for deleted modules → DELETE
2. **Verify build green**: `pnpm -r test && pnpm -r lint && pnpm -r typecheck && pnpm -r build`
3. **Run E-1 metric**: `cloc packages/engine/src --quiet` — confirm ≥80% reduction vs Day 0 baseline (~21,800 → ~4,500 target)
4. **Release**: `gh workflow run release.yml --field bump=major`
5. **Update audric**: `pnpm add @t2000/engine@2.0.0 @t2000/sdk@2.0.0` + adjust any breaking-change consumers (`anthropicApiKey` config rename if audric still uses old field)
6. **Update CLI + MCP**: same dependency bump, same migration
7. **Soak engine 2.0.0** for 24h
8. **Tag v0.7a complete**, close BENEFITS_SPEC Phase 2/3 entries with `realized` status

---

## Risk register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| A V2 card has a bug that only surfaces with a specific wallet (low-balance, watched, weird coin combo) | Medium | Medium (visual; data unaffected) | Per-flag kill switch; founder smokes test wallet variety in Block B |
| WRITE_PREVIEWS_V2 has wrong-confirm-shape bug | Low | High (user taps Confirm on misleading preview = trust breach) | Most-tested code (26 dedicated tests); manual smoke each write before advancing Day 7→8 |
| USE_AI_SDK_NATIVE_ENGINE global causes unexpected `EngineEvent` order/shape divergence | Low | Medium (audric blockrouter assumes legacy order in places) | Bridge-parity test (Day 20e) blocks any divergence at CI; allowlisted users have been on AISDKEngine for weeks already |
| CLI/MCP package imports a removed engine API | Medium | Low (caught at typecheck before ship) | Pre-ship audit (Day 11 checklist item #5); these are our own packages, fix is mechanical |
| Engine v2.0.0 major-bump downstream breakage we don't own | Low | Low (the only known consumers are audric + CLI + MCP, all ours) | npm publish + watch for any community installs (currently zero) |
| Bridge silently drops a new EngineEvent variant that someone adds during the soak window | Very Low | Medium | bridge-parity.test.ts fails to typecheck on any new variant without a classification entry |
| MemWal Phase 7 work pauses too long (per BENEFITS_SPEC Phase 7 commitment gate) | Low | Low | MemWal track is independent per the locked plan; resumes after Phase 4 (MCP migration) anyway |
| Soak reveals a perf regression on AISDKEngine vs legacy | Low | Low | Both engines emit `usage` events with identical token accounting; can compare directly |

---

## What we DON'T do during this rollout

- **No new engine features.** Every change is a flag flip; no code additions to engine or audric except the Day 11 deletion PR.
- **No tool migrations.** The 26 mechanical tools (text-only / structured-data) stay as-is — they work fine with the default renderer.
- **No Phase 4 (MCP migration) work.** That's a v0.7a Phase 4 deliverable post-v2.0.0; do not start until v2.0.0 is shipped + soaked.
- **No deletion of any feature flag before v2.0.0 ships.** The flags are the kill switches; deleting them removes the rollback safety net.
- **No SPEC 37+ work in parallel.** Single track, single focus, until v2.0.0 ships.

---

## Calendar (concrete dates, Day 0 audited 2026-05-17 Sunday AEST)

| Day | Date | Block | Deliverable |
|---|---|---|---|
| 0 | Sun 2026-05-17 | Audit | ✅ DONE — Vercel baseline locked above; this plan moved to `status: locked` |
| 1 | Mon 2026-05-18 | A | Add `NEXT_PUBLIC_RATES_CARD_V2=1` in Vercel |
| 2 | Tue 2026-05-19 | A | Add `NEXT_PUBLIC_PORTFOLIO_CARD_V2=1` in Vercel |
| 3 | Wed 2026-05-20 | B | Add `NEXT_PUBLIC_BALANCE_CARD_V2=1` (alone — most-viewed card) |
| 4 | Thu 2026-05-21 | B | Add `NEXT_PUBLIC_SWAP_QUOTE_CARD_V2=1` + `NEXT_PUBLIC_PENDING_REWARDS_CARD_V2=1` |
| 5 | Fri 2026-05-22 | C | Add `NEXT_PUBLIC_WRITE_PREVIEWS_V2=1` + full 5-write smoke |
| 6-7 | Sat-Sun 2026-05-23-24 | C | Write soak (48h) |
| 8 | Mon 2026-05-25 | D | Add `USE_AI_SDK_NATIVE_ENGINE=1` + delete `USE_AI_SDK_NATIVE_ENGINE_WALLETS` |
| 9-10 | Tue-Wed 2026-05-26-27 | D | Global-engine soak |
| 11 | Thu 2026-05-28 | Ship | Engine v2.0.0 release + legacy deletion |

**7 flag flips total** (was 8 — HealthCardV2 already live). Buffer days built in (Day 6-7 weekend overlap with soak; Day 9-10 is 2-day soak vs minimum 1-day) → slippage is absorbable into the same week.

---

## Decision points (founder owns each)

1. **Day 0**: confirm baseline. If anything is already live in prod that this plan assumes is off, adjust sequence.
2. **End of Day 2 (Block A done)**: GO/NO-GO for Block B. If any rates/portfolio card regression seen, fix before advancing.
3. **End of Day 4 (Block B done)**: GO/NO-GO for Block C (write previews). Higher bar — visual regressions on read cards are recoverable; visual regressions on write previews damage trust.
4. **End of Day 7 (Block C done)**: GO/NO-GO for Block D (global engine flip). Highest bar — this is the actual "v2 is on for everyone" moment.
5. **End of Day 10 (Block D done)**: GO/NO-GO for v2.0.0 ship. If anything unstable, extend soak; the LoC deletion can wait a week without cost.

---

## Cross-references

- BENEFITS_SPEC_v07a.md § "Day 2 onward (B+, locked)" — original calendar this plan executes
- TOOL_UX_DESIGN_v07a.md — the design baseline each V2 card implements
- WHY_v07a.md — the strategic case for v0.7a
- SPIKE_FINDINGS_v07a.md — the original spike that proved AI SDK v6 covers 80% of legacy custom code
- audric/.cursor/rules/audric-transaction-flow.mdc — confirm flow that the preview bodies plug into
- packages/engine/src/bridge/bridge-parity.test.ts — the structural contract that guards the global flip in Block D
- packages/engine/src/v2/engine.ts — the AISDKEngine that becomes the canonical engine on Day 11
