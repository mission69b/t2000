# Product Specification

> Consolidated product spec for t2000 infrastructure. Covers the consumer product taxonomy (Audric), the t2000 stack that implements it, integration, and technical reference.
> For CLI formatting details: see `CLI_UX_SPEC.md`. For detailed SDK/CLI reference: see `PRODUCT_FACTS.md`. For the canonical Audric taxonomy + naming rules: see `../audric-roadmap.md`.
>
> Last updated: 2026-04-19 (post-S.16 — 4-product taxonomy locked, Audric Finance retired)

---

## Audric — the four products

The Audric consumer brand is exactly four products. All operations the user can take resolve to one of them. "Audric Finance" is retired; its operations (save, swap, borrow, repay, withdraw) are surfaced through Audric Intelligence's Agent Harness, gated by Audric Passport's tap-to-confirm.

| Product | What it is | t2000 implementation | Status |
|---------|-----------|----------------------|--------|
| 🪪 **Audric Passport** | Trust layer — identity (zkLogin via Google), non-custodial wallet on Sui, tap-to-confirm consent on every write, sponsored gas | `@t2000/sdk` (wallet, signing) + Enoki (zkLogin, gas sponsorship) + `@mysten/sui` | Live |
| 🧠 **Audric Intelligence** | Brain (the moat) — 5 systems orchestrate every money decision: Agent Harness (40 tools), Reasoning Engine (9 guards, 7 skill recipes), Silent Profile, Chain Memory, AdviceLog | `@t2000/engine` (QueryEngine + tools + reasoning + guards + recipes) | Live |
| 💸 **Audric Pay** | Money primitive — send USDC, payment links, invoices, QR. Free, global, instant on Sui | `@t2000/sdk` Sui tx builders (direct USDC transfers, payment-link contract, invoice flows) | Live |
| 🛒 **Audric Store** | Creator marketplace at `audric.ai/username` — sell AI-generated music, art, ebooks in USDC. 92% to creator | `@t2000/sdk` + Walrus storage + payment links (built on Audric Pay primitives) | Coming soon (Phase 5) |

### Operations inside the products

| Operation | Lives under | t2000 surface |
|-----------|-------------|----------------|
| save | Intelligence (Agent Harness `save_deposit` tool) | NAVI MCP + thin tx builders |
| withdraw | Intelligence (`withdraw` tool) | NAVI MCP + thin tx builders |
| swap | Intelligence (`swap_quote` + `swap_execute` tools) | Cetus Aggregator V3 (20+ DEXs) |
| borrow / repay | Intelligence (`borrow` + `repay_debt` tools) | NAVI MCP + thin tx builders |
| stake / unstake | Intelligence (`volo_stake` + `volo_unstake` tools) | VOLO liquid staking |
| send USDC | Pay (`send_transfer` tool) | Direct Sui transactions |
| payment links / invoices | Pay (`create_payment_link`, `create_invoice` tools) | t2000 payment-kit + Sui Payment Kit URIs |
| pay an MPP API | Internal capability (`pay_api` tool) | MPP gateway (`mpp.t2000.ai`, 41 services) — not a promoted product |
| sign / consent | Passport (every write) | zkLogin ephemeral key + Enoki sponsorship |

**Removed:** Invest (multi-protocol optimization is a power-user DeFi feature). Suilend SDK removed. Cetus Aggregator SDK retained for swap routing only. When protocols release MCPs, expansion is a config change.

---

## Brand Architecture

```
suimpp.dev     → Protocol (Sui MPP standard, ecosystem, registry)
t2000.ai       → Infrastructure (CLI, SDK, MCP, gateway, contracts)
audric.ai      → Consumer product (app, website, product pages — NEW)
```

All npm packages (`@t2000/cli`, `@t2000/sdk`, `@t2000/mcp`, `@t2000/engine`), the GitHub repo, and gateway remain as t2000. Audric is consumer-facing.

---

## Repository Structure

