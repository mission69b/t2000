# CLAUDE.md

> This file is loaded every turn. It is the highest-leverage configuration for any AI assistant working on this codebase.

---

## Architecture — The Big Picture

### Three brands, three repos

```
t2000 (this repo)    → Infrastructure: CLI, SDK, MCP, engine, gateway, contracts
audric (separate)    → Consumer product: audric.ai website, app, Chrome extension
suimpp (separate)    → Protocol: suimpp.dev, @suimpp/mpp, @suimpp/discovery
```

### This repo structure

```
t2000/
├── apps/gateway     ← MPP API gateway (mpp.t2000.ai, 40+ services, 88 endpoints)
├── apps/server      ← Backend API
├── apps/web         ← t2000.ai marketing website
├── packages/cli     ← @t2000/cli (npm)
├── packages/sdk     ← @t2000/sdk (npm)
├── packages/engine  ← @t2000/engine (agent engine — QueryEngine, tools, MCP)
├── packages/mcp     ← @t2000/mcp (npm)
├── packages/contracts ← Sui Move smart contracts
├── t2000-skills/    ← Agent skill definitions
└── audric-roadmap.md ← Product roadmap + build tracker
```

### Two brand layers

**t2000** = infra. Names the underlying capabilities (engine, SDK, MCP, MPP gateway, contracts). Used in technical docs, package names, READMEs, dev-facing surfaces.

**Audric** = consumer. Names the surfaces a user touches. Always one of exactly **four products** (post-S.16 simplification): **Audric Passport, Audric Intelligence, Audric Pay, Audric Store**. **"Audric Finance" is retired** — its operations (save, swap, borrow, repay, withdraw) are now framed as outputs of Audric Intelligence's Agent Harness, gated by Audric Passport's tap-to-confirm.

#### The four products

| Audric product | What it is | t2000 layer |
|---|---|---|
| 🪪 **Audric Passport** | The trust layer. Identity (zkLogin via Google), non-custodial wallet on Sui, tap-to-confirm consent on every write, sponsored gas. Wraps every other product. | `@t2000/sdk` (wallet, signing) + Enoki (zkLogin, gas sponsorship) + `@mysten/sui` |
| 🧠 **Audric Intelligence** | The brain. Five systems orchestrate every money decision — Agent Harness (40 tools), Reasoning Engine (9 guards), Silent Profile, Chain Memory, AdviceLog. Save, swap, borrow, repay, withdraw all run through the harness. The moat. | `@t2000/engine` (QueryEngine + tools + reasoning + guards + skill recipes) |
| 💸 **Audric Pay** | The money primitive. Move money: free, global, instant (on Sui for now). Send USDC to anyone, payment links for businesses, invoices that settle in seconds. No bank, no borders, no fees. | `@t2000/sdk` Sui tx builders (direct USDC transfers, payment-link contract, invoice flows) |
| 🛒 **Audric Store** | Creator marketplace at `audric.ai/username`. Generate AI music, art, ebooks, list them, sell in USDC. 92% to creator. **Coming soon (Phase 5).** | `@t2000/sdk` + Walrus storage + payment links (built on Audric Pay primitives) |

#### Audric Passport — the trust layer (4 pillars)

> **Your passport to a new kind of finance.**

Every Audric action runs through Passport. It's the wallet itself.

| Pillar | Meaning |
|---|---|
| 🪪 **Identity** | Sign in with Google. Your Passport is a cryptographic wallet, created in 3 seconds. No seed phrase. Yours forever. (zkLogin + Enoki) |
| ✋ **You decide** | Audric never moves money on its own. Every save, send, swap, and borrow waits on your tap-to-confirm. |
| 🔐 **Sponsored gas** | We pay the network fees so you don't need SUI to transact. Your USDC stays your USDC. (Enoki sponsorship) |
| ⛓️ **Yours** | Non-custodial. We cannot move your money. Every transaction is on Sui mainnet, verifiable by anyone, forever. |

#### Audric Intelligence — the 5-system moat (the differentiator)

> **Not a chatbot. A financial agent.** Five systems work together to understand your money, reason about decisions, and get smarter over time. Every action still waits on your Passport tap-to-confirm.

