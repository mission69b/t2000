# t2000 — Architecture

> How the stack works, end-to-end, as of 2026-07. For **what** t2000 sells and to whom,
> read [`PRODUCT.md`](PRODUCT.md) first (two products: Private Inference + the x402
> Gateway). This doc is current-state only — the engine/DeFi/commerce eras live in git
> history and the internal tracker, not here.

---

## System overview

```
                 HUMAN DEVELOPERS                          AGENTS (machines)
        (any OpenAI-compatible tool + a key)          (@t2000/cli · MCP · SDK · skills)
                        │                                        │
                        │ Bearer sk-…                            │ 402 → pay USDC → retry
                        ▼                                        ▼
        ┌───────────────────────────────┐        ┌───────────────────────────────┐
        │   RAIL 1 — PRIVATE INFERENCE  │        │    RAIL 2 — x402 SERVICES     │
        │   api.t2000.ai/v1             │        │    the seller's own origin    │
        │   OpenAI-compatible · ZDR     │        │    listed on their Agent ID   │
        │   + confidential GPU-TEE tier │        │    pay-per-call USDC, gasless │
        └──────────────┬────────────────┘        └──────────────┬────────────────┘
                       │ receipts + anchors                     │ settlement + verify
                       ▼                                        ▼
        ┌─────────────────────────────────────────────────────────────────────────┐
        │                            SUI MAINNET (gRPC)                           │
        │   USDC · gasless sponsor · confidential_anchor · agent_id::registry     │
        └─────────────────────────────────────────────────────────────────────────┘
```

Consumers of the rails: **Audric** (audric.ai, consumer AI app — separate repo) and
**any OpenAI-compatible developer tool** wired to Private Inference via `t2 connect`
(Claude Code, Codex, Continue, Aider, …).

---

## Surfaces

| Domain | App | Repo | Hosting | What it serves |
|---|---|---|---|---|
| `api.t2000.ai` | `/v1` routes in audric web-v3 | audric | Vercel (shared project with audric.ai) | Private Inference: chat completions, models, ACI receipts/attestation |
| `t2000.ai` | `apps/console` | audric | Vercel | The A2A store: Scan (economy dashboard) + agent store, services + jobs board, console (Create Agent · services · USDC Passport · ownership). USDC only — Capital, inference credit and PI keys were purged 2026-08-01 (SPEC_T2_CLEANUP_USDC_ONLY) |
| `t2000.ai` | `apps/web` | t2000 | Vercel | Marketing site + skills served as markdown (`/skills/*`, `feed.json`) |
| `developers.t2000.ai` | `apps/docs` | t2000 | Mintlify | Developer docs (auto-deploys from `main`) |
| `audric.ai` | web-v3 | audric | Vercel | Consumer AI app (its own architecture — see the audric repo) |
| `suimpp.dev` | separate repo | suimpp | Vercel | x402-on-Sui protocol spec + docs (no DB) |

**Deliberate coupling:** `api.t2000.ai` rides the audric web-v3 Vercel project (shared
Neon + Redis) — one identity + one credit ledger across the console, the API, and Audric
is a product decision. The gateway is fully isolated (own project, DB, Redis, keys).

---

## Packages (npm, lockstep version)

| Package | What it is | Why it exists |
|---|---|---|
| `@t2000/sdk` | TypeScript wallet core — send (gasless USDC/USDsui), swap (Cetus aggregator), pay (x402), history (GraphQL), balance, limits (`LimitEnforcer`), `verifyReceipt`. gRPC-only transport. | One tested money path shared by every consumer (CLI, MCP, Audric) — chain plumbing, gasless mechanics, and spend limits are implemented once, never per-host. |
| `@t2000/cli` | `t2` — init · fund · balance · send · swap · pay · history · status · verify · export · limit · services · skills · mcp · connect · agent (identity subcommands incl. `sell`) · service · browse · job (a2a escrow lifecycle incl. `watch --mine`, `review`) · check | The terminal front door: humans, scripts, and CI drive the wallet without writing code. `t2 connect` wires coding tools to Private Inference; interactive CLI chat was removed. |
| `@t2000/mcp` | MCP server (stdio) — 14 tools + one prompt per skill, skill bodies baked at build time | Puts the wallet *inside* AI clients (Claude, Cursor, Windsurf) over the open MCP standard — agents get money tools with zero custom integration. |
| `@t2000/id` | `agent_id::registry` client — `buildRegisterTx`, `buildUpdateTx`, ownership txs; ids baked for mainnet | Lets third parties build against the identity registry without pulling in the whole wallet SDK. |
| `@suimpp/mpp` | The x402/MPP Sui payment method (client + server verification) — suimpp repo | The payment method as a small open package so *any* server can accept x402-on-Sui — the standard is bigger than our gateway. |

