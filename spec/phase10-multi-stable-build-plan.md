# Phase 10+11 — Yield Optimizer + Multi-Stable Infrastructure

**Goal:** Agents earn the best yield across all stablecoins automatically. One command: `t2000 rebalance`. Save is open to all supported stablecoins (USDC default, backward compatible). Send stays USDC-only. Borrow/repay unlock multi-stable for rate shopping and protocol compatibility.

**Version bump:** `0.7.2` → `0.8.0` (minor — new feature)

**Estimated total:** 3 days

---

## Design Philosophy

### One clean rule

| Command | Behavior | Multi-stable? | Why |
|---------|----------|---------------|-----|
| `save` | USDC at best rate | No (rebalance optimizes) | Keep it simple, no surprises |
| `send` | USDC | No | Payments are USDC |
| `withdraw` | Whatever asset is there | Yes (must handle) | Rebalance creates non-USDC positions |
| `borrow` | Default USDC, user picks | Yes | Rate shopping, protocol compatibility |
| `repay` | Must match debt asset | Yes | Repay what you borrowed |
| `rebalance` | Cross-asset optimization | Yes — the star feature | Swap + move for best yield |
| `rates` | Display all stables | Yes (read-only) | Inform decisions |
| `balance` | Display all stables | Yes (read-only) | Show what you hold |
| `positions` | Display all assets | Yes (read-only) | Show where everything is |

### Why NOT full multi-stable

Adding USDT/USDe/USDsui to every command (save, send, gas auto-top-up) touches every file in the codebase — skills, demos, indexer, stats API, marketing, PRODUCT_FACTS — with high breaking change risk. Nobody actually wants to run `t2000 save 100 USDT` manually. They want the best yield, and `t2000 rebalance` delivers that.

---

## Confirmed Protocol Support

All 4 stables confirmed on both lending protocols:

| Asset | Coin Type | Decimals | NAVI | Suilend | Cetus |
|-------|-----------|----------|------|---------|-------|
| USDC | `0xdba3...::usdc::USDC` | 6 | ✅ | ✅ | ✅ |
| suiUSDT | `0x375f...::usdt::USDT` | 6* | ✅ | ✅ | ✅ |
| suiUSDe | `0x41d5...::sui_usde::SUI_USDE` | 6* | ✅ | ✅ | ✅ |
| USDsui | `0x44f8...::usdsui::USDSUI` | 6* | ✅ | ✅ | ✅ |

*Decimals to be confirmed via `CoinMetadata` during pre-work (likely 6 for all).

---

## Pre-work: On-Chain Verification (30m) ✅

Coin types are confirmed. Remaining verification:

| Data needed | Source | Purpose |
|-------------|--------|---------|
| ~~suiUSDT coin type~~ | ✅ `0x375f...::usdt::USDT` | Done |
| ~~suiUSDe coin type~~ | ✅ `0x41d5...::sui_usde::SUI_USDE` | Done |
| ~~USDsui coin type~~ | ✅ `0x44f8...::usdsui::USDSUI` | Done |
| ~~Confirm decimals for USDT, USDe, USDsui~~ | ✅ All 6 decimals | Done |
| ~~NAVI pool configs for each asset~~ | ✅ Dynamic via NAVI API | Done |
| ~~Suilend reserve configs for each asset~~ | ✅ Parsed from LendingMarket | Done |
| ~~Cetus Aggregator quote for each pair~~ | ✅ All stable pairs added | Done |

---

## Stage 1: SDK Constants + Types (1h) ✅

### 1.1 — `packages/sdk/src/constants.ts`

Add new assets and type helpers:

```typescript
export const SUPPORTED_ASSETS = {
  USDC: {
    type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    decimals: 6, symbol: 'USDC', displayName: 'USDC',
  },
  USDT: {
    type: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT',
    decimals: 6, symbol: 'USDT', displayName: 'suiUSDT',
  },
  USDe: {
    type: '0x41d587e5336f1c86cad50d38a7136db99333bb9bda91cea4ba69115defeb1402::sui_usde::SUI_USDE',
    decimals: 6, symbol: 'USDe', displayName: 'suiUSDe',
  },
  USDsui: {
    type: '0x44f838219cf67b058f3b37907b655f226153c18e33dfcd0da559a844fea9b1c1::usdsui::USDSUI',
    decimals: 6, symbol: 'USDsui', displayName: 'USDsui',
  },
  SUI: {
    type: '0x2::sui::SUI',
    decimals: 9, symbol: 'SUI', displayName: 'SUI',
  },
} as const;

export type SupportedAsset = keyof typeof SUPPORTED_ASSETS;
export type StableAsset = Exclude<SupportedAsset, 'SUI'>;
export const STABLE_ASSETS: StableAsset[] = ['USDC', 'USDT', 'USDe', 'USDsui'];
```

