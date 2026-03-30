# MPP Ecosystem Roadmap

---

## Three Domains

```
mpp.t2000.ai          →  t2000's gateway (40 services, 88 endpoints)
mppsui.dev             →  Sui MPP standard (spec, docs, server registry, explorer)
app.t2000.ai           →  Consumer product (web app, banking, AI chat)
```

| Domain | What | Audience | Status |
|--------|------|----------|--------|
| `mpp.t2000.ai` | t2000 MPP gateway — 40 services, explorer, live feed | AI agents, developers | Live |
| `mppsui.dev` | Sui MPP ecosystem — spec, docs, server registry, protocol explorer | Builders, providers, Mysten | Planned |
| `app.t2000.ai` | Consumer web app — zkLogin, conversational banking | Anyone with Google | Beta |

**Key shift:** `mppsui.dev` is the ecosystem hub. `mpp.t2000.ai` is ONE server registered on it — same way StableEnrich or Modal are servers on MPPscan.

---

## 1. USDC Sponsorship (Onramp)

### Problem

Users sign up in 3 seconds but have $0 USDC. They need to transfer from an exchange or another wallet. This is the #1 friction point.

### Solution: Sponsor USDC on wallet creation

| Trigger | Amount | Source |
|---------|--------|--------|
| Web app: Google Sign-In (first time) | $1 USDC | Treasury wallet |
| CLI: `t2000 init` (first time) | $1 USDC | Treasury wallet |

### Architecture

Both CLI and web app call the same ECS server endpoint (`api.t2000.ai`). The server uses the **sponsor wallet** (`0x7032...`) which it already controls for gas bootstrapping and MPP revenue. Neither client touches the sponsor wallet directly.

> **Note:** The treasury (`0x3bb5...`) is an on-chain Move object, not a keypair wallet — can't be used for server-side transfers. The sponsor wallet is a regular keypair the server holds.

```
CLI (t2000 init)                    Web App (Google Sign-In)
       │                                    │
       │ POST /api/sponsor/usdc             │ POST /api/sponsor/usdc (via Next.js proxy)
       │ { address, source: "cli" }         │ { address, source: "web" }
       │ (hashcash proof if rate-limited)    │ x-internal-key: <SPONSOR_INTERNAL_KEY>
       └──────────────┬────────────────────┘
                      │
              api.t2000.ai (ECS)
                      │
         1. Verify request (hashcash or x-internal-key)
         2. Check usdc_sponsor_log (one-time per address)
         3. Fetch USDC coins from sponsor wallet
         4. Build split + transfer TX (sponsor wallet → user)
         5. Sign with sponsor keypair, submit to Sui
         6. Log to usdc_sponsor_log { address, amount, source, digest }
```

### Auth per client

| Client | Auth method | Why |
|--------|-------------|-----|
| CLI | Global rate limit (20/hr) + hashcash proof-of-work when over limit | Same pattern as SUI gas sponsor — PoW makes scripted drain expensive |
| Web app | `x-internal-key` header (server-side proxy, secret never in browser) | zkLogin already authenticated the user; Next.js API route proves the request came from the app |

### Flow — Web App

```
User clicks "Sign in with Google"
  → zkLogin → wallet derived
  → useUsdcSponsor hook fires (checks localStorage for prior sponsorship)
  → Not yet sponsored → POST /api/sponsor/usdc (Next.js server-side route)
    → Next.js route adds x-internal-key header (from env, never in browser)
    → Proxies to api.t2000.ai/api/sponsor/usdc { address, source: "web" }
    → Server verifies x-internal-key
    → Server checks: address not in usdc_sponsor_log
    → Server sends 1 USDC from sponsor wallet to address
    → Logs to usdc_sponsor_log
  → Hook marks address as sponsored in localStorage
  → User lands on dashboard with $1 USDC balance
```

### Flow — CLI

```
t2000 init
  → Generate keypair, encrypt with PIN
  → POST /api/sponsor (existing) → receive 0.05 SUI gas bootstrap
  → POST /api/sponsor/usdc { address, source: "cli" }
    → Server checks global rate limit (20/hr)
    → If over limit → returns hashcash challenge → CLI solves + retries
    → Server checks usdc_sponsor_log (one-time per address)
    → Sends 1 USDC from sponsor wallet
  → User has $1 USDC + 0.05 SUI
```

### Funding

The sponsor wallet (`0x7032...`) already has 701 SUI for gas — no top-up needed. For USDC: transfer $100 USDC into the sponsor wallet (separate from existing MPP revenue). This covers 100 new user sponsorships.

| What | Source | Amount |
|------|--------|--------|
| Gas for transfers | Sponsor wallet SUI balance (701 SUI) | Already funded |
| USDC for sponsorship | Manual transfer to sponsor wallet | $100 USDC (covers 100 users) |
| Future top-ups | MPP revenue or manual | As needed |

### Abuse Prevention

| Protection | Detail |
|------------|--------|
| One-time per address | `sponsor_log` table — address is unique. Duplicate requests return 409 (not 500) |
| Auth per client | CLI: hashcash proof-of-work (makes scripted drain expensive). Web app: `x-internal-key` (proves request came from app) |
| Rate limit | Max 20 sponsorships per hour from treasury |
| Google account uniqueness | zkLogin derives address from Google `sub` — one Google = one address |
| Fund monitoring | Alert if treasury USDC drops below threshold (currently $2.12 USDC in treasury) |
| Treasury dry graceful degradation | If treasury balance < 1 USDC: show "Sponsorship temporarily unavailable — deposit USDC manually to get started". User can still sign up, just without the free USDC |

