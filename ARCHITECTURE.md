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
   │  │  QueryEngine · LLM Provider · Tool System · MCP Client          │
   │  │  Streaming · Sessions · Cost Tracking · Context Management      │
   │  └────────┬──────────────────────────────────────────────────────┘
   │           │
   │           ▼
   │  ┌──────────────────────────────────────────────────────────────────┐
   │  │                        @t2000/sdk                                │
   │  │                                                                  │
   │  │  Agent core · Safeguards · Protocol registry                     │
   │  │  Adapters: NAVI                                                   │
   │  └────────┬──────────────┬──────────────┬───────────────────────────┘
   │           │              │              │
   ▼           ▼              ▼              ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐
│ Web App     │  │ t2000 Server│  │ MPP Gateway │  │   Sui Blockchain     │
│ (Vercel)    │  │ (ECS)       │  │ (Vercel)    │  │                      │
│             │  │             │  │             │  │  USDC · NAVI ·       │
│ zkLogin     │  │ Fee ledger  │  │ 40 services │  │  t2000 Treasury      │
│ Enoki gas   │  │ Indexer     │  │ 88 endpoints│  │  @suimpp/mpp         │
│ Agent loop  │  │ Daily-intel │  │ Explorer    │  │  @suimpp/mpp      │
│ Anthropic   │  │   cron      │  │ Spec + Docs │  │  (payment method)    │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────────────────────┘
       │                │                │
       ▼                ▼                ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ NeonDB      │  │  NeonDB     │  │ Upstream    │
│ (web app)   │  │  (server)   │  │ APIs        │
│             │  │             │  │             │
│ Users       │  │ Agents      │  │ OpenAI      │
│ Preferences │  │ Transactions│  │ Anthropic   │
│ Sessions    │  │ Fee events  │  │ Brave       │
│             │  │             │  │ + 37 more   │
└─────────────┘  └─────────────┘  └─────────────┘
```

---

## Packages


| Package             | npm             | What it does                                                                      |
| ------------------- | --------------- | --------------------------------------------------------------------------------- |
| `@t2000/sdk`        | Published       | TypeScript SDK — agent core, adapters, safeguards                                 |
| `@t2000/engine`     | Published       | Agent engine — QueryEngine, financial tools, LLM orchestration, MCP client/server |
| `@t2000/cli`        | Published       | 29 CLI commands — `t2000 init`, `t2000 save`, `t2000 pay`, etc.                   |
| `@t2000/mcp`        | Published       | MCP server — 29 tools + 15 prompts (subset of engine's 34 tools), stdio transport |
| `@suimpp/mpp`       | Published       | Sui USDC payment method for MPP (client + server verification)                    |
| `@suimpp/discovery` | Published       | Sui-specific discovery validation — OpenAPI checks + 402 probe                    |
| `mppx`              | External (wevm) | MPP protocol middleware — 402 challenge/credential flow                           |


## Apps


| App            | Hosting         | Domain       | What it does                                                                                                                                                                             |
| -------------- | --------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audric         | Vercel          | audric.ai    | Consumer product — Passport (zkLogin), Intelligence (engine chat), Finance (NAVI save/borrow + Cetus swap + charts), Pay (USDC transfers + receive), Store (coming soon) (separate repo) |
| `apps/web`     | Vercel          | t2000.ai     | Infrastructure landing page + docs                                                                                                                                                       |
| `apps/gateway` | Vercel          | mpp.t2000.ai | MPP gateway — 40 services, 88 endpoints, explorer, spec, docs                                                                                                                            |
| `apps/server`  | AWS ECS Fargate | api.t2000.ai | Fee ledger + indexer + Audric daily-intel cron orchestration                                                                                                                             |
| Indexer        | AWS ECS Fargate | —            | Checkpoint indexer, yield snapshotter                                                                                                                                                    |


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

For freeform queries typed into the chat, the `QueryEngine` processes the request via SSE streaming:

```
User types "What's my current balance?"
  │
  ├── POST /api/engine/chat (SSE stream, JWT auth, Sui address)
  ├── QueryEngine → AnthropicProvider → Claude with tool definitions
  ├── Tool calls (balance_check, savings_info, etc.) executed server-side
  │   └── MCP-first with SDK fallback for financial reads
  ├── Write tools → pending_action event → POST /api/engine/resume (delegated execution)
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

Payment infrastructure for machine-to-machine commerce. 40 services, 88 endpoints.

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
| Commerce            | 2     | Lob, Printful                                                                                             |
| Security            | 1     | VirusTotal                                                                                                |


---

## suimpp.dev — Ecosystem Hub

Protocol-level registry and explorer for all MPP servers on Sui. Separate from the gateway — this is the open standard site.


| App                             | Domain     | Database          | Purpose                                       |
| ------------------------------- | ---------- | ----------------- | --------------------------------------------- |
| `apps/suimpp` (suimpp monorepo) | suimpp.dev | NeonDB (separate) | Server registry, payment explorer, spec, docs |


### Server Registration Flow

Any MPP server on Sui can register. The flow uses `@suimpp/discovery` for validation:

```
Provider enters URL at suimpp.dev/register
  │
  ├── POST /api/validate { url }
  │   │
  │   ├── Fetch {url}/openapi.json
  │   │   → Parse OpenAPI 3.x document
  │   │   → Extract endpoints with x-payment-info
  │   │   → Validate schemas, 402 responses, pricing
  │   │
  │   ├── Probe first POST endpoint
  │   │   → Send empty request
  │   │   → Expect 402 Payment Required
  │   │   → Parse WWW-Authenticate header
  │   │   → Verify: method=sui, valid USDC currency, valid recipient address
  │   │
  │   └── Return CheckResult { ok, discovery, probe, summary }
  │
  ├── UI shows pass/fail checklist:
  │   ✓ OpenAPI document found
  │   ✓ N payable endpoints detected
  │   ✓ 402 challenge verified
  │   ✓ Sui USDC payment method detected
  │   ✓ Recipient address valid
  │   ✗ Missing schema on POST /api/translate (if applicable)
  │
  ├── Preview card: title, endpoint count, price range
  │
  ├── POST /api/register { url }
  │   → Re-validates (never trust client state)
  │   → Generates slug from OpenAPI title
  │   → Extracts categories from endpoint paths
  │   → Stores endpoints with pricing as JSON
  │   → Creates Server record in DB
  │
  └── Redirect to /servers/{slug}
```

### Payment Reporting Pattern

Payments are reported by the gateway, not by the protocol library directly. This ensures every report includes both on-chain data (from verification) and request context (from the HTTP layer).

