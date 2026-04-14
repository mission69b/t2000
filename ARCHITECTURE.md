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
   │  │  Agent core · Safeguards · Gas manager · Protocol registry       │
   │  │  Adapters: NAVI                                                   │
   │  └────────┬──────────────┬──────────────┬───────────────────────────┘
   │           │              │              │
   ▼           ▼              ▼              ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐
│ Web App     │  │ t2000 Server│  │ MPP Gateway │  │   Sui Blockchain     │
│ (Vercel)    │  │ (ECS)       │  │ (Vercel)    │  │                      │
│             │  │             │  │             │  │  USDC · NAVI ·       │
│ zkLogin     │  │ Sponsor API │  │ 40 services │  │  t2000 Treasury      │
│ Enoki gas   │  │ Gas station │  │ 88 endpoints│  │  @suimpp/mpp         │
│ Agent loop  │  │ Fee ledger  │  │ Explorer    │  │  @suimpp/mpp      │
│ Anthropic   │  │ Indexer     │  │ Spec + Docs │  │  (payment method)    │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────────────────────┘
       │                │                │
       ▼                ▼                ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ NeonDB      │  │  NeonDB     │  │ Upstream    │
│ (web app)   │  │  (server)   │  │ APIs        │
│             │  │             │  │             │
│ Users       │  │ Agents      │  │ OpenAI      │
│ Preferences │  │ Transactions│  │ Anthropic   │
│ Sessions    │  │ Gas ledger  │  │ Brave       │
│             │  │ USDC onboard│  │ + 37 more   │
└─────────────┘  └─────────────┘  └─────────────┘
```

---

## Packages

| Package | npm | What it does |
|---------|-----|-------------|
| `@t2000/sdk` | Published | TypeScript SDK — agent core, adapters, gas manager, safeguards |
| `@t2000/engine` | Published | Agent engine — QueryEngine, financial tools, LLM orchestration, MCP client/server |
| `@t2000/cli` | Published | 29 CLI commands — `t2000 init`, `t2000 save`, `t2000 pay`, etc. |
| `@t2000/mcp` | Published | MCP server — 50 tools (mirrors engine), stdio transport |
| `@suimpp/mpp` | Published | Sui USDC payment method for MPP (client + server verification) |
| `@suimpp/discovery` | Published | Sui-specific discovery validation — OpenAPI checks + 402 probe |
| `mppx` | External (wevm) | MPP protocol middleware — 402 challenge/credential flow |

## Apps

| App | Hosting | Domain | What it does |
|-----|---------|--------|-------------|
| Audric | Vercel | audric.ai | Consumer product — zkLogin, engine chat, conversational banking (separate repo) |
| `apps/web` | Vercel | t2000.ai | Infrastructure landing page + docs |
| `apps/gateway` | Vercel | mpp.t2000.ai | MPP gateway — 40 services, 88 endpoints, explorer, spec, docs |
| `apps/server` | AWS ECS Fargate | api.t2000.ai | Sponsor, gas station, fee ledger |
| Indexer | AWS ECS Fargate | — | Checkpoint indexer, yield snapshotter |

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

| Component | Technology |
|-----------|-----------|
| Framework | Next.js (App Router) |
| Auth | zkLogin via `@mysten/enoki` |
| Gas | Enoki sponsored transactions |
| LLM | Anthropic Claude (for agent queries) |
| Database | NeonDB (Prisma) — users, preferences, contacts |
| Styling | Tailwind CSS + shadcn/ui patterns |
| Analytics | Vercel Analytics |
| State | TanStack Query + custom hooks |

---

## MPP Gateway (`mpp.t2000.ai`)

Payment infrastructure for machine-to-machine commerce. 40 services, 88 endpoints.

### Pages

| Page | URL | What it shows |
|------|-----|-------------|
| Homepage | `/` | Pitch, live payment feed, stats bar |
| Services | `/services` | Full catalog with search, categories, code examples |
| Explorer | `/explorer` | Payment history, volume chart, service breakdown |
| Spec | `/spec` | MPP protocol specification for Sui |
| Docs | `/docs` | Developer guides — "Pay for APIs" + "Accept payments" |

### Payment logging

Every MPP payment is logged to a dedicated NeonDB (separate from banking DB):

| Field | Type | Description |
|-------|------|------------|
| `service` | String | Service name (e.g. "openai") |
| `endpoint` | String | Endpoint path (e.g. "/v1/chat/completions") |
| `amount` | String | USDC amount charged |
| `digest` | String | Sui transaction digest |
| `sender` | String | Sender Sui address |
| `createdAt` | DateTime | Timestamp |

### API routes

| Route | What it returns |
|-------|----------------|
| `GET /api/mpp/payments?limit=N` | Recent payments (live feed) |
| `GET /api/mpp/stats` | Aggregates: total payments, volume, unique services |
| `GET /api/mpp/volume` | 7-day payment volume by day |
| `GET /api/services` | JSON service catalog |
| `GET /llms.txt` | Agent-readable service catalog |

### Service categories

| Category | Count | Examples |
|----------|-------|---------|
| AI & ML | 12 | OpenAI, Anthropic, Gemini, DeepSeek, Groq, Together, Perplexity, Replicate, Stability AI, Mistral, Cohere |
| Media | 3 | fal.ai, ElevenLabs, AssemblyAI |
| Search & Web | 7 | Brave, Firecrawl, Exa, Jina Reader, Serper, SerpAPI, ScreenshotOne |
| Data & Intelligence | 8 | OpenWeather, Google Maps, CoinGecko, Alpha Vantage, NewsAPI, IPinfo, Hunter.io, ExchangeRate |
| Communication | 2 | Resend, Pushover |
| Translation & Docs | 4 | Google Translate, PDFShift, QR Code, Short.io |
| Compute | 1 | Judge0 |
| Commerce | 2 | Lob, Printful |
| Security | 1 | VirusTotal |

---

## suimpp.dev — Ecosystem Hub

Protocol-level registry and explorer for all MPP servers on Sui. Separate from the gateway — this is the open standard site.

| App | Domain | Database | Purpose |
|-----|--------|----------|---------|
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

| Data field | Source | Available in |
|-----------|--------|-------------|
| `digest` | On-chain TX | verify() |
| `sender` | Balance changes | verify() |
| `recipient` | Config | verify() |
| `amount` | Challenge request | verify() |
| `currency` | Config | verify() |
| `network` | Config | verify() |
| `service` | HTTP request URL | chargeProxy() |
| `endpoint` | HTTP request URL | chargeProxy() |
| `serverUrl` | Config | chargeProxy() |

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

| Page | Route | What it shows |
|------|-------|-------------|
| Spec | `/spec` | Sui MPP charge method specification |
| Docs | `/docs` | Developer guide — "Pay for APIs" + "Accept Payments" |
| Explorer | `/explorer` | All payments across all servers — charts, table, filters |
| Servers | `/servers` | Registered servers with stats, sparklines, sort/filter |
| Server Detail | `/servers/{slug}` | Stats, volume chart, endpoints table, recent payments |
| Register | `/register` | URL input → live validation → preview → register |

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
  │   └─ POST /api/sponsor → receive 0.05 SUI for gas (CLI only)
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

| Parameter | Value |
|-----------|-------|
| Algorithm | AES-256-GCM |
| Key derivation | scrypt (N=2¹⁴, r=8, p=1) |
| Salt | 32 bytes random |
| IV | 16 bytes random |
| Auth tag | 16 bytes |
| File format | JSON: `{ version, algorithm, salt, iv, tag, ciphertext }` |
| File path | `~/.t2000/wallet.key` (mode `0600`) |
| Key format | Sui bech32 (`suiprivkey...`) |

### PIN resolution chain

When the SDK needs to decrypt the wallet, it resolves the PIN in this order:

1. `T2000_PIN` or `T2000_PASSPHRASE` env var
2. `~/.t2000/.session` file (cached after first use)
3. Interactive terminal prompt (CLI only)

`t2000 lock` deletes `.session`, forcing re-entry on next use.

### MCP config paths

| Platform | Config file |
|----------|------------|
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `~/AppData/Roaming/Claude/claude_desktop_config.json` |
| Cursor | `~/.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |

