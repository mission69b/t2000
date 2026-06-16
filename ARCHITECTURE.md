# t2000 — Architecture

> Technical reference for how the stack works end-to-end.

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           User / AI Agent                                │
│                                                                          │
│  Claude · Cursor · ChatGPT · CLI · any MCP client                       │
└──┬─────────┬──────────────┬──────────────────────────────────────────────┘
   │         │              │
   │    MCP (stdio)    CLI commands    SDK (TypeScript)
   │         │              │
   │         ▼              ▼
   │  ┌──────────────────────────────────────────────────────────────────┐
   │  │                        @t2000/sdk                                │
   │  │                                                                  │
   │  │  Agent core · Safeguards · send (gasless) · swap (Cetus) ·       │
   │  │  pay (x402)                                                      │
   │  └────────┬─────────────────────────────────────────┘
   │           │
   ▼           ▼
┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐
│ Audric      │  │ x402 / MPP  │  │   Sui Blockchain     │
│ (Vercel,    │  │ Gateway     │  │                      │
│  separate   │  │ (Vercel)    │  │  USDC ·              │
│  frozen     │  │             │  │  t2000 Treasury      │
│  legacy app)│  │ Every major │  │  @suimpp/mpp         │
│             │  │ AI/data API │  │  (payment method)    │
│             │  │ Explorer    │  │                      │
│             │  │ Spec + Docs │  │                      │
└──────┬──────┘  └──────┬──────┘  └──────────────────────┘
       │                │
       ▼                ▼
┌─────────────┐  ┌─────────────┐
│ NeonDB      │  │ Upstream    │
│ (Audric)    │  │ APIs        │
│             │  │             │
│ Users       │  │ OpenAI      │
│ Preferences │  │ Anthropic   │
│ Sessions    │  │ Perplexity  │
│ Fee history │  │ + others    │
└─────────────┘  └─────────────┘
```

> **Historical (2026-06-14):** `@t2000/engine` was retired and **deleted** from the
> monorepo. It used to sit between the host and `@t2000/sdk` as a conversational-finance
> harness (tools, guards, USD permissions, prompt assembly). The already-published
> `@t2000/engine@4.x` stays on npm for the frozen legacy Audric app, but there is no
> engine source here anymore and no future engine releases. The remaining live packages
> are `@t2000/{sdk,cli,mcp}`.

> Pre-v0.7d, an `apps/server` (AWS ECS Fargate) on `api.t2000.ai` hosted a
> fee-ledger indexer + daily-intel cron. v0.7d Block C migrated both to Audric
> v2 on Vercel (Vercel cron + Audric's NeonDB). The `apps/server` directory
> and its ECS deployment are retired.

---

## Packages


| Package             | npm             | What it does                                                                      |
| ------------------- | --------------- | --------------------------------------------------------------------------------- |
| `@t2000/sdk`        | Published       | TypeScript SDK — agent core, safeguards. Write surface: send (gasless USDC/USDsui), swap (Cetus), pay (x402). |
| `@t2000/cli`        | Published       | Agent Wallet CLI — `t2 init` / `send` / `swap` / `pay` / `mcp install` / etc. v4 is intentionally narrow (no DeFi verbs in CLI). |
| `@t2000/mcp`        | Published       | MCP server — wraps the SDK wallet (9 tools: 5 read + 3 write + 1 limit) + skill prompts baked from `t2000-skills/skills/`, stdio transport. Exports its own `t2000_*` wrappers. |
| `@suimpp/mpp`       | Published       | Sui USDC payment method for the x402 / MPP rail (client + server verification)    |
| `@suimpp/discovery` | Published       | Sui-specific discovery validation — OpenAPI checks + 402 probe                    |
| `mppx`              | External (wevm) | MPP protocol middleware — 402 challenge/credential flow                           |


## Apps


| App            | Hosting         | Domain       | What it does                                                                                                                                                                             |
| -------------- | --------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audric         | Vercel          | audric.ai    | Consumer product — Passport (zkLogin), Intelligence (engine chat), Finance (NAVI save/borrow + Cetus swap + charts), Pay (USDC transfers + receive), Store (coming soon) (separate repo) |
| `apps/web`     | Vercel          | t2000.ai             | Infrastructure landing page + skills routes                                                                                                                                              |
| `apps/docs`    | Mintlify        | developers.t2000.ai  | Developer documentation                                                                                                                                                                  |
| `apps/gateway` | Vercel          | mpp.t2000.ai         | MPP gateway — every major AI + data API, explorer, spec, docs                                                                                                                            |


---

## Web App (audric.ai)

Consumer banking product. Anyone with a Google account gets a Sui wallet in 3 seconds.

### Auth: zkLogin + Enoki

```
User clicks "Sign in with Google"
  │
  ├── Google OAuth → JWT (contains `sub` = Google user ID)
  ├── Generate ephemeral Ed25519 keypair (browser-only, session-scoped)
  ├── Enoki creates ZK proof (JWT + ephemeral key → Sui address)
  ├── Address is deterministic: same Google account = same Sui address
  └── Session stored in localStorage (JWT + ephemeral key + proof)
```

No private key to manage. No seed phrase. The wallet address is derived from the Google JWT. Ephemeral keys are session-scoped and never persisted to a server.

### Transaction flow (sponsored)

```
User taps "Save $50"
  │
  ├── SDK builds a Transaction (gasless — no gas owner set)
  ├── Serialize TX → POST to Enoki sponsorship endpoint
  ├── Enoki sets gasOwner = Enoki gas wallet, signs as sponsor
  ├── User signs TX with ephemeral key (dual-signed)
  └── Submit to Sui fullnode → finality ~400ms
