# Phase 10 — Multi-Stable Support: Detailed Build Plan

**Goal:** Expand the banking stack to support USDT, USDe, and USDsui alongside USDC. Stables-only for save/borrow — zero liquidation risk. Product-first UX: smart defaults, clear feedback, zero friction.

**Version bump:** `0.7.2` → `0.8.0` (minor — new feature)

**Estimated total:** 4-5 days

---

## Confirmed Protocol Support

All 4 stables are confirmed available on both lending protocols:

| Asset | Type | Decimals | NAVI | Suilend | Cetus Swap |
|-------|------|----------|------|---------|------------|
| USDC | Native (Circle) | 6 | ✅ | ✅ | ✅ |
| suiUSDT | Bridged (Wormhole) | 6 | ✅ | ✅ | ✅ |
| suiUSDe | Bridged (Ethena) | 6* | ✅ | ✅ | ✅ |
| USDsui | Native (Bridge/Stripe) | 6* | ✅ | ✅ | ✅ |

*Decimals must be verified via `CoinMetadata` on-chain during pre-work.

---

## Pre-work: On-Chain Verification (30m)

Run before writing any code. Script or manual RPC calls:

```bash
# For each new stable, fetch CoinMetadata to confirm coin type + decimals
sui client call --function coin_metadata --module coin --package 0x2 ...
```

| Data needed | Source | Purpose |
|-------------|--------|---------|
| suiUSDT full coin type (`0x...::usdt::USDT`) | Sui Explorer / RPC | `SUPPORTED_ASSETS` entry |
| suiUSDT decimals | `CoinMetadata.decimals` | Amount conversion |
| suiUSDe full coin type | Sui Explorer / RPC | `SUPPORTED_ASSETS` entry |
| suiUSDe decimals | `CoinMetadata.decimals` | Amount conversion |
| USDsui full coin type | Sui Explorer / RPC | `SUPPORTED_ASSETS` entry |
| USDsui decimals | `CoinMetadata.decimals` | Amount conversion |
| NAVI pool configs for each asset | NAVI API (`/api/navi/pools`) | Pool IDs, reserve IDs, oracle feeds |
| Suilend reserve configs for each asset | Suilend LendingMarket object | Reserve indices, coin types |
| Cetus Aggregator quote for each pair | Cetus API test call | Confirm routing works |

---

## Stage 1: SDK Constants + Types (1h)

### 1.1 — `packages/sdk/src/constants.ts`

**Current state:**
```typescript
export const SUPPORTED_ASSETS = {
  USDC: { type: '0x...::usdc::USDC', decimals: 6, symbol: 'USDC' },
  SUI:  { type: '0x2::sui::SUI', decimals: 9, symbol: 'SUI' },
} as const;
export type SupportedAsset = keyof typeof SUPPORTED_ASSETS;
```

**Changes:**
- Add `USDT`, `USDe`, and `USDsui` entries with verified coin types + decimals
- Add `StableAsset` type: all stables excluding SUI
- Add `STABLE_ASSETS` array for iteration: `['USDC', 'USDT', 'USDe', 'USDsui']`

```typescript
export const SUPPORTED_ASSETS = {
  USDC:   { type: '0x...::usdc::USDC', decimals: 6, symbol: 'USDC', displayName: 'USDC' },
  USDT:   { type: '0x...::usdt::USDT', decimals: 6, symbol: 'USDT', displayName: 'USDT' },
  USDe:   { type: '0x...::usde::USDe', decimals: 6, symbol: 'USDe', displayName: 'USDe' },
  USDsui: { type: '0x...::usdsui::USDSUI', decimals: 6, symbol: 'USDsui', displayName: 'USDsui' },
  SUI:    { type: '0x2::sui::SUI', decimals: 9, symbol: 'SUI', displayName: 'SUI' },
} as const;

export type SupportedAsset = keyof typeof SUPPORTED_ASSETS;
export type StableAsset = Exclude<SupportedAsset, 'SUI'>;
export const STABLE_ASSETS: StableAsset[] = ['USDC', 'USDT', 'USDe', 'USDsui'];
```

### 1.2 — `packages/sdk/src/utils/format.ts`

**Changes:**
- Add `stableToRaw(amount: number, decimals: number): bigint` — generic converter
- Add `rawToStable(raw: bigint, decimals: number): number` — inverse
- Keep `usdcToRaw()` as shorthand calling `stableToRaw(amount, 6)`
- Add `getDecimals(asset: SupportedAsset): number` helper

