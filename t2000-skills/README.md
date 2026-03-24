# t2000 Agent Skills

Agent Skills for the [t2000](https://t2000.ai) bank account on Sui. Install once and your AI
agent gains the ability to check balances, send payments, earn yield,
borrow, invest in SUI/BTC/ETH/GOLD, and pay for MPP API services — all on Sui.

## Install

```bash
npx skills add mission69b/t2000-skills
```

Works with Claude Code, OpenAI Codex, GitHub Copilot, Cursor, VS Code, and
any platform supporting the [Agent Skills standard](https://agentskills.io).

### Alternative: Manual Setup

**Cursor / VS Code:**
```bash
git clone https://github.com/mission69b/t2000-skills.git .cursor/skills/t2000-skills
```

**Claude Code / Devin / Other Frameworks:**
```bash
git clone https://github.com/mission69b/t2000-skills.git
```

Or copy any `skills/*/SKILL.md` file directly into your agent's context.

## Available Skills

| Skill | Trigger |
|-------|---------|
| `t2000-check-balance` | "check balance", "how much USDC do I have" |
| `t2000-send` | "send 10 USDC to...", "pay X" |
| `t2000-save` | "deposit to savings", "earn yield" |
| `t2000-withdraw` | "withdraw from savings", "access my deposits" |
| `t2000-borrow` | "borrow 40 USDC", "take out a loan" |
| `t2000-repay` | "repay my loan", "pay back..." |
| `t2000-exchange` | "swap USDC to SUI", "exchange tokens", "convert to..." (CLI: `t2000 swap`) |
| `t2000-pay` | "call that paid API", "pay for MPP service" |
| `t2000-sentinel` | "attack a sentinel", "earn bounties" |
| `t2000-rebalance` | "optimize yield", "rebalance savings" |
| `t2000-invest` | "buy SUI", "invest $100 in BTC", "sell my ETH", "buy GOLD", "show portfolio" (CLI: `t2000 buy` / `t2000 sell`) |
| `t2000-contacts` | "add contact", "send to alice", "list contacts" |
| `t2000-safeguards` | "set spending limit", "lock agent", "show config" |
| `t2000-mcp` | "install MCP server", "connect to Claude" |

## Prerequisites

```bash
npx @t2000/cli init
```

The t2000 CLI must be installed and a bank account initialized before any skill can execute.
See [t2000.ai](https://t2000.ai) for full documentation.

## Skill Format

Each skill follows the [Agent Skills standard](https://agentskills.io):

```yaml
---
name: t2000-check-balance        # unique skill identifier
description: >-                   # when to use this skill (agent reads this)
  Check the t2000 agent bank account balance on Sui...
license: MIT
metadata:
  author: t2000
  version: "1.2"
  requires: t2000 CLI (npx @t2000/cli init)
---

# Skill body with commands, output examples, and error handling
```

The `description` field is critical — it tells the AI agent *when* to activate this skill.
Write it as a list of natural language triggers the agent should match against.

## What is t2000?

t2000 is a bank account for AI agents on Sui — checking (send/receive),
savings (earn yield via NAVI + Suilend), credit (borrow against deposits),
swap (Cetus DEX), investment (buy/sell SUI, BTC, ETH, GOLD with cost-basis P&L),
and MCP-first messaging in one CLI command. USDC in, USDC out — multi-stablecoin optimization happens
internally via rebalance.

- **SDK**: `npm install @t2000/sdk`
- **CLI**: `npx @t2000/cli init`
- **Docs**: [t2000.ai](https://t2000.ai)
- **GitHub**: [github.com/mission69b/t2000](https://github.com/mission69b/t2000)

## License

MIT
