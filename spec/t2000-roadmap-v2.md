# t2000 Roadmap — v2.0

**Last updated:** March 2026
**Current version:** v0.7.2 (SDK + CLI published on npm, x402 v0.3.0)

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
| Test suite — 317 tests across 20 files (unit + integration + compliance) | ✅ |
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

## Phase 12 — `t2000 monetize` — x402 Server Middleware

**Goal:** Let agents sell API access. The reverse of `t2000 pay` — agents can monetize their own endpoints.

### What it does

```bash
t2000 monetize start --port 8080 --price 0.01
```

Wraps any HTTP server with x402 payment gating.

### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 12.1 | `x402Middleware` for Hono | x402 | 4h | ⬜ |
| 12.2 | `x402Middleware` for Express | x402 | 2h | ⬜ |
| 12.3 | `t2000 monetize` CLI command | cli | 3h | ⬜ |
| 12.4 | `t2000-monetize` Agent Skill | skills | 1h | ⬜ |
| 12.5 | Tests + docs | all | 2h | ⬜ |

**Estimated total:** 2-3 days

---

## Phase 13 — Dashboard + Agent Network (v1.0)

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
| 13.1 | Dashboard layout + KPI cards | web | 4h | ⬜ |
| 13.2 | Agent leaderboard (rank by supplied, yield, tx count) | web | 4h | ⬜ |
| 13.3 | Agent detail page (/agent/0x...) | web | 4h | ⬜ |
| 13.4 | `--public` opt-in flag on `t2000 init` | cli + sdk | 2h | ⬜ |
| 13.5 | OG image generation for agent cards | web | 3h | ⬜ |
| 13.6 | Embeddable badges | web | 2h | ⬜ |
| 13.7 | API routes for dashboard data | web | 3h | ⬜ |

**Estimated total:** 2 weeks

---

## Phase 14 — Multi-Agent Profiles (v1.0)

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
| 14.1 | Profile system (`--profile` flag, agents directory) | sdk + cli | 4h | ⬜ |
| 14.2 | `T2000Fleet` SDK class | sdk | 4h | ⬜ |
| 14.3 | `t2000 agents` + `t2000 use` commands | cli | 2h | ⬜ |
| 14.4 | Webhook configuration for events | sdk | 3h | ⬜ |
| 14.5 | Tests + docs | all | 2h | ⬜ |

**Estimated total:** 1 week

---

## Phase 15 — Cross-Chain (v1.2)

**Goal:** Send and receive across chains.

**Blocked on Circle shipping CCTP for Sui.**

| Technology | What it enables | Status |
|-----------|----------------|--------|
| Ika (multi-chain signing) | Agent signs transactions on any chain from Sui keys | Available |
| CCTP (Circle) | Burn/mint native USDC across 22+ chains | Announced for Sui, not yet live |

---

## Phase 16 — Agent Safeguards

**Goal:** Spending limits, transaction controls, and safety guardrails for autonomous agents. Like a real bank's card controls — but for AI agents operating unsupervised.

**Why this matters:** Agents act autonomously. Without guardrails, a misconfigured or compromised agent can drain funds. Real banks enforce limits at the card level; t2000 enforces them at the agent level.

### Controls

| Control | Description | Example |
|---------|-------------|---------|
| Per-transaction limit | Max amount per single operation | `maxPerTx: 500` |
| Daily send limit | Max outbound transfers per 24h (excludes save/withdraw) | `maxDailySend: 1000` |
| Recipient whitelist | Only send to approved addresses | `allowedRecipients: ['0x...']` |
| Protocol allowlist | Only interact with approved protocols | `allowedProtocols: ['navi', 'suilend', 'cetus']` |
| Agent lock | Freeze all operations instantly | `t2000 lock` / `t2000 unlock` |
| Alert threshold | Emit events when approaching limits (80%) | `alertThreshold: 0.8` |

### CLI

```bash
t2000 config set maxDailySend 1000
t2000 config set maxPerTx 500
t2000 config set allowedRecipients add 0x...
t2000 config set allowedProtocols navi suilend cetus
t2000 lock                          # Freeze agent — no transactions
t2000 unlock                        # Resume operations
t2000 config show                   # Display all safeguards
```

