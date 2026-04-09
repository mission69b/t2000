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

### Product catalog (6 products)

| Product | Integration | Status |
|---------|-------------|--------|
| **Savings** | NAVI MCP + thin tx builders | Live |
| **Pay** | MPP / t2000 gateway | Live |
| **Send** | Direct Sui transactions | Live |
| **Swap** | Cetus Aggregator V3 (20+ DEXs) | Live |
| **Credit** | NAVI MCP + thin tx builders | Live |
| **Receive** | Direct Sui transactions | Planned |

**Invest is REMOVED.** Do not add it back. Savings covers yield. When protocols release MCPs, expansion is a config change.

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

**One command releases all 4 packages** (`@t2000/sdk`, `@t2000/engine`, `@t2000/mcp`, `@t2000/cli`):

```bash
gh workflow run release.yml --field bump=patch   # patch | minor | major
```

This triggers the full pipeline:
1. **Release workflow** — bumps all package versions, commits, creates git tag, pushes
2. **Publish workflow** — triggered explicitly by Release (not by tag push — `GITHUB_TOKEN` pushes don't trigger downstream workflows, this is a GitHub Actions limitation by design)
3. Publish runs: CI (lint + typecheck + test) → npm publish → GitHub Release → Discord notification

**After npm release, update downstream repos:**
```bash
# In audric repo:
pnpm update @t2000/engine@latest @t2000/sdk@latest --filter web
git add -A && git commit -m "📦 build(web): upgrade @t2000/engine + sdk" && git push
# Vercel auto-deploys on push to main
```

**Key details:**
- Versions are kept in sync across all 4 packages (same bump applied to each)
- `continue-on-error: true` on publish steps — idempotent if a version already exists
- `workflow_dispatch` on publish.yml serves as backup trigger

---

## Engine (`@t2000/engine`)

Powers **Audric** — the conversational finance agent. Wraps `@t2000/sdk` in an LLM-driven loop.

### Import patterns

```ts
// Core
import { QueryEngine, AnthropicProvider, getDefaultTools } from '@t2000/engine';

// Tool building
import { buildTool, toolsToDefinitions, findTool } from '@t2000/engine';

// Orchestration
import { TxMutex, runTools } from '@t2000/engine';

// Streaming + sessions
import { serializeSSE, parseSSE, engineToSSE } from '@t2000/engine';
import { MemorySessionStore } from '@t2000/engine';

// Context + cost
import { estimateTokens, compactMessages, CostTracker } from '@t2000/engine';

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
  | { type: 'tool_start'; toolName: string; toolUseId: string; input: unknown }
  | { type: 'tool_result'; toolName: string; toolUseId: string; result: unknown; isError: boolean }
  | { type: 'pending_action'; action: PendingAction }
  | { type: 'turn_complete'; stopReason: StopReason }
  | { type: 'usage'; inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }
  | { type: 'error'; error: Error };
```

### Tool permission levels

- `auto` — read-only tools, execute without approval
- `confirm` — write tools, yield `pending_action` for client-side execution
- `explicit` — manual-only, never dispatched by LLM

### Built-in tools

Read (19): `balance_check`, `savings_info`, `health_check`, `rates_info`, `transaction_history`, `swap_quote`, `volo_stats`, `mpp_services`, `web_search`, `explain_tx`, `portfolio_analysis`, `protocol_deep_dive`, `defillama_yield_pools`, `defillama_protocol_info`, `defillama_token_prices`, `defillama_price_change`, `defillama_chain_tvl`, `defillama_protocol_fees`, `defillama_sui_protocols`
Write (11): `save_deposit` (USDC only), `withdraw`, `send_transfer`, `borrow`, `repay_debt`, `claim_rewards`, `pay_api`, `swap_execute`, `volo_stake`, `volo_unstake`, `save_contact`

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
