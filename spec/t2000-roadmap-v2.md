# t2000 Roadmap — v2.0

**Last updated:** March 2026
**Current version:** v0.7.0 (SDK + CLI published on npm, x402 v0.3.0)

---

## What's Shipped

Everything below is live on Sui mainnet, published on npm, and deployed.

### Core Platform (v0.1.x–v0.3.x)

| Feature | Status |
|---------|--------|
| SDK (`@t2000/sdk`) — send, save, withdraw, borrow, repay, swap, balance, events | ✅ |
| CLI (`@t2000/cli`) — all commands, `--json` output, local HTTP API (`t2000 serve`) | ✅ |
| x402 Client (`@t2000/x402`) — machine-to-machine payments via Sui Payment Kit | ✅ |
| Agent Skills — 9 SKILL.md files for Claude, GPT, Cursor, Copilot, 20+ platforms | ✅ |
| Server — sponsor API, gas station, fee ledger, x402 facilitator (/verify, /settle) | ✅ ECS Fargate |
| Indexer — checkpoint-based, yield snapshotter, crash-safe cursor | ✅ ECS Fargate |
| Website — t2000.ai (landing page, docs, demos, stats) | ✅ Vercel |
| Move contracts — fee collection, treasury, admin controls, timelocked governance | ✅ Mainnet |
| Sponsored onboarding — hashcash PoW, 10 bootstrap transactions | ✅ |
| Gas abstraction — self-funded → auto-topup → sponsored fallback | ✅ |

### Sentinel Integration (v0.3.x)

| Feature | Status |
|---------|--------|
| SDK module (`protocols/sentinel.ts`) — list, info, attack (full flow) | ✅ |
| CLI commands — `t2000 sentinel list`, `attack`, `info` | ✅ |
| TEE integration — AWS Nitro Enclave attack flow | ✅ |
| On-chain settlement — `request_attack` + `consume_prompt` PTBs | ✅ |
| Agent Skill — `t2000-sentinel` rewritten for CLI | ✅ |
| Live demos on t2000.ai/demo | ✅ |

### Adapter Architecture + Multi-Protocol (v0.4.x–v0.7.0)

| Feature | Status |
|---------|--------|
| Adapter interfaces — `LendingAdapter`, `SwapAdapter`, `ProtocolDescriptor` | ✅ |
| Protocol Registry — rate comparison, auto-routing, multi-protocol views | ✅ |
| NAVI adapter — save, withdraw, borrow, repay (contract-first, no SDK) | ✅ |
| Suilend adapter — save, withdraw (contract-first, no SDK) | ✅ |
| Cetus adapter — swap via Aggregator V3 (20+ DEX routing) | ✅ |
| `@mysten/sui` v2 migration — `SuiJsonRpcClient`, ESM-only | ✅ |
| Contract-first protocol integrations — no external protocol SDKs | ✅ |
| ProtocolDescriptor pattern — scalable event tracking from SDK to indexer | ✅ |
| CLI multi-protocol — `--protocol` flag, `rates`, `earn`, `positions` | ✅ |
| Auto-routing — `t2000 save` picks best APY across protocols | ✅ |
| Adapter compliance test suite — 286 tests across 19 files | ✅ |
| `CONTRIBUTING-ADAPTERS.md` — developer guide for new adapters | ✅ |
| CI — Adapter Compliance job on PRs to main | ✅ |
| Indexer — protocol-aware classification, `byProtocol` stats | ✅ |
| Stats API — `/api/stats` with protocol breakdown, agent activity | ✅ |
| Deploy workflows — server + indexer CI/CD with typecheck gates | ✅ |

### Supported Assets (current)

| Asset | Send | Save | Borrow | Swap |
|-------|------|------|--------|------|
| USDC | ✅ | ✅ (NAVI + Suilend) | ✅ (NAVI) | ✅ |
| SUI | ✅ (gas) | — | — | ✅ |

### Supported Protocols (current)

| Protocol | Type | Capabilities | Approach |
|----------|------|-------------|----------|
| NAVI Protocol | Lending | save, withdraw, borrow, repay | Contract-first (dynamic package ID) |
| Suilend | Lending | save, withdraw | Contract-first |
| Cetus | Swap | swap (Aggregator V3, 20+ DEXes) | SDK with type-cast bridge |