### Design decisions

- **Local enforcement (v1)**: Config stored in `~/.t2000/config.json`. Enforced in SDK before signing. Simple, no on-chain overhead.
- **On-chain enforcement (v2)**: Move module wrapping transactions with limit checks. Protects even if private key is compromised.
- **Limit change cool-down**: Lowering limits is instant. Raising limits requires 24h cool-down — prevents a compromised agent from removing its own guardrails.
- **Scope**: Send limits apply to outbound transfers only. Save/withdraw are internal position movements and don't count.
- **Alert mode**: Before hard-blocking, emit `limitApproaching` events at 80% threshold for operator awareness.

### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 16.1 | Define safeguard config schema + storage | sdk | 2h | ⬜ |
| 16.2 | Pre-sign enforcement layer in SDK | sdk | 4h | ⬜ |
| 16.3 | CLI: `t2000 config` command group | cli | 3h | ⬜ |
| 16.4 | CLI: `t2000 lock` / `t2000 unlock` | cli | 1h | ⬜ |
| 16.5 | `limitApproaching` + `limitExceeded` events | sdk | 2h | ⬜ |
| 16.6 | Limit change cool-down (24h for increases) | sdk | 2h | ⬜ |
| 16.7 | Agent Skill: `t2000-safeguards` | skills | 1h | ⬜ |
| 16.8 | Tests + docs | all | 3h | ⬜ |

**Estimated total:** 3-4 days

---

## Phase 17 — Investment Account (Bluefin + Crypto Assets)

**Goal:** A separate product tier for leveraged trading and crypto asset exposure. Extends t2000 from "bank" to "bank + brokerage" — checking, savings, and now investments. Merges the previously separate "Bluefin Perps" and "Volatile Assets" concepts into one coherent phase.

**Status:** Initial contact made with Bluefin team. ProtocolDescriptor pattern ready for new adapter types.

**Prerequisites:** Phase 16 (Agent Safeguards) — investment tier requires safeguards to be configured before any leveraged position.

**Why a separate tier:** Investment carries liquidation risk and volatility — fundamentally different from the safe, predictable savings tier. Mixing them would violate the "bank account" trust model.

### Account Tiers

| Tier | What it is | Risk | Providers |
|------|-----------|------|-----------|
| **Checking** | USDC balance | None | Native |
| **Savings** | Protocol deposits | Minimal (smart contract risk) | NAVI, Suilend |
| **Investment** | Perps + crypto exposure | High (liquidation, volatility) | Bluefin, Cetus |

### CLI

```bash
# Spot (buy/sell crypto assets)
t2000 invest buy 0.1 BTC              # Buy wBTC via Cetus aggregator
t2000 invest sell 0.1 BTC             # Sell wBTC back to USDC

# Perps (leveraged positions via Bluefin)
t2000 invest long BTC 100 --5x        # 5x leveraged long
t2000 invest short ETH 50 --3x        # 3x leveraged short
t2000 invest close <position-id>      # Close a position

# Portfolio view
t2000 invest positions                 # Open positions + PnL
t2000 invest pnl                       # Realized + unrealized PnL
t2000 invest funding                   # Check funding rates

# Combined balance
t2000 balance
  Checking:   $500.00 USDC
  Savings:    $2,000.00 USDC (earning 5.4% APY)
  Investment: $1,500.00 (0.5 BTC, 1 ETH, 1 BTC-PERP-LONG)
  ──────────────────────────────────
  Total:      $4,000.00
```

### Design decisions

- **Spot vs perps clarity**: "buy/sell" = spot (own the asset). "long/short" = perps (leveraged exposure). CLI makes this unambiguous.
- **Liquidation monitoring is mandatory**: Auto-protection required before any leveraged position is allowed. `t2000 serve` must run health checks.
- **Risk budget**: Optional config: `maxInvestmentPct: 20` — total investment exposure capped at % of portfolio.
- **Mandatory safeguards**: Investment tier requires safeguards (Phase 16) to be configured — max leverage, max position size, stop-loss.
- **PnL tracking**: Track cost basis, realized/unrealized gains, per-position and aggregate.
- **Contract-first**: Follow the same pattern as NAVI/Suilend — no Bluefin SDK dependency, direct Move calls.

