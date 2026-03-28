# MPP Ecosystem Roadmap

---

## Three Domains

```
mpp.t2000.ai          →  t2000's gateway (41 services, 90 endpoints)
mppsui.dev             →  Sui MPP standard (spec, docs, server registry, explorer)
app.t2000.ai           →  Consumer product (web app, banking, AI chat)
```

| Domain | What | Audience | Status |
|--------|------|----------|--------|
| `mpp.t2000.ai` | t2000 MPP gateway — 41 services, explorer, live feed | AI agents, developers | Live |
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

### Flow — Web App

```
User clicks "Sign in with Google"
  → zkLogin → wallet derived
  → Check: is this a new address? (never seen before)
  → Yes → POST /api/sponsor/onboard { address }
    → Server checks: address not in sponsor_log
    → Server sends 1 USDC from treasury to address (sponsored tx)
    → Log to sponsor_log { address, amount, type: 'onboard', timestamp }
  → User lands on dashboard with $1 USDC balance
```

### Flow — CLI

```
t2000 init
  → Generate keypair, encrypt with PIN
  → Client signs a challenge nonce with the new keypair
  → POST /api/sponsor/onboard { address, signature, nonce }
    → Server verifies signature matches address (proves key ownership)
    → Same flow as web app from here
  → User has $1 USDC + 0.05 SUI (existing gas bootstrap)
```

**Why signature challenge:** Without it, anyone can script `curl POST /api/sponsor/onboard` with random addresses to drain the treasury. The signature proves the caller actually owns the private key for the address.

### Abuse Prevention

| Protection | Detail |
|------------|--------|
| One-time per address | `sponsor_log` table — address is unique. Duplicate requests return 409 (not 500) |
| Signature challenge (CLI) | CLI must sign a server-issued nonce — proves key ownership before sponsorship |
| Rate limit | Max 20 sponsorships per hour from treasury |
| Google account uniqueness | zkLogin derives address from Google `sub` — one Google = one address |
| Fund monitoring | Alert if treasury USDC drops below threshold |
| Treasury dry graceful degradation | If treasury balance < 1 USDC: show "Sponsorship temporarily unavailable — deposit USDC manually to get started". User can still sign up, just without the free USDC |

### Gas for Sponsored Transfers

The treasury wallet needs SUI to pay gas on USDC transfers. Two options:

| Option | How | Leaning |
|--------|-----|---------|
| Enoki-sponsored | Use Enoki to sponsor the treasury's transfer tx — zero SUI needed | Preferred if Mysten approves |
| Self-funded SUI | Keep a small SUI balance in treasury (~10 SUI covers thousands of transfers) | Fallback |

### Funding

- **Now:** Treasury wallet, self-funded
- **Next:** Mysten subsidy / ecosystem grant (discussed in meeting)
- **Later:** Apple Pay / Android Pay for top-ups (replaces sponsorship for returning users)

### Future: Referral System

Deferred until there's real user growth to amplify. When needed: referral link → new user gets bonus USDC, referrer gets reward. Keep simple — don't over-engineer until there's volume.

### Database

