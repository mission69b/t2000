---
name: t2000-borrow
description: >-
  Borrow USDC against savings collateral on NAVI. Use when asked to take
  out a loan, borrow against deposits, get credit, leverage a position, or
  access liquidity without selling savings. Requires an active savings
  (deposit) position as collateral.
license: MIT
metadata:
  author: t2000
  version: "1.1"
  requires: t2000 CLI (npm install -g t2000)
---

# t2000: Borrow Against Savings

## Purpose
Take a collateralized loan from NAVI using savings deposits as collateral.
Borrowed USDC goes to the available balance. A 0.05% protocol fee applies.

## Command
```bash
t2000 borrow <amount> USDC

# Example:
t2000 borrow 40 USDC
```

## Before borrowing: check limits
```bash
t2000 balance --show-limits
# Returns: maxBorrow, currentHealthFactor, liquidationThreshold
```

## Health factor rules
- Health factor must stay ≥ 1.5 after borrowing (enforced on-chain)
- If borrow would drop HF below 1.5, error includes `safeMaxBorrow`
- Health factor = (collateral value × liquidation threshold) / borrowed value
- HF below 1.0 → position eligible for liquidation on NAVI

## Output
```
✓ Borrowed $XX.XX USDC from NAVI
✓ Protocol fee: $0.XX USDC (0.05%)
✓ Health factor: X.XX (safe above 1.5)
✓ Available balance: $XX.XX USDC
  Tx: https://suiexplorer.com/tx/0x...
```

## Errors
- `HEALTH_FACTOR_TOO_LOW`: borrow drops HF below 1.5
  → data includes `safeMaxBorrow`
- `NO_COLLATERAL`: no savings deposited to borrow against
- `BORROW_CAP_REACHED`: NAVI pool borrow cap reached; retry later
