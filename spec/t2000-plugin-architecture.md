# t2000 Plugin Architecture — Protocol Adapters

**Status:** Implemented (Phase 1–4 complete, all adapters shipped)
**Date:** February–March 2026
**Triggered by:** Suilend partnership inquiry
**Build plan:** `spec/adapter-build-plan.md` — all tasks complete
**Migration:** All protocol integrations rewritten to contract-first (no external SDKs). `@mysten/sui` upgraded to v2.

---

## Problem

t2000 currently hardcodes protocol integrations (NAVI for lending, Cetus for swaps). Each new protocol requires changes to the SDK core (`t2000.ts`, `navi.ts`, `cetus.ts`). This doesn't scale as more protocols want to integrate — Suilend, Scallop, Aftermath, Turbos, etc.

## Vision

t2000 becomes the **agent execution layer** on Sui. Protocols bring their own PTB builders via a standard adapter interface. t2000 handles wallet, signing, gas abstraction, fee collection, and execution. Agents route to the best protocol automatically based on rates, liquidity, and risk.

```
Agent Intent          t2000 Core              Protocol Adapters
─────────────         ──────────              ─────────────────
"save 100 USDC"  →    Router (best APY)  →    NAVI Adapter
                                              Suilend Adapter
                                              Scallop Adapter

"swap 10 SUI"    →    Router (best price) →   Cetus Adapter
                                              Aftermath Adapter
                                              Turbos Adapter
```

---

## Architecture

### 1. Protocol Adapter Interface

Each protocol implements a standard interface. Adapters are self-contained — they own their SDK dependency, PTB construction, and rate queries.

```typescript
// packages/sdk/src/adapters/types.ts

import type { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

export type AdapterCapability = 'save' | 'withdraw' | 'borrow' | 'repay' | 'swap';

export interface AdapterTxResult {
  tx: Transaction;
  feeCoin?: TransactionObjectArgument;
  meta?: Record<string, unknown>;
}

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

export interface LendingAdapter {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly capabilities: readonly AdapterCapability[];
  readonly supportedAssets: readonly string[];
  readonly supportsSameAssetBorrow: boolean;

  init(client: SuiJsonRpcClient): Promise<void>;

  getRates(asset: string): Promise<LendingRates>;
  getPositions(address: string): Promise<AdapterPositions>;
  getHealth(address: string): Promise<HealthInfo>;

  buildSaveTx(address: string, amount: number, asset: string, options?: { collectFee?: boolean }): Promise<AdapterTxResult>;
  buildWithdrawTx(address: string, amount: number, asset: string): Promise<AdapterTxResult & { effectiveAmount: number }>;
  buildBorrowTx(address: string, amount: number, asset: string, options?: { collectFee?: boolean }): Promise<AdapterTxResult>;
  buildRepayTx(address: string, amount: number, asset: string): Promise<AdapterTxResult>;

  maxWithdraw(address: string, asset: string): Promise<{ maxAmount: number; healthFactorAfter: number; currentHF: number }>;
  maxBorrow(address: string, asset: string): Promise<{ maxAmount: number; healthFactorAfter: number; currentHF: number }>;
}

export interface SwapAdapter {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly capabilities: readonly AdapterCapability[];

  init(client: SuiJsonRpcClient): Promise<void>;

  getQuote(from: string, to: string, amount: number): Promise<SwapQuote>;
  buildSwapTx(
    address: string,
    from: string,
    to: string,
    amount: number,
    maxSlippageBps?: number,
  ): Promise<AdapterTxResult & { estimatedOut: number; toDecimals: number }>;
  getSupportedPairs(): Array<{ from: string; to: string }>;
  getPoolPrice(): Promise<number>;
}
```

### 2. Protocol Registry

A central registry that holds all registered adapters and routes requests to the best one.

