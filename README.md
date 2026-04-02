<p align="center">
  <strong>t2000</strong>
</p>

<h3 align="center">The infrastructure behind Audric.</h3>

<p align="center">
  CLI · SDK · MCP · Engine · Gateway
  <br />
  Built on <a href="https://sui.io">Sui</a> · Open source · Non-custodial
</p>

<p align="center">
  <a href="https://t2000.ai">t2000.ai</a> · <a href="https://audric.ai">Audric</a> · <a href="https://t2000.ai/docs">Docs</a> · <a href="https://www.npmjs.com/package/@t2000/cli">CLI</a> · <a href="https://www.npmjs.com/package/@t2000/sdk">SDK</a> · <a href="https://www.npmjs.com/package/@suimpp/mpp">MPP</a> · <a href="https://mpp.t2000.ai">Services</a> · <a href="https://www.npmjs.com/package/@t2000/mcp">MCP</a>
</p>

<p align="center">
  <a href="https://glama.ai/mcp/servers/mission69b/t2000"><img src="https://glama.ai/mcp/servers/mission69b/t2000/badges/score.svg" alt="t2000 MCP server" /></a>
</p>

---

t2000 is the infrastructure that powers [Audric](https://audric.ai) — conversational finance on Sui. Five packages give AI agents (and developers) everything they need to save, pay, send, borrow, and receive USDC.

```typescript
const agent = await T2000.create({ pin: process.env.T2000_PIN });

await agent.send({ to: '0x...', amount: 50 });
await agent.save({ amount: 100 });    // earn ~2–8% APY (auto-selects best rate)
await agent.borrow({ amount: 20 });   // borrow against savings
await agent.repay({ amount: 20 });    // repay debt
await agent.withdraw({ amount: 50 }); // always returns USDC
```

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| [`@t2000/sdk`](packages/sdk) | TypeScript SDK — core library | `npm install @t2000/sdk` |
| [`@t2000/engine`](packages/engine) | Agent engine — QueryEngine, financial tools, MCP client/server | `npm install @t2000/engine` |
| [`@t2000/cli`](packages/cli) | Terminal bank account + HTTP API | `npm install -g @t2000/cli` |
| [`@t2000/mcp`](packages/mcp) | MCP server for Claude Desktop, Cursor, Windsurf | Included with CLI |
| [`@suimpp/mpp`](https://github.com/mission69b/suimpp) | MPP payment client (Sui USDC) | `npm install @suimpp/mpp` |

## Brand Architecture

```
suimpp.dev     → Protocol (Sui MPP standard, ecosystem, registry)
t2000.ai       → Infrastructure (CLI, SDK, MCP, engine, gateway)
audric.ai      → Consumer product (app, conversational banking)
```

All npm packages (`@t2000/cli`, `@t2000/sdk`, `@t2000/mcp`, `@t2000/engine`), the GitHub repo, and gateway domain stay as t2000. [Audric](https://audric.ai) is the consumer-facing brand. See [BRAND.md](BRAND.md) for full rationale.

## Getting Started

```bash
npm install -g @t2000/cli           # Install
t2000 init                          # Wallet + MCP + safeguards — one command
```

Use the CLI directly or connect your AI via MCP:

```bash
t2000 balance                      # Check balance
t2000 send 10 USDC to 0x...       # Send USDC
t2000 save all                     # Earn yield on idle funds
t2000 pay https://api.example.com  # Pay for MPP-protected APIs
```

## How it works

t2000 wraps five financial primitives into a single interface:

| Feature | What it does | How |
|---------|-------------|-----|
| **Checking** | Send and receive USDC | Direct Sui transfers |
| **Savings** | Earn ~2–8% APY on idle funds | [NAVI](https://naviprotocol.io) (MCP reads + thin tx builders) |
| **Credit** | Borrow USDC against savings | NAVI collateralized loans |
| **Payments (MPP)** | Pay for API resources with USDC | [@suimpp/mpp](https://github.com/mission69b/suimpp) + [MPP Gateway](https://mpp.t2000.ai) |
| **Safeguards** | Per-tx and daily limits, agent lock | `t2000 config show/set`, `t2000 lock/unlock` |
| **MCP** | AI agent banking — natural language | Claude Desktop, Cursor, Windsurf via [@t2000/mcp](packages/mcp) |

Gas is invisible — auto-managed SUI with sponsored fallback. Multi-step operations execute as single atomic PTBs.

### Fees

| Operation | Fee | Notes |
|-----------|-----|-------|
| Save | 0.1% | Protocol fee on deposit |
| Borrow | 0.05% | Protocol fee on loan |
| Withdraw | Free | |
| Repay | Free | |
| Send | Free | |
| Pay (MPP) | Free | Agent pays the API price, no surcharge |

## SDK

```typescript
import { T2000 } from '@t2000/sdk';

const agent = await T2000.create({ pin: process.env.T2000_PIN });
```

| Category | Method | Description |
|----------|--------|-------------|
| **Wallet** | `agent.balance()` | Available + savings + gas breakdown |
| | `agent.send({ to, amount })` | Send USDC |
| | `agent.history()` | Transaction log |
| **Savings** | `agent.save({ amount })` | Deposit USDC to savings, earn APY |
| | `agent.withdraw({ amount })` | Withdraw from savings (always USDC) |
| | `agent.earnings()` | Yield earned, daily rate |
| **Credit** | `agent.borrow({ amount })` | Borrow USDC against collateral |
| | `agent.repay({ amount })` | Repay debt |
| | `agent.healthFactor()` | Liquidation safety |
| **Info** | `agent.rates()` | Current APYs |
| | `agent.positions()` | Open DeFi positions |
| **Safeguards** | `agent.enforcer.getConfig()` | Safeguard settings |
| | `agent.enforcer.set({ maxPerTx?, maxDailySend? })` | Set limits |
| | `agent.enforcer.lock()` | Lock agent |
| | `agent.enforcer.unlock(pin)` | Unlock agent |
| **Payments** | `agent.pay({ url, maxPrice })` | Pay for MPP-protected API |
| **Contacts** | `agent.contacts.list()` | List saved contacts |
| | `agent.contacts.add(name, address)` | Add a contact |
| | `agent.contacts.resolve(nameOrAddress)` | Resolve name to address |

Full API reference: [`@t2000/sdk` README](packages/sdk)

## Engine

`@t2000/engine` powers [Audric](https://audric.ai) — the conversational finance agent. It wraps the SDK in an LLM-driven loop with streaming, tool orchestration, and MCP integration.

```typescript
import { QueryEngine, AnthropicProvider, getDefaultTools } from '@t2000/engine';

const engine = new QueryEngine({
  provider: new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY }),
  agent,
  tools: getDefaultTools(),
});

for await (const event of engine.submitMessage('What is my balance?')) {
  if (event.type === 'text_delta') process.stdout.write(event.text);
}
```

12 built-in tools (5 read, 7 write) with permission tiers, cost tracking, session management, and context window compaction. Read tools use NAVI MCP when available, falling back to the SDK.

Full reference: [`@t2000/engine` README](packages/engine)

## CLI

```bash
# Wallet
t2000 init                         Guided setup (wallet, AI, safeguards)
t2000 balance                      Check balance
t2000 send 10 USDC to 0x...       Send USDC
t2000 history                      Transaction history

# Savings & DeFi
t2000 save 50                      Earn yield (best rate)
t2000 withdraw 25                  Withdraw savings (always USDC)
t2000 borrow 10                    Borrow USDC against collateral
t2000 repay 10                     Repay debt
t2000 health                       Health factor
t2000 rates                        Current APYs

# MPP Payments
t2000 pay https://api.example.com  Pay for API resource

# Contacts
t2000 contacts                     List saved contacts
t2000 contacts add <name> <addr>   Save a named contact

# Safeguards
t2000 config show                  View safeguard settings
t2000 config set maxPerTx 500      Set per-transaction limit
t2000 lock                         Lock agent (freeze all operations)
t2000 unlock                       Unlock agent (requires PIN)

# HTTP API (for non-TypeScript agents)
t2000 serve --port 3001            Start HTTP API server
```

Every command supports `--json` for structured output and `--yes` to skip confirmations.

Full command reference: [`@t2000/cli` README](packages/cli)

## MCP Server

Connect Claude Desktop, Cursor, Windsurf, or any MCP client:

```bash
t2000 mcp install
```

Auto-configures Claude Desktop + Cursor. 25 tools, 16 prompts. Safeguard enforced. See the [MCP setup guide](docs/mcp-setup.md) for details.

## MPP Payments

t2000 supports [MPP (Machine Payments Protocol)](https://mpp.dev) for paid APIs. When a server returns `402 Payment Required`, t2000 automatically pays with Sui USDC and retries.

```bash
t2000 pay "https://mpp.t2000.ai/openai/v1/chat/completions" \
  --data '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}' \
  --max-price 0.05
```

The [MPP Gateway](https://mpp.t2000.ai) proxies 40+ services (88 endpoints) — OpenAI, Anthropic, fal.ai, Brave, Lob, and more.

Full reference: [`@suimpp/mpp` README](https://github.com/mission69b/suimpp/tree/main/packages/mpp)

## Agent Skills

```bash
npx skills add mission69b/t2000-skills
```

Works with Claude Code, OpenAI Codex, GitHub Copilot, Cursor, VS Code, Amp, and [20+ more](https://agentskills.io).

Full reference: [Agent Skills README](t2000-skills)

## Security

- **Non-custodial** — keys live on the agent's machine, never transmitted
- **Encrypted storage** — AES-256-GCM with PIN-derived key (scrypt)
- **Bearer auth** — HTTP API requires token generated at startup
- **Rate limiting** — 10 req/s default prevents runaway drain
- **Risk guards** — health factor checks block risky operations
- **Transaction simulation** — dry-run before signing with Move abort code parsing
- **Circuit breaker** — gas station pauses if SUI price moves >20% in 1 hour

## Repository structure

```
t2000/
├── packages/
│   ├── sdk/              @t2000/sdk — TypeScript SDK (core)
│   ├── engine/           @t2000/engine — Agent engine (QueryEngine, tools, MCP)
│   ├── cli/              @t2000/cli — Terminal bank account
│   ├── mcp/              @t2000/mcp — MCP server (Claude Desktop, Cursor, Windsurf)
│   └── contracts/        Move smart contracts (mpp-sui)
│
├── apps/
│   ├── web/              t2000.ai — developer/infra landing page + docs
│   ├── gateway/          MPP Gateway — proxied AI APIs (mpp.t2000.ai)
│   └── server/           Gas station + checkpoint indexer (api.t2000.ai)
│
├── t2000-skills/         Agent Skills for AI coding assistants
├── spec/                 Product specs, design system
└── .github/workflows/    CI/CD (lint → typecheck → test → deploy)
```

## Development

```bash
git clone https://github.com/mission69b/t2000 && cd t2000
pnpm install
pnpm build

pnpm typecheck    # TypeScript across all packages
pnpm lint         # ESLint
pnpm test         # All unit tests
```

### Testing

```bash
pnpm --filter @t2000/sdk test
pnpm --filter @t2000/engine test
pnpm --filter @t2000/server test
```

## Tech stack

| Layer | Technology |
|-------|------------|
| Chain | Sui (mainnet) |
| Contracts | Move (treasury, admin, fee collection) |
| SDK | TypeScript, `@mysten/sui` |
| Engine | TypeScript, Anthropic Claude, MCP client/server |
| CLI | Commander.js, Hono (HTTP API) |
| DeFi | NAVI (lending, MCP-first) |
| Web | Next.js 15, Tailwind CSS v4, React 19 |
| Consumer | Audric — zkLogin, Enoki gas, Geist + Instrument Serif |
| Infra | AWS ECS Fargate, Vercel, Upstash Redis |
| CI/CD | GitHub Actions |

## License

MIT