```prisma
model SponsorLog {
  id        Int      @id @default(autoincrement())
  address   String   @unique
  amount    String
  txDigest  String
  createdAt DateTime @default(now()) @map("created_at")
  @@map("sponsor_log")
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

**Validation:** Use `@agentcash/discovery` compatible validation or build our own `@mppsui/discovery` package.

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

| Feature | MPPscan (Tempo) | mppsui.dev |
|---------|-----------------|------------|
| Chain | Base / Tempo | Sui |
| Discovery | OpenAPI + x-payment-info | Same spec (compatible) |
| Explorer | 362 servers, 35.6K txs | Sui-only, starting with t2000 |
| Onboarding | AgentCash ($25 USDC on Tempo) | USDC sponsorship ($1 on Sui) |
| Agent setup | `npx agentcash onboard` | `t2000 init` or Google Sign-In |
| Payment method | x402 + MPP | MPP via `@mppsui/mpp` (migrated from `@t2000/mpp-sui`) |

**Strategy: Compatible, not competing.** Adopt the same OpenAPI discovery spec. `mpp.t2000.ai` should also register on MPPscan for cross-chain visibility. `mppsui.dev` is the Sui-native home.

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

Expose `/openapi.json` on `mpp.t2000.ai` with all 41 services documented in the standard format. This enables:
1. Registration on mppsui.dev as the first server
2. Registration on MPPscan for cross-chain visibility
3. Agent discovery via standard tooling

### Deliver-First Pattern (Gift Cards)

Some endpoints operate in a **hybrid mode** — MPP for direct CLI/SDK callers, but "deliver-first" for the web-app:

| Endpoint | Direct callers (CLI/SDK) | Web-app |
|----------|-------------------------|---------|
| `/reloadly/v1/order` | Standard MPP 402 challenge | Not used |
| `/reloadly/v1/order-internal` | N/A (internal-key protected) | Deliver-first: call Reloadly → return result + payment details → web-app builds tx |

**Why:** High-value services (gift cards) can't risk payment-before-delivery — if the upstream fails after payment, money is lost. The deliver-first pattern calls the upstream first, only charges after success.

**OpenAPI implications:**
- `/reloadly/v1/order` should be documented in `openapi.json` with `x-payment-info` (it's the public MPP endpoint)
- `/reloadly/v1/order-internal` should NOT be in `openapi.json` (it's internal, not discoverable)
- Both produce explorer entries via different paths: MPP auto-logs for direct callers, `POST /api/internal/log-payment` for deliver-first flows

**Explorer logging:**
After a deliver-first payment confirms on-chain, the web-app fires a log entry to `POST /api/internal/log-payment` (internal-key protected), which writes to the same `MppPayment` table the explorer reads. This ensures all gift card purchases appear in the explorer as `reloadly /v1/order` with correct amounts and tx digests.

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
3. Update `@t2000/mpp-sui` to re-export from `@mppsui/mpp` with a deprecation notice
4. Update all internal references (`apps/gateway`, `apps/web-app`, `packages/sdk`)
5. Keep `@t2000/mpp-sui` alive for 6 months as a shim, then archive

**No breaking changes** — existing users of `@t2000/mpp-sui` get a deprecation warning pointing to `@mppsui/mpp`.

### Discovery Validation

Build OpenAPI + Sui-specific validation logic directly inside `apps/mppsui` (the `/register` flow). No separate package yet.

**Validation checks:**
- OpenAPI 3.1 document at `/openapi.json`
- `x-payment-info` present with `protocols: ["mpp"]`
- 402 response declared on payable operations
- Sui-specific: recipient is a valid Sui address, coin type is Sui USDC

**Future: `@mppsui/discovery` package**
Extract to a standalone npm package when external developers need to validate their servers locally before registering. Same CLI pattern as `@agentcash/discovery` (`npx @mppsui/discovery check <url>`). Not needed until there's demand.

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
│  │  41 services · 90 endpoints                        │  │
│  │  AI, Search, Commerce, Gift Cards, DeFi            │  │
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
│  41 services, 90 endpoints for AI agents                 │
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
│  /reloadly/v1/order    POST    varies    12              │
│  ... (90 total)                                          │
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
│  5m ago   t2000 Gateway   /reloadly/v1/order  $25.00 ↗  │
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

### Phase 1: USDC Sponsorship — 2-3 days

| Task | Where |
|------|-------|
| `SponsorLog` model + migration | `apps/server` (existing NeonDB) |
| `POST /api/sponsor/onboard` endpoint with signature challenge | `apps/server` |
| USDC transfer from treasury wallet | `apps/server` (uses SDK) |
| Abuse prevention (one-time, rate limit, graceful degradation) | `apps/server` |
| Web app: trigger on first sign-in | `apps/web-app` |
| CLI: trigger on `t2000 init` | `packages/cli` |

### Phase 2: OpenAPI Discovery + Gateway Refactor — 2-3 days

| Task | Where |
|------|-------|
| Generate `/openapi.json` from service catalog | `apps/gateway` |
| Add `x-payment-info` to all 41 services | `apps/gateway` |
| Add `x-guidance` for agent discovery | `apps/gateway` |
| Validate with `@agentcash/discovery` | Local |
| Register on MPPscan for cross-chain visibility | `mppscan.com/register` |
| Prepare redirect config (enable AFTER Phase 3 deploys) | `apps/gateway` |

### Phase 3: Package Migration + mppsui.dev — 2-3 weeks

| Task | Where |
|------|-------|
| Create `@mppsui` npm org | npm |
| Publish `@mppsui/mpp` (copy of `@t2000/mpp-sui`) | `packages/mpp` |
| Add deprecation notice to `@t2000/mpp-sui` | `packages/mpp-sui` |
| Update all internal imports | `apps/gateway`, `apps/web-app`, `packages/sdk` |
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
| OpenAPI + Sui validation logic (inline, not a separate package) | `apps/mppsui` |
| Server registry page — list registered servers | `/servers` |
| Register flow — URL → OpenAPI validation → listing | `/register` |
| Per-server detail page — endpoints, pricing, metrics | `/servers/:id` |
| Payment feed ingestion cron (poll registered servers) | `apps/mppsui` cron |
| Protocol explorer — live feed, volume charts | `/explorer` |

### Phase 5: Apple Pay / Android Pay — TBD

| Task | Where |
|------|-------|
| Payment provider integration (Stripe / Moonpay) | `apps/web-app` |
| USDC purchase flow — fiat → USDC on Sui | New API route |
| Replace sponsorship for returning users | `apps/web-app` |

---

## Domain Summary

| Domain | Purpose | Repo |
|--------|---------|------|
| `app.t2000.ai` | Consumer web app | `apps/web-app` (monorepo) |
| `t2000.ai` | Product site, docs, stats | `apps/web` (monorepo) |
| `mpp.t2000.ai` | t2000 gateway — 41 services | `apps/gateway` (monorepo) |
| `mppsui.dev` | Sui MPP ecosystem hub | `apps/mppsui` (monorepo, or separate repo later) |
| `api.t2000.ai` | Server — sponsor, gas, fees | `apps/server` (monorepo) |

**Note:** Keep `mppsui.dev` in the monorepo initially. Extract to a separate repo when there's real multi-contributor activity or if Mysten wants to co-own it.

---

## 7. Additional Considerations

### Things to keep in mind

| Item | Why it matters |
|------|---------------|
| **API versioning** | `@mppsui/mpp` needs semver from day one — other builders will depend on it |
| **Multi-currency future** | Spec currently assumes USDC only. Leave room in `x-payment-info` for SUI, wBTC etc. |
| **Mysten co-ownership** | If Mysten wants to co-own mppsui.dev, may need separate repo sooner |
| **SEO / discoverability** | mppsui.dev needs to rank for "machine payments Sui", "AI agent payments Sui" |
| **OpenAPI auto-generation** | 41 services × multiple endpoints = large OpenAPI doc. Auto-generate from service catalog config |
| **Cross-registration** | `mpp.t2000.ai` registers on both mppsui.dev AND mppscan.com. Keep in sync when services change |
| **Deliver-first endpoints** | Gift cards (and future high-value services) bypass MPP via internal endpoints. `openapi.json` should only expose the public MPP route, not the internal one. Explorer logging handled separately via `POST /api/internal/log-payment` |

---

## Open Questions

| Question | Options | Leaning |
|----------|---------|---------|
| Sponsorship funding source? | Treasury self-funded vs Mysten grant | Start with treasury, apply for grant to scale |
| Gas for treasury transfers? | Enoki-sponsored vs self-funded SUI | Enoki if Mysten approves, SUI fallback |
| mppsui.dev in monorepo or separate? | Monorepo vs new repo | Monorepo initially, extract if needed |
| OpenAPI doc generation? | Manual vs auto-generated from service catalog | Auto-generate — 90 endpoints is too many to maintain by hand |

### Deferred (build when needed)

| Item | Trigger to build |
|------|------------------|
| Referral system | Real user growth to amplify |
| `@mppsui/discovery` standalone package | External devs need local validation |
| On-chain payment verification | Multiple servers, trust matters |
| Privacy controls on payment feeds | Server operator requests it |
| Agent leaderboard | Enough agent diversity to make it interesting |