```
┌─────────────────────────────────────────────────────────────────┐
│  @suimpp/mpp (library layer)                                    │
│                                                                 │
│  verify() callback fires after on-chain verification:           │
│    → Extracts: digest, sender, recipient, amount, currency,    │
│      network from Sui transaction balance changes              │
│    → Calls onPayment(report) with this data                    │
└────────────────────────┬────────────────────────────────────────┘
                         │ onPayment({ digest, sender, ... })
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Gateway (application layer)                                    │
│                                                                 │
│  1. onPayment stashes report in pendingReports Map (by digest) │
│  2. charge() middleware returns                                 │
│  3. Gateway extracts digest from Payment-Receipt header        │
│  4. Looks up on-chain report by digest                         │
│  5. Enriches with request context: service name, endpoint path │
│  6. Sends single complete POST to registry                     │
└────────────────────────┬────────────────────────────────────────┘
                         │ POST /api/report { digest, sender,
                         │   recipient, amount, currency, network,
                         │   serverUrl, service, endpoint }
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  suimpp.dev/api/report                                          │
│                                                                 │
│  → Match server by URL or recipient address                    │
│  → Deduplicate by digest (unique constraint)                   │
│  → Store payment with all fields                               │
└─────────────────────────────────────────────────────────────────┘
```

**Why this pattern (not library-level HTTP)?**

The `verify()` callback inside `@suimpp/mpp` has access to on-chain data (sender address from balance changes) but NOT the HTTP request (endpoint path, service name). The gateway's `chargeProxy`/`chargeCustom` wrappers have request context but NOT on-chain data. The `onPayment` callback bridges the two: the library emits verified payment data, the gateway collects it by digest, enriches with endpoint context, and sends one complete report.


| Data field  | Source            | Available in  |
| ----------- | ----------------- | ------------- |
| `digest`    | On-chain TX       | verify()      |
| `sender`    | Balance changes   | verify()      |
| `recipient` | Config            | verify()      |
| `amount`    | Challenge request | verify()      |
| `currency`  | Config            | verify()      |
| `network`   | Config            | verify()      |
| `service`   | HTTP request URL  | chargeProxy() |
| `endpoint`  | HTTP request URL  | chargeProxy() |
| `serverUrl` | Config            | chargeProxy() |


**Gateway integration (reference implementation):**

```typescript
import { sui } from '@suimpp/mpp/server';
import type { PaymentReport } from '@suimpp/mpp/server';

const pendingReports = new Map<string, PaymentReport>();

const mppx = Mppx.create({
  realm: 'mpp.example.com',
  methods: [sui({
    currency: SUI_USDC_TYPE,
    recipient: TREASURY_ADDRESS,
    network: 'mainnet',
    onPayment: (report) => {
      pendingReports.set(report.digest, report);
    },
  })],
});

// After charge() returns successfully:
const digest = parseReceiptDigest(response.headers.get('Payment-Receipt'));
const report = digest ? pendingReports.get(digest) : undefined;
if (report) {
  pendingReports.delete(report.digest);
  fetch('https://suimpp.dev/api/report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...report,
      serverUrl: 'https://mpp.example.com',
      service: inferredService,
      endpoint: inferredEndpoint,
    }),
  }).catch(() => {});
}
```

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

### Data Model

```prisma
model Server {
  id            Int       @id @default(autoincrement())
  name          String
  slug          String    @unique
  url           String    @unique
  openapiUrl    String
  description   String?
  recipient     String?
  verified      Boolean   @default(false)
  status        String    @default("active")
  endpoints     Int       @default(0)
  categories    String    @default("")
  endpointData  String    @default("[]")  // JSON array of endpoint info
  payments      Payment[]
}

model Payment {
  id        Int      @id @default(autoincrement())
  serverId  Int
  server    Server   @relation(...)
  digest    String?  @unique
  sender    String?
  recipient String?
  amount    String
  currency  String?
  network   String   @default("mainnet")
  service   String   @default("")
  endpoint  String   @default("")
  createdAt DateTime @default(now())
}
```

### Pages


| Page          | Route             | What it shows                                            |
| ------------- | ----------------- | -------------------------------------------------------- |
| Spec          | `/spec`           | Sui MPP charge method specification                      |
| Docs          | `/docs`           | Developer guide — "Pay for APIs" + "Accept Payments"     |
| Explorer      | `/explorer`       | All payments across all servers — charts, table, filters |
| Servers       | `/servers`        | Registered servers with stats, sparklines, sort/filter   |
| Server Detail | `/servers/{slug}` | Stats, volume chart, endpoints table, recent payments    |
| Register      | `/register`       | URL input → live validation → preview → register         |


### FAQ

**Q: How does a new server get its payments tracked?**
A: Register at `suimpp.dev/register`. The server must serve `/openapi.json` with `x-payment-info` extensions and respond with 402 challenges using the `sui` payment method. After validation passes, the server is created in the DB. The gateway then reports each verified payment to `suimpp.dev/api/report` using the `onPayment` callback pattern.

**Q: What if a server doesn't use `@suimpp/mpp`?**
A: The `onPayment` pattern is the recommended way. For backwards compatibility, `@suimpp/mpp` also supports `registryUrl` which fires directly from `verify()` — but this lacks endpoint context. Any server can also POST directly to `/api/report` as long as it includes the required fields (digest, amount, serverUrl or recipient).

**Q: How are servers matched to payments?**
A: The `/api/report` endpoint matches by `serverUrl` first (exact URL match), then falls back to `recipient` address. Both are set during registration.

**Q: What prevents spam registrations?**
A: The validation flow is the gate. A server must serve a valid OpenAPI document with payable endpoints AND respond to a live 402 probe. You can't register a URL that doesn't actually run an MPP server.

**Q: How are endpoint stats computed?**
A: During registration, all endpoints with `x-payment-info` are stored as JSON in the `endpointData` column. Per-endpoint transaction counts are computed at render time by aggregating the `endpoint` field from payment records.

---

## Agent Init (`t2000 init`)

Three-step guided setup that takes a new user from zero to a fully operational AI agent:

```
t2000 init
  │
  ├─ Step 1: Wallet
  │   ├─ Generate Ed25519 keypair
  │   ├─ User sets a PIN (passphrase)
  │   ├─ Encrypt with AES-256-GCM (scrypt-derived key)
  │   ├─ Write to ~/.t2000/wallet.key (mode 0600)
  │   ├─ Cache PIN in ~/.t2000/.session (mode 0600)
  │   └─ Show funding instructions (buy SUI on Mercuryo + send USDC to wallet)
  │
  ├─ Step 2: MCP platforms
  │   ├─ Detect installed: Claude Desktop / Cursor / Windsurf
  │   ├─ Add mcpServers.t2000 = { command: 't2000', args: ['mcp'] }
  │   └─ Skip platforms already configured
  │
  └─ Step 3: Safeguards
      ├─ Set maxPerTx (default $500)
      ├─ Set maxDailySend (default $1000)
      └─ Write to ~/.t2000/config.json
```

