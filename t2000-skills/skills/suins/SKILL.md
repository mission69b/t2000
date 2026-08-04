---
name: suins
description: >-
  Resolve SuiNS names (alice.sui) to Sui addresses and back, from an agent.
  Use when asked to look up a .sui name, find the address behind a name, or
  find the name for an address. Read-only — registering names happens at
  suins.io.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: Node 18+ with @mysten/sui (or any gRPC client)
---

# SuiNS: Resolve names

## Purpose

SuiNS is Sui's name service — `alice.sui` instead of `0x…`. Two reads cover almost every task:

- **Lookup** — name → target address (`audric.sui` → its treasury/custody `0x…`)
- **Reverse lookup** — address → its default name

## Rules

1. **A null result is a valid answer.** A name can exist with no target address set — treat "no target" as "cannot pay this name", not an error.
2. **Never guess an address from a name.** If resolution returns nothing, stop and say so.
3. **Prefer gRPC.** Sui JSON-RPC is deactivated July 31, 2026 (mainnet) — do not build new resolution on `suix_resolveNameServiceAddress`.
4. **Sending to a name?** The t2000 wallet resolves SuiNS itself: `t2 send 5 USDC alice.sui` — no separate lookup step needed.

## Resolve (gRPC — the current path)

```js
import { SuiGrpcClient } from '@mysten/sui/grpc';

const client = new SuiGrpcClient({
  baseUrl: 'https://fullnode.mainnet.sui.io',
  network: 'mainnet',
});

// name → address
const { record } = await client.nameService.lookupName({ name: 'audric.sui' });
console.log(record.targetAddress);   // 0x…
console.log(record.expirationTimestamp); // when the name expires

// address → default name
const rev = await client.nameService.reverseLookupName({ address: '0x…' });
console.log(rev.record?.name);
```

## Resolve (JSON-RPC — works today, deactivated July 31, 2026 on mainnet)

```bash
curl -s -X POST https://fullnode.mainnet.sui.io \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"suix_resolveNameServiceAddress","params":["audric.sui"]}'
# → {"jsonrpc":"2.0","id":1,"result":"0x…"}
```

Use only as a stopgap in environments without a gRPC client. Migrate before the cutoff.

## Registering and managing names

Registration, renewals, and subnames are transactions — use [suins.io](https://suins.io) (browser) or the [`@mysten/suins` SDK](https://docs.suins.io/developer/sdk) (programmatic). The Audric Passport mints `@handle` → `<label>.audric.sui` leaves this way; agents need no SuiNS name (Agent ID name + #id + address).

## Gotchas

- Names are lowercase; normalize before lookup.
- `expirationTimestamp` matters — an expired name stops resolving. Surface it when the user is about to rely on a name long-term.
- The name's **owner** (NFT holder) and **target address** are different fields — a name can point anywhere its owner sets.