**Files touched:** `constants.ts`, `utils/format.ts`, `utils/format.test.ts`

---

## Stage 2: Balance Query (2h)

### 2.1 — `packages/sdk/src/wallet/balance.ts`

**Current state:** Only queries USDC + SUI balances.

**Changes:**
- Query all 4 stable balances in `queryBalance()` via `Promise.all`
- Add `stables` field: `{ USDC: number, USDT: number, USDe: number, USDsui: number }`
- `available` = sum of all stable balances (total spendable dollars)
- Keep backward-compatible: `assets.USDC` still works

**Design decision — resolved:**
- `available` = total stables (answers "how many dollars do I have?")
- `stables` = per-asset breakdown (answers "which dollars?")

### 2.2 — Update `BalanceResponse` type

```typescript
interface BalanceResponse {
  available: number;        // Total stables (USDC + USDT + USDe + USDsui)
  stables: Record<StableAsset, number>;  // Per-asset breakdown
  savings: number;
  gas: number;
  gasUsd: number;
  total: number;
  assets: Record<string, number>;  // Backward-compatible
}
```

### 2.3 — Tests

- Multi-stable balance sums correctly
- Zero balances for assets not held
- `available` matches sum of `stables`
- Backward compatibility: `assets.USDC` still works

**Files touched:** `wallet/balance.ts`, `types.ts`, `wallet/balance.test.ts`

---

## Stage 3: NAVI Adapter Multi-Asset (4h)

### 3.1 — `packages/sdk/src/protocols/navi.ts`

**Changes:**
- Build dynamic `assetConfig` map from NAVI API response (keyed by symbol)
- Each entry: `{ poolId, assetId, coinType, decimals, oracleFeedId }`
- `getRates(asset)` — look up pool by asset symbol
- `buildDepositTx` — use correct coin type, pool, oracle feed for the asset
- `buildWithdrawTx`, `buildBorrowTx`, `buildRepayTx` — same pattern
- Oracle update: use correct `assetId` and `feedId` per asset

**Approach:** NAVI API already returns all pools. Parse once on `init()`, build lookup map. No hardcoded pool IDs per asset — fully dynamic from API.

### 3.2 — `packages/sdk/src/adapters/navi.ts`

**Changes:**
- `supportedAssets` → `['USDC', 'USDT', 'USDe', 'USDsui']`
- `getPositions(address)` — return positions across all 4 assets
- All build methods route to correct pool via asset param

**Files touched:** `protocols/navi.ts`, `adapters/navi.ts`, tests

---

## Stage 4: Suilend Adapter Multi-Asset (3h)

### 4.1 — `packages/sdk/src/adapters/suilend.ts`

**Changes:**
- Build coin type → reserve lookup map from parsed lending market
- `parseReserves()` already loops all reserves — index by `normalizeStructTag(coinType)`
- `supportedAssets` → `['USDC', 'USDT', 'USDe', 'USDsui']`
- All build functions resolve correct reserve by asset's coin type

**Files touched:** `adapters/suilend.ts`, tests

---

## Stage 5: Cetus Adapter Multi-Asset (2h)

### 5.1 — `packages/sdk/src/adapters/cetus.ts`

**Changes:**
- Expand `getSupportedPairs()` — add all stable pairs:
  - USDC ↔ SUI (existing)
  - USDT ↔ SUI, USDT ↔ USDC
  - USDe ↔ SUI, USDe ↔ USDC
  - USDsui ↔ SUI, USDsui ↔ USDC
  - Cross-stable: USDT ↔ USDe, USDT ↔ USDsui, USDe ↔ USDsui
- Cetus Aggregator V3 routes automatically — just need correct coin types

### 5.2 — `packages/sdk/src/protocols/cetus.ts`

**Changes:**
- Dynamic decimal lookup from `SUPPORTED_ASSETS` instead of hardcoded 6/9
- `buildSwapTx` resolves decimals for both from/to assets

**Files touched:** `adapters/cetus.ts`, `protocols/cetus.ts`, tests

---

## Stage 6: T2000 Class — Smart Save + Multi-Asset (3h)

### 6.1 — Expand asset validation

**Current:** `if (asset !== 'USDC') throw`
**New:** `if (!STABLE_ASSETS.includes(asset)) throw` for save/withdraw/borrow

### 6.2 — Smart Save (when no asset specified)

