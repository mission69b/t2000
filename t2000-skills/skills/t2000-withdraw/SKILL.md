---
name: t2000-withdraw
description: >-
  Withdraw USDC from savings. Use when asked to withdraw from savings,
  access deposited funds, pull money out of savings, or reduce yield
  position. Use --protocol to specify navi or suilend. For sending to
  another address, use t2000-send.
license: MIT
metadata:
  author: t2000
  version: "1.2"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Withdraw from Savings

## Purpose
Withdraw USDC from savings back to the available (checking) balance.
Subject to pool utilization — if utilization is very high, partial
withdrawals may be needed.

## Command
```bash
t2000 withdraw <amount> [asset] [--protocol <name>]
t2000 withdraw all [asset]

# Examples:
t2000 withdraw 25 USDC
t2000 withdraw 25
t2000 withdraw all
t2000 withdraw all --protocol suilend
```

Asset defaults to USDC if omitted.

## Fees
- No protocol fee on withdrawals

## Output
```
✓ Withdrew $XX.XX USDC
  Tx: https://suiscan.xyz/mainnet/tx/0x...
```

## Safety
If there's an active borrow, t2000 checks the health factor before
withdrawing. If the withdrawal would drop HF below 1.5, it throws
`WITHDRAW_WOULD_LIQUIDATE` with a `safeWithdrawAmount`.

## Error handling
- `WITHDRAW_WOULD_LIQUIDATE`: withdrawal would make health factor unsafe. Check `safeWithdrawAmount` in error data.
- `NO_COLLATERAL`: no savings to withdraw
- `INSUFFICIENT_BALANCE`: requested amount exceeds savings balance
