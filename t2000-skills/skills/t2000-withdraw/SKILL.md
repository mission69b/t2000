---
name: t2000-withdraw
description: >-
  Withdraw from savings and receive USDC or USDsui. Use when asked to
  withdraw from savings, access deposited funds, pull money out of
  savings, reduce yield position, "close my position", or emergency
  withdraw. For sending to another address, use t2000-send.
license: MIT
metadata:
  author: t2000
  version: "1.4"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Withdraw from Savings

## Purpose
Withdraw USDC or USDsui from savings back to your checking balance.

## Command
```bash
t2000 withdraw <amount> [--asset USDC|USDsui]
t2000 withdraw all [--asset USDC|USDsui]

# Examples:
t2000 withdraw 25                    # 25 USDC (default)
t2000 withdraw 25 --asset USDsui     # 25 USDsui
t2000 withdraw all                   # full USDC savings position
t2000 withdraw all --asset USDsui    # full USDsui savings position
```

`--asset` defaults to USDC when omitted.

## Fees
- No protocol fee on withdrawals

## Output
```
✓ Withdrew $XX.XX <asset>
  Tx: https://suiscan.xyz/mainnet/tx/0x...
```

## Safety check (active when debt exists)

If the wallet has outstanding debt, t2000 evaluates whether the withdrawal
would push the health factor below 1.5:

| Scenario | Behavior |
|---|---|
| No debt | Withdrawal proceeds — no HF check. |
| Withdrawal keeps HF ≥ 1.5 | Withdrawal proceeds — note the new HF in the output. |
| Withdrawal would drop HF < 1.5 | **Refused** with `WITHDRAW_WOULD_LIQUIDATE`. Error data includes `safeWithdrawAmount` (the largest amount that keeps HF ≥ 1.5). |

## Emergency / "close my position" flow

When the user asks to "withdraw everything", "close my position", or
"emergency withdraw":

### Step 1 — Read state
Call `health_check` (engine) or `t2000 balance --show-limits` (CLI) to
see savings, debt, and current HF.

### Step 2 — Decide path

| Wallet state | Path |
|---|---|
| **No debt** | Single-write `withdraw all` for each asset held in savings. |
| **Has debt, savings ≥ debt** | **Bundled repay + withdraw** — emit `repay_debt(all)` and `withdraw(remaining)` as parallel `tool_use` blocks in the SAME assistant turn. Engine compiles into one Payment Intent: atomic repay-then-withdraw, one signature. |
| **Has debt, savings < debt** | **Refuse** — user can't fully close position without first acquiring more of the borrowed asset. Tell them how much more they'd need; do not auto-swap. |

### Step 3 — Bundled emit (engine path)

For the "bundled repay + withdraw" case, emit BOTH tool_use blocks in the
same assistant turn:

```
[ASSISTANT TURN — emit in parallel]
  tool_use: repay_debt({ amount: <debt>, asset: <borrowed_asset> })
  tool_use: withdraw({ amount: <remaining>, asset: <savings_asset> })
```

The engine's permission gate compiles these into ONE Payment Intent. Both
legs succeed or both revert — no partial close. The user signs once.

**Do NOT** call them sequentially across turns — that loses atomicity and
exposes the user to a window where debt is repaid but the withdraw fails,
leaving the wallet in an awkward state.

**Critical:** `repay_debt` MUST use the SAME asset as the original borrow
(USDsui debt → USDsui repay, USDC debt → USDC repay — see `t2000-repay`).
If the user doesn't hold enough of the matching asset, abort with a clear
message; do not auto-swap.

## Error handling
- `WITHDRAW_WOULD_LIQUIDATE` — withdrawal would push HF < 1.5. Use `safeWithdrawAmount` from error data, or repay debt first.
- `NO_COLLATERAL` — no savings position in the requested asset.
- `INSUFFICIENT_BALANCE` — requested amount exceeds savings balance.
- Intent failed (bundled flow) — atomic revert. No funds moved.
