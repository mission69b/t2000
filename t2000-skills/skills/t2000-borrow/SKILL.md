---
name: t2000-borrow
description: >-
  Borrow stablecoins (USDC, USDT, USDe, USDsui) against savings collateral.
  Use when asked to borrow, take a loan, get credit, leverage savings, or
  access funds without withdrawing from savings. A 0.05% protocol fee applies.
license: MIT
metadata:
  author: t2000
  version: "1.3"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Borrow Stablecoins

## Purpose
Take a collateralized loan using savings deposits as collateral.
Borrowed funds go to the available balance. A 0.05% protocol fee applies.
Supports USDC, USDT, USDe, and USDsui — shop for the cheapest borrow rate.

## Command
```bash
t2000 borrow <amount> [asset]

# Examples:
t2000 borrow 40 USDC
t2000 borrow 40              # defaults to USDC
t2000 borrow 100 USDT        # borrow USDT instead
t2000 borrow 50 USDe --protocol navi
```

Asset defaults to USDC if omitted. Check `t2000 rates` to compare borrow
rates across assets and protocols before borrowing.

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
✓ Borrowed $XX.XX USDT
  Health Factor: X.XX
  Tx: https://suiscan.xyz/mainnet/tx/0x...
```

## Error handling
- `NO_COLLATERAL`: no savings deposited to borrow against
- `HEALTH_FACTOR_TOO_LOW`: borrow would drop HF below 1.5. Error data includes `maxBorrow`.
- `ASSET_NOT_SUPPORTED`: no protocol supports the requested asset for borrowing. Includes alternatives.
