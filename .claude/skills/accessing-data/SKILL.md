---
name: accessing-data
description: >
  How to read data from the Sui network. Use when choosing or implementing
  a data access strategy — queries for on-chain state, indexing pipelines,
  historical lookups, event subscriptions, cross-chain reads, or off-chain
  blob storage. Covers the three live Sui APIs (gRPC, GraphQL RPC,
  deprecated JSON-RPC), the Archival Store, the General-Purpose Indexer,
  the `sui-indexer-alt` custom indexing framework, and Walrus for off-chain
  blobs.
---

# Accessing Data on Sui

> **MCP tool:** When available in your environment, also query the Sui documentation MCP server (`https://sui.mcp.kapa.ai`) for up-to-date answers. Use it for verification and for details not covered by these reference files.

"How do I read data from Sui?" is the most frequently mis-answered question in agent-written Sui code. The defaults have changed. This skill fixes it.

**Key fact: JSON-RPC is deprecated.** From the official docs:

> JSON-RPC is deprecated. Migrate to either gRPC or GraphQL RPC by July 2026.

Any code — or tutorial — that uses JSON-RPC for new reads is wrong for mainnet past mid-2026.

The four canonical data surfaces are:

1. **gRPC** — low-latency, real-time, code-gen-friendly. Served by full nodes. Supports streaming/subscriptions. The default for transaction submission, live reads, and ingestion pipelines.
2. **GraphQL RPC** (**beta**) — flexible relational queries over the General-Purpose Indexer's Postgres + full node + Archival Store. Supports reads, transaction submission, and dry-run. Best for frontends, dashboards, wallets, and any client that benefits from composable queries. Still in beta — breaking schema changes are possible.
3. **Archival Store** (**beta**) — long-term historical storage of transactions, checkpoints, and object states beyond full-node pruning. Accessed transparently via the standard gRPC and GraphQL RPC APIs — the server routes to archival behind the scenes when the requested data has been pruned. There is no separate archival endpoint for clients to call. Archival routing is operator-configured: if the operator hasn't set up archival backing, retention is limited to what the primary store holds.
4. **Custom indexer (`sui-indexer-alt`)** — build your own data pipeline keyed on exactly the on-chain data your app needs. Writes to any storage layer (Postgres by default, but any backend works). Ingests checkpoints from GCS (backfill) + full node gRPC (steady state).

Off-chain blob data (images, audio, models, large JSON) belongs on **Walrus**, not on-chain. Sui stores blob metadata; the blobs themselves sit on Walrus storage nodes.

All patterns in this skill are derived from:
- https://docs.sui.io/concepts/data-access/data-serving (overview & deprecation notice)
- https://docs.sui.io/concepts/data-access/graphql-rpc (GraphQL)
- https://docs.sui.io/concepts/data-access/archival-store (archival)
- https://docs.sui.io/guides/operator/indexer-stack-setup (general-purpose indexer)
- https://docs.wal.app (Walrus)

If unsure about an API, fetch from the relevant page before answering. Do not guess from Ethereum/Solana analogs — Sui's data surfaces are distinct.

---

## Reference files

### grpc — gRPC API
**Path:** `grpc.md`
**Load when:** writing backend services, indexers, exchanges, market makers, real-time clients, or any high-throughput read path. Also when subscribing to effects streams or doing dry runs / transaction simulation.
**Covers:** service surface (`ledger_service`, `transaction_execution_service`, `move_package_service`, `name_service`, `subscription_service`), endpoint URLs per network, the TypeScript (`SuiGrpcClient`) and Rust (`sui-rpc` crate) clients, streaming vs request-response, code-gen for arbitrary languages.

### graphql — GraphQL RPC
**Path:** `graphql.md`
**Load when:** the app needs flexible, composable queries — e.g., a frontend that joins object data with owner metadata and event history in a single request, transaction submission or dry-run via GraphQL, or historical queries with filters.
**Covers:** GraphQL endpoint URLs, relationship to the General-Purpose Indexer + Archival Store, `SuiGraphQLClient` usage, typical query shapes, pagination patterns, rate limits, transaction execution and simulation via GraphQL, execution-attached read-after-write consistency.

