# Phase 17c — Yield on Investment Assets + Borrow Guard

**Goal:** Invested assets (SUI, ETH) earn yield via NAVI and Suilend. New `invest earn` / `invest unearn` commands. Borrow guard prevents borrowing against investment collateral.

**Depends on:** Phase 17b (multi-asset) — shipped v0.14.1

**Version bump:** v0.14.1 → v0.15.0 (minor — new feature)

---

## Critical: wBTC Migration ✅ DONE

```
OLD: 0xaafb...::btc::BTC (SuiBridge)
NEW: 0x0041...::wbtc::WBTC (LayerZero)
```

Completed: constants updated, Cetus routing verified, mainnet buy/sell confirmed, 469 tests pass.

**Note:** BTC yield is deferred to Phase 17c-alpha (AlphaLend) since NAVI/Suilend may not have wBTC LayerZero pools. Users can still `invest buy BTC` for price exposure.

---

## Architecture Overview

```
Checking (USDC) ──save──→ Savings (stablecoin yield)
                           ├─ NAVI          (today)
                           └─ Suilend       (today)

Investment (assets) ──invest earn──→ Earning (asset yield + price exposure)
                                     ├─ NAVI SUI/ETH lending    (Phase 17c — expand supportedAssets)
                                     └─ Suilend SUI/ETH lending (Phase 17c — expand supportedAssets)
```

Both protocols already support SUI/ETH lending on-chain. The refactoring is widening our adapter code from stablecoins-only to include investment assets.

---

## What's New in 17c

| Feature | Details |
|---------|---------|
| **NAVI expanded assets** | `supportedAssets` grows from `STABLE_ASSETS` to include SUI, ETH. Protocol layer widened from `StableAsset` → `string`. |
| **Suilend expanded assets** | Same expansion. `findReserve()` already handles any `SUPPORTED_ASSETS` entry. |
| **`invest earn` command** | Deposit invested assets into best-rate lending protocol. |
| **`invest unearn` command** | Withdraw from lending. Asset stays invested (locked). |
| **`invest sell` auto-withdraw** | If asset is in lending, auto-withdraw before swap to USDC. |
| **Portfolio earning state** | `StoredPosition` tracks `earning`, `earningProtocol`, `earningApy`. |
| **Borrow guard** | `borrow()` excludes investment collateral from available capacity. |
| **Rebalance guard** | `rebalance()` skips investment-earning positions. |
| **Portfolio yield column** | `t2000 portfolio` shows yield APY per position. |

---

## Key Refactoring: StableAsset → Generic Asset Support

The main code change is widening the NAVI and Suilend adapters from stablecoin-only to any supported asset. Both protocols' on-chain contracts are already generic — the limitation is our TypeScript types.

### NAVI protocol layer changes

Current:
```typescript
async function getPool(asset: StableAsset = 'USDC'): Promise<NaviPool> { ... }
export async function buildSaveTx(client, address, amount, options: { asset?: StableAsset }) { ... }
```

After:
```typescript
async function getPool(asset: string = 'USDC'): Promise<NaviPool> { ... }
export async function buildSaveTx(client, address, amount, options: { asset?: string }) { ... }
```

- `getPool()`: already matches by coin type — works for SUI/ETH without logic changes
- `stableToRaw()`: already accepts `decimals` param — works with SUI (9) and ETH (8)
- `getRates()`: expand iteration from `STABLE_ASSETS` to include SUI, ETH
- `buildSaveTx/buildWithdrawTx/etc.`: change type signatures, use `SUPPORTED_ASSETS[asset].decimals`
- `refreshStableOracles()`: rename to `refreshOracles()`, include SUI/ETH oracle feeds when those assets have positions

### Suilend adapter changes