### Bootstrap sponsorship (SUI gas — CLI only)

CLI agents need SUI for gas (they self-fund transactions). Web app users do NOT receive SUI — Enoki sponsors all gas on the web.

- `POST https://api.t2000.ai/api/sponsor` with `{ address, name? }`
- Server splits 0.05 SUI from sponsor wallet → transfers to new agent
- Records in `SponsorRequest` + `GasLedger` (txType: `bootstrap`)
- Upserts agent in DB (makes address "known" to the indexer)
- One-time per address, 10 per IP per hour, 100/day global cap, hashcash above limit

### USDC onboarding (web only)

One-time $0.25 USDC to new web sign-ups. Removes the #1 friction point — users sign up with $0 balance and can immediately try save or pay. CLI users fund their own wallets.

- `POST https://api.t2000.ai/api/sponsor/usdc` with `{ address }` + `x-internal-key` header (required)
- Server fetches USDC coins from sponsor wallet, splits $0.25, transfers to user
- Records in `UsdcSponsorLog` (address is `@unique` — one-time per address)
- Tracks IP address for forensics and per-IP rate limiting
- Upserts agent in DB

**Who gets what:**

| Client | SUI bootstrap | USDC onboarding | Gas method |
|--------|--------------|-----------------|------------|
| Web app (zkLogin) | No — Enoki sponsors gas | $0.25 USDC | Enoki sponsored |
| CLI (`t2000 init`) | 0.05 SUI | None — fund manually | Self-funded → auto-topup → gas station |

