# t2000 Roadmap — v2.0

**Last updated:** February 2026
**Current version:** v0.12.3 (SDK v0.11.2, CLI v0.12.3, MCP v0.12.3, x402 v0.3.0)

---

## What's Shipped

Everything below is live on Sui mainnet, published on npm, and deployed.

### Core Platform (v0.1.x–v0.3.x)

| Feature | Status |
|---------|--------|
| SDK (`@t2000/sdk`) — send, save, withdraw, borrow, repay, swap, balance, events | ✅ |
| CLI (`@t2000/cli`) — all commands, `--json` output, local HTTP API (`t2000 serve`) | ✅ |
| x402 Client (`@t2000/x402`) — machine-to-machine payments via Sui Payment Kit | ✅ |
| Agent Skills — 10 SKILL.md files for Claude, GPT, Cursor, Copilot, 20+ platforms | ✅ |
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
| Suilend adapter — save, withdraw, borrow, repay (contract-first, no SDK) | ✅ |
| Cetus adapter — swap via Aggregator V3 (20+ DEX routing) | ✅ |
| `@mysten/sui` v2 migration — `SuiJsonRpcClient`, ESM-only | ✅ |
| Contract-first protocol integrations — no external protocol SDKs | ✅ |
| ProtocolDescriptor pattern — scalable event tracking from SDK to indexer | ✅ |
| CLI multi-protocol — `--protocol` flag, `rates`, `earn`, `positions` | ✅ |
| Auto-routing — `t2000 save` picks best APY across protocols | ✅ |
| Test suite — 367+ tests across 20 files (unit + integration + compliance) | ✅ |
| `CONTRIBUTING-ADAPTERS.md` — developer guide for new adapters | ✅ |
| CI — Adapter Compliance job on PRs to main | ✅ |
| Indexer — protocol-aware classification, `byProtocol` stats | ✅ |
| Stats API — `/api/stats` with protocol breakdown, agent activity | ✅ |
| Deploy workflows — server + indexer CI/CD with typecheck gates | ✅ |

### Yield Optimizer + Exchange (v0.8.0–v0.11.0)

| Feature | Status |
|---------|--------|
| `t2000 rebalance` — cross-asset yield optimization across 4 stablecoins + 2 protocols | ✅ |
| `t2000 exchange` — token exchange via Cetus DEX, any supported pair | ✅ |
| USDC-in/USDC-out model — save auto-converts, withdraw auto-swaps, repay auto-swaps | ✅ |
| Atomic PTBs for all multi-step flows (save+convert, withdraw+swap, repay+swap, rebalance) | ✅ |
| Composable adapter methods (`addWithdrawToTx`, `addSaveToTx`, `addRepayToTx`, `addSwapToTx`) | ✅ |
| Health factor infinity display, dust filtering, weighted APY + daily earnings in balance | ✅ |
| `CLI_UX_SPEC.md` — design contract for all CLI output | ✅ |
| Interactive demo page with all 7 command flows | ✅ |

### Supported Assets (v0.11.0)

| Asset | Send | Save | Borrow | Swap | Rebalance |
|-------|------|------|--------|------|-----------|
| USDC | ✅ | ✅ (NAVI + Suilend) | ✅ (NAVI + Suilend) | ✅ | ✅ |
| suiUSDT | — | ✅ (NAVI + Suilend) | ✅ (NAVI + Suilend) | ✅ | ✅ |
| suiUSDe | — | ✅ (NAVI + Suilend) | ✅ (NAVI + Suilend) | ✅ | ✅ |
| USDsui | — | ✅ (NAVI + Suilend) | ✅ (NAVI + Suilend) | ✅ | ✅ |
| SUI | ✅ (gas) | — | — | ✅ | — |

### Supported Protocols (current)

| Protocol | Type | Capabilities | Approach |
|----------|------|-------------|----------|
| NAVI Protocol | Lending | save, withdraw, borrow, repay | Contract-first (dynamic package ID) |
| Suilend | Lending | save, withdraw, borrow, repay | Contract-first |
| Cetus | Swap | swap (Aggregator V3, 20+ DEXes) | SDK with type-cast bridge |

