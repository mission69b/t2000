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
  version: "1.1"
  requires: t2000 CLI (npm install -g t2000)
---

# t2000: Save (Deposit to NAVI)

## Purpose
Deposit USDC into NAVI to earn yield. Funds remain non-custodial and
withdrawable at any time (subject to utilization).

## Command
```bash
t2000 save <amount> USDC
t2000 save all

# Examples:
t2000 save 80 USDC
t2000 save all
```

## Important: how `save all` works
`save all` deposits everything except what the gas manager needs. It does NOT
simply reserve $1 USDC liquid. Instead: if the SUI gas reserve is low, the gas
manager will auto-convert up to $1 USDC → SUI before depositing the remainder.
The exact USDC deposited = available balance minus any gas conversion amount.
If no gas conversion is needed, the full available balance is deposited.

Example:
```
Available:  $100.00 USDC
Gas:        0.00 SUI  (low — gas manager triggers)

→ Gas manager converts $1.00 USDC → SUI
→ Deposits $99.00 USDC to NAVI
→ Protocol fee: $0.099 USDC (0.1%)
→ Net deposited: $98.90 USDC
```

## Fees
- Protocol fee: 0.1% of the deposit amount
- Fee is collected atomically — no fee charged if transaction fails

## Output
```
✓ Gas manager: $1.00 USDC → SUI          [only shown if triggered]
✓ Deposited $XX.XX USDC to NAVI
✓ Protocol fee: $0.XX USDC (0.1%)
✓ Current APY: X.XX%
✓ Savings balance: $XX.XX USDC
  Tx: https://suiexplorer.com/tx/0x...
```

## Notes
- APY is variable based on NAVI utilization
- If available balance is $0 after gas conversion, returns INSUFFICIENT_BALANCE
