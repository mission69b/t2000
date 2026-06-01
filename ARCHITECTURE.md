# t2000 — Architecture

> Technical reference for how the stack works end-to-end.

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           User / AI Agent                                │
│                                                                          │
│  Audric · Claude · Cursor · ChatGPT · CLI · any MCP client              │
└──┬─────────┬──────────────┬──────────────┬───────────────────────────────┘
   │         │              │              │
   │    MCP (stdio)    CLI commands    SDK / Engine (TypeScript)
   │         │              │              │
   │         ▼              ▼              ▼
   │  ┌──────────────────────────────────────────────────────────────────┐
   │  │                     @t2000/engine                                │
   │  │                                                                  │
   │  │  AISDKEngine · AI SDK v6 (streamText) · Tool System · MCP Client │
   │  │  Streaming · Sessions · Cost Tracking · Context Management       │
   │  └────────┬──────────────────────────────────────────────────────┘
   │           │
   │           ▼
   │  ┌──────────────────────────────────────────────────────────────────┐
   │  │                        @t2000/sdk                                │
   │  │                                                                  │
   │  │  Agent core · Safeguards · Protocol registry                     │
   │  │  Adapters: NAVI                                                   │
   │  └────────┬─────────────────────────────────────────┘
   │           │
   ▼           ▼
┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐
│ Audric      │  │ MPP Gateway │  │   Sui Blockchain     │
│ (Vercel)    │  │ (Vercel)    │  │                      │
│             │  │             │  │  USDC · NAVI ·       │
│ zkLogin     │  │ Every major │  │  t2000 Treasury      │
│ Enoki gas   │  │ AI/data API │  │  @suimpp/mpp         │
│ Agent loop  │  │ Explorer    │  │  (payment method)    │
│ Anthropic   │  │ Spec + Docs │  │                      │
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