---

## Phase 10 — Yield Optimizer + Multi-Stable Infrastructure ✅

**Status:** Shipped (v0.8.0 → v0.10.4)

**Goal:** Agents earn the best yield across all stablecoins automatically via `t2000 rebalance`. User-facing commands stay USDC-denominated — the agent handles multi-stable optimization internally.

**Design evolution:** Originally planned as open multi-stable (10 → 10b), then simplified to USDC-in/USDC-out (10c). The final model is cleaner: "user thinks in dollars, agent handles optimization."

### What shipped

| Command | What it does | Internal multi-stable? |
|---------|-------------|----------------------|
| `save` | Deposits USDC to best rate. Auto-converts non-USDC wallet stables atomically. | Yes (auto-convert) |
| `withdraw` | Always returns USDC. Auto-swaps non-USDC positions back. | Yes (auto-swap) |
| `borrow` | Borrows USDC against collateral | No |
| `repay` | User pays USDC. Auto-swaps to borrowed asset if debt is non-USDC. | Yes (auto-swap) |
| **`rebalance`** | Moves savings to highest yield across 4 stablecoins + 2 protocols. Single atomic PTB. | Yes — the star feature |
| **`exchange`** | Swap any supported tokens via Cetus DEX | Yes |
| `rates` | Shows all yields across all stablecoins and protocols | Yes (read-only) |
| `balance` | Shows portfolio with weighted APY and daily earnings | Yes (read-only) |
| `positions` | Shows actual holdings (may show suiUSDT etc. after rebalance) | Yes (read-only) |

### Key UX (as shipped)

```bash
t2000 save all                       # deposits all stablecoins as USDC
t2000 rebalance --dry-run            # preview: "USDC → suiUSDT for +1.2% APY"
t2000 rebalance                      # withdraw → swap → deposit in one atomic tx
t2000 withdraw all                   # always returns USDC (auto-swaps)
t2000 exchange 5 USDC SUI            # currency exchange via Cetus DEX
t2000 rates                          # "Best yield: suiUSDT on NAVI (5.47%)"
t2000 balance                        # shows APY + daily earnings
```

### Architecture delivered

- **Atomic PTBs**: All multi-step flows (save+auto-convert, withdraw+auto-swap, repay+auto-swap, rebalance) execute as single atomic transactions
- **Composable adapter methods**: `addWithdrawToTx`, `addSaveToTx`, `addRepayToTx`, `addSwapToTx` for PTB composition
- **Dust filtering**: Positions ≤ $0.005 filtered from display
- **Health factor guards**: Infinity display when borrowed < $0.01, safe limits on withdraw/borrow
- **Exchange command**: Full Cetus DEX integration for any supported token pair
- **CLI UX spec**: `CLI_UX_SPEC.md` — design contract for all CLI output formatting

### Tasks (completed)

| # | Task | Package | Status |
|---|------|---------|--------|
| 10.1 | Add USDT, USDe, USDsui to `SUPPORTED_ASSETS` + format utils | sdk | ✅ |
| 10.2 | Adapter infrastructure — NAVI, Suilend, Cetus multi-asset | sdk | ✅ |
| 10.3 | Balance + display — multi-stable balance, rates headline, positions | sdk + cli | ✅ |
| 10.4 | Borrow + repay — multi-stable internal handling | sdk + cli | ✅ |
| 10.5 | Rebalance — `rebalance()` method + `t2000 rebalance` CLI | sdk + cli | ✅ |
| 10.6 | Exchange — `exchange()` method + `t2000 exchange` CLI | sdk + cli | ✅ |
| 10.7 | USDC-in/USDC-out simplification (10c) — auto-convert, auto-swap | sdk + cli | ✅ |
| 10.8 | Composable PTB adapter methods | sdk | ✅ |
| 10.9 | Health factor + dust handling fixes | sdk + cli | ✅ |
| 10.10 | Tests — 367+ tests across unit, compliance, integration, CLI smoke | sdk + cli | ✅ |
| 10.11 | Skills — 10 skills aligned with SDK, new exchange + rebalance skills | skills | ✅ |
| 10.12 | Docs — READMEs, PRODUCT_FACTS, CLI_UX_SPEC, docs page, demos | all | ✅ |
| 10.13 | Marketing — demo page, homepage (4 accounts), marketing plan | web | ✅ |
| 10.14 | Build, bump to 0.10.4, publish | all | ✅ |