| System | What it does | Implementation |
|---|---|---|
| 🎛️ **Agent Harness** | 40 tools, one agent. The runtime that manages money — balances, DeFi, analytics, payments — all orchestrated by a single conversation. Parallel reads, serial writes under a transaction mutex. | `@t2000/engine` `QueryEngine` + 40 tools (29 read / 11 write) |
| ⚡ **Reasoning Engine** | Thinks before it acts. Adaptive thinking effort per turn, complexity classifier, 7 YAML skill recipes, 9 safety guards across 3 priority tiers (Safety > Financial > UX), preflight input validation, prompt caching. | `classify-effort.ts`, `guards.ts`, `recipes/registry.ts`, extended thinking always-on |
| 🧠 **Silent Profile** | Knows your finances. Builds a private financial profile from chat history. Used silently to make answers more relevant — never surfaced as nudges. | `UserFinancialProfile` Prisma model + Claude inference cron + `buildProfileContext()` |
| 🔗 **Chain Memory** | Remembers what you do on-chain. Reads wallet history into structured facts the agent uses as context — recurring sends, idle balances, position changes. | 7 chain classifiers + `ChainFact` rows + `buildMemoryContext()` |
| 📓 **AdviceLog** | Remembers what it told you. Every recommendation is logged so the agent doesn't contradict itself across sessions. | `AdviceLog` Prisma model + `record_advice` audric-side tool + `buildAdviceContext()` (last 30 days hydrated each turn) |

**Naming rules (binding):**

1. **Audric Finance is retired.** Do not use it as a product name on any new surface. Its former operations (save, swap, borrow, repay, withdraw) are surfaced through Audric Intelligence's Agent Harness, gated by Audric Passport's tap-to-confirm. References to "Audric Finance" in old code/comments will be removed as touched.
2. **Never invent a 5th consumer product.** If something doesn't fit Passport / Intelligence / Pay / Store, it's either an operation inside one of them (lowercase verb) or it's infra (use a t2000 name).
3. **MPP / 41 AI services is NOT a product.** It's an internal capability (the MPP gateway) exposed via the `pay_api` engine tool — Audric uses it under the hood, same way it uses NAVI or Cetus. Do not brand it as Audric Pay. Audric Pay = money transfer between users.
4. **Audric Receive is not a product** — it's the receive-half of *Audric Pay*.
5. **Audric Passport is one of the four products** (the trust layer that wraps the other three). Document it as a peer to Intelligence/Pay/Store, not as a hidden foundation.
6. **Audric Intelligence has 5 named systems** — Agent Harness, Reasoning Engine, Silent Profile, Chain Memory, AdviceLog. Always reference by these names. They are the moat.
7. **Operations** stay lowercase verbs. Money ops (Intelligence-orchestrated): save, swap, borrow, repay, withdraw. Pay ops: send, request, invoice. The capitalised noun forms (Save, Send, Swap, Credit) are UI chip labels.
8. **Engine system prompts** may reference the four product names but should not invent additional ones.
9. **Marketing copy** leads with the operation ("save USDC", "send USDC"), invokes the product name only when grouping multiple operations or contrasting with another product.
10. **Invest is REMOVED.** Do not add it back. Savings (an Intelligence operation on USDC into NAVI) covers yield.

The canonical reference for these four products is the top of `audric-roadmap.md`.

### MCP-first DeFi integration

NAVI MCP (`https://open-api.naviprotocol.io/api/mcp`) handles all read operations. Writes use thin transaction builders via `@mysten/sui`. No protocol SDK dependencies needed.

**Do NOT import** `@naviprotocol/lending` or `@suilend/sdk` in new code. Use MCP for reads, direct Sui `Transaction` building for writes.

**Exception:** `@cetusprotocol/aggregator-sdk` is allowed for swap execution — multi-DEX routing across 20+ DEXs cannot be feasibly replaced by thin tx builders. All usage is isolated to `packages/sdk/src/protocols/cetus-swap.ts`.

---

## Critical Rules

