# Building a Protocol Adapter

This guide covers how to build a new DeFi protocol adapter for t2000.

## Architecture

```
adapters/
  types.ts          # LendingAdapter, SwapAdapter interfaces
  registry.ts       # ProtocolRegistry (routing + discovery)
  navi.ts           # NaviAdapter (reference implementation)
  cetus.ts          # CetusAdapter (swap reference)
  suilend.ts        # SuilendAdapter (stub — save/withdraw only)
  index.ts          # Barrel exports
```

## Quick Start

### 1. Implement the interface

For lending protocols, implement `LendingAdapter`:

```typescript
import type { SuiClient } from '@mysten/sui/client';
import type { LendingAdapter, AdapterTxResult, AdapterCapability } from '@t2000/sdk/adapters';

export class MyProtocolAdapter implements LendingAdapter {
  readonly id = 'myprotocol';
  readonly name = 'My Protocol';
  readonly version = '1.0.0';
  readonly capabilities: readonly AdapterCapability[] = ['save', 'withdraw'];
  readonly supportedAssets: readonly string[] = ['USDC'];
  readonly supportsSameAssetBorrow = false;

  private client!: SuiClient;

  async init(client: SuiClient): Promise<void> {
    this.client = client;
  }

  // ... implement all interface methods
}
```

For swap protocols, implement `SwapAdapter`.

### 2. Register the adapter

```typescript
import { T2000 } from '@t2000/sdk';
import { MyProtocolAdapter } from './my-adapter';

const agent = await T2000.create({ pin: '1234' });
await agent.registerAdapter(new MyProtocolAdapter());
```

### 3. Use it

```bash
# CLI with protocol flag
t2000 save 100 --protocol myprotocol

# Or let the registry auto-select best rates
t2000 save 100
```

## Interface Reference

### LendingAdapter

| Method | Required | Description |
|--------|----------|-------------|
| `init(client)` | Yes | Initialize with SuiClient |
| `getRates(asset)` | Yes | Return save/borrow APY |
| `getPositions(address)` | Yes | Return user's supplies + borrows |
| `getHealth(address)` | Yes | Return health factor info |
| `buildSaveTx(address, amount, asset, opts?)` | Yes | Build deposit PTB |
| `buildWithdrawTx(address, amount, asset)` | Yes | Build withdraw PTB |
| `buildBorrowTx(address, amount, asset, opts?)` | Yes | Build borrow PTB |
| `buildRepayTx(address, amount, asset)` | Yes | Build repay PTB |
| `maxWithdraw(address, asset)` | Yes | Max safe withdrawal amount |
| `maxBorrow(address, asset)` | Yes | Max safe borrow amount |

### SwapAdapter

| Method | Required | Description |
|--------|----------|-------------|
| `init(client)` | Yes | Initialize with SuiClient |
| `getQuote(from, to, amount)` | Yes | Get swap quote |
| `buildSwapTx(address, from, to, amount, slippage?)` | Yes | Build swap PTB |
| `getSupportedPairs()` | Yes | List tradeable pairs |
| `getPoolPrice()` | Yes | Get current pool price |

## Fee Collection

If your adapter charges protocol fees, integrate with `addCollectFeeToTx`:

```typescript
import { addCollectFeeToTx } from '../protocols/protocolFee.js';

async buildSaveTx(address, amount, asset, options?) {
  const tx = new Transaction();
  // ... build your deposit logic ...

  if (options?.collectFee) {
    addCollectFeeToTx(tx, mergedCoin, 'save');
  }

  return { tx };
}
```

## Testing

### Compliance Test Suite

Every adapter is automatically validated against the contract compliance tests. These check:

- Required metadata fields (id, name, version format)
- Valid capabilities array (only known values)
- Valid supportedAssets (non-empty, uppercase)
- Correct `supportsSameAssetBorrow` type
- Capability consistency (borrow requires repay, save requires withdraw)
- Kebab-case id format
- All interface methods exist
- Unsupported capabilities throw

To hook your adapter into the compliance suite, add it to `compliance.test.ts`:

```typescript
import { MyAdapter } from './my-adapter.js';

runLendingComplianceTests('MyAdapter', () => new MyAdapter());
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
- All interface methods delegate correctly to the underlying protocol SDK
- Error cases (unsupported assets, insufficient balance)
- Edge cases specific to the protocol (e.g., Suilend obligation creation)

### What CI Checks on Your PR

When you raise a PR to `main`, the **Adapter Compliance** CI job runs automatically:

1. Builds the SDK
2. Runs all adapter tests (`src/adapters/*.test.ts`)
3. Runs the compliance suite against every registered adapter
4. All must pass before merge

The CI output shows verbose results so you can see exactly which checks passed/failed.

## Raising a PR

1. **Create your adapter file**: `packages/sdk/src/adapters/<protocol>.ts`
2. **Create unit tests**: `packages/sdk/src/adapters/<protocol>.test.ts`
3. **Register in compliance suite**: Add to `compliance.test.ts`
4. **Export from barrel**: Add to `packages/sdk/src/adapters/index.ts`
5. **Run locally**: `pnpm --filter @t2000/sdk test`
6. **Raise PR**: CI will validate everything automatically

## Key Constraints

- **capabilities**: Only list operations your adapter actually supports
- **supportsSameAssetBorrow**: Set to `true` only if the protocol allows borrowing the same asset used as collateral
- **supportedAssets**: List only assets you've tested and verified
- **Transaction building**: Always return a `Transaction` object, never sign or execute
- **Amounts**: Use human-readable numbers (e.g., `100` for $100 USDC), not raw on-chain amounts
- **id format**: Lowercase kebab-case (e.g., `suilend`, `my-protocol`)
- **version format**: Semver (e.g., `1.0.0`)
- **No side effects in init**: `init()` should only store the client ref and do lightweight setup