> Pre-v0.7d, an `apps/server` (AWS ECS Fargate) on `api.t2000.ai` hosted a
> fee-ledger indexer + daily-intel cron. v0.7d Block C migrated both to Audric
> v2 on Vercel (Vercel cron + Audric's NeonDB). The `apps/server` directory
> and its ECS deployment are retired.

---

## Packages


| Package             | npm             | What it does                                                                      |
| ------------------- | --------------- | --------------------------------------------------------------------------------- |
| `@t2000/sdk`        | Published       | TypeScript SDK — agent core, adapters, safeguards                                 |
| `@t2000/engine`     | Published       | Agent engine — `AISDKEngine` (AI SDK v6), financial tools, MCP client/server |
| `@t2000/cli`        | Published       | Agent Wallet CLI — `t2 init` / `send` / `swap` / `pay` / `mcp install` / etc. v4 is intentionally narrow (no DeFi verbs in CLI). |
| `@t2000/mcp`        | Published       | MCP server — wraps the engine's tool registry (26 tools post-S.277) + 28 prompts (14 workflow prompts + 14 skill playbook prompts, baked from `t2000-skills/skills/`), stdio transport. The MCP package exports its own `t2000_*` wrappers (27 tools post-S.323; Volo wrappers cut alongside the SDK/CLI removal). |
| `@suimpp/mpp`       | Published       | Sui USDC payment method for MPP (client + server verification)                    |
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

### Engine chat (Audric / @t2000/engine)

For freeform queries typed into the chat, `AISDKEngine` processes the request via SSE streaming:

```
User types "What's my current balance?"
  │
  ├── POST /api/chat (SSE stream, JWT auth, Sui address)
  ├── AISDKEngine → AI SDK v6 streamText → @ai-sdk/anthropic → Claude with tool definitions
  ├── Tool calls (balance_check, savings_info, etc.) executed server-side
  │   └── MCP-first with SDK fallback for financial reads
  ├── Write tools → pending_action event → user confirms on-chain → client POSTs back to /api/chat with attemptId + tx result (inline resume)
  ├── Streaming text_delta, tool_start, tool_result, usage events
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
  └─ Print a warning footer: "Run `t2 limit set --per-tx <USD>` to opt into spending caps."
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
  → Print the wallet address from `t2 init` output (also reachable via `t2 receive`)
  → Send USDC from any Sui exchange or wallet to that address → ready to send + pay gasless
  → For swaps / SUI sends: also send a small amount of SUI (~0.05) for gas
```

> **Audric web app exception:** Audric web users (not CLI users) sign in with Google → Enoki zkLogin, and Enoki sponsors all gas. They never need to acquire SUI. The CLI uses the Sui foundation gasless sponsor for USDC / USDsui / MPP — a different mechanism, same effect for those specific operations.

### What exists after init

```
~/.t2000/
  ├── wallet.key       # Plain Bech32 JSON — { version: 2, secret: "suiprivkey1…" }
  └── config.json      # (only present after `t2 limit set` — opt-in spending caps + daily usage)
```

The agent now has:

- A Sui address (empty — fund it with USDC via any Sui exchange / wallet)
- No MCP install (run `t2 mcp install` to wire Claude / Cursor / Windsurf)
- No spending limits (run `t2 limit set` to opt in)
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

`gasCostSui` is computed from `effects.gasUsed.computationCost + storageCost − storageRebate`, divided by `1e9`. Every write method (`send`, `save`, `withdraw`, `borrow`, `repay`, `swap`, `claimRewards`) returns `gasCost` (in SUI) — there is **no `gasMethod` field** anymore.

### Audric web app (Enoki) sponsorship — not in the SDK

Enoki gas sponsorship lives in the Audric web app, **not** in `@t2000/sdk`. The web app:

1. Builds a Transaction via `@t2000/sdk` builder helpers (`buildSaveTx`, etc.)
2. Serializes the TX and sends it to Enoki's sponsorship endpoint
3. Enoki sets `gasOwner = Enoki gas wallet`, signs as sponsor
4. The web app signs with the user's ephemeral zkLogin key (dual-signed)
5. Submits to fullnode

This flow does NOT go through `executeTx`. It's a host-layer concern, documented in `audric/.cursor/rules/audric-transaction-flow.mdc`.

---

## Protocol Fees (wallet-direct architecture)

**Fees are an Audric (consumer) concern, not a t2000 (infra) concern.** As of `@t2000/sdk@1.1.0` (2026-04-30), no Move treasury contract is involved — fees flow inline within the consumer's PTB:

```
Audric prepare/route.ts
  │
  ├── splitCoins(paymentCoin, feeRaw)  [1]
  ├── transferObjects([feeCoin], T2000_OVERLAY_FEE_WALLET)  [2]
  ├── (continue with NAVI deposit / borrow / Cetus swap)
  └── tx submitted via Enoki sponsorship
                ↓
                on-chain — USDC transferred to T2000_OVERLAY_FEE_WALLET
                           in the same PTB as the operation
```

**Properties:**
- **Atomic with the operation.** `splitCoins + transferObjects` are PTB ops; if anything in the PTB reverts, the fee transfer reverts too.
- **No SDK fee logic.** `@t2000/sdk` (and therefore the CLI) is fee-free by design. Audric is the only fee owner; Audric's `prepare/route.ts` ALWAYS adds `addFeeTransfer(tx, coin, FEE_BPS, T2000_OVERLAY_FEE_WALLET, amount)` for save/borrow and ALWAYS passes `overlayFeeReceiver: T2000_OVERLAY_FEE_WALLET` for Cetus swaps. Structural inclusion (can't be forgotten because it IS the code).
- **Wallet IS the live ledger.** `client.getBalance({ owner: treasuryWallet })` reads "what's in the treasury right now." The marketing stats API (`apps/web/app/api/stats/route.ts`) uses live Sui RPC for the treasury + gateway balances. Historical aggregates (total fees collected across all time, including amounts already withdrawn) live in Audric's NeonDB, populated by Audric's Vercel cron — see the audric repo. (Pre-v0.7d, an `apps/server` ECS indexer wrote a `ProtocolFeeLedger` table here; that responsibility moved to Audric in Block C.)

**Fee rates:**

| Operation | Rate (bps) | Rate (decimal) | Source |
|-----------|------------|----------------|--------|
| `save`    | 10         | 0.001          | `SAVE_FEE_BPS` in `packages/sdk/src/constants.ts` |
| `borrow`  | 5          | 0.0005         | `BORROW_FEE_BPS` in `packages/sdk/src/constants.ts` |
| `swap`    | 10         | 0.001          | `OVERLAY_FEE_RATE` in `packages/sdk/src/protocols/cetus-swap.ts` |

---

## On-chain references (Sui mainnet)


| Object               | ID              | Purpose                                                              |
| -------------------- | --------------- | -------------------------------------------------------------------- |
| **Treasury Wallet**  | `0x5366ef...`   | **Audric overlay-fee receiver** (`T2000_OVERLAY_FEE_WALLET`)         |


> The legacy `t2000::treasury` Move package is dormant on-chain (no new traffic routes through it post-`@t2000/sdk@1.1.0`, 2026-04-30). Source was removed from the repo on 2026-04-30 — see git history pre-tag `v1.1.0` if needed for future admin ops. AdminCap remains with the treasury admin keypair; admin calls work via the on-chain ABI without needing local source.


---

## DeFi Adapters

### Protocol Registry

The SDK's `ProtocolRegistry` picks the best save APY among registered lending adapters (today: NAVI only):

```
agent.save('USDC', 100)
  → registry.bestSaveRate('USDC')
  → NAVI lending (MCP reads + thin tx builders)
```