### Implementation

#### 17.1 — New adapter type: `PerpsAdapter`

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

#### 17.2 — Bluefin adapter (contract-first)

Research Bluefin Move contracts, implement `BluefinAdapter`, add ProtocolDescriptor.

#### 17.3 — Spot asset expansion

Add wBTC, wETH to `SUPPORTED_ASSETS`. Cetus Aggregator V3 already routes these pairs.

#### 17.4 — Auto-protection

Before opening any leveraged position, verify safeguards are configured. Monitor health while positions are open. Auto-close at critical thresholds.

### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 17.1 | Define `PerpsAdapter` interface in types.ts | sdk | 2h | ⬜ |
| 17.2 | Research Bluefin Move contracts + API | sdk | 4h | ⬜ |
| 17.3 | Implement `BluefinAdapter` (contract-first) | sdk | 8h | ⬜ |
| 17.4 | Add ProtocolDescriptor for Bluefin | sdk | 1h | ⬜ |
| 17.5 | Add wBTC, wETH to `SUPPORTED_ASSETS` | sdk | 2h | ⬜ |
| 17.6 | Update registry for perps routing | sdk | 2h | ⬜ |
| 17.7 | CLI: `t2000 invest` command group | cli | 6h | ⬜ |
| 17.8 | Auto-protection + liquidation monitoring | sdk | 6h | ⬜ |
| 17.9 | PnL tracking (cost basis, realized/unrealized) | sdk | 4h | ⬜ |
| 17.10 | Risk budget enforcement | sdk | 2h | ⬜ |
| 17.11 | Update `t2000 balance` for 3-tier display | cli | 2h | ⬜ |
| 17.12 | PerpsAdapter compliance test suite | sdk | 4h | ⬜ |
| 17.13 | Agent Skill: `t2000-invest` | skills | 1h | ⬜ |
| 17.14 | Docs + CONTRIBUTING update | docs | 1h | ⬜ |

**Estimated total:** 2-3 weeks

---

## Phase 18 — Global Payments (Checking Account)

**Goal:** Position `t2000 send` as a first-class global payments feature. Free, instant, borderless stablecoin transfers — the "checking account" experience.

**Foundation:** `t2000 send` is already shipped and working. This phase adds UX polish and features that make it feel like a real payments product.

### Features

| Feature | Description | CLI |
|---------|-------------|-----|
| Contact book | Named addresses for frequent recipients | `t2000 send 50 to @alice` |
| Payment receipts | Shareable links after each send | Auto-generated on send |
| Payment requests | Generate a "pay me" link | `t2000 request 50 from @bob` |
| Recurring payments | Scheduled sends (via `t2000 serve`) | `t2000 send 50 to @alice --recurring monthly` |

### Design decisions

- **Contact book**: Stored in `~/.t2000/contacts.json`. Aliases map to addresses. Managed via `t2000 contacts add @alice 0x...`.
- **Keep it simple first**: Ship contact book + receipts. Defer recurring payments and payment requests to a later sub-phase.
- **Receipt format**: Suiscan link + amount + timestamp + recipient — printable/shareable.

### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 18.1 | Contact book (storage, add/remove/list) | sdk + cli | 3h | ⬜ |
| 18.2 | `t2000 contacts` CLI command | cli | 2h | ⬜ |
| 18.3 | Payment receipts (post-send shareable link) | cli | 2h | ⬜ |
| 18.4 | Payment requests (`t2000 request`) | cli + sdk | 4h | ⬜ |
| 18.5 | Recurring payments (scheduler in `t2000 serve`) | cli + sdk | 4h | ⬜ |
| 18.6 | Tests + docs | all | 2h | ⬜ |

**Estimated total:** 3-4 days

---

## Phase 19 — Security Audit + Trust Infrastructure

