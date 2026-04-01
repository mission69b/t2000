---
name: t2000-save
description: >-
  Deposit into savings to earn yield on Sui via NAVI Protocol. Use when
  asked to save money, earn interest, deposit to savings, or put funds
  to work. Not for sending to other addresses — use t2000-send for that.
license: MIT
metadata:
  author: t2000
  version: "1.5"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Save (Deposit to Savings)

## Purpose
Deposit USDC into savings to earn yield on NAVI Protocol. Funds remain non-custodial and
withdrawable at any time.

## Command
```bash
t2000 save <amount>
t2000 save all

# Examples:
t2000 save 80
t2000 save all
```

- `save all`: deposits full available USDC minus $1 reserve for gas

## Fees
- Protocol fee: 0.1% on deposit (collected atomically on-chain)

## Output
```
✓ Gas manager: $1.00 USDC → SUI          [only shown if auto-topup triggered]
✓ Saved $XX.XX USDC to best rate
✓ Current APY: X.XX%
✓ Savings balance: $XX.XX USDC
  Tx: https://suiscan.xyz/mainnet/tx/0x...
```

## Notes
- APY is variable based on protocol utilization
- If available balance is $0 after gas conversion, returns INSUFFICIENT_BALANCE
- `t2000 supply` is an alias for `t2000 save`