**Note:** USDe uses module `sui_usde` and struct `SUI_USDE` (not `usde::USDe`). The `symbol` key (`'USDe'`) is what CLI/SDK uses internally; the `type` string is what goes on-chain.

### 1.2 — `packages/sdk/src/utils/format.ts`

- Add `stableToRaw(amount: number, decimals: number): bigint`
- Add `rawToStable(raw: bigint, decimals: number): number`
- Add `getDecimals(asset: SupportedAsset): number`
- Keep `usdcToRaw()` as shorthand

**Files touched:** `constants.ts`, `utils/format.ts`, `utils/format.test.ts`

---

## Stage 2: Adapter Infrastructure — Multi-Asset (6h) ✅

Internal-only: adapters learn about all 4 stables. No user-facing command changes yet.

### 2.1 — NAVI Adapter (`protocols/navi.ts`, `adapters/navi.ts`)

- Build dynamic `assetConfig` map from NAVI API response (keyed by symbol)
- Each entry: `{ poolId, assetId, coinType, decimals, oracleFeedId }`
- All build methods (deposit, withdraw, borrow, repay) route to correct pool via asset param
- `supportedAssets` → `['USDC', 'USDT', 'USDe', 'USDsui']`
- `getPositions(address)` returns positions across all 4 assets
- Oracle update uses correct per-asset `assetId` and `feedId`

### 2.2 — Suilend Adapter (`adapters/suilend.ts`)

- Build coin type → reserve lookup map from parsed lending market
- `parseReserves()` already loops all reserves — index by `normalizeStructTag(coinType)`
- `supportedAssets` → `['USDC', 'USDT', 'USDe', 'USDsui']`
- All build functions resolve correct reserve by asset's coin type

### 2.3 — Cetus Adapter (`adapters/cetus.ts`, `protocols/cetus.ts`)

- Expand `getSupportedPairs()` with all stable pairs:
  - USDC ↔ SUI (existing)
  - USDT ↔ SUI, USDT ↔ USDC
  - USDe ↔ SUI, USDe ↔ USDC
  - USDsui ↔ SUI, USDsui ↔ USDC
  - Cross-stable: USDT ↔ USDe, USDT ↔ USDsui, USDe ↔ USDsui
- Dynamic decimal lookup from `SUPPORTED_ASSETS` instead of hardcoded 6/9

### 2.4 — Registry: `bestSaveRateAcrossAssets()`

New method on `ProtocolRegistry`:

```typescript
async bestSaveRateAcrossAssets(assets: StableAsset[]): Promise<{
  asset: StableAsset;
  protocol: string;
  apy: number;
}>
```

Fetches rates for all assets across all protocols, returns the global best. Used by `rates` headline and `rebalance`.

**Files touched:** `protocols/navi.ts`, `adapters/navi.ts`, `adapters/suilend.ts`, `adapters/cetus.ts`, `protocols/cetus.ts`, `adapters/registry.ts`, tests

---

## Stage 3: Balance + Display — Multi-Asset (2h) ✅

Read-only: show what the user holds across all stables. No behavioral changes.

### 3.1 — Balance query (`wallet/balance.ts`)

- Query all 4 stable balances via `Promise.all`
- Add `stables` field: `Record<StableAsset, number>`
- `available` = sum of all stables (total spendable dollars)
- Backward-compatible: `assets.USDC` still works

### 3.2 — `BalanceResponse` type update

```typescript
interface BalanceResponse {
  available: number;                      // Total stables
  stables: Record<StableAsset, number>;   // Per-asset breakdown
  savings: number;
  gas: number;
  gasUsd: number;
  total: number;
  assets: Record<string, number>;         // Backward-compatible
}
```

### 3.3 — CLI `balance` display

```
  Available:  $150.00  (100.00 USDC + 50.00 USDT)
  Savings:    $2,000.00  (earning 5.1% avg APY)
  Gas:        0.5 SUI (~$0.50)
  ──────────────────────────────────────────
  Total:      $2,150.50
```

- Inline breakdown of non-zero stables in parentheses
- If only one stable held, no parenthetical needed

