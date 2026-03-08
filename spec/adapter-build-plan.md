# Adapter Architecture — Build Plan

**Spec:** `spec/t2000-plugin-architecture.md`
**Goal:** Refactor hardcoded NAVI/Cetus into a reusable adapter system. Suilend can raise a PR to add their adapter using NAVI as reference.

**Status:** This plan has been executed. This document reflects the final shipped state.

---

## Constraints

- **Zero breaking changes** to the public SDK API (`T2000.save()`, `T2000.borrow()`, etc.)
- **Zero breaking changes** to the CLI commands
- **All existing tests must pass** after refactor
- **NAVI adapter must produce identical PTBs** to the current code
- Fee collection stays in t2000 core, not in adapters
- Adapters are pure PTB builders — t2000 handles wallet, gas, signing, execution

## Key Design Decisions

| Question | Decision |
|----------|----------|
| Cross-protocol `withdraw all` | Query all adapters, withdraw from wherever positions are. Sequential, not proportional. |
| Health factor display | Show separately per protocol. Never combine — they're independent. |
| Protocol-specific features (rewards) | NOT in core interface. Extension methods on adapter class. |
| Arbitrary PTB composition | No for MVP. Each command hits one protocol. |
| Obligation caching (Suilend) | Query fresh every time. ~100ms is negligible vs stale data risk. |
| Multi-asset collateral | No for MVP. Stables-only. Cross-asset is "investment account" territory. |
| Suilend initial scope | **Save + withdraw only.** Borrow/repay deferred to Phase 10 (multi-stable). |

---

## File Structure (final state)

```
packages/sdk/src/
├── adapters/
│   ├── types.ts              # Interfaces: LendingAdapter, SwapAdapter, AdapterTxResult
│   ├── registry.ts           # ProtocolRegistry: registration, routing, rate comparison
│   ├── navi.ts               # NaviAdapter implements LendingAdapter (wraps protocols/navi.ts)
│   ├── cetus.ts              # CetusAdapter implements SwapAdapter (wraps protocols/cetus.ts)
│   ├── suilend.ts            # SuilendAdapter implements LendingAdapter (save + withdraw, contract-first, no external SDK)
│   ├── index.ts              # Barrel: exports interfaces, registry, built-in adapters
│   ├── compliance.test.ts    # Reusable adapter compliance test suite (25 checks)
│   ├── registry.test.ts      # Registry routing/selection tests (13 tests)
│   ├── navi.test.ts          # NaviAdapter delegation tests (10 tests)
│   ├── cetus.test.ts         # CetusAdapter delegation tests (5 tests)
│   └── suilend.test.ts       # SuilendAdapter unit tests (25 tests)
├── protocols/
│   ├── navi.ts               # Unchanged — internal implementation (NaviAdapter wraps this)
│   ├── cetus.ts              # Aggregator V3 via @cetusprotocol/aggregator-sdk (CetusAdapter wraps this)
│   ├── cetus.test.ts         # Protocol-level aggregator tests (24 tests)
│   └── protocolFee.ts        # Unchanged — addCollectFeeToTx stays here
├── t2000.ts                  # Updated: uses ProtocolRegistry internally
└── index.ts                  # Updated: exports adapter types
```

---

## Phase 1: Adapter Interfaces

**Files:** `packages/sdk/src/adapters/types.ts`

Define the contracts that all adapters implement.

### 1.1 — Core types

```typescript
export type AdapterCapability = 'save' | 'withdraw' | 'borrow' | 'repay' | 'swap';

export interface AdapterTxResult {
  tx: Transaction;
  /** Coin ref within the PTB that fees should be collected from. 
   *  Undefined = no fee collection for this operation. */
  feeCoin?: TransactionObjectArgument;
  /** Pass-through metadata (e.g. effectiveAmount for withdraw) */
  meta?: Record<string, unknown>;
}
```

### 1.2 — LendingAdapter interface

