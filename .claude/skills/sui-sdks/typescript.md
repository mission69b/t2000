# Sui TypeScript SDK (`@mysten/sui` v2)

Source: https://sdk.mystenlabs.com/sui · https://sdk.mystenlabs.com/typescript

Install:
```bash
npm install @mysten/sui
```

**Never** `npm install @mysten/sui.js` — frozen at v1.

All imports use subpath exports:
```ts
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiGrpcClient } from '@mysten/sui/grpc';
```

## Clients (v2)

Three client classes, all requiring explicit `network`:

```ts
// Recommended — gRPC, best performance, typed protobuf
import { SuiGrpcClient } from '@mysten/sui/grpc';
const client = new SuiGrpcClient({
  network: 'mainnet',
  baseUrl: 'https://fullnode.mainnet.sui.io:443',
});

// Legacy — JSON-RPC is deprecated; migrate to SuiGrpcClient for new code
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
const client = new SuiJsonRpcClient({
  network: 'mainnet',
  url: getJsonRpcFullnodeUrl('mainnet'),
});

// Specialized — GraphQL queries
import { SuiGraphQLClient } from '@mysten/sui/graphql';
const gql = new SuiGraphQLClient({
  network: 'mainnet',
  url: 'https://graphql.mainnet.sui.io/graphql',
});
```

### Network URLs

| Network | gRPC | GraphQL | JSON-RPC helper |
|---|---|---|---|
| Mainnet | `https://fullnode.mainnet.sui.io:443` | `https://graphql.mainnet.sui.io/graphql` | `getJsonRpcFullnodeUrl('mainnet')` |
| Testnet | `https://fullnode.testnet.sui.io:443` | `https://graphql.testnet.sui.io/graphql` | `getJsonRpcFullnodeUrl('testnet')` |
| Devnet | `https://fullnode.devnet.sui.io:443` | `https://graphql.devnet.sui.io/graphql` | `getJsonRpcFullnodeUrl('devnet')` |

### Which client to use

- **New code**: `SuiGrpcClient`. Typed protobuf, best throughput, active surface.
- **Existing v1 migration / JSON-RPC-only infra**: `SuiJsonRpcClient` (legacy — JSON-RPC is deprecated; use only when migrating from v1 or talking to infrastructure that only exposes JSON-RPC).
- **Complex relational queries**: `SuiGraphQLClient` alongside one of the above.
- **All clients share the v2 `client.core.*` API** for common data access.

### gRPC service clients (low-level)

`SuiGrpcClient` exposes typed services:

```ts
await client.transactionExecutionService.executeTransaction({ ... });
await client.ledgerService.getObject({ objectId: '0x...' });
await client.movePackageService.getFunction({
  packageId: '0x2', moduleName: 'coin', name: 'transfer',
});
await client.nameService.reverseLookupName({ address: '0x...' });
```

## Transactions

```ts
import { Transaction } from '@mysten/sui/transactions';
const tx = new Transaction();
```

Pure inputs — always typed:
```ts
tx.pure.u8(255); tx.pure.u16(n); tx.pure.u32(n); tx.pure.u64(n);
tx.pure.u128(n); tx.pure.u256(n);
tx.pure.bool(true); tx.pure.string('hello');
tx.pure.address('0x...'); tx.pure.id('0x...');
tx.pure.vector('u64', [100n, 200n]);
tx.pure.option('u64', 42n);  // null for None
```

Objects — let the SDK resolve versions:
```ts
tx.object('0x...');
tx.object.system();    // 0x5
tx.object.clock();     // 0x6
tx.object.random();    // 0x8
tx.object.denyList();  // 0x403
tx.object.option({ type: '0xpkg::m::T', value: '0x...' });
```

Commands:
```ts
const [coin] = tx.splitCoins(tx.gas, [1000]);
tx.mergeCoins(tx.object('0xDest'), [tx.object('0xSrc')]);
tx.transferObjects([coin], '0x...');
tx.moveCall({
  target: '0xpkg::module::fn',
  arguments: [tx.object(poolId), coin, tx.pure.string('x')],
  typeArguments: ['0x2::sui::SUI'],
});
const vec = tx.makeMoveVec({ type: '0xpkg::m::T', elements: [tx.object('0xA')] });
const [upgradeCap] = tx.publish({ modules, dependencies });
```

For deeper PTB semantics (equivocation, hot-potato cliques, sponsored), load the `ptbs` skill.

### Balance and coin intents (non-SUI coins)

Manually selecting / merging / splitting non-SUI coins is verbose. Use the transaction-level intents:

```ts
import { Transaction } from '@mysten/sui/transactions';

const tx = new Transaction();
tx.setSender(keypair.toSuiAddress()); // REQUIRED for non-SUI

// tx.balance() — returns a Balance value (for Move functions that accept Balance<T>)
tx.moveCall({
  target: '0xpkg::module::send_funds',
  arguments: [tx.balance({ balance: 1_000_000, type: '0x2::sui::SUI' })],
});

// tx.coin() — returns a Coin object (for transferObjects or Move functions that accept Coin<T>)
tx.transferObjects(
  [
    tx.coin({ balance: 1_000_000 }),  // SUI — splits from gas
    tx.coin({ balance: 500_000, type: '0xpkg::token::TOKEN' }),
  ],
  recipient,
);
```

`setSender` is mandatory for non-SUI types — the SDK needs the sender to resolve owned coins during build.

## v2 Core API (data access)

All common data access methods live under `client.core`:

```ts
await client.core.getObject({ objectId, include: { content: true } });
await client.core.getObjects({ objectIds: [...], include: { content: true } });
await client.core.listOwnedObjects({
  owner,
  filter: { StructType: '0xpkg::nft::NFT' },   // type filter goes under `filter`
  limit: 50,
});
await client.core.listCoins({ owner, coinType, limit: 50 });
await client.core.listBalances({ owner });
await client.core.listDynamicFields({ parentId, limit: 50 });   // parentId, not parent
await client.core.getDynamicField({ parentId, name });
await client.core.getCoinMetadata({ coinType });
await client.core.getTransaction({ digest, include: {...} });
await client.simulateTransaction({ transaction: tx });
await client.core.executeTransaction({ transaction: bytes, signatures: [...], include: {...} });
```

Pagination: core `list*` methods return a single nullable `cursor`. Iterate while non-null, passing it back as the next call's `cursor`.