### 3.4 — CLI `rates` display

```
  ⭐ Best yield: 5.40% APY — USDT on Suilend

  USDC Rates
    NAVI Protocol    Save 4.21%    Borrow 6.85%
    Suilend          Save 3.90%    Borrow —

  USDT Rates
    NAVI Protocol    Save 4.80%    Borrow 7.10%
    Suilend          Save 5.40%    Borrow —

  USDe Rates
    ...

  USDsui Rates
    ...
```

- Lead with headline: best rate across ALL stables
- Then per-asset sections (only show assets with at least one protocol)

### 3.5 — CLI `positions` + `earn` display

Show asset alongside each position. Positions and earn already have per-position asset fields — display correctly when assets differ.

```
  SAVINGS — Earning Yield

    NAVI Protocol    100.00 USDC @ 4.21% APY
    Suilend          500.00 USDT @ 5.40% APY

    Total Saved      $600.00  (earning 5.20% avg APY)
```

**Files touched:** `wallet/balance.ts`, `types.ts`, CLI: `balance.ts`, `rates.ts`, `positions.ts`, `earn.ts`

---

## Stage 4: Borrow + Repay — Multi-Stable (2h) ✅

Unlock the `[asset]` parameter for borrow/repay. The adapter work is done in Stage 2.

### 4.1 — SDK: Remove USDC gate

**Current:** `if (asset !== 'USDC') throw 'ASSET_NOT_SUPPORTED'`
**New:** `if (!STABLE_ASSETS.includes(asset)) throw 'ASSET_NOT_SUPPORTED'`

Applies to: `borrow()`, `repay()`

### 4.2 — Protocol mismatch errors

When user specifies `--protocol suilend` for borrow but Suilend doesn't support borrow for that asset:

```
  ✗ Suilend doesn't support USDT borrowing.

  Available options for USDT borrow:
    NAVI Protocol — 7.10% APR

  Try: t2000 borrow 100 USDT --protocol navi
```

### 4.3 — CLI: Borrow rate shopping in `rates`

The `rates` display (Stage 3.4) already shows borrow rates per asset per protocol. Users can see which asset has the cheapest borrow rate before running `t2000 borrow`.

### 4.4 — Withdraw: Handle any asset

`withdraw` already accepts `[asset]` — remove the USDC gate so it can pull back whatever rebalance or borrow put there. `withdraw all` iterates protocols, each withdraws all its assets.

**Files touched:** `t2000.ts` (validation), CLI: `borrow.ts`, `repay.ts`, `withdraw.ts`

---

## Stage 5: Rebalance — The Star Feature (4h) ✅

### 5.1 — SDK: `rebalance()` method

```typescript
interface RebalanceOpportunity {
  from: { protocol: string; asset: StableAsset; amount: number; apy: number };
  to: { protocol: string; asset: StableAsset; apy: number };
  estimatedSwapCost: number;    // In USD
  annualGain: number;           // Additional yield per year
  breakEvenDays: number;        // Days to recover swap cost
}

interface RebalanceResult {
  opportunities: RebalanceOpportunity[];
  executed: boolean;
  transactions: string[];       // Tx digests
}

async rebalance(options?: { dryRun?: boolean; minYieldDiff?: number }): Promise<RebalanceResult>
```

**Logic:**
1. Fetch all positions across all protocols and assets
2. Fetch all rates across all stables and protocols
3. For each position, check if a better rate exists (same or different asset)
4. Filter: only suggest moves where `annualGain > minYieldDiff` (default 0.5%)
5. For cross-asset moves: quote swap on Cetus, calculate swap cost
6. Calculate break-even: `swapCost / (annualGain / 365)`
7. Filter: only suggest if break-even < 30 days
8. If `dryRun`: return opportunities without executing
9. If executing: withdraw → swap (if cross-asset) → deposit, sequentially

**Same-asset rebalance** (move USDC from NAVI to Suilend): no swap needed, just withdraw + deposit. Zero cost, pure gain.

**Cross-asset rebalance** (swap USDC to USDT, deposit on Suilend): two transactions, swap cost factored in.

### 5.2 — CLI: `t2000 rebalance`

```bash
t2000 rebalance --dry-run
```

```
  Yield Optimization — Dry Run

  1. Move 1,000.00 USDC from NAVI (4.21%) → Suilend USDC (4.90%)
     No swap needed | Annual gain: +$6.90

  2. Move 500.00 USDC from Suilend (4.90%) → swap to USDT → Suilend USDT (5.40%)
     Swap cost: ~$0.15 | Break-even: 11 days | Annual gain: +$5.00

  Total potential gain: +$11.90/year

  Run `t2000 rebalance` to execute.
```

