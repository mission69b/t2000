---
name: t2000-invest
description: >-
  Buy and sell crypto assets (SUI, BTC, ETH) through the t2000 agent.
  Use when asked about investing, buying crypto, portfolio performance,
  unrealized P&L, or selling investment positions. Invested assets are
  locked — must sell back to USDC to access value.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Invest

## Purpose
Buy and sell crypto assets with dollar-denominated commands. Full portfolio
tracking with cost basis and P&L. Invested assets are logically locked —
to access value, sell back to USDC via `invest sell`.

## Commands
```bash
t2000 invest buy 100 SUI           # Invest $100 in SUI
t2000 invest buy 500 BTC           # Invest $500 in Bitcoin
t2000 invest sell 50 SUI           # Sell $50 worth of SUI
t2000 invest sell all ETH          # Sell entire ETH position
t2000 portfolio                    # Show all positions + P&L
```

## Output (invest buy)
```
  ✓ Bought 105.26 SUI at $0.95
    Invested:       $100.00
    Portfolio:      105.26 SUI (avg $0.95)
    Tx: https://suiscan.xyz/mainnet/tx/...
```

## Output (invest sell)
```
  ✓ Sold 52.63 SUI at $0.97
    Proceeds:       $51.05
    Realized P&L:   +$1.05 (+2.1%)
    Remaining:      52.63 SUI (avg $0.95)
    Tx: https://suiscan.xyz/mainnet/tx/...
```

## Output (portfolio)
```
  Investment Portfolio
  ─────────────────────────────────────────────────────
  SUI     105.26    Avg: $0.95    Now: $0.97    +$2.10 (+2.1%)
  ─────────────────────────────────────────────────────
  Total invested:   $100.00
  Current value:    $102.10
  Unrealized P&L:   +$2.10 (+2.1%)
```

## Investment Locking
- Invested assets are locked — you cannot `send` or `exchange` them directly
- To access value: `t2000 invest sell <amount> <asset>` → proceeds go to checking
- Free (non-invested) SUI can still be sent normally
- Error if trying to send invested assets: "Cannot send X SUI — Y SUI is invested"

## Available Assets
- **SUI** — Sui native token
- **BTC** — Bitcoin (wBTC via SuiBridge)
- **ETH** — Ethereum (wETH via SuiBridge)

## Notes
- Amounts are always in USD: `invest buy 100 SUI` means "spend $100 to buy SUI"
- `--slippage <pct>` option controls max slippage (default 3%)
- Investment shows in `t2000 balance` as a separate line with P&L
- Portfolio data is stored locally in `~/.t2000/portfolio.json`
- Use `--json` flag for machine-parseable output
