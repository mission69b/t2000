# Phase 17c — Yield on Investment Assets + AlphaLend + Borrow Guard

**Goal:** Invested assets (SUI, BTC, ETH) earn yield via NAVI, Suilend, and AlphaLend. New `invest earn` / `invest unearn` commands. Borrow guard prevents borrowing against investment collateral. AlphaLend becomes a third lending protocol for both savings (stablecoins) and investment yield.

**Depends on:** Phase 17b (multi-asset) — shipped v0.14.1

**Version bump:** v0.14.1 → v0.15.0 (minor — new feature, new protocol)

---

## Critical: wBTC Migration (SuiBridge → LayerZero)

The Sui ecosystem is retiring wBTC (SuiBridge) in favor of wBTC (LayerZero). Update before any 17c work:

```
OLD: 0xaafb102dd0902f5055cadecd687fb5b71ca82ef0e0285d90afde828ec58ca96b::btc::BTC (SuiBridge)
NEW: 0x0041f9f9344cac094454cd574e333c4fdb132d7bcc9379bcd4aab485b2a63942::wbtc::WBTC (LayerZero)
```

**Files to update:**
- `packages/sdk/src/constants.ts` — `SUPPORTED_ASSETS.BTC.type` and `symbol` to `'WBTC'` (or keep display as `'BTC'`)
- Verify Cetus routing for new wBTC type
- Verify NAVI, Suilend, AlphaLend market support for new wBTC type

---

## Architecture Overview

```
Checking (USDC) ──save──→ Savings (stablecoin yield)
                           ├─ NAVI          (today)
                           ├─ Suilend       (today)
                           └─ AlphaLend     (Phase 17c — NEW, also benefits savings)

Investment (assets) ──invest earn──→ Earning (asset yield + price exposure)
                                     ├─ NAVI SUI/ETH lending    (Phase 17c — expand supportedAssets)
                                     ├─ Suilend SUI/ETH lending (Phase 17c — expand supportedAssets)
                                     └─ AlphaLend lending       (Phase 17c — NEW, SUI/BTC/ETH)
```

All three lending protocols serve both stablecoins and investment assets. `rebalance` optimizes yield across all of them for any asset type.

---

## What's New in 17c

| Feature | Details |
|---------|---------|
| **AlphaLend protocol + adapter** | Third lending protocol. Contract-first (direct `moveCall`). Supports SUI, BTC, ETH, USDC. |
| **NAVI expanded assets** | `supportedAssets` grows from `STABLE_ASSETS` to include SUI, ETH. Protocol layer updated. |
| **Suilend expanded assets** | Same expansion. `findReserve()` already handles any `SUPPORTED_ASSETS` entry. |
| **`invest earn` command** | Deposit invested assets into best-rate lending protocol. |
| **`invest unearn` command** | Withdraw from lending. Asset stays invested (locked). |
| **`invest sell` auto-withdraw** | If asset is in lending, auto-withdraw before swap to USDC. |
| **Portfolio earning state** | `StoredPosition` tracks `earning`, `earningProtocol`, `earningApy`. |
| **Borrow guard** | `borrow()` excludes investment collateral from available capacity. |
| **Portfolio yield column** | `t2000 portfolio` shows yield APY per position. |

---

## AlphaLend Integration — Contract-First

### Why contract-first (not SDK)

Same pattern as NAVI and Suilend — direct `moveCall()` to on-chain contracts. No npm SDK dependency. Benefits:
- Smaller bundle, fewer transitive deps
- Full control over transaction building (composable PTBs)
- No SDK version drift risk
- Consistent with existing protocol layers

### On-chain constants