### Key encryption


| Parameter      | Value                                                     |
| -------------- | --------------------------------------------------------- |
| Algorithm      | AES-256-GCM                                               |
| Key derivation | scrypt (N=2¹⁴, r=8, p=1)                                  |
| Salt           | 32 bytes random                                           |
| IV             | 16 bytes random                                           |
| Auth tag       | 16 bytes                                                  |
| File format    | JSON: `{ version, algorithm, salt, iv, tag, ciphertext }` |
| File path      | `~/.t2000/wallet.key` (mode `0600`)                       |
| Key format     | Sui bech32 (`suiprivkey...`)                              |


### PIN resolution chain

When the SDK needs to decrypt the wallet, it resolves the PIN in this order:

1. `T2000_PIN` or `T2000_PASSPHRASE` env var
2. `~/.t2000/.session` file (cached after first use)
3. Interactive terminal prompt (CLI only)

`t2000 lock` deletes `.session`, forcing re-entry on next use.

### MCP config paths


| Platform                 | Config file                                                       |
| ------------------------ | ----------------------------------------------------------------- |
| Claude Desktop (macOS)   | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `~/AppData/Roaming/Claude/claude_desktop_config.json`             |
| Cursor                   | `~/.cursor/mcp.json`                                              |
| Windsurf                 | `~/.codeium/windsurf/mcp_config.json`                             |


### Funding the agent

CLI agents are **self-funded**. There is no SUI bootstrap, no USDC onboarding, and no sponsor endpoint — the user funds their own wallet after `t2000 init`.

```
After t2000 init:
  → Buy SUI for gas: https://exchange.mercuryo.io/?widget_id=89960d1a-8db7-49e5-8823-4c5e01c1cea2
  → Mercuryo sells SUI direct-to-wallet (Sui USDC is not supported on the iframe)
  → Optional: swap SUI → USDC via `t2000 swap` once funded
  → Or send USDC from any Sui exchange / wallet to the agent address
```

> **Audric web app exception:** Audric web users (not CLI users) sign in with Google → Enoki zkLogin, and Enoki sponsors all gas. They never need to acquire SUI. New web sign-ups are routed through Mercuryo for the SUI top-up, then prompted to swap to USDC via Cetus (the same path the CLI uses). USDC sponsorship and SUI bootstrap have been removed (S.32 — `audric-simplification-spec.md`).

### What exists after init

```
~/.t2000/
  ├── wallet.key       # AES-256-GCM encrypted Ed25519 keypair
  ├── config.json      # Safeguard limits + daily usage tracking
  └── .session         # Cached PIN (deleted on lock)
```

The agent now has:

- A Sui address (empty — fund it via Mercuryo or a transfer)
- Safeguard limits configured
- MCP server registered in AI clients
- Ready for `t2000 save`, `t2000 pay`, or any MCP tool call once funded

---

## MPP Payment

When a user runs `t2000 pay <url>` or an AI agent calls `t2000_pay`:

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

`gasCostSui` is computed from `effects.gasUsed.computationCost + storageCost − storageRebate`, divided by `1e9`. Every write method (`send`, `save`, `withdraw`, `borrow`, `repay`, `swap`, `claimRewards`, `stakeVSui`, `unstakeVSui`) returns `gasCost` (in SUI) — there is **no `gasMethod` field** anymore.

### Audric web app (Enoki) sponsorship — not in the SDK

Enoki gas sponsorship lives in the Audric web app, **not** in `@t2000/sdk`. The web app:

1. Builds a Transaction via `@t2000/sdk` builder helpers (`buildSaveTx`, etc.)
2. Serializes the TX and sends it to Enoki's sponsorship endpoint
3. Enoki sets `gasOwner = Enoki gas wallet`, signs as sponsor
4. The web app signs with the user's ephemeral zkLogin key (dual-signed)
5. Submits to fullnode

This flow does NOT go through `executeTx`. It's a host-layer concern, documented in `audric/.cursor/rules/audric-transaction-flow.mdc`.

---

## Indexer

Checkpoint-based indexer running on ECS Fargate, polling Sui every 2 seconds.

```
Sui Checkpoints → Indexer → NeonDB
                     │
                     ├── parseTreasuryFees → ProtocolFeeLedger
                     │   (detect USDC inflows to T2000_OVERLAY_FEE_WALLET,
                     │    classify operation from moveCall targets)
                     ├── Parse transfers for known agents → Transaction
                     ├── Update agent.lastSeen
                     └── Yield snapshotter (hourly) → YieldSnapshot
```

### What it tracks


| Data             | Model               | Fields                                                                        |
| ---------------- | ------------------- | ----------------------------------------------------------------------------- |
| On-chain actions | `Transaction`       | agent, action (save/withdraw/borrow/pay), protocol, asset, amount, gas method |
| Protocol fees    | `ProtocolFeeLedger` | agent, operation, feeAmount (raw), feeAsset, feeRate (derived), tx digest    |
| Yield snapshots  | `YieldSnapshot`     | agent, supplied USD, yield earned, APY                                        |
| Agent metadata   | `Agent`             | address, name, last seen                                                      |


### Known-agents filter

The indexer only tracks addresses that have shown up in monitored on-chain activity (a NAVI deposit, a payment-link claim, etc.) — it is no longer fed by a sponsor endpoint. Random Sui addresses are ignored. This means:

- Only opted-in agents are tracked
- No scanning of arbitrary wallets
- Privacy by design

### Action classification

The indexer uses SDK adapter descriptors to classify transactions:

- Move call targets → map to protocol (NAVI)
- Balance changes → infer action type (save, withdraw, etc.) AND detect USDC inflows to the treasury wallet
- Events → secondary signal

---

## Protocol Fees (wallet-direct architecture)

**Fees are an Audric (consumer) concern, not a t2000 (infra) concern.** As of `@t2000/sdk@1.1.0` (2026-04-30), no Move treasury contract is involved — fees flow inline within the consumer's PTB:

```
Audric prepare/route.ts                                       Indexer (every checkpoint)
  │                                                                  │
  ├── splitCoins(paymentCoin, feeRaw)  [1]                            │
  ├── transferObjects([feeCoin], T2000_OVERLAY_FEE_WALLET)  [2]       │
  ├── (continue with NAVI deposit / borrow / Cetus swap)              │
  └── tx submitted via Enoki sponsorship                              │
                                                ↓                     │
                                                │                     │
                                                └── on-chain confirmed → parseTreasuryFees(tx, T2000_OVERLAY_FEE_WALLET):
                                                                              detect USDC → treasury wallet via balanceChanges
                                                                              classify operation from moveCall targets
                                                                              upsert ProtocolFeeLedger row
                                                                                  (agent, operation, feeAmount, feeAsset, feeRate, txDigest)
```

**Properties:**
- **Atomic with the operation.** `splitCoins + transferObjects` are PTB ops; if anything in the PTB reverts, the fee transfer reverts too.
- **No SDK fee logic.** `@t2000/sdk` (and therefore the CLI) is fee-free by design. Audric is the only fee owner; Audric's `prepare/route.ts` ALWAYS adds `addFeeTransfer(tx, coin, FEE_BPS, T2000_OVERLAY_FEE_WALLET, amount)` for save/borrow and ALWAYS passes `overlayFeeReceiver: T2000_OVERLAY_FEE_WALLET` for Cetus swaps. Structural inclusion (can't be forgotten because it IS the code).
- **Wallet IS the live ledger.** `client.getBalance({ owner: treasuryWallet })` is "what's in the treasury right now." Stats API (`apps/web/app/api/stats/route.ts`) uses RPC for live balance.
- **DB is the historical log.** Indexer-fed `ProtocolFeeLedger` is the canonical "total fees ever collected" — survives admin withdrawals from the wallet. Stats API uses Prisma for historical totals + by-operation breakdowns.
- **Single bridge, no HTTP coupling.** The indexer is the only writer to `ProtocolFeeLedger`. No Audric → server fee call.

**Fee rates** (derived from operation type at index time):

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


> The legacy `t2000::treasury` Move package is dormant on-chain (no new traffic routes through it as of B5 v2). Source was removed from the repo on 2026-04-30 — see git history pre-tag `v1.1.0` if needed for future admin ops. AdminCap remains with the treasury admin keypair; admin calls work via the on-chain ABI without needing local source.


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
- Assets: USDC, USDT, USDe, USDsui
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

Tools across three categories:


| Category | Examples                                                               |
| -------- | ---------------------------------------------------------------------- |
| Read     | `t2000_balance`, `t2000_positions`, `t2000_rates`, `t2000_services`    |
| Write    | `t2000_save`, `t2000_send`, `t2000_pay`, `t2000_borrow`, `t2000_repay` |
| Safety   | `t2000_config`, `t2000_lock`                                           |


Prompts for guided workflows: `financial-report`, `optimize-yield`, `morning-briefing`, `weekly-recap`, `emergency`, etc.

All write operations go through a `TxMutex` to prevent concurrent transactions (Sui object version conflicts). Safeguards are checked before every write.

---

## Engine (`@t2000/engine`) — Audric Intelligence implementation

`@t2000/engine` is the moat. It implements **Audric Intelligence** — the 5-system financial agent that sits between the LLM and the SDK and turns "what does the user want?" into a safe, recorded, on-chain action. Audric Intelligence is _not a chatbot_: it understands the user's money (Silent Profile), reasons before acting (Reasoning Engine), orchestrates 34 financial tools in one conversation (Agent Harness), remembers what the user did on-chain (Chain Memory), and remembers what it told the user (AdviceLog).

```
                ┌────────────────────────────────────────────────┐
                │  Audric Intelligence (5 systems, one agent)     │
                │                                                 │
   user prompt ─┼──► Reasoning ──► Harness ──► Profile + Memory + Advice
                │     (think)       (act)         (silent context, every turn)
                │                                                 │
                │                                                 │
                └─► pending_action ──► user taps Confirm ──► sponsored Sui tx
                                                              + TurnMetrics + AdviceLog
```

| System | Owns | Implementation files |
|---|---|---|
| 🎛️ **Agent Harness** | 34 tools, parallel reads, serial writes, permission gates, streaming dispatch | `engine.ts`, `tool.ts`, `orchestration.ts`, `tools/*` |
| ⚡ **Reasoning Engine** | Adaptive thinking, 14 guards, 6 skill recipes, prompt caching, preflight | `classify-effort.ts`, `guards.ts`, `recipes/registry.ts`, `engine.ts` cache_control |
| 🧠 **Silent Profile** | Daily on-chain snapshot + Claude-inferred profile, injected as `<financial_context>` block | audric-side: `UserFinancialProfile`, `UserFinancialContext`, `buildFinancialContextBlock()`, `buildProfileContext()` |
| 🔗 **Chain Memory** | 7 classifiers extract `ChainFact` rows from on-chain history; injected silently | audric-side: classifier crons + `ChainFact` Prisma model + `buildMemoryContext()` |
| 📓 **AdviceLog** | Every recommendation logged (`record_advice` audric-side tool); last 30 days hydrated each turn | audric-side: `AdviceLog` Prisma model + `buildAdviceContext()` |

> _The "five systems" framing is the canonical product narrative. See `CLAUDE.md` (binding rules) and the per-system rules in `.cursor/rules/` (`agent-harness-spec.mdc`, `engine-context-assembly.mdc`, `engine-tool-development.mdc`, `safeguards-defense-in-depth.mdc`)._

The rest of this section is the technical deep-dive: how each system is wired in code, then the two recent harness upgrades — **Spec 1 (Correctness)** and **Spec 2 (Intelligence)**.

### QueryEngine

Stateful async-generator loop that drives conversations:

```
User prompt
    → LLM (Anthropic Claude via streaming provider)
    → Tool dispatch (read/write classification)
    → Permission check (auto / confirm / explicit)
    → Tool execution
    → Results fed back to LLM
    → Repeat until end_turn or max_turns
```

`QueryEngine.submitMessage(prompt)` returns `AsyncGenerator<EngineEvent>` — consumers iterate over events to build their UI (terminal, web, extension).

### Tool System

Tools are built with `buildTool()` which enforces:

- **Zod input validation** with auto-generated JSON schema for the LLM
- **Permission tiers**: `auto` (no approval), `confirm` (user must approve), `explicit` (manual only)
- **Concurrency flags**: `isReadOnly` and `isConcurrencySafe`

`runTools()` dispatches tool calls:

- Read-only tools → `Promise.allSettled` (parallel)
- Write tools → sequential under `TxMutex` (prevents Sui object version conflicts)

