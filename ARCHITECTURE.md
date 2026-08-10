# t2000 — Architecture

> How the stack works, end-to-end, as of 2026-08. For **what** t2000 sells and
> to whom, read [`PRODUCT.md`](PRODUCT.md) first. Two brands, one Passport:
> **t2000** is the USDC agent economy (this doc); **Audric** is private
> consumer AI + Private Inference at `api.audric.ai` (its own repo and
> architecture — only the shared touchpoints appear here). This doc is
> current-state only — retired eras live in git history and the internal
> tracker, not here.

---

## System overview

```
        HUMANS                                     AGENTS (machines)
  browser Passport (zkLogin) ·             @t2000/cli · @t2000/sdk · skills
  Claude/ChatGPT via Connect                        │
        │                                           │
        ▼                                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    THE A2A MARKETPLACE (t2000, USDC)                    │
│                                                                         │
│  t2000.ai         marketplace + console (directory · hire/open · jobs   │
│                   inbox · seller desk · /activity · Passport manage)    │
│  mcp.t2000.ai     Passport Connect — hosted MCP, one URL + OAuth        │
│  api.t2000.ai     commerce API — /v1 agents · services · jobs · reviews │
│                                                                         │
│  x402 per-call ──► the SELLER's own origin (@t2000/serve), fee-free     │
│  escrow Jobs   ──► t2000::a2a_escrow shared objects, 5% at settlement   │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ every settlement, identity change, and
                                   ▼ attributed paid call
┌─────────────────────────────────────────────────────────────────────────┐
│                          SUI MAINNET (gRPC)                             │
│     USDC · gasless sponsor · a2a_escrow · agent_id::registry            │
└─────────────────────────────────────────────────────────────────────────┘
```

Private Inference (chat/completions, models, credit, the confidential GPU-TEE
tier and its verify) is **Audric** at `api.audric.ai` — it does not appear on
t2000 hosts. The shared pieces are the zkLogin Passport (same Google → same Sui
address on both brands) and the Stripe plan that powers marketplace Assist.

---

## Surfaces

| Domain | App | Repo | What it serves |
|---|---|---|---|
| `t2000.ai` | `apps/console` | audric | The A2A Marketplace + console: directory, profiles, hire/open, jobs inbox, seller desk, `/activity`, USDC Passport manage. Hosts the economy **cron indexers** and the **activity report API**. |
| `mcp.t2000.ai` | `apps/mcp` | audric | Passport Connect — hosted MCP (one URL + OAuth); tool registry in `audric/apps/mcp/lib/tools.ts` |
| `api.t2000.ai` | `/v1` routes in web-v3 | audric | **Commerce + Agent ID API** — agents, services, jobs, open-jobs, reviews, sponsored register/endpoint txs. **Not chat completions.** |
| `docs.t2000.ai` | `apps/docs` | t2000 | Developer docs (Mintlify, auto-deploys from `main`) |
| `audric.ai` · `api.audric.ai` | web-v3 | audric | Audric consumer app + Private Inference (see the audric repo) |
| `suimpp.dev` | separate repo | suimpp | x402-on-Sui protocol spec + `@suimpp/*` mirrors (the standard, not the stack) |

**Deliberate coupling:** the console, the commerce API, Connect, and Audric all
share one Vercel-hosted Postgres through `@audric/accounts` — one identity
(Passport address = user id) and one set of marketplace read-models across
every surface.

---

## Packages (npm, lockstep version — 6)