```bash
t2000 rebalance
```

```
  ✓ Moved 1,000.00 USDC from NAVI → Suilend (4.90% APY)
  ✓ Swapped 500.00 USDC → 499.85 USDT via Cetus
  ✓ Saved 499.85 USDT on Suilend (5.40% APY)

  Optimization complete. Estimated annual gain: +$11.90
```

### 5.3 — Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--dry-run` | Preview without executing | false |
| `--min-yield` | Minimum APY difference to act on | 0.5% |
| `--max-break-even` | Max break-even days for cross-asset | 30 |
| `--json` | Machine-readable output | false |

### 5.4 — Safety guardrails

- Never rebalance if health factor would drop below 1.5 (for accounts with borrows)
- Confirm prompt for humans (skipped with `--yes` flag for agents)
- Transaction simulation before every sign
- If any step fails, stop and report (don't continue with partial state)

**Files touched:** `t2000.ts`, `adapters/registry.ts`, CLI: new `rebalance.ts` command

---

## Stage 6: Tests (3h) ✅

### 6.1 — Unit tests ✅

- ✅ `SUPPORTED_ASSETS` has all 4 stables + SUI
- ✅ `StableAsset` type excludes SUI
- ✅ `stableToRaw()` / `rawToStable()` for all decimal counts
- ✅ `getDecimals()` returns correct values

### 6.2 — Adapter compliance tests ✅

- ✅ Run compliance suite against all 4 assets per adapter
- ✅ Test `buildBorrowTx`, `buildRepayTx` with USDT, USDe, USDsui
- ✅ Verify `supportedAssets` matches what each adapter actually supports

### 6.3 — Rebalance tests ✅

- ✅ Same-asset rebalance (USDC NAVI → USDC Suilend): no swap, pure gain
- ✅ Cross-asset rebalance (USDC → USDT): swap cost + break-even calculated
- ✅ Dry run returns opportunities without executing
- ✅ Skips opportunities below `minYieldDiff` threshold
- ✅ Skips cross-asset moves with break-even > 30 days
- ✅ Handles empty positions (nothing to rebalance)
- ✅ Handles single position (only cross-protocol/cross-asset)
- ✅ Health factor check prevents unsafe rebalance with active borrows

### 6.4 — Borrow multi-stable tests ✅

- ✅ `borrow(100, 'USDT')` works on NAVI
- ✅ `borrow(100, 'USDe')` works on NAVI
- ✅ `repay(100, 'USDT')` repays correct asset
- ✅ Protocol mismatch returns helpful error with alternatives
- ✅ Backward compatible: `borrow(100)` defaults to USDC

### 6.5 — Integration tests ✅

- ✅ `bestSaveRateAcrossAssets()` returns global best
- ✅ `allPositions` with multi-asset supplies
- ✅ `withdraw all` with positions in different assets across protocols
- ✅ Balance query returns all stables with correct sums
- ✅ `allRates` returns rates for all assets

### 6.6 — CLI integration tests ✅

Updated `scripts/cli/test-*.sh` + new `test-rebalance.sh` + `test-borrow-multi.sh`:

```bash
t2000 balance                           # ✅ Shows multi-stable balances
t2000 rates                             # ✅ Shows headline + per-asset rates
t2000 borrow 0.1 USDT --protocol navi   # ✅ Borrows USDT
t2000 repay 0.1 USDT --protocol navi    # ✅ Repays USDT
t2000 rebalance --dry-run               # ✅ Shows opportunities
t2000 positions                         # ✅ Shows positions across assets
t2000 earn                              # ✅ Shows earnings across assets
```

---

## Stage 7: Documentation (2h) ✅

### 7.1 — Agent Skills (targeted updates) ✅

| Skill | Change | Status |
|-------|--------|--------|
| `t2000-borrow` | Add USDT, USDe, USDsui as borrowable assets | ✅ |
| `t2000-repay` | Mention matching debt asset | ✅ |
| `t2000-save` | Mention `t2000 rebalance` for optimization | ✅ |
| `t2000-check-balance` | Note: balance shows all stables | ✅ |
| Others (send, swap, pay, sentinel) | No change needed | ✅ |

### 7.2 — New Agent Skill: `t2000-rebalance` ✅

- ✅ When to use it (periodic optimization)
- ✅ `--dry-run` first, then execute
- ✅ Explain break-even and swap cost concepts
- ✅ `--min-yield` and `--max-break-even` flags

### 7.3 — READMEs ✅

| File | Changes | Status |
|------|---------|--------|
| `README.md` (root) | Add rebalance to feature list | ✅ |
| `packages/sdk/README.md` | Add `rebalance()` method, update supported assets | ✅ |
| `packages/cli/README.md` | Add `t2000 rebalance` command | ✅ |
| `CONTRIBUTING-ADAPTERS.md` | Update `supportedAssets` examples to show multi-asset | ✅ |

### 7.4 — PRODUCT_FACTS.md ✅

- ✅ Add Supported Assets table (4 stables)
- ✅ Add rebalance command + method + types
- ✅ Note borrow is multi-stable, save/send stay USDC
- ✅ Version bumped to 0.8.0
- ✅ Suilend capabilities updated (borrow, repay)
- ✅ BalanceResponse includes `stables` field

### 7.5 — CLAUDE.md ✅

- ✅ Add `StableAsset` type, `STABLE_ASSETS` array
- ✅ Add stablecoin coin types
- ✅ Add rebalance method reference

### 7.6 — Website (minimal) ✅

- ✅ `apps/web/app/page.tsx` — "Yield Optimizer" changed from "Coming soon" to "✓ Auto-rebalance across 4 stablecoins"

### 7.7 — Marketing ✅

- ✅ Draft `marketing/rebalance-tweet.md` for the rebalance feature launch

**No changes needed:** demo scripts, Ticker, TerminalDemo, indexer, stats API, x402, gas auto-top-up, marketing-plan.md (save for follow-up)

---

## Stage 8: Build + Publish (1h) ✅

### 8.1 — Version bump ✅

- ✅ SDK: `0.7.2` → `0.8.0`
- ✅ CLI: `0.7.2` → `0.8.0`

### 8.2 — Build + verify ✅

```bash
pnpm --filter @t2000/sdk typecheck && pnpm --filter @t2000/sdk test  # ✅ 344 tests pass
pnpm --filter @t2000/cli typecheck                                    # ✅ clean
pnpm --filter @t2000/server typecheck && pnpm --filter @t2000/server test  # ✅ 10 tests pass
pnpm --filter @t2000/sdk build && pnpm --filter @t2000/cli build     # ✅
```

### 8.3 — Publish

```bash
pnpm --filter @t2000/sdk publish --access public --provenance
pnpm --filter @t2000/cli publish --access public --provenance
npm install -g @t2000/cli@0.8.0
```

### 8.4 — CLI smoke test (Stage 6.6 checklist)

### 8.5 — Push + verify CI

---

## Dependency Graph

```
Pre-work (on-chain verification)
    │
Stage 1 (constants + types + format utils)
    │
    ├── Stage 2 (adapter infrastructure — all 4 stables)
    │       │
    │       ├── Stage 3 (balance + display — read-only)
    │       ├── Stage 4 (borrow + repay — unlock multi-stable)
    │       └── Stage 5 (rebalance — the star feature)
    │               │
    │           Stage 6 (tests)
    │               │
    │           Stage 7 (docs)
    │               │
    │           Stage 8 (build + publish)
```

Stages 3, 4, 5 can be built in parallel once Stage 2 is complete.

---

## What Ships

### New command
- `t2000 rebalance` / `t2000 rebalance --dry-run`

### Enhanced commands
- `t2000 borrow 100 USDT` — multi-stable borrowing
- `t2000 repay 100 USDT` — repay in borrowed asset
- `t2000 rates` — headline with best yield across all stables
- `t2000 balance` — shows all stables held
- `t2000 positions` / `t2000 earn` — multi-asset positions
- `t2000 withdraw all` — handles any asset

### Unchanged commands
- `t2000 save` — USDC at best rate (unchanged)
- `t2000 send` — USDC (unchanged)
- `t2000 swap` — works (new pairs available via Cetus)
- `t2000 sentinel` — unchanged
- `t2000 pay` — USDC only (unchanged)

---

## Example User Flow

```bash
# 1. Check rates across all stables
t2000 rates
  ⭐ Best yield: 5.40% APY — USDT on Suilend
  ...

# 2. Save USDC as usual (simple, predictable)
t2000 save 1000
  ✓ Saved 1,000.00 USDC on NAVI Protocol at 4.21% APY

# 3. Optimize with one command
t2000 rebalance --dry-run
  1. Move 1,000.00 USDC from NAVI (4.21%) → swap to USDT → Suilend (5.40%)
     Swap cost: ~$0.30 | Break-even: 9 days | Annual gain: +$11.90

t2000 rebalance
  ✓ Withdrew 1,000.00 USDC from NAVI Protocol
  ✓ Swapped 1,000.00 USDC → 999.70 USDT via Cetus
  ✓ Saved 999.70 USDT on Suilend at 5.40% APY
  Optimization complete. Estimated annual gain: +$11.90

# 4. Check positions — everything is visible
t2000 positions
  Saving   999.70 USDT on Suilend @ 5.40% APY

# 5. Borrow cheaply
t2000 borrow 100 USDT --protocol navi
  ✓ Borrowed 100.00 USDT from NAVI Protocol at 7.10% APR

# 6. Withdraw everything when done
t2000 withdraw all
  ✓ Withdrew 999.70 USDT from Suilend
  ✓ Repaid 100.00 USDT to NAVI Protocol
  Total withdrawn: $999.70
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| USDsui is very new (launched March 4) | Verified — deep liquidity on Cetus. Swap pairs active. |
| Cross-asset rebalance: swap succeeds, deposit fails | Stop on failure, report state. User has the stable, just not deposited. |
| Rebalance during volatile period | Break-even filter (30 day max) and min yield diff (0.5%) prevent bad trades. |
| Different decimals than expected | Pre-work verifies via CoinMetadata. Dynamic `getDecimals()`. |
| Existing USDC tests break | Core USDC flows are untouched. Full test suite after each stage. |
| Health factor risk with active borrows | Rebalance checks health factor, refuses if < 1.5 after move. |

---

## Edge Cases to Handle ✅

### `withdraw all` after rebalance ✅
If rebalance moved USDC → USDT on Suilend, `withdraw all` must iterate all adapters AND all assets per adapter. ~~Currently `withdrawAllProtocols()` filters by a single asset.~~ **Fixed:** `withdrawAllProtocols()` now iterates every supply across all adapters, ignoring the `_asset` param.

### `withdraw` with explicit asset but no `--protocol` ✅
User runs `t2000 withdraw 100 USDT` without specifying protocol. `resolveLending` filters by `supportedAssets.includes('USDT')` + `capabilities.includes('withdraw')` and returns the first match. Includes helpful error with alternatives if none found.

### Coin merging for non-USDC stables ✅
All `buildSaveTx`, `buildRepayTx` in both NAVI and Suilend use `assetInfo.type` from `SUPPORTED_ASSETS[asset]` — not hardcoded USDC type — when calling `fetchCoins`/`fetchAllCoins`.

### Rebalance with zero positions ✅
`t2000 rebalance --dry-run` when user has no savings → throws `NO_COLLATERAL`: "No savings positions to rebalance. Use `t2000 save <amount>` first."

### Rebalance suggests same protocol, different asset ✅
USDC on NAVI at 4.2% → USDT on NAVI at 4.8%. The early-exit guard only triggers when **both** protocol AND asset match. When only asset differs, execution continues through withdraw + swap + deposit steps on the same protocol.

### Borrow without collateral ✅
User tries `t2000 borrow 100 USDT` with no savings → throws `NO_COLLATERAL`: "No collateral deposited. Save first with `t2000 save <amount>`."

### `rates` with no protocol support for an asset ✅
Individual adapters may throw for unsupported assets, but `registry.allRatesAcrossAssets()` wraps each call in try-catch and skips failures. NAVI's `getRates()` also uses `if (!pool) continue` to skip missing pools gracefully.

### USDe module name mismatch ✅
NAVI uses `matchesCoinType()` with `.toLowerCase()` suffix comparison. Suilend uses `normalizeStructTag()` from `@mysten/sui/utils`. Both handle `sui_usde::SUI_USDE` correctly.

---

## What NOT to do

- Do NOT add multi-stable to `save` (rebalance handles optimization)
- Do NOT add multi-stable to `send` (payments are USDC)
- Do NOT change gas auto-top-up (stays USDC → SUI)
- Do NOT update x402 (stays USDC-only)
- Do NOT rewrite all demo scripts and marketing (targeted updates only)
- Do NOT add volatile assets (WETH, WBTC) — that's Phase 17
- Do NOT change adapter interfaces
- Do NOT assume decimals — verify on-chain