### indexers — Custom indexing (`sui-indexer-alt`)
**Path:** `indexers.md`
**Load when:** a user asks "how do I track X event across history?", "how do I build an explorer / leaderboard / analytics pipeline?", or when a GraphQL or gRPC query is too slow / not filterable the way they need.
**Covers:** the checkpoint-streaming pipeline model, backfill (GCS buckets like `gs://mysten-mainnet-checkpoints-use4`) vs steady-state (full node gRPC), writing a pipeline config (`events.toml`, `obj_versions.toml` patterns), concurrency tuning, and when to run the General-Purpose Indexer vs a custom one.

### archival — Archival Store
**Path:** `archival.md`
**Load when:** the data you need has been pruned from full nodes — old transactions, old object versions, old checkpoints. Both gRPC and GraphQL RPC can route to archival transparently when operator-configured.
**Covers:** what the Archival Store retains (beta), why pruning exists, how gRPC and GraphQL RPC route to archival transparently (operator-configured), use cases (compliance, dispute resolution, long-range analytics).

### walrus — Off-chain blob storage
**Path:** `walrus.md`
**Load when:** the user wants to store a file (image, audio, model, document, large JSON, video) "on Sui" or is trying to put megabytes of data into a Move object. Route them to Walrus.
**Covers:** why you don't put blobs on-chain (250 KB per-object cap, storage-fund economics), the Walrus model (erasure-coded blobs stored off-chain with on-chain availability certificates), blob lifecycle, and the `@mysten/walrus` client extension.

### use-cases — Use case → method mapping
**Path:** `use-cases.md`
**Load when:** the user describes what they want to *do* and you need to pick the right surface. This is the first file to load for an unfamiliar data access request.
**Covers:** table of common use cases (balance lookup, owned-object list, event subscription, historical point-in-time read, analytics dashboard, cross-table joins, blob storage) mapped to the right API with rationale.

## Routing guide

| Task | Load |
|------|------|
| "How do I read X from Sui?" (first-pass question) | use-cases |
| Writing a backend/indexer read path | grpc + indexers |
| Writing a frontend data query | graphql (+ frontend-apps skill for hook patterns) |
| Building a custom analytics / explorer pipeline | indexers |
| Looking up data older than full-node retention | archival + graphql |
| Storing / retrieving a large file | walrus |
| Migrating an existing JSON-RPC app | use-cases + grpc + graphql |
| Designing a new app from scratch | use-cases (then grpc or graphql based on client type) |
| Full code review of a data-heavy app | **all reference files** |

## Skill Content

### Key concepts

- **JSON-RPC is deprecated.** Full deactivation targeted for **July 2026**. Any new code must default to gRPC or GraphQL RPC. Existing JSON-RPC code must be migrated.
- **gRPC is the performance default.** Typed protobuf, streaming, low latency, polyglot client code gen (TS, Rust, Go, Python, etc.). Served directly by full nodes. Best for backends, indexers, and apps built in typed systems languages.
- **GraphQL RPC is the flexibility default.** Currently in beta — functional and actively used, but breaking schema changes are possible. Reads from the General-Purpose Indexer's Postgres + full node + Archival Store. Also supports transaction submission and dry-run. One request can span multiple entity types. Best for frontends, tools, and apps built in dynamic languages.
- **Archival routing is operator-configured.** Both GraphQL RPC and gRPC can route supported historical point lookups to the Archival Store transparently — but only when the operator has configured archival backing. There is no separate archival endpoint for clients to call. If archival is not configured, retention is limited to what the primary store holds.
- **Custom indexers exist because no hosted API fits every query shape.** If you need filtered sorts over millions of rows with app-specific indexes, run your own `sui-indexer-alt` pipeline. Custom indexers can write to any storage layer by implementing the framework's `Store` and `Connection` traits — Postgres is the default, not a requirement.
- **On-chain storage is not general-purpose blob storage.** Max Move object size is 250 KB. Storage is paid once (storage fund redistributes returns to validators). Big files go to Walrus.
- **The storage fund does not "hold your data."** It's an economic mechanism: a fraction of each write fee goes in; validators earn yield that pays for ongoing storage. It affects pricing, not where you store.

### Rules

