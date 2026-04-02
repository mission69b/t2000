# suimpp.dev — Sui MPP Standard

> The open protocol site for machine payments on Sui.
> Layer 3 of the t2000 architecture — the standard, not the product.

---

## Architecture — Three Layers

```
┌─────────────────────────────────────────────────┐
│  Layer 3: suimpp.dev                            │
│  The open standard — protocol spec, explorer,   │
│  docs, ecosystem discovery                      │
├─────────────────────────────────────────────────┤
│  Layer 2: mpp.t2000.ai                          │
│  The service layer — 41 services, 90+ endpoints,│
│  pay-per-use APIs with Sui USDC                 │
├─────────────────────────────────────────────────┤
│  Layer 1: t2000.ai                              │
│  The infrastructure — CLI, SDK, MCP, Engine,    │
│  Gateway, contracts (powers Audric)             │
└─────────────────────────────────────────────────┘
         ▲               ▲               ▲
         │               │               │
     Builders        AI Agents      End Users
```

| Layer | Domain | What it is | Audience | Status |
|-------|--------|-----------|----------|--------|
| **1. Infrastructure** | `t2000.ai` | CLI, SDK, MCP, Engine, Gateway — the infra behind Audric | Developers, integrators | ✅ Live |
| **2. Service** | `mpp.t2000.ai` | MPP Gateway — 41 services, 90+ endpoints, pay-per-use APIs with Sui USDC | AI agents, MCP clients | ✅ Live |
| **3. Standard** | `suimpp.dev` | Sui MPP Standard — the open protocol | Ecosystem builders, Mysten, other gateways | 🔶 Planned |

Same pattern as: **Stripe** (Dashboard → API → Connect), **Ethereum** (MetaMask → Uniswap → ERC-20), **AWS** (Console → S3 → CloudFormation).

---

## Layer 1: t2000.ai — The Infrastructure ✅ Live

The engine behind Audric. CLI, SDK, MCP, engine, gateway — five packages for agentic finance.

| Component | What | Count |
|-----------|------|-------|
| SDK | `@t2000/sdk` — TypeScript, wallet management, transactions, NAVI adapter | 1 package |
| CLI | `@t2000/cli` — terminal-first agent banking | 1 package |
| MCP | `@t2000/mcp` — 25 tools, 16 prompts | 1 package |
| Engine | `@t2000/engine` — QueryEngine, financial tools, MCP client/server | 1 package |
| Adapters | NAVI (MCP reads + thin tx builders for writes) | 1 protocol |
| Contracts | Fee collection, treasury, governance (timelocked) | Sui mainnet |
| Server | Sponsor API, gas station, fee ledger | ECS Fargate |
| Website | Developer hub, infra landing page, stats | Vercel |

**Capabilities:** save, withdraw, borrow, repay, send, pay, claim rewards, balance check, health monitor.

---

## Layer 2: mpp.t2000.ai — The Service Layer ✅ Live

The gateway where AI agents spend USDC on real APIs. 41 services, 90+ endpoints, 9 categories.

| Category | Services | Endpoints |
|----------|----------|-----------|
| AI | OpenAI, Anthropic, Gemini, DeepSeek, Groq, Together, Perplexity | 16 |
| Media | fal.ai, ElevenLabs, Stability AI, Replicate, AssemblyAI | 13 |
| Search | Brave Search, Exa | 7 |
| Web | Firecrawl, Jina Reader, ScreenshotOne | 6 |
| Data | OpenWeather, Google Maps, CoinGecko, Alpha Vantage, NewsAPI | 14 |
| Commerce | Reloadly Gift Cards, Lob | 5 |
| Communication | Resend, DeepL | 3 |
| Compute | Judge0 | 2 |
| Utilities | QR Code, PDFShift, ip-api | 3 |

**How it works:**
1. Agent sends POST to `https://mpp.t2000.ai/{service}/{endpoint}`
2. Gateway returns `402 Payment Required` with MPP challenge
3. Agent pays USDC on Sui (~400ms finality)
4. Gateway verifies on-chain, proxies request to upstream API
5. Agent receives response

