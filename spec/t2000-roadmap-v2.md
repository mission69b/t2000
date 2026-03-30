# t2000 Roadmap — v2.1

**Last updated:** February 2026
**Current version:** v0.22.3 (SDK v0.19.1, CLI v0.22.3, MCP v0.22.3, mpp-sui v0.1.1, x402 deprecated)
**Web App:** Live at `app.t2000.ai` — zkLogin, agent loop, 40+ tools, chip flows, services

---

## What's Shipped

Everything below is live on Sui mainnet, published on npm, and deployed.

### Core Platform (v0.1.x–v0.3.x)

| Feature | Status |
|---------|--------|
| SDK (`@t2000/sdk`) — send, save, withdraw, borrow, repay, swap, balance, events | ✅ |
| CLI (`@t2000/cli`) — all commands, `--json` output, local HTTP API (`t2000 serve`) | ✅ |
| x402 Client (`@t2000/x402`) — machine-to-machine payments via Sui Payment Kit | ✅ Deprecated → MPP |
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

### v3 Web App — Consumer Banking (app.t2000.ai) ✅

| Feature | Status |
|---------|--------|
| zkLogin (Google Sign-In) — ephemeral key + ZK proof, Enoki gas sponsorship | ✅ |
| Conversational dashboard — balance header, AI feed, suggestion chips | ✅ |
| Client-driven agent loop — stateless LLM calls, client-side tool execution, multi-turn | ✅ |
| 40+ agent tools — financial ops, 35+ gateway services, search, image gen, TTS, flights | ✅ |
| Chip flow system — guided UI flows for save, send, borrow, withdraw, invest, receive | ✅ |
| Intent parser — client-side NLP for common commands (no LLM cost) | ✅ |
| Contextual chips — dynamic suggestions based on account state, time, last action | ✅ |
| Service integration — postcards, merch, image gen, web search, translation, 40+ APIs | ✅ |
| Sponsored transactions — all user txs gas-sponsored via Enoki (zero SUI needed) | ✅ |
| Contact book — send by name, resolve contacts in chat | ✅ |
| Smart cards — portfolio breakdown, savings rates, investment P&L | ✅ |
| Settings — budget control, session management, contacts CRUD | ✅ |
| Legal pages — privacy, terms, disclaimer (updated for consumer app) | ✅ |
| Country detection — timezone-first with locale fallback for regional services | ✅ |

**Architecture:** Next.js App Router on Vercel. Client-driven agent loop (no SSE, no server state). zkLogin via Mysten Enoki. All transactions sponsored.

**Detailed specs:** `spec/T2000_V3_SPEC.md`, `spec/V3_BUILD_PLAN.md`, `spec/AGENT_LOOP_DESIGN.md`

### MPP Gateway v2 (mpp.t2000.ai) ✅

| Feature | Status |
|---------|--------|
| Payment logging — Prisma + NeonDB, every payment recorded | ✅ |
| Live payment feed — real-time payment stream on homepage | ✅ |
| Explorer page (`/explorer`) — full payment history, search, filters, Suiscan links | ✅ |
| Homepage refactor — pitch page + terminal demo + live stats | ✅ |
| Services catalog split (`/services`) — dedicated browsable catalog | ✅ |
| Protocol spec page (`/spec`) — how MPP works on Sui | ✅ |
| Developer docs (`/docs`) — "Pay for APIs" and "Accept payments" guides | ✅ |
| 40 services, 88 endpoints across 9 categories | ✅ |
| Deliver-first pattern — high-value services call upstream before charging | ✅ |
| `chargeCustom` — dynamic pricing for commerce APIs | ✅ |

**Detailed spec:** `spec/MPP_GATEWAY_V2.md`

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

#### MCP Tools (35 tools)

**Read-only (16 tools, no safeguard check):**

| Tool | Maps to | Description |
|------|---------|-------------|
| `t2000_balance` | `agent.balance()` | Available, savings, gas, total |
| `t2000_address` | `agent.address()` | Agent wallet address |
| `t2000_positions` | `agent.positions()` | Lending positions across protocols |
| `t2000_rates` | `agent.rates()` | Best rates per asset |
| `t2000_health` | `agent.healthFactor()` | Health factor (borrow safety) |
| `t2000_history` | `agent.history()` | Recent transactions |
| `t2000_earnings` | `agent.earnings()` | Yield performance |
| `t2000_portfolio` | `agent.portfolio()` | Investment portfolio with P&L |
| `t2000_contacts` | `agent.contacts.list()` | Contact book |
| `t2000_strategy` | Strategy info | Investment strategies |
| `t2000_auto_invest` | DCA status | Auto-invest schedule |
| `t2000_fund_status` | Fund status | Savings fund details |
| `t2000_sentinel_list` | Sentinel listing | Available sentinel agents |
| `t2000_sentinel_info` | Sentinel details | Sentinel agent info |
| `t2000_services` | MPP service catalog | List all 35 MPP services + 79 endpoints |
| `t2000_network_stats` | Network stats | Protocol-wide statistics |

**State-changing (17 tools, safeguard enforced):**

| Tool | Maps to | Description |
|------|---------|-------------|
| `t2000_send` | `agent.send()` | Send USDC to address |
| `t2000_save` | `agent.save()` | Deposit to savings |
| `t2000_withdraw` | `agent.withdraw()` | Withdraw from savings |
| `t2000_borrow` | `agent.borrow()` | Borrow against savings |
| `t2000_repay` | `agent.repay()` | Repay loan |
| `t2000_exchange` | `agent.exchange()` | Swap assets via Cetus DEX |
| `t2000_rebalance` | `agent.rebalance()` | Optimize yield across protocols |
| `t2000_invest` | `agent.invest()` | Buy/sell crypto assets |
| `t2000_invest_rebalance` | Investment rebalance | Rebalance earning positions |
| `t2000_sentinel_attack` | Sentinel attack | Attack a sentinel agent |
| `t2000_pay` | `agent.pay()` | Pay for any MPP API service with USDC |
| `t2000_contacts_add` | Add contact | Add to contact book |
| `t2000_contacts_remove` | Remove contact | Remove from contact book |
| `t2000_invest_earn` | Earn on investments | Deposit investment to lending |
| `t2000_invest_unearn` | Stop earning | Withdraw from lending |

**Safety (2 tools):**

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
- `pay` tool (MPP integration — Phase 12b)
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

**Shipped:** v0.12.3 → v0.22.3 · 35 tools · 20 prompts · 71 tests · `mcp install` auto-config · `t2000_services` + `t2000_pay` for MPP gateway · Response truncation + image URL extraction for Claude Desktop

**Detailed build plan:** `spec/phase11a-mcp-build-plan.md`

---

### Phase 11b — Gateway + Channels (Personal AI Financial Advisor) — DEFERRED

**Status:** Deferred — MCP tools (Phase 11a) provide the same agent interaction via Claude Desktop, Cursor, and any MCP client without building custom chat infrastructure. Revisit if there's demand for a standalone chat gateway.

**Original goal:** Turn t2000 from a CLI tool into a personal AI financial advisor. Local-first gateway runs on your machine, talks to you on Telegram, WebChat, or any channel. The agent manages your money autonomously with proactive heartbeat tasks. Non-custodial — key never leaves your machine.

**Why deferred:** MCP solved the distribution problem more elegantly. Instead of building and maintaining Telegram/WebChat adapters, t2000's 35 MCP tools work in any MCP-compatible platform (Claude Desktop, Cursor, Windsurf, Claude Code). The user already has these tools open.

**Design principle:** The product is the agent, not the UI. The interface is whatever chat app the user already has open.

```bash
npm i -g @t2000/cli
t2000 init                            # Guided wizard: wallet, LLM, Telegram, safeguards
t2000 gateway                         # Start gateway — chat via Telegram or localhost:2000
```

#### Architecture

```
Telegram / WebChat / Discord
         │
         ▼
   t2000 Gateway (local Node.js)
         │
         ├─ Agent Loop (LLM + 23 MCP tools)
         ├─ Heartbeat Daemon (yield monitor, DCA, briefings)
         ├─ WebChat UI (localhost:2000)
         └─ Channel Adapters
         │
         ▼
   @t2000/sdk → Sui Blockchain
```

