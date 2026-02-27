---
name: t2000-check-balance
description: >-
  Check the t2000 agent wallet balance on Sui. Use when asked about wallet
  balance, how much USDC is available, savings balance, gas reserve, total
  funds, or portfolio value. Also use before any send or borrow operation
  to confirm sufficient funds exist.
license: MIT
metadata:
  author: t2000
  version: "1.2"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Check Balance

## Purpose
Fetch the current balance across all accounts: available USDC (checking),
savings (NAVI deposit), gas reserve (SUI), and total portfolio value.

## Commands
```bash
t2000 balance                 # human-readable summary
t2000 balance --show-limits   # includes maxWithdraw, maxBorrow, healthFactor
t2000 balance --json          # machine-parseable JSON (works on all commands)
```

## Output (default)
```
Available:  $XX.XX USDC  (checking — spendable)
Savings:    $XX.XX USDC  (earning X.XX% APY)
Gas:        X.XX SUI     (~$X.XX)
──────────────────────────────────────
Total:      $XX.XX USDC
Earning ~$X.XX/day
```

The daily earnings line only appears when savings > 0.

## Output (--show-limits)
Appends to the above:
```
Limits:
  Max withdraw:   $XX.XX USDC
  Max borrow:     $XX.XX USDC
  Health factor:  X.XX          (∞ if no active loan)
```

## Notes
- `gasReserve.usdEquiv` is an estimate at current SUI price; it fluctuates
  without any swap occurring
- If balance shows $0.00 available and wallet was just created, fund it first
  via Coinbase Onramp or a direct USDC transfer to the wallet address
- `--json` is a global flag that works on all t2000 commands, not just balance