1. **Never add Invest as a product.** Savings covers yield.
2. **Never import protocol SDKs for new features** (except `@cetusprotocol/aggregator-sdk` for swap routing). Use MCP for reads, thin tx builders for writes.
3. **Never rename @t2000/* packages.** t2000 is the infra brand. Audric is the consumer brand.
4. **Never fork claude-code.** Study patterns, reimplement in @t2000/engine.
5. **Always check PRODUCT_FACTS.md** before writing documentation or marketing copy.
6. **Always check CLI_UX_SPEC.md** before modifying CLI command output.
8. **Always use `token-registry.ts`** for token metadata (tiers, `COIN_REGISTRY`, `isTier1` / `isTier2` / `isSupported` / `getTier`). Never hardcode decimals or coin types.
7. **Push back** if a task violates simplicity or adds unnecessary complexity.

---

## Key Documents

| Document | What it covers | Read before |
|----------|---------------|-------------|
| `PRODUCT_FACTS.md` | Versions, fees, CLI syntax, SDK signatures | Documentation or marketing |
| `CLI_UX_SPEC.md` | Output primitives, formatting rules, display precision | CLI changes |
| `ARCHITECTURE.md` | Payment reporting, server registration flows | API or integration work |
| `audric-roadmap.md` | Product roadmap, feature specs, revenue model | Feature planning |
| `audric-build-tracker.md` | Execution status per phase and task | Status checks |
| `.cursor/rules/engineering-principles.mdc` | Scalability, single source of truth, trace-before-fix | **Every task** |
| `.cursor/rules/token-data-architecture.mdc` | Canonical token data sources (TOKEN_MAP, SUPPORTED_ASSETS, etc.) | Adding tokens, fixing decimal/display bugs |
| `.cursor/rules/audric-transaction-flow.mdc` | Sponsored tx vs SDK direct — which code path runs when | Any Audric transaction/receipt bug |

---

## Monorepo Tooling

- **Package manager:** pnpm (v10.6.2, pinned via `packageManager`)
- **Build orchestration:** Turbo (`turbo build`, `dev`, `lint`, `typecheck`)
- **Workspaces:** `packages/*` and `apps/*` (defined in `pnpm-workspace.yaml`)

### Common commands

```bash
pnpm dev                    # Start all dev servers
pnpm build                  # Build all packages
pnpm lint                   # Lint all packages
pnpm typecheck              # TypeScript check all packages
pnpm --filter @t2000/cli build   # Build specific package
pnpm --filter gateway dev        # Dev specific app
```

### Engine commands

```bash
pnpm --filter @t2000/engine build      # Build (tsup → ESM)
pnpm --filter @t2000/engine test       # Run tests (vitest)
pnpm --filter @t2000/engine typecheck  # TypeScript strict check
pnpm --filter @t2000/engine lint       # ESLint
```

### Release process (npm publish)

> **MANDATORY — always use this process. Never manually bump versions, push tags, or run `npm publish` locally.**

#### Step 1 — Trigger the Release workflow (one command)

> **Prerequisite:** `release.yml` requires a `RELEASE_TOKEN` secret in GitHub repo settings — a Personal Access Token with `contents: write` and branch protection bypass rights. Without it, the workflow's push to main will fail. If the secret is not configured, use the manual fallback below.

```bash
gh workflow run release.yml --field bump=patch   # patch | minor | major
```

**Manual fallback (if RELEASE_TOKEN not set):**
```bash
cd /Users/funkii/dev/t2000
npm --prefix packages/sdk version X.Y.Z --no-git-tag-version
npm --prefix packages/engine version X.Y.Z --no-git-tag-version
npm --prefix packages/cli version X.Y.Z --no-git-tag-version
npm --prefix packages/mcp version X.Y.Z --no-git-tag-version
git add packages/*/package.json
git commit -m "📦 build: vX.Y.Z"
git push origin main
git tag -a vX.Y.Z -m "vX.Y.Z — description"
git push origin vX.Y.Z
# publish.yml triggers automatically from the tag push
```

This runs `.github/workflows/release.yml`, which:
1. Bumps all 4 package versions together (`sdk`, `engine`, `cli`, `mcp`) to the same version
2. Commits `📦 build: vX.Y.Z` to main
3. Creates and pushes the `vX.Y.Z` annotated tag
4. Explicitly triggers `.github/workflows/publish.yml` via `workflow_dispatch`

#### Step 2 — Publish pipeline runs automatically

`.github/workflows/publish.yml` (triggered by Step 1):
1. **CI** — lint + typecheck + test + build all packages
2. **Publish** — `pnpm publish` for each of the 4 packages (`continue-on-error: true` — safe if version already exists)
3. **GitHub Release** — `gh release create vX.Y.Z --generate-notes`
4. **Discord** — posts release notification to `#releases` channel

#### Step 3 — Update audric (downstream)

```bash
# In audric repo after npm publish completes:
cd /Users/funkii/dev/audric/apps/web
pnpm add @t2000/sdk@latest @t2000/engine@latest
cd /Users/funkii/dev/audric
git add -A && git commit -m "📦 build(web): bump @t2000/sdk + @t2000/engine to vX.Y.Z" && git push
# Vercel auto-deploys on push to main
```

#### When to bump what

| Change | Bump |
|--------|------|
| New tool, method, or command | `minor` |
| Bug fix, type fix, test fix | `patch` |
| Breaking API change | `major` |

#### ⚠️ What NOT to do

- **Never** run `npm --prefix packages/X version Y` manually before pushing a tag
- **Never** push a `vX.Y.Z` tag by hand — let the release workflow do it
- **Never** run `pnpm publish` locally
- **Never** push multiple tags in the same session to fix failures — fix the code and re-run the workflow