```typescript
export interface LendingAdapter {
  readonly id: string;           // 'navi', 'suilend', 'scallop'
  readonly name: string;         // 'NAVI Protocol'
  readonly version: string;      // '1.0.0'
  readonly capabilities: readonly AdapterCapability[];
  readonly supportedAssets: readonly string[];
  readonly supportsSameAssetBorrow: boolean;

  init(client: SuiJsonRpcClient): Promise<void>;

  getRates(asset: string): Promise<LendingRates>;
  getPositions(address: string): Promise<AdapterPositions>;
  getHealth(address: string): Promise<HealthInfo>;

  buildSaveTx(address: string, amount: number, asset: string): Promise<AdapterTxResult>;
  buildWithdrawTx(address: string, amount: number, asset: string): Promise<AdapterTxResult>;
  buildBorrowTx(address: string, amount: number, asset: string): Promise<AdapterTxResult>;
  buildRepayTx(address: string, amount: number, asset: string): Promise<AdapterTxResult>;

  maxWithdraw(address: string, asset: string): Promise<{ maxAmount: number; healthFactorAfter: number; currentHF: number }>;
  maxBorrow(address: string, asset: string): Promise<{ maxAmount: number; healthFactorAfter: number; currentHF: number }>;
}
```

### 1.3 — SwapAdapter interface

```typescript
export interface SwapAdapter {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly capabilities: readonly AdapterCapability[];

  init(client: SuiJsonRpcClient): Promise<void>;

  getQuote(from: string, to: string, amount: number): Promise<SwapQuote>;
  buildSwapTx(address: string, from: string, to: string, amount: number, maxSlippageBps?: number): Promise<AdapterTxResult & { estimatedOut: number; toDecimals: number }>;
  getSupportedPairs(): Array<{ from: string; to: string }>;
  getPoolPrice(): Promise<number>;
}
```

### 1.4 — Supporting types

```typescript
export interface LendingRates {
  asset: string;
  saveApy: number;
  borrowApy: number;
}

export interface AdapterPositions {
  supplies: Array<{ asset: string; amount: number; apy: number }>;
  borrows: Array<{ asset: string; amount: number; apy: number }>;
}

export interface HealthInfo {
  healthFactor: number;
  supplied: number;
  borrowed: number;
  maxBorrow: number;
  liquidationThreshold: number;
}

export interface SwapQuote {
  expectedOutput: number;
  priceImpact: number;
  poolPrice: number;
}
```

### Design decision: Fee collection

The adapter handles fee collection internally by importing `addCollectFeeToTx` from `@t2000/sdk`. The adapter knows the correct ordering (fee before deposit for save, fee after borrow for borrow). Core passes a `collectFee: boolean` option:

```typescript
buildSaveTx(address: string, amount: number, asset: string, options?: { collectFee?: boolean }): Promise<AdapterTxResult>;
buildBorrowTx(address: string, amount: number, asset: string, options?: { collectFee?: boolean }): Promise<AdapterTxResult>;
```

---

## Phase 2: Protocol Registry

**Files:** `packages/sdk/src/adapters/registry.ts`

### 2.1 — Registry class

```typescript
export class ProtocolRegistry {
  registerLending(adapter: LendingAdapter): void;
  registerSwap(adapter: SwapAdapter): void;

  // Routing
  bestSaveRate(asset: string): Promise<{ adapter: LendingAdapter; rate: LendingRates }>;
  bestBorrowRate(asset: string): Promise<{ adapter: LendingAdapter; rate: LendingRates }>;
  bestSwapQuote(from: string, to: string, amount: number): Promise<{ adapter: SwapAdapter; quote: SwapQuote }>;

  // Multi-protocol views
  allRates(asset: string): Promise<Array<{ protocol: string; rates: LendingRates }>>;
  allPositions(address: string): Promise<Array<{ protocol: string; positions: AdapterPositions }>>;

  // Direct access
  getLending(id: string): LendingAdapter | undefined;
  getSwap(id: string): SwapAdapter | undefined;
  listLending(): LendingAdapter[];
  listSwap(): SwapAdapter[];
}
```

