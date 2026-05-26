# @t2000/cli

The Agent Wallet for AI agents on Sui — gasless USDC + USDsui sends, Cetus swaps, MPP paid API access, scriptable from any shell.

[![npm @t2000/cli](https://img.shields.io/npm/v/@t2000/cli?label=%40t2000%2Fcli)](https://www.npmjs.com/package/@t2000/cli)
[![npm @t2000/mcp](https://img.shields.io/npm/v/@t2000/mcp?label=%40t2000%2Fmcp)](https://www.npmjs.com/package/@t2000/mcp)
[![docs](https://img.shields.io/badge/docs-t2000.ai-00D395)](https://t2000.ai)
[![consumer](https://img.shields.io/badge/consumer%20app-audric.ai-7c3aed)](https://audric.ai)
[![license](https://img.shields.io/badge/license-MIT-blue)](https://github.com/mission69b/t2000/blob/main/LICENSE)

## Installation

```bash
npm install -g @t2000/cli
```

Installs two equivalent binaries: `t2` (canonical) and `t2000` (legacy alias). Use either — they point at the same entry. **Requires Node.js 18+.**

```bash
t2 init                              # create a wallet (plain Bech32, 0o600 perms)
t2 init --import                     # import an existing suiprivkey1… secret
t2 receive                           # show address + ANSI QR
t2 send 5 USDC alice.sui             # gasless USDC send to a SuiNS name
t2 swap 100 USDC SUI                 # best-route swap via Cetus Aggregator
t2 pay https://mpp.t2000.ai/openai/v1/chat/completions --data '…'
t2 mcp install                       # wire Claude Desktop / Cursor / Windsurf
```

## Commands

| Group | What it does |
|---|---|
| `t2 init` · `t2 init --import` | Create a new wallet, or import an existing `suiprivkey1…` Bech32 secret. Prints a warning footer about opt-in `t2 limit` settings. |
| `t2 export` | Print the wallet's Bech32 secret — pair with `t2 init --import` on another machine to move wallets. |
| `t2 receive` | Print the wallet address + ANSI QR. `--qr-only` for embedding; `--json` for scripts. |
| `t2 balance` · `t2 wallet balance` | USDC / USDsui / SUI holdings + USD totals. |
| `t2 history` | Recent on-chain activity (sends / swaps / MPP payments) with Suiscan digests. |
| `t2 send <amount> <asset> <recipient>` | Send USDC / USDsui / SUI. Asset is **required** — no implicit USDC default. USDC + USDsui are gasless via `0x2::balance::send_funds`; SUI sends use standard gas. Recipient resolves in priority order: `0x` hex address → SuiNS name (`alice.sui`) → `@audric` handle → saved contact alias. |
| `t2 swap <amount> <from> <to>` | Best-route swap via Cetus Aggregator V3 across 20+ Sui DEXs. `--slippage <pct>` (default 1%, max 5%), `--quote` for a preview without signing. Requires SUI for gas. |
| `t2 pay <url>` | Pay for an MPP-protected API. Auto-handles HTTP 402 → quote → USDC payment (gasless) → retry. `--data`, `--method`, `--header`, `--max-price <USD>` (default $1.00). |
| `t2 services search <query>` · `inspect <url>` | Discover MPP services on the `mpp.t2000.ai` gateway — chat / search / image / weather / mail / TTS / code exec / postcard / flights / +30 more. |
| `t2 limit set --per-tx <USD>` · `--daily <USD>` | Opt-in spending caps written to `~/.t2000/config.json`. `t2 limit show` / `t2 limit reset`. Override per-call with `--force` on `send` / `swap` / `pay`. |
| `t2 mcp install` · `uninstall` | Auto-wire the t2000 MCP server into Claude Desktop, Cursor, and Windsurf. Idempotent. |
| `t2 mcp start` | Start the MCP stdio server. Used by AI clients via the JSON config — not normally run by hand. |
| `t2 skills install [--target=cursor\|claude-code\|agents]` · `list` · `uninstall` | Install per-skill `SKILL.md` files locally (alternative to running the MCP server). |

Every command supports `--json` for machine-parseable output and `--key <path>` for a non-default wallet file.

## What's in v4

v4 is an Agent Wallet — focused on USDC payments, swaps, and MPP API access. DeFi (save / borrow / withdraw / repay / yields) lives on [audric.ai](https://audric.ai). The CLI is intentionally narrow.

| Surface | v4 |
|---|---|
| Wallet file | Plain Bech32 JSON, `0o600` perms. **No PIN, no AES.** |
| Sendable assets | USDC, USDsui, SUI (asset required on every `send`) |
| Gasless | USDC + USDsui via Sui foundation's `0x2::balance::send_funds` sponsor |
| Spending limits | Opt-in via `t2 limit set`. Default = no limits + warning footer at `init`. |
| MCP tools | 9 (5 read + 3 write + 1 settings) |
| Skills | 8 (`t2000-setup` / `check-balance` / `send` / `receive` / `swap` / `services` / `pay` / `mcp`) |
| Fees | Free — t2000 layer charges no protocol fees. Network gas + protocol fees (Cetus routing, etc.) still apply at on-chain rates. |

## MCP Integration

The CLI ships with the t2000 MCP stdio server. `t2 mcp install` writes the right JSON config for every supported AI client on your machine.

| Client | Config path |
|---|---|
| **Claude Desktop** | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Cursor** | `~/.cursor/mcp.json` |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` |
| **Codex / Cline / Continue / any MCP client** | Paste the JSON below into your client's config file |

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

Full setup + troubleshooting: [`t2000-mcp` skill](https://t2000.ai/skills/t2000-mcp).

## Skills

Skills are markdown instruction files your agent reads on demand. Install per-skill files locally with `t2 skills install --target=<client>`, or let the MCP server expose every skill as a `skill-<name>` prompt without writing files.

| Skill | What it teaches |
|---|---|
| [`t2000-setup`](https://t2000.ai/skills/t2000-setup) | End-to-end wallet bootstrap (`t2 init` + optional limits + MCP install). Read first. |
| [`t2000-check-balance`](https://t2000.ai/skills/t2000-check-balance) | Inspect USDC / USDsui / SUI before any write. |
| [`t2000-send`](https://t2000.ai/skills/t2000-send) | Explicit `--asset`, gasless USDC / USDsui, SUI sends that need gas. |
| [`t2000-receive`](https://t2000.ai/skills/t2000-receive) | Address share, ANSI QR, Payment Kit `sui:pay?…` URIs. |
| [`t2000-swap`](https://t2000.ai/skills/t2000-swap) | Cetus Aggregator routing, `--quote`, slippage, swap-needs-SUI gotcha. |
| [`t2000-services`](https://t2000.ai/skills/t2000-services) | Discover MPP services before `t2 pay`. |
| [`t2000-pay`](https://t2000.ai/skills/t2000-pay) | MPP 402 → quote → pay → retry flow. |
| [`t2000-mcp`](https://t2000.ai/skills/t2000-mcp) | Wire the MCP server into Claude / Cursor / Windsurf. |

Full inventory + install commands: [`t2000-skills/README.md`](https://github.com/mission69b/t2000/blob/main/t2000-skills/README.md).

## Configuration

| Path | Purpose |
|---|---|
| `~/.t2000/wallet.key` | Plain JSON wallet — `{ version: 2, secret: "suiprivkey1…" }`, `0o600` perms. |
| `~/.t2000/config.json` | Opt-in spending limits (only present after `t2 limit set`). |

| Env var | Effect |
|---|---|
| `T2000_RPC_URL` | Custom Sui JSON-RPC endpoint (defaults to Sui public fullnode). |
| `T2000_GRPC_URL` | Custom Sui gRPC endpoint (defaults to `fullnode.mainnet.sui.io`). Used during gasless USDC/USDsui send + pay builds. |
| `T2000_GATEWAY_URL` | Override the MPP gateway URL for `t2 services` + `t2 pay`. Defaults to `https://mpp.t2000.ai`. |

## Gas

USDC + USDsui `send` and MPP `pay` are gasless — the Sui foundation sponsors the protocol-level `0x2::balance::send_funds` flow. SUI sends and Cetus swaps need gas (keep ~0.05 SUI on hand). Any Sui exchange or DEX will fund the gas balance.

## Examples

```bash
# Fresh wallet → first send
t2 init && t2 receive
# (fund the wallet with USDC from any source)
t2 send 5 USDC alice.sui

# Move a wallet to another machine
t2 export                                    # prints suiprivkey1…
# on the new machine:
t2 init --import                             # interactive hidden-input prompt

# Discover an API service, then pay for it
t2 services search "image"
t2 pay https://mpp.t2000.ai/fal/fal-ai/flux/dev --data '{"prompt":"a sunset"}' --max-price 0.10

# Opt into spending limits
t2 limit set --per-tx 50 --daily 200
t2 send 100 USDC alice.sui                   # blocked
t2 send 100 USDC alice.sui --force           # explicit override

# JSON output for scripting
t2 balance --json | jq '.available'
t2 history --json --limit 5
```

## Programmatic Usage

For TypeScript programmatic access — building bots, server apps, or your own consumer surface — use [`@t2000/sdk`](https://www.npmjs.com/package/@t2000/sdk):

```ts
import { T2000 } from '@t2000/sdk';

const agent = await T2000.create();
const balance = await agent.balance();
await agent.send({ to: 'alice.sui', amount: 5, asset: 'USDC' });
```

## License

MIT — see [LICENSE](https://github.com/mission69b/t2000/blob/main/LICENSE).
