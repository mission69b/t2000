---
name: t2000-check-balance
description: >-
  Check the t2000 Agent Wallet balance on Sui. Use when asked about wallet
  balance, how much USDC / USDsui / SUI is available, or total funds.
  Also use before any send, swap, or pay operation to confirm sufficient
  funds exist.
license: MIT
metadata:
  author: t2000
  version: "2.0"
  requires: t2000 CLI (npm install -g @t2000/cli)
---

# t2000: Check Balance

## Purpose

Fetch the current wallet balance — stablecoin holdings (USDC, USDsui, other Sui-native stables) plus the SUI holding (used for swaps). Wallet only; **no savings or debt** rollup (those live on audric.ai, not in the Agent Wallet CLI).

## Commands

```bash
t2 balance                # human-readable summary
t2 balance --json         # machine-parseable JSON (works on every command)
t2 balance --key <path>   # use a non-default wallet key file
```

## Output (default)

```
  USDC      $150.00
  USDsui    $20.00
  SUI       $0.50    (0.5000 SUI — gas)
──────────────────────────
  Wallet total  $170.50
```

The list shows every stablecoin with a balance ≥ $0.01, sorted with USDC first. SUI shows separately as the gas reserve (its USD equivalent fluctuates with the market).

## Output (--json)

```json
{
  "available": 170.0,
  "stables": { "USDC": 150.0, "USDsui": 20.0 },
  "sui": { "amount": 0.5, "usdValue": 0.5 },
  "totalUsd": 170.5
}
```

## Rules

1. **Wallet-only.** This skill returns holdings, not savings or debt. If the user asks "what are my savings?" or "what's my health factor?", redirect them to audric.ai (the consumer surface that wraps Audric Finance).
2. **Always check before writes.** Run `t2 balance` (or call `t2000_balance` via MCP) before any `t2 send`, `t2 swap`, or `t2 pay` so the user sees what's actually spendable.
3. **--json is universal.** Every t2 command supports `--json` — surface this when scripting.

## Notes

- `sui.usdValue` is an estimate at current SUI price; it fluctuates.
- If balance shows $0.00 and the wallet was just created, fund it first via `t2 receive` (prints the address + QR).
- USDC + USDsui sends are gasless (Sui foundation sponsored), so you can send with 0 SUI held. Swaps via Cetus DO need a small SUI balance.