When `save(amount)` is called without an explicit asset:

1. Query balances for all stables
2. Filter to stables with sufficient balance for the requested amount
3. For each candidate, fetch best save rate via registry
4. Pick the stable with the highest rate (that the user already holds)
5. Save that asset at the best protocol

**Key rule:** No auto-swap. If the user holds 100 USDC and 50 USDT, and the best rate is USDT at 5.4% but they want to save 100, only USDC qualifies (sufficient balance). Smart save picks USDC at its best rate.

**Edge cases:**
- No stable has sufficient balance → clear error with per-asset balances shown
- Only one stable has enough → use it, mention which asset was selected
- Multiple qualify → pick highest rate, mention the choice in output

### 6.3 — Yield opportunity nudge

After a successful save, check if a better rate exists on a different asset:

```typescript
// In save() success path
const bestAcrossAll = await registry.bestSaveRateAcrossAssets(STABLE_ASSETS);
if (bestAcrossAll.apy > usedRate.apy + 0.5) {
  return { ...result, yieldHint: {
    asset: bestAcrossAll.asset,
    protocol: bestAcrossAll.protocol,
    apy: bestAcrossAll.apy,
  }};
}
```

The CLI displays this as a tip (not an action). Rebalance (Phase 11) handles the cross-asset move.

### 6.4 — Protocol+asset mismatch errors

When user specifies `--protocol navi` for an asset NAVI doesn't support:

```
Error: NAVI doesn't support USDe savings.
Available options for USDe:
  Suilend — 4.80% APY

Run: t2000 save 100 USDe --protocol suilend
```

Don't just throw — suggest the alternative.

### 6.5 — `withdraw all` across assets

`withdraw all` (no protocol) already iterates protocols. Expand to handle positions in different assets — each protocol withdraws whatever assets it holds.

### 6.6 — Registry: `bestSaveRateAcrossAssets()`

New method on `ProtocolRegistry`:

```typescript
async bestSaveRateAcrossAssets(assets: StableAsset[]): Promise<{
  asset: StableAsset;
  protocol: string;
  apy: number;
}>
```

Fetches rates for all assets across all protocols, returns the global best. Used by smart save nudge and `rates` headline.

**Files touched:** `t2000.ts`, `adapters/registry.ts`

---

## Stage 7: CLI UX Updates (3h)

### 7.1 — `balance` — Multi-stable display

```
  Available:  $150.00  (100.00 USDC + 50.00 USDT)
  Savings:    $2,000.00  (earning 5.1% avg APY)
  Gas:        0.5 SUI (~$0.50)
  ──────────────────────────────────────────
  Total:      $2,150.50
```

- Show total available in dollars
- Inline breakdown of non-zero stables in parentheses
- If only one stable held, no parenthetical breakdown needed
- `--json` returns full `stables` object

### 7.2 — `rates` — Headline + per-asset table

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

- Lead with headline: best rate across ALL stables + protocols
- Then per-asset sections (only show assets with at least one protocol)
- `--json` returns structured `{ best: {...}, rates: [...] }`

### 7.3 — `save` — Smart save feedback

When smart save auto-selects:
```
  ✓ Saved 100.00 USDT on Suilend at 5.40% APY
    (Auto-selected USDT — best rate among your holdings)

  💡 Tip: USDsui on NAVI is earning 5.60% APY
     Run `t2000 rebalance --dry-run` to see optimization options
```

When explicit asset:
```
  ✓ Saved 100.00 USDC on NAVI Protocol at 4.21% APY
```

### 7.4 — `save` / `withdraw` — Better error on protocol mismatch

```
  ✗ NAVI doesn't support USDe savings.

  Available options for USDe:
    Suilend — 4.80% APY

  Try: t2000 save 100 USDe --protocol suilend
```

### 7.5 — `earn` — Multi-asset positions

```
  SAVINGS — Earning Yield

    NAVI Protocol    100.00 USDC @ 4.21% APY
                       ~$0.0115/day · ~$0.35/month
    Suilend           50.00 USDT @ 5.40% APY
                       ~$0.0074/day · ~$0.22/month

    Total Saved       $150.00  (earning 4.61% avg APY)
```

- Group by protocol, show asset per position
- Total across all assets in dollars
- Average APY weighted by amount

### 7.6 — `positions` — Multi-asset view

Show asset alongside each position. Already has per-position asset field — just needs to display correctly when assets differ.