#### Key Features

| Feature | Description |
|---------|-------------|
| **Agent Loop** | BYOK LLM (Claude, GPT) + 23 MCP tools. Natural language → financial actions |
| **Telegram** | Chat with your agent from your phone. grammY, long-polling, no webhooks |
| **WebChat** | Minimal single-page chat at `localhost:2000`. One HTML file, no framework |
| **Heartbeat** | Proactive: morning briefings, yield monitoring, DCA execution, health alerts |
| **Init Wizard** | `t2000 init` — guided setup: wallet, PIN, LLM key, Telegram, safeguards in 2 minutes |
| **Daemon** | `t2000 gateway install` — runs 24/7 via launchd/systemd |
| **Confirmation** | All state-changing actions require user approval before execution |

#### Security

- Private key stays in `~/.t2000/`, encrypted with PIN
- LLM API key stored locally, never sent to t2000 servers
- Telegram bot only responds to allowlisted user IDs
- WebChat bound to 127.0.0.1 — local access only
- Safeguard enforcer gates every transaction, even through LLM tool calls
- LLM never sees the private key — only tool definitions and results

#### Tasks (52 tasks across 5 phases)

| Phase | Scope | Tasks | Est |
|-------|-------|-------|-----|
| 1 | Agent Loop + WebChat | 11b.1–11b.13 | ~1 week |
| 2 | Telegram + Heartbeat | 11b.14–11b.22 | 3–4 days |
| 3 | Onboarding + Daemon | 11b.23–11b.29 | 3–4 days |
| 4 | Tests (~100 unit + integration) | 11b.30–11b.37 | 2–3 days |
| 5 | Docs + Web + Release | 11b.38–11b.52 | 2–3 days |

**Estimated total:** 2–3 weeks

**Detailed build plan:** `spec/phase11b-gateway-build-plan.md`

---

## Phase 12 — MPP Integration (Machine Payments Protocol)

