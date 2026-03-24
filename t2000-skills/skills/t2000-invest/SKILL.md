---
name: t2000-invest
description: >-
  Buy, sell, and earn yield on crypto assets (SUI, BTC, ETH, GOLD) through the t2000 agent.
  Supports investment strategies (predefined portfolios) and auto-invest (DCA).
  Use when asked about investing, buying crypto, portfolio performance,
  unrealized P&L, selling positions, earning yield, strategies, or DCA.
license: MIT
metadata:
  author: t2000
  version: "3.0"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Invest

## Purpose
Buy, sell, and earn yield on crypto assets with dollar-denominated commands.
Supports predefined strategies (multi-asset portfolios) and auto-invest (DCA).
Full portfolio tracking with cost basis, P&L, yield APY, and strategy grouping.
All investment commands work via CLI and MCP.

## Commands — Direct Investment
```bash
t2000 buy 100 SUI                  # Invest $100 in SUI
t2000 buy 500 BTC                  # Invest $500 in Bitcoin
t2000 sell 50 SUI                  # Sell $50 worth of SUI
t2000 sell all ETH                 # Sell entire ETH position
t2000 invest earn SUI              # Deposit SUI into best lending protocol for yield
t2000 invest unearn SUI            # Withdraw from lending (stays in portfolio)
t2000 invest rebalance             # Move earning positions to better-rate protocols
t2000 invest rebalance --dry-run   # Preview rebalance moves without executing
t2000 portfolio                    # Show all positions + P&L + yield
```

> **Deprecated aliases:** `t2000 invest buy` and `t2000 invest sell` still work but are deprecated. Use `t2000 buy` / `t2000 sell` instead.

## Commands — Strategies
```bash
t2000 invest strategy list                          # Show available strategies
t2000 invest strategy buy bluechip 200              # Buy $200 into bluechip strategy
t2000 invest strategy buy bluechip 200 --dry-run    # Preview allocation before executing
t2000 invest strategy sell bluechip                  # Sell all positions in strategy
t2000 invest strategy status bluechip                # Check weights + drift
t2000 invest strategy rebalance bluechip             # Rebalance to target weights
t2000 invest strategy create my-strat --alloc SUI:60 BTC:20 ETH:20
t2000 invest strategy delete my-strat
```

## Commands — Auto-Invest (DCA)
```bash
t2000 invest auto setup 50 weekly bluechip    # $50/week into bluechip strategy
t2000 invest auto setup 100 monthly SUI       # $100/month into SUI
t2000 invest auto status                       # Show all DCA schedules
t2000 invest auto run                          # Execute pending DCA purchases
t2000 invest auto stop <id>                    # Stop a schedule
```

## Predefined Strategies
- **bluechip** — BTC 50%, ETH 30%, SUI 20% (large-cap crypto index)
- **all-weather** — BTC 30%, ETH 20%, SUI 20%, GOLD 30% (crypto + commodities)
- **safe-haven** — BTC 50%, GOLD 50% (store-of-value assets)
- **layer1** — ETH 50%, SUI 50% (smart contract platforms)
- **sui-heavy** — SUI 60%, BTC 20%, ETH 20% (Sui-weighted portfolio)

## Output (strategy buy)
```
  ✓ Invested $200.00 in bluechip strategy
  ──────────────────────────────────────
  BTC:     0.0012    @ $85,000.00
           Tx: https://suiscan.xyz/mainnet/tx/...
  ETH:     0.026     @ $2,300.00
           Tx: https://suiscan.xyz/mainnet/tx/...
  SUI:     41.24     @ $0.97
           Tx: https://suiscan.xyz/mainnet/tx/...
  ──────────────────────────────────────
  Total invested:  $200.00
```

## Output (strategy buy --dry-run)
```
  Strategy: bluechip — Dry Run ($200.00)
  ──────────────────────────────────────
  BTC:     $100.00 → ~0.0012 BTC @ $85,000.00
  ETH:     $60.00  → ~0.026 ETH @ $2,300.00
  SUI:     $40.00  → ~41.24 SUI @ $0.97
  ──────────────────────────────────────
  ℹ Run without --dry-run to execute
```

## Output (auto setup)
```
  ✓ Auto-invest created: $50.00 weekly → bluechip
    Schedule ID:  a1b2c3d4
    Next run:     3/19/2026
    ℹ Run manually: t2000 invest auto run
```

## Output (portfolio with strategies)
```
  Investment Portfolio
  ▸ Bluechip / Large-Cap
  ──────────────────────────────────────
  BTC:     0.0012    Avg: $85,000    Now: $86,200    +$1.44 (+1.4%)
  ETH:     0.026     Avg: $2,300     Now: $2,350     +$1.30 (+2.2%)
  SUI:     41.24     Avg: $0.97      Now: $0.98      +$0.41 (+1.0%)
  Subtotal: $203.15

  ▸ Direct
  ──────────────────────────────────────
  SUI:     105.26    Avg: $0.95      Now: $0.98      +$3.16 (+3.0%)    2.5% APY (NAVI)
  Subtotal: $103.15
  ──────────────────────────────────────
  Total invested:   $300.00
  Current value:    $306.30
  Unrealized P&L:   +$6.30 (+2.1%)
```

## Investment Locking
- Invested assets are locked — you cannot `send` or `swap` them directly
- To access value: `t2000 sell <amount> <asset>` → proceeds go to checking
- `sell` auto-withdraws from lending if the asset is earning

## Earning Yield
- `invest earn <asset>` deposits the full position into the best-rate lending protocol
- Compares NAVI vs Suilend rates and picks the highest APY
- SUI, ETH supported on both; BTC on Suilend
- `invest unearn <asset>` withdraws from lending — asset stays in portfolio
- `invest rebalance` checks all earning positions and moves any where another protocol offers a higher APY
- Rebalance uses a 0.1% minimum difference threshold by default (`--min-diff` to override)
- Earning applies to direct positions only (V1)

## Available Assets
- **SUI** — Sui native token (yield via NAVI, Suilend)
- **BTC** — Bitcoin (wBTC LayerZero, yield via Suilend)
- **ETH** — Ethereum (wETH, yield via NAVI, Suilend)
- **GOLD** — Tokenized gold (XAUm, yield via NAVI, Suilend)

## Notes
- Amounts are always in USD: `buy 100 SUI` means "spend $100 to buy SUI"
- `--slippage <pct>` option controls max slippage (default 3%)
- Investment shows in `t2000 balance` as a separate line with P&L and earning APY
- Strategy positions are tracked separately from direct positions
- Portfolio data: `~/.t2000/portfolio.json`, strategies: `~/.t2000/strategies.json`
- Auto-invest schedules: `~/.t2000/auto-invest.json`
- Use `--json` flag for machine-parseable output