```
t2000/                    Infrastructure monorepo
├── apps/
│   ├── web/              t2000.ai — developer/infra landing page + docs
│   ├── gateway/          MPP Gateway — proxied AI APIs (mpp.t2000.ai)
│   └── server/           Gas station + checkpoint indexer (api.t2000.ai)
├── packages/
│   ├── sdk/              Core SDK — wallet, balance, transactions, adapters
│   ├── engine/           Agent engine — QueryEngine, financial tools, MCP client/server
│   ├── cli/              CLI — Commander.js, all user commands
│   ├── mcp/              MCP server — 47 tools, mirrors engine tool set
│   └── contracts/        Move smart contracts (mpp-sui)
├── t2000-skills/         Agent skills for Claude Code, Cursor, etc.
└── spec/                 Product specs, design system

audric/                   Consumer product (separate repo)
└── apps/web/             audric.ai — zkLogin, engine chat, conversational banking
```

---

## Integration Model

### MCP-first DeFi

NAVI Protocol's free MCP server handles all read operations:
- Rates, positions, health factor, rewards, quotes
- Endpoint: `https://open-api.naviprotocol.io/api/mcp`

Writes use thin transaction builders via `@mysten/sui`:
- `Transaction` class for PTB construction
- No protocol SDK dependencies in production

### Dependencies

| Dependency | Status | Purpose |
|------------|--------|---------|
| `@mysten/sui` | Active | Transaction building, RPC, utilities |
| `@mysten/dapp-kit` | Active | Wallet connection (web app) |
| `@naviprotocol/lending` (patched) | Legacy | TX builders for save/withdraw/borrow/repay (reads migrated to NAVI MCP) |
| `@cetusprotocol/aggregator-sdk` | Active | Swap routing via Cetus Aggregator V3 |
| `@suilend/sdk` | Removed | — |

### SUI Price Oracle

SUI/USD price is read from the Cetus USDC/SUI pool on-chain object (read-only, no SDK):
- Pool ID: `CETUS_USDC_SUI_POOL` constant
- Extracts `current_sqrt_price` from pool state
- No Cetus SDK dependency — just `suiClient.getObject()`

---

## Supported Assets

Multi-asset support via canonical token registry (`packages/sdk/src/token-registry.ts`). **17 tokens** registered across 3 tiers. Save and borrow are **USDC only**.

| Tier | Symbols | Send | Save | Borrow | Swap |
|------|---------|------|------|--------|------|
| 1 | USDC | ✅ | ✅ (USDC only) | ✅ (USDC only) | ✅ |
| 2 | SUI, wBTC, ETH, GOLD, DEEP, WAL, NS, IKA, CETUS, NAVX, vSUI, LOFI, MANIFEST | ✅ | — | — | ✅ |
| Legacy | USDT, USDe, USDSUI | ✅ | — | — | ✅ |

Swap supports any token pair via Cetus Aggregator V3. See `PRODUCT_FACTS.md` for the full token list.

---

## Fees

| Operation | BPS | Rate | Notes |
|-----------|-----|------|-------|
| Save      | 10  | 0.1% | Protocol fee on deposit |
| Borrow    | 5   | 0.05% | Protocol fee on loan |
| Withdraw  | —   | Free | |
| Repay     | —   | Free | |
| Send      | —   | Free | |
| Pay (MPP) | —   | Free | Agent pays the API price, no surcharge |

Fees collected on-chain via `t2000::treasury::collect_fee()` within the same PTB.

---

## Key Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `MIST_PER_SUI` | `1_000_000_000n` | SUI atomic units |
| `MIN_DEPOSIT` | `1_000_000n` | 1 USDC minimum deposit (6 decimals) |
| `BPS_DENOMINATOR` | `10_000n` | Basis point math |
| `PRECISION` | `10^18` | Reward math (matches contract) |
| `CLOCK_ID` | `'0x6'` | Sui shared clock object |
| `SAVE_FEE_BPS` | `10n` | 0.1% save fee |
| `BORROW_FEE_BPS` | `5n` | 0.05% borrow fee |

---

## Gas Resolution

```
1. Check SUI balance ≥ GAS_RESERVE_MIN (0.02 SUI)
2. YES → self-fund (split from gas coin)
3. NO  → gas station (sponsored, server pays)
```

Auto-topup (USDC→SUI conversion) is active — swaps $1 USDC → SUI via Cetus when SUI < 0.05 and USDC ≥ $2. Gas station is the final fallback.