```typescript
// packages/sdk/src/adapters/registry.ts

import type { LendingAdapter, SwapAdapter, LendingRates, SwapQuote, AdapterPositions } from './types.js';

export class ProtocolRegistry {
  private lending: Map<string, LendingAdapter> = new Map();
  private swap: Map<string, SwapAdapter> = new Map();

  registerLending(adapter: LendingAdapter): void {
    this.lending.set(adapter.id, adapter);
  }

  registerSwap(adapter: SwapAdapter): void {
    this.swap.set(adapter.id, adapter);
  }

  async bestSaveRate(asset: string): Promise<{ adapter: LendingAdapter; rate: LendingRates }> {
    const candidates: Array<{ adapter: LendingAdapter; rate: LendingRates }> = [];
    for (const adapter of this.lending.values()) {
      if (!adapter.supportedAssets.includes(asset)) continue;
      if (!adapter.capabilities.includes('save')) continue;
      try {
        const rate = await adapter.getRates(asset);
        candidates.push({ adapter, rate });
      } catch {
        // skip adapters that fail to fetch rates
      }
    }
    if (candidates.length === 0) {
      throw new Error(`No lending adapter supports saving ${asset}`);
    }
    candidates.sort((a, b) => b.rate.saveApy - a.rate.saveApy);
    return candidates[0];
  }

  async bestBorrowRate(asset: string, opts?: { requireSameAssetBorrow?: boolean }): Promise<{ adapter: LendingAdapter; rate: LendingRates }> {
    const candidates: Array<{ adapter: LendingAdapter; rate: LendingRates }> = [];
    for (const adapter of this.lending.values()) {
      if (!adapter.supportedAssets.includes(asset)) continue;
      if (!adapter.capabilities.includes('borrow')) continue;
      if (opts?.requireSameAssetBorrow && !adapter.supportsSameAssetBorrow) continue;
      try {
        const rate = await adapter.getRates(asset);
        candidates.push({ adapter, rate });
      } catch { /* skip */ }
    }
    if (candidates.length === 0) {
      throw new Error(`No lending adapter supports borrowing ${asset}`);
    }
    candidates.sort((a, b) => a.rate.borrowApy - b.rate.borrowApy);
    return candidates[0];
  }

  async bestSwapQuote(from: string, to: string, amount: number): Promise<{ adapter: SwapAdapter; quote: SwapQuote }> {
    const candidates: Array<{ adapter: SwapAdapter; quote: SwapQuote }> = [];
    for (const adapter of this.swap.values()) {
      const pairs = adapter.getSupportedPairs();
      if (!pairs.some(p => p.from === from && p.to === to)) continue;
      try {
        const quote = await adapter.getQuote(from, to, amount);
        candidates.push({ adapter, quote });
      } catch { /* skip */ }
    }
    if (candidates.length === 0) {
      throw new Error(`No swap adapter supports ${from} → ${to}`);
    }
    candidates.sort((a, b) => b.quote.expectedOutput - a.quote.expectedOutput);
    return candidates[0];
  }

  async allRates(asset: string): Promise<Array<{ protocol: string; protocolId: string; rates: LendingRates }>> {
    const results: Array<{ protocol: string; protocolId: string; rates: LendingRates }> = [];
    for (const adapter of this.lending.values()) {
      if (!adapter.supportedAssets.includes(asset)) continue;
      try {
        const rates = await adapter.getRates(asset);
        results.push({ protocol: adapter.name, protocolId: adapter.id, rates });
      } catch { /* skip */ }
    }
    return results;
  }

  async allPositions(address: string): Promise<Array<{ protocol: string; protocolId: string; positions: AdapterPositions }>> {
    const results: Array<{ protocol: string; protocolId: string; positions: AdapterPositions }> = [];
    for (const adapter of this.lending.values()) {
      try {
        const positions = await adapter.getPositions(address);
        if (positions.supplies.length > 0 || positions.borrows.length > 0) {
          results.push({ protocol: adapter.name, protocolId: adapter.id, positions });
        }
      } catch { /* skip */ }
    }
    return results;
  }

  getLending(id: string): LendingAdapter | undefined { return this.lending.get(id); }
  getSwap(id: string): SwapAdapter | undefined { return this.swap.get(id); }
  listLending(): LendingAdapter[] { return [...this.lending.values()]; }
  listSwap(): SwapAdapter[] { return [...this.swap.values()]; }
}
```

### 3. Example: NAVI Adapter (contract-first)

```typescript
// packages/sdk/src/adapters/navi.ts

import type { LendingAdapter, LendingRates, HealthInfo, AdapterTxResult, AdapterPositions } from './types.js';
import * as naviProtocol from '../protocols/navi.js';

export class NaviAdapter implements LendingAdapter {
  readonly id = 'navi';
  readonly name = 'NAVI Protocol';
  readonly version = '1.0.0';
  readonly capabilities = ['save', 'withdraw', 'borrow', 'repay'] as const;
  readonly supportedAssets = ['USDC'];
  readonly supportsSameAssetBorrow = true;

  private client!: SuiJsonRpcClient;

  async init(client: SuiJsonRpcClient) { this.client = client; }

  // All methods delegate to protocols/navi.ts which uses contract-first approach:
  // - Dynamic package ID fetched from NAVI API
  // - Oracle price updates via oracle_pro::update_single_price_v2
  // - Direct tx.moveCall() for all operations
  // - No @naviprotocol/lending SDK dependency
}

// ProtocolDescriptor for automatic indexer classification
export const descriptor: ProtocolDescriptor = {
  id: 'navi',
  name: 'NAVI Protocol',
  packages: ['...'],  // Static package IDs
  dynamicPackageId: true,  // NAVI upgrades frequently
  actionMap: {
    'incentive_v3::entry_deposit': 'save',
    'incentive_v3::withdraw_v2': 'withdraw',
    // ...
  },
};
```