**Detailed build plans:** `spec/phase10-multi-stable-build-plan.md`, `spec/phase10b-open-save-build-plan.md`, `spec/phase10c-usdc-simplification-build-plan.md`

---

## Phase 11 — MCP Server + Agent UI

**Goal:** Make t2000 accessible to every AI platform (Claude Desktop, ChatGPT, Cursor, Codex) via MCP, then ship a local Agent UI for direct interaction. Two sub-phases — ship the protocol layer first, then the interface.

**Prerequisites:** Phase 16 (Agent Safeguards) — every MCP tool call must pass through safeguard enforcement. Without spending limits, any connected AI agent could drain the wallet.

### Phase 11a — MCP Server

**Goal:** Wrap `@t2000/sdk` methods as MCP tools so any MCP-compatible AI can operate the agent's bank accounts.

**Why MCP first:** MCP is the standard for AI-to-tool communication. Shipping an MCP server instantly makes t2000 available in Claude Desktop, Cursor, Windsurf, Codex, Claude Code, and any future MCP client — one integration, every platform.

```bash
t2000 mcp                             # Start MCP server (stdio transport)
```

#### MCP Tools (16 tools)

**Read-only (no safeguard check):**

| Tool | Maps to | Description |
|------|---------|-------------|
| `t2000_balance` | `agent.balance()` | Available, savings, gas, total |
| `t2000_address` | `agent.address()` | Agent wallet address |
| `t2000_positions` | `agent.positions()` | Lending positions across protocols |
| `t2000_rates` | `agent.rates()` | Best rates per asset |
| `t2000_health` | `agent.healthFactor()` | Health factor (borrow safety) |
| `t2000_history` | `agent.history()` | Recent transactions |
| `t2000_earnings` | `agent.earnings()` | Yield performance |

**State-changing (safeguard enforced, `dryRun` supported):**

| Tool | Maps to | Description |
|------|---------|-------------|
| `t2000_send` | `agent.send()` | Send USDC to address |
| `t2000_save` | `agent.save()` | Deposit to savings |
| `t2000_withdraw` | `agent.withdraw()` | Withdraw from savings |
| `t2000_borrow` | `agent.borrow()` | Borrow against savings |
| `t2000_repay` | `agent.repay()` | Repay loan |
| `t2000_exchange` | `agent.exchange()` | Swap assets via Cetus DEX |
| `t2000_rebalance` | `agent.rebalance()` | Optimize yield across protocols |

**Safety:**

| Tool | Maps to | Description |
|------|---------|-------------|
| `t2000_config` | `agent.enforcer.getConfig()` / `.set()` | View/set safeguard limits |
| `t2000_lock` | `agent.enforcer.lock()` | Freeze all operations |

> **`unlock` is CLI-only** — not exposed via MCP. If an AI could unlock, locking would be meaningless. Only the human owner can resume a locked agent via `t2000 unlock`.

#### Architecture

- **Transport:** stdio only (v1). Runs same-machine, key never leaves the host.
- **Package:** `packages/mcp/` → `@t2000/mcp` (separate from SDK/CLI)
- **Safeguards:** State-changing tools pass through `enforcer.check()`. Read-only tools skip enforcement.
- **Confirmation:** State-changing tools accept `dryRun: true` to return a preview without signing. Stateless — no pending state, no timeout, no confirm tool.
- **JSON output:** All responses are structured JSON — AI agents parse reliably.
- **Errors:** SDK errors (`T2000Error`, `SafeguardError`) map to MCP error responses with code + message.

#### Wallet unlock

MCP servers can't prompt for interactive input. Wallet unlock options (simplest first):

1. **Session reuse** — if `t2000 unlock` was run recently, MCP server reuses the active session
2. **Env var** — `T2000_PIN=1234 t2000 mcp` passes PIN at startup
3. **CLI flag** — `t2000 mcp --pin <pin>` (not recommended, visible in process list)