### Built-in Financial Tools


| Read (parallel, auto)     | Write (serial, confirm) |
| ------------------------- | ----------------------- |
| `render_canvas`           | `save_deposit`          |
| `balance_check`           | `withdraw`              |
| `savings_info`            | `send_transfer`         |
| `health_check`            | `borrow`                |
| `rates_info`              | `repay_debt`            |
| `transaction_history`     | `claim_rewards`         |
| `swap_quote`              | `pay_api`               |
| `volo_stats`              | `swap_execute`          |
| `mpp_services`            | `volo_stake`            |
| `web_search`              | `volo_unstake`          |
| `explain_tx`              | `save_contact`          |
| `portfolio_analysis`      |                         |
| `protocol_deep_dive`      |                         |
| `token_prices`            |                         |
| `create_payment_link`     |                         |
| `list_payment_links`      |                         |
| `cancel_payment_link`     |                         |
| `create_invoice`          |                         |
| `list_invoices`           |                         |
| `cancel_invoice`          |                         |
| `spending_analytics`      |                         |
| `yield_summary`           |                         |
| `activity_summary`        |                         |


23 read tools, 11 write tools, **34 total**. Read tools implement an MCP-first strategy: if a `McpClientManager` is configured and connected to NAVI MCP, data is fetched via MCP. Otherwise, the SDK is used as fallback. `balance_check`, `portfolio_analysis`, and `token_prices` use the BlockVision Indexer REST API for spot prices and wallet portfolio (Sui-RPC + hardcoded-stable degraded fallback).

> **Removed in the April 2026 simplification (S.7):** `allowance_status`, `toggle_allowance`, `update_daily_limit`, `update_permissions` (allowance contract dormant), `create_schedule`, `list_schedules`, `cancel_schedule` (DCA can't sign without user presence under zkLogin), `pause_pattern`, `pattern_status` (proposal pipeline removed; classifiers stay as silent context). See the S.0–S.12 entries in `audric-build-tracker.md`.
>
> **Removed in v1.4 BlockVision swap (April 2026):** 7 `defillama_*` tools — `defillama_token_prices`, `defillama_price_change`, `defillama_yield_pools`, `defillama_protocol_info`, `defillama_chain_tvl`, `defillama_protocol_fees`, `defillama_sui_protocols`. Replaced by 1 `token_prices` tool (BlockVision-backed). `protocol_deep_dive` retains its DefiLlama dependency as the lone production consumer of `api.llama.fi`. See `AUDRIC_HARNESS_INTELLIGENCE_SPEC_v1.4.1.md`.

### Reasoning Engine (Shipped — always on)

The engine includes a three-layer reasoning system (extended thinking always on for Sonnet/Opus):

1. **Adaptive thinking** (`classify-effort.ts`) — routes queries to `low`/`medium`/`high`/`max` thinking effort. `low` routes to Haiku; `max` reserved for Opus
2. **Guard runner** (`guards.ts`) — 14 guards across 3 priority tiers (Safety > Financial > UX): 12 pre-execution gates (`input_validation`, `retry_protection`, `address_source`, `asset_intent`, `address_scope`, `swap_preview`, `irreversibility`, `balance_validation`, `health_factor`, `large_transfer`, `slippage`, `cost_warning`) + 2 post-execution hints (`artifact_preview`, `stale_data`). First block wins; warnings/hints are injected back into the LLM context.
3. **Skill recipes** (`recipes/registry.ts`) — 6 YAML recipes loaded by `RecipeRegistry` with longest-trigger-match-wins (`swap_and_save`, `safe_borrow`, `send_to_contact`, `portfolio_rebalance`, `account_report`, `emergency_withdraw`), injected as prompt context

Additional features:

- **Prompt caching** — system prompt + tool definitions cached across turns (Anthropic `cache_control`)
- **Context compaction** — `ContextBudget` (200k limit, 85% compact trigger) with LLM summarizer + truncation fallback
- **Tool flags** — `ToolFlags` interface on all tools (mutating, requiresBalance, affectsHealth, irreversible, etc.)
- **Preflight validation** — input validation gate on `send_transfer`, `swap_execute`, `pay_api`, `borrow`, `save_deposit`
- **Streaming tool dispatch** — `EarlyToolDispatcher` fires read-only tools mid-stream before `message_stop`
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
                             assistantContent, turnIndex, modifiableFields?)
    → Client displays confirmation UI (PermissionCard)
    → User may edit any field declared in `modifiableFields`
    → Client executes the transaction on-chain
    → Client calls POST /api/engine/resume with the execution result and any
      `modifications` overlay
    → Engine reconstructs the full turn from the post-modification input
    → Server updates `TurnMetrics(sessionId, turnIndex)` with the resolved
      `pendingActionOutcome` ('approved' | 'declined' | 'modified')
