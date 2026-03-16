---
name: t2000-safeguards
description: >-
  Configure spending limits and safety controls for t2000 agent wallets.
  Use when asked to set transaction limits, daily send limits, lock or
  unlock the agent, view safeguard settings, or protect the wallet from
  unauthorized spending. Required before enabling MCP server access.
license: MIT
metadata:
  author: t2000
  version: "1.5"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Agent Safeguards

## Purpose
Configure spending limits and safety guardrails for autonomous agent
operation. Three controls: agent lock (kill switch), per-transaction
limit, and daily send limit.

> Safeguards are enforced on all channels: CLI, MCP, and the AI Gateway
> (Telegram/WebChat). The gateway's confirmation flow is an additional
> layer — all state-changing actions require explicit "yes" before execution.

## Commands
```bash
t2000 config show                    # view all safeguard settings
t2000 config set maxPerTx 500        # max $500 per outbound transaction
t2000 config set maxDailySend 1000   # max $1000 outbound per day
t2000 lock                           # freeze ALL operations immediately
t2000 unlock                         # resume operations (requires PIN)
```

## Controls

| Control | Description | Default |
|---------|-------------|---------|
| `maxPerTx` | Max USDC per single outbound op (send/pay) | 0 (unlimited) |
| `maxDailySend` | Max total USDC outbound per calendar day | 0 (unlimited) |
| `locked` | Kill switch — freezes ALL operations | false |

## What counts as outbound
- `t2000 send` — transfers to other addresses
- `t2000 pay` — x402 API payments
- `t2000 sentinel attack` — sentinel bounties

## What is NOT limited
Internal operations (save, withdraw, borrow, repay, exchange, rebalance)
move funds within the agent's own wallet and protocol positions. They
are not subject to send limits.

## Output (config show)
```
  Agent Safeguards
  ─────────────────────────────────
  Locked:             No
  Per-transaction:    $500.00
  Daily send limit:   $1,000.00 ($350.00 used today)
```

## Blocked output
```
  ✗ Blocked: amount $1,000.00 exceeds per-transaction limit ($500.00)
  ✗ Blocked: daily send limit reached ($1,000.00/$1,000.00 used today)
  ✗ Agent is locked. All operations frozen.
```

## JSON mode
```bash
t2000 config show --json
```
```json
{ "locked": false, "maxPerTx": 500, "maxDailySend": 1000, "dailyUsed": 350 }
```

## SDK
```typescript
const agent = await T2000.create({ pin });

// Check config
agent.enforcer.getConfig();       // { locked, maxPerTx, maxDailySend, dailyUsed, ... }
agent.enforcer.isConfigured();    // true if any limit is non-zero

// Set limits
agent.enforcer.set('maxPerTx', 500);
agent.enforcer.set('maxDailySend', 1000);

// Lock/unlock
agent.enforcer.lock();
agent.enforcer.unlock();
```

## Important
- Safeguards are opt-in — defaults are permissive (0 = unlimited)
- MCP server requires non-zero limits before starting
- Lock freezes ALL operations (including internal) as a safety measure
- Daily counter resets at midnight UTC
