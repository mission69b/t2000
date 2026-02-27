---
name: t2000-swap
description: >-
  Swap one token for another using Cetus DEX on Sui. Use when asked to
  exchange tokens, convert USDC to SUI, trade one asset for another, or
  change currency. No protocol fee — only standard Cetus pool fees.
  Slippage is enforced on-chain.
license: MIT
metadata:
  author: t2000
  version: "1.1"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Swap Tokens

## Purpose
Execute a token swap through Cetus DEX with on-chain slippage protection.

## Command
```bash
t2000 swap <amount> <from> <to>
t2000 swap <amount> <from> <to> --slippage <percent>

# Examples:
t2000 swap 5 USDC SUI
t2000 swap 100 USDC SUI
t2000 swap 10 USDC SUI --slippage 0.5
```

## Fees
- Protocol fee: **Free** — no t2000 fee on swaps
- DEX fee: Cetus standard (typically 0.01–0.05%)
- Fees shown in the pre-flight preview before execution

## Output
```
Preview:
  Sending:           XX.XX USDC
  Receiving:         ~XX.XX SUI (at current price)
  Slippage tolerance: 1.00%
  Min received:      XX.XX SUI (guaranteed on-chain)

✓ Swapped XX.XX USDC → XX.XX SUI
  Tx: https://suiscan.xyz/mainnet/tx/0x...
```

## Notes
- Slippage is enforced on-chain via Cetus `sqrt_price_limit` — transaction
  reverts if actual price moves beyond tolerance
- Default slippage: 1%. Reduce for large swaps on thin markets.
- Supported: any Cetus-listed pair (USDC, SUI, USDT, and more)