---

## Package Overview

### SDK (`@t2000/sdk`)

Core primitives: wallet management, balance queries, transaction building, protocol adapters.

Key exports: `T2000` (main class), `NaviAdapter`, `ProtocolRegistry`, constants, formatting utilities.

### CLI (`@t2000/cli`)

Commands: `save`, `send`, `withdraw`, `borrow`, `repay`, `claim-rewards`, `balance`, `rates`, `earn`, `history`, `pay`, `health`, `overview`, `contacts`, `fund-status`, `key`, `version`.

### MCP (`@t2000/mcp`)

50 tools (38 read, 12 write) — mirrors the engine tool set. Exposes full t2000 functionality to Claude Desktop, Cursor, and any MCP-compatible client.

### Engine (`@t2000/engine`)

Conversational finance engine powering Audric:
- `QueryEngine` — stateful conversation manager with adaptive thinking, guard runner, recipe injection
- `buildTool()` — typed tool factory with Zod validation, permission tiers, `ToolFlags`, preflight validation
- `runTools()` — parallel reads (`Promise.allSettled`) / serial writes (`TxMutex`)
- `AnthropicProvider` — streaming LLM with extended thinking, prompt caching
- Reasoning engine — `classifyEffort` (adaptive thinking), `runGuards` (9 guards, 3 tiers), `RecipeRegistry` (YAML skills)
- `ContextBudget` — 200k token limit, 85% compact trigger, LLM summarizer fallback
- `CostTracker` — token usage + USD cost estimation with budget limits
- SSE streaming — `serializeSSE` / `parseSSE` / `engineToSSE`
- Canvas system — `render_canvas` tool, `canvas` SSE event type
- MCP client (`McpClientManager`) — multi-server MCP client with caching, NAVI MCP integration
- MCP server adapter — `buildMcpTools` / `registerEngineTools` (engine tools → MCP tools)
- 50 tools (38 read, 12 write) — see `PRODUCT_FACTS.md` for full list
- Feature-flagged behind `ENABLE_THINKING=true`

---

## Phased Execution

### Phase 0: Foundation ✅
- CLAUDE.md, .claude/rules
- Product simplification (5 products)
- Claude Code architecture analysis
- Consumer brand: Audric

### Phase 0.5: Codebase Cleanup ✅
- Removed Invest/Swap/Suilend/Cetus dead code
- Cleaned SDK, CLI, MCP, skills, web, web-app, specs
- Archived superseded specs

### Phase 1a: audric.ai Website ✅
- Design tokens from Agentic UI kit → Tailwind config
- Homepage: hero, product grid, trust, CTA
- Product pages: /savings, /pay, /send, /credit

### Phase 1b: `@t2000/engine` — Agent Engine ✅

#### 1b-alpha: Core Engine ✅
- `QueryEngine` — stateful conversation manager, async generator `submitMessage()` loop
- `LLMProvider` abstraction + `AnthropicProvider` implementation (streaming, tool parsing)
- `buildTool()` factory — typed tools with Zod validation, permission tiers, concurrency flags
- `runTools()` orchestration — parallel reads (`Promise.allSettled`), serial writes (`TxMutex`)
- Read-only financial tools: `balance_check`, `savings_info`, `health_check`, `rates_info`, `transaction_history`
- System prompt, message types, provider-agnostic event model
- Tests across all phases, typecheck clean

#### 1b-beta: Write Tools + Confirmation + Cost Tracking ✅
- Write tools: `save_deposit`, `withdraw`, `send_transfer`, `borrow`, `repay_debt`, `claim_rewards`, `pay_api`
- Async confirmation flow: `permission_request` event with `resolve` callback, `Promise.race` + `AbortSignal` for deadlock prevention
- `CostTracker` — cumulative token tracking (input, output, cache read/write), USD cost estimation, budget limits
- 12 confirmation integration tests, cost tests with cache token coverage