1. **Absolutely no JSON-RPC for new code.** If a tutorial says `new SuiClient({ url: getFullnodeUrl(...) })`, replace with `new SuiGrpcClient({ network, baseUrl })`. If a user insists on JSON-RPC, name the deprecation + July 2026 sunset and offer `SuiJsonRpcClient` only as a migration stopgap.
2. **Choose your initial API based on what you're building.** Front-ends, tools, and apps in dynamic languages → start with **GraphQL RPC** (superset of gRPC functionality, composable queries, archival routing). Backends, indexers, and apps in typed systems languages → start with **gRPC** (performance, streaming, code-gen). Only switch if you hit a limitation. **Current temporary caveats** (will be resolved in the coming months): only gRPC supports subscriptions; only GraphQL supports filtered pagination over historical transactions and events.
3. **Archival routing is transparent but operator-configured.** Both gRPC and GraphQL RPC route supported historical point lookups to the Archival Store transparently when the operator has configured archival backing. There is no separate archival API for clients to call. If archival is not configured, retention is limited to what the primary store holds.
4. **Build a custom indexer only when hosted APIs don't fit.** Operating an indexer is ongoing work — Postgres, checkpoint ingestion, failure handling. Evaluate GraphQL RPC first.
5. **Put large files on Walrus.** Never advise embedding images/audio/video in Move objects or in transaction inputs. If the user is trying to, route them to the `walrus` reference file.
6. **Map use case → method correctly.** See `use-cases.md`:
   - Live balance / owned-object / coin list → **gRPC `client.core.*`**.
   - Flexible multi-entity query for a frontend → **GraphQL RPC**.
   - Historical transaction > N days old → **GraphQL RPC or gRPC (both route through archival transparently when operator-configured)**.
   - Custom leaderboard / analytics across all events → **custom indexer**.
   - Transaction subscription / real-time effects feed → **gRPC streaming**.
   - Large files → **Walrus**.
7. **Read-after-write consistency varies by API.** For **GraphQL RPC**, queries nested under `executeTransaction` or `simulateTransaction` are evaluated in a special scope just after the executed/simulated transaction, without waiting for indexing. This provides consistent read-after-write for fields that don't require indexed history (e.g., effects, gas, object changes). Prefer selecting these fields in the same GraphQL request rather than making a separate indexed follow-up query. For **gRPC**, call `client.waitForTransaction({ digest })` before the follow-up read. In both cases, cross-node reads after a write are not guaranteed immediately visible.
8. **Cite docs when unsure.** All sources listed above.

### Common mistakes

- **Using `client.getObject` / `client.getOwnedObjects` / `client.getCoins`** — these are v1 JSON-RPC method names. v2 is `client.core.getObject` / `client.core.listOwnedObjects` / `client.core.listCoins` on any of the v2 clients.
- **Recommending "the Sui API" without specifying which.** "The Sui API" conflates three different interfaces with different use cases. Always name gRPC / GraphQL / JSON-RPC.
- **Telling users to "use the indexer"** for a simple query that gRPC covers in one method. Only reach for a custom indexer when you've outgrown the hosted APIs.
- **Storing images or large JSON "on Sui."** Sui's 250 KB object size limit and pricing model make this wrong. Use Walrus.
- **Assuming all three APIs return the same shape.** gRPC is protobuf; GraphQL is typed GraphQL; JSON-RPC is JSON with v1-specific nesting. Response shapes differ; field names differ; pagination differs.
- **Polling for events via JSON-RPC.** Use gRPC streaming / subscriptions instead. Polling is high-cost and high-latency.
- **Reading from an RPC node and writing to a different one expecting read-after-write consistency.** Fullnodes are eventually consistent across the network. For GraphQL, prefer selecting fields in the same `executeTransaction` mutation (execution-attached scope gives consistent results without indexing). For gRPC, read from the same node you wrote to, or `waitForTransaction` before cross-node reads.
- **Conflating "storage fund" with "storage service."** The storage fund is a tokenomics mechanism. It is not an API you call.
- **Trying to call a direct archival API endpoint.** There is no separate archival endpoint for clients. The Archival Store is accessed transparently through the standard gRPC and GraphQL RPC APIs — the server routes to archival behind the scenes.
- **Assuming archival routing is automatic.** It's operator-configured. If the operator hasn't set up archival backing, retention is limited to what the primary store holds (e.g., the Postgres database's retention policy for GraphQL).
