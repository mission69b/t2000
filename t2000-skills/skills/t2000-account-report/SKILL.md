---
name: t2000-account-report
description: >-
  Render a complete account snapshot — wallet, savings, debt, recent
  activity, yield, and portfolio allocation, plus a short headline. Use
  when asked for a full report, account summary, "everything about my
  account", or "show me the full picture". Multi-tool orchestration —
  no single CLI command covers all six dimensions.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Account Report

## Purpose
Render a complete account snapshot across six dimensions — wallet, savings,
debt, recent activity, yield, portfolio allocation — followed by a 2–3
sentence headline. This is a **multi-tool orchestration**, not a single CLI
command. The right call sequence depends on the consumer:

| Consumer | Call pattern |
|---|---|
| **MCP / Cursor / Claude Desktop** | `t2000_overview` covers wallet + savings + debt + health + earnings + rewards in one call. Add `t2000_history` (limit: 20) and `t2000_positions` if you also want activity and per-position APYs. |
| **CLI** | `t2000 balance --show-limits` + `t2000 positions` + `t2000 history --limit 20` |
| **Engine (audric/web)** | 6 parallel read tools — one per rendered card (see below). Calling fewer tools = missing cards. |

## Engine orchestration (audric/web)

When called inside the Audric chat agent, each read tool renders a
canvas card. **Skipping a tool = missing card.** Always emit all six
tool_use blocks in parallel in the same assistant turn:

| Tool | Card | Purpose |
|---|---|---|
| `balance_check` | BALANCE CHECK | Wallet, savings, debt, total |
| `savings_info` | SAVINGS INFO | Per-position breakdown, supply/borrow APY, daily earnings |
| `health_check` | HEALTH CHECK | Health factor, supplied, borrowed, max borrow, liquidation threshold |
| `activity_summary` | ACTIVITY SUMMARY | Monthly tx breakdown by category |
| `yield_summary` | YIELD SUMMARY | Today / week / month / all-time earnings, projected yearly |
| `portfolio_analysis` | PORTFOLIO ANALYSIS | Allocation %, week change, insights |

After all six cards render, write a **2–3 sentence headline** that:
- Leads with net worth and weekly change.
- Mentions health factor in one phrase.
- Ends with the single most actionable insight (idle USDC, debt repayment, rate gap, etc).
- Does **NOT** narrate the cards' contents — they render themselves.
- Does **NOT** list asset percentages, APYs, or savings positions in prose.

Max 3 sentences total.

## CLI quick command (no canvas)

For terminal users who just want the numbers in their shell:

```bash
t2000 balance --show-limits
t2000 positions
t2000 history --limit 20
```

These three commands cover wallet + per-position APYs + recent activity.
For a one-shot machine-parseable version, add `--json` to each.

## Notes

- This skill orchestrates **read-only** tools — no signatures, no on-chain writes.
- For a workflow-shaped advisor brief on top of this snapshot (recommendations, USDC APY gap, rebalance suggestion), use the `financial-report` MCP prompt — it composes this skill plus advisor framing.
- If the user holds non-USDC tokens, the portfolio card surfaces them but does not flag them as "saveable" — see `t2000-save` for the USDC/USDsui save-eligibility rule.