#### Platform configs

Ship ready-to-paste configs for:
- Claude Desktop (`claude_desktop_config.json`)
- Cursor (`.cursor/mcp.json`)
- Generic MCP client setup guide

#### Not in v1 (deferred)

- SSE transport (for remote/hosted — adds auth complexity)
- x402 `pay` tool (complex schema, separate `@t2000/x402` package — add in v2)
- Sentinel tools (separate product, add when demand is clear)
- MCP resources (read-only data protocol — evaluate after v1 ships)

#### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 11a.1 | MCP server scaffold (stdio transport, `@modelcontextprotocol/sdk`) | mcp | 3h | ✅ |
| 11a.2 | Implement 7 read-only tools | mcp | 2h | ✅ |
| 11a.3 | Implement 7 state-changing tools with `dryRun` param | mcp | 3h | ✅ |
| 11a.4 | Implement 2 safety tools (config, lock) — unlock is CLI-only | mcp | 1h | ✅ |
| 11a.5 | Safeguard enforcement on state-changing tools | mcp | 1h | ✅ |
| 11a.6 | Wallet unlock (session reuse + env var fallback) | mcp | 2h | ✅ |
| 11a.7 | `t2000 mcp` + `mcp install` + `mcp uninstall` CLI commands | cli | 1h | ✅ |
| 11a.8 | Platform config files (Claude Desktop, Cursor) + setup guide | docs | 2h | ✅ |
| 11a.9 | Agent Skill: `t2000-mcp` | skills | 1h | ✅ |
| 11a.10 | 5 prompts, 71 tests, integration + gate tests, docs, homepage | all | 3h | ✅ |

**Shipped:** v0.12.3 · 37 tasks · 71 tests · 5 prompts · `mcp install` auto-config · SafeguardEnforcer caching fix · `debt` in BalanceResponse · cinematic demo video

**Detailed build plan:** `spec/phase11a-mcp-build-plan.md`

---

### Phase 11b — Agent UI

**Goal:** Ship a local-first chat interface for interacting with t2000. No cloud dependency. Launch from CLI, talk to your agent.

**Why after MCP:** The Agent UI benefits from having all capabilities built (checking, savings, credit, exchange, yield, investment). Build the engine and all accounts first, then the cockpit.

```bash
t2000 ui                               # Launch local Next.js app at localhost:2000
t2000 ui --port 3000                   # Custom port
```

#### Features

| Feature | Description |
|---------|-------------|
| **Chat interface** | Type commands or natural language, get formatted responses |
| **Balance dashboard** | Always-visible sidebar showing all account tiers |
| **Confirmation modals** | Review + approve state-changing operations before signing |
| **Transaction history** | Scrollable feed of all operations with timestamps |
| **Command palette** | Quick-access to all t2000 commands with autocomplete |
| **Funding flow** | Moonpay deep link for on-ramping USDC to agent wallet |
| **Dark/light mode** | System-aware with manual toggle |

#### Architecture

- **Local-first:** Next.js app bundled with CLI, runs on `localhost:2000`
- **Backend:** Talks directly to `@t2000/sdk` — no separate API server needed
- **No LLM required (v1):** Pattern matching + command parsing. Natural language understanding is optional (v2).
- **Responsive:** Works on desktop and mobile browsers (for when hosted on Vercel later)

#### Design principles

- Minimal, modern, fast — no bloat
- Confirmation before every state change
- Real-time balance updates after operations
- Keyboard-first with mouse support
- Beautiful enough to demo, functional enough to use daily

#### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 11b.1 | Scaffold Next.js app within CLI package or new `apps/agent-ui` | web | 3h | ⬜ |
| 11b.2 | Chat interface component (input, message list, formatting) | web | 4h | ⬜ |
| 11b.3 | Balance dashboard sidebar | web | 3h | ⬜ |
| 11b.4 | Command parser (pattern matching, no LLM) | web | 4h | ⬜ |
| 11b.5 | Confirmation modal system | web | 2h | ⬜ |
| 11b.6 | Transaction history feed | web | 3h | ⬜ |
| 11b.7 | Command palette with autocomplete | web | 2h | ⬜ |
| 11b.8 | Moonpay deep link integration for funding | web | 2h | ⬜ |
| 11b.9 | `t2000 ui` CLI command to launch | cli | 2h | ⬜ |
| 11b.10 | Dark/light mode + responsive design | web | 2h | ⬜ |
| 11b.11 | Tests + docs | all | 3h | ⬜ |