**Protections:**

| Layer | Rule |
|-------|------|
| Authentication | `x-internal-key` header required on ALL requests — no unauthenticated access |
| Kill switch | `USDC_SPONSOR_PAUSED` env var → instant 503 |
| Per-address | One-time only (DB unique constraint) |
| Per-IP | 3 sponsorships per IP per hour (rightmost x-forwarded-for, not spoofable) |
| Daily global | 20/day hard cap ($5 max daily exposure) |
| Race condition | In-memory lock prevents concurrent double-spend for same address |

**Flow (web app):**
```
User signs in with Google → zkLogin → wallet derived
  → useUsdcSponsor hook fires (localStorage check)
  → POST /api/sponsor/usdc (Next.js server route)
    → adds x-internal-key + forwards caller IP, proxies to api.t2000.ai
  → Server validates internal key, sends $0.25 USDC from sponsor wallet
  → Hook marks address in localStorage
  → Dashboard shows $0.25 USDC balance
```

**Wallet separation:** The sponsor wallet (sends USDC/SUI to new users) and the MPP gateway treasury (receives payment revenue) are separate addresses. A drain on sponsorship cannot touch revenue.

### What exists after init

```
~/.t2000/
  ├── wallet.key       # AES-256-GCM encrypted Ed25519 keypair
  ├── config.json      # Safeguard limits + daily usage tracking
  └── .session         # Cached PIN (deleted on lock)
```

The agent now has:
- A Sui address with 0.05 SUI for gas (sponsored)
- Safeguard limits configured
- MCP server registered in AI clients
- Ready for `t2000 save`, `t2000 pay`, or any MCP tool call

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
- Gas: handled by SDK's gas manager (self-funded or sponsored)
- Finality: ~400ms

---

## Gas System

Every Sui transaction needs SUI for gas. The SDK handles this automatically with a three-tier resolution chain:

```
SDK: executeWithGas(buildTx)
  │
  ├─ 1. Self-funded (agent has ≥ 0.05 SUI)
  │     → sign and execute with agent's keypair
  │
  ├─ 2. Auto-topup (USDC→SUI)
  │     → disabled — no DEX swap path in product; tier is skipped
  │
  └─ 3. Gas station (fallback)
        → POST /api/gas with serialized TX
        → server sets gasOwner = gas wallet, signs
        → agent signs TX bytes
        → execute with dual signatures
        → report gas usage
```

1. SDK builds a Transaction (gasless) and serializes it
2. Sends to your gas station server (POST /api/gas)
3. Server adds gas objects, dry-runs, signs as sponsor
4. Returns txBytes + sponsorSignature to SDK
5. SDK signs with user's ephemeral key (dual-signed)
6. Submits to fullnode

### Gas constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `AUTO_TOPUP_THRESHOLD` | 0.05 SUI | Minimum to attempt self-funded TX |
| `GAS_RESERVE_TARGET` | 0.15 SUI | Proactive top-up target |
| `AUTO_TOPUP_AMOUNT` | $1 USDC | Reserved for future USDC→SUI top-up (unused while auto-topup disabled) |
| `AUTO_TOPUP_MIN_USDC` | $2 USDC | Threshold checked for maintenance hooks (auto-topup still disabled) |
| `GAS_RESERVE_MIN` | 0.05 SUI | Minimum SUI left after balance-changing ops |

### New agent bootstrap

On `t2000 init`, the sponsor endpoint sends 0.05 SUI to the new agent address. After that, the agent self-funds gas or auto-tops up.

