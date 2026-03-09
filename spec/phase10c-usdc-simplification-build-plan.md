# Phase 10c — USDC-In, USDC-Out Simplification

**Goal:** Simplify the entire product to a USDC-only user experience. Users save USDC, `rebalance` optimizes yield across stables/protocols internally, `withdraw` always returns USDC. Remove all user-facing multi-asset complexity. Clean dead code so we stop shipping multi-asset bugs.

**Reverts/simplifies:** Phase 10 (multi-stable borrow/repay/save) and Phase 10b (open save to all assets). Keeps rebalance, internal swap, multi-protocol support, and read-only display commands.

**Version bump:** `0.8.7` → `0.9.0` (minor — breaking change to public SDK API)

**Estimated total:** 1.5 days

---

## Design Principle

**User thinks in dollars. Agent handles optimization.**

| Command | What user sees | What happens internally |
|---------|---------------|------------------------|
| `t2000 save 100` | "Saved $100, earning 4.9% APY" | Deposits USDC to best USDC rate |
| `t2000 rebalance` | "Rebalanced $100 → 5.46% APY" | Withdraws USDC, swaps to suiUSDT, deposits on NAVI |
| `t2000 withdraw 50` | "Withdrew $50 USDC" | Pulls suiUSDT from NAVI, auto-swaps back to USDC |
| `t2000 borrow 10` | "Borrowed $10 USDC" | Always USDC |
| `t2000 repay 10` | "Repaid $10 USDC" | Always USDC |
| `t2000 rates` | Shows all yields | Read-only info across all assets/protocols |
| `t2000 positions` | Shows actual holdings | Transparency — may show suiUSDT if rebalanced |

---

## What stays untouched

These work correctly and stay as-is:

| Component | Why it stays |
|-----------|-------------|
| `SUPPORTED_ASSETS` constant (all 4 stables + SUI) | Needed for internal swap/deposit/withdraw |
| `STABLE_ASSETS` constant | Needed for iterating rates in rebalance |
| NAVI adapter multi-asset methods | Rebalance deposits non-USDC on NAVI |
| Suilend adapter multi-asset methods | Rebalance may use Suilend for non-USDC |
| Cetus adapter + protocol | Swap during rebalance and auto-swap-on-withdraw |
| `rebalance()` method | The star feature — cross-asset optimization |
| `rates` CLI command | Shows all yields (educational, builds trust) |
| `positions` CLI command | Transparency into actual holdings |
| `balance` CLI command | Shows all wallet stables |
| `earnings` / `fund-status` / `earn` | Per-asset breakdown shows rebalance impact |
| `health` / `maxWithdraw` / `maxBorrow` | Already USDC-only |
| NAVI `resolvePoolSymbol` | Internal symbol resolution |
| NAVI `addOracleUpdatesForPositions` | Multi-position oracle refresh |
| `eventParser.ts` | Server-side asset classification stays |
| `yieldSnapshotter.ts` | Uses `allPositions()` — no asset param |

---

## Stage 1: SDK — Hardcode USDC in T2000 class (2h)

**File:** `packages/sdk/src/t2000.ts`

### Task 1.1: `save()` — remove `asset` param, hardcode USDC

```
BEFORE:
  async save(params: { amount: number | 'all'; asset?: string; protocol?: string })
    const asset = normalizeAsset(params.asset ?? 'USDC');
    if (!this.registry.isSupportedAsset(asset, 'save')) { ... }

AFTER:
  async save(params: { amount: number | 'all'; protocol?: string })
    const asset = 'USDC';
```

Remove: `normalizeAsset` call, `isSupportedAsset` check, `getSupportedAssets` error message.
Keep: `bestSaveRate(asset)` routing, fee collection (always USDC, always collect).

### Task 1.2: `withdraw()` — remove `asset` param, add auto-swap-to-USDC

```
BEFORE:
  async withdraw(params: { amount: number | 'all'; asset?: string; protocol?: string })
    const asset = normalizeAsset(params.asset ?? 'USDC');

AFTER:
  async withdraw(params: { amount: number | 'all'; protocol?: string })
```