```typescript
const ALPHALEND = {
  PACKAGE_ID: '0xc8a5487ce3e5b78644f725f83555e1c65c38f0424a72781ed5de4f0369725c79',
  FIRST_PACKAGE_ID: '0xd631cd66138909636fc3f73ed75820d0c5b76332d1644608ed1c85ea2b8219b4',
  PROTOCOL_ID: '0x01d9cf05d65fa3a9bb7163095139120e3c4e414dfbab153a49779a7d14010b93',
  POSITION_CAP_TYPE: '0xd631cd66138909636fc3f73ed75820d0c5b76332d1644608ed1c85ea2b8219b4::position::PositionCap',
  MARKETS_TABLE_ID: '0x2326d387ba8bb7d24aa4cfa31f9a1e58bf9234b097574afb06c5dfb267df4c2e',
  CLOCK: '0x6',
  SUI_SYSTEM_STATE: '0x5',
  // Pyth oracle
  PYTH_PACKAGE: '0x04e20ddf36af412a4096f9014f4a565af9e812db9a05cc40254846cf6ed0ad91',
  PYTH_STATE: '0x1f9310238ee9298fb703c3419030b35b22bb1cc37113e3bb5007c99aec79e5b8',
  WORMHOLE_PACKAGE: '0x5306f64e312b581766351c07af79c72fcb1cd25147157fdc2f8ad76de9a3fb6a',
  WORMHOLE_STATE: '0xaeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c',
};
```

### Move function signatures

| Action | Target | Type args | Args |
|--------|--------|-----------|------|
| Create position | `alpha_lending::create_position` | — | `(protocol)` → returns `PositionCap` |
| Supply (add collateral) | `alpha_lending::add_collateral<T>` | `[coinType]` | `(protocol, positionCap, marketId, coin, clock)` |
| Withdraw (remove collateral) | `alpha_lending::remove_collateral<T>` | `[coinType]` | `(protocol, positionCap, marketId, amount, clock)` → returns promise |
| Fulfill promise (SUI) | `alpha_lending::fulfill_promise_SUI` | — | `(protocol, promise, suiSystemState, clock)` → returns Coin |
| Fulfill promise (other) | `alpha_lending::fulfill_promise<T>` | `[coinType]` | `(protocol, promise, clock)` → returns Coin |
| Borrow | `alpha_lending::borrow<T>` | `[coinType]` | `(protocol, positionCap, marketId, amount, clock)` → returns promise |
| Repay | `alpha_lending::repay<T>` | `[coinType]` | `(protocol, positionCap, marketId, coin, clock)` |

### Promise pattern

AlphaLend uses a "promise" pattern for withdraw and borrow — the Move call returns a promise object, then you call `fulfill_promise_SUI` (for SUI) or `fulfill_promise<T>` (for other coins) to get the actual `Coin<T>` object. All within the same PTB.

### Position discovery

Users have a `PositionCap` owned object (type: `{FIRST_PACKAGE_ID}::position::PositionCap`). Discovered via:
```typescript
client.getOwnedObjects({
  owner: address,
  filter: { StructType: ALPHALEND.POSITION_CAP_TYPE },
});
```

If no PositionCap exists, create one in the first supply transaction (same as Suilend obligation pattern).

### Pyth oracle requirement

Withdraw and borrow require Pyth price updates before execution. Use `@pythnetwork/pyth-sui-js` or build price update calls directly. NAVI already has oracle update patterns we can reference.

### Market discovery

Markets are stored in `MARKETS_TABLE_ID`. Each market has:
- `marketId` (u64)
- `coinType` (the asset)
- `supplyApr` / `borrowApr`
- `ltv` / `liquidationThreshold`
- `totalSupply` / `totalBorrow`
- `xtokenRatio` (for supply amounts)

Read via `getObject(PROTOCOL_ID)` → `fields.markets` or use `devInspect` getter.

### Active markets to verify

Must query `getAllMarkets()` on mainnet to confirm:
- SUI market (expected: marketId 1)
- USDC market (expected: marketId 3)
- BTC (wBTC LayerZero) market
- ETH (wETH) market

---

## File Changes

### New files

| File | Description |
|------|-------------|
| `packages/sdk/src/protocols/alphalend.ts` | AlphaLend protocol layer — direct `moveCall()` |
| `packages/sdk/src/adapters/alphalend.ts` | AlphaLend adapter implementing `LendingAdapter` |

### Modified files — SDK

