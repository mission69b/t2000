---
name: sui-grpc
description: >-
  Read Sui chain state over gRPC — balances, objects, transactions, coin
  metadata, names. Use for any direct Sui read; JSON-RPC deactivates
  the week of July 20, 2026 (mainnet), so new integrations MUST use gRPC. Read-only.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: Node 18+ with @mysten/sui@^2
---

# Sui: Read the chain over gRPC

## Purpose

The canonical way to read Sui in 2026. One client covers balances, objects, transactions, metadata, and name service.

> **JSON-RPC is being retired (mainnet: week of July 20, 2026).** `SuiClient` / `suix_*` / `sui_*` HTTP methods stop working on public fullnodes. Everything below is the replacement surface, verified against mainnet.

## Setup

```js
import { SuiGrpcClient } from '@mysten/sui/grpc';

const client = new SuiGrpcClient({
  baseUrl: 'https://fullnode.mainnet.sui.io',
  network: 'mainnet',
});
```

## The reads

```js
// One coin balance (owner + coinType)
const { balance } = await client.core.getBalance({
  owner: '0x…',
  coinType: '0x2::sui::SUI',
});
// balance.balance = total, split into coinBalance + addressBalance (SIP-58)

// Every balance an address holds
const { balances } = await client.core.listBalances({ owner: '0x…' });

// Coin metadata (decimals, symbol) — never hardcode decimals
const { coinMetadata } = await client.core.getCoinMetadata({
  coinType: '0xdba3…::usdc::USDC',
});

// Objects an address owns
const { objects, hasNextPage, cursor } = await client.core.listOwnedObjects({
  owner: '0x…',
  limit: 50,
});
// each: { objectId, version, digest, type, owner, content }

// One object / one transaction
const obj = await client.core.getObject({ objectId: '0x…' });
const tx = await client.core.getTransaction({ digest: '…' });

// SuiNS
const { record } = await client.nameService.lookupName({ name: 'agent-id.sui' });
```

## Rules

1. **Amounts are strings/bigints in base units.** Scale by `coinMetadata.decimals` for display; never `parseFloat` raw chain values into math you'll transact on.
2. **A balance has two pots (SIP-58).** `coinBalance` (coin objects) + `addressBalance` (address-balance accumulator) sum to `balance` — report the total unless debugging transfers.
3. **Paginate.** `listOwnedObjects` / `listCoins` return `cursor` + `hasNextPage`; loop until done for full inventories.
4. **Don't write from this skill.** Building + signing transactions is wallet territory — use the t2000 Agent Wallet (`t2 send · swap · pay`) or `@t2000/sdk`, which run on this same gRPC surface.

## Field-masked reads (advanced)

Large objects/transactions support read masks to fetch only what you need:

```js
const tx = await client.ledgerService.getTransaction({
  digest: '…',
  readMask: { paths: ['effects', 'events'] },
});
```

## Gotchas

- The gRPC client returns **BigInt** for u64s — `JSON.stringify` throws on them; convert with a replacer: `(k, v) => typeof v === 'bigint' ? v.toString() : v`.
- `getBalance` takes `owner`, not `address` — a wrong key name errors as `missing owner`.
- Public fullnode gRPC is rate-limited like RPC was; batch via list endpoints instead of hammering singles.
