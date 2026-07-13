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
        │   RAIL 1 — PRIVATE INFERENCE  │        │    RAIL 2 — x402 GATEWAY      │
        │   api.t2000.ai/v1             │        │    mpp.t2000.ai               │
        │   OpenAI-compatible · ZDR     │        │    every major AI + data API  │
        │   + confidential GPU-TEE tier │        │    pay-per-call USDC, gasless │
        └──────────────┬────────────────┘        └──────────────┬────────────────┘
                       │ receipts + anchors                     │ settlement + verify
                       ▼                                        ▼
        ┌─────────────────────────────────────────────────────────────────────────┐
        │                            SUI MAINNET (gRPC)                           │
        │   USDC · gasless sponsor · confidential_anchor · agent_id::registry     │
        └─────────────────────────────────────────────────────────────────────────┘
```

Consumers of the rails: **Audric** (audric.ai, consumer AI app — separate repo) and the
planned developer engine (`t2 connect` / `t2 code` — `spec/SPEC_INFERENCE_DEMAND`).

---

## Surfaces

| Domain | App | Repo | Hosting | What it serves |
|---|---|---|---|---|
| `api.t2000.ai` | `/v1` routes in audric web-v3 | audric | Vercel (shared project with audric.ai) | Private Inference: chat completions, models, ACI receipts/attestation |
| `mpp.t2000.ai` | `apps/gateway` | t2000 | Vercel (isolated project + DB) | x402 gateway: catalog, 402 endpoints, explorer, activity |
| `agents.t2000.ai` | `apps/console` | audric | Vercel | t2 Agents: skills shelf home, `/agents` directory, console (keys · billing · usage · ownership) |
| `t2000.ai` | `apps/web` | t2000 | Vercel | Marketing site + skills served as markdown (`/skills/*`, `feed.json`) |
| `developers.t2000.ai` | `apps/docs` | t2000 | Mintlify | Developer docs (auto-deploys from `main`) |
| `verify.t2000.ai` | `apps/verify` | t2000 | Vercel | Public confidential-receipt explorer + paste-to-verify |
| `audric.ai` | web-v3 | audric | Vercel | Consumer AI app (its own architecture — see the audric repo) |
| `suimpp.dev` | separate repo | suimpp | Vercel | x402-on-Sui protocol spec + docs (no DB) |

**Deliberate coupling:** `api.t2000.ai` rides the audric web-v3 Vercel project (shared
Neon + Redis) — one identity + one credit ledger across the console, the API, and Audric
is a product decision. The gateway is fully isolated (own project, DB, Redis, keys).

---

## Packages (npm, lockstep version)

| Package | What it is |
|---|---|
| `@t2000/sdk` | TypeScript wallet core — send (gasless USDC/USDsui), swap (Cetus aggregator), pay (x402), history (GraphQL), balance, limits (`LimitEnforcer`), `verifyReceipt`. gRPC-only transport. |
| `@t2000/cli` | `t2` — init · fund · balance · send · swap · pay · history · status · chat · verify · export · limit · services · skills · mcp · agent (identity subcommands) |
| `@t2000/mcp` | MCP server (stdio) — 13 tools + one prompt per skill, skill bodies baked at build time |
| `@t2000/id` | `agent_id::registry` client — `buildRegisterTx`, `buildUpdateTx`, ownership txs; ids baked for mainnet |
| `@suimpp/mpp` | The x402/MPP Sui payment method (client + server verification) — suimpp repo |

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
   `phala/*` **confidential tier** served from GPU-TEE enclaves.
3. **Billing.** Metered per request at the served model's live price × its margin,
   debited from the append-only micro-USD credit ledger (card top-up via Stripe, or
   gasless USDC/USDsui top-up from a Passport; one ledger shared with Audric).
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
                                           verifyReceipt in the SDK · verify.t2000.ai
```

Invariants (full detail: `.cursor/rules/confidential-ai-verify.mdc`):
**confidential = pure completion** (no tools/search/memory — nothing leaves the
enclave); **anchor-every**, not on-demand; receipts in **Redis, not Walrus**; honest
trust boundary — TDX quote + signature + anchor are trustless, the gateway's plaintext
leg is ZDR (contractual), not E2E.

---

## Rail 2 — x402 Gateway (`mpp.t2000.ai`)

Pay-per-call USDC for every major AI + data API. No accounts, no API keys, no gas.

### Payment lifecycle

```
Agent                            Gateway                              Sui
  │── POST /openai/v1/… ──────────►│
  │◄─ 402 (x402 envelope) ─────────│   challenge HMAC-bound to this server
  │                                │
  ├─ build + sign USDC transfer (gasless, sign-then-settle)
  │── retry + payment credential ─►│
  │                                │── verify on-chain (gRPC) ─────────►│
  │                                │   success · amount · recipient
  │                                │── proxy upstream (key injected     │
  │                                │   server-side from env)            │
  │◄─ 200 + x-payment-receipt ─────│
```

- **Dual-dialect:** native x402 envelopes + the legacy MPP header dialect are both
  served (pre-x402 CLIs keep working). Discovery: `/.well-known/x402.json`,
  `/api/services` (catalog SSOT: `apps/gateway/lib/services.ts`), `/llms.txt`.
- **Stateless verification:** HMAC-signed challenges (no DB lookup), then an on-chain
  check of the digest — status, USDC amount, treasury recipient.
- **No-charge-on-failure:** a failed upstream call auto-refunds the payer from the
  treasury (sub-$0.01 dust guard).
- **Key isolation:** upstream API keys exist only as gateway env vars; agents never
  see them.
- **Payment log:** gateway-owned Neon (service, endpoint, amount, digest, sender) —
  feeds `/activity` and the public stats; aggregates only, no address profiling.
- **Margin:** ~2× upstream list price.

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
(Sui mainnet). Dormant by design (`PRODUCT.md`) — no build until autonomous agents
holding money need the owner/kill-switch story.

- **Register:** `t2 init` / `t2 agent register` / `t2 agent create` — sponsored,
  gasless, idempotent. Address-anchored (plus an ERC-8004-style numeric id).
- **@handles:** `t2 agent handle alice` → `alice.agent-id.sui` (SuiNS, custody-minted,
  unique on-chain, releasable by the current target only).
- **Ownership:** two-sided — the agent *proposes* (`t2 agent link <passport>`), the
  owner *confirms* (console or `t2 agent confirm`); `unlink`/deactivate are the
  kill-switch. Nobody can claim an agent unilaterally.
- **Profile:** name/image/description/links, challenge-signed, no gas.
- **Directory:** public JSON at `api.t2000.ai/v1/agents` (ERC-8004
  `registration-v1`-compatible) + human profiles at `agents.t2000.ai`.

---

## MCP server + skills

**`@t2000/mcp`** (stdio; installed by `t2 mcp install` into Claude Desktop / Cursor /
Windsurf configs) — 13 tools:

| Category | Tools |
|---|---|
| Read | `t2000_balance` · `t2000_address` · `t2000_receive` · `t2000_history` · `t2000_services` · `t2000_agents` · `t2000_models` |
| Write | `t2000_send` · `t2000_swap` · `t2000_pay` |
| Inference | `t2000_chat` (needs `T2000_API_KEY`) · `t2000_verify` |
| Config | `t2000_limit` |

Every write goes through the SDK's limit gate. One prompt per skill is auto-registered;
skill bodies are baked into the bundle at build time.

**Skills** (`t2000-skills/`) are live markdown playbooks any skill-reading agent can
follow — the t2000 set (setup, send, receive, balance, pay, swap, services, verify,
mcp) plus Sui ecosystem skills (sui-grpc, suins, deepbook, walrus). Served as plain
markdown at `t2000.ai/skills/<slug>`, discoverable via
`/.well-known/agent-skills/index.json`, and rendered as the shelf on `agents.t2000.ai`
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
  line: v8.x; the next release is a major (v9 — CLI command removals).
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