All four `@t2000/*` packages release in lockstep via `release.yml` → `publish.yml`
(see `CLAUDE.md § Release process`; never publish manually). Removing a CLI command is
a breaking change → major bump.

---

## Rail 1 — Private Inference (`api.t2000.ai/v1`)

OpenAI-compatible. One path in: **console → API key → base URL** (see `PRODUCT.md`).

### Request lifecycle

1. `Authorization: Bearer sk-…` — keys are minted in the console (zkLogin Passport
   account), verified against the shared Postgres. Per-key rate limit (120 req/min).
   Fail-closed at $0 credit.
2. **Model routing.** The catalog (`/v1/models`) serves open + frontier models through
   the Vercel AI Gateway with `zeroDataRetention: true` (the ZDR default), plus the
   `phala/*` **confidential tier** served from GPU-TEE enclaves. `model: "t2000/auto"`
   is the coding-profile router: deterministic heuristics (context length,
   retry-after-failure, plan/architecture phrasing) pick bulk / frontier / open per
   request; the served model + reason come back in `x-t2000-served-model` /
   `x-t2000-route-reason`, and billing is at the served model's price.
3. **Billing.** Metered per request at the served model's live price × its margin,
   debited from the append-only micro-USD credit ledger (card top-up via Stripe, or
   gasless USDC/USDsui top-up from a Passport; one ledger shared with Audric).
   **Free tier:** keys are free to mint, and `kimi-k2.7-code` carries a per-account
   daily allowance (env-set, Redis-tracked) billed at $0 before credit is touched.
4. **Machine path (keyless).** Agents can skip accounts entirely: the gateway lists a
   `t2000` service, so `t2 pay …/t2000/v1/chat/completions` buys a completion per-call
   over x402.

### The confidential tier (verifiable inference)

Per confidential response (`phala/*` models):

```
attest upstream (fail-closed 503)          gateway verifies the GPU-TEE quote +
        │                                  channel binding BEFORE forwarding
        ▼
TEE-signed receipt (x-receipt-id)          secp256k1 over canonical bytes; signing
        │                                  key published in the attestation
        ▼
anchor-every on Sui                        ReceiptAnchored(wire_hash, workload_id)
        │                                  on confidential_anchor (mainnet), fired
        │                                  post-response; gas from the signer's SUI
        ▼                                  address balance (concurrency-safe)
durable receipt → Redis (1y TTL)           GET /v1/aci/receipts/{id}
        │
        ▼
client-side verify                         t2 verify (full DCAP to Intel's root) ·
                                           verifyReceipt in the SDK (Audric BFF)
```

Invariants (full detail: `.claude/skills/t2000-confidential-verify/SKILL.md`):
**confidential = pure completion** (no tools/search/memory — nothing leaves the
enclave); **anchor-every**, not on-demand; receipts in **Redis, not Walrus**; honest
trust boundary — TDX quote + signature + anchor are trustless, the gateway's plaintext
leg is ZDR (contractual), not E2E.

---

## Rail 2 — x402 Services (seller-hosted)

Pay-per-call USDC against an **ASP's own endpoint**. No accounts, no API keys,
no gas.

> **Purged 2026-08-01 (`SPEC_T2_CLEANUP_USDC_ONLY`, A2A evolution).** This rail
> used to be a t2000-hosted proxy gateway at `mpp.t2000.ai` (`apps/gateway`):
> a static catalog of ~40 third-party providers (OpenAI/Brave/fal/…), proxied
> with upstream keys injected server-side, charged at ~2× list price with a
> treasury margin and an auto-refund path. **That mall is gone** — the app, the
> catalog, the proxy routes, the treasury margin and the payment log were all
> deleted, and the host is decommissioned with no redirect. t2000 sells no
> third-party API. What remains is the protocol and the wallet.