### 2.2 — Routing rules

- `bestSaveRate`: highest `saveApy` across all lending adapters that support the asset
- `bestBorrowRate`: lowest `borrowApy` across all lending adapters
- `bestSwapQuote`: highest `expectedOutput` across all swap adapters
- If user specifies `--protocol navi`, bypass routing and use that adapter directly

---

## Phase 3: NaviAdapter (reference implementation)

**Files:** `packages/sdk/src/adapters/navi.ts`

Wraps existing `protocols/navi.ts` functions. The internal implementation stays unchanged — the adapter is a thin class wrapper.

### 3.1 — Implementation

```typescript
import * as naviProtocol from '../protocols/navi.js';

export class NaviAdapter implements LendingAdapter {
  readonly id = 'navi';
  readonly name = 'NAVI Protocol';
  readonly version = '1.0.0';
  readonly capabilities = ['save', 'withdraw', 'borrow', 'repay'] as const;
  readonly supportedAssets = ['USDC'] as const;
  readonly supportsSameAssetBorrow = true;

  private client!: SuiJsonRpcClient;

  async init(client: SuiJsonRpcClient) { this.client = client; }

  async getRates(asset: string): Promise<LendingRates> {
    const rates = await naviProtocol.getRates(this.client);
    return { asset, saveApy: rates.USDC.saveApy, borrowApy: rates.USDC.borrowApy };
  }

  async buildSaveTx(address: string, amount: number, _asset: string, options?: { collectFee?: boolean }) {
    const tx = await naviProtocol.buildSaveTx(this.client, address, amount, options);
    return { tx };
  }

  // ... each method delegates to naviProtocol.*
}
```

### 3.2 — Key mapping

| NaviAdapter method | Delegates to |
|---|---|
| `getRates(asset)` | `naviProtocol.getRates(client)` |
| `getPositions(address)` | `naviProtocol.getPositions(client, address)` |
| `getHealth(address)` | `naviProtocol.getHealthFactor(client, address)` |
| `buildSaveTx(...)` | `naviProtocol.buildSaveTx(client, address, amount, options)` |
| `buildWithdrawTx(...)` | `naviProtocol.buildWithdrawTx(client, address, amount)` |
| `buildBorrowTx(...)` | `naviProtocol.buildBorrowTx(client, address, amount, options)` |
| `buildRepayTx(...)` | `naviProtocol.buildRepayTx(client, address, amount)` |
| `maxWithdraw(...)` | `naviProtocol.maxWithdrawAmount(client, address)` |
| `maxBorrow(...)` | `naviProtocol.maxBorrowAmount(client, address)` |

### 3.3 — Keypair issue — ✅ Resolved

All NAVI functions now accept `address: string` instead of `keypair`. The adapter interface uses only `address`; no private keys are required.

---

## Phase 4: CetusAdapter

**Files:** `packages/sdk/src/adapters/cetus.ts`

Thin wrapper over `protocols/cetus.ts`, which uses `@cetusprotocol/aggregator-sdk` (Aggregator V3) to route swaps through 20+ DEXes for best execution.

```typescript
export class CetusAdapter implements SwapAdapter {
  readonly id = 'cetus';
  readonly name = 'Cetus';
  readonly version = '1.0.0';
  readonly capabilities: readonly AdapterCapability[] = ['swap'];

  private client!: SuiJsonRpcClient;

  async init(client: SuiJsonRpcClient): Promise<void> { this.client = client; }
  initSync(client: SuiJsonRpcClient): void { this.client = client; }

  async getQuote(from, to, amount) // → delegates to cetusProtocol.getSwapQuote()
  async buildSwapTx(address, from, to, amount, maxSlippageBps?) // → delegates to cetusProtocol.buildSwapTx()
  getSupportedPairs() // → [{ from: 'USDC', to: 'SUI' }, { from: 'SUI', to: 'USDC' }]
  async getPoolPrice() // → delegates to cetusProtocol.getPoolPrice()
}
```