- `findReserve()`: already resolves any `SUPPORTED_ASSETS` key — no logic change needed
- Remove `StableAsset` casts in `buildSaveTx`, `buildWithdrawTx`, `buildBorrowTx`, `buildRepayTx`
- Use `SUPPORTED_ASSETS[asset].decimals` instead of assuming stablecoin decimals
- `stableToRaw()` already generic — just remove the misleading name usage

---

## File Changes

### Modified files — SDK

| File | Changes |
|------|---------|
| `packages/sdk/src/adapters/navi.ts` | Expand `supportedAssets` to include SUI, ETH. |
| `packages/sdk/src/protocols/navi.ts` | Widen `getPool()` from `StableAsset` → `string`. Update `getRates()` to iterate all supported assets. Use generic decimals. Expand `refreshStableOracles()` to include SUI/ETH feeds. |
| `packages/sdk/src/adapters/suilend.ts` | Expand `supportedAssets` to include SUI, ETH. Remove `StableAsset` casts. |
| `packages/sdk/src/adapters/registry.ts` | Update `allRatesAcrossAssets()` to optionally include investment assets. |
| `packages/sdk/src/portfolio.ts` | Add earning state: `earning`, `earningProtocol`, `earningApy` to `StoredPosition`. Add `recordEarn()` / `recordUnearn()` methods. |
| `packages/sdk/src/t2000.ts` | Add `investEarn()`, `investUnearn()`. Update `investSell()` auto-withdraw. Borrow guard in `borrow()` and `maxBorrow()`. Rebalance guard. |
| `packages/sdk/src/errors.ts` | Add `INVEST_ALREADY_EARNING`, `INVEST_NOT_EARNING`, `BORROW_GUARD_INVESTMENT` error codes. |
| `packages/sdk/src/index.ts` | Export new methods and types. |

### Modified files — CLI

| File | Changes |
|------|---------|
| `packages/cli/src/commands/invest.ts` | Add `invest earn` and `invest unearn` subcommands. |
| `packages/cli/src/commands/portfolio.ts` | Show yield APY column when position is earning. |
| `packages/cli/src/commands/borrow.ts` | Clearer error when borrow guard triggers. |
| `packages/cli/src/commands/rates.ts` | Show investment asset rates alongside stablecoin rates. |

### Modified files — MCP

| File | Changes |
|------|---------|
| `packages/mcp/src/tools/write.ts` | Add `earn` and `unearn` actions to `t2000_invest` tool. |
| `packages/mcp/src/prompts.ts` | Update `investment-strategy` and `savings-strategy` prompts. |

### Modified files — Docs, Skills, Marketing

| File | Changes |
|------|---------|
| `README.md` | Investment yield feature. |
| `packages/sdk/README.md` | Add `investEarn()` / `investUnearn()` to API reference. |
| `packages/cli/README.md` | Add `invest earn` / `invest unearn` commands. Updated portfolio output. |
| `packages/mcp/README.md` | Update tool descriptions. |
| `PRODUCT_FACTS.md` | Version bump. New commands. |
| `CLI_UX_SPEC.md` | `invest earn` / `invest unearn` output specs. Portfolio with yield column. |
| `apps/web/app/docs/page.tsx` | New commands. v0.15.0 changelog. |
| `apps/web/app/invest/page.tsx` | Add yield section. |
| `apps/web/app/demo/demoData.ts` | Add invest earn demo flow. |
| `t2000-skills/skills/t2000-invest/SKILL.md` | Add `invest earn` / `invest unearn`. |
| `marketing/marketing-plan.md` | Yield on investments launch tweet. |
| `spec/phase17-investment-build-plan.md` | Mark 17c complete. |
| `spec/t2000-roadmap-v2.md` | Update 17c status. |

### Modified files — Tests

| File | Changes |
|------|---------|
| `packages/sdk/src/adapters/navi.test.ts` | Update for expanded assets. |
| `packages/sdk/src/adapters/suilend.test.ts` | Update for expanded assets. |
| `scripts/test-invest.ts` | Add invest earn/unearn integration tests. |
| `scripts/cli/test-invest.sh` | Add CLI invest earn/unearn tests. |

