# @t2000/contracts — Sui Move smart contracts

Move source for the t2000 protocol on Sui mainnet.

## Modules

| Module | Purpose |
|--------|---------|
| `t2000.move` | Top-level package — version + migration entrypoints |
| `treasury.move` | **Deprecated for new fee traffic (B5 v2, 2026-04-30).** Per-coin `Treasury<T>` shared object — kept only for legacy balance withdrawals. Active fee collection is now `T2000_OVERLAY_FEE_WALLET` (a regular USDC wallet); see "Treasury behaviour" below. |
| `admin.move` | AdminCap + UpgradeCap helpers, timelocked admin actions |
| `constants.move` | Package version constant; bumps with each on-chain upgrade |
| `errors.move` | Centralized abort code ledger |
| `events.move` | Emitted Move events for off-chain indexer |

## Mainnet object IDs

| Object | ID |
|--------|----|
| Package | `0xd775fcc66eae26797654d435d751dea56b82eeb999de51fd285348e573b968ad` |
| Config | `0x08ba26f0d260b5edf6a19c71492b3eb914906a7419baf2df1426765157e5862a` |
| ~~Treasury (USDC)~~ | ~~`0xf420ec0dcad44433042fb56e1413fb88d3ff65be94fcf425ef9ff750164590e8`~~ — **deprecated for new fees** (B5 v2). Sweep balance via `withdraw_fees<USDC>` once, then leave inert. |
| Treasury wallet (active) | `0x5366efbf2b4fe5767fe2e78eb197aa5f5d138d88ac3333fbf3f80a1927da473a` — `T2000_OVERLAY_FEE_WALLET`, plain USDC wallet, treasury admin keys |

AdminCap and UpgradeCap IDs live in `.env.local` only. Mirrored in `packages/sdk/src/constants.ts`.

## Versioning

Contract version is set in `constants.move` and enforced by `assert_version` in `treasury.move`. To upgrade:

1. Bump `VERSION` in `constants.move`
2. `sui client publish` the new package
3. Call `migrate_config(&AdminCap, &mut Config)` and `migrate_treasury<T>(&AdminCap, &mut Treasury<T>)` so the new package's version guards reject calls into the previous binary

## Allowance module — dormant

The `Allowance` Move type was published as part of an earlier package (separate from the modules above) to fund the deleted "features budget" / proactive-action billing flow. It was retired in the April 2026 simplification (see the S.0–S.12 entries in the root `audric-build-tracker.md`):

- The Move type still exists on-chain at the published package address — owner-recoverable balances stay accessible via direct `Allowance::withdraw` calls
- No new Audric flow creates or charges allowances
- Treasury (this package) is **independent** of the allowance contract — fee collection, admin withdraw, and version guards work identically with or without allowance objects existing
- Error codes **12–17** in `errors.move` are reserved for the historical allowance module and must not be reused

## Treasury behaviour

> **Deprecated for new fee traffic (B5 v2, 2026-04-30).** Active protocol fees route to a regular USDC wallet (`T2000_OVERLAY_FEE_WALLET`) inline within the consumer's PTB; the indexer detects the inflow on-chain and writes `ProtocolFeeLedger`. The Move treasury below is kept only to drain residual balances.

Historical (pre-B5 v2) per-coin shared object pattern:

- ~~`collect_fee<T>()`~~ — **do not call from new code.** Audric's `prepare/route.ts` uses `addFeeTransfer(tx, coin, FEE_BPS, T2000_OVERLAY_FEE_WALLET, amount)` instead (split + transferObjects in the same PTB).
- `receive_coins<T>()` — admin recovery of coins sent to the legacy treasury via `transferObjects` (object-owned). Used during the B5 v2 stranded-fee sweep, then inactive.
- `withdraw_fees<T>()` — admin withdraw from the legacy treasury balance (requires AdminCap). Used once during the B5 v2 sweep.
- `migrate_treasury<T>()` — version bump guard called after package upgrade (requires AdminCap). Still required if the package itself is upgraded for unrelated reasons.

## Build / test

```bash
sui move build
sui move test
```

## Deployment

```bash
sui client publish --gas-budget 200000000
```

Then update `T2000_PACKAGE_ID` and `T2000_CONFIG_ID` in `packages/sdk/src/constants.ts` and `infra/server-task-definition.json`. (`T2000_TREASURY_ID` was removed in B5 v2 — fees no longer route through the Move treasury.)