**Goal:** Replace x402 with MPP (Stripe + Tempo's open standard). Build `@t2000/mpp-sui` — a custom Sui payment method for MPP. Agent pays from existing Sui USDC balance. No new chain, no bridging.

**Positioning:** MPP is how agents pay. t2000 is where agents keep their money.

**Full spec:** `spec/archive/MPP_SPEC.md` (archived — migration complete)

### Phase 12a — `@t2000/mpp-sui` Package (days 1-3)

Build the Sui payment method as a standalone npm package — usable by anyone on Sui.

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 12a.1 | `method.ts` — `Method.from` with charge intent + Sui schemas | mpp-sui | 2h | ✅ |
| 12a.2 | `client.ts` — `Method.toClient` — USDC transfer TX, sign, credential | mpp-sui | 4h | ✅ |
| 12a.3 | `server.ts` — `Method.toServer` — verify TX via Sui RPC, receipt | mpp-sui | 3h | ✅ |
| 12a.4 | `utils.ts` — coin fetching, merging, USDC constants | mpp-sui | 2h | ✅ |
| 12a.5 | Tests (client + server integration) | mpp-sui | 3h | ✅ |
| 12a.6 | Publish `@t2000/mpp-sui` to npm | mpp-sui | 1h | ⬜ |

### Phase 12b — SDK + CLI + MCP Integration (days 4-6) ✅

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 12b.1 | SDK `agent.pay()` method (mppx + mpp-sui + safeguards + history) | sdk | 4h | ✅ |
| 12b.2 | MCP `t2000_pay` tool | mcp | 2h | ✅ |
| 12b.3 | CLI `t2000 pay` refactor (swap x402 for `agent.pay()`) | cli | 2h | ✅ |
| 12b.4 | Safeguard enforcement for pay operations | sdk | 1h | ✅ |
| 12b.5 | Payment history logging | sdk | 1h | ✅ |

### Phase 12c — x402 Deprecation + Docs (days 7-8) ✅

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 12c.1 | `npm deprecate @t2000/x402` | npm | 30m | ✅ |
| 12c.2 | Remove x402 from CLI deps | cli | 30m | ✅ |
| 12c.3 | Update docs (README, PRODUCT_FACTS, SECURITY, CLI_UX_SPEC) | docs | 2h | ✅ |
| 12c.4 | Update website (6 files: page, docs, demo, stats) | web | 3h | ✅ |
| 12c.5 | Update skills (4 files) | skills | 1h | ✅ |
| 12c.6 | Update CI + Dockerfiles + scripts | ci | 1h | ✅ |

### Phase 12d — Landing Page + Launch (days 9-10)

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 12d.1 | Build t2000.ai/mpp landing page (hero, server snippet, agent UX) | web | 4h | ✅ |
| 12d.2 | Record 30s demo video (Claude pays for API via t2000) | marketing | 2h | ⬜ |
| 12d.3 | Tweet announcement | marketing | 30m | ⬜ |
| 12d.4 | Submit `sui` as MPP payment method to mpp.dev | ecosystem | 1h | ⬜ |

**Estimated total:** 9 days

**No indexer or ECS changes needed.** Agent payments are entirely client-side (SDK → mppx → Sui TX). The server side of `@t2000/mpp-sui` IS the monetize feature — developers `npm install` the package directly, no separate CLI wrapper or server changes needed.

### Phase 12e — MPP Gateway (Sui USDC Proxy Services) ✅

**Status:** Shipped — live at `mpp.t2000.ai`

**Goal:** Run MPP-compatible API proxies that accept Sui USDC. Same pattern as Tempo's `openai.mpp.tempo.xyz` — but settling on Sui. Gives t2000 agents real services to pay for with their existing USDC balance.

**Architecture:** Each proxy wraps an upstream API (OpenAI, Anthropic, etc.) behind `@t2000/mpp-sui/server`. Agent requests → 402 → pays Sui USDC → gateway verifies on-chain → forwards to upstream API → returns response.

**Result: 41 services, 90 endpoints across 9 categories — all live on mpp.t2000.ai**

| Category | Services | Count |
|----------|----------|-------|
| AI & ML | OpenAI, Anthropic, Gemini, DeepSeek, Groq, Together, Perplexity, Replicate, Stability AI | 9 |
| Media | fal.ai, ElevenLabs, AssemblyAI | 3 |
| Search & Web | Brave, Firecrawl, Exa, Jina Reader, Serper, SerpAPI, ScreenshotOne | 7 |
| Data & Intelligence | OpenWeather, Google Maps, CoinGecko, Alpha Vantage, NewsAPI, IPinfo, Hunter.io | 7 |
| Communication | Resend | 1 |
| Translation & Docs | DeepL, Google Translate, PDFShift, QR Code | 4 |
| Compute | Judge0 | 1 |
| Commerce | Lob, Printful | 2 |
| Utilities | URL shortener, currency converter, security scan | 6 |

**Hosting:** `apps/gateway/` — Next.js app on Vercel. Domain: `mpp.t2000.ai`

**Key features shipped (including Gateway v2):**
- Service directory page with search, category filters, card/list toggle
- `GET /api/services` JSON catalog + `GET /llms.txt` agent discovery
- MCP tools: `t2000_services` (discovery) + `t2000_pay` (execution)
- Response truncation (800KB cap) for Claude Desktop compatibility
- Image URL extraction for AI-generated images
- Payment logging (Prisma + NeonDB) — every payment recorded
- Live payment feed on homepage — real-time payment stream
- Explorer page (`/explorer`) — full history, search, filters, Suiscan links
- Homepage refactor — pitch page + terminal demo + live stats
- Protocol spec page (`/spec`) + developer docs (`/docs`)
- Deliver-first pattern for high-value services (merch, physical mail)
- `chargeCustom()` for dynamic pricing
- Vercel Analytics
- Service showcase on t2000.ai homepage

| # | Task | Package | Status |
|---|------|---------|--------|
| 12e.1 | Scaffold `apps/gateway` (Next.js, tsconfig) | gateway | ✅ |
| 12e.2 | Gateway framework — `chargeProxy()`, `chargeCustom()`, pricing resolver | gateway | ✅ |
| 12e.3 | 41 service proxies (90 endpoints) | gateway | ✅ |
| 12e.4 | Service discovery endpoint + llms.txt | gateway | ✅ |
| 12e.5 | Landing page (directory with search, filters, card/list view) | gateway | ✅ |
| 12e.6 | Vercel deploy + DNS (mpp.t2000.ai) | infra | ✅ |
| 12e.7 | MCP tools — `t2000_services` + `t2000_pay` | mcp | ✅ |
| 12e.8 | Response handling — truncation, image URL extraction | mcp | ✅ |
| 12e.9 | Vercel Analytics | gateway | ✅ |
| 12e.10 | Services showcase on t2000.ai homepage | web | ✅ |
| 12e.11 | Update roadmap, docs, skills | docs | ✅ |
| 12e.12 | Payment logging — Prisma + NeonDB | gateway | ✅ |
| 12e.13 | Live feed + explorer page | gateway | ✅ |
| 12e.14 | Homepage refactor + spec + docs pages | gateway | ✅ |
| 12e.15 | Deliver-first pattern (high-value services) | gateway + web-app | ✅ |

**Detailed specs:** `spec/SERVICES_ROADMAP.md`, `spec/MPP_GATEWAY_V2.md`

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

## Phase 15 — Cross-Chain USDC (Circle CCTP)

**Goal:** Bridge native USDC between Sui and other chains (Ethereum, Base, Arbitrum, etc.). Fund t2000 from any chain. Send USDC to any chain.

**Status:** Unblocked — Circle CCTP V1 is live on Sui mainnet ([docs](https://developers.circle.com/cctp/v1/sui-packages)).

| Technology | What it enables | Status |
|-----------|----------------|--------|
| CCTP V1 (Circle) | Burn/mint native USDC across chains. Sui is domain 8. Testnet + mainnet deployed | ✅ Live on Sui |
| Ika (multi-chain signing) | Agent signs transactions on any chain from Sui keys | Available |

**How it works:** User burns USDC on source chain → Circle attestation service signs the message → t2000 submits the signed message on Sui → USDC minted to user's t2000 wallet. Reverse direction also supported. Uses Sui PTBs — fits existing transaction architecture.

**Why this matters for t2000:**
- Solves wallet funding for crypto users (bridge USDC from Ethereum/Base → Sui) — no KYC, no Moonpay
- Users say "bridge 500 USDC from my Ethereum wallet" via Telegram gateway
- Lower friction than fiat on-ramp for the target audience (crypto-native users already have USDC elsewhere)
- Circle is the USDC issuer — this is the official bridge, not a third-party wrapper

**Key packages (mainnet):**
- MessageTransmitter: `0x08d87d37ba49e785dde270a83f8e979605b03dc552b5548f26fdf2f49bf7ed1b`
- TokenMessengerMinter: `0x2aa6c5d56376c371f88a6cc42e852824994993cb9bab8d3e6450cbe3cb32b94e`
- USDC Treasury: `0x57d6725e7a8b49a7b2a612f6bd66ab5f39fc95332ca48be421c3229d514a6de7`

**CLI:**
```bash
t2000 bridge deposit 500 --from ethereum     # Bridge USDC from Ethereum → Sui
t2000 bridge withdraw 200 --to base          # Bridge USDC from Sui → Base
t2000 bridge status                          # Check pending bridge transfers
```

**Note:** CCTP V1 is marked "Legacy" by Circle — a newer version exists but V1 is what's deployed on Sui. Production-ready, well-documented, and used by major protocols.

**Detailed reference:** [Circle CCTP V1 Sui Packages](https://developers.circle.com/cctp/v1/sui-packages), [Transfer Tutorial](https://developers.circle.com/cctp/v1/transfer-usdc-on-testnet-from-sui-to-ethereum)

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

## Phase 17 — Investment Account ✅ (Core Shipped)

**Goal:** A fifth account tier for crypto asset exposure — spot investing, yield on investments, themed strategies, and DCA. Extends t2000 from "bank" to "bank + brokerage."

**Status:** Core investment shipped across v0.14.0–v0.17.29. All spot investing, yield, strategies, auto-invest, gold, and investment rebalance are live on mainnet. Margin trading (17e), AlphaLend (17c-alpha), and securities-backed lending (17g) are specced but not yet started.

### Investment Sub-phases

| Sub-phase | Scope | Status |
|-----------|-------|--------|
| **17a** | Direct Investing — SUI | ✅ Shipped (v0.14.0) |
| **17b** | Multi-Asset — BTC, ETH | ✅ Shipped (v0.14.1) |
| **17c** | Yield on Investments — earn, unearn, invest rebalance, borrow/rebalance guards | ✅ Shipped (v0.15.0–v0.17.29) |
| **17d** | Strategies + Auto-Invest — 5 strategies, atomic PTB, DCA scheduling | ✅ Shipped (v0.16.0) |
| **17f** | Gold Asset — XAUm, all-weather + safe-haven strategies | ✅ Shipped (v0.16.5) |
| **17c-alpha** | AlphaLend Adapter — third lending protocol for rate competition | ⬜ Specced |
| **17e** | Margin Trading — Bluefin perps, long/short with liquidation protection | ⬜ Specced (blocked on Bluefin API discovery) |
| **17g** | Securities-Backed Lending — borrow USDC against crypto/commodity portfolio | ⬜ Specced |

### What Shipped

**Spot Investing** — buy/sell SUI, BTC, ETH, GOLD via Cetus Aggregator. Cost-basis tracking, realized/unrealized P&L, gas reserve guard, investment locking on `send()`.

**Yield on Investments** — `invest earn` deposits investment assets into NAVI or Suilend for lending yield. `invest unearn` withdraws. `invest rebalance` compares live APY across protocols and moves earning positions to the best rate (0.1% minimum threshold). Auto-withdraw on `invest sell` when asset is earning.

**Strategies + Auto-Invest** — 5 built-in strategies (bluechip, layer1, sui-heavy, all-weather, safe-haven). Custom strategy creation. Atomic PTB executes all buys in a single transaction. DCA scheduling with `invest auto setup/run/stop/status`.

**Gold** — XAUm as fourth investment asset. Two new strategies (all-weather, safe-haven) include GOLD allocation. Lending yield via NAVI and Suilend.

**MCP Integration** — 23 tools total. `t2000_invest`, `t2000_invest_rebalance`, `t2000_portfolio`, `t2000_strategy`, `t2000_auto_invest`. 12 prompts including `optimize-yield`, `investment-strategy`, `chat-invest-rebalance`.

### CLI (as shipped)

```bash
# Spot
t2000 invest buy 500 SUI              # Buy SUI with USDC
t2000 invest sell all BTC              # Sell — auto-withdraws from lending first

# Yield
t2000 invest earn SUI                  # Earn yield on SUI (best protocol)
t2000 invest earn BTC --protocol navi  # Earn on specific protocol
t2000 invest unearn SUI                # Stop earning, keep the asset
t2000 invest rebalance                 # Move earning to better-rate protocol
t2000 invest rebalance --dry-run       # Preview without executing

# Strategies + DCA
t2000 invest strategy list             # View built-in + custom strategies
t2000 invest strategy buy bluechip 100 # Buy $100 of bluechip strategy
t2000 invest strategy rebalance bluechip  # Rebalance to target weights
t2000 invest auto setup 50 weekly bluechip  # DCA $50/week
t2000 invest auto run                  # Execute pending DCA

# Portfolio
t2000 portfolio                        # Full portfolio with P&L + yield APY
t2000 rates                            # All lending rates
```

### Remaining Sub-phases

#### 17c-alpha — AlphaLend Adapter

Third lending protocol. Adds rate competition for stablecoins and investment assets (including BTC yield). Not blocking — NAVI and Suilend provide sufficient coverage.

**Detailed build plan:** `spec/phase17c-alpha-alphalend-build-plan.md`

#### 17e — Margin Trading

Leveraged long/short positions via Bluefin perps. USDC collateral, auto-liquidation protection, funding rate monitoring. Blocked on Bluefin API/contract discovery. Marketing already teases this as "coming soon."

**Detailed build plan:** `spec/phase17e-margin-build-plan.md`

#### 17g — Securities-Backed Lending (NEW)

Borrow USDC against crypto and commodity (GOLD) portfolio holdings. Uses investment positions as collateral with conservative LTV ratios.

| Feature | Description |
|---------|-------------|
| Collateral | BTC, ETH, SUI, GOLD investment positions |
| Borrow asset | USDC |
| LTV | 15–20% (conservative, matches volatile collateral) |
| Liquidation | Auto-sell collateral if health drops below threshold |
| Integration | Uses existing lending adapters (NAVI, Suilend) |

```bash
t2000 invest borrow 200 --collateral BTC   # Borrow $200 USDC against BTC
t2000 invest repay 200                      # Repay investment loan
t2000 invest loan status                    # View loan health, LTV, liquidation price
```

**Prerequisites:** Phase 17a–17c (spot + yield must be live). Safeguards (Phase 16) must gate max borrow and enforce health monitoring.

**Detailed build plan:** TBD

---

## Phase 18 — Global Payments (Checking Account)

**Goal:** Position `t2000 send` as a first-class global payments feature. Send by name, not by address.

**Foundation:** `t2000 send` is already shipped and working. This phase adds the contact book and name resolution.

### Phase 18a — Contacts (v1)

```bash
t2000 contacts add Tom 0x8b3e...       # Save a contact
t2000 send 50 USDC to Tom              # Send by name
```

| Feature | Description | Status |
|---------|-------------|--------|
| Contact book | `~/.t2000/contacts.json` — name → address mappings | ⬜ |
| Send by name | `t2000 send 50 to Tom` resolves from contacts | ⬜ |
| MCP tool | `t2000_contacts` (list) + `t2000_send` contact resolution | ⬜ |
| Agent Skill | `t2000-contacts` SKILL.md | ⬜ |

**Design:** Case-insensitive lookup, alphanumeric names only, resolution in SDK (CLI + MCP both benefit), send output shows both name and address.

### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 18a.1 | `ContactManager` class (CRUD, resolve, validate) | sdk | 1h | ✅ |
| 18a.2 | Wire into `T2000` class + update `send()` | sdk | 45m | ✅ |
| 18a.3 | `t2000 contacts` CLI command (add/remove/list) | cli | 1.5h | ✅ |
| 18a.4 | Update send output to show contact name | cli | 15m | ✅ |
| 18a.5 | MCP `t2000_contacts` tool + update `t2000_send` | mcp | 1h | ✅ |
| 18a.6 | Tests (31 SDK + 5 MCP = 36 new tests) | all | 2h | ✅ |
| 18a.7 | Agent Skill: `t2000-contacts` | skills | 30m | ✅ |
| 18a.8 | Docs, READMEs, homepage, marketing, CLI_UX_SPEC, PRODUCT_FACTS | all | 1.5h | ✅ |
| 18a.9 | Version bump (→ 0.13.0), build, publish | all | 15m | ✅ |

**Estimated total:** 1–1.5 days

**Detailed build plan:** `spec/phase18a-contacts-build-plan.md`

### Phase 18b — Payments (v2, deferred)

| Feature | Trigger to add |
|---------|---------------|
| SuiNS resolution (`.sui` names) | When SuiNS adoption grows |
| Payment receipts | User feedback |
| Payment requests | User feedback |
| Recurring payments | User feedback |

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

### Phase 20a — On-ramp (Stripe Crypto Onramp)

**Goal:** Make it dead simple to fund an agent wallet with fiat. Embedded widget in web app, deep link from CLI.

**Decision (Feb 2026):** Stripe Crypto Onramp over Moonpay. Mysten confirmed Sui is a supported `destination_network`. Stripe is already the vendor for Phase 20b (Issuing for Agents) and future USDC settlement — single vendor for the entire fiat loop.

**KYC:** Stripe's multi-tier system means low friction for small amounts:
- **L0** (name, phone, email, address) — sufficient for $5-25 top-ups. This is the starting tier.
- **L1** (+DOB, SSN) — higher limits, US users
- **L2** (+photo ID, selfie) — highest limits

**Testing:** Mainnet only — no testnet support. Test with small real amounts.

#### How it works — Web App (primary)

1. User taps "Add Funds" in `app.t2000.ai`
2. Server creates a Stripe `OnrampSession` with `destination_currency: "usdc"`, `destination_network: "sui"`, and the user's Sui address
3. Embedded `OnrampElement` renders inside the app (no redirect)
4. User completes L0 KYC (first time only) + pays with card / Apple Pay / Google Pay / bank
5. USDC arrives in user's Sui wallet — app polls and confirms

#### How it works — CLI

1. User runs `t2000 deposit`
2. CLI calls server to create an `OnrampSession`, gets a hosted URL
3. Displays QR code in terminal + clickable URL
4. User completes purchase in browser
5. CLI polls for incoming USDC and confirms

#### Architecture

```
Web App (app.t2000.ai)                  CLI (t2000 deposit)
       │                                       │
       │ POST /api/onramp/session              │ POST /api/onramp/session
       │ { address, amount? }                  │ { address, amount? }
       └──────────────┬───────────────────────┘
                      │
              api.t2000.ai (ECS)
                      │
         1. Create Stripe OnrampSession
            - destination_currency: "usdc"
            - destination_network: "sui"
            - destination_wallet_address: <user's Sui address>
            - destination_exchange_amount: <amount> (optional)
         2. Return clientSecret (web) or hosted URL (CLI)
                      │
              ┌───────┴───────┐
              │               │
        Web: mount         CLI: show
        OnrampElement      QR + URL
        (embedded iframe)  (opens browser)
              │               │
              └───────┬───────┘
                      │
         Stripe handles KYC + payment + USDC delivery
         USDC lands in user's Sui wallet
```

#### What this replaces

| Before | After |
|--------|-------|
| Moonpay deep link (redirect) | Stripe Onramp (embedded, stays in app) |
| Full KYC upfront | Tiered KYC (L0 for small amounts) |
| New vendor relationship | Same vendor as Phase 20b + settlement |
| Phase 5 in roadmap-mpp.md (Apple Pay / Android Pay) | Absorbed — Stripe Onramp supports Apple Pay / Google Pay natively |
| USDC sponsorship as only funding path | Sponsor for first-timers, onramp for returning users |

#### Impact on sponsorship

- **First-time users:** Keep $0.25 USDC sponsorship so the product works immediately on first login
- **Returning users / top-up:** "Add Funds" opens Stripe Onramp — users fund themselves
- **Eliminates drain risk:** No more treasury wallet exposure for returning user funding

#### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 20a.1 | Server: `/api/onramp/session` endpoint (create Stripe OnrampSession) | server | 3h | ⬜ |
| 20a.2 | Web app: "Add Funds" button + embedded OnrampElement component | web-app | 3h | ⬜ |
| 20a.3 | Web app: OnrampSession state callbacks (success, failure, pending) | web-app | 2h | ⬜ |
| 20a.4 | CLI: `t2000 deposit` command (hosted URL + QR code) | cli | 3h | ⬜ |
| 20a.5 | Deposit polling (watch for incoming USDC confirmation) | sdk | 2h | ⬜ |
| 20a.6 | KYC tier error handling (detect limit errors, prompt upgrade to L1/L2) | web-app | 2h | ⬜ |
| 20a.7 | Stripe publishable key + secret key env vars (Vercel + ECS) | config | 1h | ⬜ |
| 20a.8 | Tests + docs | all | 2h | ⬜ |

**Estimated total:** 2-3 days

**Dependencies:** Stripe account with crypto onramp enabled. Add domains to [Stripe domain allowlist](https://dashboard.stripe.com/crypto-onramp/allowlist-domains).

---

### Phase 20b — Off-ramp / Virtual Card

**Goal:** Spend USDC in the real world. Fund a virtual Visa from the agent's checking balance, use it anywhere Visa is accepted.

**Status:** Research phase. Updated Feb 2026 with new findings from Stripe Issuing for Agents launch and competitive analysis.

#### Industry context (Feb 2026)

The agentic commerce landscape has matured rapidly:

- **Stripe Issuing for Agents** — Stripe launched a dedicated product for agent card issuance (Mar 2026). Single-use virtual cards with MCC restrictions, geo controls, real-time authorization webhooks, and per-tx spending limits. This is the production-grade path.
- **Stripe Machine Payments (MPP/x402)** — Stripe now accepts machine payments on Base (x402), Solana (x402), Tempo (MPP), and card networks (MPP via SPTs). Payments land in Stripe balance and settle in fiat. Microtransactions as low as $0.01 USDC.
- **Shared Payment Tokens (SPTs)** — New MPP payment method allowing agents to pay with cards/wallets through MPP without on-chain crypto. Bridges fiat and crypto worlds.
- **Visa + Stripe + Tempo** — Visa formally partnered on MPP (Mar 2026). Card-based MPP spec, SDK, Visa Intelligent Commerce + Trusted Agent Protocol. OpenAI, Mastercard, Anthropic, Shopify already integrated.
- **Browserbase + Stagehand** — Browser automation for universal checkout. Stripe Issuing + Browserbase = create virtual card → auto-fill any checkout form. Works on any website without merchant API integration.
- **Competitive validation** — Agentic wallet demos on Base (Expo + Coinbase + Privy) have shown USDC → virtual Visa → UberEats ordering via browser automation. Proves the UX works. The browser automation part is fragile at scale but the virtual card model is sound.

#### Partner options (updated)

| Partner | Model | Pros | Cons | Verdict |
|---------|-------|------|------|---------|
| **Stripe Issuing for Agents** | Direct card issuance | Mature, MCC controls, real-time auth webhooks, agent-specific product | Entity registration, regulatory burden | **Best long-term path** |
| **AgentCard** | Virtual cards via Stripe Issuing | Easy API, MCP ready, $9/mo unlimited | Pre-auth hold on YOUR card — platform risk, $500 max | **Not for platform use** (fronting your own money = Reloadly risk redux) |
| **CardForAgent.com** | Virtual cards for AI agents | Purpose-built for agents, API-first | New/unproven, limited info | Needs evaluation |
| **Slash** | MCP-native virtual cards | MCP integration ready, Visa network | Requires Base USDC (bridging needed) | Needs evaluation |

> **AgentCard risk note:** AgentCard places pre-authorization holds on the operator's payment method. Using it as an MPP service means t2000 fronts fiat from the operator's credit card before user pays USDC. This is the same deliver-first financial risk removed in Phase 24a (Reloadly). Not suitable for a platform serving multiple users.

#### Architecture (tentative)

```
t2000 agent
├── Checking: USDC balance (Sui)
├── Savings: Earning yield (NAVI + Suilend)
├── Credit: Borrow against savings
├── Exchange: Cetus DEX
├── MPP Pay: Agent-to-service payments via MPP (Phase 12)
└── Card: Virtual Visa for real-world commerce (Phase 20b)
```

#### Key constraint: Sui chain gap (partially resolved)

Stripe Crypto Onramp supports Sui (confirmed Feb 2026) — fiat → USDC on Sui works. But Stripe **machine payments** (MPP/x402) still only support **Base, Solana, Tempo** — not Sui. This means:

1. **Onramp: solved** — Stripe Crypto Onramp delivers USDC directly to Sui addresses (Phase 20a)
2. **Offramp: bridging still needed** — Sui USDC → Base/Tempo USDC before funding a virtual card (Wormhole, etc.)
3. **SPT workaround** — Shared Payment Tokens allow card-based MPP payments without on-chain crypto, bypassing the chain issue entirely
4. **Monitor for full Sui support** — If/when Stripe adds Sui to machine payments, the bridging problem disappears

#### The endgame path

```
Phase 1 (now):     MPP services paid in USDC on Sui — works today
Phase 2 (20b):     Stripe Issuing for Agents — virtual cards with spending controls
Phase 3 (future):  Stripe/Bridge USDC → fiat settlement — no card needed, USDC pays merchants directly
```

Each phase is independently valuable. Phase 2 doesn't block on Phase 3.

#### Open questions

- **Cross-chain bridging:** Sui → Base/Tempo bridging adds friction and gas cost. SPTs may be the interim solution.
- **Regulatory:** Virtual card issuance may require money transmitter licensing. BVI entity needs evaluation.
- **Agent autonomy:** Safeguards (Phase 16) must gate card spending with limits and human-in-the-loop approval.
- **Stripe Issuing access:** Requires application + entity registration. Start the process early.
- **Browser automation:** Browserbase/Stagehand enables universal checkout but is fragile at scale (anti-bot detection, site changes). Use only as a bridge until direct merchant APIs or Stripe settlement are available.

#### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 20b.1 | Research: apply for Stripe Issuing for Agents, evaluate requirements | research | 4h | ⬜ |
| 20b.2 | Research: Sui → Base/Tempo bridging options + costs (Wormhole, etc.) | research | 2h | ⬜ |
| 20b.3 | Research: SPT (Shared Payment Tokens) as alternative to bridging | research | 2h | ⬜ |
| 20b.4 | Research: regulatory requirements for BVI entity | research | 2h | ⬜ |
| 20b.5 | Stripe Issuing integration (cardholder, card creation, spending controls) | gateway | 8h | ⬜ |
| 20b.6 | Real-time authorization webhook (human-in-the-loop approval) | gateway | 4h | ⬜ |
| 20b.7 | Agent tool: `create_card` (issue virtual card with spending limit) | web-app | 4h | ⬜ |
| 20b.8 | Agent UI: card management view (active cards, limits, transactions) | web-app | 4h | ⬜ |
| 20b.9 | Safeguard integration (card spending limits, MCC restrictions) | sdk | 2h | ⬜ |
| 20b.10 | Tests + docs | all | 3h | ⬜ |

**Estimated total:** 2-3 weeks (including Stripe Issuing onboarding)

---

## Phase 21 — Voice Input + Image Upload

**Goal:** Add mic and camera/file buttons to the chat input, making the web app fully multimodal. Users talk to their money or snap a photo for instant context.

**Why now:** The chat interface is the product. Voice and image are the two biggest input modalities missing. Both have near-zero marginal cost (browser APIs + existing LLM vision) and dramatically improve mobile UX.

### Phase 21a — Voice Input (Mic Button)

**Primary:** Browser `SpeechRecognition` API — free, instant, no backend call.

**Fallback:** Groq Whisper via gateway ($0.005/message) for browsers without `SpeechRecognition` support or when higher accuracy is needed.

| Feature | Description | Cost |
|---------|-------------|------|
| Mic button in chat input bar | Tap to record, release to transcribe | Free |
| Browser `SpeechRecognition` | Real-time transcription, works in Chrome/Edge/Safari | Free |
| Groq Whisper fallback | `MediaRecorder` → blob → gateway → text | $0.005 |
| Visual feedback | Pulsing mic icon while recording, waveform animation | Free |
| Auto-submit | Transcribed text fills input and optionally auto-sends | Free |

**How it works:**
1. User taps mic button → browser requests microphone permission
2. `SpeechRecognition` starts → interim results shown in input field
3. User stops speaking (or taps again) → final transcript submitted as chat message
4. Falls back to Groq Whisper if `SpeechRecognition` unavailable

**Use cases:**
- "What's my balance" — hands-free while walking
- "Send $20 to Tom" — voice command on mobile
- "Send mum a birthday card" — conversational spending
- Accessibility — users who can't type easily

### Phase 21b — Image Upload

**Primary:** File picker / camera capture → base64 → Claude vision (no extra cost, uses existing LLM call).

| Feature | Description | Cost |
|---------|-------------|------|
| Image button in chat input bar | Opens file picker or camera (mobile) | Free |
| Camera capture on mobile | `input accept="image/*" capture="environment"` | Free |
| Client-side resize | Resize to max 1024px, compress to JPEG ~80% quality | Free |
| Send to Claude vision | Base64 image in message content block | Free (existing LLM call) |
| Image preview | Thumbnail preview in chat before sending | Free |
| Multi-image support (v2) | Attach multiple images in one message | Free |

**How it works:**
1. User taps image button → file picker opens (camera option on mobile)
2. Selected image resized client-side (max 1024px, JPEG 80%)
3. Base64 encoded and attached to the message
4. Sent to `/api/agent/chat` as a `content` block with `type: 'image'`
5. Claude analyzes the image in context of the conversation

**Use cases:**
- "Translate this menu" — snap a photo of a foreign menu
- "What's on this receipt?" — expense context for the agent
- "What crypto is this?" — screenshot of a chart/portfolio
- QR code scanning — extract payment addresses or URLs
- Document analysis — upload a bank statement or invoice

### Phase 21c — Voice Output (Auto-Read, Deferred)

**Deferred until demand is clear.** TTS already works as an agent tool (`text_to_speech` via ElevenLabs, $0.05). A future toggle could auto-read agent responses for a fully hands-free experience.

### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 21a.1 | `useVoiceInput` hook — SpeechRecognition + MediaRecorder | web-app | 3h | ⬜ |
| 21a.2 | Mic button component with recording state + waveform | web-app | 2h | ⬜ |
| 21a.3 | Groq Whisper fallback (send blob to gateway, get text) | web-app | 2h | ⬜ |
| 21a.4 | Integrate mic button into chat input bar | web-app | 1h | ⬜ |
| 21b.1 | `useImageUpload` hook — file picker, camera, resize, base64 | web-app | 3h | ⬜ |
| 21b.2 | Image button + preview component | web-app | 2h | ⬜ |
| 21b.3 | Update `/api/agent/chat` to accept image content blocks | web-app | 2h | ⬜ |
| 21b.4 | Update agent loop to pass images to LLM | web-app | 1h | ⬜ |
| 21b.5 | Integrate image button into chat input bar | web-app | 1h | ⬜ |
| 21.6 | Mobile UX polish — camera shortcut, responsive layout | web-app | 2h | ⬜ |
| 21.7 | Tests + docs | web-app | 2h | ⬜ |

**Estimated total:** 3-5 days

---

## Phase 23 — Gateway Service Expansion + Merchant Payments

**Goal:** Expand the gateway beyond developer/AI tools into real-world commerce, money movement, and merchant payment acceptance. Turn t2000 from "wallet that pays for APIs" into "wallet that does everything."

### Phase 23a — New Gateway Services

#### Tier 1 — Quick wins (1 day each, extend existing infrastructure)

| Service | API | What it enables | Price model |
|---------|-----|----------------|-------------|
| **Video generation** | fal.ai (Kling, Runway) or Replicate | "Generate a 5-second video of a sunset" — natural extension of image gen | $0.10–$0.50 |
| **Logo design** | Looka or Brandmark API | "Design a logo for my coffee shop" — returns multiple options | $0.50–$2.00 |

#### Tier 2 — High-impact commerce (2-3 days each)

| Service | API | What it enables | Price model |
|---------|-----|----------------|-------------|
| **Send flowers** | FloristOne or Petalbot | "Send roses to mom at 123 Main St, NYC" — killer demo moment | Dynamic ($30–$100 + fee) |
| **Domain registration** | Namecheap API | "Register coolstartup.com" — devs love this | Dynamic (~$9–$15 + fee) |
| **Event tickets** | Ticketmaster Discovery API | "Find tickets to the Lakers game tonight" — search + browse + purchase | Dynamic + fee |
| **Stock photos** | Shutterstock API | "Buy a stock photo of a mountain sunset" — content creators | $0.50–$2.00 |

#### Tier 3 — Money movement (3-5 days each, regulatory considerations)

| Service | API | What it enables | Price model |
|---------|-----|----------------|-------------|
| **Wise transfer** | Wise API (OAuth + REST) | "Send $200 to mom's bank account in the Philippines" — USDC → any bank globally | Dynamic (amount + Wise fee + 1%) |
| **Mobile money** | Flutterwave / Paystack | "Send $50 to +254... via M-Pesa" — bank the unbanked for real | Dynamic (amount + fee) |
| **Bill pay** | dLocal or Rapyd | "Pay my electricity bill" — utility/phone/internet in 30+ countries | Dynamic (amount + fee) |

#### Tier 4 — Creative & productivity (1-2 days each)

| Service | API | What it enables | Price model |
|---------|-----|----------------|-------------|
| **Presentation gen** | Gamma or Beautiful.ai API | "Make a 5-slide pitch deck about AI agents" | $0.10–$0.50 |
| **Business cards** | Moo or Vistaprint API | "Print 100 business cards with this design" | Dynamic ($20–$50 + fee) |
| **Fax** (yes, fax) | eFax API | "Fax this document to +1-555-0123" — lawyers, healthcare, government | $0.10/page |

### Phase 23b — Payment Requests + Merchant Receive

**Goal:** Let anyone receive USDC — merchants, freelancers, marketplace sellers, pop-up stores. No merchant account, no terminal, no fees beyond gas.

#### How it works

**Payment Request flow:**
```
Seller: "Create a payment request for $25"
  → t2000 generates:
    1. QR code (scannable — opens app.t2000.ai/pay?to=0x...&amount=25&memo=...)
    2. Payment link (shareable URL)
    3. Amount + memo embedded
  → Seller shows QR or shares link
  → Buyer scans/clicks → opens t2000 with pre-filled send flow → confirms
  → USDC arrives instantly → seller gets notification in feed
```

**Use cases:**

| Scenario | User says | What happens |
|----------|-----------|-------------|
| Pop-up store | "Charge $15 for a coffee" | QR code displayed on phone — customer scans and pays |
| Marketplace seller | "Create a payment link for $50 — vintage chair" | Shareable link for Facebook Marketplace / eBay listing |
| Freelancer invoice | "Invoice sarah@company.com $500 for logo design" | Email sent with payment link + description via Resend |
| Split dinner | "Request $25 from Tom and Lisa" | Payment request links sent to contacts |
| Street vendor | "Show my payment QR" | Persistent QR code (no amount) — customer enters amount |
| Recurring charge | "Create a $99/month subscription link" | Payment link with recurring context (manual re-pay for now) |

#### Features

| Feature | Description |
|---------|-------------|
| **Payment QR** | Generate QR code with embedded payment details (address, amount, memo) |
| **Payment link** | Shareable URL: `app.t2000.ai/pay?to=0x...&amount=25&memo=coffee` |
| **Invoice email** | Send professional invoice email via Resend with payment link embedded |
| **Payment request to contacts** | Send request to saved contacts — they see it as a chip in their feed |
| **Merchant mode** | Persistent QR display (full-screen, high contrast) for countertop use |
| **Payment notifications** | Real-time feed notification when payment arrives |
| **Receipt generation** | Auto-generate receipt after payment (PDF or in-feed card) |
| **Payment history** | Track all incoming payments with sender, amount, memo, timestamp |

#### Architecture

No new smart contracts needed. Uses existing `send` flow from the payer's side:

```
Seller generates request → QR/link with params
  → Buyer opens app.t2000.ai/pay?to=...&amount=...&memo=...
  → /pay page pre-fills send flow
  → Buyer confirms → standard sponsored send transaction
  → Seller's balance updates → notification in feed
```

**`/pay` route** — new public page on `app.t2000.ai`:
- No auth required to VIEW (shows amount, memo, recipient)
- Auth required to PAY (Google Sign-In if not logged in)
- Works for both t2000 users AND any Sui wallet (show raw address as fallback)

**Agent tool:** `create_payment_request` — generates QR + link + optional email

### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| | **Tier 1 services** | | | |
| 23a.1 | Video generation via fal.ai (Kling/Runway) | gateway + web-app | 1d | ⬜ |
| 23a.3 | Logo design via Looka/Brandmark | gateway + web-app | 1d | ⬜ |
| | **Tier 2 services** | | | |
| 23a.4 | Send flowers via FloristOne/Petalbot | gateway + web-app | 2d | ⬜ |
| 23a.5 | Domain registration via Namecheap | gateway + web-app | 2d | ⬜ |
| 23a.6 | Event tickets via Ticketmaster | gateway + web-app | 2d | ⬜ |
| 23a.7 | Stock photos via Shutterstock | gateway + web-app | 1d | ⬜ |
| | **Tier 3 services** | | | |
| 23a.8 | Wise transfer (USDC → any bank account) | gateway + web-app | 4d | ⬜ |
| 23a.9 | Mobile money via Flutterwave (M-Pesa, GCash) | gateway + web-app | 3d | ⬜ |
| 23a.10 | Bill pay via dLocal/Rapyd | gateway + web-app | 3d | ⬜ |
| | **Tier 4 services** | | | |
| 23a.11 | Presentation generation via Gamma | gateway + web-app | 1d | ⬜ |
| 23a.12 | Business cards via Moo/Vistaprint | gateway + web-app | 2d | ⬜ |
| 23a.13 | Fax via eFax | gateway + web-app | 1d | ⬜ |
| | **Payment Requests + Merchant Receive** | | | |
| 23b.1 | `create_payment_request` agent tool (generates QR + link) | web-app | 3h | ⬜ |
| 23b.2 | `/pay` public page — view request + pre-filled send flow | web-app | 4h | ⬜ |
| 23b.3 | Invoice email — payment link + description via Resend | web-app + gateway | 3h | ⬜ |
| 23b.4 | Merchant mode — persistent full-screen QR display | web-app | 2h | ⬜ |
| 23b.5 | Payment notification — real-time feed card when payment arrives | web-app | 3h | ⬜ |
| 23b.6 | Payment request to contacts — link sent to saved contacts | web-app | 2h | ⬜ |
| 23b.7 | Receipt generation (in-feed card with details) | web-app | 2h | ⬜ |
| 23b.8 | Payment history — incoming payments log | web-app | 2h | ⬜ |
| 23b.9 | Tests + docs | all | 3h | ⬜ |

**Estimated total:** 4-6 weeks (services can be added incrementally; merchant payments ~1 week)

---

## Phase 22 — Contextual Chips Revamp + Feed UX

**Goal:** Expand contextual chips beyond financial state into real-world spending flows and lifestyle triggers. Improve feed media UX (copy, download, share).

### Phase 22a — Chip Catalog Expansion

The current chip system is infrastructure-complete (priority ranking, `MAX_CHIPS = 3`, time-of-day awareness, post-agent suggestions). What's missing is a richer catalog of chips that drive commerce and showcase gateway services.

**Current chip categories:** financial state (idle funds, better rate, rewards, risk), welcome/discover, post-agent follow-ups.

**New chip categories to add:**

| Category | Example Chips | Trigger | Status |
|----------|--------------|---------|--------|
| **Quick spend** | "Coffee run", "Grab lunch", "Order dinner" | Time-of-day (morning/noon/evening) + funded account | ⬜ |
| **Gift giving** | "Christmas gifts", "Valentine's gift", "Gift for mum", "Gift for dad" | Seasonal (Dec, Feb, May, Jun, Oct) + funded ($10+) | ✅ |
| **Creative** | "Generate an image", "Make a QR code" | Idle state, post-save (celebrate with creativity) | ⬜ |
| **Utility** | "Translate something", "Search the web" | Always available as discovery | ⬜ |
| **Mail** | "Send a postcard", "Write a letter" | Seasonal, post-send (follow up physical mail) | ⬜ |
| **News/Markets** | "Crypto prices", "What's trending" | Morning chip, post-invest | ⬜ |
| **Lifestyle** | "Search flights", "Check the weather" | Weekend/evening, funded account | ⬜ |
| **Post-action follow-up** | "Send another?", "Send them a note?" | After send_postcard, send_letter, place_order | ✅ |

**Design principles:**
- Commerce chips only show when account is funded (no dead-end flows)
- Time-sensitive chips rotate naturally (morning ≠ evening)
- Never show more than 1 commerce chip in the 3-chip slot (financial > commerce)
- New chips use existing `chipFlow` system — tap chip → start guided flow or agent query

### Phase 22c — Gift Giving Intelligence

The agent now understands gift giving as a multi-tool chain, not just a single purchase. This is a KEY use case for real-world adoption.

**Multi-tool gift chains (implemented in system prompt):**

| Chain | Flow | Result |
|-------|------|--------|
| **Creative gift** | generate_image → send_postcard | Custom AI-generated postcard mailed |
| **Custom merch** | generate_image → browse_products → estimate → place_order | Custom mug/shirt/poster shipped |
| **Multi-person** | Work through a list, suggest + execute for each | "Christmas gifts for the family" |

**Seasonal chips (implemented in `contextual-chips.ts`):**

| Season | Chip | When |
|--------|------|------|
| Christmas | "Christmas gifts" | Dec 1–25 |
| Valentine's | "Valentine's gift" | Feb 1–14 |
| Mother's Day | "Gift for mum" | May 1–14 |
| Father's Day | "Gift for dad" | Jun 1–21 |
| Halloween | "Halloween treats" | Oct 20–31 |

**Post-action chain chips (implemented in `contextual-chips.ts`):**
- After `send_postcard` → "Send another?" (suggests another postcard)
- After `send_letter` → "Send another?" (suggests another letter)
- After `place_order` → "Send them a note?" (suggests postcard)

### Phase 22b — Feed Media Actions

Improve UX for generated media (images, QR codes, audio) in the feed.

| Feature | Description |
|---------|-------------|
| **Copy image** | Copy-to-clipboard button on image cards (Clipboard API `write` with blob) | ✅ |
| **Download image** | Download button — saves to device with descriptive filename | ✅ |
| **Share image** | Web Share API on mobile — share to any app | ⬜ |
| **Full-screen preview** | Tap image to expand to full-screen overlay | ⬜ |
| **Image loading state** | Skeleton/shimmer while image URL loads | ⬜ |
| **Image error state** | Fallback UI if image URL fails to load (retry button) | ⬜ |

### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 22a.1 | Define new chip entries in `contextual-chips.ts` (quick-spend, creative, utility, mail, markets, lifestyle) | web-app | 3h | ⬜ |
| 22a.2 | Time-of-day commerce triggers (morning coffee, lunch, dinner) | web-app | 2h | ⬜ |
| 22a.3 | Post-action gift chain chips (card→postcard, postcard→card, merch→note) | web-app | 2h | ✅ |
| 22a.4 | Seasonal gift chips (Christmas, Valentine's, Mother's/Father's Day, Halloween) | web-app | 2h | ✅ |
| 22a.5 | Commerce chip gating — only show when funded ($10+) | web-app | 1h | ✅ |
| 22a.6 | Tests for new chip categories | web-app | 2h | ⬜ |
| 22b.1 | Copy-to-clipboard button on image/QR feed cards | web-app | 2h | ✅ |
| 22b.2 | Download button on image/QR feed cards | web-app | 1h | ✅ |
| 22b.3 | Image loading skeleton + error fallback with retry | web-app | 2h | ⬜ |
| 22b.4 | Full-screen image preview overlay | web-app | 2h | ⬜ |
| 22b.5 | Web Share API integration (mobile) | web-app | 1h | ⬜ |
| 22c.1 | Gift-giving multi-tool chain intelligence in system prompt | web-app | 2h | ✅ |
| 22c.2 | Gift amount guidance + seasonal awareness in system prompt | web-app | 1h | ✅ |
| 22c.3 | Gift combo post-action suggestions ("Send a card too?") | web-app | 1h | ✅ |

**Estimated total:** 3-4 days (8/14 tasks shipped)

---

## Priority Summary

### Execution order

```
Phase 16: Safeguards          ✅ Shipped (v0.11.0)
    ↓
Phase 11a: MCP Server         ✅ Shipped (v0.12.3) — 35 tools, 20 prompts
    ↓
Phase 18a: Contacts           ✅ Shipped (v0.13.0)
    ↓
Phase 17: Investment Account  ✅ Core shipped (v0.14.0–v0.17.29)
    ↓
Phase 12: MPP Integration     ✅ Shipped (v0.19.0) — @t2000/mpp-sui + agent.pay()
    ↓
Phase 12e: MPP Gateway        ✅ Shipped (v0.22.3) — 41 services, 90 endpoints, mpp.t2000.ai
    ↓
Phase 12e+: Gateway v2        ✅ Shipped — payment logging, explorer, live feed, docs, deliver-first
    ↓
v3: Web App                   ✅ Shipped — app.t2000.ai, zkLogin, agent loop, 40+ tools, chips
    ↓
v3: Agent Loop Design         ✅ Shipped — client-driven tool calling, multi-turn, confirmations
    ↓
Phase 24a: Gift Card Removal  ✅ Shipped — Reloadly removed, risk eliminated (see COMMERCE_V2.md)
    ↓
Phase 21: Voice + Image Input ← mic button, image upload for chat
    ↓
Phase 22: Chips Revamp + Feed UX ← commerce chips, copy/download images
    ↓
Phase 24b: Pepesto Integration ← EU grocery/recipes + MPP endpoints (see COMMERCE_V2.md)
    ↓
Phase 23a: Gateway Expansion  ← flowers, video gen, Wise, mobile money
    ↓
Phase 23b: Merchant Payments  ← payment requests, QR, invoicing, /pay page
    ↓
MPP: USDC Sponsorship         ← onboard with $1 USDC (see roadmap-mpp.md)
    ↓
MPP: OpenAPI Discovery        ← /openapi.json + MPPscan registration (see roadmap-mpp.md)
    ↓
Phase 13: Dashboard           ← agent network + explorer
    ↓
MPP: mppsui.dev               ← ecosystem hub (see roadmap-mpp.md)
    ↓
Phase 15: Cross-Chain USDC    ← Circle CCTP — bridge USDC from any chain
    ↓
Phase 20a: On-ramp (Moonpay)  ← fiat → crypto for non-crypto users
    ↓
Phase 17e: Margin Trading     ← leverage via Bluefin perps
    ↓
Phase 17c-alpha: AlphaLend    ← additional lending protocol
    ↓
Phase 17g: Securities Lending ← borrow against portfolio
```

### Priority table

| Phase | Feature | Priority | Effort | Status |
|-------|---------|----------|--------|--------|
| **19** | Security Audit + Trust Infrastructure | **P0** | 3-4 days | ✅ Done |
| **10** | Yield Optimizer + Multi-Stable Infrastructure | **P0** | 3 days | ✅ Done (v0.10.4) |
| **16** | Agent Safeguards (limits, controls, lock) | **P0** | 1.5 days | ✅ Done (v0.11.0) |
| **11a** | MCP Server (35 tools, 20 prompts) | **P0** | 2-3 days | ✅ Done (v0.12.3–v0.22.3) |
| **18a** | Contacts (send by name) | **P0** | 1-1.5 days | ✅ Shipped (v0.13.0) |
| **17** | Investment Account (spot, yield, strategies, gold, rebalance) | **P0** | 3 weeks | ✅ Core shipped. 17c-alpha, 17e, 17g remaining |
| **12** | MPP Integration (replace x402, `@t2000/mpp-sui`) | **P0** | 10 days | ✅ Shipped (v0.19.0) |
| **12e** | MPP Gateway v2 — 40 services, 88 endpoints, explorer, live feed | **P0** | 3 weeks | ✅ Shipped (v0.22.3) |
| **v3** | Web App — zkLogin, agent loop, 40+ tools, chip flows, services | **P0** | 6 weeks | ✅ Shipped (app.t2000.ai) |
| **24a** | Gift Card Removal — remove Reloadly, eliminate risk + complexity | **P0** | 2-3 days | ✅ Shipped |
| **21** | Voice Input + Image Upload — mic button, camera/file upload | **P0** | 3-5 days | ⬜ Next |
| **22** | Contextual Chips Revamp + Feed Media UX — commerce chips, copy/download images | **P0** | 3-4 days | ⬜ |
| **24b** | Pepesto Integration — EU grocery/recipes + MPP endpoints | **P0** | 1-1.5 weeks | ⬜ Planned (COMMERCE_V2.md) |
| **23a** | Gateway Service Expansion — flowers, video gen, Wise, mobile money, tickets | **P0** | 3-4 weeks | ⬜ |
| **23b** | Payment Requests + Merchant Receive — QR, payment links, invoicing, /pay page | **P0** | 1 week | ⬜ |
| **MPP-1** | USDC Sponsorship — $1 on wallet creation | **P0** | 2-3 days | ⬜ Planned (roadmap-mpp.md) |
| **MPP-2** | OpenAPI Discovery + MPPscan registration | **P1** | 2-3 days | ⬜ Planned (roadmap-mpp.md) |
| **13** | Dashboard + Agent Network + Explorer | **P1** | 2 weeks | 🔶 Foundation built |
| **MPP-3** | mppsui.dev — ecosystem hub, server registry | **P1** | 2-3 weeks | ⬜ Planned (roadmap-mpp.md) |
| **15** | Cross-Chain USDC (Circle CCTP V1) | **P1** | 1 week | ⬜ Unblocked — CCTP live on Sui mainnet |
| **20a** | On-ramp (Stripe Crypto Onramp — embedded) | **P1** | 2-3 days | ⬜ Sui confirmed as destination_network |
| **17e** | Margin Trading (Bluefin perps) | **P1** | 1-2 weeks | ⬜ Blocked on Bluefin API |
| **v3-3** | Chrome Extension — 402 detection, popup wallet | **P1** | 2-3 weeks | ⬜ Spec complete |
| **17c-alpha** | AlphaLend Adapter | P2 | 3-4 days | ⬜ |
| **17g** | Securities-Backed Lending | P2 | 1 week | ⬜ |
| **11b** | Gateway + Channels (Telegram/WebChat) | P3 | 2-3 weeks | Deferred — web app covers this |
| **20b** | Off-ramp / Virtual Card | P3 | 2-3 weeks | ⬜ Research needed |
| **14** | Multi-Agent Profiles | P3 | 1 week | ⬜ |
| **v3-4** | iOS App (PWA first, native later) | P3 | 6-8 weeks | ⬜ After PMF |

### v3 — Frictionless Consumer App ✅

| Phase | Feature | Priority | Effort | Status |
|-------|---------|----------|--------|--------|
| **v3-1** | zkLogin (Google Sign-In) — SDK signer + salt service + Enoki sponsorship | **P0** | 2 weeks | ✅ Shipped |
| **v3-2** | Web App (`app.t2000.ai`) — dashboard, agent loop, chips, services | **P0** | 4 weeks | ✅ Shipped |
| **v3-2a** | Agent Loop Design — client-driven tool calling, 40+ tools, multi-turn | **P0** | 2 weeks | ✅ Shipped |
| **v3-2b** | Gateway v2 — payment logging, explorer, live feed, deliver-first | **P0** | 2 weeks | ✅ Shipped |
| **v3-3** | Chrome Extension — 402 detection, popup wallet | **P1** | 2-3 weeks | ⬜ Spec complete |
| **v3-4** | iOS App (PWA first, native later) | **P2** | 6-8 weeks | ⬜ After PMF |

See `spec/T2000_V3_SPEC.md`, `spec/V3_BUILD_PLAN.md`, `spec/AGENT_LOOP_DESIGN.md`, `spec/MPP_GATEWAY_V2.md`.

### Backlog

| Item | Description | Priority |
|------|-------------|----------|
| **Fee model review** | Replace lending/borrowing fees with a swap fee on every exchange. Simpler model, captures revenue on every trade. Review current fee structure, propose new BPS, update contracts + SDK | P1 — review during or after Gateway |
| **LLM call monetization** | Agent loop LLM calls currently free. Options: metered (charge per msg after free tier), bundled (included in service fee), gateway service (route LLM through MPP). Deferred — low priority while user base is small | P2 — revisit at scale |

### Related Specs

| Spec | Scope |
|------|-------|
| `spec/T2000_V3_SPEC.md` | v3 architecture — zkLogin, web app, Chrome extension, iOS |
| `spec/V3_BUILD_PLAN.md` | Implementation plan for v3 (phases, tasks, dependencies) |
| `spec/AGENT_LOOP_DESIGN.md` | Agent loop design — client-driven tool calling, budget model, conversation history |
| `spec/MPP_GATEWAY_V2.md` | Gateway v2 — payment logging, explorer, live feed, deliver-first pattern |
| `spec/roadmap-mpp.md` | MPP ecosystem roadmap — USDC sponsorship, mppsui.dev, package migration, server registry |
| `spec/COMMERCE_V2.md` | Commerce v2 — Phase 24a: gift card removal, Phase 24b: Pepesto EU grocery/recipes |

---

*t2000 — The agent banking stack.*
*Roadmap v2.1*
