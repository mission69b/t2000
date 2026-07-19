<p align="center">
  <strong>t2000</strong>
</p>

<h3 align="center">The agentic stack for stablecoins on Sui.</h3>

<p align="center">
  Agent Wallet · Agent Payments · Agent ID · Agent SDK
  <br />
  Built on <a href="https://sui.io">Sui</a> · Open source · Non-custodial
</p>

<p align="center">
  <a href="https://t2000.ai">t2000.ai</a> · <a href="https://developers.t2000.ai">Developer docs</a> · <a href="https://mpp.t2000.ai">Services</a> · <a href="https://agents.t2000.ai">t2 Agents</a> · <a href="https://verify.t2000.ai">Verify</a> · <a href="https://www.npmjs.com/package/@t2000/cli">CLI</a> · <a href="https://www.npmjs.com/package/@t2000/sdk">SDK</a> · <a href="https://www.npmjs.com/package/@t2000/mcp">MCP</a>
</p>

<p align="center">
  <a href="https://glama.ai/mcp/servers/mission69b/t2000"><img src="https://glama.ai/mcp/servers/mission69b/t2000/badges/score.svg" alt="t2000 MCP server" /></a>
  <a href="https://github.com/mbeato/awesome-mpp"><img src="https://img.shields.io/badge/Awesome-MPP-orange?style=flat&logo=awesomelists&logoColor=white" alt="Listed on Awesome MPP" /></a>
</p>

---

t2000 is the open-source agentic stack for stablecoins on Sui — everything an AI agent (or a developer building one) needs to hold a wallet, move USDC, pay APIs, sell its own services, and orchestrate financial flows. Four packages, one repo.

## The stack

| Product | npm | What it gives you |
|---|---|---|
| **[Agent Wallet](https://developers.t2000.ai/agent-wallet)** | `@t2000/cli` + `@t2000/mcp` + skills | A terminal Agent Wallet + MCP server for Claude / Cursor / Windsurf. Gasless USDC + USDsui sends, Cetus swaps, x402 paid API access. One install. |
| **[Agent Payments](https://developers.t2000.ai/agent-payments)** | `@suimpp/mpp`, `mppx` | Pay any API in USDC over the x402 rail. Every major AI + data API, no signup, no API keys — gasless on Sui. Live gateway at [`mpp.t2000.ai`](https://mpp.t2000.ai). |
| **[Agent ID](https://developers.t2000.ai/agent-id)** | `@t2000/id` | On-chain agent identity on Sui (ERC-8004-aligned registry) — name, `@handle`, owner, public profile. **Earn from it:** list [services](https://developers.t2000.ai/sell-your-api) (fixed price + SLA, `t2 service create` or the console's Create Agent form) that buyers hire into an on-chain escrow (`a2a_escrow`, 5% fee at settlement) — or list an x402 endpoint (`t2 agent sell`) and get paid USDC per call. Free, gasless registration via `t2 init`. |
| **[Agent SDK](https://developers.t2000.ai/agent-sdk)** | `@t2000/sdk` | TypeScript SDK underneath everything else. One class (`T2000`) — wallet signing, gasless USDC/USDsui sends, Cetus swap routing, x402 pay. |
| **[t2 code](https://t2000.ai/code)** | `@t2000/code` + `create-t2-app` | The free private terminal coding agent — open models, zero data retention, wallet in-session. Scaffold a project with `npm create t2-app@latest`. |

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
│   ├── cli/              @t2000/cli — terminal Agent Wallet (`t2`)
│   ├── mcp/              @t2000/mcp — MCP server
│   └── id/               @t2000/id — Agent ID registry client
│
├── apps/
│   ├── web/              t2000.ai — marketing site + skills routes
│   ├── docs/             developers.t2000.ai — Mintlify developer docs
│   ├── gateway/          mpp.t2000.ai — x402 gateway (42 paid services, 99+ endpoints)
│   └── verify/           verify.t2000.ai — public confidential-receipt explorer + verify hub
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

Releases happen via the `release.yml` GitHub Actions workflow (bumps all four packages in lockstep). See [`CLAUDE.md`](CLAUDE.md) for the release process and engineering principles.

## Security

- **Non-custodial** — keys live on the agent's machine, never transmitted.
- **Plain Bech32 wallets** — `~/.t2000/wallet.key`, JSON, `0o600` perms. Move between machines with `t2 export` + `t2 init --import`.
- **Spending limits ON by default** — `t2 init` seeds conservative caps ($25/tx, $100/day cumulative). Change with `t2 limit set --per-tx <USD> --daily <USD>`, or override a single call with `--force`. Enforced in the SDK write path, so CLI + MCP + programmatic all obey one gate.
- **Transaction simulation** — every write dry-runs before signing.
- **Gasless trust boundary** — USDC + USDsui sends + x402 pays use Sui foundation's `0x2::balance::send_funds` sponsor. Swap + SUI send keep their full self-funded gas model.

## License

MIT