### Gas station protections

| Protection | Rule |
|-----------|------|
| Circuit breaker | Pauses if SUI price moves >20% in 1 hour |
| Fee ceiling | Rejects sponsored tx if estimated gas > $0.05 |
| Pool minimum | Gas wallet must keep ≥ 100 SUI |
| Rate limit | 20 sponsored txs per address per hour |
| Hashcash | Proof-of-work challenge when rate limited |
| Serialized signing | `enqueueSign()` prevents concurrent signing on gas keypair |

### Proactive maintenance

After every successful TX, the SDK checks if SUI dropped below the reserve target and USDC is sufficient. Auto-topup execution is currently a no-op (no swap path), so agents rely on self-funded SUI or the gas station; constants remain for a future USDC→SUI top-up if reintroduced.

---

## Indexer

Checkpoint-based indexer running on ECS Fargate, polling Sui every 2 seconds.

```
Sui Checkpoints → Indexer → NeonDB
                     │
                     ├── Parse FeeCollected events → ProtocolFeeLedger
                     ├── Parse transfers for known agents → Transaction
                     ├── Update agent.lastSeen
                     └── Yield snapshotter (hourly) → YieldSnapshot
```

### What it tracks

| Data | Model | Fields |
|------|-------|--------|
| On-chain actions | `Transaction` | agent, action (save/withdraw/borrow/pay), protocol, asset, amount, gas method |
| Protocol fees | `ProtocolFeeLedger` | agent, operation, fee amount, tx digest |
| Yield snapshots | `YieldSnapshot` | agent, supplied USD, yield earned, APY |
| Agent metadata | `Agent` | address, name, last seen |

### Known-agents filter

The indexer only tracks addresses that went through `t2000 init` (bootstrap sponsorship). Random Sui addresses are ignored. This means:
- Only opted-in agents are tracked
- No scanning of arbitrary wallets
- Privacy by design

### Action classification

The indexer uses SDK adapter descriptors to classify transactions:
- Move call targets → map to protocol (NAVI)
- Balance changes → infer action type (save, withdraw, etc.)
- Events → fee collection

---

## Protocol Fees

On-chain fee collection via Move contracts:

```
User TX (save, borrow, etc.)
  │
  ├── Main operation (e.g. supply to NAVI)
  │
  └── treasury::collect_fee(coin, fee_bps)
      → splits fee from operation coin
      → transfers to t2000 Treasury (0x3bb501b8...)
```

- Fees are set in BPS via the on-chain `Config` object (AdminCap required to change)
- SDK adds `collect_fee` to the PTB automatically
- Server's `/api/fees` endpoint records fees in Postgres for analytics
- Fee events are also picked up by the indexer via `FeeCollected` events

---

## Move Contracts (Sui mainnet)

| Contract | Purpose |
|----------|---------|
| `t2000.move` | Config (fee BPS, paused flag), AdminCap |
| `treasury.move` | `collect_fee()`, withdraw collected fees |
| `admin.move` | Admin operations (update config, pause) |

### Key on-chain objects

| Object | ID | Purpose |
|--------|-----|---------|
| Package | `0xab92e9f1...` | t2000 Move package |
| Config | `0x408add9a...` | Fee rates, pause flag |
| Treasury | `0x3bb501b8...` | Collected protocol fees |

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

| Guard | What it does |
|-------|-------------|
| Emergency lock | `agent.lock()` — blocks all outbound operations instantly |
| Per-TX limit | Max dollar amount per transaction (0 = unlimited) |
| Daily send limit | Max daily outbound (send + pay) |

- Config stored locally in `config.json` alongside the private key
- MCP server refuses to start until safeguard limits are configured
- Only outbound ops are guarded (send, pay) — save/withdraw/borrow are not
- `unlock()` requires human confirmation (not callable by AI)

---

## MCP Server

Tools across three categories:

| Category | Examples |
|----------|---------|
| Read | `t2000_balance`, `t2000_positions`, `t2000_rates`, `t2000_services` |
| Write | `t2000_save`, `t2000_send`, `t2000_pay`, `t2000_borrow`, `t2000_repay` |
| Safety | `t2000_config`, `t2000_lock` |

Prompts for guided workflows: `financial-report`, `optimize-yield`, `morning-briefing`, `weekly-recap`, `emergency`, etc.

All write operations go through a `TxMutex` to prevent concurrent transactions (Sui object version conflicts). Safeguards are checked before every write.

