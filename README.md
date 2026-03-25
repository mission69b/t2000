<p align="center">
  <strong>t2000</strong>
</p>

<h3 align="center">A bank account for AI agents.</h3>

<p align="center">
  Checking · Savings · Credit · Invest · Pay · MCP
  <br />
  Built on <a href="https://sui.io">Sui</a> · Open source · Non-custodial · BYOK LLM
</p>

<p align="center">
  <a href="https://t2000.ai">Website</a> · <a href="https://t2000.ai/docs">Docs</a> · <a href="https://www.npmjs.com/package/@t2000/cli">CLI</a> · <a href="https://www.npmjs.com/package/@t2000/sdk">SDK</a> · <a href="https://www.npmjs.com/package/@t2000/mpp-sui">MPP</a> · <a href="https://mpp.t2000.ai">Services</a> · <a href="https://www.npmjs.com/package/@t2000/mcp">MCP</a>
</p>

<p align="center">
  <a href="https://glama.ai/mcp/servers/mission69b/t2000"><img src="https://glama.ai/mcp/servers/mission69b/t2000/badges/score.svg" alt="t2000 MCP server" /></a>
</p>

---

Your agent can hold money, earn yield, borrow against savings, swap tokens, and pay for APIs — all in one CLI command. No human in the loop.

```typescript
// Load existing wallet
const agent = await T2000.create({ pin: process.env.T2000_PIN });
// Or create a new one
const { agent } = await T2000.init({ pin: 'my-secret' });

await agent.send({ to: '0x...', amount: 50 });
await agent.save({ amount: 100 });    // earn ~2–8% APY (auto-selects best rate)
await agent.borrow({ amount: 20 });   // borrow against savings
await agent.repay({ amount: 20 });    // repay debt
await agent.withdraw({ amount: 50 }); // always returns USDC

await agent.buy({ asset: 'SUI', usdAmount: 100 }); // buy $100 in SUI (or BTC, ETH, GOLD)
await agent.sell({ asset: 'SUI', usdAmount: 'all' }); // sell all SUI
await agent.investEarn({ asset: 'SUI' });                    // deposit to lending for yield
await agent.investUnearn({ asset: 'SUI' });                  // withdraw from lending
await agent.investRebalance();                               // move earning to better-rate protocol
await agent.investStrategy({ strategy: 'bluechip', usdAmount: 200 }); // atomic PTB
await agent.setupAutoInvest({ amount: 50, frequency: 'weekly', strategy: 'bluechip' });
```

## See it work

```
❯ t2000 init

  Step 1 of 3 — Create wallet
  Creating agent wallet...
  ✓ Keypair generated
  ✓ Network  Sui mainnet
  ✓ Gas sponsorship  enabled
  ✓ Checking  ✓ Savings  ✓ Credit  ✓ Swap  ✓ Investment
  🎉 Bank account created
  Address: 0x8b3e...d412

  Step 2 of 3 — Connect AI platforms
  ✓ Claude Desktop  configured
  ✓ Cursor  configured

  Step 3 of 3 — Set safeguards
  ✓ Safeguards configured

  ✓ You're all set
  Restart Claude Desktop / Cursor and ask: "What's my t2000 balance?"

❯ t2000 balance
  Available:  $85.00   (checking — spendable)
  Savings:    $80.00   (earning 4.86% APY)
  Investment: $5.02    (+0.4%)
  ──────────────────────────────────────
  Total:      $170.02
```

## Why t2000?

AI agents need money. They need to pay for APIs, receive payments, hold funds, and eventually — fund themselves. But today, giving an agent a wallet means teaching it about gas tokens, transaction signing, RPC endpoints, and DeFi protocols.

**t2000 makes all of that invisible.**

