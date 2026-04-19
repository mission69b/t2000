# Upstream Workarounds & Technical Debt

> Track every workaround we carry due to upstream bugs or missing features.
> When an upstream ships a fix, find the workaround here, remove it, and test.

---

## NAVI Protocol MCP

### 1. Newer-pool decimal bug (1000x correction)

| Field | Detail |
|-------|--------|
| **File** | `packages/engine/src/navi-transforms.ts` |
| **Workaround** | `NAVI_NEWER_POOL_SYMBOLS` set + `naviDecimalFactor()` multiplies amounts by 1000 for USDSUI, USDe, suiUSDT |
| **Root cause** | NAVI MCP `get_positions` divides all amounts by 10^9 (SUI decimals), but USDSUI/USDe/suiUSDT use 6 decimals. Result: 1000x under-reporting |
| **Impact** | `savings_info` tool shows $0.01 instead of $9.99 for USDsui positions |
| **Remove when** | NAVI MCP returns correct amounts for 6-decimal pools |
| **How to verify** | Call `get_positions` for a wallet with USDSUI deposits, check `amountA` matches on-chain |
| **Date logged** | 2026-04-05 |

### 2. No write operations via MCP

| Field | Detail |
|-------|--------|
| **Current state** | NAVI MCP is read-only (pool stats, positions, health factor, rewards, search tokens, swap quotes) |
| **Our workaround** | Thin transaction builders in `packages/sdk/src/protocols/navi.ts` using direct `Transaction` class |
| **Impact** | We maintain our own deposit/withdraw/borrow/repay tx builders |
| **Remove when** | NAVI ships write MCP (deposit, withdraw, borrow, repay, claim) — CTO confirmed this is planned |
| **Migration path** | Replace `buildNaviDepositTx()` etc. with MCP tool calls. Keep `Transaction`-based builders as fallback |
| **Date logged** | 2026-04-05 |

---

## Sui RPC / Fullnode Providers

### 3. `executeTransactionBlock` doesn't return `balanceChanges`

| Field | Detail |
|-------|--------|
| **File** | `packages/sdk/src/t2000.ts` (swap function) |
| **Workaround** | Pre/post `getBalance()` diff instead of parsing `gasResult.balanceChanges` |
| **Root cause** | Some Sui fullnode providers don't compute `balanceChanges` synchronously during execution, even with `showBalanceChanges: true` |
| **Impact** | Swap receipts showed Cetus estimate (0.01) instead of actual received amount (~10 USDSUI) |
| **Remove when** | Never — the balance diff approach is more reliable regardless. Consider it permanent |
| **Date logged** | 2026-04-05 |

### 4. `KNOWN_COINS` manual decimal registry

| Field | Detail |
|-------|--------|
| **File** | `packages/engine/src/sui-rpc.ts` |
| **Workaround** | Hardcoded `KNOWN_COINS` map with coin type → symbol + decimals |
| **Root cause** | `suix_getAllBalances` returns raw MIST amounts with no decimal metadata. We need to know decimals to display human-readable values |
| **Impact** | Any new token not in `KNOWN_COINS` defaults to 9 decimals (SUI default), which is wrong for 6-decimal stablecoins |
| **Improve when** | Fetch `CoinMetadata` on-chain for unknown coins via `suix_getCoinMetadata` as fallback |
| **Date logged** | 2026-04-05 |

---

## Cetus Aggregator

### 5. Inaccurate `amountOut` estimates for some tokens

| Field | Detail |
|-------|--------|
| **Observation** | Cetus route `amountOut` for USDSUI swaps returned values 1000x too low |
| **Workaround** | We no longer use `amountOut` for the receipt — we use pre/post balance diff (see #3) |
| **Impact** | None currently (the estimate is only used for the pre-swap preview, not the receipt) |
| **Monitor** | If Cetus fixes their estimate, no action needed — our approach is already better |
| **Date logged** | 2026-04-05 |

---

## Cleanup Checklist

When NAVI ships write MCP + corrected decimals:

- [ ] Remove `NAVI_NEWER_POOL_SYMBOLS` and `naviDecimalFactor()` from `navi-transforms.ts`
- [ ] Verify `get_positions` returns correct `amountA` for all pools
- [ ] Evaluate replacing `navi.ts` tx builders with MCP write calls
- [ ] Keep `Transaction`-based builders as fallback behind feature flag
- [ ] Run full e2e: deposit → check savings → withdraw for USDC, USDSUI, USDe, SUI
- [ ] Update `PRODUCT_FACTS.md` if MCP changes affect documented behavior

When adding new tokens:

- [ ] Add to `KNOWN_COINS` in `sui-rpc.ts` with correct decimals
- [ ] Add to `TOKEN_MAP` in `cetus-swap.ts` if swappable
- [ ] Add to `NAVI_NEWER_POOL_SYMBOLS` in `navi-transforms.ts` if it's a newer 6-decimal NAVI pool (temporary — see #1)
- [ ] Test balance display, swap receipt, deposit, and withdraw
