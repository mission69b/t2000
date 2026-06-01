<p align="center">
  <strong>t2000</strong>
</p>

<h3 align="center">The agentic stack for stablecoins on Sui.</h3>

<p align="center">
  Agent Wallet · Agent Payments · Agent SDK · Agent Engine
  <br />
  Built on <a href="https://sui.io">Sui</a> · Open source · Non-custodial
</p>

<p align="center">
  <a href="https://t2000.ai">t2000.ai</a> · <a href="https://developers.t2000.ai">Developer docs</a> · <a href="https://mpp.t2000.ai">Services</a> · <a href="https://www.npmjs.com/package/@t2000/cli">CLI</a> · <a href="https://www.npmjs.com/package/@t2000/sdk">SDK</a> · <a href="https://www.npmjs.com/package/@t2000/engine">Engine</a> · <a href="https://www.npmjs.com/package/@t2000/mcp">MCP</a>
</p>

<p align="center">
  <a href="https://glama.ai/mcp/servers/mission69b/t2000"><img src="https://glama.ai/mcp/servers/mission69b/t2000/badges/score.svg" alt="t2000 MCP server" /></a>
  <a href="https://github.com/mbeato/awesome-mpp"><img src="https://img.shields.io/badge/Awesome-MPP-orange?style=flat&logo=awesomelists&logoColor=white" alt="Listed on Awesome MPP" /></a>
</p>

---

t2000 is the open-source agentic stack for stablecoins on Sui — everything an AI agent (or a developer building one) needs to hold a wallet, move USDC, pay APIs, and orchestrate financial flows. Four products, one repo.

## The stack

| Product | npm | What it gives you |
|---|---|---|
| **[Agent Wallet](https://developers.t2000.ai/agent-wallet)** | `@t2000/cli` + `@t2000/mcp` + skills | A terminal Agent Wallet + MCP server for Claude / Cursor / Windsurf. Gasless USDC + USDsui sends, Cetus swaps, MPP paid API access. One install. |
| **[Agent Payments](https://developers.t2000.ai/agent-payments)** | `@suimpp/mpp`, `mppx` | Pay any MPP-protected API in USDC. Every major AI + data API, no signup, no API keys — gasless on Sui. Live gateway at [`mpp.t2000.ai`](https://mpp.t2000.ai). |
| **[Agent SDK](https://developers.t2000.ai/agent-sdk)** | `@t2000/sdk` | TypeScript SDK underneath everything else. One class (`T2000`) — wallet signing, gasless transfers, swap routing, MPP, NAVI lending builders. |
| **[Agent Engine](https://developers.t2000.ai/agent-engine)** | `@t2000/engine` | The agent engine for conversational finance — `AISDKEngine`, 26 financial tools, 12 safety guards, MCP client/server. Powers [Audric](https://audric.ai). |

## Install

```bash
npm install -g @t2000/cli
t2 init                    # plain Bech32 wallet, 0o600 perms
t2 mcp install             # wire Claude Desktop / Cursor / Windsurf
```

Paste this into any LLM client for an end-to-end walkthrough:

```
Run `curl -sL https://t2000.ai/skills/t2000-setup` and use the returned
setup instructions to set up my Agent Wallet.
```

Full reference, command surface, SDK API, examples → [developers.t2000.ai](https://developers.t2000.ai).

## Repository

```
t2000/
├── packages/
│   ├── sdk/              @t2000/sdk — TypeScript SDK
│   ├── engine/           @t2000/engine — Agent engine
│   ├── cli/              @t2000/cli — terminal Agent Wallet (`t2`)
│   └── mcp/              @t2000/mcp — MCP server
│
├── apps/
│   ├── web/              t2000.ai — marketing site + skills routes
│   ├── docs/             developers.t2000.ai — Mintlify developer docs
│   └── gateway/          mpp.t2000.ai — MPP gateway (40+ paid APIs)
│
└── t2000-skills/         Agent Skills (markdown playbooks)
```

## Development

```bash
git clone https://github.com/mission69b/t2000 && cd t2000
pnpm install
pnpm build
pnpm typecheck && pnpm lint && pnpm test
```

Releases happen via the `release.yml` GitHub Actions workflow (bumps all 4 packages in lockstep). See [`CLAUDE.md`](CLAUDE.md) for the release process and engineering principles.

## Security

- **Non-custodial** — keys live on the agent's machine, never transmitted.
- **Plain Bech32 wallets** — `~/.t2000/wallet.key`, JSON, `0o600` perms. Move between machines with `t2 export` + `t2 init --import`.
- **Opt-in spending limits** — `t2 limit set --per-tx <USD> --daily <USD>`. Default = no limits + warning footer at `init`.
- **Transaction simulation** — every write dry-runs before signing.
- **Gasless trust boundary** — USDC + USDsui sends + MPP pays use Sui foundation's `0x2::balance::send_funds` sponsor. Swap + SUI send keep their full self-funded gas model.

## License

MIT
