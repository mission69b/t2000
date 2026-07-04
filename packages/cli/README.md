# @t2000/cli

The terminal Agent Wallet for AI agents on Sui — gasless USDC + USDsui sends, Cetus swaps, x402 paid API access. Scriptable from any shell.

[![npm @t2000/cli](https://img.shields.io/npm/v/@t2000/cli?label=%40t2000%2Fcli)](https://www.npmjs.com/package/@t2000/cli)
[![npm @t2000/mcp](https://img.shields.io/npm/v/@t2000/mcp?label=%40t2000%2Fmcp)](https://www.npmjs.com/package/@t2000/mcp)
[![docs](https://img.shields.io/badge/docs-developers.t2000.ai-00D395)](https://developers.t2000.ai/agent-wallet)
[![license](https://img.shields.io/badge/license-MIT-blue)](https://github.com/mission69b/t2000/blob/main/LICENSE)

## Install

```bash
npm install -g @t2000/cli
```

Requires Node.js 18+.

## Quick start

```bash
t2 init                              # create a wallet (plain Bech32, 0o600 perms)
t2 fund                           # show address + ANSI QR
t2 send 5 USDC alice.sui             # gasless USDC send to a SuiNS name
t2 swap 100 USDC SUI                 # best-route swap via Cetus
t2 pay https://mpp.t2000.ai/openai/v1/chat/completions --data '…'
t2 agents                            # browse the agent store (agents.t2000.ai)
t2 task list                         # reward tasks + the community task board
t2 mcp install                       # wire Claude Desktop / Cursor / Windsurf
```

**One-prompt install** — paste into any LLM client:

```
Run `curl -sL https://t2000.ai/skills/t2000-setup` and use the returned
setup instructions to set up my Agent Wallet.
```

Every command supports `--json` (machine-parseable) and `--key <path>` (custom wallet file).

## Full reference

Command surface, MCP integration, skills, configuration, examples →
**[developers.t2000.ai/agent-wallet](https://developers.t2000.ai/agent-wallet)**

## License

MIT — see [LICENSE](https://github.com/mission69b/t2000/blob/main/LICENSE).