---

## Engine (`@t2000/engine`)

The engine package powers **Audric**, the conversational finance agent. It sits between the LLM and the SDK, orchestrating multi-turn conversations with financial tool execution.

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

| Read (parallel, auto) | Write (serial, confirm) |
|-----------------------|------------------------|
| `render_canvas` | `save_deposit` |
| `balance_check` | `withdraw` |
| `savings_info` | `send_transfer` |
| `health_check` | `borrow` |
| `rates_info` | `repay_debt` |
| `transaction_history` | `claim_rewards` |
| `swap_quote` | `pay_api` |
| `volo_stats` | `swap_execute` |
| `mpp_services` | `volo_stake` |
| `web_search` | `volo_unstake` |
| `explain_tx` | `save_contact` |
| `portfolio_analysis` | |
| `protocol_deep_dive` | |
| `defillama_yield_pools` | |
| `defillama_protocol_info` | |
| `defillama_token_prices` | |
| `defillama_price_change` | |
| `defillama_chain_tvl` | |
| `defillama_protocol_fees` | |
| `defillama_sui_protocols` | |
| `allowance_status` | |
| `toggle_allowance` | |
| `update_daily_limit` | |
| `update_permissions` | |
| `create_payment_link` | |
| `list_payment_links` | |
| `cancel_payment_link` | |
| `create_invoice` | |
| `list_invoices` | |
| `cancel_invoice` | |
| `spending_analytics` | |
| `yield_summary` | |
| `activity_summary` | |
| `create_schedule` | |
| `list_schedules` | |
| `cancel_schedule` | |

38 read tools, 12 write tools, **50 total**. Read tools implement an MCP-first strategy: if a `McpClientManager` is configured and connected to NAVI MCP, data is fetched via MCP. Otherwise, the SDK is used as fallback.

### Reasoning Engine (Shipped — always on)

The engine includes a three-layer reasoning system (extended thinking always on for Sonnet/Opus):

1. **Adaptive thinking** (`classify-effort.ts`) — routes queries to `low`/`medium`/`high`/`max` thinking effort. `low` routes to Haiku; `max` reserved for Opus
2. **Guard runner** (`guards.ts`) — 9 guards across 3 priority tiers (Safety > Financial > UX) enforce balance checks, health factor limits, slippage, irreversibility warnings, etc.
3. **Skill recipes** (`recipes/registry.ts`) — YAML recipe files loaded by `RecipeRegistry` with longest-trigger-match-wins, injected as prompt context

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

### Scheduled Actions (DCA)

Server-side scheduled actions with a trust ladder:
- `create_schedule` / `list_schedules` / `cancel_schedule` tools (read-only, execute server-side)
- First 5 executions require user confirmation (trust ladder), then autonomous
- Supports: save, swap, repay on cron schedules

### Token Registry

All token metadata is centralized in `packages/sdk/src/token-registry.ts`:

- `COIN_REGISTRY` — 17 tokens with type, decimals, symbol (Tier 1: USDC, Tier 2: 13 swap assets, Legacy: 3)
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
Engine yields pending_action(toolName, toolUseId, input, description, assistantContent)
    → Client displays confirmation UI
    → Client executes the transaction on-chain
    → Client calls POST /api/engine/resume with the execution result
    → Engine reconstructs the full turn and continues the conversation
