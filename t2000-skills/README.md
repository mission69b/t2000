# t2000 Agent Skills

Agent Skills for the [t2000](https://t2000.ai) Agentic Wallet on Sui. Install once and your AI agent gains the ability to check balances, send payments, earn yield, borrow, swap, stake, and pay for MPP API services — all on Sui.

## One-Prompt Install (recommended)

Paste this into Claude, Cursor, Windsurf, or any LLM with shell access:

```
Run curl -sL https://t2000.ai/skills/t2000-setup, and use the returned setup
instructions to set up my Agentic Wallet.
```

The LLM fetches the `t2000-setup` skill from `t2000.ai/skills/t2000-setup` and walks you through CLI install → wallet init → safeguards → MCP wiring → balance verification.

## Browse the Skills Manifest

The manifest is served at `https://t2000.ai/.well-known/agent-skills/index.json` (Circle-compatible Agent Skills index). Each individual skill is served at `https://t2000.ai/skills/<slug>` as plain markdown — `curl` the URL or open in a browser.

## Install (legacy npm flow)

```bash
npx skills add mission69b/t2000-skills
```

Works with Claude Code, OpenAI Codex, GitHub Copilot, Cursor, VS Code, and any platform supporting the [Agent Skills standard](https://agentskills.io).

### Manual Setup

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
| `t2000-setup` | "set up t2000", "install Agentic Wallet", "connect to Claude / Cursor" |
| `t2000-check-balance` | "check balance", "how much USDC do I have" |
| `t2000-send` | "send 10 USDC to...", "pay X", "send to a contact" |
| `t2000-receive` | "share my address", "create payment link", "QR code" |
| `t2000-save` | "deposit to savings", "earn yield", "swap and save" |
| `t2000-withdraw` | "withdraw from savings", "close my position", "emergency withdraw" |
| `t2000-borrow` | "borrow 40 USDC", "take out a loan", "borrow against savings" |
| `t2000-repay` | "repay my loan", "pay back..." |
| `t2000-swap` | "swap 100 USDC for SUI", "trade", "convert tokens" |
| `t2000-stake` | "stake SUI", "liquid staking", "vSUI" |
| `t2000-yields` | "best yield?", "compare APYs", "where to park USDC" |
| `t2000-pay` | "call that paid API", "pay for MPP service" |
| `t2000-contacts` | "add contact", "send to alice", "list contacts" |
| `t2000-safeguards` | "set spending limit", "lock agent", "show config" |
| `t2000-account-report` | "full report", "account summary", "show me everything" |
| `t2000-rebalance` | "rebalance my portfolio", "adjust my allocation" |
| `t2000-mcp` | "install MCP server", "connect to Claude" |
| `t2000-engine` | "use the engine programmatically", "build an agent" |

## Prerequisites

```bash
npx @t2000/cli init
```

The t2000 CLI must be installed and an Agentic Wallet initialized before any skill can execute.
See [t2000.ai](https://t2000.ai) for full documentation.

## Skill Format

Each skill follows the [Agent Skills standard](https://agentskills.io):

```yaml
---
name: t2000-check-balance        # unique skill identifier
description: >-                   # when to use this skill (agent reads this)
  Check the t2000 Agentic Wallet balance on Sui...
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

t2000 is the infrastructure behind [Audric](https://audric.ai) — checking (send/receive),
savings (earn yield via NAVI), credit (borrow against deposits),
and MCP-first integration in one CLI command. USDC in, USDC out.

- **SDK**: `npm install @t2000/sdk`
- **CLI**: `npx @t2000/cli init`
- **Docs**: [t2000.ai](https://t2000.ai)
- **GitHub**: [github.com/mission69b/t2000](https://github.com/mission69b/t2000)

## License

MIT