### 7.7 — `withdraw` — Smart feedback

```
  ✓ Withdrew 50.00 USDT from Suilend
```

`withdraw all` summary:
```
  ✓ Withdrew 100.00 USDC from NAVI Protocol
  ✓ Withdrew 50.00 USDT from Suilend
  ✓ Withdrew 25.00 USDe from NAVI Protocol

  Total withdrawn: $175.00
```

**Files touched:** `balance.ts`, `rates.ts`, `save.ts`, `withdraw.ts`, `earn.ts`, `positions.ts`

---

## Stage 8: Indexer + Stats API (2h)

Without these updates, new stable transactions won't be tracked or displayed.

### 8.1 — `apps/server/src/indexer/eventParser.ts`

**Current:** Hardcodes `asset = 'USDC'` and checks `coinType.includes('usdc')`.

**Changes:**
- Build coin type → asset symbol lookup map from `SUPPORTED_ASSETS`
- Match transaction coin types against all 4 stables
- Classify deposits/withdrawals for USDT, USDe, USDsui correctly

### 8.2 — `apps/server/src/indexer/yieldSnapshotter.ts`

**Current:** Only snapshots the NAVI USDC pool.

**Changes:**
- Snapshot yield data for all 4 stables across both protocols
- Store per-asset yield history

### 8.3 — `apps/web/app/api/stats/route.ts`

**Current:** Hardcodes `USDC_TYPE` for balance queries and fee filtering.

**Changes:**
- Query balances for all stables
- Aggregate fees across all stable assets
- Return per-asset breakdown in `byProtocol` stats

### 8.4 — `apps/web/app/stats/StatsView.tsx`

**Current:** Shows `balanceUsdc`, `totalUsdcCollected`.

**Changes:**
- Display total stables (not just USDC)
- Update labels: "Total Stables Supplied" not "Total USDC Supplied"

**Files touched:** `eventParser.ts`, `yieldSnapshotter.ts`, `stats/route.ts`, `StatsView.tsx`

---

## Stage 9: Send + Gas — Multi-Stable (1h)

### 9.1 — `packages/sdk/src/wallet/send.ts`

**Current:** Only sends USDC.

**Changes:**
- Support sending all 4 stables: `t2000 send 50 USDT to 0x...`
- Resolve correct coin type and decimals from `SUPPORTED_ASSETS`
- Coin merging logic for non-USDC stables (same pattern, different type)

### 9.2 — `packages/sdk/src/gas/autoTopUp.ts`

**Current:** Swaps USDC → SUI for auto top-up.

**Changes:**
- If agent has no USDC but holds other stables, pick the one with highest balance for the swap
- Fallback order: USDC → USDT → USDe → USDsui (prefer the most liquid)
- Log which stable was used for the top-up

### 9.3 — x402 — Decision: Keep USDC-only

x402 Payment Kit is tightly coupled to USDC (PaymentRegistry<USDC> on-chain). Multi-stable x402 requires contract changes. **Decision: x402 stays USDC-only in Phase 10.** Document this clearly.

**Changes:**
- Add comment in `packages/x402/src/client.ts`: "x402 supports USDC only — multi-stable planned for future"
- Update `packages/x402/README.md` with a note

**Files touched:** `wallet/send.ts`, `gas/autoTopUp.ts`, `x402/README.md`

---

## Stage 10: Tests (3h)

### 10.1 — Unit tests

- `SUPPORTED_ASSETS` has all 4 stables + SUI
- `StableAsset` type excludes SUI
- `stableToRaw()` / `rawToStable()` for all decimal counts
- `getDecimals()` returns correct values

### 10.2 — Adapter compliance tests

Update `compliance.test.ts`:
- Run compliance suite against all 4 assets per adapter
- Test `buildSaveTx`, `buildWithdrawTx` with USDT, USDe, USDsui (not just USDC)
- Verify `supportedAssets` matches what each adapter actually supports

### 10.3 — Smart save tests

- No asset specified + only USDC held → saves USDC at best USDC rate
- No asset specified + USDT has more balance → saves USDT at best USDT rate
- No asset specified + multiple qualify → picks highest rate
- No asset specified + none have enough → clear error with balances shown
- Yield hint included when better rate exists on different asset
- Protocol+asset mismatch → helpful error with alternatives

### 10.4 — Integration tests