**New logic for single withdraw:**
1. Get positions from the resolved adapter
2. Find the supply position (may be non-USDC from rebalance)
3. Withdraw the actual asset
4. If non-USDC, auto-swap back to USDC via Cetus
5. Return total USDC received

### Task 1.3: `withdrawAllProtocols()` — add auto-swap-to-USDC

After each position withdrawal, if the asset is non-USDC:
1. Swap the withdrawn amount back to USDC via the first available swap adapter
2. Track total USDC received across all swaps
3. If swap fails: continue, report partial success with clear message

**Error handling:** If auto-swap fails, throw with: "Withdrew $X {asset} but swap to USDC failed. Your {asset} is in your wallet. Run `t2000 swap {amount} {asset} USDC` to convert manually." — wait, we're removing the swap command. Change to: "Withdrew $X {asset} but swap to USDC failed. Your {asset} is safe in your wallet."

### Task 1.4: `borrow()` — remove `asset` param, hardcode USDC

```
BEFORE:
  async borrow(params: { amount: number; asset?: string; protocol?: string })
    const asset = normalizeAsset(params.asset ?? 'USDC');

AFTER:
  async borrow(params: { amount: number; protocol?: string })
    const asset = 'USDC';
```

Simplifies: fee always collected (USDC), no conditional `shouldCollectFee`.

### Task 1.5: `repay()` — remove `asset` param, hardcode USDC

```
BEFORE:
  async repay(params: { amount: number | 'all'; asset?: string; protocol?: string })
    const asset = normalizeAsset(params.asset ?? 'USDC');

AFTER:
  async repay(params: { amount: number | 'all'; protocol?: string })
    const asset = 'USDC';
```

### Task 1.6: `swap()` / `swapQuote()` — make private

Rename to `private _swap()` and `private _swapQuote()`, or just make them `private`.
Keep full implementation — used by `rebalance()` and `withdrawAllProtocols()` auto-swap.

### Task 1.7: `send()` — remove `asset` param (already USDC-only)

Verify `send()` is USDC-only. If it has an `asset` param, remove it.

### Task 1.8: Remove `normalizeAsset` import and all usages in T2000 class

Replace all `normalizeAsset(params.asset ?? 'USDC')` with `'USDC'`.

---

## Stage 2: SDK — Clean types and exports (30m)

### Task 2.1: `packages/sdk/src/types.ts` — simplify SaveResult

```
BEFORE:
  export interface SaveResult {
    ...
    asset: string;  // ← added in Phase 10b
    ...

AFTER:
  export interface SaveResult {
    ...
    // asset field removed — always USDC
    ...
```

### Task 2.2: `packages/sdk/src/index.ts` — remove multi-asset exports

Remove these exports:
- `normalizeAsset`
- `STABLE_ASSETS`
- `StableAsset`
- `getSwapQuote`

Keep these exports:
- `SUPPORTED_ASSETS` (useful for info display)
- `SupportedAsset` type (useful for type-safe SUPPORTED_ASSETS access)
- `SwapResult` type (returned by rebalance)

### Task 2.3: `packages/sdk/src/adapters/registry.ts` — remove user-facing validation methods

Remove:
- `isSupportedAsset(asset, capability)` — no longer called
- `getSupportedAssets(capability)` — no longer called

Keep:
- `bestSaveRate(asset)` — used by `save('USDC')`
- `bestSaveRateAcrossAssets()` — used by `rebalance()`
- `allRatesAcrossAssets()` — used by `rebalance()` and `rates` command
- `allPositions()` — used by `withdraw all` and `positions`
- `bestSwapQuote()` — used by `rebalance()` and auto-swap
- All swap adapter methods — used internally

---

## Stage 3: CLI — Simplify commands (1h)

### Task 3.1: `packages/cli/src/commands/save.ts` — remove `[asset]` argument

```
BEFORE:
  .argument('[asset]', 'Asset symbol (default: USDC)', 'USDC')
  ...
  const asset = assetStr ?? 'USDC';
  const result = await agent.save({ amount, asset, protocol: opts.protocol });
  const displayName = SUPPORTED_ASSETS[result.asset]?.displayName ?? result.asset;

AFTER:
  // No [asset] argument
  ...
  const result = await agent.save({ amount, protocol: opts.protocol });
```