---

## Task List

### Phase 17c.0 — wBTC Migration ✅ DONE

- [x] 17c.0a Update `SUPPORTED_ASSETS.BTC.type` to wBTC LayerZero
- [x] 17c.0b Verify Cetus routing — confirmed on mainnet
- [x] 17c.0c 469 unit tests pass

### Phase 17c.1 — Expand NAVI for Investment Assets ✅

- [x] 17c.1a Verify SUI and ETH lending pools exist on NAVI mainnet
- [x] 17c.1b Widen `getPool()` from `StableAsset` to `string`
- [x] 17c.1c Update `getRates()` to iterate all supported assets (not just `STABLE_ASSETS`)
- [x] 17c.1d Update `buildSaveTx()`, `buildWithdrawTx()`: use `SUPPORTED_ASSETS[asset].decimals`
- [x] 17c.1e Update `buildBorrowTx()`, `buildRepayTx()`: same decimal widening
- [x] 17c.1f Update `refreshStableOracles()` → `refreshOracles()`: include SUI/ETH feeds
- [x] 17c.1g Update composable methods: `addWithdrawToTx()`, `addSaveToTx()`, `addRepayToTx()`
- [x] 17c.1h Expand `NaviAdapter.supportedAssets` to include SUI, ETH
- [x] 17c.1i Update unit tests — 469/469 pass
- [x] 17c.1j Integration test: deposit SUI into NAVI, check rates, withdraw

### Phase 17c.2 — Expand Suilend for Investment Assets ✅

- [x] 17c.2a Verify SUI and ETH reserves exist on Suilend mainnet (+ wBTC LayerZero reserve 42!)
- [x] 17c.2b Remove `StableAsset` casts in adapter methods
- [x] 17c.2c Use `SUPPORTED_ASSETS[asset].decimals` for raw amount conversion
- [x] 17c.2d Expand `SuilendAdapter.supportedAssets` to include SUI, ETH, BTC
- [x] 17c.2e Update unit tests — 469/469 pass
- [x] 17c.2f Integration test: deposit SUI into Suilend, check rates, withdraw

### Phase 17c.3 — Portfolio Earning State ✅

- [x] 17c.3a Add earning fields to `StoredPosition`
- [x] 17c.3b Add `recordEarn()` method to `PortfolioManager`
- [x] 17c.3c Add `recordUnearn()` method
- [x] 17c.3d `getPortfolio()`: if position is earning, include earning state
- [x] 17c.3e Unit tests for portfolio earning state

### Phase 17c.4 — `investEarn` / `investUnearn` SDK Methods ✅

- [x] 17c.4a `T2000.investEarn(asset)` — full implementation
- [x] 17c.4b `T2000.investUnearn(asset)` — full implementation
- [x] 17c.4c Update `T2000.investSell()`: auto-unearn before sell
- [x] 17c.4d Add error codes: `INVEST_ALREADY_EARNING`, `INVEST_NOT_EARNING`, `BORROW_GUARD_INVESTMENT`
- [x] 17c.4e Unit tests — 469/469 pass
- [x] 17c.4f Integration test: invest buy → invest earn → portfolio → invest unearn → invest sell

### Phase 17c.5 — Borrow Guard + Rebalance Guard ✅

- [x] 17c.5a In `T2000.borrow()`: `adjustMaxBorrowForInvestments()` excludes investment collateral
- [x] 17c.5b In `T2000.maxBorrow()`: same adjustment
- [x] 17c.5c Add `BORROW_GUARD_INVESTMENT` error
- [x] 17c.5d Clear error messaging for investment guard
- [x] 17c.5e In `T2000.rebalance()`: filter out `earningAssets` from `savePositions`
- [x] 17c.5f Unit tests for borrow guard — 469/469 pass
- [x] 17c.5g Unit tests for rebalance guard