### 4. Suilend Adapter

The `SuilendAdapter` is **fully implemented** with `save` and `withdraw` capabilities using a **contract-first approach** — direct Move contract calls via `tx.moveCall()`, no external SDK dependency.

```typescript
// packages/sdk/src/adapters/suilend.ts

export class SuilendAdapter implements LendingAdapter {
  readonly id = 'suilend';
  readonly name = 'Suilend';
  readonly version = '1.0.0';
  readonly capabilities = ['save', 'withdraw'] as const;
  readonly supportedAssets = ['USDC'];
  readonly supportsSameAssetBorrow = false;

  // Contract-first: direct Move calls, no @suilend/sdk

  async getRates(asset: string): Promise<LendingRates> {
    // Reads reserves via RPC, interpolates APY from utilization data
  }

  async buildSaveTx(address: string, amount: number, asset: string, options?: { collectFee?: boolean }): Promise<AdapterTxResult> {
    // Handles obligation lifecycle: finds existing or creates new via tx.moveCall()
    // Deposits via create_obligation + deposit_liquidity_and_mint_ctokens + deposit_ctokens_into_obligation
    // Transfers ObligationOwnerCap to user
  }

  async buildWithdrawTx(address: string, amount: number, asset: string): Promise<AdapterTxResult & { effectiveAmount: number }> {
    // Withdraws from obligation via direct Move calls
  }

  // buildBorrowTx / buildRepayTx / maxBorrow throw "Phase 10" errors (deferred)
}
```

Key implementation details:
- **Contract-first**: Uses `tx.moveCall()` for all on-chain operations — zero external SDK dependencies
- **initSync()**: Like other adapters, supports synchronous registration with deferred initialization
- **Obligation lifecycle**: Automatically creates obligation + transfers `ObligationOwnerCap` in same PTB
- **Rate calculation**: Reads reserve data via RPC and interpolates APY from utilization curves
- **cToken ratio**: Converts between cTokens and underlying using `(availableAmount + borrowedAmount) / cTokenSupply`
- **ProtocolDescriptor**: Exports a descriptor for automatic indexer event classification

### 5. How t2000 Core Uses Adapters

```typescript
// In t2000.ts — save() becomes protocol-agnostic

async save(params: {
  amount: number | 'all';
  asset?: string;
  protocol?: string;  // optional: force a specific protocol
}): Promise<SaveResult> {
  const asset = (params.asset ?? 'USDC').toUpperCase();

  // Route to best protocol or user-specified one
  const { adapter, rate } = await this.resolveLending(asset, params.protocol, 'save');

  // Build tx from adapter
  const { tx } = await adapter.buildSaveTx(this._address, amount, asset);

  // t2000 handles: fee collection, gas, signing, execution
  addCollectFeeToTx(tx, ...);
  const gasResult = await executeWithGas(this.client, this.keypair, () => tx);

  return {
    success: true,
    tx: gasResult.digest,
    protocol: adapter.name,
    amount,
    apy: rate.saveApy,
    // ...
  };
}
```

The constructor takes an optional `ProtocolRegistry`. `createDefaultRegistry(client)` creates a registry with `NaviAdapter` + `CetusAdapter` using `initSync()`. A public `registerAdapter(adapter)` method lets users add more adapters at runtime. All operations (`save`, `withdraw`, `borrow`, `repay`, `swap`) route through the registry.

### 6. CLI: `t2000 rates` with Multi-Protocol

```
$ t2000 rates

           NAVI          Suilend       Scallop
USDC      4.21% save    3.89% save    4.05% save
          7.01% borrow  6.45% borrow  6.80% borrow

USDT      3.85% save    4.12% save    —
          6.92% borrow  7.20% borrow  —

$ t2000 save 100 USDC
  ✓ Saved $100.00 USDC to Suilend (best APY: 4.12%)

$ t2000 save 100 USDC --protocol navi
  ✓ Saved $100.00 USDC to NAVI (APY: 3.89%)
```

### 7. CLI: `t2000 swap` with Multi-DEX

