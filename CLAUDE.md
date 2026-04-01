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
├── apps/web-app     ← Legacy consumer app (being replaced by audric.ai)
├── packages/cli     ← @t2000/cli (npm)
├── packages/sdk     ← @t2000/sdk (npm)
├── packages/engine  ← @t2000/engine (agent engine — QueryEngine, tools, MCP)
├── packages/mcp     ← @t2000/mcp (npm)
├── packages/contracts ← Sui Move smart contracts
├── t2000-skills/    ← Agent skill definitions
└── spec/            ← Architecture specs, roadmaps, design docs
```

### Product catalog (5 products, NOT 6)

| Product | Integration | Status |
|---------|-------------|--------|
| **Savings** | NAVI MCP + thin tx builders | Live |
| **Pay** | MPP / t2000 gateway | Live |
| **Send** | Direct Sui transactions | Live |
| **Credit** | NAVI MCP + thin tx builders | Live |
| **Receive** | Direct Sui transactions | Planned |

**Invest and Swap are REMOVED.** Do not add them back. Savings covers yield. Swap is a utility within deposit flows, not a product. When protocols release MCPs, expansion is a config change.

### MCP-first DeFi integration

NAVI MCP (`https://open-api.naviprotocol.io/api/mcp`) handles all read operations. Writes use thin transaction builders via `@mysten/sui`. No protocol SDK dependencies needed.

**Do NOT import** `@naviprotocol/lending`, `@suilend/sdk`, or `@cetusprotocol/aggregator-sdk` in new code. Use MCP for reads, direct Sui `Transaction` building for writes.

---

## Critical Rules

1. **Never add Invest or Swap as products.** Savings covers yield. Swap is a utility.
2. **Never import protocol SDKs for new features.** Use MCP for reads, thin tx builders for writes.
3. **Never rename @t2000/* packages.** t2000 is the infra brand. Audric is the consumer brand.
4. **Never fork claude-code.** Study patterns, reimplement in @t2000/engine.
5. **Always check PRODUCT_FACTS.md** before writing documentation or marketing copy.
6. **Always check CLI_UX_SPEC.md** before modifying CLI command output.
7. **Push back** if a task violates simplicity or adds unnecessary complexity.

---

## Key Documents

| Document | What it covers | Read before |
|----------|---------------|-------------|
| `BRAND.md` | Two-brand strategy, positioning, design system, product catalog | Any branding/messaging work |
| `PRODUCT_FACTS.md` | Versions, fees, CLI syntax, SDK signatures | Documentation or marketing |
| `CLI_UX_SPEC.md` | Output primitives, formatting rules, display precision | CLI changes |
| `spec/CLAUDE_CODE_LEVERAGE.md` | Engine patterns, financial tools, MCP integration, repo separation | Engine or tool work |
| `ARCHITECTURE.md` | Payment reporting, server registration flows | API or integration work |

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
import { serializeSSE, parseSSE, PermissionBridge, engineToSSE } from '@t2000/engine';
import { MemorySessionStore } from '@t2000/engine';

// Context + cost
import { estimateTokens, compactMessages, CostTracker } from '@t2000/engine';

// MCP client (consume external MCPs)
import { McpClientManager, NAVI_MCP_CONFIG } from '@t2000/engine';

// MCP server adapter (expose engine tools)
import { buildMcpTools, registerEngineTools } from '@t2000/engine';
```

### Engine event types

```ts
type EngineEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; toolName: string; toolUseId: string; input: unknown }
  | { type: 'tool_result'; toolName: string; toolUseId: string; result: unknown; isError: boolean }
  | { type: 'permission_request'; toolName: string; toolUseId: string; input: unknown; description: string; resolve: (approved: boolean) => void }
  | { type: 'turn_complete'; stopReason: StopReason }
  | { type: 'usage'; inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }
  | { type: 'error'; error: Error };
```

### Tool permission levels

- `auto` — read-only tools, execute without approval
- `confirm` — write tools, yield `permission_request` before execution
- `explicit` — manual-only, never dispatched by LLM

### Built-in tools

Read (5): `balance_check`, `savings_info`, `health_check`, `rates_info`, `transaction_history`
Write (7): `save_deposit`, `withdraw`, `send_transfer`, `borrow`, `repay_debt`, `claim_rewards`, `pay_api`

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

## Next.js (apps/web, apps/web-app)

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