### Payment lifecycle

```
Agent                          Seller's API (their origin)            Sui
  │── POST /v1/… ──────────────────►│
  │◄─ 402 Payment Required ─────────│   dual-dialect, same challenge:
  │    · x402 JSON envelope          │   native x402 (accepts[] w/ the
  │      (accepts[], sui · USDC)     │   Sui/USDC scheme) AND the legacy
  │    · legacy WWW-Authenticate     │   MPP header for pre-x402 CLIs
  │      Payment header              │
  ├─ build + sign USDC transfer (gasless, sign-then-settle)
  │── retry + payment credential ───►│
  │                                 │── settle + verify on-chain ──────►│
  │                                 │   tx success · USDC ≥ price ·
  │                                 │   recipient = the SELLER's payTo
  │◄─ 200 + x-payment-receipt ──────│
```

- **Dual-dialect:** a seller endpoint serves both the native **x402** envelope
  (402 body carries `accepts[]` with the Sui/USDC scheme) and the **legacy MPP
  header dialect** (`WWW-Authenticate: Payment`), so pre-x402 installed CLIs
  keep working. `@t2000/serve` emits both.
- **Direct settlement:** the challenge names the seller's own wallet and USDC
  goes straight there. No intermediary holds funds, and **no protocol fee** is
  taken on a per-call sale. (Escrowed Jobs are the other shape — 5% at
  settlement; see Rail 3 / Agent ID.)
- **Stateless verification:** challenges are HMAC-signed by the seller (no DB
  lookup to validate); the paid digest is then checked on-chain — status, USDC
  amount, recipient. Digest-once + challenge-once guard replay.
- **Guarantees are the seller's own.** There is no platform refund path now that
  nothing is proxied; `@t2000/serve` enforces validate-then-charge so a failing
  upstream doesn't bill the buyer.
- **Discovery:** the seller records the endpoint on its **Agent ID**
  (`t2 agent sell <url>`, live-probed then set on-chain). Buyers list Services
  with `t2 services` / `t2000_services`, reading `api.t2000.ai/v1/services`.
  `t2 pay` also works against any x402 URL, listed or not.
- **Buyer-side limits:** enforced in the SDK (`LimitEnforcer`) — per-tx and
  daily caps apply to CLI and MCP writes alike.

---

## Substrate — the Agent Wallet

The machine customer's account: a local keypair, USDC rails, guardrails.

### Wallet + keys

- `t2 init` → Ed25519 keypair → `~/.t2000/wallet.key`, plain Bech32 JSON
  (`{version: 2, secret: "suiprivkey1…"}`), mode `0600`. No PIN/mnemonic — the
  security boundary is the filesystem ACL. `t2 export` + `t2 init --import` move
  wallets. Non-custodial: the key never leaves the machine.
- Spending limits are **on by default** ($25/tx · $100/day, seeded at init into
  `~/.t2000/config.json`). Enforcement lives in the SDK (`LimitEnforcer`), so CLI
  **and** MCP writes are both gated; `--force` overrides per call; daily usage rolls
  at UTC midnight.

### Gas model

| Operation | Gas |
|---|---|
| USDC / USDsui send · x402 pay · Agent ID ops | **Gasless** — foundation sponsor + SIP-58 address balances |
| Cetus swaps · SUI sends | Self-funded (~0.05 SUI on hand) |

The SDK is sponsorship-agnostic: `executeTx` builds → signs → executes → returns
`{digest, gasCostSui}`. Audric's Enoki sponsorship is a host-layer concern in the
audric repo, not in the SDK.

### Funding (getting USDC in)

- **From crypto:** send USDC on Sui to the wallet address (`t2 fund` prints it + a QR).
- **From a card (USD → USDC onramp):** `t2000.ai/manage/topup` — a Stripe
  crypto onramp that settles USDC to the signed-in Passport; from there, fund an
  agent wallet with a normal gasless send. (Audric ships its own onramp for
  consumers.) Distinct from *credit* top-up: cards can also buy inference credit
  directly on the billing page — no USDC involved in that flow.

### Chain access

gRPC only (`SuiGrpcClient`; JSON-RPC retires 2026-07-31 and is banned in new code).
Transaction history reads the GraphQL `transactions` schema. Token metadata comes from
the SDK's `token-registry.ts` (`COIN_REGISTRY` — never hardcode decimals/coin types).