```

This stateless flow is serverless-friendly — no long-lived SSE connections needed for write operations.

`turnIndex` (engine 0.41.0) is derived from the assistant message count when the action is yielded, giving hosts a stable join key from `pending_action` events back to the originating `TurnMetrics` row written at turn close. `modifiableFields` is the engine-side declaration of which `input` keys the user is allowed to edit before approval — sourced from the `TOOL_MODIFIABLE_FIELDS` registry — and the resume route applies the resulting `modifications` to `action.input` so the conversation history reflects what was actually approved on-chain.

### MCP Integration

**MCP Client** (`McpClientManager`): Multi-server registry connecting to external MCP servers (e.g., NAVI Protocol). Supports `streamable-http` and `sse` transports with client-side response caching.

**MCP Server** (`buildMcpTools`, `registerEngineTools`): Exposes engine tools to Claude Desktop, Cursor, and other MCP clients with `audric_` namespace prefix.

**MCP Tool Adapter** (`adaptMcpTool`): Converts tools discovered from external MCP servers into engine `Tool` objects with namespacing and configurable permissions.

### Supporting Modules


| Module                      | Purpose                                                             |
| --------------------------- | ------------------------------------------------------------------- |
| `AnthropicProvider`         | Streaming LLM provider with tool use and usage reporting            |
| `CostTracker`               | Cumulative token usage, USD cost estimation, budget kill switch     |
| `MemorySessionStore`        | In-memory session store with TTL and data isolation                 |
| `compactMessages`           | Three-phase context window compaction (summarize → drop → truncate) |
| `serializeSSE` / `parseSSE` | Wire-safe SSE event format for web transport                        |
| `validateHistory`           | Pre-flight message history validation before every LLM call         |
| `engineToSSE`               | Adapts QueryEngine generator to SSE stream                          |


### NAVI MCP Integration

Dedicated integration layer for NAVI Protocol's MCP server:

- `navi-config.ts` — Server URL, transport config, 26 tool name constants
- `navi-transforms.ts` — Pure functions converting raw MCP responses to typed engine structures (rates, positions, health factor, balance, savings, rewards) with USD price conversion
- `navi-reads.ts` — Composite read functions orchestrating parallel MCP calls with transforms

### Silent Profile (system 3 of 5)

> _Knows your finances. Builds a private financial profile from chat history and a daily on-chain snapshot — refreshed at 02:00 UTC, injected silently at every engine boot._

Silent Profile is two cooperating layers, both lived in `audric/apps/web` (the engine consumes them via the system prompt):

| Layer | Storage | Refresh | Used as |
|---|---|---|---|
| `UserFinancialProfile` (Prisma) | risk tolerance, goals, investment horizon | Claude inference cron in the `daily-intel` group | `buildProfileContext()` → `<user_profile>` block |
| `UserFinancialContext` (Prisma) | savings/wallet/debt USD, health factor, weighted savings APY, open goals, recent activity, last-session days | `/api/internal/financial-context-snapshot` cron @ 02:00 UTC; refreshed on-demand after large writes | `buildFinancialContextBlock()` → `<financial_context>` block |

The `<financial_context>` block lets every chat start oriented — no warm-up tool calls, no "let me check your balance" before the agent says anything useful. The block is silent context, never surfaced as a nudge or notification.

> Implementation contract: `audric/.cursor/rules/engine-context-assembly.mdc`. Schema: `audric/apps/web/prisma/schema.prisma` → `UserFinancialProfile` + `UserFinancialContext`.

### Chain Memory (system 4 of 5)

> _Remembers what you do on-chain. 7 classifiers extract structured facts; injected silently as `<chain_memory>`._

Seven on-chain classifiers run on the `daily-intel` cron group and write `ChainFact` rows that `buildMemoryContext()` hydrates into every engine boot:

| Classifier | Source | Fact |
|---|---|---|
| `deposit_pattern` | `AppEvent` | Recurring savings deposits (cadence + median amount) |
| `risk_profile` | `PortfolioSnapshot` | Leverage behaviour, HF distribution |
| `yield_behavior` | `PortfolioSnapshot` | APY optimisation, farming patterns |
| `borrow_behavior` | `AppEvent` | Borrow / repay pairing |
| `near_liquidation` | `PortfolioSnapshot` | HF < 1.5 events |
| `large_transaction` | `AppEvent` | Outbound transfers > $500 |
| `compounding_streak` | `AppEvent` | Consecutive compound actions |

Chain Memory is **silent context only** — no proposals, no "Audric noticed X" cards, no notifications. The proposal pipeline (`BehavioralPattern` + Copilot suggestions) was deleted in S.5; classifiers stayed.

### AdviceLog (system 5 of 5)

> _Remembers what it told you. Every recommendation is logged; last 30 days hydrated each turn._

`record_advice` is an audric-side tool (not exported from `@t2000/engine`) that writes `AdviceLog` rows whenever Audric makes a recommendation (e.g. "save $50 into NAVI", "wait on the swap, slippage is high"). On the next turn, `buildAdviceContext()` rehydrates the last 30 days of advice into the `<advice_log>` system-prompt block so the chat doesn't contradict itself across sessions.

`AdviceLog.actedOn` is updated when the corresponding write tool succeeds via `EngineConfig.onAutoExecuted` — letting the agent see "I told you to save and you did" vs "I told you to save and you didn't" on the next turn.

> Implementation contract: `audric/apps/web/lib/engine/advice-tool.ts` + `audric/.cursor/rules/engine-context-assembly.mdc`.

### Spec 1 — Correctness (engine v0.41.0–v0.50.3)

Spec 1 closed three correctness holes that made Audric inconsistent under load:

| Bug class | Fix |
|---|---|
| `pending_action` events couldn't be safely correlated to a turn (multiple actions per turn ambiguous) | Stamped a per-yield UUID v4 `attemptId` on every `pending_action`. Hosts persist it on `TurnMetrics(sessionId, turnIndex)` and key the `/api/engine/resume updateMany` on it. |
| Users couldn't edit fields on a confirm card (e.g. amount) without losing the LLM's reasoning | Added `modifiableFields: PendingActionModifiableField[]` to `pending_action`, sourced from the `TOOL_MODIFIABLE_FIELDS` registry. Resume route applies `modifications` so conversation history reflects what was approved on-chain. |
| `auto`-permission tools (write tools that don't require confirm) had no completion hook for AdviceLog / TurnMetrics | Added `EngineConfig.onAutoExecuted({ toolName, input, result, walletAddress, sessionId, turnIndex })` — fires after the engine executes any `auto` tool. |

Together these give hosts a stable join key from `pending_action` → on-chain receipt → `TurnMetrics.pendingActionOutcome` ('approved' / 'declined' / 'modified') and let auto-executed writes participate in the same telemetry as confirm-gated ones.

> Local-only spec: `AUDRIC_HARNESS_CORRECTNESS_SPEC_v1.3.md`. Cross-repo contract: `t2000/.cursor/rules/agent-harness-spec.mdc` + `audric/.cursor/rules/audric-transaction-flow.mdc` + `audric/.cursor/rules/write-tool-pending-action.mdc`.

### Spec 2 — Intelligence (engine v0.47.0–v0.54.1)

Spec 2 swapped the data layer + added boot-time orientation:

| Change | Why |
|---|---|
| **BlockVision swap** — replaced 7 `defillama_*` tools (`token_prices`, `price_change`, `yield_pools`, `protocol_info`, `chain_tvl`, `protocol_fees`, `sui_protocols`) with one `token_prices` tool. `balance_check` and `portfolio_analysis` rewired to BlockVision Indexer REST | DefiLlama was slow + frequently 5xx for Sui-native assets; BlockVision returns wallet portfolio + USD prices in a single round-trip. Net: 29 → 23 read tools, 40 → 34 total. |
| **Sticky-positive cache + retry/circuit breaker** for BlockVision (`fetchBlockVisionWithRetry`, `_resetBlockVisionCircuitBreaker`) | BlockVision started returning 429s under load; the cache no longer overwrites known-good positive values with degraded zeros. |
| **`<financial_context>` block** injected at every engine boot from the daily `UserFinancialContext` snapshot | Every chat starts oriented — no warm-up tool calls before useful answers. Silent Profile system. |
| **`attemptId` keyed resume** — `/api/engine/resume updateMany({ where: { sessionId, attemptId } })` instead of fragile `(sessionId, turnIndex)` | Two pending actions in the same turn no longer overwrite each other's `pendingActionOutcome`. |
| **`protocol_deep_dive` exception** — kept on DefiLlama as the lone production consumer of `api.llama.fi` | Protocol metadata (TVL trends, fees, audits) isn't available on BlockVision; not worth building a custom replacement for one tool. |

> Local-only spec: `AUDRIC_HARNESS_INTELLIGENCE_SPEC_v1.4.1.md`. Resilience contract: `t2000/.cursor/rules/blockvision-resilience.mdc`.

---

## Audric — the five products

The Audric consumer brand groups everything into exactly **five products**. (S.18 reverted S.17's Finance retirement: Intelligence was overloaded as both "the moat" and "the home for every financial verb," and Send/Receive overlapped Pay. Finance now owns save/credit/swap/charts; Pay owns send/receive.)


| Product                    | What it is                                                                                                                                                                | Implementation                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 🪪 **Audric Passport**     | Trust layer — identity (zkLogin via Google), non-custodial wallet on Sui, tap-to-confirm consent, Enoki-sponsored gas (web only)                                          | `@t2000/sdk` + Enoki + `@mysten/sui`                                                  |
| 🧠 **Audric Intelligence** | Brain (the moat) — 5 systems orchestrate every money decision (see breakdown below)                                                                                       | `@t2000/engine`                                                                       |
| 💰 **Audric Finance**      | Manage your money on Sui — Save (NAVI lend), Credit (NAVI borrow), Swap (Cetus aggregator), Charts (yield/health/portfolio viz). Every write taps to confirm via Passport | `@t2000/sdk` NAVI builders + `cetus-swap.ts` + `@t2000/engine` chart canvas templates |
| 💸 **Audric Pay**          | Money primitive — send USDC, receive via payment links / invoices / QR. Free, global, instant on Sui                                                                      | `@t2000/sdk` Sui tx builders + payment-kit                                            |
| 🛒 **Audric Store**        | Creator marketplace at `audric.ai/username`. Coming soon (Phase 5)                                                                                                        | `@t2000/sdk` + Walrus + payment links                                                 |


See `audric-roadmap.md` for the canonical taxonomy + naming rules.

---

## Audric Intelligence — the 5-system moat (product narrative)

> **Not a chatbot. A financial agent.** Five systems work together to understand the user's money, reason about decisions, and get smarter over time. Every action still waits on Passport's tap-to-confirm.
>
> _The technical deep-dive (per-system implementation, Spec 1, Spec 2) lives under [`## Engine (\`@t2000/engine\`)`](#engine-t2000engine--audric-intelligence-implementation) above. This section is the consumer-product / brand framing._
>
> The "autonomous agent" framing of the prior Audric 2.0 spec was retired in the April 2026 simplification. Pattern proposals, the trust ladder, the scheduled-actions executor, and the notification templates were deleted because zkLogin requires user presence to sign — "autonomous" was reminders dressed up as agency. See the S.0–S.12 entries in `audric-build-tracker.md`.