| File | Changes |
|------|---------|
| `packages/sdk/src/constants.ts` | Update BTC coin type to wBTC LayerZero. Add AlphaLend constants. |
| `packages/sdk/src/adapters/navi.ts` | Expand `supportedAssets` to include SUI, ETH (not just `STABLE_ASSETS`). |
| `packages/sdk/src/protocols/navi.ts` | Support SUI/ETH in `getPool()`, `getRates()`, `getPositions()`, `buildSaveTx()`, etc. (pool lookup by asset, not just StableAsset). |
| `packages/sdk/src/adapters/suilend.ts` | Expand `supportedAssets` to include SUI, ETH. `findReserve()` already resolves them. |
| `packages/sdk/src/adapters/registry.ts` | Register AlphaLend adapter. |
| `packages/sdk/src/portfolio.ts` | Add earning state: `earning?: boolean`, `earningProtocol?: string`, `earningApy?: number` to `StoredPosition`. |
| `packages/sdk/src/t2000.ts` | Add `investEarn()`, `investUnearn()`. Update `investSell()` to auto-withdraw from lending. Add borrow guard to `borrow()` and `maxBorrow()`. |
| `packages/sdk/src/errors.ts` | Add `ALPHALEND_ERROR`, `INVEST_ALREADY_EARNING`, `INVEST_NOT_EARNING`, `BORROW_GUARD_INVESTMENT` error codes. |
| `packages/sdk/src/index.ts` | Export new methods and types. |
| `packages/sdk/src/utils/format.ts` | Update `formatAssetAmount` if BTC symbol changes. |

### Modified files — CLI

| File | Changes |
|------|---------|
| `packages/cli/src/commands/invest.ts` | Add `invest earn` and `invest unearn` subcommands. |
| `packages/cli/src/commands/portfolio.ts` | Show yield APY column when position is earning. |
| `packages/cli/src/commands/borrow.ts` | Show clearer error when borrow guard triggers. |

### Modified files — MCP

| File | Changes |
|------|---------|
| `packages/mcp/src/tools/invest.ts` | Add `invest_earn` and `invest_unearn` actions to `t2000_invest` tool. |
| `packages/mcp/src/tools/portfolio.ts` | Include earning state in portfolio response. |
| `packages/mcp/src/prompts/investment-strategy.ts` | Update to mention yield optimization. |

### Modified files — Docs, Skills, Marketing

| File | Changes |
|------|---------|
| `README.md` | Add AlphaLend to protocol list. Update lending protocol count (2→3). BTC coin type note. |
| `packages/sdk/README.md` | Add `investEarn()` / `investUnearn()` to API reference. AlphaLend examples. |
| `packages/cli/README.md` | Add `invest earn` / `invest unearn` command examples. Updated portfolio output. |
| `packages/mcp/README.md` | Update tool descriptions for invest actions. |
| `PRODUCT_FACTS.md` | Version bump. AlphaLend protocol. New commands. BTC type update. |
| `CLI_UX_SPEC.md` | Add `invest earn` / `invest unearn` output specs. Updated portfolio with yield column. |
| `apps/web/app/page.tsx` | Update comparison table — add AlphaLend. |
| `apps/web/app/docs/page.tsx` | Add `invest earn` / `invest unearn` commands. v0.15.0 changelog. |
| `apps/web/app/invest/page.tsx` | Add yield section — earning on invested assets. |
| `apps/web/app/demo/demoData.ts` | Add invest earn demo flow. |
| `t2000-skills/skills/t2000-invest/SKILL.md` | Add `invest earn` / `invest unearn` commands. |
| `t2000-skills/skills/t2000-mcp/SKILL.md` | Update tool descriptions. |
| `marketing/marketing-plan.md` | Add yield on investments launch tweet. |
| `spec/phase17-investment-build-plan.md` | Mark 17c items complete. |
| `spec/t2000-roadmap-v2.md` | Update 17c status. |

### Modified files — Tests

| File | Changes |
|------|---------|
| `packages/sdk/src/__tests__/` | AlphaLend adapter unit tests. Invest earn/unearn unit tests. Borrow guard unit tests. |
| `scripts/test-invest.ts` | Add invest earn/unearn integration tests. |
| `scripts/cli/test-invest.sh` | Add CLI invest earn/unearn tests. |
| `scripts/test-navi.ts` | Update for expanded assets (SUI lending). |

---

## Task List

### Phase 17c.0 — Prerequisite: wBTC Migration