#### 1b-gamma: Streaming, Sessions, Context, MCP Adapter ✅
- SSE streaming: `serializeSSE` / `parseSSE`, `engineToSSE` generator adapter
- `SessionStore` interface + `MemorySessionStore` (TTL, `structuredClone` isolation, Vercel KV–ready)
- Context window management: `estimateTokens`, `compactMessages` (3-phase: summarise → drop old → truncate recent), `sanitizeMessages` (orphan tool_use/tool_result cleanup)
- MCP server adapter: `buildMcpTools` (engine tools → MCP descriptors with `audric_` prefix), `registerEngineTools`
- 175+ tests across 13 suites

### Phase 1d: MCP Client + NAVI MCP Reads ✅

The engine needs an MCP client to consume external protocol data (starting with NAVI). This replaces SDK-based reads in the engine's financial tools with MCP calls, while writes remain as SDK tx builders.

**Key architectural constraint:** Write tx builders in `protocols/navi.ts` depend on SDK-internal reads (`refreshOracle` needs `naviGetPools()` for raw `Pool[]` objects, `buildWithdrawTx` calls `getPositions()` for balance checks, `buildRepayTx` calls `fetchCoins()`). These internal reads use NAVI SDK types the PTB builders expect — MCP returns different formats. Therefore `protocols/navi.ts` stays intact. MCP only replaces user-facing read tools in the engine layer.

#### 1d-alpha: Engine MCP Client
- Add `@modelcontextprotocol/sdk` to `@t2000/engine` dependencies (verify zod peer alignment)
- `McpClientManager` — multi-server connection registry, keyed by server name
  - Wraps SDK `Client` + `StreamableHTTPClientTransport` (for HTTP MCP servers like NAVI)
  - Per-server: `connect()`, `disconnect()`, `listTools()`, `callTool()`
  - Connection health: timeout config, reconnect with backoff, graceful error on unreachable
- `mcpToolAdapter` — converts MCP-discovered tools into engine `Tool` objects
  - JSON Schema preserved as `jsonSchema` for LLM tool definitions
  - Zod schema: `z.record(z.unknown())` passthrough (MCP server validates inputs server-side)
  - `isReadOnly: true`, `permissionLevel: 'auto'` as defaults (configurable per-server/per-tool)
  - Tool namespacing: `{serverName}_{toolName}` to prevent collisions across servers
- Response caching: short-lived cache (30s TTL, configurable per-server) for MCP read responses
- Tests with mock MCP server (in-process `McpServer` + memory transport)

#### 1d-beta: NAVI MCP Integration
- **Step 1: Discovery** — connect to `https://open-api.naviprotocol.io/api/mcp`, enumerate actual tools + schemas. Capture the real tool names, input schemas, and response formats (documented names like `navi_get_pools` may differ from actual).
- **Step 2: Response transforms** — isolated `navi-transforms.ts` mapping NAVI MCP responses to engine types (`RatesResult`, `PositionsResult`, `HealthFactorResult`, `PendingReward[]`). Each transform is a pure function, well-tested, resilient to missing fields.
- **Step 3: Composite reads** — engine `getHealthFactor` needs `supplied`/`borrowed`/`maxBorrow` which may require combining `navi_get_health_factor` + `navi_get_positions`. Handle multi-call reads gracefully.
- No SDK fallback at launch (adds two code paths + doubles test surface; add later if NAVI MCP proves unreliable)

#### 1d-gamma: Engine Read Tool Update
- Update engine read tools (`balance_check`, `savings_info`, `health_check`, `rates_info`) to use MCP when an `McpClientManager` with a NAVI connection is available in the `ToolContext`
- Fall through to `agent.*` (SDK) when no MCP connection is configured (e.g., CLI usage, tests)
- `protocols/navi.ts` stays unchanged — write tx builders continue using `@naviprotocol/lending` SDK + patch
- `NaviAdapter` in SDK stays unchanged — no SDK refactoring needed
- Net result: engine reads go through MCP (fast, no SDK dependency); engine writes go through SDK (proven tx builders)

### Phase 1e: Documentation + Housekeeping ✅

Engine is built but nothing outside the package knows about it. This phase updates all docs, rules, skills, and references to reflect the new `@t2000/engine` package and the Audric product architecture.