```

This stateless flow is serverless-friendly — no long-lived SSE connections needed for write operations.

### MCP Integration

**MCP Client** (`McpClientManager`): Multi-server registry connecting to external MCP servers (e.g., NAVI Protocol). Supports `streamable-http` and `sse` transports with client-side response caching.

**MCP Server** (`buildMcpTools`, `registerEngineTools`): Exposes engine tools to Claude Desktop, Cursor, and other MCP clients with `audric_` namespace prefix.

**MCP Tool Adapter** (`adaptMcpTool`): Converts tools discovered from external MCP servers into engine `Tool` objects with namespacing and configurable permissions.

### Supporting Modules

| Module | Purpose |
|--------|---------|
| `AnthropicProvider` | Streaming LLM provider with tool use and usage reporting |
| `CostTracker` | Cumulative token usage, USD cost estimation, budget kill switch |
| `MemorySessionStore` | In-memory session store with TTL and data isolation |
| `compactMessages` | Three-phase context window compaction (summarize → drop → truncate) |
| `serializeSSE` / `parseSSE` | Wire-safe SSE event format for web transport |
| `validateHistory` | Pre-flight message history validation before every LLM call |
| `engineToSSE` | Adapts QueryEngine generator to SSE stream |

### NAVI MCP Integration

Dedicated integration layer for NAVI Protocol's MCP server:

- `navi-config.ts` — Server URL, transport config, 26 tool name constants
- `navi-transforms.ts` — Pure functions converting raw MCP responses to typed engine structures (rates, positions, health factor, balance, savings, rewards) with USD price conversion
- `navi-reads.ts` — Composite read functions orchestrating parallel MCP calls with transforms

---

## Audric 2.0 — Autonomous Financial Agent

### Autonomous Action Loop

```
Nightly cron (t2000 server)
  │
  ├── Pattern Detection
  │   → 5 detectors: recurring_save, yield_reinvestment, debt_discipline,
  │     idle_usdc_tolerance, swap_pattern
  │   → Analyze 90-day AppEvent + PortfolioSnapshot history
  │   → Create Stage 0 proposals (ScheduledAction with source='pattern')
  │
  ├── Trust Ladder
  │   → Stage 0: Proposal created → user reviews in Settings > Automations
  │   → Stage 1: (reserved)
  │   → Stage 2: User accepts → runs with notification
  │   → Stage 3: Auto-promoted after N successful runs → fully autonomous
  │
  ├── Execution (runScheduledActions cron)
  │   → Idempotency key (daily/weekly/monthly)
  │   → Safety checks: balance, health factor, daily limit, borrow ban
  │   → Circuit breaker: 3 consecutive failures → auto-pause + email
  │   → Execute via t2000 server internal API
  │   → Log to ScheduledExecution for audit
  │
  └── Notifications (Resend email)
      → 3 templates: stage2_execution, stage3_unexpected, circuit_breaker
      → Deep link CTAs back to Audric