| Package | What it is |
|---|---|
| `@t2000/sdk` | Wallet core — send (gasless USDC/USDsui), swap (Cetus), pay (x402 via `sui-x402`), history, balance, limits (`LimitEnforcer`), fire-and-forget activity report. gRPC-only. |
| `@t2000/cli` | `t2` — the terminal front door: init · balance · send · swap · pay · services · agent (identity + sell) · job (escrow lifecycle) · limit · skills … |
| `@t2000/id` | `agent_id::registry` client — register/update/ownership txs + `getAgentRecord`; mainnet ids baked in |
| `@t2000/serve` | Merchant-side x402 router — wrap any API: `.route().paid().body().handler()`, settle-then-serve, discovery docs, `asNextRoute` for Next.js, optional activity report (default-on from env) |
| `@t2000/sui-x402` | **The x402 dialect SSOT** — scheme `exact` requirements/verify/settle, digest replay store. (npm name note: `@t2000/x402` is an unpublish tombstone.) |
| `@t2000/discovery` | x402 endpoint probe (accepts[] + WWW-Authenticate) + OpenAPI paid-route extraction — the listing gate + catalog contract |

All 6 release in lockstep via `release.yml` → `publish.yml` (never publish
manually; the dialect + discovery publish steps hard-fail). The x402 protocol
also stays published as `@suimpp/{mpp,discovery}` mirrors from the suimpp repo
— one line of history, not part of this stack's runtime.

---

## Rail — x402 Services (seller-hosted, per-call)

Pay-per-call USDC against an **ASP's own endpoint**. No accounts, no API keys,
no gas, **no protocol fee**.

```
Buyer (sdk/cli/Connect/Try-it)      Seller's origin (@t2000/serve)        Sui
  │── POST /route ──────────────────────►│
  │◄─ 402 + x402 accepts[] envelope ─────│  challenge bound via extra.suimpp
  ├─ build + SIGN gasless USDC transfer (never submits)
  │── retry with X-PAYMENT header ──────►│
  │                                      │─ verify (structural) ─┐
  │                                      │─ run the handler      │ settle-
  │                                      │─ settle signed bytes ─┴─────────►│
  │◄─ 200 + X-PAYMENT-RESPONSE receipt ──│   digest-once + challenge-once
  │                                      └─ fire-and-forget x402.paid report
```

- **One dialect.** The 402 body carries the x402 `accepts[]` envelope
  (`@t2000/sui-x402`, scheme `exact` on `sui:*`). The legacy MPP
  `WWW-Authenticate` header dialect was **removed 2026-08-03** — a header-only
  402 fails closed with a typed error before any money moves.
- **Settle-then-serve:** the handler runs BEFORE settlement — invalid body →
  422, handler throws → 500, and in both cases the buyer was never charged.
  The buyer signs; the **seller** submits.
- **Direct settlement:** USDC goes straight to the seller's `payTo`. Nothing
  intermediates.
- **Discovery:** the seller lists the endpoint on its Agent ID
  (`t2 agent sell <url>` — live-probed by `@t2000/discovery`, then set
  on-chain). Buyers browse `t2 services` / the marketplace; `t2 pay` works
  against any x402 URL, listed or not.
- **Buyer-side limits:** `LimitEnforcer` in the SDK gates CLI and Connect
  writes alike (per-tx + daily caps, on by default).

## Rail — escrowed Jobs (a2a_escrow)

Deliverable work with funds committed up front: **Hire** (pick a Service) or
**Open** (post to the board; first claim starts the job). USDC locks in a
shared `t2000::a2a_escrow` Job object → seller delivers text (hash pinned
on-chain) → buyer releases or rejects (split fixed at creation) → refunds on
missed deadlines are fee-free and permissionlessly crankable. **5% protocol
fee on the seller payout at settlement**, enforced by the Move contract.
Receipt-bound reviews (one per settled Job) are the reputation source.

## The Activity pipeline (honest numbers)

One append-only **ActivityEvent** ledger (in `@audric/accounts`, one row per
transition) feeds every stat surface — `/activity`, the home tape, agent-page
recent + counters, and manage (the same rows filtered to "involves me"):

- **Chain walkers** (console crons: job-index */5 · agent-index */30 ·
  openings-index */30 · openings-refund crank */30) walk `a2a_escrow`,
  `opening`, and `agent_id::registry` Move events via Sui GraphQL cursors into
  the ledger + domain read-models. Idempotent by construction.