**Protocol layer** (`protocols/cetus.ts`): Uses `AggregatorClient.findRouters()` + `fastRouterSwap()` from `@cetusprotocol/aggregator-sdk`. `getPoolPrice()` reads directly from the on-chain Cetus USDC/SUI pool object via RPC (no SDK dependency).

---

## Phase 5: Wire Registry into t2000.ts

### 5.1 — Initialize registry with built-in adapters (synchronous, lazy)

The registry is initialized synchronously in the `T2000` constructor using `initSync()`, keeping `T2000.fromPrivateKey()` and `T2000.create()` non-async (zero breaking changes):

```typescript
private static createDefaultRegistry(client: SuiJsonRpcClient): ProtocolRegistry {
  const registry = new ProtocolRegistry();
  const navi = new NaviAdapter();
  navi.initSync(client);
  registry.registerLending(navi);

  const cetus = new CetusAdapter();
  cetus.initSync(client);
  registry.registerSwap(cetus);

  return registry;
}
```

### 5.2 — Add `registerAdapter()` public method

```typescript
async registerAdapter(adapter: LendingAdapter | SwapAdapter): Promise<void> {
  await adapter.init(this.client);
  if ('buildSaveTx' in adapter) this.registry.registerLending(adapter);
  if ('buildSwapTx' in adapter) this.registry.registerSwap(adapter);
}
```

### 5.3 — Internal routing via `resolveLending()`

```typescript
private async resolveLending(protocol: string | undefined, asset: string): Promise<LendingAdapter> {
  if (protocol) {
    const adapter = this.registry.getLending(protocol);
    if (!adapter) throw new T2000Error(`Unknown protocol: ${protocol}`, 'PROTOCOL_UNAVAILABLE');
    return adapter;
  }
  const best = await this.registry.bestSaveRate(asset);
  return best.adapter;
}
```

### 5.4 — Backward compatibility

- `save({ amount: 100 })` → routes to best APY (currently only NAVI, so identical behavior)
- `save({ amount: 100, protocol: 'navi' })` → forces NAVI
- `save({ amount: 100, protocol: 'suilend' })` → forces Suilend (after registering)
- No breaking changes to existing callers

---

## Phase 6: SuilendAdapter (Fully Implemented)

**Files:** `packages/sdk/src/adapters/suilend.ts`

The SuilendAdapter is **fully implemented** with save + withdraw capabilities. Borrow/repay are deferred to Phase 10 (multi-stable support).

### Key implementation details (contract-first):

1. **No external SDK**: Uses direct Move contract calls — no `@suilend/sdk` or other external SDK dependency.

2. **Reserve data**: Reads reserves via RPC (`getObject` on reserve objects). Parses reserve fields for utilization, rates, available/borrowed amounts.

3. **Package resolution**: Resolves Suilend package ID via UpgradeCap lookup when needed.

4. **Transaction building**: Builds Move calls directly using the `Transaction` class — deposit, withdraw, obligation creation via `tx.moveCall()`.

5. **cToken ratio**: Converts between cTokens (deposit receipts) and underlying asset amounts using `cTokenRatio = (availableAmount + borrowedAmount) / cTokenSupply`.

6. **Amounts**: Converts human-readable amounts to raw integer amounts using reserve mint decimals.