```
$ t2000 swap 10 SUI USDC
  ✓ Swapped 10 SUI → $42.15 USDC via Aftermath (best price)

$ t2000 swap 10 SUI USDC --protocol cetus
  ✓ Swapped 10 SUI → $42.08 USDC via Cetus
```

---

## Third-Party Adapter Publishing

Protocols can publish their own adapters as npm packages:

```bash
npm install @suilend/t2000-adapter
```

```typescript
import { T2000 } from '@t2000/sdk';
import { SuilendAdapter } from '@suilend/t2000-adapter';

const agent = await T2000.create({ pin: '...' });
agent.registerAdapter(new SuilendAdapter());

// Now save routes through Suilend when it has the best rate
await agent.save({ amount: 100 });
```

### Adapter Package Convention

```
@<protocol>/t2000-adapter
```

Each adapter package:
- Imports types from `@t2000/sdk/adapters`
- Implements `LendingAdapter` and/or `SwapAdapter`
- Bundles its own protocol SDK dependency
- Exports a ready-to-register class

---

## Built-in vs External Adapters

| Adapter | Type | Built-in | Scope | Notes |
|---------|------|----------|-------|-------|
| NAVI | Lending | Yes | save, withdraw, borrow, repay | Contract-first, dynamic package ID, oracle updates |
| Cetus | Swap | Yes | swap, quote | Aggregator V3, 20+ DEX routing via @cetusprotocol/aggregator-sdk |
| Suilend | Lending | Yes | save, withdraw | Contract-first, no external SDK. Borrow/repay deferred to Phase 10. |
| Bluefin | Perps | Planned | open, close, funding | In discussion with Bluefin team |
| Scallop | Lending | External | TBD | Community adapter |
| Aftermath | Swap | External | TBD | Router aggregator |
| Turbos | Swap | External | TBD | CLMM pools |

---

## Fee Collection with Adapters

Fee collection remains in t2000 core, not in adapters. Adapters return a `Transaction`, and t2000 appends the `collect_fee` call before signing:

```
Adapter builds PTB → t2000 appends collect_fee → t2000 signs → t2000 executes
```

This ensures:
- Protocols can't skip fees
- Fee logic stays in one place
- Adapters are pure PTB builders

---

## Migration Path

### Phase 1: Interface Definition — ✅ Complete
- Define `LendingAdapter` and `SwapAdapter` interfaces
- Export from `@t2000/sdk/adapters`
- Share with Suilend for feedback

### Phase 2: Refactor NAVI + Cetus — ✅ Complete
- Wrap existing `navi.ts` → `NaviAdapter` implementing `LendingAdapter`
- Wrap existing `cetus.ts` → `CetusAdapter` implementing `SwapAdapter`
- `t2000.ts` uses `ProtocolRegistry` internally
- Zero breaking changes to public API

### Phase 3: Add Suilend Adapter — ✅ Complete
- `SuilendAdapter` fully implemented with save + withdraw (contract-first, no `@suilend/sdk`)
- Direct Move contract calls via `tx.moveCall()` — zero external SDK dependencies
- Handles obligation lifecycle (auto-create + transfer `ObligationOwnerCap`)
- Rate interpolation from on-chain reserve data
- Register alongside NAVI, auto-routes to best APY
- `t2000 rates` shows both protocols

### Phase 4: Open Ecosystem — ✅ Complete
- `CONTRIBUTING-ADAPTERS.md` published at `packages/sdk/CONTRIBUTING-ADAPTERS.md`
- CI compliance job (`adapters` job runs compliance.test.ts)
- Adapter types + `ProtocolDescriptor` exported from `@t2000/sdk/adapters`
- `allDescriptors` array for automatic indexer event classification
- 286 tests across 19 test files, all passing

---

## What Protocol Teams Need to Know

1. **Contract-first approach**: All adapters use direct Move contract calls — no external SDK dependencies. This avoids `@mysten/sui` version conflicts.
2. **Interface is simple**: `LendingAdapter` returns a `Transaction` from each builder method.
3. **Adapters own their PTB construction**: Obligation creation, deposits, withdrawals — all inside the adapter. t2000 doesn't need to learn protocol internals.
4. **t2000 handles the rest**: Wallet, gas, fees, signing, execution, CLI output, events.
5. **ProtocolDescriptor**: Each adapter exports a descriptor for automatic indexer event classification — no server-side changes needed.
6. **Reference implementations exist**: `NaviAdapter` and `SuilendAdapter` are working references.
7. **Adding protocols**: See `CONTRIBUTING-ADAPTERS.md`. Fork, implement interface + descriptor, add tests, raise a PR. CI validates automatically.
8. **Protocol-specific features**: Extensions like `claimRewards()` live as methods on the adapter class, not in the core interface.