```

All transactions are gas-free for the user. Enoki sponsors gas.

### Engine chat (Audric / @t2000/engine) — frozen legacy

> **Historical (2026-06-14):** `@t2000/engine` was retired and deleted from this monorepo.
> The flow below describes the **frozen legacy Audric app**, which still consumes the
> already-published `@t2000/engine@4.x` from npm. It is accurate for that app but no longer
> describes anything that lives in this repo. New work composes the AI SDK directly over
> `@t2000/sdk`.

For freeform queries typed into the chat, the host (audric/web-v2) composes AI SDK's `Experimental_Agent` from the engine's tools + primitives and streams the result (the runnable `AISDKEngine` was retired in S.391):

```
User types "What's my current balance?"
  │
  ├── POST /api/chat (streamed UIMessage chunks, JWT auth, Sui address)
  ├── host Experimental_Agent (engine READ/WRITE_TOOL_SET + buildInternalContext) → AI SDK streamText → gateway/@ai-sdk/anthropic → Claude with tool definitions
  ├── Tool calls (balance_check, savings_info, etc.) executed server-side
  │   └── MCP-first with SDK fallback for financial reads
  ├── Write tools → needsApproval → pending_action → user confirms on-chain → client POSTs back to /api/chat with attemptId + tx result (inline resume)
  ├── Streaming AI SDK fullStream parts (text-delta, reasoning-delta, tool-call, tool-result, finish)
  ├── Session persisted to Upstash KV
  └── Response rendered in streaming chat UI
```

Simple actions (Save, Send) use client-side chip flows with zero LLM cost.

### Stack


| Component | Technology                                     |
| --------- | ---------------------------------------------- |
| Framework | Next.js (App Router)                           |
| Auth      | zkLogin via `@mysten/enoki`                    |
| Gas       | Enoki sponsored transactions                   |
| LLM       | Anthropic Claude (for agent queries)           |
| Database  | NeonDB (Prisma) — users, preferences, contacts |
| Styling   | Tailwind CSS + shadcn/ui patterns              |
| Analytics | Vercel Analytics                               |
| State     | TanStack Query + custom hooks                  |


---

## MPP Gateway (`mpp.t2000.ai`)

Payment infrastructure for machine-to-machine commerce. Every major AI + data API.

### Pages


| Page     | URL         | What it shows                                         |
| -------- | ----------- | ----------------------------------------------------- |
| Homepage | `/`         | Pitch, live payment feed, stats bar                   |
| Services | `/services` | Full catalog with search, categories, code examples   |
| Explorer | `/explorer` | Payment history, volume chart, service breakdown      |
| Spec     | `/spec`     | MPP protocol specification for Sui                    |
| Docs     | `/docs`     | Developer guides — "Pay for APIs" + "Accept payments" |


### Payment logging

Every MPP payment is logged to a dedicated NeonDB (separate from banking DB):


| Field       | Type     | Description                                 |
| ----------- | -------- | ------------------------------------------- |
| `service`   | String   | Service name (e.g. "openai")                |
| `endpoint`  | String   | Endpoint path (e.g. "/v1/chat/completions") |
| `amount`    | String   | USDC amount charged                         |
| `digest`    | String   | Sui transaction digest                      |
| `sender`    | String   | Sender Sui address                          |
| `createdAt` | DateTime | Timestamp                                   |


### API routes


| Route                           | What it returns                                     |
| ------------------------------- | --------------------------------------------------- |
| `GET /api/mpp/payments?limit=N` | Recent payments (live feed)                         |
| `GET /api/mpp/stats`            | Aggregates: total payments, volume, unique services |
| `GET /api/mpp/volume`           | 7-day payment volume by day                         |
| `GET /api/services`             | JSON service catalog                                |
| `GET /llms.txt`                 | Agent-readable service catalog                      |


### Service categories


| Category            | Count | Examples                                                                                                  |
| ------------------- | ----- | --------------------------------------------------------------------------------------------------------- |
| AI & ML             | 12    | OpenAI, Anthropic, Gemini, DeepSeek, Groq, Together, Perplexity, Replicate, Stability AI, Mistral, Cohere |
| Media               | 3     | fal.ai, ElevenLabs, AssemblyAI                                                                            |
| Search & Web        | 7     | Brave, Firecrawl, Exa, Jina Reader, Serper, SerpAPI, ScreenshotOne                                        |
| Data & Intelligence | 8     | OpenWeather, Google Maps, CoinGecko, Alpha Vantage, NewsAPI, IPinfo, Hunter.io, ExchangeRate              |
| Communication       | 2     | Resend, Pushover                                                                                          |
| Translation & Docs  | 4     | Google Translate, PDFShift, QR Code, Short.io                                                             |
| Compute             | 1     | Judge0                                                                                                    |
| Commerce            | 1     | Lob                                                                                                       |
| Security            | 1     | VirusTotal                                                                                                |


---

## suimpp.dev — Spec + Docs Site

Open-standard reference site for MPP on Sui. Spec + docs only — no registry, no explorer, no database. (Rock 3, 2026-05-27, retired the legacy ecosystem-hub framing — the server registry, payment explorer, registration flow, and `/api/report` endpoint were all deleted along with the NeonDB. Payment logging stays gateway-local to the gateway's own NeonDB; servers don't report anywhere external.)


| App                             | Domain     | Database | Purpose                                                      |
| ------------------------------- | ---------- | -------- | ------------------------------------------------------------ |
| `apps/suimpp` (suimpp monorepo) | suimpp.dev | None     | Spec + docs for MPP on Sui (RFC-style protocol reference)    |


### Pages


| Page | Route   | What it shows                                                                                |
| ---- | ------- | -------------------------------------------------------------------------------------------- |
| Home | `/`     | Pitch — three rules, how-it-works ASCII diagram, packages, implementations                   |
| Spec | `/spec` | RFC 2119 specification — 9 normative sections + 2 appendices (wire format, grief protection) |
| Docs | `/docs` | Linear quickstart — install, accept, make, validate, reporting                               |


### Discovery Validation (`@suimpp/discovery`)

The `check()` function runs two phases:

**Phase 1: OpenAPI Discovery**

- Fetches `{origin}/openapi.json`
- Validates OpenAPI 3.x structure
- Extracts endpoints with `x-payment-info` extensions
- Reports issues: missing schemas, invalid pricing, missing 402 responses

**Phase 2: Endpoint Probe**

- Sends an empty POST to the first payable endpoint
- Expects HTTP 402 with `WWW-Authenticate` header
- Parses MPP challenge parameters: method, amount, currency, recipient, network
- Validates: `method=sui`, USDC coin type, valid Sui address for recipient

```typescript
import { check } from '@suimpp/discovery';