```typescript
export class SuilendAdapter implements LendingAdapter {
  readonly id = 'suilend';
  readonly name = 'Suilend';
  readonly version = '1.0.0';
  readonly capabilities: readonly AdapterCapability[] = ['save', 'withdraw'];
  readonly supportedAssets: readonly string[] = ['USDC'];
  readonly supportsSameAssetBorrow = false;

  // init(client) — stores client reference
  // initSync(client) — for lazy registry setup
  // getRates(asset) — reads reserves via RPC, interpolates APY from utilization data
  // getPositions(address) — reads obligation deposits/borrows via RPC
  // getHealth(address) — computes health factor from obligation
  // buildSaveTx(address, amount, asset, options?) — handles obligation creation + deposit via direct Move calls
  // buildWithdrawTx(address, amount, asset) — returns { tx, effectiveAmount }
  // maxWithdraw(address, asset) — returns { maxAmount, healthFactorAfter, currentHF }
  // buildBorrowTx/buildRepayTx/maxBorrow — throw "deferred to Phase 10"
}
```

### CONTRIBUTING-ADAPTERS.md

Located at `packages/sdk/CONTRIBUTING-ADAPTERS.md`, guides protocol teams through:
1. Implementing `LendingAdapter` or `SwapAdapter`
2. Fee collection integration (`addCollectFeeToTx`)
3. Running tests and CI compliance checks
4. Raising a PR (triggers `Adapter Compliance` CI job)
5. Reference: `NaviAdapter` as the working example

---

## Phase 7: Exports

### 7.1 — Barrel file: `packages/sdk/src/adapters/index.ts`

```typescript
export type { LendingAdapter, SwapAdapter, AdapterTxResult, LendingRates, ProtocolDescriptor, ... } from './types.js';
export { ProtocolRegistry } from './registry.js';
export { NaviAdapter, descriptor as naviDescriptor } from './navi.js';
export { CetusAdapter, descriptor as cetusDescriptor } from './cetus.js';
export { SuilendAdapter, descriptor as suilendDescriptor } from './suilend.js';
export { descriptor as sentinelDescriptor } from '../protocols/sentinel.js';
export { allDescriptors } from './index.js';
```

### 7.2 — SDK index.ts update

```typescript
// Add to existing exports
export * from './adapters/index.js';
```

### 7.3 — Package.json sub-path export (optional, for cleaner imports)

```json
"exports": {
  ".": { ... },
  "./adapters": {
    "types": "./dist/adapters/index.d.ts",
    "import": "./dist/adapters/index.js"
  }
}
```

### 7.4 — tsup.config.ts — add adapters entry point

```typescript
entry: ['src/index.ts', 'src/adapters/index.ts'],
```

---

## Phase 8: Tests

**Total: 19 test files, 262 tests, all passing.**

### 8.1 — Adapter compliance test suite (`adapters/compliance.test.ts`) — 49 tests

Reusable test suite that validates any adapter against its interface contract. Checks:
- Metadata properties (id, name, version, capabilities)
- All required methods exist and are callable
- Return type shapes match the interface
- Runs against NaviAdapter, CetusAdapter, SuilendAdapter
- **ProtocolDescriptor compliance**: validates descriptor structure (id, name, packages, actionMap) for all protocol descriptors

### 8.2 — NaviAdapter tests (`adapters/navi.test.ts`) — 10 tests

Verifies delegation to `protocols/navi.ts`: metadata, getRates, getPositions, getHealth, buildSaveTx, buildWithdrawTx, buildBorrowTx, buildRepayTx, maxWithdraw, maxBorrow.

### 8.3 — CetusAdapter tests (`adapters/cetus.test.ts`) — 5 tests

Verifies metadata, capabilities, getSupportedPairs, delegation to protocols/cetus.ts.

### 8.4 — SuilendAdapter tests (`adapters/suilend.test.ts`) — 25 tests

Full unit tests with mocked RPC: init, getRates (utilization interpolation), getPositions, getHealth, buildSaveTx (with/without existing obligation), buildWithdrawTx, maxWithdraw, deferred methods (borrow/repay throw Phase 10 error), and edge cases.

### 8.5 — Registry tests (`adapters/registry.test.ts`) — 13 tests

