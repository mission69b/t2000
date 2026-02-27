---
name: t2000-repay
description: >-
  Repay borrowed USDC on NAVI Protocol. Use when asked to repay a loan,
  pay back debt, reduce outstanding balance, or clear borrows. Supports
  partial and full repayment.
license: MIT
metadata:
  author: t2000
  version: "1.2"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Repay Borrow

## Purpose
Repay outstanding USDC debt on NAVI. Supports specific amounts or
`repay all` to clear the full balance including accrued interest.

## Command
```bash
t2000 repay <amount> [asset]
t2000 repay all [asset]

# Examples:
t2000 repay 20 USDC
t2000 repay 20
t2000 repay all
```

Asset defaults to USDC if omitted.

## Fees
- No protocol fee on repayment

## Output
```
✓ Repaid $XX.XX USDC
  Remaining Debt: $XX.XX
  Tx: https://suiscan.xyz/mainnet/tx/0x...
```

## Notes
- `repay all` calculates full outstanding principal + accrued interest
- Available USDC balance must cover the repayment amount