**Estimated total:** 1-2 weeks

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

## Phase 16 — Agent Safeguards ✅

**Status:** Shipped (v0.11.0)

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
| 16.1 | Define safeguard config schema + storage | sdk | 2h | ✅ |
| 16.2 | Pre-sign enforcement layer in SDK (`SafeguardEnforcer`) | sdk | 4h | ✅ |
| 16.3 | CLI: `t2000 config` command group | cli | 3h | ✅ |
| 16.4 | CLI: `t2000 lock` / `t2000 unlock` | cli | 1h | ✅ |
| 16.5 | `limitApproaching` + `limitExceeded` events | sdk | 2h | Deferred (Lite) |
| 16.6 | Limit change cool-down (24h for increases) | sdk | 2h | Deferred (Lite) |
| 16.7 | Agent Skill: `t2000-safeguards` | skills | 1h | ✅ |
| 16.8 | Tests + docs | all | 3h | ✅ |

**Shipped:** v0.11.0 (Safeguard Lite — core controls without alerting/cool-down)

**Detailed build plan:** `spec/phase16-safeguards-build-plan.md`

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

## Phase 20 — On-ramp / Off-ramp + Card

**Goal:** Close the fiat-to-crypto loop. On-ramp: fund the agent wallet with fiat. Off-ramp: spend crypto in the real world via virtual card. The last mile for t2000 to be a complete bank.

**Why last:** On-ramp and off-ramp require third-party partnerships and regulatory navigation. Ship the product first, prove demand, then layer on fiat rails.

### Phase 20a — On-ramp (Moonpay)

**Goal:** Make it dead simple to fund an agent wallet with fiat. One command, one QR code.

```bash
t2000 deposit                          # Show QR code + Moonpay deep link
t2000 deposit --amount 100             # Pre-fill $100 USDC purchase
```

#### How it works

1. User runs `t2000 deposit`
2. CLI generates a Moonpay deep link with the agent's Sui address pre-filled
3. Displays QR code in terminal + clickable URL
4. User completes KYC + purchase on Moonpay (card, bank transfer, Apple Pay)
5. USDC arrives in agent wallet — CLI polls and confirms

#### Features

| Feature | Description |
|---------|-------------|
| Deep link generation | Pre-fill wallet address, amount, currency (USDC on Sui) |
| QR code in terminal | Scannable from mobile for quick purchase |
| Agent UI integration | Moonpay widget embedded in Agent UI (11b) |
| Deposit polling | Watch for incoming USDC after Moonpay redirect |

#### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 20a.1 | Moonpay deep link builder (address, amount, currency params) | sdk | 2h | ⬜ |
| 20a.2 | QR code generation in CLI terminal | cli | 2h | ⬜ |
| 20a.3 | `t2000 deposit` CLI command | cli | 2h | ⬜ |
| 20a.4 | Deposit polling (watch for incoming USDC) | sdk | 2h | ⬜ |
| 20a.5 | Agent UI: Moonpay widget / deep link button | web | 2h | ⬜ |
| 20a.6 | Agent Skill: `t2000-deposit` | skills | 1h | ⬜ |
| 20a.7 | Tests + docs | all | 1h | ⬜ |

**Estimated total:** 2 days

---

### Phase 20b — Off-ramp / Virtual Card

**Goal:** Spend USDC in the real world. Fund a virtual Visa from the agent's checking balance, use it anywhere Visa is accepted.

**Status:** Research phase. Evaluating partners.

#### Partner options