| Problem | t2000 Solution |
|---------|---------------|
| Agents can't hold money | Non-custodial bank account in one line of code |
| Gas tokens are confusing | Auto-managed — agent never sees SUI |
| Idle funds lose value | Automatic yield via NAVI + Suilend (~2–8% APY) |
| DeFi is complex | `save()`, `borrow()`, `repay()`, `withdraw()` — four methods |
| No standard payment protocol | [MPP](https://mpp.dev) client + [gateway](https://mpp.t2000.ai) — pay per request with Sui USDC |
| No standard wallet interface | SDK + CLI + HTTP API for any language |

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
t2000 buy 100 SUI                 # Buy $100 in SUI
t2000 swap 5 USDC SUI             # Swap tokens via Cetus DEX
t2000 pay https://api.example.com  # Pay for MPP-protected APIs
```

## How it works

t2000 wraps five DeFi primitives into a single interface that any AI agent can use:

| Feature | What it does | How |
|---------|-------------|-----|
| **Checking** | Send and receive USDC | Direct Sui transfers |
| **Savings** | Earn ~2–8% APY on idle funds | [NAVI](https://naviprotocol.io) + [Suilend](https://suilend.fi) (auto-selected) |
| **Credit** | Borrow USDC against savings | NAVI + Suilend collateralized loans |
| **Investment** | Buy and sell supported assets (SUI, BTC, ETH, GOLD) with cost-basis P&L | [Cetus DEX](https://www.cetus.zone) CLMM pools |
| **Investment Yield** | Earn yield on held assets via lending | NAVI + Suilend (auto-selected best rate, auto-rebalance) |
| **Strategies** | Themed allocations (bluechip, all-weather, safe-haven, layer1, sui-heavy) — single atomic PTB | Agent orchestration + Cetus |
| **Auto-Invest** | Dollar-cost averaging (daily/weekly/monthly DCA) | Agent scheduling |
| **Yield Optimizer** | Auto-rebalance across 4 stablecoins | `t2000 rebalance` — moves savings to highest APY in a single atomic PTB |
| **Payments (MPP)** | Pay for API resources with USDC | [@t2000/mpp-sui](packages/mpp-sui) + [MPP Gateway](https://mpp.t2000.ai) |
| **Safeguards** | Per-tx and daily limits, agent lock | `t2000 config show/set maxPerTx/maxDailySend`, `t2000 lock`, `t2000 unlock` |
| **MCP** | AI agent banking — natural language | Claude Desktop, Cursor, Windsurf via [@t2000/mcp](packages/mcp) |

Gas is invisible. t2000 handles it automatically: self-funded SUI → auto-topup ($1 USDC → SUI when low) → sponsored fallback for bootstrapping.

All multi-step operations (save with auto-convert, withdraw with auto-swap, rebalance) execute as single atomic Programmable Transaction Blocks (PTBs). If any step fails, the entire transaction reverts — no funds left in intermediate states.

### Fees

| Operation | Fee | Notes |
|-----------|-----|-------|
| Save | 0.1% | Protocol fee on deposit |
| Borrow | 0.05% | Protocol fee on loan |
| Swap | **Free** | Cetus pool fees only; used internally by rebalance/auto-convert |
| Withdraw | Free | |
| Repay | Free | |
| Send | Free | |
| Pay (MPP) | Free | Agent pays the API price, no t2000 surcharge |

### The self-funding loop

At ~$2,000 supplied, yield from savings offsets typical AI compute costs — the agent becomes self-funding.

| Supplied | APY | Monthly Yield | Covers |
|----------|-----|---------------|--------|
| $100 | ~8% | $0.67 | — |
| $500 | ~8% | $3.33 | Light agent ($3/mo) |
| $2,000 | ~8% | $13.33 | Medium agent ($15/mo) |
| $10,000 | ~8% | $66.67 | Heavy agent |

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| [`@t2000/sdk`](packages/sdk) | TypeScript SDK — core library | `npm install @t2000/sdk` |
| [`@t2000/cli`](packages/cli) | Terminal bank account + HTTP API | `npm install -g @t2000/cli` |
| [`@t2000/mcp`](packages/mcp) | MCP server for Claude Desktop, Cursor, Windsurf | Included with CLI |
| [`@t2000/mpp-sui`](packages/mpp-sui) | MPP payment client (Sui USDC) | `npm install @t2000/mpp-sui` |

## SDK

```typescript
import { T2000 } from '@t2000/sdk';

const agent = await T2000.create({ pin: process.env.T2000_PIN });
// or: const agent = T2000.fromPrivateKey('suiprivkey1q...');
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
| | `agent.enforcer.lock()` | Lock agent (freeze all operations) |
| | `agent.enforcer.unlock(pin)` | Unlock agent |
| | `agent.enforcer.check(amount)` | Check if amount allowed |
| | `agent.enforcer.recordUsage(amount)` | Record send for daily limit |
| | `agent.enforcer.isConfigured()` | Whether safeguards are set up |
| **Payments** | `agent.pay({ url, maxPrice })` | Pay for MPP-protected API (auto 402 handling) |
| **Contacts** | `agent.contacts.list()` | List saved contacts |
| | `agent.contacts.add(name, address)` | Add a contact |
| | `agent.contacts.remove(name)` | Remove a contact |
| | `agent.contacts.get(name)` | Get contact address |
| | `agent.contacts.resolve(nameOrAddress)` | Resolve name → address |
| **Investment** | `agent.buy({ asset, usdAmount })` | Buy crypto asset with USD |
| | `agent.sell({ asset, usdAmount })` | Sell crypto asset back to USDC |
| | `agent.swap({ from, to, amount })` | Swap tokens via Cetus DEX |
| | `agent.swapQuote({ from, to, amount })` | Get swap quote without executing |
| | `agent.investEarn({ asset })` | Deposit held asset to lending for yield |
| | `agent.investUnearn({ asset })` | Withdraw from lending, keep in portfolio |
| | `agent.investRebalance({ dryRun? })` | Move earning positions to better-rate protocols |
| | `agent.getPortfolio()` | Investment positions + P&L |
| **Strategies** | `agent.investStrategy({ strategy, usdAmount })` | Buy into a strategy (atomic PTB) |
| | `agent.rebalanceStrategy({ strategy })` | Rebalance to target weights |
| | `agent.getStrategies()` | List available strategies |
| **Auto-Invest** | `agent.setupAutoInvest({ amount, frequency, strategy })` | Schedule DCA |
| | `agent.runAutoInvest()` | Execute pending purchases |
| **Sentinel** | `agent.sentinelList()` | Browse active sentinels |
| | `agent.sentinelAttack(id, prompt)` | Full attack flow |

Full API reference → [`@t2000/sdk` README](packages/sdk)

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
t2000 rebalance                    Optimize yield across stablecoins
t2000 swap 5 USDC SUI              Swap tokens via Cetus DEX
t2000 buy 100 SUI                  Buy $100 in SUI (or BTC, ETH, GOLD)
t2000 sell all SUI                 Sell entire SUI position
t2000 invest earn SUI              Deposit SUI to lending for yield
t2000 invest unearn SUI            Withdraw from lending, keep invested
t2000 invest rebalance             Move earning to better-rate protocol
t2000 invest strategy buy layer1 200 Buy into a strategy (1 atomic tx)
t2000 invest strategy list           List available strategies
t2000 invest auto setup 50 weekly bluechip   Set up DCA
t2000 invest auto run                Execute pending DCA
t2000 portfolio                      Investment portfolio + P&L
t2000 earnings                     Yield earned
t2000 health                       Health factor
t2000 rates                        Current APYs

# MPP Payments
t2000 pay https://api.example.com  Pay for API resource

# Earn (directory)
t2000 earn                         Show all earning opportunities

# Sentinel (earn bounties)
t2000 sentinel list                Browse active sentinels
t2000 sentinel attack <id> "..."   Attack a sentinel (costs SUI)
t2000 sentinel info <id>           Sentinel details

# Contacts
t2000 contacts                     List saved contacts
t2000 contacts add <name> <addr>   Save a named contact
t2000 contacts remove <name>       Remove a contact

# Safeguards
t2000 config show                  View safeguard settings
t2000 config set maxPerTx 500      Set per-transaction limit
t2000 config set maxDailySend 1000 Set daily send limit
t2000 lock                         Lock agent (freeze all operations)
t2000 unlock                       Unlock agent (requires PIN)

# HTTP API (for non-TypeScript agents)
t2000 serve --port 3001            Start HTTP API server
```

Every command supports `--json` for structured output and `--yes` to skip confirmations.

Full command reference → [`@t2000/cli` README](packages/cli)

## HTTP API

For agents written in Python, Go, Rust, or any language:

```bash
t2000 serve --port 3001
# ✓ Auth token: t2k_a1b2c3d4e5f6...
```

```bash
curl -H "Authorization: Bearer t2k_..." http://localhost:3001/v1/balance
curl -X POST -H "Authorization: Bearer t2k_..." \
  -d '{"to":"0x...","amount":10}' \
  http://localhost:3001/v1/send
```

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/balance` | Balance breakdown |
| GET | `/v1/earnings` | Yield summary |
| GET | `/v1/rates` | Current APYs |
| GET | `/v1/health-factor` | Health factor |
| POST | `/v1/send` | Send USDC |
| POST | `/v1/save` | Deposit to savings |
| POST | `/v1/withdraw` | Withdraw from savings |
| POST | `/v1/borrow` | Borrow USDC |
| POST | `/v1/repay` | Repay debt |
| GET | `/v1/events` | SSE stream (yield, balance changes) |

## MPP Payments

t2000 supports [MPP (Machine Payments Protocol)](https://mpp.dev) for paid APIs. When a server returns `402 Payment Required`, t2000 automatically pays with Sui USDC and retries — no API keys, no subscriptions, no human approval.

```typescript
const result = await agent.pay({
  url: 'https://mpp.t2000.ai/openai/v1/chat/completions',
  body: { model: 'gpt-4o', messages: [{ role: 'user', content: 'Hello' }] },
  maxPrice: 0.05,
});
```

```bash
t2000 pay "https://mpp.t2000.ai/openai/v1/chat/completions" \
  --data '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}' \
  --max-price 0.05
```

The [MPP Gateway](https://mpp.t2000.ai) proxies 41 services (90 endpoints) — OpenAI, Anthropic, fal.ai, Brave, Lob, Reloadly, and more — all payable with Sui USDC.

Full reference → [`@t2000/mpp-sui` README](packages/mpp-sui)

## MCP Server

Connect Claude Desktop, Cursor, Windsurf, or any MCP client to your t2000 agent:

```bash
t2000 mcp install
```

**Architecture:** User → MCP Client (Claude/Cursor/Windsurf) → @t2000/mcp → @t2000/sdk → Sui

Auto-configures Claude Desktop + Cursor. 35 tools · 20 prompts · stdio transport · safeguard enforced. Supports 41 MPP services (90 endpoints). See the [MCP setup guide](docs/mcp-setup.md) for full instructions.

## Agent Skills

Install one package and your AI agent gains financial capabilities:

```bash
npx skills add mission69b/t2000-skills
```

Works with Claude Code, OpenAI Codex, GitHub Copilot, Cursor, VS Code, Amp, Goose, and [20+ more](https://agentskills.io).

| Skill | Trigger |
|-------|---------|
| `t2000-check-balance` | "check balance", "how much USDC do I have" |
| `t2000-send` | "send 10 USDC to..." |
| `t2000-save` | "deposit to savings", "earn yield" |
| `t2000-withdraw` | "withdraw from savings" |
| `t2000-borrow` | "borrow 40 USDC" |
| `t2000-repay` | "repay my loan" |
| `t2000-swap` | "swap USDC to SUI", "swap tokens" |
| `t2000-pay` | "call that paid API" |
| `t2000-sentinel` | "attack a sentinel", "earn bounties" |
| `t2000-rebalance` | "optimize yield", "rebalance savings" |
| `t2000-contacts` | "list contacts", "add contact" |
| `t2000-invest` | "buy SUI", "sell BTC", "portfolio" |

Full reference → [Agent Skills README](t2000-skills)

## Comparison

| Feature | Coinbase Agent Kit | t2000 |
|---------|--------------------|-------|
| Chain | Base only | Sui |
| Send / receive | ✓ | ✓ |
| Earn yield on savings | — | ✓ NAVI + Suilend (~2–8% APY) |
| Borrow / credit line | — | ✓ Borrow against savings + investment collateral |
| Token swap | ✓ Base tokens | ✓ Cetus DEX (stables + SUI, BTC, ETH, GOLD) |
| Investment (spot buy/sell) | — | ✓ SUI, BTC, ETH, GOLD with cost-basis P&L |
| Yield on holdings | — | ✓ Earn lending APY on holdings while keeping price exposure |
| Borrow against holdings | — | ✓ Deposited holdings count as collateral for credit |
| Margin trading | — | 🔜 Coming soon — leveraged positions on SUI, BTC, ETH, GOLD |
| Strategies + DCA | — | ✓ Atomic PTB multi-asset buys, dollar-cost averaging |
| MPP client | ✓ Base / Solana | ✓ Sui · OpenAI, Anthropic, fal, Firecrawl |
| Agent Skills | ✓ | ✓ |
| Gas abstraction | ✓ Gasless (Base) | ✓ Auto-topup (Sui) |
| DeFi composability | — | ✓ Atomic PTB multi-step |
| Health factor protection | — | ✓ On-chain enforcement |
| Yield Optimizer | — | ✓ Auto-rebalance across 4 stablecoins |
| Agent Safeguards | — | ✓ Per-tx + daily limits + lock |
| MCP Server | — | ✓ 35 tools + 20 AI prompts + 41 MPP services |

## Security

- **Non-custodial** — keys live on the agent's machine, never transmitted
- **Encrypted storage** — AES-256-GCM with PIN-derived key (scrypt)
- **Bearer auth** — HTTP API requires token generated at startup
- **Rate limiting** — 10 req/s default prevents runaway drain
- **Risk guards** — health factor checks block risky withdrawals/borrows
- **Transaction simulation** — dry-run before signing with Move abort code parsing
- **Circuit breaker** — gas station pauses if SUI price moves >20% in 1 hour
- **Replay protection** — on-chain nonce enforcement via Sui Payment Kit

## Repository structure

```
t2000/
├── packages/
│   ├── sdk/              @t2000/sdk — TypeScript SDK (core)
│   ├── cli/              @t2000/cli — Terminal bank account
│   ├── mcp/              @t2000/mcp — MCP server (Claude Desktop, Cursor, Windsurf)
│   └── mpp-sui/          @t2000/mpp-sui — MPP payment client
│
├── apps/
│   ├── gateway/           MPP Gateway — proxied AI APIs (mpp.t2000.ai)
│   ├── server/            Gas station + checkpoint indexer
│   └── web/               Landing page + docs (Next.js)
│
├── t2000-skills/         Agent Skills for AI coding assistants
├── infra/                AWS ECS deployment scripts
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
pnpm --filter @t2000/sdk test     # 469 tests
pnpm --filter @t2000/mpp-sui test
pnpm --filter @t2000/server test  # 10 tests
```

Integration tests run real transactions on Sui mainnet and require a funded wallet. See each package README for details.

## Tech stack

| Layer | Technology |
|-------|------------|
| Chain | Sui (mainnet) |
| Contracts | Move (treasury, admin, fee collection) |
| SDK | TypeScript, `@mysten/sui` |
| CLI | Commander.js, Hono (HTTP API) |
| DeFi | NAVI + Suilend (lending), Cetus CLMM (swaps) |
| Web | Next.js 16, Tailwind CSS v4, React 19 |
| Infra | AWS ECS Fargate |
| CI/CD | GitHub Actions |

## License

MIT