Remove imports: `normalizeAsset`, `SUPPORTED_ASSETS`.
Hardcode display text: "USDC" in all messages.

### Task 3.2: `packages/cli/src/commands/withdraw.ts` — remove `[asset]` argument

```
BEFORE:
  .argument('[asset]', 'Asset to withdraw (USDC, USDT, USDe, USDsui)', 'USDC')

AFTER:
  // No [asset] argument
  const result = await agent.withdraw({ amount, protocol: opts.protocol });
```

Output always says "Withdrew $X USDC" since auto-swap ensures USDC return.

### Task 3.3: `packages/cli/src/commands/borrow.ts` — remove `[asset]` argument

```
BEFORE:
  .argument('[asset]', 'Asset to borrow (USDC, USDT, USDe, USDsui)', 'USDC')
  ...
  const normalized = normalizeAsset(asset);
  const displayName = SUPPORTED_ASSETS[normalized]?.displayName ?? asset;

AFTER:
  // No [asset] argument
  const result = await agent.borrow({ amount, protocol: opts.protocol });
  printSuccess(`Borrowed $${amount.toFixed(2)} USDC`);
```

Remove imports: `normalizeAsset`, `SUPPORTED_ASSETS`.

### Task 3.4: `packages/cli/src/commands/repay.ts` — remove `[asset]` argument

```
BEFORE:
  .argument('[asset]', 'Asset to repay (USDC, USDT, USDe, USDsui)', 'USDC')
  ...
  const normalized = normalizeAsset(asset);
  const displayName = SUPPORTED_ASSETS[normalized]?.displayName ?? asset;

AFTER:
  // No [asset] argument
  const result = await agent.repay({ amount, protocol: opts.protocol });
  printSuccess(`Repaid $${result.amount.toFixed(2)} USDC`);
```

Remove imports: `normalizeAsset`, `SUPPORTED_ASSETS`.

### Task 3.5: `packages/cli/src/commands/swap.ts` — DELETE file

Remove the file entirely. Unregister from CLI index.

### Task 3.6: `packages/cli/src/index.ts` — unregister swap command

Remove `import { registerSwap } from './commands/swap.js'` and `registerSwap(program)`.

### Task 3.7: `packages/cli/src/commands/serve.ts` — simplify API server

- Remove `asset` from `/v1/save`, `/v1/withdraw`, `/v1/borrow`, `/v1/repay` request bodies
- Remove `/v1/swap` endpoint entirely
- Remove swap from the endpoint listing printout
- Remove deposit endpoint's `asset` field (already USDC-only)

---

## Stage 4: SDK — Implement auto-swap-to-USDC on withdraw (1.5h)

This is the only **new** logic in the refactor. Everything else is removal/simplification.

### Task 4.1: Add private `_swapToUsdc()` helper in T2000 class

```typescript
private async _swapToUsdc(asset: string, amount: number): Promise<{
  usdcReceived: number;
  digest: string;
  gasCost: number;
}> {
  const swapAdapter = this.registry.listSwap()[0];
  if (!swapAdapter) throw new T2000Error('PROTOCOL_UNAVAILABLE', 'No swap adapter available');

  let swapMeta = { estimatedOut: 0, toDecimals: 0 };
  const gasResult = await executeWithGas(this.client, this.keypair, async () => {
    const built = await swapAdapter.buildSwapTx(this._address, asset, 'USDC', amount);
    swapMeta = { estimatedOut: built.estimatedOut, toDecimals: built.toDecimals };
    return built.tx;
  });

  const usdcReceived = swapMeta.estimatedOut / 10 ** swapMeta.toDecimals;
  return { usdcReceived, digest: gasResult.digest, gasCost: gasResult.gasCostSui };
}
```

### Task 4.2: Update `withdraw()` single-protocol path