---

## Phase 10 — Multi-Stable Support

**Goal:** Expand the banking stack to support USDT and USDe alongside USDC. Stables-only for save/borrow — zero liquidation risk.

**Why stables-only:** The "bank account" positioning means dollar-denominated, safe, predictable. Volatile assets (WETH, WBTC) introduce liquidation risk for autonomous agents operating unsupervised. Those ship later as an "investment account" feature with proper risk management.

### Supported Assets (after Phase 10)

| Asset | Type | Send | Save | Borrow | Swap | Notes |
|-------|------|------|------|--------|------|-------|
| USDC | Native (Circle) | ✅ | ✅ | ✅ | ✅ | Primary unit of account |
| SUI | Native | ✅ | — | — | ✅ | Gas + exchange |
| suiUSDT | Bridged stable | ✅ | ✅ | ✅ | ✅ | Available on NAVI + Suilend |
| suiUSDe | Bridged stable (Ethena) | ✅ | ✅ | ✅ | ✅ | Available on NAVI + Suilend |

### Implementation

#### 10.1 — SDK: Expand `SUPPORTED_ASSETS` in constants.ts

Add token type addresses for suiUSDT and suiUSDe on mainnet. Add decimal configs.

#### 10.2 — SDK: Add Cetus swap pairs for new stables

Cetus Aggregator V3 handles multi-hop routing automatically. Add supported pairs:
- USDC ↔ USDT
- USDC ↔ USDe
- USDT ↔ SUI

Update `CetusAdapter.getSupportedPairs()` and adapter constants.

#### 10.3 — SDK: Update adapters for new assets

Both NAVI and Suilend adapters already support the adapter interface. Extend `supportedAssets` arrays and pool configs for USDT/USDe.

#### 10.4 — SDK: Update balance query

`balance()` should return holdings across all supported stables.

#### 10.5 — CLI: Extend asset parameter for new stables

Commands already accept an optional `[asset]` argument defaulting to USDC. Extend to USDT/USDe.

#### 10.6 — CLI: Extend `t2000 rates` for multi-asset

Show rates per asset across all protocols.

#### 10.7 — Update Agent Skills, website, docs

Update all 9 SKILL.md files and web pages.

#### 10.8 — Tests + publish

Unit + integration tests for new assets. Publish updated SDK + CLI.

### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 10.1 | Add suiUSDT + suiUSDe to `SUPPORTED_ASSETS` | sdk | 1h | ⬜ |
| 10.2 | Add Cetus Aggregator pairs for new stables | sdk | 2h | ⬜ |
| 10.3 | Update NAVI + Suilend adapters for multi-asset | sdk | 4h | ⬜ |
| 10.4 | Update balance query for multi-stable | sdk | 2h | ⬜ |
| 10.5 | Extend CLI asset param to accept USDT/USDe | cli | 1h | ⬜ |
| 10.6 | Extend `t2000 rates` for multi-asset | cli + sdk | 2h | ⬜ |
| 10.7 | Update Agent Skills + website + docs | skills + web | 2h | ⬜ |
| 10.8 | Unit + integration tests, npm publish | sdk + cli | 3h | ⬜ |

**Estimated total:** 2-3 days

---

## Phase 11 — Yield Optimizer

**Goal:** Agents automatically earn the best yield on their stables across protocols. Includes rebalancing and yield event notifications.

### What's done vs remaining

| Feature | Status |
|---------|--------|
| Suilend protocol adapter (save, withdraw, rates, positions) | ✅ Shipped in v0.5.x |
| Protocol router (rate comparison, auto-routing) | ✅ Shipped (ProtocolRegistry) |
| Multi-protocol `t2000 rates` | ✅ Shipped |
| `--protocol` flag on save/withdraw/borrow/repay | ✅ Shipped |
| Auto-routing `t2000 save` to best APY | ✅ Shipped |
| Rebalance logic + `rebalance()` method | ⬜ |
| `t2000 rebalance` CLI command | ⬜ |
| `yieldOpportunity` event in event system | ⬜ |
| Update Agent Skills with yield optimization guidance | ⬜ |