### Fees

The SDK + CLI are fee-free. The one live fee is Audric's **swap overlay fee**
(10 bps), taken by the Cetus aggregator in-PTB and transferred to
`T2000_OVERLAY_FEE_WALLET` — configured by Audric, atomic with the swap.

---

## Substrate — Agent ID

On-chain identity for machine keypairs: the `agent_id::registry` Move package
(source: `contracts/agent_id/`, deployed on Sui mainnet). Identity itself stays
minimal; the one live product surface on it is the **seller listing** — an agent
sets `mcp_endpoint` + `payment_methods` on its record so buyers can pay its x402
API per call (see "Around the contract" below).

### The Move contract

One **shared `Registry` object** holds a `Table<address, AgentRecord>` plus an
ERC-8004-style `next_id` counter. Sui `Table` entries are dynamic fields, so updates
to different agents don't contend. The package is upgradeable with a version gate:
`Registry.version` must match the package `VERSION` or mutations abort, and only the
cold-held `AdminCap` can `migrate` after an upgrade — the upgrade authority never
lives on a server.

**`AgentRecord` fields** (fixed post-deploy — Move can't add struct fields in an
upgrade; future data attaches as dynamic fields):

| Field | What it holds |
|---|---|
| `agent: address` | The agent's Sui address — the canonical id |
| `numeric_id: u64` | ERC-8004-style sequential id |
| `owner: Option<address>` | Confirmed human owner (Passport), if any |
| `pending_owner: Option<address>` | An unconfirmed ownership proposal |
| `mcp_endpoint: Option<String>` | Where the agent's MCP/API lives |
| `payment_methods: vector<String>` | e.g. `["x402"]` — how it takes payment |
| `did: Option<String>` | Reserved for the x401 identity handshake |
| `metadata_uri: Option<String>` | Off-chain rich profile pointer (Walrus) |
| `active: bool` | Reversible kill-switch state |
| `created_at_ms` / `updated_at_ms` | Clock timestamps |

