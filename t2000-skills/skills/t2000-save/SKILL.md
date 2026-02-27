---
name: t2000-save
description: >-
  Deposit USDC into savings to earn yield on Sui via NAVI. Use when asked
  to save money, earn interest, deposit to savings, put funds to work, or
  maximize yield on idle USDC. Not for sending to other addresses — use
  t2000-send for that.
license: MIT
metadata:
  author: t2000
  version: "1.2"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Save (Deposit to NAVI)

## Purpose
Deposit USDC into NAVI to earn yield. Funds remain non-custodial and
withdrawable at any time (subject to utilization).

## Command
```bash
t2000 save <amount> [asset]
t2000 save all [asset]

# Examples:
t2000 save 80 USDC
t2000 save 80
t2000 save all
```

Asset defaults to USDC if omitted. `save all` deposits the full available
balance minus a $1 USDC reserve held back for future gas needs.

## Fees
- Protocol fee: 0.1% of the deposit amount
- Fee is collected atomically — no fee charged if transaction fails

## Output
```
✓ Gas manager: $1.00 USDC → SUI          [only shown if auto-topup triggered]
✓ Saved $XX.XX USDC to NAVI
✓ Protocol fee: $0.XX USDC (0.1%)
✓ Current APY: X.XX%
✓ Savings balance: $XX.XX USDC
  Tx: https://suiscan.xyz/mainnet/tx/0x...
```

## Notes
- APY is variable based on NAVI utilization
- If available balance is $0 after gas conversion, returns INSUFFICIENT_BALANCE
- `t2000 supply` is an alias for `t2000 save`
