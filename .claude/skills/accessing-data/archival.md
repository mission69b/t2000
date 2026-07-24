# Archival Store

Source: https://docs.sui.io/concepts/data-access/archival-store

**Beta.** The Archival Store is functional but still in beta — expect possible changes to availability, retention guarantees, and operator configuration.

## What it is

From the docs:
> The Archival Store provides "long-term storage and access to historical network data that might no longer be available on full nodes because of pruning."
> Full nodes "enforce limited retention for scalability and performance," which is why this archival infrastructure exists — to preserve data after nodes discard it.

It retains:
- Old transactions.
- Old checkpoints.
- Old object versions (point-in-time state).

## Why pruning exists

Full nodes serve real-time queries. Retaining the entire history on every node would balloon storage and degrade query performance. Pruning lets full nodes stay fast by offloading older data to the archival backbone.

## Access model

The Archival Store is **not** accessed via a separate archival API or dedicated endpoint. Instead, it is accessed transparently through the standard Sui data APIs — gRPC and GraphQL RPC — which route to the archival backend when the requested data has been pruned from the primary store.

**GraphQL RPC** routes supported historical point lookups (transactions, objects, checkpoints) to archival transparently when the operator has configured archival backing. For most apps using a properly configured GraphQL stack, the Archival Store is invisible — you query the same GraphQL endpoint you always use, and the service fetches from archival as needed. Note: this routing is operator-configured — if the GraphQL operator has not set up archival backing, retention is limited to the Postgres database's retention policy.

**gRPC** also serves archival data transparently when the full node operator has configured archival backing. The client queries the same gRPC endpoint as usual; the node resolves pruned data from archival behind the scenes.

In both cases, clients do not need to know whether the data comes from the live store or the archival backend — the routing is handled server-side.

## When it matters

- **Compliance / audit** — proving on-chain activity from months or years ago.
- **Dispute resolution** — "what did this object look like at checkpoint X?".
- **Long-range analytics** — backfilling a custom indexer from deep history.
- **Historical explorers** — letting users browse old transactions beyond the live full node retention.

## Example: historical object version

GraphQL RPC is the easiest way to request a specific past version:

```graphql
query { object(address: "0x...", version: 42) { ... } }
```

If version 42 has been pruned from the full node, GraphQL RPC pulls it from the archival backbone. No client-side logic needed.

## For custom indexer backfills

When seeding a custom `sui-indexer-alt` pipeline from history, point the backfill source at the checkpoint GCS bucket (e.g., `gs://mysten-mainnet-checkpoints-use4`) rather than the archival service — the buckets are the canonical historical source for checkpoint ingestion. The Archival Store is the **query-side** counterpart to this; the backfill side of a custom indexer reads checkpoints directly.

## Common mistakes

- **Assuming full nodes have the whole history.** They don't. Past the pruning horizon, the archival path kicks in — if the operator hasn't configured archival backing, you see "not found."
- **Trying to call a direct archival API endpoint.** There is no separate archival endpoint for clients to call. The Archival Store is accessed transparently through the standard gRPC and GraphQL RPC APIs. The server routes to archival behind the scenes.
- **Confusing "Archival Store" with "checkpoint store."** Checkpoint store (GCS buckets) is the canonical checkpoint archive for backfill ingestion. Archival Store is the query-side service that serves pruned reads to gRPC/GraphQL clients. Related but distinct.
