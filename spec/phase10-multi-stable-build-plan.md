# Phase 10 — Multi-Stable Support: Detailed Build Plan

**Goal:** Add suiUSDT + USDe alongside USDC. Stables-only for save/borrow — zero liquidation risk.

**Estimated total:** 2-3 days

---

## Pre-work: Research

Before writing code, verify on-chain data for each new asset:

| Question | Where to check | Why |
|----------|---------------|-----|
| suiUSDT coin type on mainnet | Sui Explorer / `0x2::coin::CoinMetadata` lookup | Needed for `SUPPORTED_ASSETS` |
| suiUSDT decimals | CoinMetadata | Amount conversion |
| USDe (Ethena) coin type on mainnet | Sui Explorer | Needed for `SUPPORTED_ASSETS` |
| USDe decimals | CoinMetadata | Amount conversion |
| NAVI pool IDs for suiUSDT | NAVI API (`/api/navi/pools`) | Check if pool exists, get reserveId |
| NAVI pool IDs for USDe | NAVI API | Check if pool exists, get reserveId |
| NAVI asset IDs for suiUSDT/USDe | NAVI API config | Needed for oracle price updates |
| Suilend reserves for suiUSDT | Suilend LendingMarket object | Check if reserve exists |
| Suilend reserves for USDe | Suilend LendingMarket object | Check if reserve exists |
| Cetus Aggregator V3 support for suiUSDT | Cetus SDK / test quote | Aggregator routes automatically, but verify |
| Cetus Aggregator V3 support for USDe | Cetus SDK / test quote | Same |

**If a protocol doesn't support an asset, we skip it for that asset** — not all protocols need to support all stables.

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
- Add `USDT` and `USDe` entries with correct coin types + decimals
- Add decimal constants: `USDT_DECIMALS`, `USDE_DECIMALS`
- Keep `USDC_DECIMALS` and `SUI_DECIMALS` unchanged

**Files touched:** `constants.ts`

### 1.2 — `packages/sdk/src/types.ts`

**Current state:** `BalanceResponse.assets` is `Record<string, number>` — already flexible enough for new assets. No change needed.

**Verify:** `SupportedAsset` type auto-updates from `keyof typeof SUPPORTED_ASSETS` — yes, it will.

### 1.3 — `packages/sdk/src/utils/format.ts`

**Current state:** `usdcToRaw()` hardcodes 6 decimals. Need a generic `stableToRaw(amount, decimals)` function.

**Changes:**
- Add `stableToRaw(amount: number, decimals: number): bigint` — generic converter
- Keep `usdcToRaw()` as a shorthand that calls `stableToRaw(amount, 6)`
- Add `rawToStable(raw: bigint, decimals: number): number` for display

**Files touched:** `utils/format.ts`, `utils/format.test.ts`

---

## Stage 2: Balance Query (2h)

### 2.1 — `packages/sdk/src/wallet/balance.ts`

**Current state:** Only queries USDC + SUI balances.

**Changes:**
- Query USDT and USDe balances in `queryBalance()` (add to `Promise.all`)
- Add to `assets` field: `{ USDC: ..., SUI: ..., USDT: ..., USDe: ... }`
- Update `available` to sum all stable balances (USDC + USDT + USDe)
- Or: keep `available` as USDC-only and add `stableBalances` field

**Design decision needed:** Should `available` mean "total stables" or "USDC only"?
- Recommendation: `available` = total stables (for "how much can I save?")
- Add `balances: { USDC: number, USDT: number, USDe: number }` for per-asset detail

**Files touched:** `wallet/balance.ts`

### 2.2 — Update `BalanceResponse` type if needed

If we add a `balances` field, update `types.ts`.

### 2.3 — Tests

- Add tests for multi-stable balance queries
- Test that `available` sums correctly
- Test zero balances for missing assets

**Files touched:** `wallet/balance.test.ts` (new or extend)

---

## Stage 3: NAVI Adapter Multi-Asset (4h)

### 3.1 — `packages/sdk/src/protocols/navi.ts`

**Current state:** `USDC_TYPE` is hardcoded. All functions use it.

**Changes needed:**
- Make pool lookup dynamic: given an asset symbol, find the matching NAVI pool
- `getRates(asset)` — already accepts asset string, but internally only looks up USDC pool
- `buildDepositTx` — needs correct coin type, pool/reserveId, and oracle feeds for the asset
- `buildWithdrawTx` — same
- `buildBorrowTx` / `buildRepayTx` — same
- Oracle update: needs the correct `assetId` and `feedId` for the asset

**Key data from NAVI API:**
- Each pool has `coinType`, `id` (assetId/reserveId), `contract.pool`, `token.decimals`
- Oracle feeds are per-asset in `config.oracle.feeds`

**Approach:**
- Build an `assetConfig` map: `{ USDC: { poolId, assetId, coinType, decimals }, USDT: {...}, USDe: {...} }`
- Pass asset config through to all build functions
- The NAVI API already returns all pools — just filter by coin type

