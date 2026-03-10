# CLAUDE.md - Frontend

## Single Source of Truth

**Before writing or editing ANY documentation** (READMEs, docs page, skill files, marketing materials, roadmap), **read `PRODUCT_FACTS.md` first**. All product facts — versions, fees, CLI syntax, SDK signatures, output formats, error codes — must match that file. When a product fact changes, update `PRODUCT_FACTS.md` first, then propagate to all other files.

**Before modifying ANY CLI command output**, **read `CLI_UX_SPEC.md` first**. It defines output primitives, formatting rules, dollar/APY precision, header styles, and the exact output format for every command. All CLI output must match that spec.

---

## Next.js

### Tool Calling

- `npm run dev` starts development server (use `--turbo` for speed)
- `npm run build` creates production build
- `npm run lint` runs ESLint
- `npm run typecheck` runs TypeScript compiler check

### App Router Conventions

- Use `layout.tsx` for shared UI (providers, nav, footer)
- Use `loading.tsx` for Suspense fallbacks, `error.tsx` for error boundaries
- Prefer Server Components by default, add `'use client'` only when needed
- Use route groups `(name)` to organize without affecting URL
- Use `generateMetadata` for dynamic page metadata

### File Naming

- Components: `PascalCase.tsx`
- Utilities/hooks: `camelCase.ts`
- Constants: `SCREAMING_SNAKE_CASE` for values

---

## React & TypeScript

### Component Patterns

- Use function components with named exports
- Destructure props in function signature
- Suffix prop interfaces with `Props`
- Use `interface` for props, `type` for unions/utilities

### Hooks

- Prefix custom hooks with `use`
- Return objects for multiple values
- Use `useCallback` for handlers passed to children
- Use `useMemo` for expensive computations

### TypeScript

- Enable strict mode, avoid `any`
- Use `unknown` and narrow with type guards
- Define return types explicitly for public functions
- Prefer discriminated unions over optional properties for state

### Naming

- Components: `PascalCase`
- Hooks: `useCamelCase`
- Event handlers: `handleEventName` or `onEventName` prop
- Booleans: `is`, `has`, `should`, `can` prefix

---

## TanStack Query

### Query Keys

- Use factory pattern with nested objects
- Include all dependencies in key array
- Pattern: `queryKeys.domain.action(params)`

### Queries

- Wrap `useQuery` in custom hooks for reusability
- Set appropriate `staleTime` (30s for most, 60s for stats)
- Use `enabled` option for conditional fetching

### Mutations

- Use `useMutation` for all state changes
- Invalidate related queries on success
- Handle errors with toast notifications

### Polling

- Use `refetchInterval` for live data (rewards: 30s, health: 30s)
- Set `refetchIntervalInBackground: false`

---

## Sui Integration

### Package Imports (`@mysten/sui@2.x`)

```ts
// Client & queries (v2: SuiJsonRpcClient from /jsonRpc, NOT SuiClient from /client)
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

// Transaction building
import { Transaction } from '@mysten/sui/transactions';

// BCS encoding/decoding (for devInspect results, on-chain data parsing)
import { bcs } from '@mysten/sui/bcs';

// Utilities (MIST_PER_SUI = 1e9, SUI_DECIMALS = 9)
import {
  MIST_PER_SUI,
  SUI_DECIMALS,
  isValidSuiAddress,
  normalizeSuiAddress,
} from '@mysten/sui/utils';

// dApp Kit - wallet & hooks
import {
  ConnectButton,
  createNetworkConfig,
  SuiClientProvider,
  WalletProvider,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
  useSuiClientQuery,
} from '@mysten/dapp-kit';
```

### v2 Migration Notes

- `SuiClient` → `SuiJsonRpcClient` (import from `@mysten/sui/jsonRpc`)
- `getFullnodeUrl` → `getJsonRpcFullnodeUrl`
- Constructor requires `network` parameter: `new SuiJsonRpcClient({ url, network: 'mainnet' })`
- Protocol integrations (NAVI, Suilend) are **contract-first** — no external SDK deps
- Cetus aggregator SDK bundles its own v1 internally; use `as never` cast for type bridge

### Providers

- Wrap app: `QueryClientProvider` > `SuiClientProvider` > `WalletProvider`
- Import `@mysten/dapp-kit/dist/index.css` for wallet UI styles
- Use `createNetworkConfig` for testnet/mainnet switching
- Set `autoConnect` on `WalletProvider` for returning users

### Transaction Building

- Use `Transaction` class
- Split coins from gas: `tx.splitCoins(tx.gas, [amount])`
- Always transfer created objects to user
- Use `tx.object()` for shared objects, `tx.pure.type()` for primitives

### Transaction Execution

