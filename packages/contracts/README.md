# @t2000/contracts — Sui Move smart contracts

Move source for the t2000 protocol on Sui mainnet.

## Modules

| Module | Purpose |
|--------|---------|
| `t2000.move` | Top-level package — version + migration entrypoints |
| `treasury.move` | Per-coin Treasury<T> shared object — fee collection, admin withdraw |
| `admin.move` | AdminCap + UpgradeCap helpers, timelocked admin actions |
| `constants.move` | Package version constant; bumps with each on-chain upgrade |
| `errors.move` | Centralized abort code ledger |
| `events.move` | Emitted Move events for off-chain indexer |

## Mainnet object IDs

| Object | ID |
|--------|----|
| Package | `0xd775fcc66eae26797654d435d751dea56b82eeb999de51fd285348e573b968ad` |
| Config | `0x08ba26f0d260b5edf6a19c71492b3eb914906a7419baf2df1426765157e5862a` |
| Treasury (USDC) | `0xf420ec0dcad44433042fb56e1413fb88d3ff65be94fcf425ef9ff750164590e8` |

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

Treasury exposes a per-coin shared object pattern:

- `collect_fee<T>()` — called inline within a PTB; splits a fee from `&mut Coin<T>` into the Treasury's internal `Balance<T>`
- `receive_coins<T>()` — admin recovery of coins sent to the treasury via `transferObjects` (object-owned)
- `withdraw_fees<T>()` — admin withdraw from the treasury balance (requires AdminCap)
- `migrate_treasury<T>()` — version bump guard called after package upgrade (requires AdminCap)

## Build / test

```bash
sui move build
sui move test
```

## Deployment

```bash
sui client publish --gas-budget 200000000
```

Then update `T2000_PACKAGE_ID`, `T2000_CONFIG_ID`, `T2000_TREASURY_ID` in `packages/sdk/src/constants.ts` and `infra/server-task-definition.json`.