**Discovery:** `https://mpp.t2000.ai/llms.txt` — machine-readable service catalog.

---

## Layer 3: suimpp.dev — The Standard 🔶 Planned

The protocol site. Bigger than t2000 — this is the Sui MPP ecosystem.

### What goes here

| Content | Purpose |
|---------|---------|
| Protocol spec | How MPP works on Sui — the charge method, flow, verification |
| Payment explorer | Live feed of all MPP payments on Sui (not just t2000's) |
| Package docs | `@suimpp/mpp` — anyone can accept Sui USDC |
| Gateway guide | "Run your own gateway" for API providers |
| Provider guide | "Accept Sui USDC for your API" |
| Live stats | Protocol-level totals — payments, volume, active services |
| Implementations | Links to gateways (mpp.t2000.ai is the first) |

### What it is NOT

- Not a copy of mpp.t2000.ai (that's the service catalog)
- Not a t2000 product page (that's t2000.ai)
- Not just a landing page — it's the canonical reference for Sui MPP

---

## Site Structure

| Page | Route | Phase | Content |
|------|-------|-------|---------|
| Home | `/` | 1 | Hero + interactive terminal, live payment feed, code blocks, footer |
| Servers | `/servers` | 1 | Registered MPP servers — `mpp.t2000.ai` is first. "Register your server" CTA |
| Spec | `/spec` | 2 | Rendered Sui MPP charge method spec |
| Docs | `/docs` | 2 | Developer guide — pay for APIs / accept payments |
| Explorer | `/explorer` | 3 | Full payment explorer with pagination, tx detail, charts |

Phase 1 ships the homepage + servers page. Nav starts with Servers + GitHub — Spec/Docs/Explorer links appear as those pages ship.

---

## Design System

### Identity: Protocol infrastructure, not product

suimpp.dev must feel different from t2000.ai and mpp.t2000.ai. It's a protocol site.

| Property | t2000.ai | mpp.t2000.ai | suimpp.dev |
|----------|----------|--------------|------------|
| Vibe | Infra / developer | Service catalog | Protocol / spec |
| Background | `#000000` (N900 black) | `#000000` (N900 black) | `#0a0e1a` (deep navy) |
| Accent | `#00d68f` (green) | `#00d68f` (green) | `#60a5fa` (sky blue) |
| Hover | — | — | `#818cf8` (indigo) |
| Font body | Geist Sans | Geist Sans | Geist Sans |
| Font headings | Instrument Serif | Instrument Serif | — |
| Font code/labels | Geist Mono | Geist Mono | Geist Mono |
| Feel | Agentic DS dark | Agentic DS dark | Developer docs |
| Tone | "The engine behind Audric" | "Browse & pay" | "The open standard" |

### Colors

```
--bg:          #0a0e1a    /* deep navy — blue undertone, not pure black */
--surface:     #111827    /* card surfaces */
--border:      #1e293b    /* subtle borders */
--text:        #f1f5f9    /* primary text */
--text-muted:  #94a3b8    /* secondary text */
--accent:      #60a5fa    /* sky blue — primary accent */
--accent-hover: #818cf8   /* indigo — hover/highlight */
```

### Typography

Dual font system — monospace for protocol/code feel, sans-serif for readability:
- **Geist Sans** — body text, headings, navigation
- **Geist Mono** — code, interactive terminal, stats, addresses, prices

No noise texture. Clean flat backgrounds to differentiate from t2000's textured aesthetic.

**Reference sites:** `ethereum.org` (protocol feel), `graphql.org` (spec simplicity), `mpp.dev` (interactive terminal), `stripe.com/docs` (dev infrastructure).

---

## Interactive Terminal

Animated hero component inspired by mpp.dev. Shows the full 402 payment flow step by step.

**Not a video** — rendered HTML with CSS animations. The terminal types out commands and responses appear sequentially.

```
$ curl -X POST https://mpp.t2000.ai/openai/v1/chat/completions \
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello"}]}'

HTTP/1.1 402 Payment Required
WWW-Authenticate: MPP realm="mpp.t2000.ai" method="sui"
  amount="0.01" currency="0xdba3...::usdc::USDC"
  recipient="0x3bb5..." network="mainnet"

── agent pays 0.01 USDC on Sui ──

✓ TX verified on Sui · 380ms
HTTP/1.1 200 OK
Payment-Receipt: sui:eyJ...
{"choices": [{"message": {"content": "Hello! How can I help you?"}}]}
```

Renders on the right side of the hero (desktop) or below the headline (mobile).

---

## User Flows

Three personas visit suimpp.dev:

### Persona A: Developer who wants to pay for APIs with Sui USDC

```
Landing → "Get Started" (scrolls down) → "Pay for APIs" code block →
  → npm install mppx @suimpp/mpp → Code example → [Read docs →]
```

### Persona B: API provider who wants to accept Sui USDC

```
Landing → "Accept USDC" code block →
  → npm install mppx @suimpp/mpp → Server code example → [Run a gateway →]
```

### Persona C: Mysten engineer / ecosystem evaluator

```
Landing → Live stats (proof) → Live payment feed (on-chain txs) →
  → Interactive terminal (protocol demo) → [GitHub ↗]
```

---

## Wireframes & UX

**See `spec/roadmap-mpp.md` Section 6** for the canonical wireframes. It has detailed ASCII wireframes for all 6 pages:

| Page | Wireframe in roadmap-mpp.md |
|------|-----------------------------|
| Homepage (`/`) | Hero + terminal, top servers table, code blocks, footer |
| Servers listing (`/servers`) | Sort/filter, per-server cards with sparklines |
| Server detail (`/servers/:id`) | Stats cards, volume chart, endpoint table, recent payments |
| Explorer (`/explorer`) | Live feed, server leaderboard, cross-server filters |
| Registration (`/register`) | URL input, live validation checks, preview card |
| Agent onboarding (`/agent`) | 4 options — web app, CLI, SDK, MCP |

The wireframes in the roadmap are multi-server aware and supersede the earlier single-server homepage wireframe that was in this doc.

---

## Data Architecture — Option B: Own Database

### Why own DB, not proxy

`suimpp.dev` is an ecosystem aggregator, not a t2000 frontend. It must:
- Ingest payments from **multiple** MPP servers (t2000 gateway is just the first)
- Own its data — not break if one server goes down
- Scale independently of any single gateway

### Database: NeonDB (separate from gateway)

**Models:**

```prisma
model Server {
  id          Int       @id @default(autoincrement())
  name        String
  url         String    @unique
  openapiUrl  String    @map("openapi_url")
  verified    Boolean   @default(false)
  services    Int       @default(0)
  endpoints   Int       @default(0)
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  payments    Payment[]

  @@map("servers")
}

model Payment {
  id        Int      @id @default(autoincrement())
  serverId  Int      @map("server_id")
  server    Server   @relation(fields: [serverId], references: [id])
  service   String
  endpoint  String
  amount    String
  digest    String?  @unique
  sender    String?
  createdAt DateTime @default(now()) @map("created_at")

  @@index([createdAt(sort: Desc)])
  @@index([serverId])
  @@map("payments")
}
```

### Ingestion: Cron pulls from registered servers

Each registered server exposes a payments feed (e.g. `GET /api/mpp/payments`). `suimpp.dev` polls on a cron (every 5 min):

```
For each verified server:
  1. GET {server.url}/api/mpp/payments?since={lastIngested}
  2. Upsert payments into suimpp.dev DB (dedupe by digest)
  3. Update server stats (total payments, volume)
```

**Bootstrap:** `mpp.t2000.ai` is pre-seeded as server #1. Its existing `/api/mpp/payments`, `/api/mpp/stats`, and `/api/mpp/volume` routes already exist and serve data. No gateway changes needed.

### Phase 0: Gateway payment logging ✅ DONE

Already implemented:
- [x] `MppPayment` model in gateway schema (with unique `digest` constraint for replay protection)
- [x] Payment logging in `chargeProxy()` after verification
- [x] `GET /api/mpp/payments` — paginated, filterable by service
- [x] `GET /api/mpp/stats` — aggregate counts and volume
- [x] `GET /api/mpp/volume` — volume over time
- [x] Deployed and collecting data on mainnet

### Homepage Data

| Data | Source | Method |
|------|--------|--------|
| Payment count (all servers) | suimpp.dev DB | ISR (60s revalidate) |
| USDC volume (all servers) | suimpp.dev DB | ISR (60s revalidate) |
| Live feed | suimpp.dev DB (recent payments) | Client-side polling (30s) |
| Server count | suimpp.dev DB | ISR (60s revalidate) |
| Service count | Aggregated from registered servers | ISR (60s revalidate) |
| Settlement time | Hard-coded `~400ms` | Static |

### Extended Data (Phase 2+)

| Data | Source | Method |
|------|--------|--------|
| npm downloads | npm registry API | ISR (daily) |
| Package versions | npm registry API | ISR (daily) |
| Spec content | MDX file in repo | Build-time |
| Per-server stats | suimpp.dev DB | ISR (5min) |
| Per-service breakdown | suimpp.dev DB | ISR (5min) |

---

## API Routes

### Gateway (apps/gateway) — already live ✅

```
GET  /api/mpp/payments          → Recent payments (service, amount, digest, timestamp)
GET  /api/mpp/stats             → Aggregate stats (count, volume, by-service)
GET  /api/mpp/volume            → Volume over time (24h, 7d, 30d)
```

### suimpp.dev (apps/suimpp)

```
GET  /                          → Homepage (ISR)
GET  /servers                   → Server directory (ISR)
GET  /servers/:id               → Server detail — endpoints, pricing, metrics (ISR)
GET  /spec                      → Protocol spec page (static)
GET  /docs                      → Developer docs (static)
GET  /explorer                  → Full payment explorer (client-side)
GET  /register                  → Server registration flow
GET  /llms.txt                  → Machine-readable site descriptor

GET  /api/payments              → Aggregated payments across all servers
GET  /api/stats                 → Protocol-level stats (all servers combined)
GET  /api/servers               → List registered servers with stats

POST /api/cron/ingest           → Cron-triggered payment ingestion from registered servers
```

---

## Implementation Phases

### Phase 0: Payment Logging (prerequisite) — ✅ DONE

Gateway already logs payments with unique digest constraint (replay protection).

- [x] `MppPayment` model in gateway schema (service, endpoint, amount, digest, sender)
- [x] Unique constraint on `digest` field (replay protection)
- [x] Payment logging in `chargeProxy()` after verification
- [x] `GET /api/mpp/payments` — paginated, filterable by service
- [x] `GET /api/mpp/stats` — aggregate counts and volume
- [x] `GET /api/mpp/volume` — volume over time
- [x] Deployed and collecting data on mainnet

### Phase 1: Homepage + Servers — ✅ DONE

**Goal:** Get `suimpp.dev` live with homepage and server directory.

- [x] Create `apps/suimpp` (Next.js app in `mission69b/suimpp` repo)
- [x] Set up NeonDB (separate instance from gateway)
- [x] Prisma schema — `Server` + `Payment` models
- [x] Seed `mpp.t2000.ai` as first registered server
- [x] Install Geist fonts (Sans + Mono)
- [x] Set up Tailwind with navy/blue color palette
- [x] Hero section — headline, stats line, interactive terminal
- [x] Interactive terminal component — animated 402 flow
- [x] Live payment feed — reads from suimpp.dev DB, shows service + amount + Suiscan link
- [x] Two code blocks — "Pay for APIs" + "Accept USDC"
- [x] `/servers` page — server directory with `mpp.t2000.ai` as first entry
- [x] Footer — "Built on Sui", GitHub, npm, mpp.dev, llms.txt
- [x] `/llms.txt` route
- [x] `generateMetadata` for SEO (title, description, OG, Twitter)
- [x] Sitemap generation (`/sitemap.xml`)
- [x] Mobile responsive (terminal stacks below hero on mobile)
- [x] Deploy to Vercel with `suimpp.dev` domain
- [x] Empty state handling (graceful display with few payments)

### Phase 1.5: Rename @mppsui → @suimpp + Library Reporting — ✅ DONE

**Goal:** Rename all packages/repo to `suimpp`, add real-time payment reporting to the library so suimpp.dev gets live data without polling or cron.

**Architecture:** When `@suimpp/mpp` server's `verify()` succeeds, it fire-and-forgets a POST to a configurable `registryUrl` (default: `https://suimpp.dev/api/report`). suimpp.dev receives, validates, stores in its own DB. Real-time, no cron, standard is in the library.

**Block 1 — npm org + GitHub rename**
- [x] Register `@suimpp` npm org
- [x] Rename GitHub repo `mission69b/mppsui` → `mission69b/suimpp`

**Block 2 — Library rename + reporting feature**
- [x] Rename packages: `@mppsui/mpp` → `@suimpp/mpp`, `@mppsui/discovery` → `@suimpp/discovery`, `@mppsui/suimpp` → `@suimpp/web`
- [x] Update CI workflows + publish config for new package names
- [x] Add `registryUrl` option to `@suimpp/mpp` server — fire-and-forget POST after verify
- [x] Publish `@suimpp/mpp@0.3.1` and `@suimpp/discovery@0.2.0` to npm

**Block 3 — suimpp.dev receives reports**
- [x] Add `POST /api/report` endpoint on suimpp.dev — receive, validate, store in Payment table
- [x] Wire up live feed + stats to read from own DB (Payment table)
- [x] Update suimpp.dev site code — package name, code blocks, footer links

**Block 4 — Consumer migration (t2000 monorepo)**
- [x] Update t2000 gateway: `@mppsui/mpp` → `@suimpp/mpp` + configure `registryUrl`
- [x] Update t2000 web-app + SDK + CLI refs

**Block 5 — Cleanup + verification**
- [x] Deprecate `@mppsui/mpp` on npm (0.1.0 + 0.2.0 deprecated; `@mppsui/discovery` needs old token)
- [x] Update all spec references: `@mppsui` → `@suimpp`
- [x] Gateway typecheck passes with `@suimpp/mpp`
- [ ] Verify suimpp.dev live feed populates from gateway reporting after deploy

**Future (Phase 3+):** Add on-chain re-verification of reported digests for trustless multi-server scenarios.

### Phase 2: Spec + Docs — ✅ DONE

**Goal:** Become the canonical reference for Sui MPP.

- [x] `/spec` page — Sui charge method specification (protocol flow, challenge/credential format, verification logic, security considerations)
- [x] `/docs` page — developer guide split into "Pay for APIs" and "Accept Payments" tracks with step-by-step walkthroughs
- [x] Add Spec and Docs nav links
- [x] Code examples with copy buttons (CopyBlock component)
- [x] `suimpp.dev/spec` becomes the URL shared in MPP ecosystem
- [x] Enable redirects on gateway: `/spec` → `suimpp.dev/spec`, `/docs` → `suimpp.dev/docs`

### Phase 3: Full Explorer — ✅ DONE

**Goal:** On-chain proof that machine payments are real.

- [x] `/explorer` page with full payment table (pagination, sort, filter by server)
- [x] Payment detail view — tx digest + sender linked to Suiscan, amount, time with hover for absolute date
- [x] Per-server breakdown chart (stacked bar + legend with txn count and volume)
- [x] Volume over time bar chart (daily aggregation across all servers, hover tooltips)
- [x] Add Explorer nav link
- [x] `/api/explorer` endpoint — paginated, filterable payments
- [x] `/api/explorer/stats` endpoint — totals, per-server breakdown, daily volume timeline

### Phase 4: Server Registration — ✅ DONE

- [x] `/register` page — paste URL, fetch OpenAPI, run `@suimpp/discovery` validation
- [x] Live-preview pattern — render endpoints + pricing inline
- [x] Pass/fail validation checks in real-time
- [x] Enable "Register" button only once validation passes
- [x] Server detail page — `/servers/:id` with endpoints, pricing, metrics
- [x] Multi-server aggregation in explorer (already supported by DB schema)

---

## Visual Elements

### Interactive Terminal (Phase 1)

CSS animations, not a video. Sequence: cursor blinks → `curl` types out → pause → `402` response appears → `WWW-Authenticate` highlighted → divider → `✓ TX verified · 380ms` (green) → `200 OK` with JSON → loop or hold.

Renders on the right side of the hero (desktop) or below the headline (mobile).

---

## Considerations

| Item | Notes |
|------|-------|
| **OG image** | Navy background, sky blue text — "Machine Payments on Sui" with stats |
| **llms.txt** | Serve at `suimpp.dev/llms.txt` — agents discover the standard too |
| **Mobile** | Terminal stacks below hero. Feed shows 5 items (10 on desktop). Two code blocks stack vertically |
| **Empty states** | If < 10 payments, show them with "Early adopter" badge. No "no data" screens |
| **Footer** | "Built on Sui" — NOT "Built by t2000". Reinforce ecosystem positioning |
| **Provider onboarding** | Phase 4. Start with GitHub PR template. No self-serve portal yet |
| **MPP spec content** | Use the Sui charge method spec submitted to `tempoxyz/mpp-specs` repo |

---

## Deployment

| Item | Value |
|------|-------|
| App | `apps/suimpp` (separate Next.js app) |
| Domain | `suimpp.dev` (registered ✅) |
| Hosting | Vercel |
| Database | NeonDB (separate instance from gateway) |
| Data | Own DB — cron ingests from registered servers |
| Build | ISR for stats, static for spec/docs |
| Repo | Same monorepo (`/Users/funkii/dev/t2000`) |

**Why separate app** (not expanding `apps/gateway`):
- Different audience (ecosystem builders vs API consumers)
- Different design system (navy/blue vs black/green)
- Clean separation matches the 3-layer story
- When Mysten looks at it, it feels like protocol infrastructure, not a product pitch

---

## Mysten Angle

### Why this matters for the Sui ecosystem

1. **First production MPP implementation on Sui** — not a hackathon demo, real payments flowing
2. **On-chain proof** — every payment is verifiable on Suiscan
3. **Open standard** — `@suimpp/mpp` is published on npm, anyone can use it
4. **Agent-native** — designed for AI agents, not humans clicking buttons
5. **USDC on Sui** — demonstrates Sui as a viable payment rail for machine commerce

### What we need from Mysten

| Ask | Why |
|-----|-----|
| Ecosystem listing | List `@suimpp/mpp` and `suimpp.dev` on Sui ecosystem page |
| Technical review | Validate the Sui charge method spec |
| Amplification | RT/share when suimpp.dev launches |
| Faucet integration | Help with testnet faucet for developer onboarding |
| SUI grants | Fund further development of the open standard |

### The pitch

> "We built the first working implementation of machine payments on Sui.
> 40 services, 88 endpoints, real USDC flowing on mainnet.
> suimpp.dev is the open standard — anyone can accept Sui USDC for their API.
> We want Sui to be THE chain for agent payments."

---

## Build Priority

The live payment feed on the homepage IS the explorer for Phase 1. No separate page needed until there's enough activity to justify it.

| Order | What | Effort | Impact |
|-------|------|--------|--------|
| **Phase 0** | Payment logging in gateway | ~~1 day~~ | ✅ DONE |
| **Phase 1** | Homepage + servers + own DB | ~~3-4 days~~ | ✅ DONE |
| **Phase 1.5** | Rename @mppsui → @suimpp + library reporting | ~~1-2 days~~ | ✅ DONE |
| **Phase 2** | Spec + Docs | ~~2-3 days~~ | ✅ DONE |
| **Phase 3** | Full Explorer | ~~3-4 days~~ | ✅ DONE |
| **Phase 4** | Server registration | 2-3 days | Platform play |

**Total: ~2 weeks for full build. Phase 1 ships in 3-4 days.**