### Remaining Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 11.3 | Rebalance logic + `rebalance()` method | sdk | 4h | ⬜ |
| 11.4 | `t2000 rebalance` + `--dry-run` CLI command | cli | 3h | ⬜ |
| 11.5 | `yieldOpportunity` event in event system | sdk | 2h | ⬜ |
| 11.7 | Update Agent Skills with yield optimization guidance | skills | 1h | ⬜ |
| 11.9 | Integration tests: rebalance flow | sdk | 3h | ⬜ |

**Estimated total:** 2-3 days

---

## Phase 12 — Bluefin Perps Adapter

**Goal:** Integrate Bluefin perpetual futures — agents can open/close positions, manage margin, and earn funding rates.

**Status:** Initial contact made with Bluefin team. ProtocolDescriptor pattern ready for new adapter types.

### What it enables

```bash
t2000 perps open long 100 USDC --leverage 5x    # Open leveraged long
t2000 perps close <position-id>                   # Close position
t2000 perps positions                             # View open positions
t2000 perps funding                               # Check funding rates
```

### Implementation

#### New adapter type: `PerpsAdapter`

```typescript
export interface PerpsAdapter {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly capabilities: readonly AdapterCapability[];

  init(client: SuiJsonRpcClient): Promise<void>;

  getFundingRate(pair: string): Promise<FundingRate>;
  getPositions(address: string): Promise<PerpsPosition[]>;
  buildOpenTx(address: string, params: OpenPositionParams): Promise<AdapterTxResult>;
  buildCloseTx(address: string, positionId: string): Promise<AdapterTxResult>;
  buildAdjustMarginTx(address: string, positionId: string, amount: number): Promise<AdapterTxResult>;
}
```

### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 12.1 | Define `PerpsAdapter` interface in types.ts | sdk | 2h | ⬜ |
| 12.2 | Research Bluefin Move contracts + API | sdk | 4h | ⬜ |
| 12.3 | Implement `BluefinAdapter` (contract-first) | sdk | 8h | ⬜ |
| 12.4 | Add ProtocolDescriptor for Bluefin | sdk | 1h | ⬜ |
| 12.5 | CLI: `t2000 perps` command group | cli | 4h | ⬜ |
| 12.6 | Update registry for perps routing | sdk | 2h | ⬜ |
| 12.7 | Tests + compliance suite | sdk | 4h | ⬜ |
| 12.8 | Agent Skill: `t2000-perps` | skills | 1h | ⬜ |
| 12.9 | Docs + CONTRIBUTING update | docs | 1h | ⬜ |

**Estimated total:** 1 week

---

## Phase 13 — `t2000 monetize` — x402 Server Middleware

**Goal:** Let agents sell API access. The reverse of `t2000 pay` — agents can monetize their own endpoints.

### What it does

```bash
t2000 monetize start --port 8080 --price 0.01
```

Wraps any HTTP server with x402 payment gating.

### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 13.1 | `x402Middleware` for Hono | x402 | 4h | ⬜ |
| 13.2 | `x402Middleware` for Express | x402 | 2h | ⬜ |
| 13.3 | `t2000 monetize` CLI command | cli | 3h | ⬜ |
| 13.4 | `t2000-monetize` Agent Skill | skills | 1h | ⬜ |
| 13.5 | Tests + docs | all | 2h | ⬜ |

**Estimated total:** 2-3 days

---

## Phase 14 — Dashboard + Agent Network (v1.0)

**Goal:** Public dashboard showing live agent activity. The growth engine.

**Foundation already built:** Stats API (`/api/stats`), indexer with protocol classification, `/stats` page.

### What it includes

- `/network` route on t2000.ai
- Live stats: total agents, USDC supplied, yield earned
- Agent leaderboard (opt-in via `t2000 init --public`)
- Agent detail pages: positions, yield history, tx history
- OG image generation for shareable agent cards
- Embeddable badges

### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 14.1 | Dashboard layout + KPI cards | web | 4h | ⬜ |
| 14.2 | Agent leaderboard (rank by supplied, yield, tx count) | web | 4h | ⬜ |
| 14.3 | Agent detail page (/agent/0x...) | web | 4h | ⬜ |
| 14.4 | `--public` opt-in flag on `t2000 init` | cli + sdk | 2h | ⬜ |
| 14.5 | OG image generation for agent cards | web | 3h | ⬜ |
| 14.6 | Embeddable badges | web | 2h | ⬜ |
| 14.7 | API routes for dashboard data | web | 3h | ⬜ |

**Estimated total:** 2 weeks

---

## Phase 15 — Multi-Agent Profiles (v1.0)

**Goal:** Run multiple agents from one machine with separate bank accounts.

### What it includes

```bash
t2000 init --profile trader-1
t2000 init --profile treasury
t2000 use trader-1
t2000 agents                     # List all profiles
```

- `T2000Fleet` SDK class for managing multiple agents
- `~/.t2000/agents/` directory structure
- Webhooks for yield/health events

### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 15.1 | Profile system (`--profile` flag, agents directory) | sdk + cli | 4h | ⬜ |
| 15.2 | `T2000Fleet` SDK class | sdk | 4h | ⬜ |
| 15.3 | `t2000 agents` + `t2000 use` commands | cli | 2h | ⬜ |
| 15.4 | Webhook configuration for events | sdk | 3h | ⬜ |
| 15.5 | Tests + docs | all | 2h | ⬜ |

**Estimated total:** 1 week

---

## Phase 16 — Investment Account (v1.1)

**Goal:** Support volatile assets (WETH, WBTC) for agents that want exposure beyond stablecoins.

**Prerequisites:** Auto-protect (auto-repay at low HF), health monitoring alerts, stop-loss logic.

### What it includes

- New asset tier: "investment" (vs "banking" for stables)
- WETH, WBTC support for save/borrow/swap
- Health factor monitoring with auto-protection
- Risk warnings in CLI output
- Separate `t2000 invest` command (distinct from `t2000 save`)

### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 16.1 | Add WETH, WBTC to `SUPPORTED_ASSETS` (investment tier) | sdk | 2h | ⬜ |
| 16.2 | Cetus pool IDs for WETH/WBTC pairs | sdk | 2h | ⬜ |
| 16.3 | Auto-protect: auto-repay at HF < 1.2 | sdk | 6h | ⬜ |
| 16.4 | `t2000 invest` command | cli | 3h | ⬜ |
| 16.5 | Health monitoring daemon in `t2000 serve` | cli + sdk | 4h | ⬜ |
| 16.6 | Investment-tier Agent Skills | skills | 2h | ⬜ |
| 16.7 | Tests | sdk | 4h | ⬜ |

**Estimated total:** 2 weeks

---

## Phase 17 — Cross-Chain (v1.2)

**Goal:** Send and receive across chains.

**Blocked on Circle shipping CCTP for Sui.**

| Technology | What it enables | Status |
|-----------|----------------|--------|
| Ika (multi-chain signing) | Agent signs transactions on any chain from Sui keys | Available |
| CCTP (Circle) | Burn/mint native USDC across 22+ chains | Announced for Sui, not yet live |

---

## Priority Summary

| Phase | Feature | Priority | Effort | Status |
|-------|---------|----------|--------|--------|
| **10** | Multi-Stable (USDT, USDe) | **P0** | 2-3 days | ⬜ Next |
| **11** | Yield Optimizer (rebalance, events) | **P0** | 2-3 days | 🔶 Partially shipped |
| **12** | Bluefin Perps Adapter | **P0** | 1 week | ⬜ In discussion |
| **13** | `t2000 monetize` (x402 server) | P1 | 2-3 days | ⬜ |
| **14** | Dashboard + Agent Network | P1 | 2 weeks | 🔶 Foundation built |
| **15** | Multi-Agent Profiles | P2 | 1 week | ⬜ |
| **16** | Investment Account (WETH, WBTC) | P2 | 2 weeks | ⬜ |
| **17** | Cross-Chain (CCTP) | P3 | TBD | Blocked |

---

*t2000 — The first bank account for AI agents.*
*Roadmap v2.0*