#### Docs — update existing files
- `README.md` — add `@t2000/engine` to the package table, add engine usage example, mention Audric consumer product
- `ARCHITECTURE.md` — add engine section (QueryEngine, tool system, MCP client/server, streaming, sessions), update system overview diagram to show engine layer
- `PRODUCT_FACTS.md` — add `@t2000/engine` version, engine API reference (public exports, tool names, event types), update "Last verified" date
- `SECURITY.md` / `SECURITY_AUDIT.md` — document engine security model (permission tiers, confirmation flow, budget limits, abort handling)

#### Docs — create new files
- `packages/engine/README.md` — package README with quick start, API overview, tool list, configuration, examples
- `packages/engine/CHANGELOG.md` — initial changelog for 1b + 1d work

#### Rules — update `.claude/rules/`
- `architecture.md` — update engine section from "planned" to actual (list modules, exports, patterns). Add MCP client architecture.
- `packages.md` — add `@t2000/engine` section (entry point, key exports, test command, commit scope `engine`)

#### CLAUDE.md — workspace rules
- Add `@t2000/engine` import patterns (QueryEngine, buildTool, streaming, session, MCP client)
- Add engine event types to the conventions section
- Add engine test/build commands

#### Skills — `t2000-skills/`
- New skill: `t2000-engine` — how to use QueryEngine, build custom tools, configure providers
- Update `t2000-mcp` skill — document Audric MCP adapter (`buildMcpTools`, `registerEngineTools`)
- Consider: `audric-chat` skill — how to wire engine into a web app (SSE streaming, permission bridge, sessions)

#### MCP — `@t2000/mcp`
- Update prompts to reference engine capabilities (Audric as conversational interface)
- Verify tool count/descriptions in `PRODUCT_FACTS.md` match actual code
- Update `t2000_overview` tool description if engine changes the read path

#### Housekeeping
- `package.json` version bumps (`@t2000/engine` 0.1.0 initial publish prep)
- Verify monorepo `pnpm build` builds all packages including engine
- Verify `pnpm test` runs all test suites including engine
- Clean up any TODO/FIXME comments left during development
- Lint pass on all new engine files

### Phase 2: Web Chat UI

Retrofit `@t2000/engine` into the Audric consumer app (separate `audric/` repo), replacing the hand-rolled Anthropic integration with `QueryEngine` + SSE streaming + the Agentic UI design system. The existing zkLogin/Enoki/gas infrastructure stays intact.

**Key context:** The Audric app has a working engine-powered chat with zkLogin auth, Enoki gas sponsorship, and a feed-based dashboard.

**Infrastructure:** Upstash KV (Vercel KV-compatible Redis) provisioned for session storage. This replaces `MemorySessionStore` for production persistence.

#### 2a: Engine API Route (server wiring) ✅
- New SSE endpoint: `POST /api/engine/chat`
  - Accept `{ sessionId?, message, address }`, validate zkLogin JWT + Sui address
  - Create or resume `QueryEngine` with `AnthropicProvider` + `READ_TOOLS` (server-side read-only; writes deferred to client via permission flow)
  - Wire `engineToSSE` + `PermissionBridge` for streaming response
  - Connect `McpClientManager` + `NAVI_MCP_CONFIG` for MCP-first reads (with 60s retry on failure)
  - Session management: `UpstashSessionStore` implementing `SessionStore` interface (`@upstash/redis`)
  - Return `text/event-stream` with `SSEEvent` chunks + initial `session` event with ID
- New endpoint: `POST /api/engine/permission`
  - Accept `{ sessionId, permissionId, approved }`, resolve via `PermissionBridge`
  - Bridge instance shared with the SSE stream (in-memory Map keyed by sessionId, 10m expiry)
- Auth: zkLogin JWT validation on both routes via `validateJwt()` + `isValidSuiAddress()`
- Rate limiting: `rateLimit()` — 20/min for chat, 30/min for permissions
- `CostTracker` per session with $0.50 budget limit
- Graceful cleanup: `bridge.rejectAll()` on client disconnect via stream `cancel()` callback
- **Files**: `lib/engine/upstash-session-store.ts`, `lib/engine/bridge-registry.ts`, `lib/engine/engine-factory.ts`, `app/api/engine/chat/route.ts`, `app/api/engine/permission/route.ts`