**Include options** (replaces v1's `options: { show*: true }`). Keys differ by method:
- Object reads (`getObject`, `getObjects`, `listOwnedObjects`): `content`, `previousTransaction`, `json`, `objectBcs`, `display`.
- Transaction reads (`getTransaction`, `waitForTransaction`): `effects`, `events`, `balanceChanges`, `transaction`, `bcs`, `objectTypes` (map of object ID to type string for all changed objects).
- Simulation (`simulateTransaction`): adds `commandResults`.

### Missing objects and dynamic fields

Unlike v1, v2 does **not** return `null` when a requested object or dynamic field does not exist.

Methods such as:

```ts
await client.core.getObject({ objectId });
await client.core.getDynamicField({ parentId, name });
```

throw an exception if the target cannot be found.

When migrating from v1, replace any logic that relies on `null` checks with appropriate exception handling:

```ts
try {
  const object = await client.core.getObject({ objectId });
  // use object
} catch (error) {
  // object not found
}
```

This is a behavioral change from v1, where equivalent APIs returned `null` for non-existent objects and dynamic fields.

## Execution

```ts
const result = await keypair.signAndExecuteTransaction({
  transaction: tx,
  client,
});

if (result.$kind === 'FailedTransaction') {
  throw new Error(`Failed: ${result.FailedTransaction.status.error?.message}`);
}

await client.waitForTransaction({ digest: result.digest });
// safe to query updated state now
```

Execution response shape uses a `$kind` discriminant: `'Transaction' | 'FailedTransaction'`. **Do not** rely on v1's `result.effects?.status?.status`.

For sponsored or multi-sig, split sign and execute:

```ts
const { bytes, signature } = await tx.sign({ client, signer: keypair });
const result = await client.core.executeTransaction({
  transaction: bytes,
  signatures: [signature],
  include: { effects: true },
});
```

## Keypairs

```ts
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1';
import { Secp256r1Keypair } from '@mysten/sui/keypairs/secp256r1';
import { PasskeyKeypair } from '@mysten/sui/keypairs/passkey';

const kp = new Ed25519Keypair();
const kp2 = Ed25519Keypair.deriveKeypair('mnemonic words ...');
const kp3 = Ed25519Keypair.fromSecretKey(secretKeyBytes);
const addr = kp.toSuiAddress();
```

## Extensions — `client.$extend(...)` (v2)

Ecosystem packages integrate via `$extend`:

```ts
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { suins } from '@mysten/suins';
import { deepbook } from '@mysten/deepbook-v3';

const client = new SuiGrpcClient({
  network: 'mainnet',
  baseUrl: 'https://fullnode.mainnet.sui.io:443',
}).$extend(suins(), deepbook({ address: myAddress }));

await client.suins.getNameRecord('example.sui');
await client.deepbook.checkManagerBalance(manager, asset);
```

Known extensions: `@mysten/suins`, `@mysten/deepbook-v3`, `@mysten/kiosk`, `@mysten/walrus`, `@mysten/seal`, `@mysten/zksend`.

**Not** an extension: `@mysten/dapp-kit` (React-only frontend framework — see `frontend-apps` skill).

## Offline building

```ts
import { Transaction, Inputs } from '@mysten/sui/transactions';

const tx = new Transaction();
tx.object(Inputs.ObjectRef({ objectId, version, digest }));
tx.object(Inputs.SharedObjectRef({ objectId, initialSharedVersion, mutable: true }));
tx.object(Inputs.ReceivingRef({ objectId, version, digest }));

tx.setSender('0x...');
tx.setGasPrice(1000);
tx.setGasBudget(10_000_000);
tx.setGasPayment([{ objectId, version, digest }]);

const bytes = await tx.build();
```

## v1 → v2 migration (abridged)

Full migration guide: fetch `https://sdk.mystenlabs.com/sui/migrations/sui-2.0/llms.txt` for the complete list.

**Migration rule:** when migrating a v1 snippet, do not migrate only the lines visible. v1 codebases almost always also use the execution / waiting / status APIs even if not shown. Surface the full set of likely-related migrations (signing, waiting, status check, options→include) alongside the migrated snippet so the user can update the rest of their file in one pass. A "complete" migration that leaves `signAndExecuteTransactionBlock` or `result.effects?.status?.status` intact elsewhere in the project is a half-migration that will break.

| v1 | v2 |
|---|---|
| `@mysten/sui.js` | `@mysten/sui` |
| `TransactionBlock` | `Transaction` |
| `SuiClient` + `getFullnodeUrl` | `SuiGrpcClient` + `baseUrl` (or `SuiJsonRpcClient` + `getJsonRpcFullnodeUrl`) |
| `client.getObject({ id, options: {...} })` | `client.core.getObject({ objectId, include: {...} })` |
| `client.getOwnedObjects` | `client.core.listOwnedObjects` |
| `client.getCoins` | `client.core.listCoins` |
| `client.getDynamicFields` | `client.core.listDynamicFields` |
| `client.signAndExecuteTransactionBlock` | `keypair.signAndExecuteTransaction({ transaction, client, include: { effects: true } })` |
| `client.waitForTransactionBlock` | `client.waitForTransaction` |
| `client.devInspectTransactionBlock` | `client.simulateTransaction` |
| `client.executeTransactionBlock` | `client.core.executeTransaction` |
| `options: { showEffects: true }` | `include: { effects: true }` (always show this pattern explicitly — do not omit it by saying effects are returned by default) |
| `result.effects?.status?.status === 'success'` | `result.$kind !== 'FailedTransaction'` |
| `txb.pure(value)` untyped | `tx.pure.u64(value)` / typed helpers |
| `tx.serialize()` | `await tx.toJSON()` |
| `namedPackagesPlugin` | built-in (MVR auto-resolution) |
| direct `new SuinsClient(...)` | `client.$extend(suins())` |
| `Commands` | `TransactionCommands` |
| `graphql/schemas/latest` | `graphql/schema` |

### ESM required

All `@mysten/*` packages are ESM-only:
```json
// package.json
{ "type": "module" }

// tsconfig.json
{ "compilerOptions": { "moduleResolution": "NodeNext", "module": "NodeNext" } }
```

## Common mistakes — v1 holdovers

| Wrong | Right |
|---|---|
| `import { ... } from '@mysten/sui.js'` | `import { ... } from '@mysten/sui'` |
| `new TransactionBlock()` | `new Transaction()` |
| `client.signAndExecuteTransactionBlock(...)` | `keypair.signAndExecuteTransaction({ transaction, client })` |
| `SuiClient` | `SuiGrpcClient` (or `SuiJsonRpcClient` — legacy, JSON-RPC is deprecated) |
| Hardcoding `tx.object(Inputs.ObjectRef({ version, digest }))` for online code | `tx.object('0x...')` — let SDK resolve |
| `tx.pure(100)` untyped | `tx.pure.u64(100)` |
| Not checking `result.$kind` | Always check for `'FailedTransaction'` |
| Querying state immediately after execution | `await client.waitForTransaction({ digest })` first |
| Using `tx.gas` by value in `splitCoins` for sponsored tx (sponsor rejects) | Use `tx.coin({ balance })` |
| `tx.coin(type=non-SUI)` / `tx.balance(type=non-SUI)` without `tx.setSender` | Always call `tx.setSender(addr)` first for non-SUI |