| System | One-line pitch | Implementation |
|---|---|---|
| 🎛️ **Agent Harness** | 34 tools, one agent — the runtime that manages your money in one conversation. | `@t2000/engine` `QueryEngine` + `getDefaultTools()` (23 read + 11 write) |
| ⚡ **Reasoning Engine** | Thinks before it acts — adaptive thinking, 14 guards, 6 skill recipes, prompt caching. | `classify-effort.ts`, `guards.ts`, `recipes/registry.ts`, `engine.ts` cache_control |
| 🧠 **Silent Profile** | Knows your finances — daily on-chain snapshot + chat-inferred profile, injected silently. | `UserFinancialProfile` + `UserFinancialContext` + `buildFinancialContextBlock()` + 02:00 UTC cron |
| 🔗 **Chain Memory** | Remembers what you do on-chain — 7 classifiers, no proposals, silent context. | 7 chain classifiers → `ChainFact` rows → `buildMemoryContext()` |
| 📓 **AdviceLog** | Remembers what it told you — last 30 days hydrated each turn, no two contradictory answers. | `AdviceLog` Prisma model + `record_advice` audric-side tool + `buildAdviceContext()` |

**What stayed (silent context):** chain-memory classifiers, episodic memory extraction, financial-profile inference, portfolio snapshots, and the `AdviceLog` loop. These run on a single `daily-intel` cron group and feed the LLM context invisibly.

### Multi-wallet Linking

Signed-in users can link up to 10 Sui addresses (e.g. a hardware wallet alongside their zkLogin wallet); `FullPortfolioCanvas` aggregates them via `GET /api/analytics/portfolio-multi`. Backed by the `LinkedWallet` Prisma model.

> **Removed in S.22 (April 2026):** the public `/report/[address]` wallet report (and its `PublicReport` cache). The "Audric would do" suggestions there were promoting features deleted in S.0–S.12 (24/7 alerts, recurring transactions, savings-goal automation), and a second standalone product surface contradicted the chat-first thesis. Heuristic portfolio analysis lives inside chat now via `portfolio_overview` + `health_check`.
>
> **Update (S.103, SPEC 17, May 2026):** the broader savings-goal layer is now fully removed — `SavingsGoal` Prisma table, 4 `savings_goal_*` engine tools, the audric `GoalsPanel` settings/dashboard surface, the `openGoals` snapshot field, the heuristic prompt line that nudged "your goal is off-track", and the t2000 MCP `savings-goal` prompt. The "track my savings progress" job-to-be-done is served by `health_check` + `portfolio_overview` + `yield_summary`.

### Intelligence Layer (silent context that survives the simplification)


| Feature           | What it does                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Financial Profile | `UserFinancialProfile` model: risk tolerance, goals, investment horizon. Claude inference cron (daily-intel group)                                                       |
| Episodic Memory   | `UserMemory` model: key facts, preferences, past decisions. Claude extraction cron + Jaccard dedup                                                                       |
| Advice Memory     | `AdviceLog` rows written by `record_advice` (audric tool). `buildAdviceContext()` hydrates last 30 days into every turn so the chat remembers what it told you yesterday |
| Conversation Log  | `ConversationLog` rows written by chat route. Fine-tuning dataset for the future self-hosted model migration                                                             |


> The "Proactive Awareness" / `buildProactivenessInstructions()` layer was deleted in S.5 along with the proposal pipeline. **As of S.31 (2026-04-29) the critical-HF email was also removed** — stablecoin-only collateral (USDC + USDsui) + no leverage trading + zkLogin tap-to-confirm makes the proactive HF email net-negative UX vs surfacing HF prominently in chat. There are now zero proactive surfaces; everything proactive was either a notification (deleted) or a dashboard card (deleted). The chat answers when asked.

