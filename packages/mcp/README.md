# @t2000/mcp

MCP server for the t2000 Agent Wallet on Sui. Connects Claude Desktop, Cursor, Windsurf, or any MCP-compatible AI client to your wallet — 9 tools + 8 auto-registered skill prompts, stdio transport.

[![npm @t2000/mcp](https://img.shields.io/npm/v/@t2000/mcp?label=%40t2000%2Fmcp)](https://www.npmjs.com/package/@t2000/mcp)
[![npm @t2000/cli](https://img.shields.io/npm/v/@t2000/cli?label=%40t2000%2Fcli)](https://www.npmjs.com/package/@t2000/cli)
[![docs](https://img.shields.io/badge/docs-t2000.ai-00D395)](https://t2000.ai)
[![license](https://img.shields.io/badge/license-MIT-blue)](https://github.com/mission69b/t2000/blob/main/LICENSE)

## Quick Start

```bash
npm install -g @t2000/cli       # ships with the MCP server entry point
t2 init                         # create your wallet (plain Bech32, no PIN)
t2 mcp install                  # auto-wire Claude Desktop / Cursor / Windsurf
```

Restart your AI client, then ask **"What's my t2000 balance?"**

`t2 mcp install` is idempotent — re-run any time. Remove with `t2 mcp uninstall`.

## Tools

| Tool | Type | What it does |
|---|---|---|
| `t2000_balance` | read | USDC / USDsui / SUI holdings + gas reserve + USD totals. |
| `t2000_address` | read | Wallet's Sui address. Same value as `t2 wallet address`. |
| `t2000_receive` | read | Payment request — address, Payment Kit `sui:pay?…` URI, optional `amount` / `memo` / `label`. |
| `t2000_history` | read | Recent on-chain activity (sends / swaps / MPP payments) with Suiscan digests. |
| `t2000_services` | read | Discover MPP services on the `mpp.t2000.ai` gateway — chat / search / image / weather / mail / etc. Call before `t2000_pay`. |
| `t2000_send` | write | Send USDC / USDsui / SUI to a hex address, SuiNS name, `@audric` handle, or saved contact. **`asset` is required** (no implicit USDC default). USDC + USDsui are gasless. `dryRun: true` for previews. |
| `t2000_swap` | write | Cetus Aggregator V3 swap across 20+ Sui DEXs. Requires the wallet to hold SUI for gas. |
| `t2000_pay` | write | Pay for an MPP-protected API. Handles HTTP 402 → quote → USDC payment (gasless) → retry transparently. |
| `t2000_limit` | settings | **Read-only.** Show the user's opt-in spending caps from `~/.t2000/config.json`. Setting / clearing limits flows through the CLI (`t2 limit set` / `t2 limit reset`) — security boundary. |

Every skill in [`t2000-skills/`](https://github.com/mission69b/t2000/tree/main/t2000-skills) is also auto-registered as a `skill-<name>` MCP prompt your client can invoke directly (8 prompts: `skill-setup`, `skill-check-balance`, `skill-send`, `skill-receive`, `skill-swap`, `skill-services`, `skill-pay`, `skill-mcp`).

## Supported Clients

| Client | Setup | Config path |
|---|---|---|
| **Claude Desktop** | `t2 mcp install` | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Cursor** | `t2 mcp install` | `~/.cursor/mcp.json` |
| **Windsurf** | `t2 mcp install` | `~/.codeium/windsurf/mcp_config.json` |
| **Codex / Cline / Continue / any MCP client** | Manual JSON (below) | client-specific |

Manual config — paste into your client's MCP config file:

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

The `t2000` (and `t2`) command must be on `PATH` — `npm install -g @t2000/cli` puts both there.

Full walkthrough + troubleshooting: [`t2000-mcp` skill](https://t2000.ai/skills/t2000-mcp).

## Programmatic Usage

```typescript
import { startMcpServer } from '@t2000/mcp';

await startMcpServer({ keyPath: '/path/to/wallet.key' });
```

Defaults to `~/.t2000/wallet.key`. Throws `WALLET_NOT_FOUND` if no wallet exists at the path (run `t2 init`) and `WALLET_CORRUPT` if the file is a v3 PIN-encrypted wallet or otherwise malformed (move/delete it, then `t2 init`).

## What's in v4

| Surface | v4 |
|---|---|
| Tool count | 9 (5 read + 3 write + 1 settings) |
| Prompts | 8 auto-registered from every `t2000-skills/skills/*/SKILL.md` |
| Sendable assets | USDC, USDsui, SUI (`asset` is required on `t2000_send`) |
| Gasless | USDC + USDsui via Sui foundation's `0x2::balance::send_funds` sponsor |
| Wallet | Plain Bech32 JSON, `0o600` perms — no PIN, no AES |
| Boot gate | None — the server starts as soon as `~/.t2000/wallet.key` exists |

> **v3 → v4 deletions.** The pre-v4 surface was 27 tools (DeFi save / withdraw / borrow / repay / claim_rewards, positions / rates / health / earnings / fund_status / pending_rewards / deposit_info, contacts / contact_add / contact_remove, config / lock, overview). All deleted in `SPEC_AGENT_WALLET_GREENFIELD` — see the `t2000-setup` skill for the v4 product story. DeFi lives on [audric.ai](https://audric.ai); local contacts are deprecated in favor of SuiNS (`alice.sui`). The 14 hand-rolled workflow prompts (`prompts.ts`) were also deleted — they composed against the dead DeFi skill set; the auto-registered `skill-<name>` prompts are now the entire prompt surface.

## Security

- Wallet file (`~/.t2000/wallet.key`) is `0o600` — owner read/write only.
- stdio transport — keys never leave the machine.
- Every write tool has a `dryRun: true` preview path.
- The `t2000_limit` tool is **read-only** — setting limits requires CLI terminal access (security boundary).
- Setting / clearing spending caps flows through `t2 limit set` / `t2 limit reset` (the user's terminal). MCP can read them to inform LLM narration but cannot mutate them.

> **Phase D parity gap.** MCP write tools (`t2000_send`, `t2000_swap`, `t2000_pay`) currently do **not** enforce the `t2 limit set` opt-in spending caps — only CLI writes do. Closing the gap consolidates the `enforce.ts` gate into `@t2000/sdk/limits/` so both surfaces share it. Tracked in `SPEC_AGENT_WALLET_GREENFIELD.md` Phase D follow-ups; the `t2000_limit` tool currently exists as a visibility surface.

## Skills

The 8 [t2000 skills](https://github.com/mission69b/t2000/tree/main/t2000-skills) ship baked into this MCP server's bundle as `skill-<name>` prompts — no filesystem reads at runtime, no `files: [...]` configuration. Invoke from any MCP client:

```
/skill-setup            # end-to-end wallet bootstrap
/skill-send             # explicit --asset, gasless, recipient resolution
/skill-swap             # Cetus routing, --quote, slippage
/skill-pay              # MPP 402 flow
…
```

Alternatively, install the skills as local files via [`t2 skills install`](https://github.com/mission69b/t2000/blob/main/t2000-skills/README.md#installation) if your client prefers a filesystem-based skill registry.

## License

MIT — see [LICENSE](https://github.com/mission69b/t2000/blob/main/LICENSE).