### Stats Integration

USDC sponsorship stats will appear in the existing `/api/stats` endpoint alongside current tracking:

```
"sponsor": {
  "usdc": { "total": 42, "last24h": 3, "last7d": 15, "totalUsdc": 42.0 },
  "gas":  { "bootstrap": 92, ... }   // existing gas bootstrap stats
}
```

This builds on the existing `agents.total` (62), `gas.byType.bootstrap` (92) tracking already live.

### Future funding

- **Now:** $100 USDC manual transfer to sponsor wallet
- **Next:** Mysten subsidy / ecosystem grant (discussed in meeting)
- **Later:** Apple Pay / Android Pay for top-ups (replaces sponsorship for returning users)

### Future: Referral System

Deferred until there's real user growth to amplify. When needed: referral link → new user gets bonus USDC, referrer gets reward. Keep simple — don't over-engineer until there's volume.

### Database

```prisma
model UsdcSponsorLog {
  id           Int      @id @default(autoincrement())
  agentAddress String   @unique @map("agent_address")
  amount       String
  txDigest     String   @map("tx_digest")
  source       String   @default("web")  // "web" or "cli"
  createdAt    DateTime @default(now()) @map("created_at")
  @@map("usdc_sponsor_log")
}
```

---

## 2. mppsui.dev — Sui MPP Ecosystem Hub

### What it is

The canonical home for machine payments on Sui. Protocol spec, developer docs, server registry, and protocol-level explorer.

**Positioning:** "mppsui.dev" is to Sui MPP what "ethereum.org" is to Ethereum — the ecosystem site, not a product.

### Site Structure

| Page | Route | What |
|------|-------|------|
| Home | `/` | Hero, live protocol stats, "what is MPP on Sui" |
| Spec | `/spec` | Sui USDC charge method specification |
| Docs | `/docs` | Developer guide — pay for APIs / accept payments |
| Servers | `/servers` | Registry of all MPP servers on Sui |
| Explorer | `/explorer` | Protocol-level payment explorer (all servers, not just t2000) |
| Register | `/register` | Add your server flow |

### Server Registry (inspired by MPPscan)

Any MPP server on Sui can register. Discovery follows the OpenAPI spec pattern from MPPscan:

**Registration flow:**
1. Provider enters their server base URL
2. System fetches `{url}/openapi.json`
3. Validates: `x-payment-info`, `x-discovery`, 402 response behavior
4. Verifies ownership via `x-discovery.ownershipProofs` (server must include a proof token that mppsui.dev can verify — prevents registering someone else's server)
5. If valid → listed on `/servers` with auto-tracked stats
6. Provider receives an API key for managing their listing (update, remove, re-validate)

**Server management (post-registration):**
- Re-validate button on server detail page — re-fetches OpenAPI doc, updates endpoints and pricing
- Remove server button (requires original API key issued at registration)
- Daily cron re-fetches `/openapi.json` for all active servers
- If a server fails 3 consecutive daily checks → status set to `inactive`, hidden from default listing

**Spam prevention:**
- Rate limit: max 5 registrations per IP per hour
- Servers must pass all validation checks before listing (no "pending" listings visible)

**OpenAPI discovery requirements:**
```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "My API",
    "version": "1.0.0",
    "x-guidance": "High-level usage description for agents"
  },
  "paths": {
    "/api/endpoint": {
      "post": {
        "x-payment-info": {
          "protocols": ["mpp"],
          "pricingMode": "fixed",
          "price": "0.01"
        },
        "responses": {
          "402": { "description": "Payment Required" }
        }
      }
    }
  }
}
```

**Validation:** Phase 2 uses `@agentcash/discovery` for MPPscan registration. Phase 3a publishes `@mppsui/discovery` with Sui-specific checks (address format, USDC coin type, network).

**Server card on `/servers`:**

| Field | Source |
|-------|--------|
| Name | `info.title` from OpenAPI |
| Description | `info.description` from OpenAPI |
| Endpoints | Count of payable operations |
| Pricing | Range from `x-payment-info` |
| Transactions | Tracked from on-chain data |
| Volume | Sum of USDC payments |
| Last active | Most recent payment timestamp |

### Explorer — Protocol Level

Unlike `mpp.t2000.ai/explorer` (which only shows t2000 gateway payments), `mppsui.dev/explorer` tracks ALL MPP payments on Sui across ALL servers.

**Data source options:**
1. Each registered server provides a payment feed API
2. On-chain indexing — track USDC transfers matching MPP patterns
3. Hybrid — server-reported + on-chain verification

### Compatibility with MPPscan

MPP is now a Stripe + Tempo + Visa backed standard (Mar 2026). `mppx` is the official SDK. 100+ services integrated across Base/Solana/Tempo. Sui is the missing chain — mppsui.dev fills that gap.

| Feature | MPPscan (Tempo/Base) | mppsui.dev |
|---------|----------------------|------------|
| Chain | Base / Solana / Tempo | Sui |
| Discovery | OpenAPI + x-payment-info | Same spec (compatible) |
| Explorer | 100+ servers | Sui-only, starting with t2000 |
| Onboarding | AgentCash ($25 USDC on Tempo) | USDC sponsorship ($1 on Sui) |
| Agent setup | `npx agentcash onboard` | `t2000 init` or Google Sign-In |
| SDK | `mppx` (official Stripe+Tempo) | `mppx` + `@mppsui/mpp` as Sui payment method |
| Fiat payments | SPTs (Shared Payment Tokens) | Not yet — monitor for Sui support |

**Strategy: Compatible, not competing.** Adopt the same OpenAPI discovery spec. `mpp.t2000.ai` should register on MPPscan for cross-chain visibility. `mppsui.dev` is the Sui-native home.

---

## 3. mpp.t2000.ai — Gateway Refactoring

### What moves to mppsui.dev

| Page | Currently | After |
|------|-----------|-------|
| `/spec` | Protocol spec on gateway | **Moves to mppsui.dev/spec** — protocol spec belongs on the ecosystem site |
| `/docs` | Developer guide on gateway | **Moves to mppsui.dev/docs** — docs are for the standard, not one gateway |
| `/explorer` | t2000 payment explorer | **Stays** — gateway-specific payment history |
| `/services` | Service catalog | **Stays** — this IS the gateway's product |
| `/` | Gateway homepage | **Stays** — gateway pitch + live feed |
| `/llms.txt` | Agent catalog | **Stays** — gateway-specific discovery |

**Redirect timing:** Keep `/spec` and `/docs` live on the gateway until mppsui.dev launches (Phase 4). Only enable redirects to `mppsui.dev/spec` and `mppsui.dev/docs` once the new site is deployed and verified. Otherwise users hit a 404 for weeks.

### Add OpenAPI discovery

Expose `/openapi.json` on `mpp.t2000.ai` with all 40 services documented in the standard format. This enables:
1. Registration on mppsui.dev as the first server
2. Registration on MPPscan for cross-chain visibility
3. Agent discovery via standard tooling

### Deliver-First Pattern (High-Value Services)

Some endpoints operate in a **hybrid mode** — MPP for direct CLI/SDK callers, but "deliver-first" for the web-app:

| Endpoint | Direct callers (CLI/SDK) | Web-app |
|----------|-------------------------|---------|
| `/printful/v1/order` | Standard MPP 402 challenge | Not used |
| `/printful/v1/order-internal` | N/A (internal-key protected) | Deliver-first: call Printful → return result + payment details → web-app builds tx |

**Why:** High-value services (merch orders, physical mail) can't risk payment-before-delivery — if the upstream fails after payment, money is lost. The deliver-first pattern calls the upstream first, only charges after success.

**OpenAPI implications:**
- `/printful/v1/order` should be documented in `openapi.json` with `x-payment-info` (it's the public MPP endpoint)
- `/printful/v1/order-internal` should NOT be in `openapi.json` (it's internal, not discoverable)
- Both produce explorer entries via different paths: MPP auto-logs for direct callers, `POST /api/internal/log-payment` for deliver-first flows

**Explorer logging:**
After a deliver-first payment confirms on-chain, the web-app fires a log entry to `POST /api/internal/log-payment` (internal-key protected), which writes to the same `X402Payment` table the explorer reads. This ensures all commerce purchases appear in the explorer with correct amounts and tx digests.

**Future deliver-first services:** Any new high-value service should follow this pattern — add an `*-internal` route on the gateway, a `deliverFirst` config in `service-gateway.ts`, and a mapping in the `logToGateway` function in the web-app's `complete` route.

### Structure after refactor

```
mpp.t2000.ai/
├── /                    → Gateway homepage (stays)
├── /services            → Service catalog (stays)
├── /explorer            → t2000 payment explorer (stays)
├── /spec                → REDIRECT → mppsui.dev/spec
├── /docs                → REDIRECT → mppsui.dev/docs
├── /openapi.json        → NEW: OpenAPI discovery document
├── /llms.txt            → Agent-readable catalog (stays)
└── /api/
    ├── /services        → Service catalog JSON (stays)
    ├── /mpp/payments    → Payment feed (stays)
    ├── /mpp/stats       → Aggregate stats (stays)
    ├── /mpp/volume      → Volume chart data (stays)
    └── /internal/
        └── /log-payment → Internal: log deliver-first payments to explorer (x-internal-key)
```

---

## 4. Package Migration

### `@t2000/mpp-sui` → `@mppsui/mpp`

The Sui payment method package outgrows the t2000 namespace. It's a protocol primitive, not a product feature.

| Current | New | Why |
|---------|-----|-----|
| `@t2000/mpp-sui` | `@mppsui/mpp` | Protocol package, not product-scoped |
| Published under `@t2000` org | Published under `@mppsui` org | Ecosystem branding |

**Migration plan:**
1. Create `@mppsui` npm org
2. Publish `@mppsui/mpp` as the new package (same code, new name)
3. Publish `@mppsui/discovery` as the Sui-specific validation CLI
4. Update `@t2000/mpp-sui` to re-export from `@mppsui/mpp` with a deprecation notice
5. Update all internal references (`apps/gateway`, `apps/web-app`, `packages/sdk`)
6. Keep `@t2000/mpp-sui` alive for 6 months as a shim, then archive

**No breaking changes** — existing users of `@t2000/mpp-sui` get a deprecation warning pointing to `@mppsui/mpp`.

### `@mppsui/discovery`

Sui-specific discovery validation package. Same CLI pattern as `@agentcash/discovery`.

```bash
npx @mppsui/discovery check https://mpp.t2000.ai
npx @mppsui/discovery discover https://mpp.t2000.ai
```

**Ships in Phase 3a** alongside `@mppsui/mpp` — the `@mppsui` org launches with both packages from day one.

**Validation checks (superset of `@agentcash/discovery`):**
- OpenAPI 3.1 document at `/openapi.json`
- `x-payment-info` present with `protocols: ["mpp"]`
- `x-payment-info.pricingMode` valid (`fixed`, `range`, `quote`)
- `requestBody` schema declared on payable operations
- `responses.402` declared on payable operations
- Sui-specific: recipient is a valid Sui address, coin type is Sui USDC
- Sui-specific: network validation (mainnet/testnet)

**Relationship to `@agentcash/discovery`:**
- `@agentcash/discovery` = chain-agnostic OpenAPI validation (used by MPPscan)
- `@mppsui/discovery` = same checks + Sui-specific validations (address format, USDC coin type, network)
- Phase 2 validates with `@agentcash/discovery` to pass MPPscan registration
- Phase 3a publishes `@mppsui/discovery` for Sui MPP server developers

---

## 5. Per-Server Analytics (inspired by MPPscan)

MPPscan tracks rich per-server metrics. mppsui.dev should do the same for every registered Sui MPP server.

### Server Card Metrics

| Metric | What | Source |
|--------|------|--------|
| Transactions | Total payment count | Server-reported feed + on-chain verification |
| Volume | Total USDC paid | Sum of payment amounts |
| Agents | Unique payer addresses | Distinct sender addresses |
| Latest | Time since last payment | Most recent tx timestamp |
| Endpoints | Number of payable operations | OpenAPI document |
| Uptime | Server availability | Periodic health checks |

### Server Detail Page (`/servers/:id`)

| Section | Content |
|---------|---------|
| Header | Server name, description, URL, registration date |
| Stats row | Txns, volume, agents, latest (like MPPscan) |
| Endpoints table | All payable operations with pricing |
| Payment feed | Recent payments for this server |
| Volume chart | 7d / 30d payment volume |

### Analytics Database

```prisma
model MppServer {
  id          Int      @id @default(autoincrement())
  url         String   @unique
  name        String
  description String?
  openApiUrl  String
  status      String   @default("active") // active | inactive | failed
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  payments    MppServerPayment[]
  @@map("mpp_servers")
}

model MppServerPayment {
  id        Int      @id @default(autoincrement())
  serverId  Int      @map("server_id")
  server    MppServer @relation(fields: [serverId], references: [id])
  endpoint  String
  amount    String
  digest    String?
  sender    String?
  createdAt DateTime @default(now()) @map("created_at")
  @@index([serverId, createdAt(sort: Desc)])
  @@index([sender])
  @@map("mpp_server_payments")
}
```

### Payment Feed API Standard

Every registered server should expose a payment feed endpoint. This is what mppsui.dev polls to ingest analytics.

**Endpoint:** `GET {server_url}/api/mpp/payments?since={iso_timestamp}&limit={n}`

**Response format:**
```json
{
  "payments": [
    {
      "digest": "0xabc123...",
      "endpoint": "/api/search",
      "amount": "0.01",
      "currency": "USDC",
      "sender": "0xdef456...",
      "timestamp": "2026-02-19T12:00:00Z"
    }
  ],
  "cursor": "2026-02-19T12:00:00Z",
  "hasMore": false
}
```

**Required fields:** `digest`, `endpoint`, `amount`, `timestamp`
**Optional fields:** `sender`, `currency` (defaults to USDC)

### Data Collection

**Server-reported (MVP):**
- Each registered server exposes the payment feed API above
- mppsui.dev polls registered servers on a cron (every 5 min)
- Uses `?since=` cursor to only fetch new payments since last poll
- Deduplicates by tx digest

**Future: On-chain verification**
When there are multiple servers and trust matters, add on-chain verification — verify tx digests exist on Sui RPC, flag discrepancies. Not needed while t2000 is the primary server.

---

## 6. Wireframes

### mppsui.dev Homepage (`/`)

```
┌──────────────────────────────────────────────────────────┐
│  mppsui.dev                    Spec  Docs  Servers  GitHub│
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Machine Payments on Sui              ┌─────────────────┐│
│                                       │ $ curl -X POST  ││
│  The open protocol for AI agents      │   mpp.t2000.ai/ ││
│  to pay for APIs with USDC.           │                 ││
│                                       │ 402 Payment Req ││
│  12 servers · 350+ endpoints          │ ── pay 0.01 ──  ││
│  4.5K payments · $2.1K volume         │ ✓ 200 OK        ││
│                                       └─────────────────┘│
│  [Get Started ↓]        [Register Server →]              │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  Top Servers                                         All →│
│  ┌────────────────────────────────────────────────────┐  │
│  │  Server          Txns    Volume    Agents  Latest  │  │
│  │  ─────────────────────────────────────────────────  │  │
│  │  t2000 Gateway   350+    $180      45      2m ago  │  │
│  │  (more servers as they register)                   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  ┌──── Use APIs ──────────┐  ┌──── Accept Payments ───┐ │
│  │                        │  │                        │ │
│  │  npm i @mppsui/mpp     │  │  npm i @mppsui/mpp     │ │
│  │                        │  │                        │ │
│  │  // 3 lines to pay     │  │  // 3 lines to charge  │ │
│  │  const mpp = Mppx...   │  │  const mpp = Mppx...   │ │
│  │  await mpp.fetch(url)  │  │  mpp.charge({...})     │ │
│  │                        │  │                        │ │
│  │  [Read docs →]         │  │  [Provider guide →]    │ │
│  └────────────────────────┘  └────────────────────────┘ │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  Built on Sui    @mppsui/mpp · GitHub · npm · mppscan    │
└──────────────────────────────────────────────────────────┘
```

### Servers Listing (`/servers`)

```
┌──────────────────────────────────────────────────────────┐
│  mppsui.dev/servers                                      │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  MPP Servers on Sui           [Register yours →]         │
│                                                          │
│  12 servers · 350+ endpoints · 4.5K total payments       │
│                                                          │
│  Sort: [Most txns ▼]   Filter: [All categories ▼]       │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  t2000 Gateway                         [View →]    │  │
│  │  40 services · 88 endpoints                        │  │
│  │  AI, Search, Commerce, Physical Mail, DeFi         │  │
│  │                                                    │  │
│  │  Txns: 350+   Vol: $180   Agents: 45   2m ago      │  │
│  │  ▇▇▇▅▃▅▇▆▄▅▇▇ (30d volume sparkline)              │  │
│  ├────────────────────────────────────────────────────┤  │
│  │  StableAPI                             [View →]    │  │
│  │  6 endpoints                                       │  │
│  │  Finance, Rates                                    │  │
│  │                                                    │  │
│  │  Txns: 42   Vol: $8.50   Agents: 12   15m ago      │  │
│  │  ▃▅▃▂▃▅▃▂▃▅▃▅ (30d volume sparkline)              │  │
│  ├────────────────────────────────────────────────────┤  │
│  │  ...                                               │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  [Load more ↓]                                           │
└──────────────────────────────────────────────────────────┘
```

### Server Detail Page (`/servers/:id`)

```
┌──────────────────────────────────────────────────────────┐
│  mppsui.dev/servers/t2000-gateway                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  t2000 Gateway                                           │
│  40 services, 88 endpoints for AI agents                 │
│  https://mpp.t2000.ai    Registered: Feb 2026            │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ 350+     │  │ $180     │  │ 45       │  │ 99.8%   │ │
│  │ txns     │  │ volume   │  │ agents   │  │ uptime  │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
│                                                          │
│  ── Volume (30d) ──────────────────────────────────────  │
│  $12 │      ▇                                            │
│      │    ▇ ▇ ▇                                          │
│      │  ▇ ▇ ▇ ▇ ▇                                       │
│      │▇ ▇ ▇ ▇ ▇ ▇ ▇                                     │
│  $0  └─────────────────                                  │
│       Feb 1            Feb 19                            │
│                                                          │
│  ── Endpoints ─────────────────────────────────────────  │
│                                                          │
│  Endpoint              Method  Price     Txns            │
│  ─────────────────────────────────────────────────────   │
│  /openai/v1/chat       POST    $0.05     120             │
│  /brave/v1/web/search  POST    $0.005    89              │
│  /stability/v1/gen     POST    $0.05     45              │
│  /lob/v1/postcards     POST    $1.00     12              │
│  ... (88 total)                                          │
│                                                          │
│  ── Recent Payments ───────────────────────────────────  │
│                                                          │
│  Time     Endpoint              Amount   Tx              │
│  ─────────────────────────────────────────────────────   │
│  2m ago   /openai/v1/chat       $0.05    0xabc... ↗      │
│  5m ago   /brave/v1/web/search  $0.005   0xdef... ↗      │
│  8m ago   /stability/v1/gen     $0.05    0x123... ↗      │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Protocol Explorer (`/explorer`)

```
┌──────────────────────────────────────────────────────────┐
│  mppsui.dev/explorer                                     │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  MPP Payment Explorer                                    │
│  All machine payments on Sui — real-time                 │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ 4,523    │  │ $2.1K    │  │ 187      │  │ 12      │ │
│  │ payments │  │ volume   │  │ agents   │  │ servers │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
│                                                          │
│  ── Volume (30d) ──────────────────────────────────────  │
│  $120│          ▇                                        │
│      │      ▇ ▇ ▇ ▇                                     │
│      │  ▇ ▇ ▇ ▇ ▇ ▇ ▇                                   │
│  $0  └─────────────────                                  │
│       Feb 1            Feb 19                            │
│                                                          │
│  Filter: [All servers ▼]  [All endpoints ▼]  [7d ▼]     │
│                                                          │
│  ── Live Feed ─────────────────────────────────────────  │
│                                                          │
│  Time     Server          Endpoint            Amount  Tx │
│  ──────────────────────────────────────────────────────  │
│  now      t2000 Gateway   /openai/v1/chat     $0.05  ↗  │
│  1m ago   t2000 Gateway   /brave/v1/search    $0.005 ↗  │
│  3m ago   StableAPI       /rates/v1/forex     $0.01  ↗  │
│  5m ago   t2000 Gateway   /lob/v1/postcards    $1.00  ↗  │
│  ...                                                     │
│                                                          │
│  ── Server Leaderboard ────────────────────────────────  │
│                                                          │
│  Server          Txns    Volume   Agents   Share         │
│  ──────────────────────────────────────────────────────  │
│  t2000 Gateway   350+    $180     45       85%  ▇▇▇▇▇▇  │
│  StableAPI       42      $8.50    12       4%   ▇        │
│  ...                                                     │
│                                                          │
│  Every tx digest links to Suiscan for on-chain proof ↗   │
└──────────────────────────────────────────────────────────┘
```

### Server Registration Flow (`/register`)

```
┌──────────────────────────────────────────────────────────┐
│  mppsui.dev/register                                     │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Add your Server                                         │
│                                                          │
│  Register your MPP server to be discoverable on Sui.     │
│  We'll validate your OpenAPI spec and start tracking     │
│  payments automatically.                                 │
│                                                          │
│  ┌────────────────────────────────────────────────┐      │
│  │  Server Base URL                               │      │
│  │  https://                                      │      │
│  └────────────────────────────────────────────────┘      │
│                                                          │
│  [Validate →]                                            │
│                                                          │
│  ── After clicking Validate: ──                          │
│                                                          │
│  ✓ OpenAPI document found at /openapi.json               │
│  ✓ 12 payable endpoints detected                         │
│  ✓ x-payment-info present on all operations              │
│  ✓ 402 challenge response verified                       │
│  ✓ Sui USDC recipient is valid address                   │
│  ✗ Missing input schema on POST /api/translate           │
│                                                          │
│  5/6 checks passed. Fix the warning to complete.         │
│                                                          │
│  ── After all checks pass: ──                            │
│                                                          │
│  ┌────────────────────────────────────────┐              │
│  │  Preview                               │              │
│  │                                        │              │
│  │  My API Gateway                        │              │
│  │  12 endpoints · $0.005–$1.00           │              │
│  │  AI, Search, Commerce                  │              │
│  └────────────────────────────────────────┘              │
│                                                          │
│  [Register Server]                                       │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  Need help?                                              │
│  [Discovery Spec →]  [Validation CLI →]  [Discord →]     │
└──────────────────────────────────────────────────────────┘
```

### Agent Onboarding Flow (`/agent`)

```
┌──────────────────────────────────────────────────────────┐
│  mppsui.dev/agent                                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Use MPP APIs on Sui                                     │
│                                                          │
│  Access hundreds of APIs with micropayments.             │
│  No API keys. No subscriptions. Just USDC on Sui.        │
│                                                          │
│  ── Option 1: Web App (recommended) ──                   │
│                                                          │
│  Sign in with Google. Get $1 USDC to start.              │
│  [Open app.t2000.ai →]                                   │
│                                                          │
│  ── Option 2: Terminal ──                                │
│                                                          │
│  $ npm i -g @t2000/cli                                   │
│  $ t2000 init                                            │
│  ✓ Wallet created · $1 USDC sponsored                    │
│  $ t2000 pay https://mpp.t2000.ai/brave/v1/web/search   │
│                                                          │
│  ── Option 3: SDK ──                                     │
│                                                          │
│  npm i @mppsui/mpp mppx                                  │
│                                                          │
│  const mpp = Mppx.create({                               │
│    methods: [sui({ client, signer })]                    │
│  });                                                     │
│  const res = await mpp.fetch(url);                       │
│                                                          │
│  ── Option 4: Claude / Cursor / MCP ──                   │
│                                                          │
│  npm i @t2000/mcp                                        │
│  35 tools · 20 prompts · works in any MCP client         │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  [Browse Servers →]  [Read Docs →]  [Explorer →]         │
└──────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: USDC Sponsorship — ✅ Shipped

| Task | Where | Status |
|------|-------|--------|
| `UsdcSponsorLog` model + `prisma db push` | `apps/server` (NeonDB) | ✅ |
| `POST /api/sponsor/usdc` endpoint with dual auth | `apps/server` | ✅ |
| USDC transfer service (sponsor wallet → user) | `apps/server/src/services/usdcSponsor.ts` | ✅ |
| Abuse prevention (unique address, global rate limit, hashcash) | `apps/server` | ✅ |
| Web app: server-side proxy route + `useUsdcSponsor` hook | `apps/web-app` | ✅ |
| ECS task definition: `SPONSOR_INTERNAL_KEY` via Secrets Manager | `infra/server-task-definition.json` | ✅ |
| CLI: trigger on `t2000 init` + hashcash auth | `packages/cli` | ✅ |

### Phase 2: OpenAPI Discovery — ✅ Shipped

| Task | Where | Status |
|------|-------|--------|
| Add request/response schemas to service catalog | `apps/gateway/lib/schemas.ts` | ✅ |
| Generate `/openapi.json` from catalog + schemas | `apps/gateway/app/openapi.json/route.ts` | ✅ |
| `x-payment-info` per operation (generated from catalog) | Part of `/openapi.json` generation | ✅ |
| `requestBody` + `responses` schemas per operation | Part of `/openapi.json` generation | ✅ |
| `info.x-guidance` for agent discovery | Part of `/openapi.json` generation | ✅ |
| `responses.402` on all payable operations | Part of `/openapi.json` generation | ✅ |
| Update `/llms.txt` to reference `/openapi.json` | `apps/gateway/app/llms.txt/route.ts` | ✅ |
| Fix mppx realm (was using Vercel deployment URL) | `apps/gateway/lib/gateway.ts` | ✅ |
| Validate with `@agentcash/discovery` | Local | ✅ 88 routes discovered |
| Register on MPPscan | `mppscan.com/register` | ✅ [Listed](https://mppscan.com/server/f8284ec0f870b9b542e09f91dcf76b752fd1090f91a419cd624394373f9fa564) |

**Schema approach (per MPPscan spec):**
- Each payable operation must have `requestBody.content["application/json"].schema`
- Many endpoints share common patterns — define templates and reuse:
  - `chatCompletions` — OpenAI, Anthropic, Groq, DeepSeek, Perplexity, Mistral, Together, Cohere, Gemini
  - `search` — Brave, Serper, Exa, SerpAPI, NewsAPI, CoinGecko, Alpha Vantage, Hunter
  - `imageGeneration` — Fal, Together, Stability, DALL-E
  - `audioTranscription` — Whisper variants, AssemblyAI
  - `translate` — DeepL, Google Translate
  - Service-specific schemas for the rest (Lob, Printful, Resend, etc.)
- Prices use string format with 6 decimal places per MPPscan convention (e.g. `"0.010000"`)
- Fixed pricing uses `"price"` field (not `"amount"`)

**OpenAPI minimal valid example (per MPPscan):**
```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "t2000 MPP Gateway",
    "version": "1.0.0",
    "description": "40 MPP-enabled API services payable with Sui USDC.",
    "x-guidance": "Use POST requests to any service endpoint. All endpoints require MPP payment via Sui USDC. See /llms.txt for natural-language usage examples."
  },
  "x-discovery": {
    "ownershipProofs": ["<proof>"]
  },
  "paths": {
    "/openai/v1/chat/completions": {
      "post": {
        "operationId": "openai-chat-completions",
        "summary": "Chat completions (GPT-4o, o1, etc.)",
        "tags": ["ai", "media"],
        "x-payment-info": {
          "pricingMode": "fixed",
          "price": "0.010000",
          "protocols": ["mpp"]
        },
        "requestBody": { "required": true, "content": { "application/json": { "schema": { "..." } } } },
        "responses": {
          "200": { "description": "Successful response" },
          "402": { "description": "Payment Required" }
        }
      }
    }
  }
}
```

### Phase 3a: Package Migration — 2-3 days

| # | Task | Where |
|---|------|-------|
| 1 | ✅ Create `@mppsui` npm org | npm |
| 2 | ✅ Rename + publish `@mppsui/mpp` (Sui payment method plugin for `mppx`) | `packages/mpp-sui` → rename in `package.json` |
| 3 | ✅ Create + publish `@mppsui/discovery` (Sui-specific discovery validation CLI) | `packages/discovery` (new) |
| 4 | ✅ Update internal code imports (`@t2000/mpp-sui` → `@mppsui/mpp`) | `apps/gateway/lib/gateway.ts`, `packages/sdk/src/t2000.ts`, `apps/web-app/app/api/services/complete/route.ts`, `apps/web-app/app/api/services/retry/route.ts` |
| 5 | ✅ Update `package.json` dependencies | `apps/gateway`, `apps/web-app`, `packages/sdk` |
| 6 | ✅ Update CI workflows + Dockerfiles | `.github/workflows/publish.yml`, `ci.yml`, `deploy-server.yml`, `deploy-indexer.yml`, `packages/mcp/Dockerfile`, `infra/indexer.Dockerfile`, `apps/server/Dockerfile` |
| 7 | ✅ Update docs & marketing references | `README.md`, `ARCHITECTURE.md`, `PRODUCT_FACTS.md`, `SECURITY.md`, `packages/sdk/README.md`, `packages/cli/README.md`, `apps/gateway/README.md`, `apps/gateway/app/docs/page.tsx`, `apps/web/app/docs/page.tsx`, `apps/web/app/mpp/page.tsx`, `t2000-skills/skills/t2000-pay/SKILL.md` |
| 8 | Final publish of `@t2000/mpp-sui` with README → "Moved to `@mppsui/mpp`" | `packages/mpp-sui` (last publish, no re-export shim) |

Ships independently. The `@mppsui` org launches with both packages:
- `@mppsui/mpp` — payment method (migrated from `@t2000/mpp-sui`)
- `@mppsui/discovery` — validation CLI (`npx @mppsui/discovery check <url>`)

**No deprecation shim** — `@t2000/mpp-sui` gets a final README-only publish pointing to `@mppsui/mpp`. No re-export wrapper to maintain.

### Phase 3b: mppsui.dev Site — 1-2 weeks

**Prerequisite:** Domain `mppsui.dev` must be purchased and DNS configured.

| Task | Where |
|------|-------|
| New Next.js app | `apps/mppsui` |
| Homepage — hero, live stats, "what is MPP on Sui" | `/` |
| Spec page — migrate from gateway, expand for protocol | `/spec` |
| Docs page — migrate from gateway, add provider guide | `/docs` |
| Agent onboarding page — web/CLI/SDK/MCP options | `/agent` |
| Enable `/spec` and `/docs` redirects on gateway | `apps/gateway` |
| Deploy to Vercel with `mppsui.dev` domain | Vercel |

### Phase 4: Server Registry + Analytics — 1-2 weeks

| Task | Where |
|------|-------|
| `MppServer` + `MppServerPayment` models | `apps/mppsui` (NeonDB) |
| OpenAPI + Sui validation (uses `@mppsui/discovery`) | `apps/mppsui` |
| Server registry page — list registered servers | `/servers` |
| Register flow — URL → OpenAPI validation → listing | `/register` |
| Per-server detail page — endpoints, pricing, metrics | `/servers/:id` |
| Payment feed ingestion cron (poll registered servers) | `apps/mppsui` cron |
| Protocol explorer — live feed, volume charts | `/explorer` |

**Register UX (ref: MPPscan):** The `/register` flow should follow MPPscan's live-preview pattern — paste a server URL, immediately fetch `/openapi.json` and render endpoints with pricing inline, run `@mppsui/discovery` validation in real-time with pass/fail checks, and only enable the "Register" button once validation passes. Show actionable warnings (e.g. high route count) rather than hard blocks.

### Phase 5: Apple Pay / Android Pay — TBD

| Task | Where |
|------|-------|
| Payment provider integration (Stripe / Moonpay) | `apps/web-app` |
| USDC purchase flow — fiat → USDC on Sui | New API route |
| Replace sponsorship for returning users | `apps/web-app` |

---

## Domain Summary

| Domain | Purpose | Repo | Status |
|--------|---------|------|--------|
| `app.t2000.ai` | Consumer web app | `apps/web-app` (monorepo) | Live |
| `t2000.ai` | Product site, docs, stats | `apps/web` (monorepo) | Live |
| `t2000.ai/mpp` | MPP product page ("use t2000 for MPP on Sui") | `apps/web` (monorepo) | Live |
| `mpp.t2000.ai` | t2000 gateway — 40 services | `apps/gateway` (monorepo) | Live |
| `mppsui.dev` | Sui MPP ecosystem hub | `apps/mppsui` (monorepo) | **Domain needed** |
| `api.t2000.ai` | Server — sponsor, gas, fees | `apps/server` (monorepo) | Live |

**npm org:** `@mppsui` registered on npm (under mission69b). Publishes two packages:
- `@mppsui/mpp` — published from `packages/mpp-sui` (rename `name` field in `package.json`)
- `@mppsui/discovery` — published from `packages/discovery` (new)

**No separate repo.** The `@mppsui` npm org is for publishing, not GitHub hosting. Both packages and `apps/mppsui` stay in the t2000 monorepo. Extract to a separate repo only if Mysten wants to co-own or CI cadence diverges.

**`t2000.ai/mpp` vs `mppsui.dev`:** The existing `/mpp` page is a product page — "use t2000 to pay for APIs on Sui." `mppsui.dev` is an ecosystem page — "MPP on Sui, any server, any agent." Different audiences: `/mpp` sells t2000, `mppsui.dev` grows the Sui MPP ecosystem.

**Domain:** `mppsui.dev` must be purchased before Phase 3b. Check availability early.

---

## 7. Mysten Coordination

| Action | When | Status |
|--------|------|--------|
| Discuss USDC sponsorship grant (fund treasury for user onboarding) | Phase 1 | ✅ Self-funded ($100) |
| Request Enoki approval for treasury gas sponsorship | Phase 1 | ⬜ |
| Share mppsui.dev plans — gauge interest in co-ownership | Phase 3b | ⬜ |
| Coordinate listing on Sui ecosystem pages / blog | Phase 3b launch | ⬜ |
| Discuss `@mppsui` npm org ownership (registered under mission69b, shared with Mysten later?) | Phase 3a | ✅ Created, discuss sharing later |

---

## 8. mppsui.dev Launch Plan

**Goal:** Get registered servers and ecosystem momentum, not just a website.

| Step | What | When |
|------|------|------|
| 1 | Register `mpp.t2000.ai` as first server on mppsui.dev | Day 1 |
| 2 | Register `mpp.t2000.ai` on MPPscan for cross-chain visibility | Day 1 |
| 3 | Announce on Twitter/X — "MPP on Sui is live" with explorer screenshot | Day 1 |
| 4 | Post in Sui Discord / forums | Day 1 |
| 5 | Reach out to Sui builders with APIs (StableAPI, etc.) to register | Week 1 |
| 6 | Coordinate with Mysten for ecosystem amplification | Week 1-2 |
| 7 | Submit to Sui ecosystem directory | Week 1 |

Keep it lean. The site speaks for itself — live stats, real payments, real servers.

---

## 9. Additional Considerations

### Things to keep in mind

| Item | Why it matters |
|------|---------------|
| **API versioning** | `@mppsui/mpp` needs semver from day one — other builders will depend on it |
| **Multi-currency future** | Spec currently assumes USDC only. Leave room in `x-payment-info` for SUI, wBTC etc. |
| **Mysten co-ownership** | If Mysten wants to co-own mppsui.dev, may need separate repo sooner |
| **SEO / discoverability** | mppsui.dev needs to rank for "machine payments Sui", "AI agent payments Sui" |
| **OpenAPI auto-generation** | 40 services × multiple endpoints = large OpenAPI doc. Auto-generate from service catalog config |
| **Cross-registration** | `mpp.t2000.ai` registers on both mppsui.dev AND mppscan.com. Keep in sync when services change |
| **Deliver-first endpoints** | High-value services (merch, physical mail) bypass MPP via internal endpoints. `openapi.json` should only expose the public MPP route, not the internal one. Explorer logging handled separately via `POST /api/internal/log-payment` |

---

## Open Questions

| Question | Options | Status |
|----------|---------|--------|
| Sponsorship funding source? | Treasury self-funded vs Mysten grant | ✅ Self-funded ($100), apply for grant to scale |
| Gas for treasury transfers? | Enoki-sponsored vs self-funded SUI | Enoki if Mysten approves, SUI fallback |
| mppsui.dev in monorepo or separate? | Monorepo vs new repo | ✅ Monorepo — extract only if Mysten co-owns |
| `@mppsui` npm org ownership? | Solo vs shared with Mysten | ✅ Registered under mission69b, discuss with Mysten later |
| OpenAPI doc generation? | Manual vs auto-generated from service catalog | ✅ Auto-generate — 88 endpoints is too many to maintain by hand |

### Deferred (build when needed)

| Item | Trigger to build |
|------|------------------|
| Referral system | Real user growth to amplify |
| On-chain payment verification | Multiple servers, trust matters |
| Privacy controls on payment feeds | Server operator requests it |
| Agent leaderboard | Enough agent diversity to make it interesting |