const result = await check('https://mpp.example.com');
// result.ok          → all checks passed (no errors, warnings allowed)
// result.discovery   → OpenAPI parse results, endpoints, issues
// result.probe       → 402 challenge results, recipient, currency
// result.summary     → { totalIssues, errors, warnings }
```

### Payment Reporting

`@suimpp/mpp` server's `onPayment` callback fires after on-chain verification with the verified report `{ digest, sender, recipient, amount, currency, network }`. Servers consume it however they want — log to their own DB, push to their own analytics, drop on the floor. There is no canonical receiver (no `suimpp.dev/api/report`, no shared registry). The reference implementation in `t2000/apps/gateway/lib/gateway.ts` joins the on-chain report with HTTP context (`service`, `endpoint`) inside `chargeProxy` / `chargeCustom` and writes to its own gateway-owned NeonDB via `logPayment()`.


| Data field  | Source            | Available in  |
| ----------- | ----------------- | ------------- |
| `digest`    | On-chain TX       | onPayment     |
| `sender`    | Balance changes   | onPayment     |
| `recipient` | Config            | onPayment     |
| `amount`    | Challenge request | onPayment     |
| `currency`  | Config            | onPayment     |
| `network`   | Config            | onPayment     |
| `service`   | HTTP request URL  | chargeProxy() |
| `endpoint`  | HTTP request URL  | chargeProxy() |
| `serverUrl` | Config            | chargeProxy() |


### FAQ

**Q: Where do payments get tracked?**
A: Each server tracks its own. There is no central registry. `@suimpp/mpp`'s `onPayment` callback delivers on-chain payment data to the server; the server decides what to do with it (log to DB, push to analytics, ignore). The `t2000/apps/gateway` reference implementation logs to its own NeonDB via `logPayment()`.

**Q: How do agents discover MPP servers?**
A: Per-server `OpenAPI` documents with `x-payment-info` extensions. `@suimpp/discovery`'s `check()` validates any URL against the spec — fetches `/openapi.json`, probes the 402 challenge, verifies `method=sui` + USDC coin type + valid recipient. There's no centralized discovery service.

**Q: Why was the registry removed?**
A: A centralized ecosystem registry assumed `suimpp.dev` would be the canonical source of truth for "which servers exist on MPP." In practice the open-standard framing works better — each server is its own source of truth, `@suimpp/discovery` validates any URL on demand, and `suimpp.dev` stays a docs site. See Rock 3 in `HANDOFF_NEXT_AGENT.md` for the full repositioning rationale.

---

## Agent Init (`t2 init`)

v4 collapses the v3 three-step wizard into a single command. Wallet only — MCP install and spending limits are explicit follow-up commands the user opts into:

```
t2 init
  │
  ├─ Generate Ed25519 keypair
  ├─ Encode the Sui secret as Bech32 (`suiprivkey1…`)
  ├─ Write { version: 2, secret } JSON to ~/.t2000/wallet.key (mode 0600)
  ├─ Print the wallet's Sui address
  ├─ Seed default spending caps ($25/tx · $100/day cumulative) to ~/.t2000/config.json
  └─ Print the caps: "Spending limits ON: $25/tx, $100/day — change with `t2 limit set`, or --force per-call."
```

`t2 init --import` accepts an existing `suiprivkey1…` Bech32 secret (via hidden-input prompt or `--secret` arg) and writes the same file format. Pair with `t2 export` on the source machine to move wallets.

### Key file format

v4 wallets are **plain Bech32 JSON** — no encryption, no PIN, no scrypt. The security boundary is the `0o600` POSIX file permission. v4 trades the v3 failure-mode of "user forgets PIN, can't recover" for filesystem-ACL trust.

| Field        | Value                                                       |
| ------------ | ----------------------------------------------------------- |
| File path    | `~/.t2000/wallet.key`                                       |
| Mode         | `0o600` (owner read/write only)                             |
| File format  | JSON: `{ "version": 2, "secret": "suiprivkey1…" }`          |
| Key format   | Sui Bech32 (`suiprivkey1…`)                                 |
| Custom path  | `T2000_WALLET_PATH=/path/to/key` env var or `--key <path>` CLI flag |
| Move wallets | `t2 export` → `t2 init --import` on the target machine      |

> **v3 → v4 migration.** v3 wallets are `{ version: 1, algorithm: 'aes-256-gcm', salt, iv, tag, ciphertext }` — v4 cannot decrypt them. Use the v3 binary to print the secret (`t2000 export`), then `t2 init --import` on v4. The v3 `T2000_PIN` / `T2000_PASSPHRASE` env vars are accepted by `T2000.create({ pin })` for back-compat but **ignored** in v4 — they have no effect on v4 wallet files.

### Spending limits (opt-in)

v4 has no compulsory safeguards. After `t2 init`, the user opts into limits via:

```bash
t2 limit set --per-tx 100    # max $100 per send/swap/pay
t2 limit set --daily 500     # max $500 cumulative per UTC day
t2 limit show                # display current caps
t2 limit reset               # clear all caps
```

Limits are written to `~/.t2000/config.json`. Per-call override on `t2 send` / `t2 swap` / `t2 pay` via `--force` (logs a warning, executes anyway). Daily usage is tracked in the same config file and rolls over at UTC midnight.

### MCP install (separate command)

`t2 mcp install` is run on demand — auto-detects Claude Desktop / Cursor / Windsurf and writes `mcpServers.t2000 = { command: "t2000", args: ["mcp", "start"] }` into each client's JSON config. Idempotent. `t2 mcp uninstall` reverses it.

| Platform                 | Config file                                                       |
| ------------------------ | ----------------------------------------------------------------- |
| Claude Desktop (macOS)   | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `~/AppData/Roaming/Claude/claude_desktop_config.json`             |
| Cursor                   | `~/.cursor/mcp.json`                                              |
| Windsurf                 | `~/.codeium/windsurf/mcp_config.json`                             |

### Funding the agent

CLI agents are **self-funded** for gas. USDC + USDsui sends + MPP pays are **gasless** via the Sui foundation's `0x2::balance::send_funds` sponsor — no SUI required for those operations. SUI sends + Cetus swaps need ~0.05 SUI on hand for gas.

```
After t2 init:
  → Print the wallet address from `t2 init` output (also reachable via `t2 fund`)
  → Send USDC from any Sui exchange or wallet to that address → ready to send + pay gasless
  → For swaps / SUI sends: also send a small amount of SUI (~0.05) for gas
