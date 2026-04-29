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

- 🪪 **Audric Passport** — the trust layer. Sign in with Google, non-custodial wallet on Sui in 3 seconds, every write taps to confirm, Enoki-sponsored gas (web only). Wraps every other product.
- 🧠 **Audric Intelligence** — the brain (the moat). Five systems orchestrate every money decision: Agent Harness (34 tools), Reasoning Engine (14 guards, 6 skill recipes), Silent Profile, Chain Memory, AdviceLog. Picks the tool, clears the guards, remembers what it told you.
- 💰 **Audric Finance** — manage your money on Sui. Save (NAVI lend, 3–8% APY), Credit (NAVI borrow, health factor), Swap (Cetus aggregator, 20+ DEXs), Charts (yield/health/portfolio viz). Every action taps to confirm via Passport.
- 💸 **Audric Pay** — the money primitive. Move money: free, global, instant (on Sui for now). Send USDC, receive via payment links/invoices/QR. No bank, no borders, no fees.
- 🛒 **Audric Store** — creator marketplace at `audric.ai/username`. Sell AI-generated music, art, ebooks in USDC. **Coming soon.**

Five t2000 packages give AI agents and developers everything they need to build the same thing.

```typescript
const agent = await T2000.create({ pin: process.env.T2000_PIN });

await agent.send({ to: '0x...', amount: 50 });
await agent.save({ amount: 100 });                       // USDC (default), best NAVI rate
await agent.save({ amount: 100, asset: 'USDsui' });      // USDsui (v0.51.0+ strategic exception)
await agent.borrow({ amount: 20 });                      // USDC against collateral
await agent.borrow({ amount: 20, asset: 'USDsui' });     // USDsui debt
await agent.repay({ amount: 20, asset: 'USDsui' });      // symmetry: USDsui debt → USDsui repay
await agent.withdraw({ amount: 50 });                    // USDC (or pass asset for USDsui/legacy)
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
| **Market Data** | Wallet portfolio, USD prices | [BlockVision](https://blockvision.org) Indexer REST (`balance_check`, `portfolio_analysis`, `token_prices`); Sui RPC + hardcoded-stable degraded fallback |
| **Protocol metadata** | TVL trends, fees, audits, safety | [DefiLlama](https://defillama.com) via the lone `protocol_deep_dive` tool |
| **DeFi rates** | NAVI lending APYs (supply / borrow) | NAVI MCP via `rates_info` |
| **Safeguards** | Per-tx and daily limits, agent lock | `t2000 config show/set`, `t2000 lock/unlock` |
| **MCP** | AI agent banking — natural language | Claude Desktop, Cursor, Windsurf via [@t2000/mcp](packages/mcp) |

Every transaction is self-funded by the agent's wallet. Multi-step operations execute as single atomic PTBs.

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
| **Savings** | `agent.save({ amount, asset? })` | Deposit USDC or USDsui to NAVI (v0.51.0+); `asset` defaults to USDC |
| | `agent.withdraw({ amount, asset? })` | Withdraw from savings; `asset` defaults to USDC, also supports USDsui + legacy positions |
| | `agent.earnings()` | Yield earned, daily rate |
| **Swap** | `agent.swap({ from, to, amount })` | Swap any token pair (Cetus, 20+ DEXs) |
| **Staking** | `agent.stakeVSui({ amount })` | Stake SUI → vSUI (VOLO, ~3-5% APY) |
| | `agent.unstakeVSui({ amount })` | Unstake vSUI → SUI |
| **Credit** | `agent.borrow({ amount, asset? })` | Borrow USDC or USDsui against collateral (v0.51.0+) |
| | `agent.repay({ amount, asset? })` | Repay debt; pass `asset` to target a specific debt. **Symmetry enforced:** USDsui debt → USDsui repay (v0.51.1+) |
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

> _Not a chatbot. A financial agent._ Five systems work together to **understand** your money (Silent Profile), **reason** about decisions (Reasoning Engine), **act** through 34 financial tools in one conversation (Agent Harness), **remember** what you do on-chain (Chain Memory), and **remember what it told you** (AdviceLog). Picks the tool, clears the guards, never contradicts itself.

| System | What it does | Implementation |
|---|---|---|
| 🎛️ **Agent Harness** | 34 tools, one agent. The runtime that manages money — balances, DeFi, analytics, payments — orchestrated by a single conversation. Read tools fan out in parallel (`Promise.allSettled`); write tools serialise under `TxMutex`. Streaming dispatch fires read-only tools mid-stream before `message_stop`. | `QueryEngine` + `runTools` + `EarlyToolDispatcher` + 23 read / 11 write tools (`getDefaultTools()`) |
| ⚡ **Reasoning Engine** | Thinks before it acts. Adaptive thinking (`classifyEffort` routes `low`/`medium`/`high`/`max`), 14 safety guards across 3 priority tiers (12 pre-exec + 2 post-exec hints) — `input_validation`, `retry_protection`, `address_source`, `asset_intent`, `address_scope`, `swap_preview`, `irreversibility`, `balance_validation`, `health_factor`, `large_transfer`, `slippage`, `cost_warning`, `artifact_preview`, `stale_data`. 6 YAML skill recipes (`swap_and_save`, `safe_borrow`, `send_to_contact`, `portfolio_rebalance`, `account_report`, `emergency_withdraw`). Prompt caching on system prompt + tool definitions. Extended thinking always-on for Sonnet/Opus. | `classifyEffort`, `runGuards`, `RecipeRegistry`, `engine.ts` `cache_control` |
| 🧠 **Silent Profile** | Knows your finances. Daily on-chain orientation snapshot (savings/wallet/debt USD, health factor, weighted APY, recent activity) refreshed at 02:00 UTC and injected as a `<financial_context>` system-prompt block at every engine boot — every chat starts oriented, no warm-up tool calls. Plus a Claude-inferred profile (risk tolerance, goals, horizon) from chat history. Never surfaced as nudges. | audric-side: `UserFinancialContext` + `UserFinancialProfile` Prisma models + `buildFinancialContextBlock()` + `buildProfileContext()` |
| 🔗 **Chain Memory** | Remembers what you do on-chain. 7 classifiers extract structured facts (recurring sends, idle balances, position changes, near-liquidation events, large transactions, compounding streaks, borrow patterns) into `ChainFact` rows. Silent context — no proposals, no notifications. | audric-side: 7 chain classifiers + `ChainFact` Prisma model + `buildMemoryContext()` |
| 📓 **AdviceLog** | Remembers what it told you. Every recommendation is written via `record_advice` (audric-side tool); last 30 days hydrate every turn so the chat doesn't contradict itself across sessions. `actedOn` flips when the corresponding write executes (via `EngineConfig.onAutoExecuted`). | audric-side: `AdviceLog` Prisma model + `record_advice` tool + `buildAdviceContext()` |

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

### What shipped recently — Spec 1 + Spec 2

The harness has had two correctness-and-intelligence upgrades on top of the 5-system base:

| Spec | Versions | What it added |
|---|---|---|
| **Spec 1 — Correctness** | engine v0.41.0 → v0.50.3 | `attemptId` UUID stamped on every `pending_action` (stable join key from action → on-chain receipt → `TurnMetrics` row). `modifiableFields` registry — fields the user can edit on a confirm card without losing the LLM's reasoning. `EngineConfig.onAutoExecuted` hook so `auto`-permission writes land in the same telemetry as confirm-gated ones. |
| **Spec 2 — Intelligence** | engine v0.47.0 → v0.54.1 | BlockVision swap — replaced 7 `defillama_*` tools with one `token_prices` tool; `balance_check` + `portfolio_analysis` rewired to BlockVision Indexer REST. Sticky-positive cache + retry/circuit breaker (`fetchBlockVisionWithRetry`) for graceful 429 handling. `<financial_context>` boot-time orientation block (Silent Profile). `attemptId`-keyed resume so two pending actions in the same turn never clobber each other's outcome. `protocol_deep_dive` retained on DefiLlama as the lone exception. |

34 built-in tools (23 read, 11 write) with permission tiers, cost tracking, session management, and context window compaction. Read tools use NAVI MCP for lending data and BlockVision Indexer REST for wallet portfolio + USD prices, falling back to Sui RPC. `protocol_deep_dive` is the lone DefiLlama-backed tool. Includes a canvas system for interactive in-chat visualizations.

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
t2000 save 50 [--asset USDC|USDsui]    Earn yield (best rate; default USDC)
t2000 withdraw 25 [--asset <symbol>]   Withdraw savings (default USDC)
t2000 borrow 10 [--asset USDC|USDsui]  Borrow against collateral (default USDC)
t2000 repay 10 [--asset USDC|USDsui]   Repay debt (must match borrow asset)
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

Auto-configures Claude Desktop + Cursor. 29 tools (read-only subset of the engine, namespaced as `t2000_*`). Safeguard enforced. See the [MCP setup guide](docs/mcp-setup.md) for details.

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
│   └── server/           Fee ledger + checkpoint indexer + daily-intel cron (api.t2000.ai)
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
| DeFi | NAVI (lending), Cetus (swap), VOLO (liquid staking), BlockVision (portfolio + prices), DefiLlama (`protocol_deep_dive` only) |
| Web | Next.js 15, Tailwind CSS v4, React 19 |
| Consumer | Audric — zkLogin, Enoki gas, Geist + Instrument Serif |
| Infra | AWS ECS Fargate, Vercel, Upstash Redis |
| CI/CD | GitHub Actions |

## License

MIT