After withdrawing a non-USDC position:
```typescript
const withdrawnAsset = supply.asset; // actual asset from position
// ... withdraw logic ...

if (withdrawnAsset !== 'USDC') {
  const swap = await this._swapToUsdc(withdrawnAsset, effectiveAmount);
  // return swap.usdcReceived as the amount, include swap digest
}
```

### Task 4.3: Update `withdrawAllProtocols()`

For each position withdrawn:
```typescript
if (entry.asset !== 'USDC') {
  try {
    const swap = await this._swapToUsdc(entry.asset, effectiveAmount);
    totalWithdrawn += swap.usdcReceived;
    // add swap digest to result
  } catch {
    // Non-USDC still in wallet — include in partial result
    nonUsdcInWallet.push({ asset: entry.asset, amount: effectiveAmount });
  }
} else {
  totalWithdrawn += effectiveAmount;
}
```

### Task 4.4: Update `WithdrawResult` type if needed

Consider adding `swapDigests: string[]` for transparency (withdraw tx + swap tx are separate).

### Task 4.5: Determine which position to withdraw for partial `withdraw <amount>`

When user says `withdraw 50` without `--protocol`:
1. Get all positions across all protocols
2. Find the lowest-APY position first (withdraw from worst yield first)
3. Withdraw from that position
4. If non-USDC, auto-swap to USDC

This matches the "optimize" philosophy — keep the best-yielding positions.

---

## Stage 5: Tests — update and clean (1h)

### Task 5.1: Remove multi-asset user-facing tests from `t2000.integration.test.ts`

Remove/simplify tests that:
- Test `save({ asset: 'USDT' })` — no longer possible
- Test `borrow({ asset: 'USDT' })` — no longer possible
- Test `isSupportedAsset` / `getSupportedAssets` — methods removed

Keep tests that:
- Test `rebalance()` with multi-asset internally
- Test `bestSaveRateAcrossAssets()` — used by rebalance
- Test `allPositions()` with multi-asset — used by withdraw all

### Task 5.2: Remove `normalizeAsset` tests from `format.test.ts`

Remove the `normalizeAsset` describe block. Keep `getDecimals` tests (still used internally).

### Task 5.3: Remove `isSupportedAsset` / `getSupportedAssets` tests from `registry.test.ts`

Remove the test blocks for these two methods.

### Task 5.4: Delete `scripts/cli/test-borrow-multi.sh`

This script tests borrowing USDT — no longer a user-facing feature.

### Task 5.5: Update `scripts/cli/run-all.sh`

Remove `borrow-multi` from the test suite list.

### Task 5.6: Add test for auto-swap-to-USDC on withdraw

New test in `t2000.integration.test.ts`:
- Mock: position has USDT on NAVI
- Call `withdraw({ amount: 'all' })`
- Assert: swap adapter was called with `('USDT', 'USDC', amount)`
- Assert: result amount is in USDC

### Task 5.7: Keep adapter-level multi-asset tests

These stay untouched:
- `navi.test.ts` — multi-asset getRates, buildSaveTx, etc.
- `navi.test.ts` (protocol) — resolvePoolSymbol tests
- `suilend.test.ts` — multi-asset tests
- `cetus.test.ts` — swap pair tests

These are needed because the adapter layer remains multi-asset capable.

---

## Stage 6: Documentation — update all references (1h)

### Task 6.1: Agent Skills — update 6 files

| Skill | Change |
|-------|--------|
| `t2000-save/SKILL.md` | Remove USDT/USDe/USDsui examples. Save is USDC only. Mention `rebalance` for optimization. |
| `t2000-borrow/SKILL.md` | Remove multi-asset borrow. Borrow is USDC only. |
| `t2000-repay/SKILL.md` | Remove multi-asset repay. Repay is USDC only. |
| `t2000-withdraw/SKILL.md` | Remove `[asset]` parameter. Withdraw always returns USDC. Note auto-swap. |
| `t2000-swap/SKILL.md` | DELETE — swap is no longer a user command. |
| `t2000-rebalance/SKILL.md` | Update: save is USDC-only, rebalance handles optimization. Remove "save supports all stablecoins" line. |
| `t2000-check-balance/SKILL.md` | Keep as-is — balance still shows all stables (informational). |

