---
name: t2000-rebalance
description: >-
  Optimize yield by moving savings to the best rate across stablecoins.
  Use when asked to optimize yield, rebalance, find better rates,
  maximize APY, or improve returns. Supports dry-run preview before
  execution.
license: MIT
metadata:
  author: t2000
  version: "1.4"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Rebalance (Yield Optimizer)

## Purpose
Automatically find and execute the best yield on NAVI Protocol.
Internally optimizes across all 4 stablecoins (USDC, suiUSDT, suiUSDe, USDsui)
— the user doesn't need to think about which stablecoin to hold. One
command moves savings from a lower-yielding position to the highest
available rate, handling withdrawals and deposits in sequence.

## Command
```bash
t2000 rebalance --dry-run       # preview the plan without executing
t2000 rebalance                 # execute (prompts for confirmation)
t2000 rebalance --yes           # skip confirmation prompt (for agents)

# With custom thresholds:
t2000 rebalance --min-diff 1.0              # only act on 1%+ APY difference
t2000 rebalance --dry-run --json            # machine-readable plan
```

## Workflow
1. Always run `--dry-run` first to see the plan
2. Review the economics (APY gain)
3. Run without `--dry-run` to execute (or add `--yes` for agents)

## Output (dry-run)
```
Rebalance Plan
──────────────────────────────────────
  From:    USDC on NAVI Protocol (4.21% APY)
  To:      suiUSDT on NAVI Protocol (5.40% APY)
  Amount:  $1,000.00

Economics
──────────────────────────────────────
  APY Gain:     +1.19%
  Annual Gain:  $11.90/year

Steps
──────────────────────────────────────
  1. Withdraw $1,000.00 USDC from NAVI
  2. Deposit $1,000.00 suiUSDT into NAVI

DRY RUN — Preview only, no transactions executed
  Run `t2000 rebalance` to execute.
```

## Output (executed)
```
  ✓ Rebalanced $1,000.00 → 5.40% APY
  Tx:  https://suiscan.xyz/mainnet/tx/0x...
  Gas:  0.0150 SUI
```

## Options
| Flag | Description | Default |
|------|-------------|---------|
| `--dry-run` | Preview without executing | false |
| `--min-diff <pct>` | Minimum APY difference to trigger | 0.5% |
| `--yes` | Skip confirmation prompt | false |
| `--json` | Machine-readable output | false |

## Safety
- Health factor check: refuses to rebalance if HF < 1.5 (active borrows)
- Minimum yield difference: ignores gains below 0.5% by default
- Confirmation prompt before execution (use `--yes` to skip for agents)
- If any step fails, stops and reports state

## When to use
- Periodically (weekly/monthly) to optimize yield
- After rate changes on the protocol
- When new stablecoins offer higher yields
- After `t2000 save` to potentially upgrade to a better rate

## Notes
- Multi-stablecoin optimization is handled internally — users save/withdraw in USDC only
- Withdraw always returns USDC (auto-converts non-USDC positions back)
