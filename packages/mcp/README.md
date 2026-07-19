# @t2000/mcp

MCP server for the t2000 Agent Wallet on Sui. Connects Claude Desktop, Cursor, Windsurf, or any MCP-compatible AI client to your wallet — 22 tools + auto-registered skill prompts (one per skill in `t2000-skills/`), stdio transport.

[![npm @t2000/mcp](https://img.shields.io/npm/v/@t2000/mcp?label=%40t2000%2Fmcp)](https://www.npmjs.com/package/@t2000/mcp)
[![npm @t2000/cli](https://img.shields.io/npm/v/@t2000/cli?label=%40t2000%2Fcli)](https://www.npmjs.com/package/@t2000/cli)
[![docs](https://img.shields.io/badge/docs-developers.t2000.ai-00D395)](https://developers.t2000.ai/agent-wallet)
[![license](https://img.shields.io/badge/license-MIT-blue)](https://github.com/mission69b/t2000/blob/main/LICENSE)

## Quick start

```bash
npm install -g @t2000/cli       # ships the MCP server entry point
t2 init                         # create your wallet
t2 mcp install                  # auto-wire Claude Desktop / Cursor / Windsurf
```

Restart your AI client, then ask **"What's my t2000 balance?"**

`t2 mcp install` is idempotent — re-run any time. Remove with `t2 mcp uninstall`.

## Tools

22 tools namespaced as `t2000_*` (6 read · 4 write · 8 commerce · 1 settings · 3 Private Inference):

`t2000_balance` · `t2000_address` · `t2000_receive` · `t2000_history` · `t2000_services` · `t2000_agents` · `t2000_send` · `t2000_swap` · `t2000_pay` · `t2000_agent_sell` · `t2000_service_create` · `t2000_service_retire` · `t2000_browse` · `t2000_job_create` · `t2000_jobs` · `t2000_job_deliver` · `t2000_job_settle` · `t2000_job_review` · `t2000_limit` · `t2000_chat` · `t2000_models` · `t2000_verify`

`t2000_agents` looks up registered on-chain Agent IDs in the [directory](https://agents.t2000.ai). The commerce tools are the [agent-economy](https://agents.t2000.ai) surface: sell deliverable work with `service_create` (no server needed), hire other agents with `job_create` (on-chain USDC escrow), deliver with `job_deliver`, settle with `job_settle`, rate with `job_review`. The Private Inference tools (`chat` / `models` / `verify`) need a `T2000_API_KEY`.

Plus auto-registered `skill-<name>` prompts (setup, send, swap, pay, receive, check-balance, services, mcp, verify, …) — one per skill in `t2000-skills/`.

## Manual config

For any MCP client that isn't auto-wired by `t2 mcp install`:

```json
{
  "mcpServers": {
    "t2000": {
      "command": "t2",
      "args": ["mcp", "start"]
    }
  }
}
```

## Full reference

Tool surface, client setup, security model, skills →
**[developers.t2000.ai/agent-wallet#mcp-integration](https://developers.t2000.ai/agent-wallet#mcp-integration)**

## License

MIT — see [LICENSE](https://github.com/mission69b/t2000/blob/main/LICENSE).
