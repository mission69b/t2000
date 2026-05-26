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
  <a href="https://t2000.ai">t2000.ai</a> · <a href="https://audric.ai">Audric</a> · <a href="https://developers.t2000.ai">Developer Docs</a> · <a href="https://www.npmjs.com/package/@t2000/cli">CLI</a> · <a href="https://www.npmjs.com/package/@t2000/sdk">SDK</a> · <a href="https://www.npmjs.com/package/@suimpp/mpp">MPP</a> · <a href="https://mpp.t2000.ai">Services</a> · <a href="https://www.npmjs.com/package/@t2000/mcp">MCP</a>
</p>

<p align="center">
  <a href="https://glama.ai/mcp/servers/mission69b/t2000"><img src="https://glama.ai/mcp/servers/mission69b/t2000/badges/score.svg" alt="t2000 MCP server" /></a>
  <a href="https://github.com/mbeato/awesome-mpp"><img src="https://img.shields.io/badge/Awesome-MPP-orange?style=flat&logo=awesomelists&logoColor=white" alt="Listed on Awesome MPP" /></a>
</p>

---

t2000 is the infrastructure that powers [Audric](https://audric.ai) — conversational finance on Sui. The Audric consumer brand is exactly **five products**:

- 🪪 **Audric Passport** — the trust layer. Sign in with Google, non-custodial wallet on Sui in 3 seconds, every write taps to confirm, Enoki-sponsored gas (web only). Wraps every other product.
- 🧠 **Audric Intelligence** — the brain (the moat). Four systems orchestrate every money decision: Agent Harness (26 tools), Reasoning Engine (12 guards), Memory (MemWal), AdviceLog. Multi-step playbooks (skills) ship from `@t2000/mcp` and surface to Cursor / Claude Desktop as MCP prompts.
- 💰 **Audric Finance** — manage your money on Sui. Save (NAVI lend, 3–8% APY), Credit (NAVI borrow, health factor), Swap (Cetus aggregator, 20+ DEXs), Charts (yield/health/portfolio viz). Every action taps to confirm via Passport.
- 💸 **Audric Pay** — the money primitive. Move money: free, global, instant (on Sui for now). Send USDC, receive via payment links / QR. No bank, no borders, no fees.
- 🛒 **Audric Store** — creator marketplace at `audric.ai/username`. Sell AI-generated music, art, ebooks in USDC. **Coming soon.**

Five t2000 packages give AI agents and developers everything they need to build the same thing.

## The v4 Agent Wallet (one cohesive stack)

The `@t2000/cli` + `@t2000/mcp` + `t2000-skills` trio = **Agent Wallet** — gasless USDC + USDsui sends, Cetus swaps, MPP paid API access. Plain Bech32 wallets (`0o600` perms), no PIN, opt-in safeguards.

```bash
npm install -g @t2000/cli       # installs `t2` (canonical) + `t2000` (legacy alias)
t2 init                          # create a plain Bech32 wallet — no PIN, no AES
t2 send 5 USDC alice.sui         # gasless USDC send to a SuiNS name
t2 swap 100 USDC SUI             # best-route swap via Cetus across 20+ DEXs
t2 pay https://mpp.t2000.ai/openai/v1/chat/completions --data '…'
t2 mcp install                   # wire Claude Desktop / Cursor / Windsurf in one command
```

**One-prompt install** — paste this into any LLM client:

```
Run `curl -sL https://t2000.ai/skills/t2000-setup` and use the returned setup
instructions to set up my Agent Wallet.
```

DeFi (save / borrow / withdraw / repay / yields) is **programmatic-only** in v4 — it lives in [`@t2000/sdk`](packages/sdk) for consumer apps like Audric to wire up, not in the CLI. The CLI is intentionally narrow.

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| [`@t2000/sdk`](packages/sdk) | TypeScript SDK — Agent Wallet (send/swap/pay/receive) + programmatic-only DeFi (save/borrow/withdraw/repay/health) | `npm install @t2000/sdk` |
| [`@t2000/engine`](packages/engine) | Agent engine — `AISDKEngine`, 26 financial tools, MCP client/server. Powers Audric Intelligence. | `npm install @t2000/engine` |
| [`@t2000/cli`](packages/cli) | Terminal Agent Wallet — `t2 init / send / swap / pay / mcp install` | `npm install -g @t2000/cli` |
| [`@t2000/mcp`](packages/mcp) | MCP server — 9 tools + 8 auto-registered skill prompts for Claude Desktop, Cursor, Windsurf | Bundled with the CLI |
| [`@suimpp/mpp`](https://github.com/mission69b/suimpp) | MPP payment client (Sui USDC) | `npm install @suimpp/mpp` |

## Brand Architecture

```
suimpp.dev     → Protocol (Sui MPP standard, ecosystem, registry)
t2000.ai       → Infrastructure (CLI, SDK, MCP, engine, gateway)
audric.ai      → Consumer product (app, conversational banking)
```

All npm packages (`@t2000/cli`, `@t2000/sdk`, `@t2000/mcp`, `@t2000/engine`), the GitHub repo, and the gateway domain stay as t2000. [Audric](https://audric.ai) is the consumer-facing brand.

## SDK

```typescript
import { T2000 } from '@t2000/sdk';

const { agent, address } = await T2000.init();        // brand-new wallet
const agent = await T2000.create();                   // load existing wallet
const agent = T2000.fromPrivateKey('suiprivkey1…');   // in-memory load

await agent.send({ to: 'alice.sui', amount: 5, asset: 'USDC' });  // gasless
await agent.swap({ from: 'USDC', to: 'SUI', amount: 100 });        // Cetus, needs SUI
await agent.pay({ url: 'https://mpp.t2000.ai/…', method: 'POST', body, maxPrice: 0.10 });
```

| Category | Method | Description |
|----------|--------|-------------|
| **Wallet** | `agent.balance()` | USDC + USDsui + SUI balances + USD totals |
| | `agent.send({ to, amount, asset })` | Send USDC / USDsui / SUI. `asset` is required. USDC + USDsui gasless via `0x2::balance::send_funds`. |
| | `agent.receive({ amount?, memo?, label? })` | Payment Kit `sui:pay?…` URI for any wallet to scan |
| | `agent.history({ limit? })` | Recent on-chain activity |
| | `agent.resolveRecipient(input)` | Public resolver: hex → SuiNS → @audric handle → contact |
| | `agent.exportKey()` | Print the `suiprivkey1…` secret for the underlying keypair |
| **Swap** | `agent.swap({ from, to, amount, slippage? })` | Cetus Aggregator V3 across 20+ Sui DEXs |
| | `agent.swapQuote({ from, to, amount })` | Preview route + output + price impact (no execution) |
| **MPP** | `agent.pay({ url, method?, body?, maxPrice? })` | 402 → quote → USDC payment → retry. Gasless. |
| **DeFi (programmatic-only)** | `agent.save({ amount, asset? })` | Deposit USDC or USDsui to NAVI (best APY). **Not exposed via CLI.** |
| | `agent.borrow({ amount, asset? })` | Borrow USDC or USDsui against collateral |
| | `agent.repay({ amount, asset? })` | Repay debt — **symmetry enforced** (USDsui debt → USDsui repay) |
| | `agent.withdraw({ amount, asset? })` | Withdraw from NAVI savings |
| | `agent.healthFactor()` | NAVI liquidation safety reading |
| | `agent.positions()` | Open DeFi positions |
| | `agent.rates()` | Current NAVI APYs |

Full API reference: [`@t2000/sdk` README](packages/sdk).

## Engine — Audric Intelligence (the moat)

`@t2000/engine` powers [Audric](https://audric.ai) — the conversational finance agent. It implements **Audric Intelligence**, the 4-system moat that makes Audric a financial agent rather than a chatbot. Every action it triggers still waits on Audric Passport's tap-to-confirm.

> _Not a chatbot. A financial agent._ Four systems work together to **understand** your money (Memory), **reason** about decisions (Reasoning Engine), **act** through 26 financial tools in one conversation (Agent Harness), and **remember what it told you** (AdviceLog). Picks the tool, clears the guards, never contradicts itself.

| System | What it does | Implementation |
|---|---|---|
| 🎛️ **Agent Harness** | 26 tools, one agent. Read tools fan out in parallel via AI SDK's native step model; write tools serialise structurally — confirm-tier writes yield a `pending_action` event so the host round-trips through user confirmation before the next step. | `AISDKEngine` + AI SDK v6 `streamText` + `needsApproval` round-trip + 18 read / 8 write tools (`getDefaultTools()`) |
| ⚡ **Reasoning Engine** | Thinks before it acts. Adaptive thinking (`classifyEffort`), 12 safety guards across 3 priority tiers. Multi-step orchestration ("rebalance my portfolio", "safe borrow", "swap and save") lives in **skills** — markdown playbooks in `t2000-skills/skills/*/SKILL.md`, baked into `@t2000/mcp` and exposed to MCP clients as `skill-<name>` prompts. | `classifyEffort`, `runGuards`, `t2000-skills/skills/`, `@t2000/mcp` skills-as-prompts adapter |
| 🧠 **Memory (MemWal)** | Knows your finances + remembers your patterns. Long-term vector facts (preferences, goals, risk tolerance) recalled top-K each turn into a `<memory_recall>` system-prompt block. Plus a daily `<financial_context>` snapshot refreshed at 02:00 UTC. | Engine: `prepareStep` + `MemoryStore` injection. Audric-side: `@mysten-incubation/memwal` SDK + `UserFinancialContext` Prisma model |
| 📓 **AdviceLog** | Remembers what it told you. Every recommendation is written via `record_advice`; last 30 days hydrate every turn so the chat doesn't contradict itself across sessions. | Audric-side: `AdviceLog` Prisma model + `record_advice` tool + `buildAdviceContext()` |

```typescript
import { AISDKEngine, getDefaultTools } from '@t2000/engine';

const engine = new AISDKEngine({
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  agent,
  tools: getDefaultTools(),
});

for await (const event of engine.submitMessage('What is my balance?')) {
  if (event.type === 'text_delta') process.stdout.write(event.text);
}
```

> `AISDKEngine` wraps Vercel AI SDK v6's `streamText`. For custom providers / gateway routing, pass a pre-built `LanguageModel` via `modelInstance` instead of `anthropicApiKey`.

Full reference: [`@t2000/engine` README](packages/engine).

## CLI

```bash
# Wallet
t2 init                               # create a plain Bech32 wallet (no PIN)
t2 init --import                      # import an existing suiprivkey1… secret
t2 export                             # print the Bech32 secret
t2 receive                            # show address + ANSI QR
t2 balance                            # USDC / USDsui / SUI + USD totals
t2 history                            # recent on-chain activity

# Send / Swap / Pay
t2 send 5 USDC alice.sui              # gasless USDC send (asset required)
t2 send 0.1 SUI 0x…                   # SUI send (standard gas)
t2 swap 100 USDC SUI --slippage 1     # best-route via Cetus across 20+ DEXs
t2 swap 100 USDC SUI --quote          # preview without signing
t2 pay https://mpp.t2000.ai/…         # 402 → quote → USDC payment → retry

# MPP discovery
t2 services search "gpt"              # find MPP services on the gateway
t2 services inspect <url>             # pricing + quote preview

# Safeguards (opt-in)
t2 limit set --per-tx 100             # per-transaction USD cap
t2 limit set --daily 500              # daily cumulative USD cap
t2 limit show                         # display current limits
t2 limit reset                        # clear all caps

# MCP + Skills
t2 mcp install                        # wire Claude Desktop / Cursor / Windsurf
t2 mcp start                          # start the stdio server (called by clients)
t2 skills install --target=cursor     # install per-skill SKILL.md files locally
```

Every command supports `--json` for structured output. `--force` overrides spending limits on individual writes. `t2000` is a legacy alias — both bins point at the same entry.

Full command reference: [`@t2000/cli` README](packages/cli).

## MCP Server

Connect Claude Desktop, Cursor, Windsurf, or any MCP client:

```bash
t2 mcp install
```

Auto-configures Claude Desktop + Cursor + Windsurf. **9 tools** (5 read + 3 write + 1 settings) namespaced as `t2000_*` + **8 auto-registered skill prompts** (`skill-t2000-setup`, `skill-t2000-send`, etc.). Spending limits are honored.

Full reference: [`@t2000/mcp` README](packages/mcp).

## MPP Payments

t2000 supports [MPP (Machine Payments Protocol)](https://mpp.dev) for paid APIs. When a server returns `402 Payment Required`, t2000 automatically pays with Sui USDC and retries.

```bash
t2 pay "https://mpp.t2000.ai/openai/v1/chat/completions" \
  --data '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}' \
  --max-price 0.05
```

The [MPP Gateway](https://mpp.t2000.ai) proxies 40+ services (88 endpoints) — OpenAI, Anthropic, fal.ai, Brave, Lob, and more.

Full reference: [`@suimpp/mpp` README](https://github.com/mission69b/suimpp/tree/main/packages/mpp).

## Agent Skills

8 v4 skills shipped via the MCP server as `skill-<name>` prompts, or installable per-client with `t2 skills install --target=<cursor|claude-code|agents>`:

- [`t2000-setup`](https://t2000.ai/skills/t2000-setup) — end-to-end wallet bootstrap
- [`t2000-check-balance`](https://t2000.ai/skills/t2000-check-balance) — inspect USDC / USDsui / SUI before any write
- [`t2000-send`](https://t2000.ai/skills/t2000-send) — explicit `--asset`, gasless USDC / USDsui, SUI sends that need gas
- [`t2000-receive`](https://t2000.ai/skills/t2000-receive) — address share, ANSI QR, Payment Kit URIs
- [`t2000-swap`](https://t2000.ai/skills/t2000-swap) — Cetus routing, slippage, swap-needs-SUI gotcha
- [`t2000-services`](https://t2000.ai/skills/t2000-services) — discover MPP services before `t2 pay`
- [`t2000-pay`](https://t2000.ai/skills/t2000-pay) — MPP 402 flow
- [`t2000-mcp`](https://t2000.ai/skills/t2000-mcp) — wire the MCP server into Claude / Cursor / Windsurf

Live manifest: [`https://t2000.ai/.well-known/agent-skills/index.json`](https://t2000.ai/.well-known/agent-skills/index.json).

Full reference: [Agent Skills README](t2000-skills).

## Fees

The t2000 SDK + CLI are **fee-free** by design. Network gas + protocol fees (Cetus routing, NAVI rates, etc.) still apply at on-chain rates. Fees are an Audric concern — when [Audric](https://audric.ai) is the consumer, it adds protocol fees inline within the same Payment Intent (0.1% save, 0.05% borrow, 0.1% swap; withdraw / repay / send / receive / pay are free).

Building your own consumer app on top of `@t2000/sdk`? Use the `addFeeTransfer` helper for save/borrow and `overlayFee` config for swaps to mirror Audric's pattern, or skip fees entirely.

## Security

- **Non-custodial** — keys live on the agent's machine, never transmitted
- **Plain Bech32 wallets** — `~/.t2000/wallet.key` is JSON, `0o600` perms. No PIN, no AES — v4 trades the failure-mode of "user forgets PIN, can't recover" for filesystem ACL trust. Use `t2 export` + `t2 init --import` to move wallets between machines.
- **Opt-in spending limits** — `t2 limit set --per-tx <USD> --daily <USD>` writes caps to `~/.t2000/config.json`. Default = no limits + warning footer at `init`.
- **Transaction simulation** — every write dry-runs before signing, Move abort codes surfaced
- **Gasless trust boundary** — USDC + USDsui sends + MPP pays use Sui foundation's `0x2::balance::send_funds` sponsor. Swap + SUI send keep their full self-funded gas model.

## Repository structure

```
t2000/
├── packages/
│   ├── sdk/              @t2000/sdk — TypeScript SDK (Agent Wallet + DeFi)
│   ├── engine/           @t2000/engine — Agent engine (AISDKEngine, tools, MCP)
│   ├── cli/              @t2000/cli — Terminal Agent Wallet (`t2` + `t2000` bins)
│   └── mcp/              @t2000/mcp — MCP server (Claude Desktop, Cursor, Windsurf)
│
├── apps/
│   ├── web/              t2000.ai — public marketing site + skills routes
│   ├── docs/             developers.t2000.ai — Mintlify developer docs
│   ├── gateway/          MPP Gateway — proxied AI APIs (mpp.t2000.ai)
│   └── server/           Fee ledger + checkpoint indexer + daily-intel cron (api.t2000.ai)
│
├── t2000-skills/         Agent Skills for AI coding assistants
├── spec/                 Product specs (active/shipping/archive/reference)
└── .github/workflows/    CI/CD (lint → typecheck → test → publish)
```

## Development

```bash
git clone https://github.com/mission69b/t2000 && cd t2000
pnpm install
pnpm build

pnpm typecheck    # TypeScript across all packages
pnpm lint         # ESLint
pnpm test         # All unit tests (2114 across SDK + engine + CLI + MCP)
```

### Releases

```bash
gh workflow run release.yml --field bump=major   # major | minor | patch
```

Bumps all 4 packages (`@t2000/{sdk,engine,cli,mcp}`) in lockstep, tags `vX.Y.Z`, and triggers the publish workflow (CI gate + `pnpm publish` × 4 + GitHub Release + Discord notification). See [`CLAUDE.md`](CLAUDE.md) → "Release process" for the full flow.

## Tech stack

| Layer | Technology |
|-------|------------|
| Chain | Sui (mainnet) |
| SDK | TypeScript, `@mysten/sui@2.x`, gRPC + JSON-RPC |
| Engine | TypeScript, Anthropic Claude, AI SDK v6, MCP client/server |
| CLI | Commander.js |
| DeFi (audric-only) | NAVI (lending), Cetus (swap), BlockVision (portfolio + prices) |
| Web | Next.js 15, Tailwind CSS v4, React 19 |
| Docs | Mintlify (developers.t2000.ai) |
| Consumer | Audric — zkLogin, Enoki gas, Geist + Instrument Serif |
| Infra | AWS ECS Fargate, Vercel, Upstash Redis |
| CI/CD | GitHub Actions |

## License

MIT
