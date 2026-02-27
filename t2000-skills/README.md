# t2000 Agent Skills

Agent Skills for the [t2000](https://t2000.ai) bank account on Sui. Install once and your AI
agent gains the ability to check balances, send payments, earn yield, swap
tokens, borrow, and pay for x402 API services — all on Sui.

## Install

```bash
npx skills add t2000/t2000-skills
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
| `t2000-save` | "deposit to savings", "earn yield on..." |
| `t2000-withdraw` | "withdraw from savings", "access my deposits" |
| `t2000-swap` | "swap USDC for SUI", "convert..." |
| `t2000-borrow` | "borrow 40 USDC", "take out a loan" |
| `t2000-repay` | "repay my loan", "pay back..." |
| `t2000-pay` | "call that paid API", "pay for x402 service" |

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

t2000 is the first bank account for AI agents on Sui — checking (send/receive),
savings (earn yield via NAVI), credit (borrow against deposits), and currency
exchange (swap via Cetus) in one CLI command.

- **SDK**: `npm install @t2000/sdk`
- **CLI**: `npx @t2000/cli init`
- **Docs**: [t2000.ai](https://t2000.ai)
- **GitHub**: [github.com/mission69b/t2000](https://github.com/mission69b/t2000)

## License

MIT