### Task 6.2: `PRODUCT_FACTS.md`

Update supported assets table:
- Save: USDC only (rebalance optimizes)
- Borrow: USDC only
- Repay: USDC only
- Swap: Internal only (not user-facing)
- Withdraw: USDC (auto-swaps non-USDC back)
- Rebalance: All stables (internal)

### Task 6.3: READMEs — update 3 files

| File | Change |
|------|--------|
| `README.md` (root) | Simplify to "Save USDC, earn best yield, rebalance optimizes automatically" |
| `packages/sdk/README.md` | Remove multi-asset save/borrow examples. Remove `agent.swap()`. Add note about auto-swap on withdraw. |
| `packages/cli/README.md` | Remove `[asset]` from command examples. Remove `swap` command. |

### Task 6.4: `CONTRIBUTING-ADAPTERS.md`

Keep `supportedAssets` in adapter examples — adapters are still multi-asset internally.

### Task 6.5: `CLAUDE.md`

- Remove `StableAsset` type and `STABLE_ASSETS` array from the reference (no longer exported)
- Remove `normalizeAsset` reference
- Note: save/borrow/repay are USDC-only, rebalance handles multi-stable internally

### Task 6.6: Marketing — update `marketing/rebalance-tweet.md`

Remove multi-stable borrow references. Focus on: "Save USDC → rebalance auto-optimizes across stables → withdraw USDC."

### Task 6.7: Web demo data — `apps/web/app/demo/demoData.ts`

Update demo flows:
- Remove multi-stable save/borrow demos
- Keep rebalance demo (shows internal optimization)
- Simplify to USDC-in, USDC-out story

### Task 6.8: Web page — `apps/web/app/page.tsx`

