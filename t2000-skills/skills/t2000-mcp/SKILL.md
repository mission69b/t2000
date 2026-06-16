---
name: t2000-mcp
description: >-
  Connect a t2000 Agent Wallet to Claude Desktop, Cursor, Cline, Continue,
  or any MCP-compatible client. Use when asked to set up MCP, paste an MCP
  server config, install @t2000/mcp, or troubleshoot why the MCP server
  "doesn't do anything" when run from a terminal. v4 surface: 9 tools
  (5 read + 3 write + 1 limit-view) and one skill-* prompt per SKILL.md
  in t2000-skills/skills/.
license: MIT
metadata:
  author: t2000
  version: "2.0"
  requires: a Sui wallet created via `t2 init` (npm install -g @t2000/cli)
---

# t2000: MCP Server

## Purpose

Expose a t2000 Agent Wallet to any MCP-compatible AI client over stdio. **9 tools + N skill prompts** (one per `SKILL.md` in `t2000-skills/skills/`). No global install required — the recommended path uses `npx` so the AI client always pulls the latest published version.

## ⚠️ The most common confusion

**`npx @t2000/mcp` is NOT a command you run from a terminal to "use" the MCP server.** It is a JSON-RPC server that listens silently on `stdin`. If you run it manually it will appear to hang — that's correct behavior. It is meant to be launched as a subprocess by an AI client (Claude Desktop, Cursor, etc.) which speaks JSON-RPC to it over `stdin`/`stdout`.

The JSON snippets below go into your **AI client's MCP settings file**, not into a shell.

## Setup

### 1. Create a wallet (one-time, in a terminal)

```bash
# Install CLI long enough to bootstrap a wallet
npm install -g @t2000/cli
t2 init
```

That's it. No PIN. No safeguards gate. The MCP server starts as soon as the wallet file exists at `~/.t2000/wallet.key`.

> Spending limits are ON by default ($25/tx, $100/day cumulative; adjust with `t2 limit set --per-tx 50` / `--daily 200`, clear with `t2 limit reset`). Every write — CLI **and** MCP — honors the caps and throws `LIMIT_EXCEEDED` when exceeded (enforced in `@t2000/sdk`). The MCP `t2000_limit` tool surfaces the caps for the LLM to read; it cannot raise or clear them.

### 2. Wire MCP into your AI client — the easy way

```bash
t2 mcp install
```

This is interactive — it discovers installed clients (Claude Desktop, Cursor, Windsurf, Cline, Continue) and offers a multi-select. The CLI writes the correct config block into each chosen client. Then restart the client.

### 2-alt. Manual MCP config

Recommended (auto-updates on every launch, no global install):

```json
{
  "mcpServers": {
    "t2000": {
      "command": "npx",
      "args": ["-y", "@t2000/mcp@latest"]
    }
  }
}
```

Alternative (if `@t2000/cli` is already installed globally):

```json
{
  "mcpServers": {
    "t2000": {
      "command": "t2000",
      "args": ["mcp", "start"]
    }
  }
}
```

> Until the `t2` alias ships in Phase C, the published binary is `t2000`. Both `t2 mcp install` and `t2000 mcp install` write `command: 't2000'` into the AI-client config so they keep working.

### 3. Restart the client

The client spawns the MCP server as a subprocess on startup. You should see `t2000_*` tools appear in the tool list.

## Per-client config file paths

| Client | Config file |
|--------|-------------|
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Cursor | Settings → MCP → Add new MCP server (or `~/.cursor/mcp.json`) |
| Cline | VSCode settings → `cline.mcpServers` |
| Continue | `~/.continue/config.json` under `mcpServers` |

`t2 mcp install` writes the correct block into each of these automatically.

## Verification (optional, before wiring into a client)

Confirm the server responds to a real MCP `initialize` request:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' \
  | npx -y @t2000/mcp@latest