### NAVI Adapter

- Lending: save, withdraw, borrow, repay
- Saveable assets: **USDC + USDsui only** (`OPERATION_ASSETS.save` / `.borrow` in `packages/sdk/src/constants.ts`). USDsui added as a strategic exception in v0.51.0 — it's the only other Sui-native stable with a productive NAVI pool, and USDsui-on-NAVI borrows must repay in USDsui. Holdable assets like USDT / USDe / GOLD / SUI are tradeable via Cetus but NOT saveable. See `.cursor/rules/savings-usdc-only.mdc`.
- MCP-first integration: reads via NAVI MCP, writes via thin tx builders
- Supports flash loans for complex operations

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
- Only outbound ops are guarded (send, pay) — save/withdraw/borrow are not
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

Write operations serialize structurally — `confirm`-tier writes yield a `pending_action` event so the host round-trips through user confirmation before the next step runs (prevents concurrent transactions + Sui object version conflicts). Auto-execute writes (USD-aware permission resolver, sub-threshold amounts) inherit one-write-per-step from the LLM's planning + the conservative-default preset. Safeguards are checked before every write. (Pre-v2.0.0 used an in-process `TxMutex`; v2 engine `AISDKEngine` doesn't instantiate one — the AI SDK step model + `needsApproval` round-trip is the actual serialization mechanism. Legacy `TxMutex` is still exported for back-compat consumers — see `packages/engine/src/v2/tool-policy.ts` lines 33-45.)

---

## Engine (`@t2000/engine`) — Audric Intelligence implementation

`@t2000/engine` is the moat. It implements **Audric Intelligence** — the 4-system financial agent that sits between the LLM and the SDK and turns "what does the user want?" into a safe, recorded, on-chain action. Audric Intelligence is _not a chatbot_: it reasons before acting (Reasoning Engine), orchestrates 26 financial tools in one conversation (Agent Harness), remembers what it knows about the user (Memory), and remembers what it told the user (AdviceLog).

```
                ┌────────────────────────────────────────────────┐
                │  Audric Intelligence (4 systems, one agent)    │
                │                                                │
   user prompt ─┼──► Reasoning ──► Harness ──► Memory + Advice   │
                │     (think)       (act)      (silent context)  │
                │                                                │
                └─► pending_action ──► user taps Confirm ──► sponsored Sui tx
                                                              + TurnMetrics + AdviceLog
```

| System | Owns | Implementation files |
|---|---|---|
| 🎛️ **Agent Harness** | 26 tools (18 read + 8 write), parallel reads via AI SDK step model, serial writes via `needsApproval` round-trip, permission gates, mid-stream tool dispatch | `v2/engine.ts`, `v2/define-tool.ts`, `v2/tool-policy.ts`, `v2/tool-wrapper.ts`, `tools/*` |
| ⚡ **Reasoning Engine** | Adaptive thinking, 12 guards, prompt caching, preflight. Multi-step playbooks (skills) ship from `@t2000/mcp`. | `classify-effort.ts`, `guards.ts`, `engine.ts` cache_control, `t2000-skills/skills/` |
| 🧠 **Memory (MemWal)** | Long-term vector memory (preferences, goals, risk tolerance, on-chain patterns) recalled per-turn via `prepareStep` → `<memory_recall>`; daily on-chain `<financial_context>` block from `UserFinancialContext` for fresh state | engine-side: `MemoryStore` interface, `InMemoryMemoryStore`, `memwal-prepare-step.ts`, `memwal-write-callback.ts`; audric-side: `UserFinancialContext` Prisma model + `buildFinancialContextBlock()` |
| 📓 **AdviceLog** | Every recommendation logged (`record_advice` audric-side tool); last 30 days hydrated each turn | audric-side: `AdviceLog` Prisma model + `buildAdviceContext()` |

> _The "four systems" framing is the canonical product narrative. (v0.7d Phase 6 Block A — 2026-05-21 — collapsed former "Silent Profile" + "Chain Memory" into a single MemWal-backed Memory system.) See `CLAUDE.md` (binding rules) and the per-system rules in `.cursor/rules/` (`agent-harness-spec.mdc`, `engine-tool-development.mdc`, `safeguards-defense-in-depth.mdc`)._

The rest of this section is the technical deep-dive: how each system is wired in code, then the two recent harness upgrades — **Spec 1 (Correctness)** and **Spec 2 (Intelligence)**.

### AISDKEngine