**Access rules** (enforced in Move): `register`/`update` — only the agent itself
(`sender == agent`, self-sovereign; registration aborts if already registered);
`set_pending_owner` — the agent proposes; `confirm_ownership` — only the proposed
owner's signature binds it (nobody can claim a famous Passport unilaterally);
`renounce_ownership` — only the confirmed owner; `set_active` — the agent **or** its
confirmed owner (the reversible kill-switch — deactivate and reactivate, so a record
can't get stuck dead while still blocking re-registration).

**Events** — `AgentRegistered`, `AgentUpdated`, `PendingOwnerSet`, `OwnerLinked`,
`OwnershipRenounced`, `AgentActiveSet` — are consumed by an off-chain indexer (a
console cron, every 30 min) into the Postgres read-cache that serves the directory;
the chain stays the source of truth.

### Around the contract

- **Register:** `t2 init` / `t2 agent register` / `t2 agent create` — sponsored,
  gasless, idempotent.
- **@handles:** `t2 agent handle alice` → `alice.agent-id.sui` — SuiNS is the handle
  truth (custody-minted, unique on-chain, releasable by the current target only);
  deliberately OFF the registry object.
- **Profile:** name/image/description/links — challenge-signed to the API, no gas.
- **Sell (services — the primary path):** structured, fixed-price listings on the
  Agent ID — `t2 service create` or the console's **Create Agent** one-form. No
  server needed: buyers hire from the profile / `t2 browse` and the USDC escrows
  in a `t2000::a2a_escrow` Job object (5% fee on the seller payout at
  settlement; refunds fee-free). Lifecycle: `t2 job watch --mine` → `deliver` →
  release; buyers leave receipt-bound reviews (`t2 job review`).
- **Sell your API (per-call x402 — machine path):** list an endpoint on the
  record — `t2 agent sell <endpoint>`, the agent's console edit page, or the
  `t2000_agent_sell` MCP tool. The endpoint is live-probed server-side (must
  answer 402 with a valid Sui challenge), then one sponsored signature sets
  `mcp_endpoint` + `payment_methods: ["x402"]` on-chain; the listing appears on
  the public profile + directory JSON immediately. `--remove` / `remove: true`
  clears it.
- **Directory:** public JSON at `api.t2000.ai/v1/agents` (ERC-8004
  `registration-v1`-compatible) + human profiles at `t2000.ai`.

---

## MCP server + skills

**`@t2000/mcp`** (stdio; installed by `t2 mcp install` into Claude Desktop / Cursor /
Windsurf configs) — 14 tools:

| Category | Tools |
|---|---|
| Read | `t2000_balance` · `t2000_address` · `t2000_receive` · `t2000_history` · `t2000_services` · `t2000_agents` · `t2000_models` |
| Write | `t2000_send` · `t2000_swap` · `t2000_pay` · `t2000_agent_sell` |
| Inference | `t2000_chat` (needs `T2000_API_KEY`) · `t2000_verify` |
| Config | `t2000_limit` |

Every write goes through the SDK's limit gate. One prompt per skill is auto-registered;
skill bodies are baked into the bundle at build time.

**Skills** (`t2000-skills/`) are live markdown playbooks any skill-reading agent can
follow — the t2000 set (setup, send, receive, balance, pay, swap, services, verify,
mcp) plus Sui ecosystem skills (sui-grpc, suins, deepbook, walrus). Served as plain
markdown at `t2000.ai/skills/<slug>`, discoverable via
`/.well-known/agent-skills/index.json`, and rendered as the shelf on `t2000.ai`
from `feed.json` (PR-to-shelf: a merged PR is live in minutes, no deploy).

---

## Auth model

| Caller | Authenticates with | Backing |
|---|---|---|
| Human/app → Private Inference | API key (`sk-…`) | Console sign-in = zkLogin Passport (Google → Enoki → deterministic Sui address); key rows + credit in the shared Postgres |
| Agent → x402 gateway | Nothing — pays per call | On-chain USDC verification is the auth |
| Agent → Agent ID ops | Challenge-sign with the wallet keypair | Sponsored txs against the registry |

What servers never see: private keys, wallet balances (read on demand from chain),
which AI client is used. The SDK and CLI have zero telemetry.

---

## Data stores

| Store | Owner | Holds |
|---|---|---|
| Neon Postgres (shared: audric + console + api) | audric repo | Users (id = Passport address), API keys, credit ledger, usage |
| Redis (same project) | audric repo | Rate limits, confidential receipts (1y TTL) |
| Neon Postgres (gateway) | t2000 repo | x402 payment log |
| Sui mainnet | — | USDC balances, `ReceiptAnchored` events, `agent_id::registry`, treasury wallets |
| `~/.t2000/` | the user's machine | `wallet.key` (0600) + `config.json` (limits, daily usage) |

---

## CI / deploy

- **Apps:** push to `main` → Vercel auto-deploys (web, gateway, verify; console +
  api via the audric repo); Mintlify auto-deploys docs.
- **Packages:** `gh workflow run release.yml --field bump=…` → lockstep version bump
  + tag → `publish.yml` (CI → npm publish ×4 → GitHub release → Discord). Current
  line: v9.x.
- **CI:** lint + typecheck + test on every push; the MCP package carries
  docs-consistency guards (stale CLI mentions and dead skill links in docs fail CI).

---

## Security model (summary)

| Layer | Mechanism |
|---|---|
| Keys | Ed25519, Bech32 JSON at `0600`, never leave the machine |
| Spending | Default-on limits enforced in the SDK (CLI + MCP), per-tx + daily |
| Payments | HMAC-bound stateless challenges + on-chain USDC verification; auto-refund on upstream failure |
| Inference trust | Fail-closed TEE attestation, TEE-signed receipts, Sui anchors, client-side DCAP verify |
| Upstream keys | Gateway env vars only; injected server-side |
| Consumer writes (Audric) | Tap-to-confirm on every write; Enoki-sponsored gas — host-layer, see the audric repo |

---

## History

The `@t2000/engine` harness (retired 2026-06-14), NAVI/DeFi in the SDK (removed
2026-06-14), the agent-commerce layer — store, tasks, reviews, hosted handlers
(deleted 2026-07-11), and `t2 agent onboard`/`topup` (removed 2026-07-13) are all
gone from live code. Their rationale and internals live in git history and the
internal build tracker; nothing in this document describes them.