- Use `useSignAndExecuteTransaction`
- Default return is only `digest` + `effects`
- For `showObjectChanges`/`showRawEffects`, pass custom `execute` function
- Call `client.waitForTransaction({ digest })` after success
- Invalidate queries after transaction confirms

### RPC Hooks

- `useSuiClientQuery(method, params)` - single RPC call, wraps `useQuery`
- `useSuiClientQueries` - multiple queries with combining
- `useSuiClientInfiniteQuery` - paginated queries
- Pass React Query options as third argument (staleTime, enabled, etc.)

### Object Parsing

- Move `u64`/`u128` arrive as strings - convert to `bigint`
- Check `content.dataType === 'moveObject'` before accessing fields
- Access nested fields via `content.fields`

### Address Utilities

- `isValidSuiAddress(addr)` - validate format
- `normalizeSuiAddress(addr)` - normalize (lowercase, 0x prefix)
- SDK `formatAddress` normalizes but does NOT truncate
- For display truncation (`0x1234...abcd`), use custom utility

---

## Styling

### Tailwind Conventions

- Use utilities directly, avoid custom CSS
- Group: layout → spacing → sizing → colors → effects
- Use `cn()` helper for conditional classes

### shadcn/ui

- Import from `@/components/ui`
- Don't modify generated components - wrap them instead
- Use composition over configuration

---

## Constants

### Key Values

- `MIST_PER_SUI`: `1_000_000_000n`
- `MIN_DEPOSIT`: `1_000_000n` (1 USDC)
- `BPS_DENOMINATOR`: `10_000n`
- `PRECISION`: `1_000_000_000_000_000_000n` (10^18, for reward math - matches contract)
- `CLOCK_ID`: `'0x6'`
- `STABLE_ASSETS`: `['USDC', 'USDT', 'USDe', 'USDsui']`

### Stablecoin Coin Types

- **USDC**: `0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC`
- **suiUSDT**: `0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT`
- **suiUSDe**: `0x41d587e5336f1c86cad50d38a7136db99333bb9bda91cea4ba69115defeb1402::sui_usde::SUI_USDE`
- **USDsui**: `0x44f838219cf67b058f3b37907b655f226153c18e33dfcd0da559a844fea9b1c1::usdsui::USDSUI`

All stablecoins use 6 decimals. All are supported on NAVI and Suilend.

### Rebalance

- `agent.rebalance({ dryRun: true })` — preview yield optimization plan
- `agent.rebalance()` — execute: withdraw → swap (if cross-asset) → deposit
- `agent.rebalance({ minYieldDiff: 1.0, maxBreakEven: 14 })` — custom thresholds
- CLI: `t2000 rebalance --dry-run`, `t2000 rebalance --yes`
- Safety: refuses if health factor < 1.5, skips if break-even > 30 days

---

## Environment Variables

### Required for Production

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | NeonDB connection string | `postgres://...` |
| `NEXT_PUBLIC_SUI_NETWORK` | Sui network (`testnet` or `mainnet`) | `testnet` |
| `CRON_SECRET` | Secret for cron job authorization |

### Optional

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SITE_URL` | Site URL for OG images |

---

## Error Handling

### Move Errors

Map abort codes to user messages:
- `EPAUSED` → "Protocol is temporarily paused"

### Wallet Errors

- "User rejected" → "Transaction cancelled"
- "Insufficient" → "Insufficient balance"

---

## Formatting Utilities

### Display Rules

- MIST to SUI: divide by `MIST_PER_SUI` (1e9) or use `SUI_DECIMALS` (9)
- Addresses: custom truncate util for `0x1234...abcd` (SDK doesn't truncate)
- Percentages from BPS: divide by 100
- Large numbers: use `K`, `M` suffixes
- Timestamps: relative time ("2h ago") with absolute on hover

---

## Git Commits

### Format

```
emoji type(scope): subject
```

### Types

- `✨ feat` - New feature
- `🐛 fix` - Bug fix
- `📝 docs` - Documentation
- `🎨 style` - Code style
- `♻️ refactor` - Refactoring
- `⚡ perf` - Performance
- `✅ test` - Tests
- `📦 build` - Dependencies
- `🔧 chore` - Other

### Rules

- Subject lowercase
- ALWAYS use emoji
- Do NOT add "Generated with Claude"
- Scopes: `listing`, `marketplace`, `loans`, `wallet`, `api`

---

## Security

- Validate amounts before transaction building
- Validate addresses with `isValidSuiAddress()` before use
- Simulate transactions before signing
- Show confirmation modals for high-value actions
- Fetch fresh data before critical transactions

---

## Workflow

- Make one logical change at a time
- Run `npm run lint && npm run typecheck` after changes
- Prefer small, focused commits
- Never mix refactoring with feature changes
- Test in browser before committing UI changes