### Phase 17c.6 — CLI Commands ✅

- [x] 17c.6a `t2000 invest earn <asset>` — deposit invested asset into best-rate protocol
- [x] 17c.6b `t2000 invest unearn <asset>` — withdraw from lending, keep in portfolio
- [x] 17c.6c Update `t2000 portfolio` output — yield APY column
- [x] 17c.6d Update `t2000 invest sell` — auto-withdraw messaging
- [x] 17c.6e Update borrow error message for investment guard
- [x] 17c.6f Update `t2000 balance` — earning APY when position is earning
- [x] 17c.6g Update `t2000 rates` — show investment asset rates

### Phase 17c.7 — MCP Tools + Prompts ✅

- [x] 17c.7a Update `t2000_invest` tool: add `earn` and `unearn` actions
- [x] 17c.7b Update `t2000_portfolio` tool: earning state included via `getPortfolio()`
- [x] 17c.7c Update `investment-strategy` prompt: mention yield optimization
- [x] 17c.7d Update `savings-strategy` prompt: note yield now available on investments

### Phase 17c.8 — Docs, Skills, Marketing ✅

- [x] 17c.8a Update `README.md` — investment yield feature
- [x] 17c.8b Update `packages/sdk/README.md` — `investEarn()`, `investUnearn()`
- [x] 17c.8c Update `packages/cli/README.md` — new commands, portfolio output
- [x] 17c.8d Update `packages/mcp/README.md` — tool updates
- [x] 17c.8e Update `PRODUCT_FACTS.md` — version, commands
- [x] 17c.8f Update `CLI_UX_SPEC.md` — `invest earn`/`invest unearn` output specs
- [x] 17c.8g Update `apps/web/app/docs/page.tsx` — new commands, changelog
- [x] 17c.8h Update `apps/web/app/invest/page.tsx` — yield section
- [x] 17c.8i Update `apps/web/app/demo/demoData.ts` — invest earn demo
- [x] 17c.8j Update `t2000-skills/skills/t2000-invest/SKILL.md`
- [x] 17c.8k Update `marketing/marketing-plan.md` — yield launch tweet
- [x] 17c.8l Mark 17c complete in `spec/phase17-investment-build-plan.md`
- [x] 17c.8m Update `spec/t2000-roadmap-v2.md`

### Phase 17c.9 — Release ✅

- [x] 17c.9a Version bump to v0.15.0 (SDK, CLI, MCP)
- [x] 17c.9b Build all packages
- [x] 17c.9c Run unit tests
- [x] 17c.9d Run SDK integration tests
- [x] 17c.9e Run CLI integration tests
- [x] 17c.9f Build web app
- [x] 17c.9g `npm link` CLI for local testing
- [x] 17c.9h Git commit + push
- [x] 17c.9i Provide npm publish commands

---

## User Flows

### Flow 1: Buy SUI, earn yield, sell

```
t2000 invest buy 100 SUI
→ ✓ Bought 105.26 SUI at $0.95
→ Invested: $100.00

t2000 invest earn SUI
→ ✓ SUI deposited into NAVI (5.2% APY)
→ Best rate: NAVI 5.2% > Suilend 3.8%

t2000 portfolio
  ──────────────────────────────────────
  SUI:  105.26    Avg: $0.95    Now: $0.97    +$2.10 (+2.1%)    5.2% APY (NAVI)
  ──────────────────────────────────────

t2000 invest sell all SUI
→ ✓ Withdrew 105.26 SUI from NAVI
→ ✓ Sold 105.26 SUI at $0.97
→ Proceeds: $102.10
→ Realized P&L: +$2.10
```

### Flow 2: Borrow guard