**Goal:** Full-stack security audit, automated security pipeline in CI/CD, public transparency artifacts, beta branding, and legal pages. Build trust before scaling.

**Why now:** t2000 handles real money on mainnet. Before adding more protocols (Phase 10+) and more users, we need: (1) a professional audit, (2) automated security checks that run on every PR, (3) public-facing trust signals, and (4) legal protection.

### 19A — Full-Stack Security Audit

Commission a comprehensive codebase audit (using a separate Claude instance or professional auditor). The audit covers:

| Scope | What to review | Risk area |
|-------|---------------|-----------|
| **SDK** | Key management, transaction building, amount validation, fee logic, adapter routing | Fund safety, overflow/rounding |
| **CLI** | Input validation, PIN handling, key storage, error message leakage | Credential exposure |
| **Server** | Sponsor API rate limiting, gas station abuse, fee ledger integrity, x402 settlement | Drain attacks, DoS |
| **Indexer** | Checkpoint parsing, transaction classification, crash recovery | Data integrity |
| **Move contracts** | Fee collection, admin controls, timelock, upgrade safety | On-chain fund safety |
| **Adapters** | NAVI/Suilend/Cetus contract calls, oracle handling, slippage, amount conversion | Protocol interaction bugs |
| **Infrastructure** | Docker images, ECS config, env var handling, secrets management | Deployment security |
| **Dependencies** | Transitive dependency audit, known CVEs, supply chain risk | Dependency hijacking |

**Deliverable:** `SECURITY_AUDIT.md` report in repo root — findings, severity ratings, remediation status.

### 19B — Automated Security Pipeline (CI/CD)

Add security-focused GitHub Actions jobs that run on every push/PR — publicly visible in the repo.

| Tool | What it does | GH Action |
|------|-------------|-----------|
| **`npm audit`** | Check for known vulnerabilities in dependencies | `npm audit --omit=dev` |
| **Socket.dev** | Deep package analysis — typosquatting, install scripts, telemetry | `socket-security/socket-action` |
| **GitHub Dependabot** | Auto-PR for vulnerable dependency updates | `dependabot.yml` config |
| **Secret scanning** | Detect accidentally committed keys/tokens | GitHub native (enabled in repo settings) |
| **CodeQL** | Static analysis for JS/TS security patterns | `github/codeql-action` |
| **License check** | Ensure all dependencies have compatible licenses | `license-checker` or similar |

New workflow file: `.github/workflows/security.yml`

```yaml
name: Security
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1'  # Weekly Monday 6am UTC

jobs:
  audit:
    name: Dependency Audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm audit --prod
      - run: npx license-checker --failOn 'GPL-3.0;AGPL-3.0'

  codeql:
    name: CodeQL Analysis
    runs-on: ubuntu-latest
    permissions:
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
      - uses: github/codeql-action/analyze@v3
```

### 19C — npm Package Health

| Action | What it does |
|--------|-------------|
| Enable Socket on npmjs.com | Auto-analyzes `@t2000/sdk` and `@t2000/cli` for security signals |
| Add `npm audit signatures` | Verify package provenance |
| Add `provenance` to publish | `npm publish --provenance` — links npm package to specific GitHub commit |
| Badge in README | `[![Socket Badge](https://socket.dev/api/badge/npm/package/@t2000/sdk)](https://socket.dev/npm/package/@t2000/sdk)` |

### 19D — Beta Badge + Branding

| Change | Location |
|--------|----------|
| Add "BETA" badge next to t2000 logo | `apps/web/app/layout.tsx` or logo component |
| Beta badge in navbar/header | Visible on every page |
| Beta notice in CLI | `t2000 --version` → `0.7.1 (beta)` |
| Beta caveat in SDK README | Warning box at top |

**Badge style:** Small pill badge — `[BETA]` in a colored tag (e.g. amber/yellow) next to the logo. Not intrusive, but clearly visible.

### 19E — Terms of Service + Disclaimer Pages