**Key details:**
- All 4 packages are always at the same version number (e.g. `0.28.0`) — no drift
- `continue-on-error: true` on publish steps — idempotent if a version already exists
- `workflow_dispatch` on `publish.yml` serves as a manual fallback if needed

---

## Engine (`@t2000/engine`)

Powers **Audric** — the conversational finance agent. Wraps `@t2000/sdk` in an LLM-driven loop.

### Import patterns

```ts
// Core
import { QueryEngine, AnthropicProvider, getDefaultTools } from '@t2000/engine';

// Tool building
import { buildTool, toolsToDefinitions, findTool } from '@t2000/engine';

// Orchestration + tool budgeting
import { TxMutex, runTools, budgetToolResult } from '@t2000/engine';

// Streaming tool execution (early dispatch)
import { EarlyToolDispatcher } from '@t2000/engine';

// Streaming + sessions
import { serializeSSE, parseSSE, engineToSSE } from '@t2000/engine';
import { MemorySessionStore } from '@t2000/engine';

// Context + cost + microcompact
import { estimateTokens, compactMessages, CostTracker, microcompact } from '@t2000/engine';

// Granular permissions (USD-aware)
import {
  resolvePermissionTier, resolveUsdValue, toolNameToOperation,
  DEFAULT_PERMISSION_CONFIG, PERMISSION_PRESETS,
} from '@t2000/engine';
import type { PermissionRule, UserPermissionConfig } from '@t2000/engine';

// MCP client (consume external MCPs)
import { McpClientManager, NAVI_MCP_CONFIG } from '@t2000/engine';

// MCP server adapter (expose engine tools)
import { buildMcpTools, registerEngineTools } from '@t2000/engine';

// Token registry (shared with CLI/MCP — import from SDK)
import {
  isTier1,
  isTier2,
  isSupported,
  getTier,
  COIN_REGISTRY,
  TOKEN_MAP,
} from '@t2000/sdk';
```

### Engine event types

```ts
type EngineEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'thinking_done' }
  | { type: 'tool_start'; toolName: string; toolUseId: string; input: unknown }
  | { type: 'tool_result'; toolName: string; toolUseId: string; result: unknown; isError: boolean }
  | { type: 'pending_action'; action: PendingAction }
  | { type: 'canvas'; html: string }
  | { type: 'turn_complete'; stopReason: StopReason }
  | { type: 'usage'; inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }
  | { type: 'error'; error: Error };
```

### Tool permission levels

- `auto` — read-only tools, execute without approval
- `confirm` — write tools, yield `pending_action` for client-side execution
- `explicit` — manual-only, never dispatched by LLM

**Granular USD-aware permissions (B.4):** When `permissionConfig` + `priceCache` are set on `ToolContext`, write tool permission is resolved dynamically via `resolvePermissionTier(operation, amountUsd, config)`. Small amounts auto-execute; large amounts require confirmation. Three presets: `conservative`, `balanced`, `aggressive`.

### Tool result budgeting (B.2)

Tools can set `maxResultSizeChars` to cap output size. Results exceeding the limit are truncated with a hint: `[Truncated — N lines omitted. Call toolName with narrower parameters.]`. Custom `summarizeOnTruncate` callbacks supported.

### Streaming tool execution (B.1)

`EarlyToolDispatcher` dispatches read-only tools mid-stream (before `message_stop`). Tools with `isReadOnly && isConcurrencySafe` are fired as soon as their `tool_use` block completes. Write tools still go through the permission gate after stream ends. Results yield in original dispatch order.

### Microcompact (B.3)

`microcompact(messages)` deduplicates identical tool calls (same name + input) in conversation history, replacing repeated results with `[Same result as turn N]`. Runs as Phase -1 in `compactMessages` and every turn in `agentLoop`.

### Built-in tools

Read (29): `render_canvas`, `balance_check`, `savings_info`, `health_check`, `rates_info`, `transaction_history`, `swap_quote`, `volo_stats`, `mpp_services`, `web_search`, `explain_tx`, `portfolio_analysis`, `protocol_deep_dive`, `defillama_yield_pools`, `defillama_protocol_info`, `defillama_token_prices`, `defillama_price_change`, `defillama_chain_tvl`, `defillama_protocol_fees`, `defillama_sui_protocols`, `create_payment_link`, `list_payment_links`, `cancel_payment_link`, `create_invoice`, `list_invoices`, `cancel_invoice`, `spending_analytics`, `yield_summary`, `activity_summary`
Write (11): `save_deposit` (USDC only), `withdraw`, `send_transfer`, `borrow`, `repay_debt`, `claim_rewards`, `pay_api`, `swap_execute`, `volo_stake`, `volo_unstake`, `save_contact`

