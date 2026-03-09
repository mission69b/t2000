---
name: t2000-save
description: >-
  Deposit stablecoins (USDC, USDT, USDe, USDsui) into savings to earn yield
  on Sui via NAVI or Suilend (auto-selects best rate). Use when asked to save
  money, earn interest, deposit to savings, or put funds to work.
  Not for sending to other addresses — use t2000-send for that.
license: MIT
metadata:
  author: t2000
  version: "1.4"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Save (Deposit to Savings)

## Purpose
Deposit stablecoins into savings to earn yield (auto-selects best rate across
NAVI and Suilend, or specify `--protocol navi|suilend`). Supports USDC, USDT,
USDe, and USDsui. Funds remain non-custodial and withdrawable at any time.

## Command
```bash
t2000 save <amount> [asset] [--protocol <name>]
t2000 save all [asset]

# Examples:
t2000 save 80 USDC
t2000 save 100 USDT
t2000 save 50 USDe --protocol navi
t2000 save all USDsui
t2000 save 80                    # defaults to USDC
t2000 save all                   # defaults to USDC
t2000 save 50 --protocol suilend
```

Asset defaults to USDC if omitted (backward compatible).
- `save all` for USDC: deposits full balance minus $1 reserve for gas
- `save all` for other stables: deposits full balance (no reserve needed)

## Fees
- Protocol fee: 0.1% on USDC saves (collected atomically on-chain)
- Non-USDC saves are fee-free (until multi-asset treasuries are deployed)

## Output
```
✓ Gas manager: $1.00 USDC → SUI          [only shown if auto-topup triggered]
✓ Saved $XX.XX USDT to best rate
✓ Current APY: X.XX%
✓ Savings balance: $XX.XX USDT
  Tx: https://suiscan.xyz/mainnet/tx/0x...
```

## Notes
- APY is variable based on protocol utilization
- If available balance is $0 after gas conversion, returns INSUFFICIENT_BALANCE
- `t2000 supply` is an alias for `t2000 save`
- Asset names are case-insensitive: `usde`, `USDe`, `USDE` all work
- Use `t2000 rebalance` to auto-optimize across all stables for best yield
