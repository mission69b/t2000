# t2000 Agent Skills

Agent Skills for the [t2000](https://t2000.ai) Agentic Wallet on Sui. Install once and your AI agent gains the ability to check balances, send payments, earn yield, borrow, swap, and pay for MPP API services — all on Sui.

## How to install (one section, three paths)

Pick the path that matches how you want your AI client to consume the skills. **Most users want Path 1.**

### Path 1 — One-prompt install (recommended)

Paste this into Claude Desktop, Cursor, Windsurf, Cline, or any LLM with shell access:

```
Run curl -sL https://t2000.ai/skills/t2000-setup, and use the returned setup
instructions to set up my Agentic Wallet.
```

What happens:
1. The LLM fetches the `t2000-setup` skill and walks you through CLI install → wallet init → safeguards → `t2000 mcp install`.
2. After `t2000 mcp install`, the `@t2000/mcp` stdio server is wired into your AI client.
3. **All 21 skills appear as `/skill-balance`, `/skill-save`, `/skill-borrow`, etc. slash commands inside your AI client** — alongside the 14 workflow prompts (`/financial-report`, `/optimize-yield`, etc.) and the 27 `t2000_*` MCP tools.

**No separate skill install needed.** This is the canonical path because it gives you tools (which the LLM can call) AND skill prompts (which you can invoke explicitly) in one shot.

### Path 2 — Local skill files (if you want SKILL.md files in your workspace)

Use this if your AI client reads skills from a project-local directory (e.g., a team repo where skills are checked into git) instead of going through MCP.

```bash
# Single command, all 21 skills, agentskills.io standard layout (v3.3.0+)
npx @t2000/cli skills install                  # writes to ./.agents/skills/<slug>/SKILL.md
npx @t2000/cli skills install --global         # writes to ~/.agents/skills/<slug>/SKILL.md
npx @t2000/cli skills install --target=cursor  # writes to ./.cursor/rules/t2000-<slug>.mdc
npx @t2000/cli skills install t2000-save       # install just one skill
npx @t2000/cli skills install mpp-image-gen    # install just one MPP recipe
npx @t2000/cli skills list                     # list available skills + versions
npx @t2000/cli skills uninstall                # remove every skill from the target
```

The CLI fetches from [`https://t2000.ai/.well-known/agent-skills/index.json`](https://t2000.ai/.well-known/agent-skills/index.json) at install time, so you always get the latest published skills regardless of CLI version. Network is required at install time; for offline install, use Path 3 (git clone) and copy from `t2000-skills/skills/<slug>/SKILL.md` directly.

Or via the agentskills.io npm flow (works with Claude Code, OpenAI Codex, GitHub Copilot, Cursor, VS Code, and any client supporting the [Agent Skills standard](https://agentskills.io)):

```bash
npx skills add mission69b/t2000-skills
```

### Path 3 — Manual (last resort)

Clone the repo if you need raw access to every SKILL.md file:

```bash
git clone https://github.com/mission69b/t2000-skills.git
```

Or copy individual `skills/<name>/SKILL.md` files into your agent's context — but prefer Path 1 or 2 because they keep all 21 skills together and stay in sync as we ship updates.

## Browse the Skills Manifest

The manifest is served at [`https://t2000.ai/.well-known/agent-skills/index.json`](https://t2000.ai/.well-known/agent-skills/index.json) (Circle-compatible Agent Skills index). Each individual skill is served at `https://t2000.ai/skills/<slug>` as plain markdown — `curl` the URL or open in a browser.

## Verifying the install worked

After Path 1 (recommended), restart your AI client, then:

1. Type `/` in the chat to open the prompt picker. You should see entries starting with `skill-` (one per skill) and the 14 workflow prompts (`financial-report`, `optimize-yield`, etc.).
2. Run the `t2000_balance` tool by asking "what's my t2000 balance?" — the AI calls the MCP tool and returns wallet + savings + total.
3. Invoke a skill explicitly: type `/skill-balance` (or `/skill-save`, etc.) — the skill markdown loads as a prompt and primes the assistant for that operation.

If you don't see any `skill-*` or `t2000_*` entries, the MCP server didn't load — see the `t2000-mcp` skill's Troubleshooting section.

## Available Skills

### Core wallet skills (17)

| Skill | Trigger | MCP prompt name |
|-------|---------|----------------|
| `t2000-setup` | "set up t2000", "install Agentic Wallet", "connect to Claude / Cursor" | `skill-setup` |
| `t2000-check-balance` | "check balance", "how much USDC do I have" | `skill-check-balance` |
| `t2000-send` | "send 10 USDC to...", "pay X", "send to a contact" | `skill-send` |
| `t2000-receive` | "share my address", "create payment link", "QR code" | `skill-receive` |
| `t2000-save` | "deposit to savings", "earn yield", "swap and save" | `skill-save` |
| `t2000-withdraw` | "withdraw from savings", "close my position", "emergency withdraw" | `skill-withdraw` |
| `t2000-borrow` | "borrow 40 USDC", "take out a loan", "borrow against savings" | `skill-borrow` |
| `t2000-repay` | "repay my loan", "pay back..." | `skill-repay` |
| `t2000-swap` | "swap 100 USDC for SUI", "trade", "convert tokens" | `skill-swap` |
| `t2000-yields` | "best yield?", "compare APYs", "where to park USDC" | `skill-yields` |
| `t2000-pay` | "call that paid API", "pay for MPP service" (generic reference) | `skill-pay` |
| `t2000-contacts` | "add contact", "send to alice", "list contacts" | `skill-contacts` |
| `t2000-safeguards` | "set spending limit", "lock agent", "show config" | `skill-safeguards` |
| `t2000-account-report` | "full report", "account summary", "show me everything" | `skill-account-report` |
| `t2000-rebalance` | "rebalance my portfolio", "adjust my allocation" | `skill-rebalance` |
| `t2000-mcp` | "install MCP server", "connect to Claude" | `skill-mcp` |
| `t2000-engine` | "use the engine programmatically", "build an agent" | `skill-engine` |

### MPP recipes (4) — paid API services via `t2000 pay`

The MPP gateway at [mpp.t2000.ai](https://mpp.t2000.ai) exposes 40 paid API services (OpenAI, Anthropic, Brave, Firecrawl, ElevenLabs, Lob, …) over the Machine Payments Protocol. Each call pays $0.005 – $1.50 in USDC. These recipes are deep dives on the most-used services + an index for the rest.

| Skill | Trigger | MCP prompt name |
|-------|---------|----------------|
| `mpp-image-gen` | "generate an image", "make a thumbnail", "draw / paint / render…" | `skill-mpp-image-gen` |
| `mpp-gpt4o` | "ask GPT-4o", "summarize", "extract structured data", "classify" | `skill-mpp-gpt4o` |
| `mpp-transcription` | "transcribe this audio / podcast / meeting" | `skill-mpp-transcription` |
| `mpp-index` | "what MPP services are available?", "which API can do X?" | `skill-mpp-index` |

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
