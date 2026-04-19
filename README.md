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

t2000 is the infrastructure that powers [Audric](https://audric.ai) — conversational finance on Sui. The Audric consumer brand is exactly **five products**:

- 🪪 **Audric Passport** — the trust layer. Sign in with Google, non-custodial wallet on Sui in 3 seconds, every write taps to confirm, sponsored gas. Wraps every other product.
- 🧠 **Audric Intelligence** — the brain (the moat). Five systems orchestrate every money decision: Agent Harness (40 tools), Reasoning Engine (9 guards, 7 skill recipes), Silent Profile, Chain Memory, AdviceLog. Picks the tool, clears the guards, remembers what it told you.
- 💰 **Audric Finance** — manage your money on Sui. Save (NAVI lend, 3–8% APY), Credit (NAVI borrow, health factor), Swap (Cetus aggregator, 20+ DEXs), Charts (yield/health/portfolio viz). Every action taps to confirm via Passport.
- 💸 **Audric Pay** — the money primitive. Move money: free, global, instant (on Sui for now). Send USDC, receive via payment links/invoices/QR. No bank, no borders, no fees.
- 🛒 **Audric Store** — creator marketplace at `audric.ai/username`. Sell AI-generated music, art, ebooks in USDC. **Coming soon.**

Five t2000 packages give AI agents and developers everything they need to build the same thing.

```typescript
const agent = await T2000.create({ pin: process.env.T2000_PIN });

await agent.send({ to: '0x...', amount: 50 });
await agent.save({ amount: 100 });    // earn ~2–8% APY (auto-selects best rate)
await agent.borrow({ amount: 20 });   // borrow against savings
await agent.repay({ amount: 20 });    // repay debt
await agent.withdraw({ amount: 50 }); // always returns USDC
await agent.swap({ from: 'SUI', to: 'USDC', amount: 10 });  // 20+ DEX routing
await agent.stakeVSui({ amount: 5 }); // liquid staking → vSUI (~3-5% APY)
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

All npm packages (`@t2000/cli`, `@t2000/sdk`, `@t2000/mcp`, `@t2000/engine`), the GitHub repo, and gateway domain stay as t2000. [Audric](https://audric.ai) is the consumer-facing brand.

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

t2000 wraps financial primitives into a single interface:

| Feature | What it does | How |
|---------|-------------|-----|
| **Checking** | Send USDC | Direct Sui transfers |
| **Receive** | Payment requests with QR & address | Local generation, Sui payment URI |
| **Savings** | Earn ~2–8% APY on idle funds | [NAVI](https://naviprotocol.io) (MCP reads + thin tx builders) |
| **Credit** | Borrow USDC against savings | NAVI collateralized loans |
| **Swap** | Trade any token pair on Sui | [Cetus Aggregator V3](https://www.cetus.zone) (20+ DEXs) |
| **Liquid Staking** | Stake SUI for vSUI (~3-5% APY) | [VOLO](https://www.volosui.com) (thin tx builders) |
| **Payments (MPP)** | Pay for API resources with USDC | [@suimpp/mpp](https://github.com/mission69b/suimpp) + [MPP Gateway](https://mpp.t2000.ai) |
| **Market Data** | Token prices, yields, TVL, protocol info | [DefiLlama](https://defillama.com) (free REST API) |
| **Safeguards** | Per-tx and daily limits, agent lock | `t2000 config show/set`, `t2000 lock/unlock` |
| **MCP** | AI agent banking — natural language | Claude Desktop, Cursor, Windsurf via [@t2000/mcp](packages/mcp) |

Gas is invisible — self-funded SUI with sponsored fallback for bootstrap. Multi-step operations execute as single atomic PTBs.

### Fees

| Operation | Fee | Notes |
|-----------|-----|-------|
| Save | 0.1% | Protocol fee on deposit |
| Borrow | 0.05% | Protocol fee on loan |
| Withdraw | Free | |
| Repay | Free | |
| Send | Free | |
| Receive | Free | Local payment request generation |
| Swap | 0.1% | t2000 overlay fee; Cetus Aggregator network fees still apply |
| Stake/Unstake | Free | VOLO protocol fees only |
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
| | `agent.receive({ amount?, memo? })` | Generate payment request with QR URI |
| | `agent.history()` | Transaction log |
| **Savings** | `agent.save({ amount })` | Deposit USDC to savings, earn APY |
| | `agent.withdraw({ amount })` | Withdraw from savings (always USDC) |
| | `agent.earnings()` | Yield earned, daily rate |
| **Swap** | `agent.swap({ from, to, amount })` | Swap any token pair (Cetus, 20+ DEXs) |
| **Staking** | `agent.stakeVSui({ amount })` | Stake SUI → vSUI (VOLO, ~3-5% APY) |
| | `agent.unstakeVSui({ amount })` | Unstake vSUI → SUI |
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

## Engine — Audric Intelligence (the moat)

`@t2000/engine` powers [Audric](https://audric.ai) — the conversational finance agent. It implements **Audric Intelligence**, the 5-system moat that makes Audric a financial agent rather than a chatbot. Every action it triggers still waits on Audric Passport's tap-to-confirm.

| System | What it does |
|---|---|
| 🎛️ **Agent Harness** | 40 tools, one agent. The runtime that manages money — balances, DeFi, analytics, payments — orchestrated by a single conversation. Save, swap, borrow, repay, withdraw, send all live here. |
| ⚡ **Reasoning Engine** | Thinks before it acts. Adaptive thinking (`classifyEffort`), 9 safety guards across 3 priority tiers (`runGuards`), 7 YAML skill recipes (`RecipeRegistry`), preflight input validation, prompt caching, extended thinking always-on. |
| 🧠 **Silent Profile** | Builds a private financial profile from chat history (`buildProfileContext`). Used silently to make answers more relevant — never surfaced as nudges. |
| 🔗 **Chain Memory** | Reads wallet history into structured facts (`buildMemoryContext`) — recurring sends, idle balances, position changes. |
| 📓 **AdviceLog** | Every recommendation is logged via `record_advice` so the agent doesn't contradict itself across sessions (last 30 days hydrated each turn). |

It wraps the SDK in an LLM-driven loop with streaming, tool orchestration, and MCP integration.

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

40 built-in tools (29 read, 11 write) with permission tiers, cost tracking, session management, and context window compaction. Includes a reasoning engine (adaptive thinking, guard runner, skill recipes) and a canvas system for interactive in-chat visualizations. Read tools use NAVI MCP and DefiLlama for market data, falling back to the SDK.

Full reference: [`@t2000/engine` README](packages/engine)

## CLI

```bash
# Wallet
t2000 init                         Guided setup (wallet, AI, safeguards)
t2000 balance                      Check balance
t2000 send 10 USDC to 0x...       Send USDC
t2000 receive --amount 25          Generate payment request with QR
t2000 history                      Transaction history

# Savings & DeFi
t2000 save 50                      Earn yield (best rate)
t2000 withdraw 25                  Withdraw savings (always USDC)
t2000 borrow 10                    Borrow USDC against collateral
t2000 repay 10                     Repay debt
t2000 swap 10 SUI for USDC        Swap any token (20+ DEXs)
t2000 stake 5                      Stake SUI for vSUI (~3-5% APY)
t2000 unstake all                  Unstake vSUI back to SUI
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

Auto-configures Claude Desktop + Cursor. 40 tools mirroring the engine tool set. Safeguard enforced. See the [MCP setup guide](docs/mcp-setup.md) for details.

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
| DeFi | NAVI (lending), Cetus (swap), VOLO (liquid staking), DefiLlama (market data) |
| Web | Next.js 15, Tailwind CSS v4, React 19 |
| Consumer | Audric — zkLogin, Enoki gas, Geist + Instrument Serif |
| Infra | AWS ECS Fargate, Vercel, Upstash Redis |
| CI/CD | GitHub Actions |

## License

MIT