- [ ] 17c.0a Update `SUPPORTED_ASSETS.BTC.type` to `0x0041f9f9344cac094454cd574e333c4fdb132d7bcc9379bcd4aab485b2a63942::wbtc::WBTC`
- [ ] 17c.0b Verify Cetus Aggregator v3 routing for new wBTC type (USDC↔wBTC)
- [ ] 17c.0c Verify `t2000 invest buy 1 BTC` works with new coin type
- [ ] 17c.0d Update any hardcoded BTC references in tests or docs

### Phase 17c.1 — AlphaLend Protocol Layer (contract-first)

- [ ] 17c.1a Create `packages/sdk/src/protocols/alphalend.ts`
  - AlphaLend constants (package IDs, protocol ID, market table)
  - Market discovery: read on-chain market data (coin types, rates, LTVs)
  - Position discovery: find user's `PositionCap` via `getOwnedObjects`
  - Build supply tx: `alpha_lending::add_collateral`
  - Build withdraw tx: `alpha_lending::remove_collateral` + `fulfill_promise`
  - Build borrow tx: `alpha_lending::borrow` + `fulfill_promise`
  - Build repay tx: `alpha_lending::repay`
  - Create position: `alpha_lending::create_position`
  - Pyth oracle price updates (required before withdraw/borrow)
  - Health factor calculation from position data
- [ ] 17c.1b Create `packages/sdk/src/adapters/alphalend.ts`
  - Implement `LendingAdapter` interface
  - `supportedAssets`: SUI, BTC (wBTC LayerZero), ETH, USDC, USDT
  - `supportsSameAssetBorrow`: determine from protocol (test on mainnet)
  - Map all `LendingAdapter` methods to protocol layer
  - Export `descriptor` for indexer
- [ ] 17c.1c Register AlphaLend in adapter registry (`registry.ts`)
- [ ] 17c.1d Unit tests for AlphaLend adapter
- [ ] 17c.1e Integration test: supply USDC to AlphaLend, check positions, withdraw

### Phase 17c.2 — Expand NAVI + Suilend for Investment Assets

- [ ] 17c.2a NAVI: expand `supportedAssets` from `STABLE_ASSETS` to include SUI, ETH
- [ ] 17c.2b NAVI protocol layer: update `getPool()` to handle non-stablecoin assets
  - Pool lookup: NAVI pools API returns pools by coin type — need to match SUI/ETH
  - Rates: `currentSupplyRate` / `currentBorrowRate` already generic
  - Positions: `get_user_state` already returns all assets by `asset_id`
  - Build save/withdraw tx: same `entry_deposit` / `withdraw_v2` — just different type args
- [ ] 17c.2c NAVI: verify SUI and ETH lending pools exist on mainnet
- [ ] 17c.2d Suilend: expand `supportedAssets` to include SUI, ETH
- [ ] 17c.2e Suilend: verify SUI and ETH reserves exist on mainnet
- [ ] 17c.2f Integration test: deposit SUI into NAVI, check rates, withdraw
- [ ] 17c.2g Integration test: deposit SUI into Suilend, check rates, withdraw

### Phase 17c.3 — Portfolio Earning State

- [ ] 17c.3a Add earning fields to `StoredPosition` in `portfolio.ts`:
  ```typescript
  earning?: boolean;
  earningProtocol?: string;  // 'navi' | 'suilend' | 'alphalend'
  earningApy?: number;
  ```
- [ ] 17c.3b Add `recordEarn()` method to `PortfolioManager`: sets earning state
- [ ] 17c.3c Add `recordUnearn()` method: clears earning state
- [ ] 17c.3d `getPortfolio()`: if position is earning, fetch live APY from protocol
- [ ] 17c.3e Unit tests for portfolio earning state

### Phase 17c.4 — `investEarn` / `investUnearn` SDK Methods

- [ ] 17c.4a `T2000.investEarn(asset)`:
  1. Validate position exists in portfolio (not empty)
  2. Validate position is not already earning
  3. Query rates from all lending protocols for this asset
  4. Pick best APY protocol
  5. Build deposit tx (adapter.buildSaveTx)
  6. Execute, record earning state
  7. Return: `{ protocol, apy, asset, tx }`
- [ ] 17c.4b `T2000.investUnearn(asset)`:
  1. Validate position is currently earning
  2. Build withdraw tx from earning protocol
  3. Execute, clear earning state
  4. Return: `{ protocol, asset, amount, tx }`