```
# User has SUI earning in NAVI (investment collateral)
t2000 invest earn SUI
→ ✓ SUI deposited into NAVI

# User also has $500 USDC in savings
t2000 balance
→ Savings: $500.00

# User tries to borrow
t2000 borrow 400
→ ✗ Max safe borrow: $300.00
→ Only savings deposits ($500 USDC) count as borrowable collateral.
→ Investment collateral (SUI) is excluded.
```

### Flow 3: Invest unearn

```
t2000 invest unearn SUI
→ ✓ Withdrew 105.26 SUI from NAVI
→ SUI remains in investment portfolio (locked)
→ No longer earning yield

t2000 portfolio
  SUI:  105.26    Avg: $0.95    Now: $0.97    +$2.10 (+2.1%)    —
```

---

## Locking Model (unchanged)

```
Investment (wallet)  ──invest earn──→  Investment (earning yield)
       │                                      │
       │ locked (can't send/exchange)         │ locked (can't send/exchange)
       │                                      │
       └──invest sell──→ USDC           ←──invest sell──┘
                                         (auto-withdraws first)
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| NAVI SUI/ETH pools don't exist | Verify on mainnet before coding. NAVI's pools API lists all available pools by coin type. |
| Suilend SUI/ETH reserves don't exist | Verify on mainnet. `loadReserves()` already fetches all reserves. |
| NAVI protocol layer `StableAsset` refactor breaks existing savings | Thorough unit tests. Run existing integration tests (`test-navi.ts`) after refactoring. |
| Borrow guard math wrong | Integration test: deposit SUI → borrow → verify only stablecoin savings count. |
| Portfolio earning state desyncs | On `getPortfolio()`, verify earning matches on-chain position. |
| Rebalance moves investment collateral | Filter: `rebalance()` only touches stablecoin positions. |
| BTC has no yield option | Expected — deferred to Phase 17c-alpha (AlphaLend). Users can still hold BTC for price exposure. |

---

## Build Order

```
17c.0  wBTC migration ✅ DONE
17c.1  Expand NAVI for SUI/ETH  ← START HERE
17c.2  Expand Suilend for SUI/ETH (parallel with 17c.1)
17c.3  Portfolio earning state (depends on 17c.1/17c.2)
17c.4  investEarn / investUnearn (depends on 17c.1-17c.3)
17c.5  Borrow guard + rebalance guard (depends on 17c.4)
17c.6  CLI commands (depends on 17c.4)
17c.7  MCP tools (parallel with 17c.6)
17c.8  Docs, skills, marketing
17c.9  Release
```

---

## Dependencies

### New npm dependency: None

No new protocols. Just widening existing NAVI + Suilend adapters.

### On-chain dependencies

| Protocol | Status |
|----------|--------|
| NAVI | Already integrated. SUI/ETH pools to verify on mainnet. |
| Suilend | Already integrated. SUI/ETH reserves to verify on mainnet. |

---

## What's Deferred

| Feature | Deferred to | Why |
|---------|-------------|-----|
| AlphaLend protocol + adapter | Phase 17c-alpha | New protocol deserves own focused spec. Full adapter (save/withdraw/borrow/repay) with 5 assets. |
| BTC yield (invest earn BTC) | Phase 17c-alpha | NAVI/Suilend may not have wBTC LayerZero pools. AlphaLend confirmed (market 29). |
| Third savings yield source | Phase 17c-alpha | AlphaLend USDC/USDT markets compete with NAVI/Suilend for best rate. |

---

## Summary

| Metric | Before (v0.14.1) | After (v0.15.0) |
|--------|-------------------|-----------------|
| Lending protocols | 2 (NAVI, Suilend) | 2 (expanded asset support) |
| Savings yield sources | 2 | 2 |
| Investment yield | None | SUI, ETH via NAVI + Suilend |
| CLI commands | ~29 | ~31 (+ invest earn, invest unearn) |
| MCP tool actions | ~19 | ~21 |
| Borrow guard | None | Investment collateral excluded |
| BTC coin type | wBTC SuiBridge | wBTC LayerZero |
