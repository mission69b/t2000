# Building a Protocol Adapter

This guide covers how to build a new DeFi protocol adapter for t2000.

## Architecture

```
adapters/
  types.ts              # LendingAdapter, ProtocolDescriptor interfaces
  registry.ts           # ProtocolRegistry (routing + discovery)
  navi.ts               # NaviAdapter + descriptor (reference, MCP-first)
  compliance.test.ts    # Adapter + descriptor compliance test suite
  index.ts              # Barrel exports + allDescriptors registry
```

## Quick Start

### 1. Export a ProtocolDescriptor

Every adapter must export a `descriptor` that tells the indexer how to classify
this protocol's on-chain transactions. This is how stats, analytics, and event
tracking automatically pick up your protocol — no server-side changes needed.

```typescript
import type { ProtocolDescriptor } from './types.js';

export const descriptor: ProtocolDescriptor = {
  id: 'myprotocol',
  name: 'My Protocol',
  packages: ['0x<your_package_id>'],
  actionMap: {
    'vault::deposit': 'save',
    'vault::withdraw': 'withdraw',
    'vault::borrow': 'borrow',
    'vault::repay': 'repay',
  },
};
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Lowercase kebab-case, must match adapter's `id` field |
| `name` | Yes | Human-readable protocol name |
| `packages` | Yes | On-chain package IDs (base/original package for upgradeable contracts) |
| `actionMap` | Yes | Maps `module::function` to action type (`save`, `withdraw`, `borrow`, `repay`) |
| `dynamicPackageId` | No | Set `true` if the protocol uses frequently upgraded package IDs (like NAVI). Indexer matches by `module::function` only, ignoring package prefix |

### 2. Implement the interface

For lending protocols, implement `LendingAdapter`:

```typescript
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { LendingAdapter, AdapterTxResult, AdapterCapability, ProtocolDescriptor } from '@t2000/sdk/adapters';

export const descriptor: ProtocolDescriptor = { /* see above */ };

export class MyProtocolAdapter implements LendingAdapter {
  readonly id = 'myprotocol';
  readonly name = 'My Protocol';
  readonly version = '1.0.0';
  readonly capabilities: readonly AdapterCapability[] = ['save', 'withdraw'];
  readonly supportedAssets: readonly string[] = ['USDC', 'USDT', 'USDe', 'USDsui'];
  readonly supportsSameAssetBorrow = false;

  private client!: SuiJsonRpcClient;

  async init(client: SuiJsonRpcClient): Promise<void> {
    this.client = client;
  }

  // ... implement all interface methods
}
```

> **Contract-first pattern:** t2000 adapters interact directly with Move contracts
> via `client.getObject()`, `client.devInspectTransactionBlock()`, and `tx.moveCall()`.
> Do not add external protocol SDKs as dependencies — this avoids `@mysten/sui`
> version conflicts and keeps the dependency tree clean.

### 3. Register the adapter

```typescript
import { T2000 } from '@t2000/sdk';
import { MyProtocolAdapter } from './my-adapter';

const agent = await T2000.create({ pin: '1234' });
await agent.registerAdapter(new MyProtocolAdapter());
```

### 4. Use it

```bash
# CLI with protocol flag
t2000 save 100 --protocol myprotocol

# Or let the registry auto-select best rates
t2000 save 100
```

> **Note:** All user-facing commands accept USDC only.

## Interface Reference

### LendingAdapter

| Method | Required | Description |
|--------|----------|-------------|
| `init(client)` | Yes | Initialize with SuiJsonRpcClient |
| `getRates(asset)` | Yes | Return save/borrow APY |
| `getPositions(address)` | Yes | Return user's supplies + borrows |
| `getHealth(address)` | Yes | Return health factor info |
| `buildSaveTx(address, amount, asset, opts?)` | Yes | Build deposit PTB |
| `buildWithdrawTx(address, amount, asset)` | Yes | Build withdraw PTB |
| `buildBorrowTx(address, amount, asset, opts?)` | Yes | Build borrow PTB |
| `buildRepayTx(address, amount, asset)` | Yes | Build repay PTB |
| `maxWithdraw(address, asset)` | Yes | Max safe withdrawal amount |
| `maxBorrow(address, asset)` | Yes | Max safe borrow amount |

## Fee Collection

> **Adapters do not collect fees.** The SDK is fee-free by design. Adapters expose pure tx-building primitives only — fee policy is owned by the consumer app, never by the adapter.

The `addFeeTransfer` helper is exported for **consumer apps** to use — adapters should not reach for it.

If your adapter needs to expose a low-level handle so a consumer can interpose a fee transfer between the adapter's coin acquisition and final transfer (the way `addBorrowToTx` works for NAVI), follow this pattern:

```typescript
// In your adapter's protocol file (e.g. protocols/myprotocol.ts):
export async function addBorrowToTx(
  tx: Transaction,
  client: SuiJsonRpcClient,
  address: string,
  amount: number,
  options: { asset?: string } = {},
): Promise<TransactionObjectArgument> {
  // ... build the borrow logic and RETURN the borrowed coin (do NOT transfer it) ...
  return borrowedCoin;
}

