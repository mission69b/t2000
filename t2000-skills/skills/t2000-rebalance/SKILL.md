---
name: t2000-rebalance
description: >-
  Rebalance the wallet to a target allocation by executing multiple swaps
  in one atomic Payment Intent. Use when asked to rebalance, adjust
  allocation, "shuffle my positions", or move from one set of holdings
  to another. Every leg prices against the same on-chain snapshot — no
  cross-leg slippage drift; user signs once.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Rebalance Portfolio

## Purpose
Move from a current allocation to a target allocation by emitting all
the required `swap_execute` calls **in the same assistant turn** so the
engine compiles them into one Payment Intent. Result: every leg of the
rebalance prices against the same Sui state, slippage is bounded once,
and the user signs once.

## When to use

- "Rebalance my portfolio to 60% USDC / 30% SUI / 10% GOLD"
- "Move everything to USDC"
- "Adjust my allocation — I want less SUI exposure"
- "I'm 80% SUI, get me to 50/50 with USDC"

## Flow

### Step 1 — Current allocation
Call `balance_check` (engine) or `t2000_balance --json` (CLI) to get the
current breakdown. Compute the percentage held in each asset by USD value.

### Step 2 — Plan trades
For each asset, compute the delta vs the target:
- Asset over-allocated → swap **out** to USDC (or another reduce-target asset)
- Asset under-allocated → swap **in** from USDC (or another excess-source asset)

Present the plan to the user **before** executing:

```
📊 REBALANCE PLAN
─────────────────
              Current   Target   Δ
  USDC         $400      $600   +$200
  SUI          $400      $300   −$100
  GOLD         $200      $100   −$100

Trades (1 atomic Payment Intent):
  1. swap 0.5 SUI → ~$100 USDC
  2. swap 0.05 GOLD → ~$100 USDC

Estimated slippage: 0.3% on each leg
Proceed?
```

### Step 3 — Execute (bundled)

**Critical:** emit ALL the `swap_execute` calls as parallel `tool_use` blocks
**in the same assistant turn**. The engine's permission gate compiles them
into ONE Payment Intent. The user signs once; every leg either succeeds or
the whole rebalance reverts.

**Do NOT** call them sequentially across turns — that defeats the atomicity
and exposes the user to price drift between legs.

```
[ASSISTANT TURN — emit in parallel]
  tool_use: swap_execute({ from: "SUI",  to: "USDC", amount: 0.5  })
  tool_use: swap_execute({ from: "GOLD", to: "USDC", amount: 0.05 })
```

### Step 4 — Summary
After the Payment Intent settles, call `balance_check` again and show the
final allocation vs target. Highlight any drift > 1% (caused by slippage
or rounding) and ask if the user wants a follow-up swap to close it.

## Error handling

| Error | Cause | What to do |
|---|---|---|
| Intent failed — `INSUFFICIENT_BALANCE` | One of the swap legs would consume more than the wallet holds | Abort the entire intent (no swaps execute). Reduce the amount on the offending leg. |
| Intent failed — `SLIPPAGE_EXCEEDED` | A leg exceeded the configured slippage tolerance | Abort. Re-run with looser slippage OR smaller leg sizes. |
| Intent failed — any reason | Atomic Payment Intent reverts the WHOLE bundle | No funds moved. Tell the user the on-chain state is unchanged. |

## CLI fallback (no bundling)

The CLI does not support Payment Intent bundling today. To rebalance from
the CLI, execute swaps one at a time:

```bash
t2000 swap 0.5 SUI to USDC
t2000 swap 0.05 GOLD to USDC
```

Each swap prices against the on-chain state **at the moment of execution**,
which means small drift between legs. For larger rebalances ($1k+) prefer
the agent path (which bundles into one Payment Intent).

## Fees

Per swap leg:
- Cetus protocol fee: ~0.1% of swap amount (varies by pool)
- Audric overlay fee: 10 bps (~0.1%)

Bundled rebalances pay the same per-leg fees — bundling reduces slippage
risk, not fee cost.

## Notes

- This skill is **engine-first** — the bundling guarantee only exists in
  the audric/web chat agent (or any engine consumer with Payment Intent
  compile support).
- For "optimize my yield" intent (sweep idle USDC into best-APY savings,
  claim rewards, compare USDC pools), use the `optimize-all` MCP prompt
  instead — that's a different shape of workflow.
- Health-factor check **does not run** for swap-only rebalances (no
  collateral position changes). For rebalances that involve withdrawing
  from savings, see `t2000-withdraw` (the safety check runs there).