---

## Suilend Integration Notes (Contract-First)

> **Note:** The `SuilendAdapter` is fully implemented using **direct Move contract calls** — no `@suilend/sdk` dependency. Save and withdraw work end-to-end. Borrow/repay are deferred to Phase 10.

### Obligation Model

Suilend uses an **obligation pattern** that NAVI does not:
- Users must first create an `Obligation` object on-chain
- This produces an `ObligationOwnerCap` (proves ownership) and `obligationId`
- All deposit/withdraw calls require these IDs
- The adapter handles obligation lifecycle internally via `tx.moveCall()`:

```typescript
// Inside SuilendAdapter.buildSaveTx():
// 1. Check if user has an existing ObligationOwnerCap
const caps = await client.getOwnedObjects({ owner: address, filter: { StructType: '...' } });
if (caps.length === 0) {
  // Create obligation + cap in same PTB
  const [cap] = tx.moveCall({ target: '...::lending_market::create_obligation', ... });
  tx.transferObjects([cap], address);  // Must transfer to avoid UnusedValueWithoutDrop
}
// 2. Deposit via direct Move calls
tx.moveCall({ target: '...::lending_market::deposit_liquidity_and_mint_ctokens', ... });
tx.moveCall({ target: '...::lending_market::deposit_ctokens_into_obligation', ... });
```

### Contract-First Approach

The adapter uses direct Move contract calls instead of the Suilend SDK:
- **No SDK dependency** — eliminates `@mysten/sui` version conflicts
- **Reserve data** — read via `client.getObject()` on reserve objects
- **Rate calculation** — interpolates APY from utilization curves using on-chain reserve data
- **cToken conversion** — `cTokenRatio = (availableAmount + borrowedAmount) / cTokenSupply`
- **Package resolution** — resolves Suilend package ID via UpgradeCap lookup

### Rewards System

Suilend has a rewards/liquidity mining system (`claimRewards`). This is protocol-specific and NOT part of the core `LendingAdapter` interface. Can be exposed as an extension method on `SuilendAdapter`.

### ProtocolDescriptor

The adapter exports a `ProtocolDescriptor` for automatic indexer event classification:

```typescript
export const descriptor: ProtocolDescriptor = {
  id: 'suilend',
  name: 'Suilend',
  packages: [SUILEND_PACKAGE],
  actionMap: {
    'lending_market::deposit_liquidity_and_mint_ctokens': 'save',
    'lending_market::withdraw_ctokens': 'withdraw',
  },
};
```

---

## Design Decisions (resolved)

### 1. Cross-protocol `withdraw all`

**Decision:** Query all adapters, find where positions are, withdraw from there.

In practice, `t2000 save 100` routes to ONE protocol (best APY). Agents won't manually split across protocols, so positions will typically exist on a single protocol at a time. If positions are on multiple protocols (edge case), withdraw from each sequentially. No proportional splitting or smart rebalancing.

### 2. Health factor display

**Decision:** Show separately per protocol. Never combine.

NAVI can't liquidate a Suilend position and vice versa. A combined number would be misleading. Each protocol's health factor is independent.

```
$ t2000 health
NAVI:     HF 3.21 ($100 saved, $20 borrowed)
Suilend:  HF 2.50 ($50 saved, $10 borrowed)
```

### 3. Protocol-specific features (rewards, points)

**Decision:** NOT part of the core `LendingAdapter` interface.

Extension methods on the adapter class (e.g. `suilendAdapter.claimRewards()`) are fine. The core interface stays clean and universal. If rewards become common across protocols, add a separate `RewardsAdapter` interface later.

### 4. Arbitrary PTB composition

**Decision:** No for MVP. Each command hits one protocol.

"Withdraw from NAVI and deposit to Suilend atomically" is a v2 feature. Agents can run two commands. The PTB ordering complexity isn't worth it until there's real demand.

### 5. Obligation caching

**Decision:** Query fresh every time.

One extra RPC call (~100ms) is negligible. Obligations are created once and rarely change. The bug risk of stale cache outweighs the latency saving.

### 6. Multi-asset collateral (deposit SUI, borrow USDC)

**Decision:** No for MVP. Stables-only.

t2000 is a "bank account" — stablecoin-focused, safe, predictable. Cross-asset collateral introduces volatile asset exposure and liquidation risk, which contradicts the core positioning.

**Suilend adapter ships with `save` and `withdraw` only.** Borrow/repay get added in Phase 10 (multi-stable support), where cross-stable borrowing (deposit USDC, borrow USDT) becomes relevant. This significantly narrows the initial scope and gives Suilend a clear, focused target to implement.
