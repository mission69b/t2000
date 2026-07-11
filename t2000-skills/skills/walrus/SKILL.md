---
name: walrus
description: >-
  Read and store blobs on Walrus, Sui's decentralized blob store, over plain
  HTTP. Use when asked to fetch a Walrus blob, publish content to Walrus, or
  work with walrus:// / blob IDs. Reads are free; mainnet writes need your
  own publisher.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: curl (reads) · a publisher or the Walrus SDK (mainnet writes)
---

# Walrus: Read + store blobs

## Purpose

Walrus stores blobs (files, JSON, sites) across Sui storage nodes. Two HTTP roles:

- **Aggregator** — read blobs (`GET`)
- **Publisher** — store blobs (`PUT`)

Reference endpoints (Mysten-operated; full API spec at `<endpoint>/v1/api`):

| Role | Network | Endpoint |
|---|---|---|
| Aggregator | Mainnet | `https://aggregator.walrus-mainnet.walrus.space` |
| Aggregator | Testnet | `https://aggregator.walrus-testnet.walrus.space` |
| Publisher | Testnet | `https://publisher.walrus-testnet.walrus.space` |

## Rules

1. **Reads are free and unauthenticated.** Any agent can `GET` any blob by ID.
2. **There is no public mainnet publisher.** Mainnet writes consume SUI + WAL on the publisher side — run your own, use an upload relay, or use the TypeScript SDK. Don't hunt for a free mainnet PUT endpoint; it doesn't exist by design.
3. **Blobs are public.** Never store secrets or personal data unencrypted.
4. **Blobs expire by epoch.** A stored blob lives for the epochs paid for — surface the `endEpoch` from the store response if the user needs durability.

## Read a blob

```bash
# by blob ID (the u256 ID, base64url — what walrus:// links carry)
curl -s "https://aggregator.walrus-mainnet.walrus.space/v1/blobs/<BLOB_ID>"

# by the Sui object ID of the Blob object
curl -s "https://aggregator.walrus-mainnet.walrus.space/v1/blobs/by-object-id/<OBJECT_ID>"
```

## Store a blob (testnet — free)

```bash
curl -s -X PUT "https://publisher.walrus-testnet.walrus.space/v1/blobs" -d "hello walrus"
# → {"newlyCreated":{"blobObject":{"blobId":"V7Zv…","size":28,…}}}
# store for N epochs: …/v1/blobs?epochs=5
# send the Blob object to a wallet: …/v1/blobs?send_object_to=0x…
```

Then read it back from the testnet aggregator:

```bash
curl -s "https://aggregator.walrus-testnet.walrus.space/v1/blobs/V7Zv…"
```

Verified round-trip: `PUT` → `blobId V7ZvHXobPNriNB9f2PD8g_VWnAVIgKWAbPYxQZP9464` → `GET` returned the exact bytes.

## Store on mainnet

Pick one:

- **Run a publisher** — `walrus publisher` with a funded wallet ([operator guide](https://docs.wal.app/docs/operator-guide/aggregators/operating-aggregator)).
- **Upload relay / TypeScript SDK** — integrate `@mysten/walrus` directly; the SDK pays with your wallet's WAL + SUI.

## Gotchas

- If you store then immediately read a blob and get a 404 through a CDN-fronted aggregator, retry with backoff — the 404 may be cached from before propagation.
- A re-`PUT` of identical bytes returns `alreadyCertified` (same blob ID) instead of `newlyCreated` — idempotent, not an error.
- Most public endpoints cap requests at 10 MiB.

Live docs: [docs.wal.app](https://docs.wal.app/docs/network-reference).