#### 2b: Chat UI Components (streaming frontend)
- New hook: `useEngine(address)` — connects to `/api/engine/chat` SSE
  - Parses `SSEEvent` stream via `parseSSE` from `@t2000/engine`
  - Manages message state: accumulates `text_delta` into assistant messages
  - Tracks tool execution state: `tool_start` → loading, `tool_result` → display
  - Handles `permission_request` → shows confirmation UI
  - Tracks `usage` events for display
  - Auto-reconnect on SSE disconnect
- Streaming message bubble — text appears character-by-character as deltas arrive
- Tool result cards — formatted display of balance, savings, health, rates data
- Confirmation modal — triggered by `permission_request` events
  - Shows tool name, description, input summary
  - Approve/Deny buttons → `POST /api/engine/permission`
  - Timeout indicator (AbortSignal deadline)
- Session management UI
  - Create new conversation / resume existing
  - Session list from Upstash KV
  - Usage display (tokens, estimated cost)
- Wire into existing dashboard layout (keeps `BalanceHeader`, nav, auth guards)
- **Design reference**: Claude.ai chat UX patterns
  - Personalized greeting ("Good evening, {name}") on empty state
  - Centered input bar with model/attachment affordances
  - Quick-action category chips below input (DeFi-specific: "Check balance", "Save SUI", "View rates")
  - Collapsible sidebar with session history
  - Dark warm-toned palette matching Audric brand (N100-N900 neutral scale)