---

## Analytics & Privacy

### What IS tracked


| What             | Where                                      | Purpose                                       |
| ---------------- | ------------------------------------------ | --------------------------------------------- |
| Page views       | Vercel Analytics (t2000.ai + mpp.t2000.ai) | Standard web analytics, no wallet data        |
| Agent addresses  | Server DB (agents table)                   | Indexer-discovered agents only                |
| On-chain actions | Indexer → Transaction table                | Dashboard stats (save/withdraw/borrow counts) |
| Protocol fees    | ProtocolFeeLedger                          | Revenue tracking                              |


### What is NOT tracked

- **SDK**: zero telemetry — no phone-home, no analytics
- **CLI**: zero telemetry — purely local
- **Private keys**: never leave the user's machine
- **Public stats API**: only aggregates — no individual addresses or tx digests
- **Non-opted-in addresses**: invisible to the indexer

### Public stats API (`/api/stats`)

Returns only aggregated numbers:

- Total agents, 24h/7d counts (no addresses)
- Transaction counts by action/protocol (no addresses)
- Treasury and gateway balances

---

## Infrastructure


| Component              | Hosting           | Notes                                      |
| ---------------------- | ----------------- | ------------------------------------------ |
| Web App (audric.ai)    | Vercel            | Next.js, zkLogin + Enoki, @t2000/engine    |
| Web (t2000.ai)         | Vercel            | Next.js                                    |
| Gateway (mpp.t2000.ai) | Vercel            | Next.js, payment logging, explorer         |
| Ecosystem (suimpp.dev) | Vercel            | Next.js, server registry, payment explorer |
| Server (api.t2000.ai)  | AWS ECS Fargate   | Hono, long-running                         |
| Indexer                | AWS ECS Fargate   | Checkpoint poller, always-on               |
| Database (web app)     | NeonDB (Postgres) | Users, preferences, contacts               |
| Database (server)      | NeonDB (Postgres) | Agents, transactions, fee ledger           |
| Database (gateway)     | NeonDB (Postgres) | MPP payment logs                           |
| Database (suimpp.dev)  | NeonDB (Postgres) | Servers, payments, endpoints               |
| DNS                    | Cloudflare        | —                                          |
| CI/CD                  | GitHub Actions    | Lint, typecheck, test, publish, deploy     |


### Deployment pipeline

```
Push to main
  │
  ├── CI: lint + typecheck + test (all packages)
  │
  ├── Deploy Server (if apps/server/** changed)
  │   → Docker build → ECR → ECS service update
  │
  ├── Deploy Indexer (if indexer/** changed)
  │   → Docker build → ECR → ECS service update
  │
  └── Web + Gateway auto-deploy via Vercel
```

### Publish pipeline (on tag `v*`)

```
Tag v0.33.2 (t2000 monorepo)
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

---

## Security Model

### Overview


| Layer             | Mechanism                                                              |
| ----------------- | ---------------------------------------------------------------------- |
| **Keys**          | Ed25519 keypair, AES-256-GCM encrypted at rest with scrypt-derived key |
| **Non-custodial** | Private key never leaves `~/.t2000/wallet.key` — server never sees it  |
| **Safeguards**    | Local spending limits, emergency lock, daily budgets                   |
| **On-chain**      | Inline fee transfer (Audric only), atomic Payment Intents, indexed ledger |
| **MPP**           | HMAC-bound challenges (stateless), on-chain USDC verification          |
| **API keys**      | Upstream keys stored as Vercel env vars, never exposed to agents       |


### Key management

- **Algorithm**: Ed25519 (`@mysten/sui/keypairs/ed25519`)
- **Encryption at rest**: AES-256-GCM with scrypt(PIN, salt) → 256-bit key
- **No mnemonic**: Raw keypair only — no seed phrase to leak
- **Import/export**: `t2000 importKey` / `t2000 exportKey` for migration

### Safeguard enforcement

```
Any write operation (send, save, pay, etc.)
  │
  ├── SafeguardEnforcer.assertNotLocked()
  │   └── If locked: reject immediately
  │
  ├── SafeguardEnforcer.check(metadata)
  │   ├── Is this an outbound op? (send / pay only)
  │   ├── Amount ≤ maxPerTx? ($500 default)
  │   └── dailyUsed + amount ≤ maxDailySend? ($1000 default)
  │
  ├── TxMutex.acquire()  ← serializes all writes
  │
  ├── Build + sign + execute TX
  │
  ├── SafeguardEnforcer.recordUsage(amount)  ← outbound ops only
  │
  └── TxMutex.release()
```

**Outbound ops** (guarded by daily limit): `send`, `pay`
**Non-outbound ops** (no daily limit): `save`, `withdraw`, `borrow`, `repay`

The daily budget resets automatically when the date changes.

### Emergency lock

```
t2000 lock
  → sets config.locked = true
  → deletes ~/.t2000/.session (forces PIN re-entry)
  → all operations blocked immediately

t2000 unlock
  → requires valid PIN (env var, or interactive prompt)
  → sets config.locked = false
  → restores .session

MCP: t2000_lock tool
  → AI can lock (emergency protection)
  → AI cannot unlock (requires human with PIN)
```

The MCP server exposes `t2000_lock` but not `t2000_unlock`. An AI agent can freeze the wallet in an emergency but cannot unfreeze it — only a human with the PIN can.

### Gas

There is no t2000 gas station, no hashcash, no bootstrap, and no USDC onboarding endpoint. CLI agents self-fund SUI; Audric web users get gas sponsored by Enoki at the host layer (see `audric/.cursor/rules/audric-transaction-flow.mdc`). The previous gas-station / sponsor / bootstrap surface was removed in S.32 (`audric-simplification-spec.md` PR-B1).

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

### Transaction serialization (TxMutex)

All write operations go through a `TxMutex` that ensures only one transaction executes at a time per agent. This prevents Sui object version conflicts that occur when concurrent transactions try to use the same coin objects.

### What the server knows vs doesn't


| Server knows                                  | Server does NOT know            |
| --------------------------------------------- | ------------------------------- |
| Agent Sui address (public, via indexer)       | Private key                     |
| On-chain transaction digests (public)         | What the TX does (opaque bytes) |
| Protocol fee transfers (from chain)           | CLI usage, local commands       |
| —                                             | Wallet balance (read on demand) |
| —                                             | Which AI client is used         |


