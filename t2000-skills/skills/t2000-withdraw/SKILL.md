---
name: t2000-withdraw
description: >-
  Withdraw USDC from savings back to the available (checking) balance. Use
  when asked to withdraw savings, access deposited funds, move money from
  savings to checking, or liquidate a savings position. Will be blocked if
  the withdrawal would put any active loan at risk.
license: MIT
metadata:
  author: t2000
  version: "1.1"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Withdraw from Savings

## Purpose
Move USDC from NAVI savings back to the available balance.

## Command
```bash
t2000 withdraw <amount> USDC
t2000 withdraw all

# Examples:
t2000 withdraw 50 USDC
t2000 withdraw all
```

## Safety check
If the wallet has an active borrow position, withdrawal is blocked if it
would drop the health factor below 1.5. The error includes `safeWithdrawAmount`.

## Query safe limits first (recommended before withdrawing with active loan)
```bash
t2000 balance --show-limits
# Returns: maxWithdraw, maxBorrow, currentHealthFactor
```

## Output
```
✓ Withdrew $XX.XX USDC from NAVI
✓ Available balance: $XX.XX USDC
  Tx: https://suiscan.xyz/mainnet/tx/0x...
```

## Errors
- `WITHDRAW_WOULD_LIQUIDATE`: withdrawal would drop health factor below 1.5
  → data includes `safeWithdrawAmount` (the safe maximum)
- `INSUFFICIENT_SAVINGS`: savings balance is less than the requested amount
- `NAVI_LIQUIDITY_UNAVAILABLE`: pool utilization too high; retry later
