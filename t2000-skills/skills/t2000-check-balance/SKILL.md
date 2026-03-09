---
name: t2000-check-balance
description: >-
  Check the t2000 agent wallet balance on Sui. Use when asked about wallet
  balance, how much USDC/stablecoins are available, savings balance, gas
  reserve, total funds, or portfolio value. Shows all stablecoins held
  (USDC, USDT, USDe, USDsui). Also use before any send or borrow
  operation to confirm sufficient funds exist.
license: MIT
metadata:
  author: t2000
  version: "1.3"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Check Balance

## Purpose
Fetch the current balance across all accounts: available stablecoins
(USDC, USDT, USDe, USDsui), savings (NAVI + Suilend), gas reserve
(SUI), and total portfolio value.

## Commands
```bash
t2000 balance                 # human-readable summary
t2000 balance --show-limits   # includes maxWithdraw, maxBorrow, healthFactor
t2000 balance --json          # machine-parseable JSON (works on all commands)
```

## Output (default)
```
Available:  $150.00  (100.00 USDC + 50.00 USDT)
Savings:    $2,000.00  (earning 5.1% avg APY)
Gas:        0.5 SUI    (~$0.50)
──────────────────────────────────────
Total:      $2,150.50
```

If only one stablecoin is held, the breakdown is omitted.
The balance shows all 4 supported stablecoins with non-zero balances.

## Output (--show-limits)
Appends to the above:
```
Limits:
  Max withdraw:   $XX.XX
  Max borrow:     $XX.XX
  Health factor:  X.XX          (∞ if no active loan)
```

## Notes
- Balances for all 4 stablecoins (USDC, USDT, USDe, USDsui) are shown
- `gasReserve.usdEquiv` is an estimate at current SUI price; it fluctuates
  without any swap occurring
- If balance shows $0.00 available and wallet was just created, fund it first
  via Coinbase Onramp or a direct USDC transfer to the wallet address
- `--json` is a global flag that works on all t2000 commands, not just balance
- After `t2000 rebalance`, non-USDC stablecoins may appear in the balance