- `bestSaveRateAcrossAssets()` returns global best
- `allPositions` with multi-asset supplies
- `withdraw all` with positions in different assets across protocols
- Balance query returns all stables with correct sums
- Send USDT / USDe / USDsui works
- Auto top-up fallback to non-USDC stables

### 10.5 — CLI integration tests

Update `scripts/cli/test-*.sh`:

```bash
t2000 balance                        # Shows multi-stable balances
t2000 rates                          # Shows headline + per-asset rates
t2000 save 0.1 USDT                  # Saves USDT
t2000 save 0.1 USDe --protocol navi  # Explicit asset + protocol
t2000 save 0.1 USDsui                # Saves USDsui
t2000 withdraw 0.1 USDT              # Withdraws USDT
t2000 withdraw all                   # Withdraws all assets from all protocols
t2000 swap 1 USDT USDC               # Swaps USDT to USDC
t2000 positions                      # Shows positions across assets
t2000 earn                           # Shows earnings across assets
```

---

## Stage 11: Documentation + Skills (3h)

### 11.1 — Agent Skills (all 9)

All SKILL.md files reference USDC-specific language. Update each:

| Skill | Key changes |
|-------|-------------|
| `t2000-save` | "Deposit USDC" → "Deposit stablecoins (USDC, USDT, USDe, USDsui)" |
| `t2000-withdraw` | "Withdraw USDC" → "Withdraw stablecoins" |
| `t2000-check-balance` | "available USDC" → "available stablecoins" |
| `t2000-send` | "Send USDC" → "Send stablecoins" |
| `t2000-borrow` | "Borrow USDC" → "Borrow stablecoins" |
| `t2000-repay` | "Repay USDC" → "Repay stablecoins" |
| `t2000-swap` | Add new pairs; already mentions "USDT and more" |
| `t2000-pay` | Note: x402 remains USDC-only |
| `t2000-sentinel` | "swap USDC to SUI" → may need minor update |

### 11.2 — Website pages

| File | Changes |
|------|---------|
| `apps/web/app/page.tsx` | "Send USDC" → "Send stablecoins"; "Fund with USDC" → "Fund with USDC, USDT, USDe, or USDsui"; update ACCOUNTS section |
| `apps/web/app/demo/demoData.ts` | Update demo flows to show multi-stable (balance with multiple stables, save USDT, etc.) |
| `apps/web/app/components/TerminalDemo.tsx` | Update hero terminal to show multi-stable balance |
| `apps/web/app/components/Ticker.tsx` | Add USDT/USDe/USDsui tickers |
| `apps/web/app/docs/page.tsx` | Update supported assets table |

### 11.3 — READMEs

| File | Changes |
|------|---------|
| `README.md` (root) | Update examples, supported assets |
| `packages/sdk/README.md` | Supported assets table, multi-stable examples |
| `packages/cli/README.md` | Command examples with USDT, USDe, USDsui |
| `packages/x402/README.md` | Note: USDC-only for now |
| `t2000-skills/README.md` | Update example queries |
| `CONTRIBUTING-ADAPTERS.md` | Update `supportedAssets` examples |

### 11.4 — PRODUCT_FACTS.md

Major update — this is the single source of truth:
- Supported Assets table: add all 4 stables
- CLI defaults: document smart save behavior
- Constants: add new asset constants
- Error codes: update "Not enough USDC" → asset-specific
- Treasury: mention multi-stable fee collection

### 11.5 — CLAUDE.md

Update constants section:
- Add `USDT_DECIMALS`, `USDE_DECIMALS`, `USDSUI_DECIMALS`
- Update `SUPPORTED_ASSETS` reference
- Add `StableAsset` type reference

### 11.6 — Demo scripts

Update `marketing/demo-*.sh`:
- `demo-save.sh` — add USDT save example
- `demo-full-flow.sh` — show multi-stable flow
- `demo-earn.sh` — show multi-asset earnings

### 11.7 — Marketing plan

Update `marketing/marketing-plan.md`:
- Add multi-stable launch tweet content
- Update existing tweet drafts that say "USDC" to be multi-stable aware

---

## Stage 12: Build + Publish (1h)

### 12.1 — Version bump

- SDK: `0.7.2` → `0.8.0`
- CLI: `0.7.2` → `0.8.0`

### 12.2 — Build + verify

```bash
pnpm --filter @t2000/sdk typecheck && pnpm --filter @t2000/sdk test
pnpm --filter @t2000/cli typecheck
pnpm --filter @t2000/sdk build && pnpm --filter @t2000/cli build
```