```

> **Audric web app exception:** Audric web users (not CLI users) sign in with Google → Enoki zkLogin, and Enoki sponsors all gas. They never need to acquire SUI. The CLI uses the Sui foundation gasless sponsor for USDC / USDsui / MPP — a different mechanism, same effect for those specific operations.

### What exists after init

```
~/.t2000/
  ├── wallet.key       # Plain Bech32 JSON — { version: 2, secret: "suiprivkey1…" }
  └── config.json      # spending caps + daily usage (seeded at `t2 init`: $25/tx · $100/day; `t2 limit reset` clears)
```

The agent now has:

- A Sui address (empty — fund it with USDC via any Sui exchange / wallet)
- No MCP install (run `t2 mcp install` to wire Claude / Cursor / Windsurf)
- Default spending limits ON ($25/tx · $100/day; `t2 limit set` to adjust, `t2 limit reset` to clear)
- Ready for `t2 send`, `t2 swap`, `t2 pay`, or any MCP tool call once funded

---

## MPP Payment

When a user runs `t2 pay <url>` or an AI agent calls `t2000_pay`:

```
Agent                              Gateway                          Sui
  │                                   │                              │
  │── POST /openai/v1/chat/... ──────>│                              │
  │                                   │                              │
  │<── 402 Payment Required ─────────│                              │
  │    WWW-Authenticate: Payment      │                              │
  │    amount=0.01, currency=USDC     │                              │
  │    recipient=<treasury>           │                              │
  │                                   │                              │
  │   ┌─ Build Sui TX ─────────────────────────────────────────────>│
  │   │  splitCoins(usdc, 0.01)       │                              │
  │   │  transferObjects → treasury   │                              │
  │   │  sign + execute               │                              │
  │   └─ TX confirmed ←──────────────────────────────────────────────│
  │      digest: "abc123..."          │                              │
  │                                   │                              │
  │── Retry + credential {digest} ──>│                              │
  │                                   │── getTransactionBlock ──────>│
  │                                   │   verify: success,           │
  │                                   │   USDC ≥ amount,             │
  │                                   │   recipient = treasury       │
  │                                   │                              │
  │                                   │── Proxy to OpenAI ────>      │
  │                                   │<── API response ────────     │
  │                                   │                              │
  │<── 200 OK + response ────────────│                              │
  │    x-payment-receipt: {digest}    │                              │
```

### How verification works (stateless)

The gateway uses `mppx` which does HMAC-bound challenge IDs. No database lookup needed:

1. Gateway issues a 402 with a challenge (HMAC-signed with `MPP_SECRET_KEY`)
2. Client pays on-chain, gets tx digest
3. Client retries with credential containing the digest
4. Gateway recomputes the HMAC to verify the challenge was issued by this server
5. Gateway calls `getTransactionBlock(digest)` on Sui RPC
6. Checks: tx succeeded, USDC transfer to treasury ≥ requested amount
7. Proxies to upstream API, returns response with receipt header

### On-chain transaction

- Simple USDC coin transfer: `splitCoins` → `transferObjects` to treasury
- Currency: `0xdba3...::usdc::USDC` (Circle USDC on Sui)
- Gas: self-funded by the agent (CLI) or Enoki-sponsored (Audric web)
- Finality: ~400ms

---

## Gas System

Every Sui transaction needs SUI for gas. The SDK is **sponsorship-agnostic**: it builds the transaction, signs it with the agent's ephemeral key, and submits it. Whoever pays gas is decided by the host:

| Host | Who pays gas |
|---|---|
| `@t2000/cli` | The agent itself (self-funded — keep ≥ 0.05 SUI on hand) |
| Audric web app | Enoki sponsors gas via zkLogin (user never holds SUI for gas) |
| Audric CLI (future) | TBD — out of scope for `audric-simplification-spec.md` PR-B1 |

If the agent is self-funded and runs out of SUI, the SDK throws `INSUFFICIENT_GAS`. There is no auto-topup, no USDC→SUI swap, no gas station. The user tops up via Mercuryo (https://exchange.mercuryo.io/?widget_id=89960d1a-8db7-49e5-8823-4c5e01c1cea2) or any Sui exchange.

### SDK execution helper

The SDK executes via a single internal helper, `executeTx(client, signer, buildTx)`:

```
1. buildTx() returns an unsigned Transaction
2. tx.setSender(signer.address)
3. tx.build({ client })  → bytes
4. signer.signTransaction(bytes)  → signature
5. client.executeTransactionBlock({ transactionBlock, signature, options: { showEffects: true } })
6. waitForTransaction(digest)
7. return { digest, gasCostSui, effects }
```

`gasCostSui` is computed from `effects.gasUsed.computationCost + storageCost − storageRebate`, divided by `1e9`. Every write method (`send`, `swap`) returns `gasCost` (in SUI) — there is **no `gasMethod` field** anymore. (USDC/USDsui `send` and x402 `pay` are gasless via the foundation sponsor.)

### Audric web app (Enoki) sponsorship — not in the SDK

Enoki gas sponsorship lives in the Audric web app, **not** in `@t2000/sdk`. The web app:

1. Builds a Transaction via `@t2000/sdk` builder helpers
2. Serializes the TX and sends it to Enoki's sponsorship endpoint
3. Enoki sets `gasOwner = Enoki gas wallet`, signs as sponsor
4. The web app signs with the user's ephemeral zkLogin key (dual-signed)
5. Submits to fullnode

This flow does NOT go through `executeTx`. It's a host-layer concern, documented in `audric/.cursor/rules/audric-transaction-flow.mdc`.

---

## Protocol Fees (wallet-direct architecture)

**Fees are an Audric (consumer) concern, not a t2000 (infra) concern.** As of `@t2000/sdk@1.1.0` (2026-04-30), no Move treasury contract is involved. With the DeFi surface removed, the only live fee is the **Cetus swap overlay fee** — the aggregator takes it from swap output and transfers it to the configured receiver inside the same PTB:

```
Audric prepare/route.ts (swap)
  │
  ├── buildSwapTx({ ..., overlayFee: { rate, receiver: T2000_OVERLAY_FEE_WALLET } })
  ├──   → Cetus aggregator emits the overlay-fee transfer in-PTB
  └── tx submitted via Enoki sponsorship
                ↓
                on-chain — overlay fee transferred to T2000_OVERLAY_FEE_WALLET
                           in the same PTB as the swap
