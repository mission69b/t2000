---
name: t2000-repay
description: >-
  Repay borrowed stablecoins. Use when asked to repay a loan, pay back
  debt, reduce outstanding balance, or clear borrows. Supports partial
  and full repayment. Must repay in the same asset that was borrowed.
license: MIT
metadata:
  author: t2000
  version: "1.3"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Repay Borrow

## Purpose
Repay outstanding stablecoin debt. Supports specific amounts or
`repay all` to clear the full balance including accrued interest.
Must repay in the same asset that was borrowed (e.g., USDT debt
requires USDT repayment).

## Command
```bash
t2000 repay <amount> [asset]
t2000 repay all [asset]

# Examples:
t2000 repay 20 USDC
t2000 repay 20              # defaults to USDC
t2000 repay 100 USDT        # repay USDT debt
t2000 repay all USDe        # repay all USDe debt
```

Asset defaults to USDC if omitted. Use `t2000 positions` to see
which assets have outstanding borrows.

## Fees
- No protocol fee on repayment

## Output
```
✓ Repaid $XX.XX USDT
  Remaining Debt: $XX.XX
  Tx: https://suiscan.xyz/mainnet/tx/0x...
```

## Notes
- `repay all` calculates full outstanding principal + accrued interest
- Available balance of the specific asset must cover the repayment amount
- Supported assets: USDC, USDT, USDe, USDsui
