---
name: t2000-borrow
description: >-
  Borrow USDC against savings collateral via NAVI Protocol. Use when asked
  to borrow, take a loan, get credit, leverage savings, or access funds
  without withdrawing from savings. A 0.05% protocol fee applies.
license: MIT
metadata:
  author: t2000
  version: "1.2"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Borrow USDC

## Purpose
Take a collateralized loan from NAVI using savings deposits as collateral.
Borrowed USDC goes to the available balance. A 0.05% protocol fee applies.

## Command
```bash
t2000 borrow <amount> [asset]

# Examples:
t2000 borrow 40 USDC
t2000 borrow 40
t2000 borrow 0.5
```

Asset defaults to USDC if omitted.

## Safety
Before borrowing, t2000 checks:
1. Savings collateral exists (`NO_COLLATERAL` if not)
2. Requested amount ≤ max safe borrow (`HEALTH_FACTOR_TOO_LOW` if exceeds)
3. Health factor stays above 1.5 after the borrow

If the amount exceeds the safe limit, the CLI shows:
```
⚠ Max safe borrow: $XX.XX (HF X.XX → min 1.5)
```

## Fees
- Protocol fee: 0.05% of the borrow amount

## Output
```
✓ Borrowed $XX.XX USDC
  Health Factor: X.XX
  Tx: https://suiscan.xyz/mainnet/tx/0x...
```

## Error handling
- `NO_COLLATERAL`: no savings deposited to borrow against
- `HEALTH_FACTOR_TOO_LOW`: borrow would drop HF below 1.5. Error data includes `maxBorrow`.