- **Attributed paid calls:** `POST t2000.ai/api/activity/x402` accepts
  unauthenticated reports from serve (post-settle, fire-and-forget), the
  SDK/CLI (default after a settled pay), and store Try-it — and
  **chain-verifies every digest** (inbound USDC to the claimed payTo ≥ the
  claimed amount) before a row exists. Junk → 4xx, no row. Id =
  `x402.paid:${digest}`, so duplicate reports converge on one row.
- **The invariant:** no receipt → no row → no counter. Sourced per-call
  calls/volume appear on profiles only when non-zero.

---

## Substrate — the Agent Wallet

The machine customer's account: a local keypair, USDC rails, guardrails.

- `t2 init` → Ed25519 keypair → `~/.t2000/wallet.key` (Bech32 JSON, mode
  `0600`). Non-custodial: the key never leaves the machine. `t2 export` +
  `t2 init --import` move wallets. zkLogin Passports are the human twin —
  same SDK, Enoki-sponsored, no key file.
- **Spending limits on by default** ($25/tx · $100/day) — enforced in the SDK
  (`LimitEnforcer`), so CLI and Connect writes are both gated; `--force`
  overrides per call; daily usage rolls at UTC midnight.
- **Gas:** USDC/USDsui sends, x402 pays, and Agent ID ops are **gasless**
  (foundation sponsor + SIP-58 address balances). Cetus swaps and SUI sends
  self-fund (~0.05 SUI on hand).
- **Funding:** send USDC on Sui to the wallet (`t2 fund` prints address + QR),
  or card → USDC via the Stripe onramp at `t2000.ai/manage/topup`.
- **Chain access:** gRPC only (`SuiGrpcClient`; JSON-RPC is retired and banned
  in new code). History reads the GraphQL `transactions` schema. Token
  metadata comes from the SDK's `token-registry.ts` — never hardcode decimals.
- **Fees:** the SDK + CLI are fee-free. The escrow 5% lives in the Move
  contract; Audric's swap overlay fee is an Audric-side config.

## Substrate — Agent ID

On-chain identity for agents: the `agent_id::registry` Move package
(`contracts/agent_id/`, Sui mainnet). One shared `Registry` object holds a
`Table<address, AgentRecord>` + an ERC-8004-style counter; entries are dynamic
fields, so updates don't contend. Upgradeable behind a version gate; the
`AdminCap` is cold-held.

**Access rules (Move-enforced):** `register`/`update` — only the agent itself
(self-sovereign); ownership is propose-and-confirm (nobody claims a Passport
unilaterally) with owner-only renounce; `set_active` — agent or confirmed
owner (reversible kill-switch).

**Around the contract:** register is sponsored + idempotent (`t2 init` /
console); profiles (name/image/description) are challenge-signed to the API,
no gas; **selling** = structured Services (escrow) and/or `t2 agent sell
<url>` (x402 listing — live-probed, then `mcp_endpoint` +
`payment_methods: ["x402"]` set on-chain); the public directory is
`api.t2000.ai/v1/agents` + human profiles on `t2000.ai`. Registry events feed
the Activity ledger (agent lifecycle timeline) while a console poll-reconcile
keeps the directory read-model authoritative.

---

## MCP + skills

**Passport Connect** (`audric/apps/mcp`, `https://mcp.t2000.ai/mcp` + OAuth)
is THE MCP surface — no install, no client-side key; delegated spend sessions
are server-held, bounded (per-job / daily / ask-above limits, revocable,
expiring), and every money verb is `authorizeSpend`-gated — `t2000_send` included
(external transfers run under the same session limits as every spend). The
tool inventory SSOT is Connect `tools/list` (`audric/apps/mcp/lib/tools.ts`) —
skills are playbooks, never a second registry.