```

You should see a JSON response containing `"serverInfo":{"name":"t2000"…}` and exit. If you see that, the server is healthy and ready to be launched by a client.

## Available Tools (9)

### Read (5)

| Tool | Description |
|------|-------------|
| `t2000_balance` | Current wallet balance (USDC + USDsui + SUI + gas reserve). |
| `t2000_address` | Wallet address. |
| `t2000_receive` | Generate a payment request: address + Payment Kit URI + nonce. |
| `t2000_history` | Recent on-chain activity (sends / swaps / pays). |
| `t2000_services` | Discover x402 services (gateway catalog at mpp.t2000.ai). |

### Write (3)

All support `dryRun: true` for previews without signing (where applicable).

| Tool | Description |
|------|-------------|
| `t2000_send` | Send USDC / USDsui / SUI. Asset REQUIRED. USDC + USDsui are gasless. |
| `t2000_swap` | Swap tokens via Cetus Aggregator. Requires SUI for gas. |
| `t2000_pay` | Pay for an x402-protected API service (USDC, gasless). |

### Settings (1)

| Tool | Description |
|------|-------------|
| `t2000_limit` | View the user's spending caps (on by default: $25/tx · $100/day) from `~/.t2000/config.json`. READ-ONLY — the LLM cannot set or clear limits via MCP. |

> **v3 → v4 deletions.** The pre-v4 surface was 27 tools (DeFi save/withdraw/borrow/repay/claim, positions/rates/health/earnings/fund_status, contacts/contact_add/contact_remove, config/lock, overview, deposit_info). All deleted as part of `SPEC_AGENT_WALLET_GREENFIELD` — see the `t2000-setup` skill for the v4 product story. DeFi lives on audric.ai now; local contacts are deprecated in favor of SuiNS (`alice.sui`).

## Prompts

The MCP server auto-registers one `skill-<short-name>` prompt for every `SKILL.md` baked into the bundle. The `t2000-` prefix is stripped; other prefixes (like `mpp-`) are preserved for disambiguation.

The current set of skill prompts mirrors `t2000-skills/skills/`:

| Prompt | Maps to |
|--------|---------|
| `skill-setup` | `t2000-setup` — one-prompt install entry point |
| `skill-check-balance` | `t2000-check-balance` |
| `skill-send` | `t2000-send` |
| `skill-receive` | `t2000-receive` |
| `skill-swap` | `t2000-swap` |
| `skill-pay` | `t2000-pay` |
| `skill-services` | `t2000-services` |
| `skill-mcp` | `t2000-mcp` (this skill) |

Invoking the prompt loads the full skill markdown as the user message — equivalent to the agent reading the skill from `t2000.ai/skills/<slug>`. Skill files are baked into the `@t2000/mcp` bundle at build time, so they're always in sync with the published version.

> The v3 "workflow prompts" (`financial-report`, `optimize-yield`, `sweep`, `risk-check`, etc., 14 total) were deleted in v4 Phase B — they composed against the dead DeFi skill set. Multi-step coordination is now an LLM concern (the v4 surface is small enough — 9 tools — that pre-baked workflows add no value).

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `npx @t2000/mcp` "hangs" with no output | Working as designed — server is waiting for JSON-RPC on stdin | Don't run it manually; let the AI client launch it |
| Server fails with `WALLET_NOT_FOUND` | No wallet at `~/.t2000/wallet.key` | Run `t2 init` first |
| Server fails with `WALLET_CORRUPT` | File at `~/.t2000/wallet.key` is not a v4 wallet (e.g. a pre-v4 file, hand-edited JSON, or a wallet from a different tool) | Move or delete the file, then run `t2 init` to create a fresh wallet |
| Client shows no `t2000_*` tools after restart | Wrong config path, or stale npx cache | Verify with the `printf | npx ...` test above; clear cache with `rm -rf ~/.npm/_npx` |
| `SuiClient export not found` error from old install | Cached pre-fix bundle in `~/.npm/_npx` | `rm -rf ~/.npm/_npx` then restart the client |

## Security

- v4 wallets are plain Bech32 JSON files (`0o600` perms) — no PIN. Anyone with read access to `~/.t2000/wallet.key` owns the wallet.
- Local-only stdio transport — the key never leaves the machine.
- `dryRun: true` previews operations before signing (on `t2000_send`).
- Spending limits (default $25/tx · $100/day; `t2 limit set`) gate ALL writes — CLI and MCP — enforced in `@t2000/sdk`; `t2000_limit` is read-only.