Registration, routing (bestSaveRate, bestBorrowRate, bestSwapQuote), allRates, allPositions, getLending/getSwap, listLending/listSwap, error cases.

### 8.6 — Protocol-level Cetus tests (`protocols/cetus.test.ts`) — 24 tests

Tests the Aggregator V3 integration layer: buildSwapTx (routing, slippage, errors), getSwapQuote (output, decimals, fallback), getPoolPrice (on-chain calculation, error handling). Mocks `@cetusprotocol/aggregator-sdk`.

### 8.7 — Existing tests

All pre-existing tests (`protocols/navi.test.ts`, `protocols/protocolFee.test.ts`, `t2000.test.ts`, etc.) continue passing unchanged.

---

## Phase 9: CLI Updates

### 9.1 — `--protocol` flag on transaction commands

Add optional `--protocol <id>` to: `save`, `withdraw`, `borrow`, `repay`, `swap`.

```bash
t2000 save 100 --protocol navi
t2000 save 100 --protocol suilend
t2000 swap 10 SUI USDC --protocol cetus
```

Default: auto-route to best rate/price.

### 9.2 — `t2000 rates` multi-protocol

Current: shows NAVI rates only.
Updated: shows all registered lending adapters side by side.

```
$ t2000 rates

         NAVI          Suilend
USDC    4.21% save    3.89% save
        7.01% borrow  6.45% borrow
```

### 9.3 — `t2000 positions` multi-protocol

Show positions across all protocols:

```
$ t2000 positions

NAVI
  USDC  $100.00 saved   4.21% APY
  USDC  $20.00 borrowed  7.01% APY

Suilend
  USDC  $50.00 saved    3.89% APY
```

### 9.4 — Output includes protocol name

```
$ t2000 save 100
  ✓ Saved $100.00 USDC to best rate (APY: 4.21%)
```

---

## Phase 10: Documentation

### 10.1 — `CONTRIBUTING-ADAPTERS.md`

Guide for protocol teams:
1. Fork the repo
2. Create `packages/sdk/src/adapters/<protocol>.ts`
3. Implement `LendingAdapter` or `SwapAdapter`
4. Use `NaviAdapter` as reference
5. Add tests in `adapters/<protocol>.test.ts`
6. Run `pnpm test && pnpm typecheck`
7. Raise a PR

### 10.2 — Update `PRODUCT_FACTS.md`

- Add adapter architecture section
- List registered adapters
- Document `--protocol` flag

### 10.3 — Update `spec/t2000-roadmap-v2.md`

- Mark adapter architecture as shipped
- Update Phase 10 (Multi-Stable) to reference adapters

---

## Task Breakdown