### 12.3 — Publish

```bash
pnpm --filter @t2000/sdk publish --access public --provenance
pnpm --filter @t2000/cli publish --access public --provenance
npm install -g @t2000/cli@0.8.0
```

### 12.4 — CLI smoke test (Stage 10.5 checklist)

### 12.5 — Deploy server + indexer (ECS)

After publishing SDK/CLI, deploy updated server and indexer to pick up new event parsing and yield snapshots.

### 12.6 — Push + verify CI

---

## Dependency Graph

```
Pre-work (on-chain verification)
    │
Stage 1 (constants + types + format utils)
    │
    ├── Stage 2 (balance query)          ──┐
    ├── Stage 3 (NAVI multi-asset)         │
    ├── Stage 4 (Suilend multi-asset)      ├── Stage 6 (T2000 class + smart save)
    ├── Stage 5 (Cetus multi-asset)        │        │
    └── Stage 9 (send + gas + x402)      ──┘        │
                                               Stage 7 (CLI UX)
                                                    │
                                               Stage 8 (indexer + stats)
                                                    │
                                               Stage 10 (tests)
                                                    │
                                               Stage 11 (docs + skills + marketing)
                                                    │
                                               Stage 12 (build + publish + deploy)
```

Stages 2-5 and 9 can be built in parallel once Stage 1 is complete.

---

## UX Design Principles

### Smart defaults, explicit overrides

| Command | Behavior |
|---------|----------|
| `t2000 save 100` | Smart save: picks best rate among stables you hold |
| `t2000 save 100 USDT` | Explicit: saves USDT at best USDT rate |
| `t2000 save 100 USDT --protocol navi` | Fully explicit: USDT on NAVI |
| `t2000 save 100 --protocol navi` | Explicit protocol, default asset (USDC) |

### Show, don't force

After saving, show yield opportunities on other stables as a **tip**, not an action. Cross-asset optimization is Phase 11 (`rebalance`).

### Clear errors with alternatives

Never just throw "not supported." Always show what IS available and suggest the correct command.

### Consistent dollar framing

All stables are dollars. Balance shows total dollars. Breakdown is secondary. The user thinks in dollars, not in asset tickers.

---

## Phase 11 Tie-in (Design Now, Build Later)

These design decisions in Phase 10 set up Phase 11 (Yield Optimizer):

| Phase 10 ships | Phase 11 builds on it |
|---------------|----------------------|
| `bestSaveRateAcrossAssets()` | `rebalance --dry-run` uses it to find optimization opportunities |
| `yieldHint` in save result | CLI nudge → "run `t2000 rebalance`" |
| Per-asset positions across protocols | `rebalance` knows what to move where |
| Cross-stable swap pairs in Cetus | `rebalance` can swap + move in two txs |
| `StableAsset` type | Type-safe rebalance logic |

Phase 11 adds:
- `t2000 rebalance --dry-run` — show optimization plan with swap costs + break-even
- `t2000 rebalance` — execute cross-asset moves
- Minimum yield threshold (don't swap for <0.5% difference)
- Break-even calculator (swap cost vs annual yield gain)

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| USDsui is very new (launched March 4) | Verify liquidity on Cetus before adding swap pairs. Start with save/withdraw only if liquidity is thin. |
| Different decimals than expected | Pre-work verifies via CoinMetadata. All conversion uses dynamic `getDecimals()`. |
| Existing USDC tests break | Run full test suite after each stage. No USDC behavior changes. |
| `withdraw all` with 4 assets across 2 protocols | Each adapter handles its own supported assets. Iterate adapters, each withdraws what it has. |
| Fee calculation differs per asset | Fees are BPS-based on USD amount — all stables ≈ $1, so no change needed. |
| Smart save picks wrong asset | Only picks from assets with sufficient balance. Transparent selection message in CLI output. |
| NAVI/Suilend pool doesn't exist for an asset | Adapter `init()` dynamically discovers pools. Missing pool = asset excluded from `supportedAssets` at runtime. |

---

## What NOT to do in Phase 10

- Do NOT auto-swap between stables (that's Phase 11 `rebalance`)
- Do NOT add volatile assets (WETH, WBTC) — that's Phase 17
- Do NOT change the fee structure
- Do NOT add new CLI commands (only update existing ones)
- Do NOT change adapter interfaces
- Do NOT touch Sentinel integration
- Do NOT assume decimals — always verify on-chain