**Risk:** NAVI might not have pools for USDe. Verify in pre-work. If not available, skip.

**Files touched:** `protocols/navi.ts`, `protocols/navi.test.ts`

### 3.2 — `packages/sdk/src/adapters/navi.ts`

**Changes:**
- Update `supportedAssets` from `['USDC']` to `['USDC', 'USDT', 'USDe']` (based on what NAVI supports)
- `getRates(asset)` — pass asset to protocol module
- `getPositions(address)` — return positions for all supported assets
- `buildSaveTx(address, amount, asset)` — route to correct pool
- All other methods — same pattern

**Files touched:** `adapters/navi.ts`, `adapters/navi.test.ts`

---

## Stage 4: Suilend Adapter Multi-Asset (3h)

### 4.1 — `packages/sdk/src/adapters/suilend.ts`

**Current state:** Hardcodes `USDC_TYPE`, finds USDC reserve from lending market.

**Changes needed:**
- Make reserve lookup dynamic by coin type
- `parseReserves()` already loops all reserves — just need to index by coin type
- Update `supportedAssets` to include USDT/USDe (if Suilend supports them)
- All build functions already take an `asset` param — need to resolve correct coin type

**Approach:**
- Build coin type map: `{ USDC: '0x...::usdc::USDC', USDT: '0x...::usdt::USDT', ... }`
- Lookup reserve by `normalizeStructTag(coinType)` match
- Same patterns as NAVI — verify which assets Suilend actually supports

**Risk:** Suilend may not support USDe. Verify in pre-work.

**Files touched:** `adapters/suilend.ts`, `adapters/suilend.test.ts`

---

## Stage 5: Cetus Adapter Multi-Asset (2h)

### 5.1 — `packages/sdk/src/adapters/cetus.ts`

**Current state:** `getSupportedPairs()` returns only USDC ↔ SUI.

**Changes:**
- Add pairs: USDT ↔ SUI, USDT ↔ USDC, USDe ↔ SUI, USDe ↔ USDC
- Cetus Aggregator V3 handles multi-hop routing — no pool IDs needed, just coin types
- Update `buildSwapTx` to handle new from/to coin types (amount conversion with correct decimals)

**Key point:** Cetus Aggregator V3 takes coin type strings and routes automatically. The main work is ensuring correct decimal handling for non-USDC stables.

### 5.2 — `packages/sdk/src/protocols/cetus.ts`

**Changes:**
- `buildSwapTx` may need to handle different decimal counts for input/output coins
- Currently assumes USDC (6) and SUI (9) — need to look up decimals dynamically from `SUPPORTED_ASSETS`

**Files touched:** `adapters/cetus.ts`, `protocols/cetus.ts`, `adapters/cetus.test.ts`, `protocols/cetus.test.ts`

---

## Stage 6: T2000 Class Updates (2h)

### 6.1 — `packages/sdk/src/t2000.ts`

**Current state:** Most methods check `asset !== 'USDC'` and throw. Need to expand.

**Changes:**
- `save()` — accept USDT, USDe in addition to USDC
- `withdraw()` — same
- `borrow()` — same (only for protocols that support it for that asset)
- `repay()` — same
- `swap()` — already flexible via SUPPORTED_ASSETS check, just needs the new entries
- `balance()` — update to query all stables
- `save('all')` balance check — needs to check the specific asset balance, not just USDC
- `withdraw all` — needs to check positions across all assets

**Validation changes:**
- Replace `if (asset !== 'USDC')` with `if (!(asset in SUPPORTED_ASSETS) || asset === 'SUI')`
- For save/withdraw/borrow: only allow stable assets (USDC, USDT, USDe), not SUI
- Fee calculation: `calculateFee` already takes amount, doesn't care about asset

### 6.2 — `packages/sdk/src/protocols/protocolFee.ts`

**Current state:** Fees are calculated as BPS of amount — asset-agnostic. No changes needed.

**Files touched:** `t2000.ts`

---

## Stage 7: CLI Updates (2h)

### 7.1 — `packages/cli/src/commands/balance.ts`

**Changes:**
- Display balances for all stables with non-zero balances
- Example output:
  ```
  Available:  $10.00 USDC + $5.00 USDT  (checking — spendable)
  ```
- Or simpler: Show total as sum, breakdown on request

### 7.2 — `packages/cli/src/commands/rates.ts`

**Changes:**
- Currently hardcodes `agent.allRates('USDC')`
- Show rates for each stable: USDC, USDT, USDe
- Group by asset, then by protocol

### 7.3 — `packages/cli/src/commands/save.ts`

**Already accepts `[asset]` argument.** The `asset` param already flows to `agent.save()`. No CLI change needed — just need the SDK to accept it.

### 7.4 — `packages/cli/src/commands/withdraw.ts`

**Same — `[asset]` argument already exists.** May need to update `withdraw all` to iterate across assets.

### 7.5 — `packages/cli/src/commands/earn.ts`