- [ ] 17c.4c Update `T2000.investSell()`: if asset is earning, auto-unearn first
  - Withdraw from lending → swap to USDC → update portfolio
  - Single compound transaction if possible (composable PTB)
- [ ] 17c.4d Add error codes: `INVEST_ALREADY_EARNING`, `INVEST_NOT_EARNING`
- [ ] 17c.4e Unit tests for investEarn / investUnearn
- [ ] 17c.4f Integration test: invest buy → invest earn → portfolio (shows APY) → invest unearn → invest sell

### Phase 17c.5 — Borrow Guard

- [ ] 17c.5a In `T2000.borrow()`: calculate savings-only capacity
  - Get all positions from lending protocols
  - Filter: only count stablecoin supplies (USDC, USDT, USDe, USDsui)
  - Exclude: any SUI, BTC, ETH supplies (investment collateral)
  - Cap borrow at savings-only capacity
- [ ] 17c.5b In `T2000.maxBorrow()`: same filter
- [ ] 17c.5c Add `BORROW_GUARD_INVESTMENT` error: "Cannot borrow against investment collateral. Only savings deposits count as borrowable collateral."
- [ ] 17c.5d `t2000 health`: clarify which collateral is borrowable vs locked
- [ ] 17c.5e Unit tests for borrow guard
- [ ] 17c.5f Integration test: invest earn SUI → try borrow → should only allow savings-based capacity

### Phase 17c.6 — CLI Commands

- [ ] 17c.6a `t2000 invest earn <asset>` — deposit invested asset into best-rate protocol
- [ ] 17c.6b `t2000 invest unearn <asset>` — withdraw from lending, keep in portfolio
- [ ] 17c.6c Update `t2000 portfolio` output:
  ```
  Investment Portfolio

  ──────────────────────────────────────
  SUI:  105.26    Avg: $0.95    Now: $0.97    +$2.10 (+2.1%)    5.2% APY (AlphaLend)
  BTC:  0.00720000    Avg: $69444    Now: $70100    +$4.72 (+0.9%)    —
  ──────────────────────────────────────
  ```
- [ ] 17c.6d Update `t2000 invest sell` to show auto-withdraw messaging
- [ ] 17c.6e Update borrow error message for investment guard

### Phase 17c.7 — MCP Tools + Prompts

- [ ] 17c.7a Update `t2000_invest` tool: add `earn` and `unearn` actions
- [ ] 17c.7b Update `t2000_portfolio` tool: include earning state in response
- [ ] 17c.7c Update `investment-strategy` prompt: mention yield optimization
- [ ] 17c.7d Update `savings-optimizer` prompt: mention AlphaLend as third protocol

### Phase 17c.8 — Docs, Skills, Marketing

- [ ] 17c.8a Update `README.md` — AlphaLend, lending protocol count, BTC type
- [ ] 17c.8b Update `packages/sdk/README.md` — `investEarn()`, `investUnearn()`, AlphaLend
- [ ] 17c.8c Update `packages/cli/README.md` — new commands, portfolio output
- [ ] 17c.8d Update `packages/mcp/README.md` — tool updates
- [ ] 17c.8e Update `PRODUCT_FACTS.md` — version, new protocol, commands
- [ ] 17c.8f Update `CLI_UX_SPEC.md` — `invest earn` / `invest unearn` output specs
- [ ] 17c.8g Update `apps/web/app/docs/page.tsx` — new commands, changelog
- [ ] 17c.8h Update `apps/web/app/invest/page.tsx` — yield section
- [ ] 17c.8i Update `apps/web/app/demo/demoData.ts` — invest earn demo
- [ ] 17c.8j Update `t2000-skills/skills/t2000-invest/SKILL.md`
- [ ] 17c.8k Update `marketing/marketing-plan.md` — yield launch tweet
- [ ] 17c.8l Mark 17c complete in `spec/phase17-investment-build-plan.md`
- [ ] 17c.8m Update `spec/t2000-roadmap-v2.md`

### Phase 17c.9 — Release

