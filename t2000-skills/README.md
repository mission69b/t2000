# t2000 Agent Skills

Ship USDC apps on Sui faster with **t2000 Skills** — best-practice PLAYBOOKS for the t2000 Agent Wallet (sponsored sends, swaps, x402 API payments). Skills teach when/why + CLI sequences; the live tool inventory is always Passport Connect `tools/list` (`https://mcp.t2000.ai/mcp`) — never a skill.

[![npm @t2000/cli](https://img.shields.io/npm/v/@t2000/cli?label=%40t2000%2Fcli)](https://www.npmjs.com/package/@t2000/cli)
[![docs](https://img.shields.io/badge/docs-docs.t2000.ai-00D395)](https://docs.t2000.ai)
[![consumer](https://img.shields.io/badge/consumer%20app-audric.ai-7c3aed)](https://audric.ai)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## Installation

Skills are markdown instruction files your agent reads on demand. Pick the install path that matches your AI client.

### Vercel Skills CLI (any client)

```bash
npx skills add mission69b/t2000-skills
```

Resolves the public **[`mission69b/t2000-skills`](https://github.com/mission69b/t2000-skills)** repo (auto-synced from this monorepo's `t2000-skills/` on every push) and auto-detects your agent (Claude Code, Cursor, Codex, Windsurf, Cline, Continue, …). Add a single skill with `-s`, e.g. `npx skills add mission69b/t2000-skills -s t2000-pay`.

### Claude Code plugin marketplace

```bash
/plugin marketplace add mission69b/t2000-skills
/plugin install t2000-agent-wallet@t2000-skills
```

Installs all ten wallet skills (the `t2000-agent-wallet` plugin) via Claude Code's native plugin marketplace — backed by `.claude-plugin/marketplace.json` in the same repo.

> Offline / by hand: `git clone https://github.com/mission69b/t2000-skills` (or the monorepo) and copy `skills/<slug>/SKILL.md` into your agent's skills dir.

## Skills

| Skill | Description |
|-------|-------------|
| [`t2000-setup`](skills/t2000-setup/SKILL.md) | End-to-end Agent Wallet bootstrap: `t2 init`, optional `t2 limit set`, and connecting the AI client to `mcp.t2000.ai`. Read this first when onboarding a new user — every other skill assumes it has run. |
| [`t2000-earn`](skills/t2000-earn/SKILL.md) | Earn USDC as a seller with a local `t2` wallet — board → claim → spec → deliver → `watch --mine`. The Hermes path; buyers use `t2000-job`, Connect users `t2000-connect`. |
| [`t2000-check-balance`](skills/t2000-check-balance/SKILL.md) | Inspect wallet balances (USDC / USDsui / SUI) before any write. Use whenever the user asks about totals, "how much do I have", or you need to confirm sufficient funds for a planned send / swap / pay. |
| [`t2000-send`](skills/t2000-send/SKILL.md) | Send USDC, USDsui, or SUI to a Sui address or SuiNS name. Covers the explicit `--asset` flag, gasless USDC / USDsui via `0x2::balance::send_funds`, and SUI sends that require gas. |
| [`t2000-receive`](skills/t2000-receive/SKILL.md) | Share the wallet address, render an ANSI QR in terminal, or emit a Payment Kit `sui:pay?…` URI via MCP. Use for "share my address", "create a payment link", or "QR code". |
| [`t2000-swap`](skills/t2000-swap/SKILL.md) | Best-route swaps via Cetus Aggregator across 20+ Sui DEXs (SUI, USDC, USDsui, USDT, USDe, ETH, GOLD, NAVX, WAL, vSUI, …). Covers `--quote`, slippage, asset selection, and the "swap needs SUI for gas" gotcha. |
| [`t2000-services`](skills/t2000-services/SKILL.md) | Discover x402 services (paid AI / search / image-gen / mail / TTS APIs) payable via `t2 pay`. Pairs with `t2000-pay` — always discover first, then pay. |
| [`t2000-pay`](skills/t2000-pay/SKILL.md) | Pay for an x402-protected API service via the wallet. Handles the HTTP 402 challenge → quote → USDC payment → retry loop automatically. Use whenever a task needs a paid API (chat, search, image, mail, weather, code execution, …). |
| [`t2000-connect`](skills/t2000-connect/SKILL.md) | Connect Claude, Cursor, ChatGPT, Cline, Continue, or any MCP client to the hosted Passport Connect MCP (`https://mcp.t2000.ai/mcp` + OAuth). Covers setup and session spend limits — the tool inventory is Connect `tools/list`, never a skill. |

### Sui ecosystem skills

Protocol playbooks beyond the wallet — same format, same one-paste install:

| Skill | Description |
|-------|-------------|
| [`sui-grpc`](skills/sui-grpc/SKILL.md) | Read Sui chain state over gRPC — balances, objects, transactions, coin metadata, names. JSON-RPC is deactivated July 31, 2026 on mainnet; this is the replacement surface. |
| [`suins`](skills/suins/SKILL.md) | Resolve SuiNS names (`alice.sui`) to addresses and back — gRPC-first, with the JSON-RPC stopgap and its cutoff date. |
| [`deepbook`](skills/deepbook/SKILL.md) | Live market data from DeepBook, Sui's on-chain order book — pools, tickers, order books, candles, trades — via the free public indexer. |
| [`walrus`](skills/walrus/SKILL.md) | Read + store blobs on Walrus over plain HTTP — free aggregator reads, testnet publisher writes, and the honest mainnet-write story. |
| [`sui-move-security`](skills/sui-move-security/SKILL.md) | Write + review Sui Move that touches value with OpenZeppelin's audited packages — the never-roll-your-own rules (mul_div, explicit rounding, checked shifts, capability transfer policies) plus a review checklist. |

> Building **on** Sui more broadly (Move, PTBs, object model, dApp Kit)? Install the official Sui Agent Skills by Mysten Labs: `npx skills add mystenlabs/skills --all` ([docs.sui.io/skills](https://docs.sui.io/skills)). This set stays focused on what agents can't get elsewhere: money, identity, and protocol playbooks for the t2000 rail.

Each skill is plain markdown at `skills/<slug>/SKILL.md` — read it here or in the public [`mission69b/t2000-skills`](https://github.com/mission69b/t2000-skills) mirror.

### Add your protocol (PR)

One PR adds your playbook — no deploy on our side:

1. `skills/<slug>/SKILL.md` — the playbook, in the frontmatter format above. Every command in it must be **run against your live mainnet surface** before you write it down.
2. Optional `brand/<your-mark>.png` — a square brand mark (SVG/PNG, ~200px).

`npx tsx validate.ts` must pass (it checks frontmatter and slug↔dir consistency). Merged = synced to the public skills repo within minutes.

### Operating guide — [`AGENTS.md`](https://t2000.ai/AGENTS.md)

The per-task skills above assume a shared **agent-ops layer**: payment-error recovery (don't blind-retry), free-first ordering (discover before paying), spending limits (on by default, gate CLI **and** MCP), no-charge-on-failure (settle-then-refund — proxied services only; direct sellers carry their own guarantees), and async/artifact semantics. It lives in [`AGENTS.md`](AGENTS.md) (served at [`t2000.ai/AGENTS.md`](https://t2000.ai/AGENTS.md)) — read it once per session.

## t2000 MCP (Passport Connect)

Skills tell your agent *how* to use the wallet. The hosted MCP gives it the actual *tools* — reads, marketplace verbs, and spend-gated money verbs (discover them via the connector's `tools/list`; skills never list tools). One config for every MCP client:

```json
{
  "mcpServers": {
    "t2000": {
      "url": "https://mcp.t2000.ai/mcp"
    }
  }
}
```

OAuth (Google → Passport) + per-session spend limits set in the console.

The `t2000` command must be on `PATH` — install globally with `npm install -g @t2000/cli` (the CLI ships with the MCP entry point).

Full setup walkthrough + troubleshooting: see [`t2000-connect/SKILL.md`](skills/t2000-connect/SKILL.md).

## Prerequisites

```bash
# 1. Install the CLI
npm install -g @t2000/cli

# 2. Create your Agent Wallet (no PIN, plain Bech32 file, 0o600 perms)
t2 init

# 3. (Optional) adjust the default spending limits ($25/tx · $100/day)
t2 limit set --per-tx 50 --daily 100
```

The wallet must exist at `~/.t2000/wallet.key` (or `--key <path>`) before any skill or MCP tool can sign transactions. See [`t2000-setup/SKILL.md`](skills/t2000-setup/SKILL.md) for the full walkthrough, including the `--import` flow for restoring a Bech32 secret on a new machine.

## How Skills Work

Skills are markdown files with YAML frontmatter. Your agent reads the relevant `SKILL.md` while planning and generating responses; you stay in control of what actually executes.

- **Decision frameworks**: USDC vs USDsui vs SUI on `t2 send`, gasless vs gas-required transactions, `--quote` first vs direct `t2 swap`, x402 discover → inspect → pay.
- **Correct patterns**: explicit `--asset` on `t2 send`, `suiprivkey1…` import via `t2 init --import`, `0x2::balance::send_funds` for sponsored USDC, `t2 limit show` before any large write.
- **Common mistakes**: `WALLET_CORRUPT` recovery, swaps not being gasless, sending the wrong stable, missing SUI for gas on non-USDC sends.

Skills + MCP are complementary: skills give the agent context that doesn't change often (workflows, patterns, gotchas). The MCP server gives it the tools that *do* change (live balances, fresh quotes, current chain state).

## Updating

Skills are local files. To get the latest versions:

```bash
npx skills update
```

Re-running `npx skills add mission69b/t2000-skills` also refreshes in place. If a skill was deleted upstream, remove its folder from your agent's skills dir by hand.

## FAQ

**Do skills write code or execute transactions for me?**
No. Skills are instructions that steer the agent's outputs. To actually sign a send / swap / pay you need the t2000 MCP server (tools) or the `t2` CLI (manual confirm). Every write still taps to confirm — the wallet never moves money on its own.

**Do I need the MCP server?**
You can use skills alone — the agent will produce correct `t2` commands for you to run by hand. The MCP server is what lets the agent actually call those commands itself, without you copy-pasting. Most users want both.

**Where does my wallet live?**
`~/.t2000/wallet.key` — a plain JSON file with a `suiprivkey1…` Bech32 secret and `0o600` perms. No PIN, no AES, no `.session` file. Use `t2 export` to print the secret, `t2 init --import` to restore on another machine.

**What's the difference between t2000 and Audric?**
t2000 is the infra brand: `@t2000/sdk`, `@t2000/cli`. Audric is the consumer product built on top — see [audric.ai](https://audric.ai). This repo is the canonical home for skills that ship with the infra surface.

## Resources

- [t2000.ai](https://t2000.ai) — docs + skill markdown endpoint
- [audric.ai](https://audric.ai) — consumer product
- [agentskills.io](https://agentskills.io) — the Agent Skills standard
- [npm @t2000/cli](https://www.npmjs.com/package/@t2000/cli)
- [npm @t2000/sdk](https://www.npmjs.com/package/@t2000/sdk)
- [GitHub mission69b/t2000](https://github.com/mission69b/t2000)

## License

MIT