Update "Auto-rebalance across 4 stablecoins" → "Auto-optimize yield across stablecoins" (same meaning, doesn't expose the complexity).

---

## Stage 7: Spec files — archive and update (15m)

### Task 7.1: `spec/phase10-multi-stable-build-plan.md`

Add header note:
```
> **Partially reverted in Phase 10c.** User-facing multi-stable (save/borrow/repay with asset param, swap CLI)
> was removed in favor of USDC-in, USDC-out simplification. Adapter infrastructure, rebalance, and read-only
> display commands remain from this phase.
```

### Task 7.2: `spec/phase10b-open-save-build-plan.md`

Add header note:
```
> **Reverted in Phase 10c.** Open save was removed. Save is USDC-only. Rebalance handles cross-asset
> optimization internally. normalizeAsset removed from public API. Registry validation methods removed.
```

### Task 7.3: `spec/t2000-roadmap-v2.md`

Update Phase 10 description to reflect the USDC-only simplification.

---

## Stage 8: Dead code removal (30m)

### Task 8.1: `packages/sdk/src/utils/format.ts` — keep `normalizeAsset` internal

Keep the function (NAVI adapter uses it as a safety net) but do NOT export from `index.ts`.

### Task 8.2: `packages/sdk/src/constants.ts` — keep `StableAsset` and `STABLE_ASSETS` internal

Keep defined (used by registry, rebalance, rates internally) but do NOT export from `index.ts`.

### Task 8.3: Remove dead imports across CLI commands

After removing `[asset]` args, clean up unused imports of `normalizeAsset`, `SUPPORTED_ASSETS` from CLI command files.

### Task 8.4: Delete `packages/cli/src/commands/swap.ts`

File deletion.

### Task 8.5: Verify no broken imports

Run `npm run typecheck` after all removals.

---

## Stage 9: Build + Publish (30m)

### Task 9.1: Version bump

- SDK: `0.8.7` → `0.9.0` (breaking: removed `asset` param from public methods, removed `swap`)
- CLI: `0.8.7` → `0.9.0`

### Task 9.2: Build + verify

```bash
npm run typecheck        # All packages clean
npm test                 # SDK tests pass
pnpm --filter @t2000/sdk build
pnpm --filter @t2000/cli build
```

### Task 9.3: Publish

```bash
pnpm --filter @t2000/sdk publish --access public --no-git-checks
pnpm --filter @t2000/cli publish --access public --no-git-checks
npm i -g @t2000/cli@0.9.0
```

### Task 9.4: CLI smoke test

```bash
t2000 --version                    # 0.9.0
t2000 save 5                      # Saves USDC
t2000 positions                   # Shows position
t2000 rebalance --dry-run         # Shows optimization plan
t2000 rebalance                   # Executes (may swap to better yield)
t2000 withdraw all                # Returns USDC (auto-swaps if needed)
t2000 borrow 1                   # Borrows USDC
t2000 repay 1                    # Repays USDC
t2000 rates                      # Shows all asset rates
t2000 balance                    # Shows USDC + any wallet stables
```

### Task 9.5: Run full CLI test suite

```bash
source .env.local && bash scripts/cli/run-all.sh
```

### Task 9.6: Push + verify

```bash
git push origin main
```

---

## Dependency Graph

```
Stage 1 (SDK — hardcode USDC in T2000 class)
    │
    ├── Stage 2 (SDK — clean types and exports)
    │
    ├── Stage 3 (CLI — simplify commands)
    │
    └── Stage 4 (SDK — auto-swap-to-USDC on withdraw)  ← only new logic
            │
        Stage 5 (Tests — update and clean)
            │
        Stage 6 (Documentation — update all references)
            │
        Stage 7 (Spec files — archive)
            │
        Stage 8 (Dead code removal)
            │
        Stage 9 (Build + Publish)
```

Stages 1-3 can be done in parallel. Stage 4 depends on Stage 1.

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Auto-swap fails mid-withdraw | User has non-USDC in wallet | Clear error message. Non-USDC is safe, just not converted. |
| Existing non-USDC positions from previous rebalance | User can't withdraw without auto-swap working | Test thoroughly with real positions before shipping. |
| Swap slippage on large withdrawals | User receives less USDC than expected | Use existing Cetus aggregator with 3% slippage protection. |
| Rebalance creates position that can't be auto-swapped back | Stuck in non-USDC | Cetus aggregator supports all stable pairs — verified in Phase 10. |
| Users who already use multi-stable borrow | Breaking change | 0.9.0 version bump signals breaking. Document in changelog. |
| `serve.ts` API consumers using `asset` param | Breaking API change | Version bump to v0.9.0 signals this. `/v1/swap` removed. |

---

## What ships in 0.9.0

### Simplified commands
- `t2000 save <amount>` — USDC only, no asset param
- `t2000 withdraw <amount|all>` — always returns USDC (auto-swaps)
- `t2000 borrow <amount>` — USDC only
- `t2000 repay <amount|all>` — USDC only

### Removed commands
- `t2000 swap` — removed (internal only for rebalance/withdraw)

### Unchanged commands
- `t2000 rebalance` — the star feature, cross-asset optimization
- `t2000 rates` — shows all yields across all stables
- `t2000 positions` — shows actual holdings (transparency)
- `t2000 balance` — shows all wallet stables
- `t2000 earnings` / `t2000 fund-status` — per-asset breakdown
- `t2000 health` — health factor
- `t2000 send` — USDC only (unchanged)
- `t2000 sentinel` — unchanged
- `t2000 pay` — unchanged

### New behavior
- `t2000 withdraw` auto-swaps non-USDC positions back to USDC
- Cleaner error messages (no more "No SUI for gas" for MoveAborts)

---

## Example User Flow (post-simplification)

```bash
# Save USDC — simple
t2000 save 100
  ✓ Saved $100.00 USDC at 4.91% APY

# Check what's available
t2000 rates
  Best yield: 5.46% APY (suiUSDT on NAVI Protocol)
  ...

# Optimize
t2000 rebalance
  ✓ Rebalanced $100.00 → 5.46% APY
  Tx: ...

# See what happened
t2000 positions
  navi:  $100.00 USDT @ 5.5% APY   ← agent moved to higher yield

# Get money back — always USDC
t2000 withdraw all
  ✓ Withdrew $100.00 USDC           ← auto-swapped USDT → USDC
```

No asset parameters. No stablecoin knowledge needed. Just save, optimize, withdraw.
