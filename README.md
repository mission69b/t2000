<p align="center">
  <strong>t2000</strong>
</p>

<h3 align="center">The first bank account for AI agents.</h3>

<p align="center">
  Checking · Savings · Credit · Exchange · x402 Pay
  <br />
  Built on <a href="https://sui.io">Sui</a> · Open source · Non-custodial
</p>

<p align="center">
  <a href="https://t2000.ai">Website</a> · <a href="https://t2000.ai/docs">Docs</a> · <a href="https://www.npmjs.com/package/@t2000/cli">CLI</a> · <a href="https://www.npmjs.com/package/@t2000/sdk">SDK</a> · <a href="https://www.npmjs.com/package/@t2000/x402">x402</a>
</p>

---

Your agent can hold money, earn yield, borrow against savings, exchange currencies, and pay for APIs — all in one CLI command. No human in the loop.

```typescript
const agent = await T2000.create({ passphrase: process.env.T2000_PASSPHRASE });
await agent.send({ to: '0x...', amount: 50 });
await agent.save({ amount: 100 });     // earn ~4–8% APY via NAVI Protocol
await agent.borrow({ amount: 20 });    // borrow against savings
await agent.repay({ amount: 20 });     // repay debt
await agent.swap({ from: 'USDC', to: 'SUI', amount: 5 });
```

## See it work

```
❯ t2000 init
  ✓ Keypair generated
  ✓ Network  Sui mainnet
  ✓ Gas sponsorship  enabled
  ✓ Checking  ✓ Savings  ✓ Credit  ✓ Exchange  ✓ 402 Pay
  🎉 Bank account created
  Address: 0x8b3e...d412

❯ t2000 send 10 USDC to 0x8b3e...d412
  ✓ Sent $10.00 USDC → 0x8b3e...d412

❯ t2000 save 80 USDC
  ✓ Saved $80.00 USDC to NAVI
  APY: 4.21% · Earning ~$0.009/day

❯ t2000 borrow 20 USDC
  ✓ Borrowed $20.00 USDC (same-asset)
  Health Factor: 3.39

❯ t2000 repay 20 USDC
  ✓ Repaid $20.00 USDC · Debt: $0.00

❯ t2000 swap 5 USDC to SUI
  ✓ 5.00 USDC → 5.83 SUI

❯ t2000 pay https://data.api.com/prices
  ← 402 Payment Required · $0.01 USDC
  ✓ Paid $0.01 USDC · 200 OK · 820ms

❯ t2000 balance
  Available:  $85.00 USDC  (checking — spendable)
  Savings:    $80.00 USDC  (earning 4.21% APY)
  Gas:        0.31 SUI     (~$0.28)
  ──────────────────────
  Total:      $165.28 USDC
```

## Why t2000?

AI agents need money. They need to pay for APIs, receive payments, hold funds, and eventually — fund themselves. But today, giving an agent a wallet means teaching it about gas tokens, transaction signing, RPC endpoints, and DeFi protocols.

**t2000 makes all of that invisible.**

| Problem | t2000 Solution |
|---------|---------------|
| Agents can't hold money | Non-custodial bank account in one line of code |
| Gas tokens are confusing | Auto-managed — agent never sees SUI |
| Idle funds lose value | Automatic yield via NAVI Protocol (~4–8% APY) |
| DeFi is complex | `save()`, `swap()`, `borrow()`, `repay()` — four methods |
| No standard payment protocol | x402 client — first implementation on Sui |
| No standard wallet interface | SDK + CLI + HTTP API for any language |

## Quickstart

```bash
npx @t2000/cli init                # Create a bank account
t2000 balance                      # Check balance
t2000 send 10 USDC to 0x...       # Send USDC
t2000 save all                     # Earn yield on idle funds
t2000 pay https://api.example.com  # Pay for x402 APIs
```

## How it works

t2000 wraps five DeFi primitives into a single interface that any AI agent can use:

| Feature | What it does | How |
|---------|-------------|-----|
| **Checking** | Send and receive USDC | Direct Sui transfers |
| **Savings** | Earn ~4–8% APY on idle funds | [NAVI Protocol](https://naviprotocol.io) lending |
| **Credit** | Borrow against savings | NAVI collateralized loans |
| **Exchange** | Swap between USDC and SUI | [Cetus](https://cetus.zone) CLMM DEX |
| **x402 Pay** | Pay for API resources with USDC | [Sui Payment Kit](https://docs.sui.io/standards/payment-kit) |

Gas is invisible. t2000 handles it automatically: self-funded SUI → auto-topup ($1 USDC → SUI when low) → sponsored fallback for bootstrapping.

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
| [`@t2000/cli`](packages/cli) | Terminal bank account + HTTP API | `npx @t2000/cli init` |
| [`@t2000/x402`](packages/x402) | x402 payment client (first on Sui) | `npm install @t2000/x402` |

## SDK

```typescript
import { T2000 } from '@t2000/sdk';

const agent = await T2000.create({ passphrase: process.env.T2000_PASSPHRASE });
// or: const agent = T2000.fromPrivateKey('suiprivkey1q...');
```

| Category | Method | Description |
|----------|--------|-------------|
| **Wallet** | `agent.balance()` | Available + savings + gas breakdown |
| | `agent.send({ to, amount })` | Send USDC |
| | `agent.history()` | Transaction log |
| **Savings** | `agent.save({ amount })` | Deposit to NAVI, earn APY |
| | `agent.withdraw({ amount })` | Withdraw from savings |
| | `agent.earnings()` | Yield earned, daily rate |
| **Credit** | `agent.borrow({ amount })` | Borrow against collateral |
| | `agent.repay({ amount })` | Repay debt |
| | `agent.healthFactor()` | Liquidation safety |
| **Exchange** | `agent.swap({ from, to, amount })` | Swap via Cetus DEX |
| **x402** | `agent.pay(url)` | Pay for x402 APIs |
| **Info** | `agent.rates()` | Current APYs |
| | `agent.positions()` | Open DeFi positions |

Full API reference → [`@t2000/sdk` README](packages/sdk)

## CLI

```bash
# Wallet
t2000 init                         Create bank account
t2000 balance                      Check balance
t2000 send 10 USDC to 0x...       Send USDC
t2000 history                      Transaction history

# Savings & DeFi
t2000 save 50                      Earn yield via NAVI
t2000 withdraw 25                  Withdraw savings
t2000 borrow 10                    Borrow against collateral
t2000 repay 10                     Repay debt
t2000 swap 5 USDC SUI             Swap via Cetus DEX
t2000 earnings                     Yield earned
t2000 health                       Health factor
t2000 rates                        Current APYs

# x402 Payments
t2000 pay https://api.example.com  Pay for API resource

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
| POST | `/v1/swap` | Swap tokens |
| POST | `/v1/borrow` | Borrow USDC |
| POST | `/v1/repay` | Repay debt |
| GET | `/v1/events` | SSE stream (yield, balance changes) |

## x402 Payments

t2000 is the first [x402 protocol](https://www.x402.org/) client on Sui. When a server returns `402 Payment Required`, t2000 automatically pays with USDC and retries — no API keys, no subscriptions, no human approval.

```typescript
import { x402Client } from '@t2000/x402';
const client = new x402Client(agent);
const response = await client.fetch('https://api.example.com/data');
```

Built on the [Sui Payment Kit](https://docs.sui.io/standards/payment-kit) with Move-level replay protection.

Full reference → [`@t2000/x402` README](packages/x402)

## Agent Skills

Install one package and your AI agent gains financial capabilities:

```bash
npx skills add t2000/t2000-skills
```

Works with Claude Code, OpenAI Codex, GitHub Copilot, Cursor, VS Code, Amp, Goose, and [20+ more](https://agentskills.io).

| Skill | Trigger |
|-------|---------|
| `t2000-check-balance` | "check balance", "how much USDC do I have" |
| `t2000-send` | "send 10 USDC to..." |
| `t2000-save` | "deposit to savings", "earn yield" |
| `t2000-withdraw` | "withdraw from savings" |
| `t2000-swap` | "swap USDC for SUI" |
| `t2000-borrow` | "borrow 40 USDC" |
| `t2000-repay` | "repay my loan" |
| `t2000-pay` | "call that paid API" |

Full reference → [Agent Skills README](t2000-skills)

## Comparison

| Feature | Coinbase Agent Kit | t2000 |
|---------|--------------------|-------|
| Chain | Base only | Sui |
| Send / receive | ✓ | ✓ |
| Earn yield on savings | — | ✓ NAVI (~4–8% APY) |
| Borrow / credit line | — | ✓ Collateralized |
| Token swap | ✓ Base tokens | ✓ Cetus DEX |
| x402 client | ✓ Base / Solana | ✓ Sui (first on Sui) |
| Agent Skills | ✓ | ✓ |
| Gas abstraction | ✓ Gasless (Base) | ✓ Auto-topup (Sui) |
| DeFi composability | — | ✓ Atomic PTB multi-step |
| Health factor protection | — | ✓ On-chain enforcement |
| Yield Optimizer | — | *Coming soon* |

## Security

- **Non-custodial** — keys live on the agent's machine, never transmitted
- **Encrypted storage** — AES-256-GCM with passphrase-derived key (scrypt)
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
│   └── x402/             @t2000/x402 — x402 payment client
│
├── apps/
│   ├── server/           Gas station + checkpoint indexer
│   └── web/              Landing page + docs (Next.js)
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
pnpm --filter @t2000/sdk test     # 92 tests
pnpm --filter @t2000/x402 test    # 27 tests
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
| DeFi | NAVI Protocol (lending), Cetus CLMM (swaps) |
| Web | Next.js 16, Tailwind CSS v4, React 19 |
| Infra | AWS ECS Fargate |
| CI/CD | GitHub Actions |

## License

MIT