> **Removed in the April 2026 simplification (S.7):** `allowance_status`, `toggle_allowance`, `update_daily_limit`, `update_permissions`, `create_schedule`, `list_schedules`, `cancel_schedule`, `pattern_status`, `pause_pattern` — see `spec/SIMPLIFICATION_RATIONALE.md`. `record_advice` is an audric-side tool (not exported from `@t2000/engine`).

---

## Sui Integration

### Package imports (`@mysten/sui@2.x`)

```ts
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { MIST_PER_SUI, SUI_DECIMALS, isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
```

### v2 migration notes

- `SuiClient` → `SuiJsonRpcClient` (from `@mysten/sui/jsonRpc`)
- `getFullnodeUrl` → `getJsonRpcFullnodeUrl`
- Constructor: `new SuiJsonRpcClient({ url, network: 'mainnet' })`
- `pnpm.overrides` in root `package.json` forces `@mysten/sui@^2.6.0`

### Transaction patterns

- Use `Transaction` class for all on-chain operations
- Split coins: `tx.splitCoins(tx.gas, [amount])`
- Always transfer created objects to user
- `tx.object()` for shared objects, `tx.pure.type()` for primitives
- Simulate before signing, validate addresses with `isValidSuiAddress()`

### Constants

- `MIST_PER_SUI`: `1_000_000_000n`
- `MIN_DEPOSIT`: `1_000_000n` (1 USDC, 6 decimals)
- `BPS_DENOMINATOR`: `10_000n`
- `CLOCK_ID`: `'0x6'`
- USDC: `0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC`

---

## TypeScript Conventions

- Strict mode, avoid `any` — use `unknown` + type guards
- Components: `PascalCase.tsx`, named exports, destructured props
- Hooks: `useCamelCase`, return objects for multiple values
- Props: `interface FooProps`, types for unions/utilities
- Booleans: `is`, `has`, `should`, `can` prefix
- Event handlers: `handleEventName` or `onEventName` prop

---

## Next.js (apps/web)

- App Router: `layout.tsx` for shared UI, `loading.tsx` for Suspense, `error.tsx` for boundaries
- Server Components by default, `'use client'` only when needed
- Route groups `(name)` for organization without URL impact
- `generateMetadata` for dynamic page metadata

---

## Styling

- **Current apps:** Tailwind + shadcn/ui (dark theme)
- **Audric (new):** Agentic Design System — white/black, New York Large + Geist + Departure Mono
- Group utilities: layout → spacing → sizing → colors → effects
- `cn()` for conditional classes, shadcn components from `@/components/ui`

---

## Git Commits

```
emoji type(scope): subject
```

| Type | Emoji |
|------|-------|
| feat | ✨ |
| fix | 🐛 |
| docs | 📝 |
| style | 🎨 |
| refactor | ♻️ |
| perf | ⚡ |
| test | ✅ |
| build | 📦 |
| chore | 🔧 |

- Subject lowercase, ALWAYS use emoji
- Do NOT add "Generated with Claude"
- Scopes: `sdk`, `mcp`, `cli`, `web`, `gateway`, `engine`, `contracts`

---

## Security

- Validate amounts before transaction building
- Validate addresses with `isValidSuiAddress()` before use
- Simulate transactions before signing
- Show confirmation modals for high-value actions
- Fetch fresh data before critical transactions

---

## Links

| Resource | URL |
|----------|-----|
| t2000 (infra) | `t2000.ai` |
| Audric (consumer) | `audric.ai` |
| suimpp (protocol) | `suimpp.dev` |
| MPP Gateway | `mpp.t2000.ai` |
| GitHub | `github.com/mission69b/t2000` |
| npm CLI | `npmjs.com/package/@t2000/cli` |
| NAVI MCP | `open-api.naviprotocol.io/api/mcp` |

---

## Ship Checklist

When shipping a feature, update these files:

- [ ] SDK implementation + tests (`packages/sdk/src/`)
- [ ] CLI command + tests (`packages/cli/src/commands/`)
- [ ] MCP tool/prompt + tests (`packages/mcp/src/`)
- [ ] Agent Skill (`t2000-skills/skills/`)
- [ ] CLI UX spec (`CLI_UX_SPEC.md`)
- [ ] Product facts (`PRODUCT_FACTS.md`)
- [ ] Root README (`README.md`)
- [ ] Package READMEs (`packages/*/README.md`)
- [ ] Version bump + build all packages