```

### Chain Memory

7 classifiers extract financial patterns from on-chain data:

| Classifier | Source | Detects |
|-----------|--------|---------|
| `deposit_pattern` | AppEvent | Regular savings deposits |
| `risk_profile` | PortfolioSnapshot | Leverage behavior, HF patterns |
| `yield_behavior` | PortfolioSnapshot | APY optimization, farming |
| `borrow_behavior` | AppEvent | Borrow/repay patterns |
| `near_liquidation` | PortfolioSnapshot | HF < 1.5 events |
| `large_transaction` | AppEvent | Amounts > $500 |
| `compounding_streak` | AppEvent | Consecutive compound actions |

Chain facts stored as `UserMemory` with `source: 'chain'` and injected into engine context via `buildMemoryContext()`.

### Public Wallet Intelligence Report

Public acquisition funnel at `audric.ai/report/[address]` — no sign-up required.

- **Generator** (`lib/report/generator.ts`): parallel fetch of wallet balances, NAVI positions, and activity via unified data layer
- **Analyzers** (`lib/report/analyzers.ts`): 5 pattern detectors, 3 risk signals, 4 "Audric would do" suggestions — all heuristic, no LLM
- **API** (`GET /api/report/[address]`): rate limited (5/hr/IP via Upstash), 24h Prisma cache, internal secret bypass for OG images
- **UI**: 8 sections (portfolio, yield efficiency gauge, activity, patterns, risk signals, suggestions, share, footer)
- **Sharing**: copy link, Twitter, Telegram, image download (html2canvas), QR code
- **OG image**: dynamic 1200×630 edge-rendered image with net worth, yield efficiency, suggestions count
- **Multi-wallet**: link up to 10 wallets, aggregated portfolio view, tab switcher in FullPortfolioCanvas

### Intelligence Layer (F1–F5)

| Feature | What it does |
|---------|-------------|
| F1 — Financial Profile | `UserFinancialProfile` model: risk tolerance, goals, investment horizon. Claude inference cron |
| F2 — Proactive Awareness | `buildProactivenessInstructions()` injected each turn. Idle USDC, HF warnings, follow-ups |
| F3 — Episodic Memory | `UserMemory` model: key facts, preferences, past decisions. Claude extraction cron + Jaccard dedup |
| F4 — Conversation State | 6 states (idle, exploring, confirming, executing, post_error, awaiting_confirmation). Redis-backed |
| F5 — Self-Evaluation | 4-point checklist injected post-action for outcome tracking |

---

## Analytics & Privacy

### What IS tracked

| What | Where | Purpose |
|------|-------|---------|
| Page views | Vercel Analytics (t2000.ai + mpp.t2000.ai) | Standard web analytics, no wallet data |
| Agent addresses | Server DB (agents table) | Only agents that used `t2000 init` |
| On-chain actions | Indexer → Transaction table | Dashboard stats (save/withdraw/borrow counts) |
| Gas usage | GasLedger | Accounting for sponsorship costs |
| Protocol fees | ProtocolFeeLedger | Revenue tracking |

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
- Gas station spend totals
- Treasury and gateway balances

---

## Infrastructure

| Component | Hosting | Notes |
|-----------|---------|-------|
| Web App (audric.ai) | Vercel | Next.js, zkLogin + Enoki, @t2000/engine |
| Web (t2000.ai) | Vercel | Next.js |
| Gateway (mpp.t2000.ai) | Vercel | Next.js, payment logging, explorer |
| Ecosystem (suimpp.dev) | Vercel | Next.js, server registry, payment explorer |
| Server (api.t2000.ai) | AWS ECS Fargate | Hono, long-running |
| Indexer | AWS ECS Fargate | Checkpoint poller, always-on |
| Database (web app) | NeonDB (Postgres) | Users, preferences, contacts |
| Database (server) | NeonDB (Postgres) | Agents, transactions, gas ledger |
| Database (gateway) | NeonDB (Postgres) | MPP payment logs |
| Database (suimpp.dev) | NeonDB (Postgres) | Servers, payments, endpoints |
| DNS | Cloudflare | — |
| CI/CD | GitHub Actions | Lint, typecheck, test, publish, deploy |

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

| Layer | Mechanism |
|-------|----------|
| **Keys** | Ed25519 keypair, AES-256-GCM encrypted at rest with scrypt-derived key |
| **Non-custodial** | Private key never leaves `~/.t2000/wallet.key` — server never sees it |
| **Gas station** | Rate limits, circuit breaker, hashcash, fee ceiling, tx simulation |
| **Safeguards** | Local spending limits, emergency lock, daily budgets |
| **On-chain** | Move-level fee collection, AdminCap-gated config, pause flag |
| **MPP** | HMAC-bound challenges (stateless), on-chain USDC verification |
| **API keys** | Upstream keys stored as Vercel env vars, never exposed to agents |

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

### Gas station security

| Protection | How it works |
|-----------|-------------|
| **Rate limiting** | 20 gas requests per address per hour |
| **Hashcash proof-of-work** | When rate limited, client must solve 20-bit PoW (~1–2s) |
| **TX simulation** | `dryRunTransactionBlock` before signing — rejects if gas estimate > $0.05 |
| **Circuit breaker** | Polls an on-chain USDC/SUI reference price every 30s, trips if >20% price swing in 1 hour |
| **Pool minimum** | Rejects sponsorship when gas wallet < 100 SUI |
| **Serialized signing** | `enqueueSign()` queues gas wallet signing to prevent nonce conflicts |
| **SUI bootstrap limit** | One-time per address, 10/IP/hr, 100/day global, hashcash above limit |
| **USDC onboarding** | Web only, `x-internal-key` required, $0.25/address (ever), 3/IP/hr, 20/day cap |
| **Sponsor kill switch** | `USDC_SPONSOR_PAUSED` env var stops all USDC sponsorship instantly |

### Hashcash flow

```
Client                                  Server
  │                                       │
  │── POST /api/gas ─────────────────────>│
  │                                       │── Rate check: over limit
  │<── 200 { error: 'RATE_LIMITED',  ─────│
  │         challenge: 'abc...' }         │
  │                                       │
  │── Compute SHA-256 until 20 leading ─  │
  │   zero bits found (~1M hashes)        │
  │                                       │
  │── POST /api/gas { proof: '...' } ────>│
  │                                       │── Verify PoW, check stamp reuse
  │<── 200 { signedTx: '...' } ──────────│
```

Stamps are tracked in memory with 24h TTL to prevent reuse.

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

| Server knows | Server does NOT know |
|-------------|---------------------|
| Agent Sui address (public) | Private key |
| Gas usage amounts | Wallet balance |
| Sponsored TX digests | What the TX does (opaque bytes) |
| Bootstrap requests (IP, address) | CLI usage, local commands |
| USDC onboarding log (address, amount, digest) | — |
| Protocol fee events (from chain) | Which AI client is used |