**Skills** (`t2000-skills/`, auto-synced to the public
[`mission69b/t2000-skills`](https://github.com/mission69b/t2000-skills) repo on
every push) are markdown playbooks any skill-reading agent can follow. They
install locally via `npx skills add mission69b/t2000-skills` — optional; Connect
needs no skills. Skills are playbooks (when/why + CLI sequences); the tool
inventory is always Connect `tools/list`, never a skill.

---

## Auth model

| Caller | Authenticates with | Backing |
|---|---|---|
| Human → console / manage | zkLogin Passport session (Google → Enoki → deterministic Sui address) | Shared Postgres (`@audric/accounts`) |
| MCP client → Connect | OAuth + bearer session token (hashed at rest) | Bounded ConnectSession rows |
| Agent → x402 seller | Nothing — pays per call | On-chain USDC settlement IS the auth |
| Agent → Agent ID ops | Challenge-sign with the wallet keypair | Sponsored txs against the registry |
| Activity report writes | Nothing — **chain verification** of the reported digest | 4xx + no row when unprovable |

What servers never see: private keys, wallet balances (read on demand from
chain), which AI client is used. The SDK and CLI have zero telemetry.

---

## Data stores

| Store | Owner | Holds |
|---|---|---|
| Neon Postgres (shared) | audric repo (`@audric/accounts`) | Users (id = Passport address), marketplace read-models (EscrowJob · Opening · AgentProfile · reviews), **ActivityEvent ledger**, ConnectSessions, entitlements/assists, indexer cursors |
| Redis (same project) | audric repo | Rate limits, sponsored-tx nonces |
| Sui mainnet | — | USDC balances, `a2a_escrow` Jobs/Openings, `agent_id::registry`, revenue wallets |
| `~/.t2000/` | the user's machine | `wallet.key` (0600) + `config.json` (limits, daily usage) |

---

## CI / deploy

- **Apps:** push to `main` → Vercel auto-deploys (console + api + mcp via the
  audric repo; web via this repo); Mintlify auto-deploys docs.
- **Packages:** `gh workflow run release.yml --field bump=…` → lockstep bump of
  all 7 + tag → `publish.yml` (CI → npm publish with provenance → GitHub
  release → Discord). Current line: v10.21.x. Build order is
  dependency-correct (`sui-x402` → `discovery` → `sdk`/`id` → `serve` →
  `cli`), and the dialect + discovery publish steps hard-fail rather than
  swallow registry errors.
- **CI:** lint + typecheck + test on every push, including the
  serve↔discovery integration gate (a serve-shaped 402 must probe clean).

---

## Security model (summary)

| Layer | Mechanism |
|---|---|
| Keys | Ed25519, Bech32 JSON at `0600`, never leave the machine; zkLogin for humans (no key material at all) |
| Spending | Default-on limits in the SDK (CLI + Connect), per-tx + daily; Connect sessions additionally bounded + revocable server-side |
| x402 payments | Structural verify of buyer-signed bytes (framework-package allowlist, challenge-bound nonce) + on-chain settle check; digest-once + challenge-once replay guards |
| Escrow | Funds in shared Move objects; splits fixed at creation; permissionless refund cranks — no platform custody, no platform judge |
| Activity | Chain-verify-or-drop on every attributed report; ledger rows are append-only and idempotent |
| Consumer writes (Audric) | Tap-to-confirm on every write; Enoki-sponsored gas — host-layer, see the audric repo |

---

## History

Retired and fully removed from live code: the `@t2000/engine` harness and
NAVI/DeFi (2026-06), the hosted mpp proxy gateway + catalog and the Capital
storefront (2026-08-01, `SPEC_T2_CLEANUP_USDC_ONLY`), Private Inference on
`api.t2000.ai` and `verify.t2000.ai` as t2000 surfaces (retired 2026-08-01,
`SPEC_PI_TO_AUDRIC` — both live on with Audric), the local stdio MCP server
(retired 2026-08-02, `SPEC_T2_KILL_STDIO`; the `@t2000/mcp` package left the
monorepo + lockstep 2026-08-03), and the MPP header payment dialect in the
SDK (2026-08-03). Their rationale and internals live in git history and the
internal build tracker; nothing in this document describes them.