#### 2c: Agentic UI Reskin (design system) ✅
- **Fonts**: Geist Sans (body), Geist Mono (code/labels), Instrument Serif (display headings) via `geist` npm + `next/font/google`
- **Color tokens**: Neutrals N100–N900 (white-to-black palette) in globals.css `:root`
  - Removed dark theme (#040406 bg → #FFFFFF), removed noise/scanline `body` overlays
  - Semantic colors added: `--success` (#3CC14E), `--error` (#F0201D), `--warning` (#FFB014), `--info` (#0966F6)
  - Primary action color: N800/N900 (black) — no brand accent color
  - All `text-accent` green references replaced with semantic or neutral equivalents
- **Shadow tokens**: `--shadow-card`, `--shadow-dropdown`, `--shadow-drawer`, `--shadow-modal` as CSS vars mapped in `@theme inline`
- **Branding**: "t2000" → "Audric" in app header, landing page, metadata title
  - H1 uses serif display font (`font-display` class)
  - Google Sign-In button now shows real Google logo colors instead of dark monotone
  - Links use `text-info` blue; success states use `text-success` green; errors use `text-error` red
- **Components reskinned** (17 files):
  - Engine: ChatMessage, ToolCard, PermissionCard, EngineChat, QuickActions
  - Dashboard: BalanceHeader, InputBar, ChipBar, ConfirmationCard, ResultCard, FeedRenderer, AgentMarkdown, ContextualChips, AmountChips, ContactToast, QrCode
  - Auth: GoogleSignIn, AuthGuard, LoadingScreen
  - Settings: SettingsPanel (drawer shadow added)
  - Landing: page.tsx (Audric branding, serif heading)
- **Buttons**: `bg-foreground text-background` (black on white) with `rounded-lg`, `hover:opacity-80`
- **User messages**: `bg-foreground text-background` (inverted, per chat convention)
- Typecheck: 0 errors | Lints: 0 errors

#### 2d: Polish + Integration ✅
- Removed old agent stack: `/api/agent/*`, `useAgentLoop`, `agent-tools` + tests (8 files)
- Removed unused LLM path: `useLlm`, `useLlmUsage`, `/api/llm` (3 files)
- Created `audric-chat` skill (`t2000-skills/skills/audric-chat/SKILL.md`): documents chat architecture, useEngine API, SSE events, error handling, server config, dashboard integration, accessibility
- Upgraded InputBar to `<textarea>`: Enter to send, Shift+Enter for newline, Escape clears/cancels
- Loading states: `ConnectingSkeleton` while connecting, streaming pulse indicator
- Accessibility: aria-live regions for streaming, aria-label on all interactive elements, role="alertdialog" on PermissionCard, sr-only typing indicator
- Session list: `GET /api/engine/sessions` endpoint, chat history in SettingsPanel, session resume via `loadSession`
- PermissionCard: 60s countdown timer with progress bar, auto-deny on timeout
- Error handling: exponential backoff retry (3 attempts), `AuthError` detection for 401, `error` status state
- Updated ARCHITECTURE.md agent loop section to reflect engine SSE flow
- Files: `InputBar.tsx` (textarea), `EngineChat.tsx` (skeleton), `ChatMessage.tsx` (a11y), `ToolCard.tsx` (a11y), `PermissionCard.tsx` (timeout), `QuickActions.tsx` (a11y), `useEngine.ts` (retry+loadSession), `SettingsPanel.tsx` (chat history), `api/engine/sessions/route.ts` (new)

### Phase 3: Chrome Extension — Deferred
> Deprioritized. Build after launch once core product is validated with real users.
> Re-evaluate when users request browser-level integration.

### Phase 4: Infrastructure + Launch

#### 4a: t2000.ai Simplification ✅
Redesigned `apps/web` from an 11-page consumer-marketing site into a focused developer/infra landing page.

- **Homepage rewritten**: hero repositioned to "The infrastructure behind Audric", product grid shows 5 packages (CLI, SDK, MCP, Engine, Gateway) with install commands, kept MPP services marquee, MCP integrations diagram, install CTA
- **Audric CTA section**: "Meet Audric" section with description and link to audric.ai; also linked in hero and footer
- **Kept infra pages**: `/docs`, `/stats`, `/mpp`, `/security`, legal pages
- **Removed consumer pages**: deleted `/accounts` (5 files), `/demo` (5 files), `/app` (1 file)
- **Removed unused components**: HomeShowcase, Ticker, BalanceWidget, DemoChat, McpLiveDemo (5 files); removed cinematic walkthrough CSS from globals.css
- **Updated layout.tsx**: metadata title "t2000 — The Infrastructure Behind Audric", updated OG description
- **Fixed dangling references**: updated `/demo` links in `mpp/page.tsx` and `stats/page.tsx`
- **Created `apps/web-app/.env.example`**: documents all required env vars (Sui network, Google OAuth, Enoki, DB, Anthropic, Upstash, gateway)
- **Updated CSP headers** in `apps/web-app/next.config.ts`: added `*.upstash.io` and `open-api.naviprotocol.io` to connect-src
- Typecheck: 0 new errors (pre-existing Prisma issues in stats API untouched) | Lints: 0 errors

#### 4a-v2: Agentic Design System Reskin ✅
Full reskin of both `apps/web` and `apps/gateway` with Agentic Design System dark theme.

- **Typography**: Replaced IBM Plex Mono with Geist Sans (body), Geist Mono (labels/code), Instrument Serif (headings) via `geist` npm + `next/font/google`
- **Color tokens**: CSS vars aligned to DS neutral scale (N900 bg, N800 surfaces, N700 borders, #00D68F accent). Shadow tokens added. Scanlines removed.
- **Homepage redesign**: New story flow — Hero ("The engine behind Audric") → Product showcase (5 Audric products) → Stack (5 packages) → Gateway (marquee + stats) → Integrations (MCP diagram) → Get started (install)
- **Header**: `Docs · GitHub · Gateway · [Try Audric →]` — primary CTA links to audric.ai (like Anthropic's "Try Claude")
- **Developer hub `/docs`**: Quick start (3 steps), 5 package cards (CLI, SDK, MCP, Engine, Gateway) with install commands + GitHub/npm links, resources grid
- **Gateway cleanup**: Deleted `/docs` and `/spec` pages (moved to suimpp.dev). Header links externally. Landing page reskinned with serif heading and dynamic stats grid.
- **Redirects**: `/mpp` → suimpp.dev. Legal pages (terms, privacy, disclaimer) updated to sans body text.
- **All docs links**: Fixed — point to `/docs` developer hub (not non-existent audric.ai/docs)

#### 4b: Documentation + Launch Prep ✅
Final documentation pass and pre-launch verification.

- **Root `README.md` overhaul**: Rewrote tagline to "The infrastructure behind Audric", added Brand Architecture section, updated repo structure (includes `web-app/` as Audric, `web/` as infra), added audric.ai link, refreshed tech stack table
- **`ARCHITECTURE.md`**: Updated domain mapping (`app.t2000.ai` → `audric.ai`), infrastructure table references Engine instead of Anthropic
- **`PRODUCT_FACTS.md`**: Updated MCP server description from "bank account" to infra-focused
- **`apps/web-app/README.md`**: Rewrote as "Audric" readme with engine stack, .env.example reference, audric.ai live link
- **`t2000-skills/README.md`**: Updated "bank account" description to infra positioning
- **Verification**: Engine build ✓ | 175 tests ✓ | typecheck ✓ | SDK 283 tests ✓ | web-app typecheck ✓ | Pre-existing lint warnings only

**Out of scope (handled externally):** Vercel dashboard domain/DNS configuration, social media posting, app distribution.

---

### Phase 5: gRPC Migration (JSON-RPC Deprecation)

> **Deadline: July 31, 2026** — Sui JSON-RPC fully deactivated.
> Migrate all RPC calls from `SuiJsonRpcClient` / raw JSON-RPC to `SuiGrpcClient` (recommended by Mysten).
> Also migrate `@mysten/dapp-kit` (v1.x) to `@mysten/dapp-kit-react` (v2.x) which natively supports gRPC.

**Audit Summary:**
- t2000 monorepo: 28 files across `packages/sdk` (11), `apps/server` (10), `apps/web-app` (11), `apps/web` (1), `packages/engine` (1)
- Audric repo: 9 files across API routes (5), providers (1), protocol-registry (1), hooks (2)
- Third-party: `@naviprotocol/lending@1.4.0` patch targets JSON-RPC paths
- Only existing gRPC usage: `apps/gateway/test/e2e/gateway.e2e.test.ts`

#### 5a: SDK Core Migration
- Replace `SuiJsonRpcClient` → `SuiGrpcClient` in `packages/sdk/src/utils/sui.ts`
- Update all 11 SDK source files that import the client
- Update `@naviprotocol/lending` patch for gRPC (or upgrade if newer version available)
- Run full test suite (283 tests), bump SDK version

#### 5b: Engine + Server Migration
- `packages/engine/src/sui-rpc.ts`: Replace raw JSON-RPC fetch → `SuiGrpcClient.getAllBalances()`
- `apps/server`: Update `lib/wallets.ts` + all 10 downstream files
- `apps/web/app/api/stats/route.ts`: swap client
- Add `@mysten/sui` as direct engine dependency
- Run all tests, bump engine version

#### 5c: Audric Frontend Migration
- Replace `@mysten/dapp-kit` (v1.x) → `@mysten/dapp-kit-react` (v2.x)
- Update `AppProviders.tsx` to `createDAppKit` with `SuiGrpcClient`
- Update `protocol-registry.ts`, all 5 API routes, `useZkLogin`, `useBalance`
- Full build + typecheck verification

#### 5d: Audric + Cleanup
- Update Audric frontend (separate repo) — same pattern as 5c
- Update gateway docs page example snippets
- Remove all `@mysten/sui/jsonRpc` imports
- Update `pnpm.overrides`, `@naviprotocol/lending` patch
- Update `CLAUDE.md` Sui Integration section (import paths)
- Final release + publish all packages

---

## Related Documents

| Document | What it covers |
|----------|---------------|
| `PRODUCT_FACTS.md` | Detailed SDK/CLI/MCP/engine technical reference (SSOT) |
| `CLI_UX_SPEC.md` | CLI output formatting, command signatures |
| `ARCHITECTURE.md` | Deep architecture: PTB flow, gas, adapters, security |
| `SECURITY.md` / `SECURITY_AUDIT.md` | Security model and audit |
| `spec/COMMERCE_V2.md` | Commerce/marketplace spec |
| `spec/MPP_GATEWAY_V2.md` | MPP gateway spec |
| `spec/SUI_PAYMENTS_HUB.md` | Payments hub spec |
| `spec/SERVICES_ROADMAP.md` | Services roadmap |