// In adapters/myprotocol.ts, expose it on the LendingAdapter interface:
async addBorrowToTx(tx, address, amount, asset, options) {
  return await myProtocol.addBorrowToTx(tx, this.client, address, amount, { asset, ...options });
}
```

The consumer (e.g. Audric's `prepare/route.ts`) then chains:

```typescript
const borrowedCoin = await adapter.addBorrowToTx(tx, address, amount, 'USDC');
addFeeTransfer(tx, borrowedCoin, BORROW_FEE_BPS, T2000_OVERLAY_FEE_WALLET, amount);
tx.transferObjects([borrowedCoin], tx.pure.address(address));
```

If your adapter doesn't need to support consumer-side fee interposition, just keep `buildSaveTx` / `buildBorrowTx` as full end-to-end builders — the consumer can still charge a fee on the user's wallet coin before calling the adapter (see Audric's USDC save flow for the pre-fee pattern).

## Testing

### Compliance Test Suite

Every adapter and descriptor is automatically validated against the compliance tests. These check:

**Adapter compliance:**
- Required metadata fields (id, name, version format)
- Valid capabilities array (only known values)
- Valid supportedAssets (non-empty, uppercase)
- Correct `supportsSameAssetBorrow` type
- Capability consistency (borrow requires repay, save requires withdraw)
- Kebab-case id format
- All interface methods exist
- Unsupported capabilities throw

**Descriptor compliance:**
- Non-empty id in kebab-case format
- Non-empty name
- Valid package IDs (hex format) — or empty array if `dynamicPackageId: true`
- Non-empty actionMap with valid action types
- All actionMap patterns contain `::`
- Descriptor is registered in `allDescriptors`

To hook your adapter into the compliance suite, add both to `compliance.test.ts`:

```typescript
import { MyAdapter } from './my-adapter.js';
import { descriptor as myProtocolDesc } from './my-adapter.js';

runLendingComplianceTests('MyAdapter', () => new MyAdapter());
runDescriptorComplianceTests(myProtocolDesc);
```

### Unit Tests

Write dedicated tests for your adapter. Use NaviAdapter tests as a template:

```bash
# Run all adapter tests
pnpm --filter @t2000/sdk exec vitest run src/adapters/

# Run compliance tests only
pnpm --filter @t2000/sdk exec vitest run src/adapters/compliance.test.ts
```

Each adapter should test:
- Metadata (id, name, capabilities, supportedAssets)
- All interface methods delegate correctly to the underlying protocol (contract calls or API)
- Error cases (unsupported assets, insufficient balance)
- Edge cases specific to the protocol

### What CI Checks on Your PR

When you raise a PR to `main`, the **Adapter Compliance** CI job runs automatically:

1. Builds the SDK
2. Runs all adapter tests (`src/adapters/*.test.ts`)
3. Runs the compliance suite against every registered adapter
4. All must pass before merge

The CI output shows verbose results so you can see exactly which checks passed/failed.

## Raising a PR

1. **Create your adapter file**: `packages/sdk/src/adapters/<protocol>.ts`
   - Export `descriptor: ProtocolDescriptor` with package IDs and action mappings
   - Export the adapter class implementing `LendingAdapter`
2. **Create unit tests**: `packages/sdk/src/adapters/<protocol>.test.ts`
3. **Register in compliance suite**: Add both adapter and descriptor to `compliance.test.ts`
4. **Export from barrel**: Add adapter, descriptor, and `allDescriptors` entry to `index.ts`
5. **Run locally**: `pnpm --filter @t2000/sdk test`
6. **Raise PR**: CI validates adapter compliance, descriptor compliance, and all tests

## Key Constraints

- **capabilities**: Only list operations your adapter actually supports
- **supportsSameAssetBorrow**: Set to `true` only if the protocol allows borrowing the same asset used as collateral
- **supportedAssets**: List only assets you've tested and verified
- **Transaction building**: Always return a `Transaction` object, never sign or execute
- **Amounts**: Use human-readable numbers (e.g., `100` for $100 USDC), not raw on-chain amounts
- **id format**: Lowercase kebab-case (e.g., `suilend`, `my-protocol`)
- **version format**: Semver (e.g., `1.0.0`)
- **No side effects in init**: `init()` should only store the client ref and do lightweight setup
- **Descriptor required**: Every adapter must export a `descriptor: ProtocolDescriptor` — the indexer uses this to classify transactions automatically
- **Dynamic package IDs**: If your protocol frequently upgrades its package, set `dynamicPackageId: true` and leave `packages: []` — the indexer matches by `module::function` only