**Changes:**
- Show positions across all assets, not just USDC
- Display per-asset breakdowns

### 7.6 — `packages/cli/src/commands/positions.ts`

**Changes:**
- Show positions for all assets

### 7.7 — `packages/cli/src/commands/swap.ts`

**Already flexible** — takes from/to as arguments. Should just work once CetusAdapter supports new pairs.

**Files touched:** `balance.ts`, `rates.ts`, `earn.ts`, `positions.ts` (CLI)

---

## Stage 8: Tests (3h)

### 8.1 — Unit tests for new constants

- `SUPPORTED_ASSETS` has USDT and USDe entries
- Decimal values are correct
- `SupportedAsset` type includes new assets

### 8.2 — Unit tests for format utilities

- `stableToRaw()` with 6 decimals (USDC/USDT) and 8 decimals (USDe if applicable)
- `rawToStable()` inverse

### 8.3 — Adapter tests

- NAVI adapter: `supportedAssets` includes new assets
- NAVI adapter: `getRates('USDT')` returns rates
- Suilend adapter: same pattern
- Cetus adapter: `getSupportedPairs()` includes new pairs

### 8.4 — Integration tests

- `bestSaveRate('USDT')` — routes correctly across protocols
- `allPositions` with multi-asset supplies
- `withdraw all` with positions in different assets
- Balance query returns all stables

### 8.5 — Compliance tests

- Run existing adapter compliance suite — should pass automatically since we're expanding, not changing the interface

### 8.6 — CLI smoke tests (manual checklist)

```bash
t2000 balance                        # Shows USDC + USDT + USDe
t2000 rates                          # Shows rates per asset per protocol
t2000 save 1 USDT                    # Saves USDT
t2000 save 1 --protocol suilend      # Saves to specific protocol
t2000 withdraw 1 USDT                # Withdraws USDT
t2000 withdraw all                   # Withdraws all assets from all protocols
t2000 swap 1 USDT USDC               # Swaps USDT to USDC
t2000 positions                      # Shows positions across assets
t2000 earn                           # Shows earnings across assets
```

---

## Stage 9: Documentation + Skills (2h)

### 9.1 — Agent Skills

Update all SKILL.md files that reference USDC to mention multi-stable support:
- `t2000-banking`
- `t2000-earn`
- Any others that mention save/withdraw

### 9.2 — Website docs

- `apps/web/app/docs/page.tsx` — update supported assets table
- `apps/web/app/page.tsx` — update if it mentions "USDC only"

### 9.3 — Demo page

- Update demo terminal outputs if they show hardcoded USDC

### 9.4 — README files

- `packages/sdk/README.md`
- `packages/cli/README.md`
- `CONTRIBUTING-ADAPTERS.md` — update examples

---

## Stage 10: Build + Publish (1h)

### 10.1 — Version bump

- SDK: `0.7.1` → `0.8.0` (minor bump — new feature)
- CLI: `0.7.1` → `0.8.0`

### 10.2 — Build + typecheck + full test suite

```bash
pnpm --filter @t2000/sdk typecheck
pnpm --filter @t2000/sdk test
pnpm --filter @t2000/cli typecheck
pnpm --filter @t2000/sdk build
pnpm --filter @t2000/cli build
```

### 10.3 — Publish (user handles npm login)

```bash
pnpm --filter @t2000/sdk publish --access public --no-git-checks
pnpm --filter @t2000/cli publish --access public --no-git-checks
npm install -g @t2000/cli@0.8.0
```

### 10.4 — Manual CLI smoke test (see Stage 8.6)

### 10.5 — Push + verify CI

---

## Dependency Graph

```
Stage 1 (constants + types)
  ├── Stage 2 (balance query)
  ├── Stage 3 (NAVI multi-asset) ──┐
  ├── Stage 4 (Suilend multi-asset) ├── Stage 6 (T2000 class)
  └── Stage 5 (Cetus multi-asset) ──┘       │
                                         Stage 7 (CLI)
                                             │
                                         Stage 8 (tests)
                                             │
                                         Stage 9 (docs)
                                             │
                                         Stage 10 (publish)
```

Stages 2-5 can be done in parallel once Stage 1 is complete.

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| NAVI doesn't have USDT/USDe pools | Verify via API before coding. If missing, skip that asset for NAVI. |
| Suilend doesn't have USDT/USDe reserves | Same — verify on-chain. If missing, skip. |
| USDe has different decimals than expected | Check CoinMetadata on-chain before hardcoding. |
| Existing USDC tests break | Run full test suite after each stage. |
| `withdraw all` with mixed assets | Already handled — iterates protocols, each handles its own assets. |
| Fee calculation differs per asset | Fees are BPS-based on USD amount — asset-agnostic. No change needed. |

---

## What NOT to do in Phase 10

- Do NOT add volatile assets (WETH, WBTC) — that's Phase 17
- Do NOT change the fee structure
- Do NOT add new CLI commands (only update existing ones)
- Do NOT change adapter interfaces
- Do NOT touch Sentinel integration
