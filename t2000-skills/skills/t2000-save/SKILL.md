---
name: t2000-save
description: >-
  Deposit into savings to earn yield on Sui via NAVI Protocol. Use when
  asked to save money, earn interest, deposit to savings, or put funds
  to work. Not for sending to other addresses — use t2000-send for that.
license: MIT
metadata:
  author: t2000
  version: "1.5"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Save (Deposit to Savings)

## Purpose
Deposit **USDC or USDsui** into savings to earn yield on NAVI Protocol. Funds remain non-custodial and
withdrawable at any time. USDsui is permitted as a strategic exception (v0.51.0+) because it has
its own NAVI pool, often at a different APY than USDC. Every other token (GOLD, SUI, USDT, USDe,
ETH, NAVX, WAL) is **not saveable** — swap to USDC or USDsui first.

## Command
```bash
t2000 save <amount> [--asset USDC|USDsui]
t2000 save all [--asset USDC|USDsui]

# Examples:
t2000 save 80                    # 80 USDC (default)
t2000 save 80 --asset USDsui     # 80 USDsui
t2000 save all                   # full USDC balance (minus $1 gas reserve)
t2000 save all --asset USDsui    # full USDsui balance (minus 1.0 reserve)
```

- `save all`: deposits full available balance of the chosen asset minus 1.0 of that asset for safety
- `--asset` defaults to USDC when omitted

## Fees
- Protocol fee: 0.1% on deposit (collected atomically on-chain)

## Output
```
✓ Gas manager: $1.00 USDC → SUI          [only shown if auto-topup triggered]
✓ Saved $XX.XX <asset> to best rate
✓ Current APY: X.XX%
✓ Savings balance: $XX.XX <asset>
  Tx: https://suiscan.xyz/mainnet/tx/0x...
```

## Notes
- APY is variable based on protocol utilization (USDC and USDsui pools quote independently)
- If available balance of the chosen asset is too low, returns INSUFFICIENT_BALANCE
- `t2000 supply` is an alias for `t2000 save`
- **Repay symmetry (v0.51.1+):** if you borrow USDsui, you must repay with USDsui (and USDC borrows must repay with USDC) — the SDK fetches the matching coin type per borrow asset.