Stateful async-generator loop that drives conversations. (Pre-v2.0.0 this was a hand-rolled `QueryEngine`; v2.0.0 cut over to wrapping Vercel AI SDK v6's `streamText` while preserving the same public API surface — `QueryEngine` was deleted, `AISDKEngine` is the only engine.)

```
User prompt
    → LLM (Anthropic Claude via AISDKAnthropicProvider → @ai-sdk/anthropic)
    → AI SDK step lifecycle (start-step / tool-call / tool-result / finish-step)
    → Per-step dedupe of duplicate concurrent read tool_calls
    → Per-tool needsApproval check (auto / confirm / explicit, USD-aware)
    → Tool execution (read tools parallel within a step; write tools yield pending_action then resume)
    → Results fed back to LLM
    → Repeat until end_turn or max_turns
```

`AISDKEngine.submitMessage(prompt)` returns `AsyncGenerator<EngineEvent>` — consumers iterate over events to build their UI (terminal, web, extension).

### Tool System

Tools are built with `defineTool()` (the v2 factory; the pre-v2.0.0 `buildTool` was deleted in engine 1.38.0) which enforces:

- **Zod input validation** with auto-generated JSON schema for the LLM
- **Permission tiers**: `auto` (no approval), `confirm` (user must approve), `explicit` (manual only)
- **Concurrency flags**: `isReadOnly` and `isConcurrencySafe` (drive per-step dedupe, not a mutex)

Tool dispatch in `AISDKEngine`:

- Read-only `isConcurrencySafe` tools → AI SDK runs them in parallel within a step; identical concurrent calls are deduped per-step (engine.ts L1145-L1149)
- Write tools → serial via the step + `needsApproval` round-trip: confirm-tier writes yield `pending_action`, host round-trips through user confirm, next step runs the next write. Prevents Sui object version conflicts structurally without an in-process mutex.

(Legacy `runTools()` + `TxMutex` from `orchestration.ts` are still exported for back-compat with non-AISDKEngine callers and certain MCP server tests — but the v2 engine doesn't use them.)

### Built-in Financial Tools


| Read (parallel, auto)     | Write (serial, confirm) |
| ------------------------- | ----------------------- |
| `render_canvas`           | `save_deposit`          |
| `balance_check`           | `withdraw`              |
| `savings_info`            | `send_transfer`         |
| `health_check`            | `borrow`                |
| `rates_info`              | `repay_debt`            |
| `transaction_history`     | `claim_rewards`         |
| `swap_quote`              | `harvest_rewards`       |
| `explain_tx`              | `swap_execute`          |
| `portfolio_analysis`      |                         |
| `token_prices`            |                         |
| `create_payment_link`     |                         |
| `list_payment_links`      |                         |
| `cancel_payment_link`     |                         |
| `spending_analytics`      |                         |
| `yield_summary`           |                         |
| `activity_summary`        |                         |
| `resolve_suins`           |                         |
| `pending_rewards`         |                         |


**18 read tools, 8 write tools, 26 total.** Read tools implement an MCP-first strategy: if a `McpClientManager` is configured and connected to NAVI MCP, data is fetched via MCP. Otherwise, the SDK is used as fallback. `balance_check`, `portfolio_analysis`, and `token_prices` use the BlockVision Indexer REST API for spot prices and wallet portfolio (Sui-RPC + hardcoded-stable degraded fallback).

> **Tool-count history (most → least recent):**
> - S.323 (May 2026) — full Volo removal from SDK + CLI + MCP. Engine count unchanged.
> - S.277 (May 2026) — "Earns Its Keep" audit (engine 2.18.0) cut Volo trio + `web_search` + `protocol_deep_dive` → **26 total** (current).
> - S.269 (May 2026) — deleted `save_contact` + 3 invoice tools (`create_invoice` / `list_invoices` / `cancel_invoice`); payment links absorb the invoicing use case.
> - S.245 (May 2026) — deleted `pay_api` + `mpp_services`; the MPP gateway capability returns as Commerce primitives in the upcoming Audric Store SPEC.
> - S.119 + Track B (May 2026) — added `pending_rewards` + `harvest_rewards`.
> - v1.4 BlockVision swap (April 2026) — replaced 7 `defillama_*` tools with one `token_prices` tool; `balance_check` + `portfolio_analysis` rewired to BlockVision Indexer REST.
> - S.7 (April 2026) — removed `allowance_*` / `*_schedule` / `*_pattern` tools (allowance contract dormant; DCA can't sign without user presence under zkLogin; proposal pipeline removed).

### Reasoning Engine (Shipped — always on)

The engine includes a three-layer reasoning system (extended thinking always on for Sonnet/Opus):

1. **Adaptive thinking** (`classify-effort.ts`) — routes queries to `low`/`medium`/`high`/`max` thinking effort. `low` routes to Haiku; `max` reserved for Opus
2. **Guard runner** (`guards.ts`) — 12 guards across 3 priority tiers (Safety > Financial > UX): 10 pre-execution gates + 2 post-execution hints. First block wins; warnings/hints are injected back into the LLM context. (Pre-S.277 had 14 guards; `cost_warning` + `artifact_preview` removed in engine 2.18.0 as dead code post-S.245 `pay_api` and image-output tool cuts.)
3. **Skills** (`t2000-skills/skills/*/SKILL.md`, baked into `@t2000/mcp`) — 14 markdown playbooks exposed to MCP clients as `skill-<name>` prompts. The 6 multi-step skills (`t2000-rebalance`, `t2000-account-report`, `t2000-borrow` with safe-borrow logic, `t2000-withdraw` with emergency-close logic, `t2000-save` with swap-and-save section, `t2000-send` with offer-save-contact) absorbed the orchestration that pre-Phase 6 lived in YAML recipes. The runtime recipe registry was deleted v0.7a Phase 6 (May 2026); skills guide the LLM via prose, the engine just runs the tools the LLM picks.

Additional features:

- **Prompt caching** — system prompt + tool definitions cached across turns (Anthropic `cache_control`)
- **Context compaction** — `ContextBudget` (200k limit, 85% compact trigger) with LLM summarizer + truncation fallback
- **Tool flags** — `ToolFlags` interface on all tools (mutating, requiresBalance, affectsHealth, irreversible, etc.)
- **Preflight validation** — input validation gate on `send_transfer`, `swap_execute`, `borrow`, `save_deposit`
- **Streaming tool dispatch** — AI SDK v6's `streamText` natively dispatches read-only `isConcurrencySafe` tools as soon as each `tool-call` event completes (no separate dispatcher; legacy `EarlyToolDispatcher` exported for back-compat with non-AISDKEngine callers)
- **Tool result budgeting** — `maxResultSizeChars` caps output; truncated with re-call hint
- **Microcompact** — deduplicates identical tool calls in history with back-references
- **Granular permissions** — USD-aware `resolvePermissionTier()` with conservative/balanced/aggressive presets

### Canvas System

The engine supports rich interactive visualizations via HTML canvases:

- `render_canvas` tool generates HTML content for charts, timelines, heatmaps
- `canvas` SSE event type delivers rendered content to the client
- Used for portfolio timeline, spending breakdown, activity heatmap, financial reports

### Token Registry

All token metadata is centralized in `packages/sdk/src/token-registry.ts`:

- `COIN_REGISTRY` — 19 tokens with type, decimals, symbol (Tier 1: USDC, Tier 2: 15 swap assets, Legacy: 3)
- `getDecimalsForCoinType(coinType)` — decimals lookup with suffix matching
- `resolveSymbol(coinType)` — human-friendly name from full coin type
- `resolveTokenType(name)` — case-insensitive name → full coin type
- `TOKEN_MAP` — name → type mapping for swap resolution

No hardcoded decimal heuristics anywhere in the codebase. All tools, adapters, and UI components derive token data from this registry.

### Balance Validation (Defense-in-Depth)

Three-layer validation prevents impossible transactions:

1. **LLM prompt** (probabilistic) — system prompt instructs the LLM to check balances before calling write tools
2. **Client-side `validateAction`** (deterministic) — pre-flight check using cached balance data, auto-denies over-balance actions before the confirm dialog renders
3. **Server-side `validateBalance`** (deterministic) — final on-chain balance check in the API route before transaction building

### Delegated Execution Flow

Write tools with `permissionLevel: 'confirm'` yield a `pending_action` event:

```
Engine yields pending_action(toolName, toolUseId, input, description,
                             assistantContent, turnIndex, attemptId,
                             modifiableFields?)
    → Client displays confirmation UI (PermissionCard)
    → User may edit any field declared in `modifiableFields`
    → Client executes the transaction on-chain (Enoki sponsored)
    → Client POSTs back to the same /api/chat route with the execution
      result + any `modifications` overlay, keyed on `attemptId`
    → Engine reconstructs the full turn from the post-modification input
    → Server updates `TurnMetrics` (keyed on `attemptId`) with the resolved
      `pendingActionOutcome` ('approved' | 'declined' | 'modified')
```

This stateless flow is serverless-friendly — no long-lived SSE connections needed for write operations.

`attemptId` (engine v1.4.2+, see `.cursor/rules/agent-harness-spec.mdc` Item 3) is a UUID v4 stamped per `pending_action` yield; it's the canonical resume key. `turnIndex` (engine 0.41.0) is derived from the assistant message count when the action is yielded, kept as a join hint for legacy paths. `modifiableFields` is the engine-side declaration of which `input` keys the user is allowed to edit before approval — sourced from the `TOOL_MODIFIABLE_FIELDS` registry — and the resume path applies the resulting `modifications` to `action.input` so the conversation history reflects what was actually approved on-chain.

> Pre-v0.7e Phase 5, resume lived behind a standalone `/api/engine/resume` route. That route was retired in audric v0.7e Phase 5 (2026-05-22); resume is now inline in the same `/api/chat` POST that initiates the turn, keyed on the `attemptId` round-tripping through the user-confirm event.

### MCP Integration

**MCP Client** (`McpClientManager`): Multi-server registry connecting to external MCP servers (e.g., NAVI Protocol). Supports `streamable-http` and `sse` transports with client-side response caching.

**MCP Server** (`buildMcpTools`, `registerEngineTools`): Adapter that converts engine `Tool` objects into MCP tool definitions for hosts that want to expose the full engine surface over MCP. (The published `@t2000/mcp` package uses a narrower 9-tool CLI-mapped surface — see § MCP Server above.)

**MCP Tool Adapter** (`adaptMcpTool`): Converts tools discovered from external MCP servers into engine `Tool` objects with namespacing and configurable permissions.

### Supporting Modules


| Module                      | Purpose                                                             |
| --------------------------- | ------------------------------------------------------------------- |
| `AnthropicProvider`         | Streaming LLM provider with tool use and usage reporting            |
| `CostTracker`               | Cumulative token usage, USD cost estimation, budget kill switch     |
| `MemorySessionStore`        | In-memory session store with TTL and data isolation                 |
| `compactMessages`           | Three-phase context window compaction (summarize → drop → truncate) |
| `serializeSSE` / `parseSSE` | Wire-safe SSE event format for web transport (the only wire-format SSOT) |
| `validateHistory`           | Pre-flight message history validation before every LLM call         |
| `withStreamState`           | SPEC 21.1 stream-state wrapper — `routing`/`quoting`/etc → `stream_state` events for UI motion (hosts wrap EngineEvent iteration; `engineToSSE` adapter was removed in v2.2.0) |


### NAVI MCP Integration

Dedicated integration layer for NAVI Protocol's MCP server:

- `navi-config.ts` — Server URL, transport config, 26 tool name constants
- `navi-transforms.ts` — Pure functions converting raw MCP responses to typed engine structures (rates, positions, health factor, balance, savings, rewards) with USD price conversion
- `navi-reads.ts` — Composite read functions orchestrating parallel MCP calls with transforms

### Memory — MemWal (system 3 of 4)

> _Knows the user. Long-term vector memory (preferences, goals, risk tolerance, on-chain patterns) recalled per-turn, plus a daily on-chain `<financial_context>` snapshot for fresh state._

v0.7d Phase 6 Block A (2026-05-21) collapsed the former "Silent Profile" + "Chain Memory" systems into a single MemWal-backed Memory system. Two layers cooperate, both consumed silently via the system prompt:

| Layer | Storage | Refresh | Used as |
|---|---|---|---|
| MemWal vector memory | `@mysten-incubation/memwal` (vector store) | `MemoryStore.recall(latestUserMessage)` per-turn via `prepareStep`; new facts extracted post-turn via `memwal.analyze()` in `onFinish` | `<memory_recall>` block (top-K facts) |
| `UserFinancialContext` (Prisma, audric-side) | savings/wallet/debt USD, health factor, weighted savings APY, recent activity, last-session days | 02:00 UTC Vercel cron `financial-context-snapshot`; refreshed on-demand after large writes | `<financial_context>` block |

The two blocks together let every chat start oriented — no warm-up tool calls, no "let me check your balance" before the agent says anything useful. Silent context only — never surfaced as a nudge or notification.

Hosts inject a `MemoryStore` via `EngineConfig.memoryStore`. CLI / MCP / tests use the `InMemoryMemoryStore` default; production audric injects a MemWal-backed store. Recall failures degrade gracefully (empty `<memory_recall>` layer).

> Implementation contract: `.cursor/rules/memory-injection-architecture.mdc`. Engine wiring: `packages/engine/src/v2/memwal-prepare-step.ts` + `memwal-write-callback.ts`. Audric-side `UserFinancialContext` schema lives in `audric/apps/web-v2/prisma/schema.prisma`.

### AdviceLog (system 4 of 4)

> _Remembers what it told you. Every recommendation is logged; last 30 days hydrated each turn._

`record_advice` is an audric-side tool (not exported from `@t2000/engine`) that writes `AdviceLog` rows whenever Audric makes a recommendation (e.g. "save $50 into NAVI", "wait on the swap, slippage is high"). On the next turn, `buildAdviceContext()` rehydrates the last 30 days of advice into the `<advice_log>` system-prompt block so the chat doesn't contradict itself across sessions.

`AdviceLog.actedOn` is updated when the corresponding write tool succeeds via `EngineConfig.onAutoExecuted` — letting the agent see "I told you to save and you did" vs "I told you to save and you didn't" on the next turn.

> Implementation contract: audric repo — `audric/apps/web-v2/lib/engine/advice-tool.ts`.

### Spec 1 — Correctness (engine v0.41.0–v0.50.3)

Spec 1 closed three correctness holes that made Audric inconsistent under load:

| Bug class | Fix |
|---|---|
| `pending_action` events couldn't be safely correlated to a turn (multiple actions per turn ambiguous) | Stamped a per-yield UUID v4 `attemptId` on every `pending_action`. Hosts persist it on `TurnMetrics` and key the resume `updateMany` on it. |
| Users couldn't edit fields on a confirm card (e.g. amount) without losing the LLM's reasoning | Added `modifiableFields: PendingActionModifiableField[]` to `pending_action`, sourced from the `TOOL_MODIFIABLE_FIELDS` registry. The resume path applies `modifications` so conversation history reflects what was approved on-chain. |
| `auto`-permission tools (write tools that don't require confirm) had no completion hook for AdviceLog / TurnMetrics | Added `EngineConfig.onAutoExecuted({ toolName, input, result, walletAddress, sessionId, turnIndex })` — fires after the engine executes any `auto` tool. |

Together these give hosts a stable join key from `pending_action` → on-chain receipt → `TurnMetrics.pendingActionOutcome` ('approved' / 'declined' / 'modified') and let auto-executed writes participate in the same telemetry as confirm-gated ones.

> Cross-repo contract: `t2000/.cursor/rules/agent-harness-spec.mdc` + `audric/.cursor/rules/audric-transaction-flow.mdc` + `audric/.cursor/rules/write-tool-pending-action.mdc`.

### Spec 2 — Intelligence (engine v0.47.0–v0.54.1)

Spec 2 swapped the data layer + added boot-time orientation:

| Change | Why |
|---|---|
| **BlockVision swap** — replaced 7 `defillama_*` tools with one `token_prices` tool; `balance_check` + `portfolio_analysis` rewired to BlockVision Indexer REST | DefiLlama was slow + frequently 5xx for Sui-native assets; BlockVision returns wallet portfolio + USD prices in a single round-trip. (S.277 / engine 2.18.0 later removed the last DefiLlama caller `protocol_deep_dive`; engine no longer talks to `api.llama.fi`.) |
| **Sticky-positive cache + retry/circuit breaker** for BlockVision (`fetchBlockVisionWithRetry`, `_resetBlockVisionCircuitBreaker`) | BlockVision started returning 429s under load; the cache no longer overwrites known-good positive values with degraded zeros. |
| **`<financial_context>` block** injected at every engine boot from the daily `UserFinancialContext` snapshot | Every chat starts oriented — no warm-up tool calls before useful answers. Memory system (post-Block A). |
| **`attemptId` keyed resume** — host's resume path keys `updateMany({ where: { attemptId } })` instead of fragile `(sessionId, turnIndex)` | Two pending actions in the same turn no longer overwrite each other's `pendingActionOutcome`. |

> Resilience contract: `t2000/.cursor/rules/blockvision-resilience.mdc`.

---

## Audric — the five products

The Audric consumer brand groups everything into exactly **five products**. (S.18 reverted S.17's Finance retirement: Intelligence was overloaded as both "the moat" and "the home for every financial verb," and Send/Receive overlapped Pay. Finance now owns save/credit/swap/charts; Pay owns send/receive.)


| Product                    | What it is                                                                                                                                                                | Implementation                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 🪪 **Audric Passport**     | Trust layer — identity (zkLogin via Google), non-custodial wallet on Sui, tap-to-confirm consent, Enoki-sponsored gas (web only)                                          | `@t2000/sdk` + Enoki + `@mysten/sui`                                                  |
| 🧠 **Audric Intelligence** | Brain (the moat) — 4 systems orchestrate every money decision (see breakdown below)                                                                                       | `@t2000/engine`                                                                       |
| 💰 **Audric Finance**      | Manage your money on Sui — Save (NAVI lend), Credit (NAVI borrow), Swap (Cetus aggregator), Charts (yield/health/portfolio viz). Every write taps to confirm via Passport | `@t2000/sdk` NAVI builders + `cetus-swap.ts` + `@t2000/engine` chart canvas templates |
| 💸 **Audric Pay**          | Money primitive — send USDC, receive via payment links / invoices / QR. Free, global, instant on Sui                                                                      | `@t2000/sdk` Sui tx builders + payment-kit                                            |
| 🛒 **Audric Store**        | Creator marketplace at `audric.ai/username`. Coming soon (Phase 5)                                                                                                        | `@t2000/sdk` + Walrus + payment links                                                 |


See `audric-roadmap.md` for the canonical taxonomy + naming rules.

---

## Audric Intelligence — the 4-system moat (product narrative)

> **Not a chatbot. A financial agent.** Four systems work together to understand the user's money, reason about decisions, and get smarter over time. Every action still waits on Passport's tap-to-confirm.
>
> _The technical deep-dive (per-system implementation, Spec 1, Spec 2) lives under [`## Engine (\`@t2000/engine\`)`](#engine-t2000engine--audric-intelligence-implementation) above. This section is the consumer-product / brand framing._
>
> The "autonomous agent" framing of the prior Audric 2.0 spec was retired in the April 2026 simplification. Pattern proposals, the trust ladder, the scheduled-actions executor, and the notification templates were deleted because zkLogin requires user presence to sign — "autonomous" was reminders dressed up as agency. See the S.0–S.12 entries in `audric-build-tracker.md`.

| System | One-line pitch | Implementation |
|---|---|---|
| 🎛️ **Agent Harness** | 26 tools, one agent — the runtime that manages your money in one conversation. | `@t2000/engine` `AISDKEngine` + `getDefaultTools()` (18 read + 8 write) |
| ⚡ **Reasoning Engine** | Thinks before it acts — adaptive thinking, 12 guards, prompt caching. Multi-step playbooks (skills) ship from `@t2000/mcp`. | `classify-effort.ts`, `guards.ts`, `engine.ts` cache_control, `t2000-skills/skills/` |
| 🧠 **Memory (MemWal)** | Knows the user — vector memory of preferences / goals / risk tolerance / on-chain patterns recalled per-turn + daily `<financial_context>` snapshot for fresh state. | `MemoryStore` + MemWal vector memory + `UserFinancialContext` + 02:00 UTC cron |
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
| Financial Context   | `UserFinancialContext` model (audric-side): savings/wallet/debt USD, health factor, weighted savings APY, recent activity. Refreshed by Vercel `financial-context-snapshot` cron @ 02:00 UTC. |
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
Tag vX.Y.Z (t2000 monorepo, all 4 packages bumped in lockstep)
  → CI: lint + typecheck + test
  → Build all packages
  → Publish: @t2000/sdk, @t2000/engine, @t2000/mcp, @t2000/cli
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
| **Safeguards**    | Opt-in spending limits (`t2 limit set`), per-tx + daily caps           |
| **On-chain**      | Inline fee transfer (Audric only), atomic Payment Intents, indexed ledger |
| **MPP**           | HMAC-bound challenges (stateless), on-chain USDC verification          |
| **API keys**      | Upstream keys stored as Vercel env vars, never exposed to agents       |


### Key management

- **Algorithm**: Ed25519 (`@mysten/sui/keypairs/ed25519`)
- **At-rest format**: Plain Bech32 JSON — `{ version: 2, secret: "suiprivkey1…" }` with `0o600` perms. **No PIN, no AES, no scrypt** (v4 trades the "user forgets PIN" failure mode for filesystem ACL trust)
- **No mnemonic**: Raw keypair only — no seed phrase to leak
- **Import/export**: `t2 export` prints the Bech32 secret; `t2 init --import` accepts a Bech32 secret on the target machine. Pair them to move wallets.

### Safeguard enforcement

Spending limits are **opt-in**. After `t2 init`, the user runs `t2 limit set --per-tx <USD> --daily <USD>` to write caps to `~/.t2000/config.json`. By default no limits are enforced; the init footer warns the user about this.

```
Any outbound write operation (send / swap / pay)
  │
  ├── Limit check (only if t2 limit set was run)
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
- **Engine** (`AISDKEngine` driving the conversational harness): structural via AI SDK step model + `needsApproval` round-trip (confirm-tier writes yield `pending_action`, host round-trips, next step runs next write).
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
- **`@t2000/engine` `AISDKEngine`** serializes structurally via the AI SDK step model + `needsApproval` round-trip — confirm-tier writes yield `pending_action`, host round-trips through user confirm, the next step runs the next write. Auto-execute writes (USD-aware permission resolver, sub-threshold amounts) inherit one-write-per-step from the LLM's planning + the conservative-default preset.
- **Audric web** serializes per-user via the sponsored-tx flow (one transaction prepare → sign → execute round-trip at a time per session).

Pre-v2.0.0 the engine instantiated an in-process `TxMutex` (still exported for back-compat consumers — see `packages/engine/src/v2/tool-policy.ts` L33-45); v2.0.0 deleted that wiring in favor of the structural mechanism above. Sui object version conflicts are prevented by the structural one-write-per-step contract, not a lock.

### What the server knows vs doesn't


| Server knows                                  | Server does NOT know            |
| --------------------------------------------- | ------------------------------- |
| Agent Sui address (when surfaced via Audric sponsored-tx prepare or MPP gateway payment) | Private key                     |
| On-chain transaction digests (public)         | What the TX does (opaque bytes) |
| Protocol fee transfers (from chain, atomic with the op) | CLI usage, local commands       |
| —                                             | Wallet balance (read on demand) |
| —                                             | Which AI client is used         |