| Partner | Model | Pros | Cons |
|---------|-------|------|------|
| **CardForAgent.com** | Virtual cards for AI agents | Purpose-built for agents, API-first | New/unproven, limited info |
| **Slash** | MCP-native virtual cards | MCP integration ready, Visa network | Requires Base USDC (bridging needed) |
| **AgentCard** | Programmable agent cards | Designed for autonomous spending | Early stage |
| **Stripe Issuing** | BaaS card issuance | Mature platform, global | Requires entity registration, regulatory burden |

#### Architecture (tentative)

```
t2000 agent
├── Checking: USDC balance (Sui)
├── Savings: Earning yield (NAVI + Suilend)
├── Credit: Borrow against savings
├── Exchange: Cetus DEX
├── x402 Pay: Agent-to-agent API payments
└── Card: Virtual Visa for real-world commerce (Phase 20b)
```

#### Open questions

- **Cross-chain bridging:** Most card issuers require USDC on Base or Ethereum. Need to bridge from Sui — adds friction and gas cost.
- **Regulatory:** Virtual card issuance may require money transmitter licensing depending on jurisdiction. BVI entity (mission69b) needs evaluation.
- **Agent autonomy:** Should the agent be able to spend on the card autonomously? Safeguards (Phase 16) must gate card spending with limits.

#### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 20b.1 | Research: evaluate CardForAgent, Slash, AgentCard APIs | research | 4h | ⬜ |
| 20b.2 | Research: Sui → Base bridging options + costs | research | 2h | ⬜ |
| 20b.3 | Research: regulatory requirements for BVI entity | research | 2h | ⬜ |
| 20b.4 | Partner integration (API client for chosen provider) | sdk | 8h | ⬜ |
| 20b.5 | `t2000 card` CLI command group (fund, freeze, limits, transactions) | cli | 4h | ⬜ |
| 20b.6 | Safeguard integration (card spending limits) | sdk | 2h | ⬜ |
| 20b.7 | Agent UI: card management view | web | 4h | ⬜ |
| 20b.8 | Tests + docs | all | 3h | ⬜ |

**Estimated total:** 2-3 weeks (including research + partner onboarding)

---

## Priority Summary

### Execution order

The agreed execution sequence, reflecting "infra first" — safeguards unlock everything else:

```
Phase 16: Safeguards          ← prerequisite for MCP + Investment
    ↓
Phase 11a: MCP Server         ← quick win, massive distribution
    ↓
Phase 17: Investment Account  ← major feature, needs safeguards
    ↓
Phase 11b: Agent UI           ← best after all capabilities exist
    ↓
Phase 12: Monetize            ← agent economy layer
    ↓
Phase 20: On-ramp + Card      ← fiat rails, last mile
```

### Priority table

| Phase | Feature | Priority | Effort | Status |
|-------|---------|----------|--------|--------|
| **19** | Security Audit + Trust Infrastructure | **P0** | 3-4 days | ✅ Done |
| **10** | Yield Optimizer + Multi-Stable Infrastructure | **P0** | 3 days | ✅ Done (v0.10.4) |
| **16** | Agent Safeguards (limits, controls, lock) | **P0** | 1.5 days | ✅ Done (v0.11.0) |
| **11a** | MCP Server (16 tools, 5 prompts, mcp install, safeguard fix) | **P0** | 2-3 days | ✅ Done (v0.12.3) |
| **17** | Investment Account (Bluefin perps + crypto + spot) | **P0** | 2-3 weeks | ⬜ Next |
| **11b** | Agent UI (local chat + dashboard) | **P0** | 1-2 weeks | ⬜ After 17 |
| **12** | `t2000 monetize` (x402 server) | P1 | 2-3 days | ⬜ |
| **13** | Dashboard + Agent Network | P1 | 2 weeks | 🔶 Foundation built |
| **18** | Global Payments (contacts, receipts) | P1 | 3-4 days | 🔶 Send shipped |
| **20a** | On-ramp (Moonpay deep link) | P1 | 2 days | ⬜ |
| **20b** | Off-ramp / Virtual Card | P2 | 2-3 weeks | ⬜ Research needed |
| **14** | Multi-Agent Profiles | P2 | 1 week | ⬜ |
| **15** | Cross-Chain (CCTP) | P3 | TBD | Blocked |

---

*t2000 — The first bank account for AI agents.*
*Roadmap v2.6*