| Page | Route | Content |
|------|-------|---------|
| **Terms of Service** | `/terms` | Usage terms, liability limitations, no financial advice, experimental software, wallet responsibility |
| **Disclaimer** | `/disclaimer` | "Beta software — use at your own risk", not a registered financial institution, no FDIC/deposit insurance, smart contract risk, oracle risk |
| **Privacy Policy** | `/privacy` | What data is collected (on-chain public data only, no PII), no cookies, no analytics tracking |

**Key legal points to cover:**
- t2000 is experimental/beta software
- Not a registered bank, broker, or financial advisor
- No deposit insurance or guarantees
- Users are responsible for their own private keys and funds
- Smart contract risk — protocols can have bugs
- Oracle/price feed risk
- No liability for losses from protocol interactions
- Open source — provided "as is"

**Footer update:** Add links to Terms, Disclaimer, Privacy in the website footer on every page.

### 19F — Public Audit Page on Website

| Feature | Description |
|---------|-------------|
| `/security` route | Public-facing security page on t2000.ai |
| Audit report summary | Key findings, remediation status, last audit date |
| Link to full `SECURITY_AUDIT.md` | In the GitHub repo |
| CI badges | Show live status of security workflow (passing/failing) |
| "Pending full audit" banner | Until professional audit is complete |
| Responsible disclosure | `security@t2000.ai` or GitHub Security Advisories |

### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 19.1 | Run full-stack security audit (separate Claude instance) | all | 4h | ✅ |
| 19.2 | Write `SECURITY_AUDIT.md` report | repo root | 2h | ✅ |
| 19.3 | Remediate critical/high findings (20/22 fixed, 2 deferred) | varies | 4h | ✅ |
| 19.4 | Create `.github/workflows/security.yml` | ci | 2h | ✅ |
| 19.5 | Add `dependabot.yml` config | ci | 30m | ✅ |
| 19.6 | Enable CodeQL in repo settings | ci | 30m | ✅ |
| 19.7 | Enable Socket on npm packages | npm | 30m | ⬜ Manual |
| 19.8 | Add `--provenance` to publish workflow | ci | 30m | ✅ |
| 19.9 | Add security badges to SDK + CLI READMEs | docs | 30m | ⬜ Minor |
| 19.10 | Add "BETA" badge to website logo/header | web | 1h | ✅ |
| 19.11 | Add beta notice to CLI version output | cli | 30m | ✅ |
| 19.12 | Create `/terms` page | web | 2h | ✅ |
| 19.13 | Create `/disclaimer` page | web | 1h | ✅ |
| 19.14 | Create `/privacy` page | web | 1h | ✅ |
| 19.15 | Add footer links (Terms, Disclaimer, Privacy) | web | 30m | ✅ |
| 19.16 | Create `/security` page with audit status + CI badges | web | 2h | ✅ |
| 19.17 | Add responsible disclosure policy (`SECURITY.md`) | repo root | 30m | ✅ |

**Completed.** 15/17 tasks done. 2 minor remaining (Socket enablement, README badges).

---

## Priority Summary

| Phase | Feature | Priority | Effort | Status |
|-------|---------|----------|--------|--------|
| **19** | Security Audit + Trust Infrastructure | **P0** | 3-4 days | ✅ Done |
| **10** | Multi-Stable (USDT, USDe) | **P0** | 2-3 days | ⬜ Next |
| **11** | Yield Optimizer (rebalance, events) | **P0** | 2-3 days | 🔶 Partially shipped |
| **16** | Agent Safeguards (limits, controls, lock) | **P0** | 3-4 days | ⬜ |
| **17** | Investment Account (Bluefin perps + crypto + spot) | **P0** | 2-3 weeks | ⬜ In discussion |
| **12** | `t2000 monetize` (x402 server) | P1 | 2-3 days | ⬜ |
| **13** | Dashboard + Agent Network | P1 | 2 weeks | 🔶 Foundation built |
| **18** | Global Payments (contacts, receipts) | P1 | 3-4 days | 🔶 Send shipped |
| **14** | Multi-Agent Profiles | P2 | 1 week | ⬜ |
| **15** | Cross-Chain (CCTP) | P3 | TBD | Blocked |

---

*t2000 — The first bank account for AI agents.*
*Roadmap v2.2*
