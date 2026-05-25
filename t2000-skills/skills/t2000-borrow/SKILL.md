---
name: t2000-borrow
description: >-
  Borrow USDC or USDsui against savings collateral. Use when asked to
  borrow, take a loan, get credit, leverage savings, or access funds
  without withdrawing from savings. A 0.05% protocol fee applies. Only
  accepts USDC or USDsui. Always validates projected health factor
  before signing — refuses if HF would drop below 1.5.
license: MIT
metadata:
  author: t2000
  version: "1.6"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Borrow USDC or USDsui

## Purpose
Take a collateralized loan using savings deposits as collateral.
Borrowed funds go to the available balance. A 0.05% protocol fee applies.
USDsui is permitted as a strategic exception (v0.51.0+) alongside USDC —
both have NAVI lending pools.

## Rules

1. **USDC or USDsui only.** NAVI doesn't have lending pools for other tokens. The SDK returns `UNSUPPORTED_ASSET` on anything else.
2. **HF ≥ 1.5 is the hard floor.** Refuse the borrow if the projected health factor drops below 1.5; the safeguard layer enforces it. Surface `maxBorrow` from the error and suggest the recovery (repay or add collateral).
3. **Always preview HF.** Even when HF stays > 2.0, state the projected HF, borrow amount, and borrow APY before signing. Borrow is the most consequential write — never silent.
4. **Borrow is single-write.** Never bundle with another write in a Payment Intent. The user must consciously accept debt.
5. **Repay symmetry is non-negotiable.** A USDsui borrow MUST be repaid with USDsui. If the user only holds USDC, tell them — do not auto-swap. See `t2000-repay`.
6. **Borrow always confirms.** Across every USD-aware permission preset (`conservative` / `balanced` / `aggressive`), `borrow` has `autoBelow: 0` — it never auto-executes. Treat it as `confirm`-tier under all conditions.

## Command
```bash
t2000 borrow <amount> [--asset USDC|USDsui]

# Examples:
t2000 borrow 40                    # 40 USDC (default)
t2000 borrow 100 --asset USDsui    # 100 USDsui
```

`--asset` defaults to USDC when omitted.

## Pre-borrow safety check (always runs)

Before broadcasting the borrow transaction, t2000 evaluates the projected
health factor and routes the user through one of three paths:

| Projected HF after borrow | What happens |
|---|---|
| **< 1.5** | **Refuse** — borrow blocked with `HEALTH_FACTOR_TOO_LOW`. Error includes `maxBorrow` (the largest amount that keeps HF ≥ 1.5). Suggest: repay existing debt OR add more collateral. |
| **1.5 – 2.0** | **Warn** — surface the projected HF and require explicit user confirmation. Always state: borrow amount, projected HF, current borrow APY. Do NOT silently proceed. |
| **> 2.0** | **Proceed** — borrow is well-collateralized, no extra confirmation needed beyond the standard signing flow. |

Always state to the user: **borrow amount**, **interest rate**, and
**projected health factor** before signing.

## Engine orchestration (audric/web)

When called inside the Audric chat agent:

1. Call `health_check` first to get current HF and `maxBorrow`.
2. Compute projected HF: `(supplied × liquidationThreshold) / (borrowed + amountUsd)`.
3. Apply the table above — refuse / warn / proceed.
4. On user confirmation, emit `borrow({ amount, asset })` as the write tool_use.

Borrows are always **single-write** — never bundle with another write in a
Payment Intent. The user must consciously accept the debt.

## Fees

- Protocol fee: 0.05% of the borrow amount

## Output

```
✓ Borrowed $XX.XX <asset>
  Health Factor: X.XX
  Borrow APY: X.XX%
  Tx: https://suiscan.xyz/mainnet/tx/0x...
```

## Error handling

- `NO_COLLATERAL` — no savings deposited to borrow against. Use `t2000 save` first.
- `HEALTH_FACTOR_TOO_LOW` — borrow would drop HF below 1.5. Error data includes `maxBorrow`. Suggest: repay debt or add collateral.
- `UNSUPPORTED_ASSET` — asset is not USDC or USDsui. Other tokens cannot be borrowed (NAVI doesn't have pools for them).

## Repayment symmetry (important)

**A USDsui borrow MUST be repaid with USDsui.** A USDC borrow MUST be repaid
with USDC. The SDK fetches the matching coin type per borrow asset. If the
user holds only the wrong stable, tell them to swap manually first — never
auto-chain swap + repay. See `t2000-repay` for the repay flow.

## What's NOT permitted

- Borrowing in any asset other than USDC or USDsui (no SUI, GOLD, USDT, ETH borrows — NAVI doesn't have lending pools for those).
- Borrowing without a savings position (collateral first).
- Borrowing that drops HF below 1.5 (always refused; safety-critical).
