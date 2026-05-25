---
name: t2000-repay
description: >-
  Repay outstanding USDC or USDsui debt. Use when asked to repay a loan,
  pay back debt, reduce outstanding balance, or clear borrows. Supports
  partial and full repayment. Must repay with the same asset as the
  original borrow (USDsui debt → USDsui repay).
license: MIT
metadata:
  author: t2000
  version: "1.6"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Repay Borrow

## Purpose
Repay outstanding debt in USDC or USDsui. Supports specific amounts or `repay all` to clear the full balance including accrued interest. **Symmetry rule (v0.51.1+):** repay with the same asset as the original borrow.

## Rules

1. **Repay with the same asset as the borrow.** A USDsui debt MUST be repaid with USDsui. A USDC debt MUST be repaid with USDC. The SDK fetches the matching coin type per borrow asset.
2. **Don't auto-swap to bridge the asset gap.** If the user holds only the wrong stable, tell them to swap manually first via `t2000-swap` — never auto-chain swap + repay.
3. **`repay all` clears across both stables.** When `--asset` is omitted, `repay all` resolves to "clear every outstanding debt" — the SDK iterates per asset.
4. **Surface remaining debt + new HF.** After repayment, state the new debt + health factor. Users who just repaid usually want to plan the next move (withdraw, re-borrow at better terms).
5. **No protocol fee on repay.** NAVI doesn't charge on repayment — the interest spread is captured at the lending rate, not at repay-time.

## Command
```bash
t2000 repay <amount> [--asset USDC|USDsui]
t2000 repay all [--asset USDC|USDsui]

# Examples:
t2000 repay 20                       # 20 USDC (default — clears USDC debt)
t2000 repay 20 --asset USDsui        # 20 USDsui (clears USDsui debt)
t2000 repay all                      # clear ALL debts across both stables
t2000 repay all --asset USDsui       # clear ONLY USDsui debt
```

When `--asset` is omitted and the wallet has only one debt type, the SDK auto-selects. When both debts exist, omitting `--asset` resolves to "highest-APY debt first" (CLI) or "repay all stables" for `repay all`.

## Fees
- No protocol fee on repayment

## Output
```
✓ Repaid $XX.XX <asset>
  Remaining Debt: $XX.XX
  Tx: https://suiscan.xyz/mainnet/tx/0x...
```

## Notes
- `repay all` calculates full outstanding principal + accrued interest for the targeted asset (or every asset if `--asset` omitted).
- Available balance of the matching stable must cover the repayment amount. If short, surface the shortfall and the swap path — do not auto-execute.

## Engine orchestration (audric/web)

When called inside the Audric chat agent:
1. Call `health_check` to see active debts per asset.
2. For each debt the user wants to clear, emit `repay_debt({ amount, asset })`.
3. If clearing multiple debts in one go, emit them as parallel `tool_use` blocks in the same assistant turn — the engine compiles into one Payment Intent (atomic).
4. After settlement, surface new debt + new HF.