```

**Properties:**
- **Atomic with the operation.** The overlay-fee transfer is part of the swap PTB; if anything reverts, the fee reverts too.
- **No SDK fee logic.** `@t2000/sdk` (and the CLI) is fee-free by design. Audric is the only fee owner; it passes `overlayFee.receiver = T2000_OVERLAY_FEE_WALLET` to `buildSwapTx`. The old `addFeeTransfer`/`protocolFee` helper (only ever used for the now-removed save/borrow fees) was deleted with the DeFi surface; a consumer wanting a non-swap fee splits + transfers to a wallet in its own PTB.
- **Wallet IS the live ledger.** `core.getBalance({ owner: treasuryWallet })` reads "what's in the treasury right now." Historical aggregates live in Audric's NeonDB, populated by Audric's Vercel cron — see the audric repo.

**Fee rates:**

| Operation | Rate (bps) | Rate (decimal) | Source |
|-----------|------------|----------------|--------|
| `swap`    | 10         | 0.001          | `OVERLAY_FEE_RATE` in `packages/sdk/src/protocols/cetus-swap.ts` |

---

## On-chain references (Sui mainnet)


| Object               | ID              | Purpose                                                              |
| -------------------- | --------------- | -------------------------------------------------------------------- |
| **Treasury Wallet**  | `0x5366ef...`   | **Audric overlay-fee receiver** (`T2000_OVERLAY_FEE_WALLET`)         |


> The legacy `t2000::treasury` Move package is dormant on-chain (no new traffic routes through it post-`@t2000/sdk@1.1.0`, 2026-04-30). Source was removed from the repo on 2026-04-30 — see git history pre-tag `v1.1.0` if needed for future admin ops. AdminCap remains with the treasury admin keypair; admin calls work via the on-chain ABI without needing local source.


---

## DeFi Adapters — removed from `@t2000/sdk`

> **Historical (2026-06-14):** NAVI / DeFi lending was **removed** from `@t2000/sdk`.
> The pluggable lending-adapter framework (`ProtocolRegistry`, `NaviAdapter`, lending
> descriptors), the `save`/`withdraw`/`borrow`/`repay`/`claimRewards`/`harvestRewards`
> methods + builders, positions/rates/earnings reads, and the `@naviprotocol/lending`
> dependency are all gone. The SDK's write surface is now **send (gasless USDC/USDsui),
> swap (Cetus), and pay (x402)** only. DeFi lending lives only in the frozen legacy Audric
> app (which consumes the published `@t2000/engine@4.x` + its own NAVI integration).

---

## Safeguards

Local-only enforcement on the agent's machine:


| Guard            | What it does                                              |
| ---------------- | --------------------------------------------------------- |
| Emergency lock   | `agent.lock()` — blocks all outbound operations instantly |
| Per-TX limit     | Max dollar amount per transaction (0 = unlimited)         |
| Daily send limit | Max daily outbound (send + pay)                           |


- Config stored locally in `config.json` alongside the private key
- MCP server refuses to start until safeguard limits are configured
- Outbound ops are guarded (send, swap, pay)
- `unlock()` requires human confirmation (not callable by AI)

---

## MCP Server

`@t2000/mcp` exposes the CLI's capabilities to any MCP-compatible client (Claude Desktop, Cursor, Windsurf, Claude Code, etc.) via stdio transport. The published package is intentionally narrow — 9 tools mapped to the CLI verbs + 8 skill prompts. (The audric web app does NOT use `@t2000/mcp`; it embeds `@t2000/engine` directly and gets the full 26-tool engine surface.)

**Tools (9 total):**

| Category | Tools                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------ |
| Read (5) | `t2000_balance`, `t2000_address`, `t2000_receive`, `t2000_history`, `t2000_services`                   |
| Write (3)| `t2000_send`, `t2000_swap`, `t2000_pay`                                                                |
| Config (1) | `t2000_limit`                                                                                        |

**Prompts (8 — one per skill, auto-registered from `t2000-skills/skills/*/SKILL.md`):**

`skill-setup`, `skill-mcp`, `skill-check-balance`, `skill-receive`, `skill-send`, `skill-swap`, `skill-pay`, `skill-services`

The skill bodies are baked into the published bundle at build time (`tsup.config.ts`) — no runtime filesystem reads, no path-resolution gymnastics. Hand-rolled workflow prompts (`financial-report`, `optimize-yield`, `morning-briefing`, etc.) were deleted in S.336 (every prompt composed against v3 DeFi skills that were retired); the `skill-*` set is now the entire prompt surface.

Write operations serialize structurally — `confirm`-tier writes yield via `needsApproval` so the host round-trips through user confirmation before the next step runs (prevents concurrent transactions + Sui object version conflicts). Auto-execute writes (USD-aware permission resolver, sub-threshold amounts) inherit one-write-per-step from the LLM's planning + the conservative-default preset. Safeguards are checked before every write. (Pre-v2.0.0 used an in-process `TxMutex`; the host's AI SDK step model + `needsApproval` round-trip is the actual serialization mechanism. Legacy `TxMutex` is still exported for back-compat consumers — see `packages/engine/src/v2/tool-policy.ts`.)

---

## Engine (`@t2000/engine`) — RETIRED + DELETED (2026-06-14)

> The `@t2000/engine` harness package (tool system, reasoning engine, guards, canvas, NAVI-MCP, MemWal memory, AdviceLog, Spec 1/2 contracts) was **deleted from the monorepo** — nothing here imported it; its only runtime consumer was Audric, and Audric v3 composes the AI SDK (`Experimental_Agent`) directly over `@t2000/sdk`. The published `@t2000/engine@4.x` stays on npm for the frozen legacy audric/web-v2. The transaction-safety guards were agent-loop guards → they live in the v3 host, not the SDK (`SPEC_AUDRIC_V3.md` §7). **Package stack: 3 (`@t2000/{sdk,cli,mcp}`).** Historical internals: `git log` + `@t2000/engine@4.x`.

---

## Audric — the five products (frozen legacy)

> **Historical (2026-06-14):** The five-product / four-system framing below describes the
> **frozen legacy Audric app** (which still runs on the published `@t2000/engine@4.x`). The
> current Audric positioning is "Private, decentralized AI — truly yours." This section is
> retained for lineage; it does not describe live t2000 code.

The Audric consumer brand groups everything into exactly **five products**. (S.18 reverted S.17's Finance retirement: Intelligence was overloaded as both "the moat" and "the home for every financial verb," and Send/Receive overlapped Pay. Finance now owns save/credit/swap/charts; Pay owns send/receive.)


| Product                    | What it is                                                                                                                                                                | Implementation                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 🪪 **Audric Passport**     | Trust layer — identity (zkLogin via Google), non-custodial wallet on Sui, tap-to-confirm consent, Enoki-sponsored gas (web only)                                          | `@t2000/sdk` + Enoki + `@mysten/sui`                                                  |
| 🧠 **Audric Intelligence** | Brain (the moat) — 4 systems orchestrate every money decision (see breakdown below)                                                                                       | `@t2000/engine`                                                                       |
| 💰 **Audric Finance**      | Manage your money on Sui — Save (NAVI lend), Credit (NAVI borrow), Swap (Cetus aggregator), Charts (yield/health/portfolio viz). Every write taps to confirm via Passport | `@t2000/sdk` NAVI builders + `cetus-swap.ts` + `@t2000/engine` chart canvas templates |
| 💸 **Audric Pay**          | Money primitive — send USDC, receive via payment links / invoices / QR. Free, global, instant on Sui                                                                      | `@t2000/sdk` Sui tx builders + payment-kit                                            |
| 🛒 **Audric Store**        | Creator marketplace at `audric.ai/username`. Coming soon (Phase 5)                                                                                                        | `@t2000/sdk` + Walrus + payment links                                                 |


See `PRODUCT_ROADMAP.md` for the canonical taxonomy + naming rules.

---

## Audric Intelligence — the 4-system moat (product narrative)

> **Not a chatbot. A financial agent.** Four systems work together to understand the user's money, reason about decisions, and get smarter over time. Every action still waits on Passport's tap-to-confirm.
>
> _The technical deep-dive (per-system implementation, Spec 1, Spec 2) lives under [`## Engine (\`@t2000/engine\`)`](#engine-t2000engine--audric-intelligence-implementation) above. This section is the consumer-product / brand framing._
>
> The "autonomous agent" framing of the prior Audric 2.0 spec was retired in the April 2026 simplification. Pattern proposals, the trust ladder, the scheduled-actions executor, and the notification templates were deleted because zkLogin requires user presence to sign — "autonomous" was reminders dressed up as agency. See the S.0–S.12 entries in `audric-build-tracker.md`.

| System | One-line pitch | Implementation |
|---|---|---|
| 🎛️ **Agent Harness** | 26 tools, one agent — the toolset + primitives that manage your money in one conversation. | `@t2000/engine` `READ_TOOL_SET` + `WRITE_TOOL_SET` / `getDefaultTools()` (18 read + 8 write) composed into the host's AI SDK loop |
| ⚡ **Reasoning Engine** | Thinks before it acts — adaptive thinking, 12 guards, prompt caching. Multi-step playbooks (skills) ship from `@t2000/mcp`. | `classify-effort.ts`, `guards.ts`, `engine.ts` cache_control, `t2000-skills/skills/` |
| 🧠 **Memory (MemWal)** | Knows the user — vector memory of preferences / goals / risk tolerance / on-chain patterns recalled per-turn. | `MemoryStore` + MemWal vector memory + `MemWalMemoryStore` adapter |
| 📓 **AdviceLog** | Remembers what it told you — last 30 days hydrated each turn, no two contradictory answers. | `AdviceLog` Prisma model + `record_advice` audric-side tool + `buildAdviceContext()` |

**What stayed (silent context):** MemWal vector memory, financial-context snapshots, and the `AdviceLog` loop. These run via per-turn `prepareStep` recall + a single Vercel cron job and feed the LLM context invisibly.

### Multi-wallet Linking

Signed-in users can link up to 10 Sui addresses (e.g. a hardware wallet alongside their zkLogin wallet); `FullPortfolioCanvas` aggregates them via `GET /api/analytics/portfolio-multi`. Backed by the `LinkedWallet` Prisma model.

> **Removed in S.22 (April 2026):** the public `/report/[address]` wallet report (and its `PublicReport` cache). The "Audric would do" suggestions there were promoting features deleted in S.0–S.12 (24/7 alerts, recurring transactions, savings-goal automation), and a second standalone product surface contradicted the chat-first thesis. Heuristic portfolio analysis lives inside chat now via `portfolio_overview` + `health_check`.
>
> **Update (S.103, SPEC 17, May 2026):** the broader savings-goal layer is now fully removed — `SavingsGoal` Prisma table, 4 `savings_goal_*` engine tools, the audric `GoalsPanel` settings/dashboard surface, the `openGoals` snapshot field, the heuristic prompt line that nudged "your goal is off-track", and the t2000 MCP `savings-goal` prompt. The "track my savings progress" job-to-be-done is served by `health_check` + `portfolio_overview` + `yield_summary`.

### Intelligence Layer (silent context that survives the simplification)


| Feature             | What it does                                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Memory (MemWal)     | Vector memory of user preferences, goals, risk tolerance, on-chain patterns. `prepareStep` recalls top-K per-turn → `<memory_recall>`. `memwal.analyze()` extracts new facts post-turn. |
| ~~Financial Context~~ | **Retired in S.375 (2026-06-07).** Was the `UserFinancialContext` daily snapshot injected as `<financial_context>`; redundant with fresh tool reads, so the model + cron were dropped. The agent now orients via `balance_check` / `savings_info` / `rates_info`. |
| Advice Memory       | `AdviceLog` rows written by `record_advice` (audric tool). `buildAdviceContext()` hydrates last 30 days into every turn so the chat remembers what it told you yesterday |
| Conversation Log    | `ConversationLog` rows written by chat route. Fine-tuning dataset for the future self-hosted model migration                                                             |


> The "Proactive Awareness" / `buildProactivenessInstructions()` layer was deleted in S.5 along with the proposal pipeline. **As of S.31 (2026-04-29) the critical-HF email was also removed** — stablecoin-only collateral (USDC + USDsui) + no leverage trading + zkLogin tap-to-confirm makes the proactive HF email net-negative UX vs surfacing HF prominently in chat. There are now zero proactive surfaces; everything proactive was either a notification (deleted) or a dashboard card (deleted). The chat answers when asked.

---

## Analytics & Privacy

### What IS tracked


| What             | Where                                      | Purpose                                       |
| ---------------- | ------------------------------------------ | --------------------------------------------- |
| Page views       | Vercel Analytics (t2000.ai + mpp.t2000.ai) | Standard web analytics, no wallet data        |
| Gateway payments | NeonDB (gateway-owned)                     | MPP payment logs for billing + analytics      |
| Protocol fees    | NeonDB (Audric-owned)                      | Revenue tracking, fed by Audric's Vercel cron |


### What is NOT tracked

- **SDK**: zero telemetry — no phone-home, no analytics
- **CLI**: zero telemetry — purely local
- **Private keys**: never leave the user's machine
- **Public stats API**: only aggregates — no individual addresses or tx digests

### Public stats API (`/api/stats`)

Returns only aggregated numbers:

- Treasury + gateway wallet balances (live, via Sui RPC)
- Static marketing snapshot (agents registered, txs processed, fees collected)

---

## Infrastructure


| Component              | Hosting           | Notes                                      |
| ---------------------- | ----------------- | ------------------------------------------ |
| Audric (audric.ai)     | Vercel            | Next.js, zkLogin + Enoki, @t2000/engine    |
| Web (t2000.ai)         | Vercel            | Next.js                                    |
| Docs (developers.t2000.ai) | Mintlify      | Developer documentation                    |
| Gateway (mpp.t2000.ai) | Vercel            | Next.js, payment logging, explorer         |
| Spec/docs (suimpp.dev) | Vercel            | Next.js, spec + docs only (no DB)          |
| Database (Audric)      | NeonDB (Postgres) | Users, preferences, sessions, fee history  |
| Database (gateway)     | NeonDB (Postgres) | MPP payment logs                           |
| DNS                    | Vercel DNS        | All `t2000.ai` records — managed alongside the Vercel deployment |
| CI/CD                  | GitHub Actions    | Lint, typecheck, test, publish             |


### Deployment pipeline

```
Push to main
  │
  ├── CI: lint + typecheck + test (all packages)
  │
  └── Web + Gateway + Docs auto-deploy via Vercel / Mintlify
```

### Publish pipeline (on tag `v*`)

```
Tag vX.Y.Z (t2000 monorepo, all 3 packages bumped in lockstep)
  → CI: lint + typecheck + test
  → Build all packages
  → Publish: @t2000/sdk, @t2000/mcp, @t2000/cli
  → GitHub Release (auto-generated notes)
  → Discord notification

Tag v0.1.0 (mission69b/suimpp repo)
  → CI: build + typecheck + test
  → Publish: @suimpp/mpp, @suimpp/discovery
  → GitHub Release
```

Current published version: `4.0.x`. The release workflow lives at `.github/workflows/release.yml` (manual dispatch with `bump=patch|minor|major`) and `publish.yml` (triggered by the tag push from `release.yml`). See `CLAUDE.md § Release process` for the full procedure.

---

## Security Model

### Overview


| Layer             | Mechanism                                                              |
| ----------------- | ---------------------------------------------------------------------- |
| **Keys**          | Ed25519 keypair, plain Bech32 JSON at rest, `0o600` POSIX file permissions |
| **Non-custodial** | Private key never leaves `~/.t2000/wallet.key` — server never sees it  |
| **Safeguards**    | Default-on spending limits (`t2 limit set` to adjust), per-tx + daily caps, enforced on CLI **and** MCP writes |
| **On-chain**      | Inline fee transfer (Audric only), atomic Payment Intents, indexed ledger |
| **MPP**           | HMAC-bound challenges (stateless), on-chain USDC verification          |
| **API keys**      | Upstream keys stored as Vercel env vars, never exposed to agents       |


### Key management

- **Algorithm**: Ed25519 (`@mysten/sui/keypairs/ed25519`)
- **At-rest format**: Plain Bech32 JSON — `{ version: 2, secret: "suiprivkey1…" }` with `0o600` perms. **No PIN, no AES, no scrypt** (v4 trades the "user forgets PIN" failure mode for filesystem ACL trust)
- **No mnemonic**: Raw keypair only — no seed phrase to leak
- **Import/export**: `t2 export` prints the Bech32 secret; `t2 init --import` accepts a Bech32 secret on the target machine. Pair them to move wallets.

### Safeguard enforcement

Spending limits are **on by default**. `t2 init` seeds $25/tx and $100/day (cumulative USD) to `~/.t2000/config.json`; the user adjusts with `t2 limit set --per-tx <USD> --daily <USD>` or clears with `t2 limit reset`. Enforcement lives in `@t2000/sdk` (the `LimitEnforcer` gate), so **every write — CLI and MCP — is gated** (the early-v4 MCP-bypass gap is closed).

```
Any outbound write operation (send / swap / pay)
  │
  ├── Limit check (caps seeded at init; skipped only after `t2 limit reset`)
  │   ├── Amount ≤ per-tx cap?
  │   └── dailyUsed + amount ≤ daily cap?
  │
  ├── Build + sign + execute TX
  │
  └── Record usage (only if a cap is configured)
```

Override on a per-call basis with `--force` on `t2 send` / `t2 swap` / `t2 pay` — logs a warning, executes anyway.

Write serialization is the caller's responsibility, NOT the SDK's. In practice:
- **CLI** (`t2 send` / `t2 swap` / `t2 pay`): interactive single-command → naturally serial.
- **Engine** (host's `Experimental_Agent` composed from engine primitives): structural via AI SDK step model + `needsApproval` round-trip (confirm-tier writes yield `pending_action`, host round-trips, next step runs next write).
- **Audric web**: per-user single-session writes serialize through the sponsored-tx flow (`/api/transactions/prepare` → user signs → `/api/transactions/execute`).

The daily budget resets automatically at UTC midnight.

> **v3 → v4.** The v3 `t2000 lock` / `t2000 unlock` emergency-lock surface (and the `t2000_lock` MCP tool that paired with it) was removed in the v4 cut — it was PIN-anchored and v4 has no PIN. The threat model it protected against (compromised agent process needing a remote freeze) is now covered by stopping the local CLI process / revoking filesystem access. Audric web's "you decide" tap-to-confirm gates fill the same role for the consumer surface.

### Gas

CLI agents are **gasless for USDC + USDsui sends + MPP pays** via the Sui foundation's `0x2::balance::send_funds` sponsor — no SUI required for those operations. SUI sends + Cetus swaps still need ~0.05 SUI on hand for gas. There is no t2000 gas station, no hashcash, no bootstrap, and no USDC onboarding endpoint. Audric web users get gas sponsored by Enoki at the host layer (a different mechanism — see `audric/.cursor/rules/audric-transaction-flow.mdc`). The previous gas-station / sponsor / bootstrap surface was removed in S.32 (`audric-simplification-spec.md` PR-B1).

### MPP verification (stateless)

The gateway verifies payments without a database:

1. **Challenge**: HMAC-sign a challenge ID with `MPP_SECRET_KEY`
2. **Verify origin**: Recompute HMAC to confirm challenge was issued by this server
3. **Verify payment**: `getTransactionBlock(digest)` on Sui RPC
  - TX status: success
  - USDC transfer amount ≥ requested amount
  - Recipient = treasury address
4. No replay protection needed — each challenge is single-use via HMAC binding

### Upstream API key isolation

```
Agent (local)                    Gateway (Vercel)              Upstream API
  │                                │                              │
  │── Pay USDC on Sui ──────────>│                              │
  │── POST /openai/... ─────────>│                              │
  │   (no API key)                │── Add Authorization header ─>│
  │                                │   (from env: OPENAI_API_KEY) │
  │<── Response ─────────────────│<── Response ──────────────────│
```

- Agents never see upstream API keys
- Keys live as Vercel environment variables
- `chargeProxy()` injects headers server-side via `upstreamHeaders`
- Response is proxied back without exposing internal headers

### Transaction serialization

Write serialization is enforced at the caller layer, not inside `@t2000/sdk`:
- **CLI** (interactive single-command) is naturally serial.
- **`@t2000/engine`** (host's `Experimental_Agent` composed from engine primitives) serializes structurally via the AI SDK step model + `needsApproval` round-trip — confirm-tier writes yield `pending_action`, host round-trips through user confirm, the next step runs the next write. Auto-execute writes (USD-aware permission resolver, sub-threshold amounts) inherit one-write-per-step from the LLM's planning + the conservative-default preset.
- **Audric web** serializes per-user via the sponsored-tx flow (one transaction prepare → sign → execute round-trip at a time per session).

Pre-v2.0.0 the engine instantiated an in-process `TxMutex` (still exported for back-compat consumers — see `packages/engine/src/v2/tool-policy.ts`); the structural mechanism above replaced it. Sui object version conflicts are prevented by the structural one-write-per-step contract, not a lock.

### What the server knows vs doesn't


| Server knows                                  | Server does NOT know            |
| --------------------------------------------- | ------------------------------- |
| Agent Sui address (when surfaced via Audric sponsored-tx prepare or MPP gateway payment) | Private key                     |
| On-chain transaction digests (public)         | What the TX does (opaque bytes) |
| Protocol fee transfers (from chain, atomic with the op) | CLI usage, local commands       |
| —                                             | Wallet balance (read on demand) |
| —                                             | Which AI client is used         |