| # | Task | Phase | Est | Status |
|---|------|-------|-----|--------|
| 1 | Define `LendingAdapter`, `SwapAdapter`, `AdapterTxResult`, supporting types | P1 | 1h | ✅ Done |
| 2 | Implement `ProtocolRegistry` with routing logic | P2 | 2h | ✅ Done |
| 3 | Refactor `navi.ts` functions to accept `address` instead of `keypair` | P3 | 1h | ✅ Done |
| 4 | Implement `NaviAdapter` wrapping `protocols/navi.ts` | P3 | 2h | ✅ Done |
| 5 | Implement `CetusAdapter` wrapping `protocols/cetus.ts` | P4 | 1h | ✅ Done |
| 6 | Wire `ProtocolRegistry` into `t2000.ts` (save, withdraw, borrow, repay, swap) | P5 | 3h | ✅ Done |
| 7 | Implement `SuilendAdapter` (save + withdraw, contract-first, obligation lifecycle) | P6 | 4h | ✅ Done |
| 8 | Update SDK exports: barrel file, sub-path export, tsup entry | P7 | 30m | ✅ Done |
| 9 | Registry tests (routing, registration, edge cases) | P8 | 2h | ✅ Done (13 tests) |
| 10 | NaviAdapter delegation tests | P8 | 1h | ✅ Done (10 tests) |
| 11 | CetusAdapter delegation tests | P8 | 30m | ✅ Done (5 tests) |
| 12 | SuilendAdapter unit tests (full coverage with mocked RPC) | P8 | 2h | ✅ Done (25 tests) |
| 12a | Adapter compliance test suite (reusable, validates any adapter) | P8 | 1h | ✅ Done (25 tests) |
| 12b | Protocol-level Cetus Aggregator V3 tests | P8 | 1.5h | ✅ Done (24 tests) |
| 13 | Verify all existing tests still pass | P8 | 30m | ✅ Done |
| 14 | CLI: add `--protocol` flag to transaction commands | P9 | 1h | ✅ Done |
| 15 | CLI: update `t2000 rates` for multi-protocol | P9 | 1h | ✅ Done |
| 16 | CLI: update `t2000 positions` for multi-protocol | P9 | 1h | ✅ Done |
| 17 | CLI: add protocol name to save/borrow/swap output | P9 | 30m | ✅ Done |
| 18 | Write `CONTRIBUTING-ADAPTERS.md` | P10 | 1.5h | ✅ Done |
| 19 | Update `PRODUCT_FACTS.md` and roadmap | P10 | 30m | ✅ Done |
| 20 | Build, typecheck, run all tests, verify clean | — | 30m | ✅ Done (286 tests) |
| 21 | CI: Adapter Compliance job on PRs to main | — | — | ✅ Done |
| 22 | Migrate Cetus from CLMM SDK to Aggregator V3 | — | 3h | ✅ Done |

**Total: 19 test files, 286 tests, all passing. SDK + CLI build clean. Zero breaking changes.**

---

## Execution Order (completed)

All tasks have been executed. The order followed was:

```
1. Interfaces (types.ts)
2. Registry (registry.ts + tests)
3. NAVI refactor (keypair → address) + NaviAdapter + tests
4. CetusAdapter + tests
5. Wire registry into t2000.ts
6. SuilendAdapter (full implementation) + tests
7. Exports (barrel, sub-path, tsup)
8. Compliance test suite
9. CLI updates (--protocol, rates, positions, output)
10. CONTRIBUTING-ADAPTERS.md + docs
11. Migrate Cetus to Aggregator V3 + protocol tests
12. Final verification (262 tests, typecheck, build)
```

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| NAVI's `getPositions`/`getHealth` need keypair, not address | Blocks adapter | ✅ Resolved — all functions now accept `address: string` |
| Fee collection ordering differs between save (fee before deposit) and borrow (fee after borrow) | Incorrect fees | Adapter handles fee timing internally — same pattern as current `navi.ts` |
| Registry routing adds latency (queries all adapters for rates) | Slower `save` | Cache rates with 30s TTL (matches current `staleTime`) |
| Suilend contract interface differs from NAVI | Adapter won't work | The adapter owns its own PTB construction — t2000 only receives a `Transaction` |
| Breaking existing SDK consumers | User impact | Adapter is additive — `T2000.save({ amount: 100 })` works identically |
| Suilend obligation lifecycle adds complexity | First-time save fails | Adapter auto-creates obligation in same PTB if user doesn't have one |
| Suilend Move calls require specific transaction structure | PTB corruption | Adapter builds fresh Transaction with direct Move calls, wraps in AdapterTxResult |
| Suilend adapter adds RPC load for reserve/obligation queries | Latency | Contract-first approach — no SDK bundle; queries are standard RPC calls |
| Suilend requires `obligationOwnerCapId` for every operation | Extra RPC calls | Cache cap IDs per address with short TTL; create in same PTB for new users |
| Cross-protocol `withdraw all` / `repay all` needs to know which protocol holds positions | Wrong protocol called | `allPositions()` queries all adapters; `withdraw all` iterates and withdraws from each |
