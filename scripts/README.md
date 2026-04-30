# scripts/

Developer utilities — not part of the published packages, not run in CI. Used for manual integration testing against Sui mainnet and for ad-hoc debugging.

## SDK integration tests (`.ts`)

Each test is a standalone `tsx` script that imports `@t2000/sdk` directly from `packages/sdk/src/index.js` and exercises a domain end-to-end against live infrastructure. They are **not** vitest tests — they hit real RPC, real NAVI, and real mainnet balances, so they require a funded test wallet.

| File | Exercises |
|------|-----------|
| `test-helpers.ts` | Shared primitives (`assert`, `section`, `runSection`, `createAgent`, `summary`) imported by every other test. |
| `test-navi.ts` | NAVI lending — rates, save, positions, withdraw, borrow, health factor, repay. Requires ≥ $3 USDC + 0.05 SUI. |
| `test-send.ts` | Direct USDC transfer. |
| `test-pay.ts` | MPP payment flow via `pay_api`. |
| `test-claim-rewards.ts` | NAVI reward claim path. |
| `test-earn.ts` | Earnings summary / yield read path. |
| `test-wallet.ts` | Wallet creation, address derivation. |
| `test-misc.ts` | Miscellaneous small checks. |
| `run-all.ts` | Runs every test sequentially via subprocess — failures in one don't block the rest. |

Run one:
```bash
source .env.local && npx tsx scripts/test-navi.ts
```

Run all:
```bash
source .env.local && npx tsx scripts/run-all.ts
```

## Debug utilities

| File | Purpose |
|------|---------|
| `debug-navi-positions.ts` | Raw Sui BCS decode of NAVI `UserStateInfo` for troubleshooting position reads. Not a test — inspect output by hand. |

## One-off ops scripts

| File | Purpose |
|------|---------|
| `sweep-treasury.sh` | One-time admin sweep of the deprecated Move treasury (B5 v2, 2026-04-30). Switches `sui client` to the admin keypair (`gracious-chrysoberyl`), reads the residual `Treasury<USDC>.balance`, and calls `withdraw_fees`. Idempotent — re-running on an empty treasury exits 0. Requires `sui` CLI + the admin keypair already in your local sui keystore. |
| `b5-v2-e2e-verify.ts` | End-to-end verification of the B5 v2 fee architecture. Snapshots treasury wallet (RPC) + ProtocolFeeLedger (`/api/stats`), prompts the operator to run one Audric write, then polls for the on-chain inflow + indexer row + stats-API surfacing. Default action is `swap` (covers the Cetus overlay path); pass `--action=save` or `--action=borrow` for the other write paths. Run all three to fully cover B5 v2. |

```bash
# Admin sweep (one-time)
bash scripts/sweep-treasury.sh

# E2E verify
npx tsx scripts/b5-v2-e2e-verify.ts                 # swap (default)
npx tsx scripts/b5-v2-e2e-verify.ts --action=save
npx tsx scripts/b5-v2-e2e-verify.ts --action=borrow
```

## CLI integration tests (`cli/*.sh`)

Shell wrappers that exercise `@t2000/cli` end-to-end via `npx t2000 ...`. Use these to verify that CLI UX output matches `CLI_UX_SPEC.md` after making command changes.

| File | Exercises |
|------|-----------|
| `run-all.sh` | Runs every CLI test and prints a pass/fail summary. |
| `test-balance.sh` | `balance`, `rates`, `earnings`, `fund-status`. |
| `test-save.sh` | `save` / `supply`. |
| `test-withdraw.sh` | `withdraw`. |
| `test-borrow.sh` | `borrow`. |
| `test-claim-rewards.sh` | `claim-rewards`. |
| `test-earn.sh` | `earn`. |
| `test-pay.sh` | `pay`. |
| `test-positions.sh` | `positions`. |
| `test-rebalance.sh` | Multi-step rebalance flow. |

Run:
```bash
T2000_PIN=your-pin bash scripts/cli/run-all.sh
```

## Notes

- Tests are **additive** — they leave small balances in the test wallet. Top up before runs.
- Nothing here is wired into `turbo test` or `pnpm test`. That is intentional — these require secrets and mainnet gas.
- When a test exercises a feature that's been deleted (e.g. schedules, pattern proposals), delete the test. Do not leave them around "for reference" — git history is the reference.
