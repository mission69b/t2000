---
name: t2000-repay
description: >-
  Repay an outstanding loan on NAVI. Use when asked to repay a loan,
  pay back borrowed funds, reduce debt, improve health factor, or close a
  borrow position. Funds are taken from the available (checking) balance.
license: MIT
metadata:
  author: t2000
  version: "1.1"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Repay Loan

## Purpose
Return borrowed USDC to NAVI to reduce loan balance and improve health factor.

## Command
```bash
t2000 repay <amount> USDC
t2000 repay all USDC     # repays full outstanding balance including interest

# Examples:
t2000 repay 20 USDC
t2000 repay all USDC
```

## Output
```
✓ Repaid $XX.XX USDC to NAVI
✓ Outstanding loan: $XX.XX USDC (was $XX.XX)
✓ Health factor: X.XX → X.XX
✓ Available balance: $XX.XX USDC
  Tx: https://suiscan.xyz/mainnet/tx/0x...
```

## Notes
- No protocol fee on repayment
- `repay all` calculates full outstanding principal + accrued interest
  The amount deducted may be slightly more than the original borrow
- Repayment improves health factor immediately