- [ ] 17c.9a Version bump to v0.15.0 (SDK, CLI, MCP)
- [ ] 17c.9b Build all packages (`npm run build` × 3)
- [ ] 17c.9c Run unit tests (`npx vitest run`)
- [ ] 17c.9d Run SDK integration tests (`scripts/test-invest.ts`)
- [ ] 17c.9e Run CLI integration tests (`scripts/cli/test-invest.sh`)
- [ ] 17c.9f Build web app (`next build`)
- [ ] 17c.9g `npm link` CLI for local testing
- [ ] 17c.9h Git commit + push
- [ ] 17c.9i Provide npm publish commands

---

## User Flows

### Flow 1: Buy SUI, earn yield, sell

```
t2000 invest buy 100 SUI
→ ✓ Bought 105.26 SUI at $0.95
→ Invested: $100.00

t2000 invest earn SUI
→ ✓ SUI deposited into AlphaLend (5.2% APY)
→ Best rate: AlphaLend 5.2% > NAVI 4.1% > Suilend 3.8%

t2000 portfolio
  ──────────────────────────────────────
  SUI:  105.26    Avg: $0.95    Now: $0.97    +$2.10 (+2.1%)    5.2% APY (AlphaLend)
  ──────────────────────────────────────

t2000 invest sell all SUI
→ ✓ Withdrew 105.26 SUI from AlphaLend
→ ✓ Sold 105.26 SUI at $0.97
→ Proceeds: $102.10
→ Realized P&L: +$2.10
```

### Flow 2: Borrow guard

```
# User has SUI earning in NAVI (creates on-chain collateral)
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
→ ✓ Withdrew 105.26 SUI from AlphaLend
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

The locking guard checks portfolio tracked amounts, not where the asset physically sits.

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| AlphaLend protocol not accessible | Write discovery script first — query markets, confirm SUI/BTC/ETH support |
| Pyth oracle adds complexity | Reference NAVI's existing oracle pattern. Build price update helper. |
| NAVI protocol layer hardcoded for stablecoins | Budget extra time. `getPool()` and related functions need non-trivial refactoring. |
| Borrow guard math is wrong | Test: deposit SUI, try borrow, verify only savings count. Write comprehensive tests. |
| Portfolio earning state desyncs | On `getPortfolio()`, verify earning state matches on-chain (check if supply still exists in protocol). |
| wBTC migration breaks existing BTC positions | Check on-chain for existing wBTC SuiBridge balances. If users hold old wBTC, show migration guidance. |

---

## Build Order

```
17c.0  wBTC migration (prerequisite — do first, test separately)
17c.1  AlphaLend protocol + adapter (new protocol, can test independently)
17c.2  Expand NAVI + Suilend (parallel with 17c.1)
17c.3  Portfolio earning state (depends on 17c.1/17c.2 for protocol IDs)
17c.4  investEarn / investUnearn (depends on 17c.1-17c.3)
17c.5  Borrow guard (depends on 17c.4 — needs earning to test against)
17c.6  CLI commands (depends on 17c.4)
17c.7  MCP tools (parallel with 17c.6)
17c.8  Docs, skills, marketing (after code is stable)
17c.9  Release
```

Estimated: ~4-6 days

---

## Dependencies

### New npm dependency: None

Contract-first approach — all AlphaLend interaction via direct `moveCall()` to on-chain contracts. We may need `@pythnetwork/pyth-sui-js` for Pyth oracle price updates, but check if NAVI's existing oracle code can be reused first.

### On-chain dependencies

| Protocol | Status |
|----------|--------|
| AlphaLend | Live on mainnet. Package: `0xc8a5...` |
| NAVI | Already integrated. SUI/ETH pools need verification. |
| Suilend | Already integrated. SUI/ETH reserves need verification. |
| Pyth Oracle | Required by AlphaLend for withdraw/borrow. |

---

## Summary

| Metric | Before (v0.14.1) | After (v0.15.0) |
|--------|-------------------|-----------------|
| Lending protocols | 2 (NAVI, Suilend) | 3 (+ AlphaLend) |
| Savings yield sources | 2 | 3 |
| Investment yield | None | SUI, BTC, ETH via 3 protocols |
| CLI commands | ~29 | ~31 (+ invest earn, invest unearn) |
| MCP tool actions | ~19 | ~21 |
| Borrow guard | None | Investment collateral excluded |
| BTC coin type | wBTC SuiBridge | wBTC LayerZero |
