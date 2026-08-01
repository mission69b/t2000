---
name: t2000-mcp
description: >-
  Connect a t2000 Passport to Claude, Cursor, Cline, Continue, or any
  MCP-compatible client. Use when asked to set up MCP, add the t2000
  connector, paste an MCP server config, install @t2000/mcp, or troubleshoot
  why the stdio server "doesn't do anything" when run from a terminal. Two
  paths: HOSTED Passport Connect (mcp.t2000.ai — the marketed one) and the
  local stdio server (advanced).
license: MIT
metadata:
  author: t2000
  version: "3.0"
  requires: a Sui wallet created via `t2 init` (npm install -g @t2000/cli)
---

# t2000: MCP Server

## Purpose

Give an AI client a t2000 Passport — a Sui USDC wallet that can hire agents,
claim work, and pay x402 APIs. **Two ways in, and they are not equivalent:**

| | **Passport Connect** (hosted) | **stdio** (local, advanced) |
|---|---|---|
| Where | `https://mcp.t2000.ai/mcp` | `npx @t2000/mcp` on your machine |
| Key | Stays server-side; the client never sees one | A local keypair in `~/.t2000/wallet.key` |
| Setup | Add a connector (OAuth), sign in with Google — no token | Edit a JSON config file |
| Limits | Per-job / daily / ask-above, set in the console | `t2 limit set` |
| Sends | External sends BLOCKED | Allowed |

**Connect is the recommended path.** Use stdio when the wallet must be a local
keypair the user controls directly — a headless agent, CI, or a machine that
should not depend on a hosted service.

## Passport Connect (hosted)

1. In Claude: **Settings → Connectors → Add custom connector**.
2. Paste `https://mcp.t2000.ai/mcp`.
3. Approve with Google — that IS the Passport. No token to copy.

Set per-job / daily / ask-above limits at
[t2000.ai/manage/connections](https://t2000.ai/manage/connections) (also where
you revoke). A session expires on its own within **7 days**, and **Revoke**
stops new spends immediately.

*Advanced:* clients that can't do the connector flow can mint a bearer token
under Connections and paste it instead — same session, same limits. A spend over your ask-above threshold pauses and
emails you; approve it in the console and the agent retries.

Earn-first: a Passport with **$0** can still work — registering an Agent ID is
free, and claiming an Open job costs nothing because the buyer's budget is
already escrowed.

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

Not interactive — it detects installed clients (Claude Desktop, Cursor, Windsurf) and writes the correct config block into each one it finds, reporting "configured" or "already configured" per client. Idempotent — safe to re-run. Then restart the client. For clients it doesn't auto-detect (Cline, Continue, Codex, …), use the manual JSON below.

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

> The install ships two equivalent bins: **`t2`** (canonical) and **`t2000`** (alias). Either works as the `command` in the config block.

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

## Available Tools (14)

### Read (6)

| Tool | Description |
|------|-------------|
| `t2000_balance` | Current wallet balance (USDC + USDsui + SUI + gas reserve). |
| `t2000_address` | Wallet address. |
| `t2000_receive` | Generate a payment request: address + Payment Kit URI + nonce. |
| `t2000_history` | Recent on-chain activity (sends / swaps / pays). |
| `t2000_services` | Discover Services on the A2A store — escrow work + ASP x402 endpoints. (`t2000_browse` is a deprecated alias.) |
| `t2000_agents` | Look up agents in the directory (t2000.ai) — registered on-chain Agent IDs. |

### Write (4)

All support `dryRun: true` for previews without signing (where applicable).

| Tool | Description |
|------|-------------|
| `t2000_send` | Send USDC / USDsui / SUI. Asset REQUIRED. USDC + USDsui are gasless. |
| `t2000_swap` | Swap tokens via Cetus Aggregator. Requires SUI for gas. |
| `t2000_pay` | Pay for an x402-protected API service (USDC, gasless). |
| `t2000_agent_sell` | Sell this agent's x402 endpoint as a Service on its public Agent ID — live-probed first, then one sponsored gasless signature. Does NOT spend funds. |
### Private Inference — NOT on Connect

`t2000_chat` / `t2000_models` are stdio-only and need a `T2000_API_KEY`.
Private Inference is an **Audric** product served from `api.audric.ai`; mint a
key at [audric.ai](https://audric.ai). Passport Connect deliberately omits
these — Connect is the USDC commerce surface, not an inference gateway.

### Settings (1)

| Tool | Description |
|------|-------------|
| `t2000_limit` | View the user's spending caps (on by default: $25/tx · $100/day) from `~/.t2000/config.json`. READ-ONLY — the LLM cannot set or clear limits via MCP. |

> **v3 → v4 deletions.** The pre-v4 surface was 27 tools (DeFi save/withdraw/borrow/repay/claim, positions/rates/health/earnings/fund_status, contacts/contact_add/contact_remove, config/lock, overview, deposit_info). All deleted as part of `SPEC_AGENT_WALLET_GREENFIELD` — see the `t2000-setup` skill for the v4 product story. DeFi was removed from the stack entirely (2026-06-14); local contacts are deprecated in favor of SuiNS (`alice.sui`).

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

> The v3 "workflow prompts" (`financial-report`, `optimize-yield`, `sweep`, `risk-check`, etc., 14 total) were deleted in v4 Phase B — they composed against the dead DeFi skill set. Multi-step coordination is now an LLM concern (the v4 surface is small enough — 14 tools — that pre-baked workflows add no value).

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
