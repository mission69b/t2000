# MPP Gateway v2 — mpp.t2000.ai Enhancements

> Absorb the best ideas from suimpp.dev into the gateway. Payment logging, live feed, explorer, docs — all on mpp.t2000.ai.

---

## Context

We decided to defer `suimpp.dev` as a separate site until there's real ecosystem activity (other gateways, providers using `@t2000/mpp-sui`). Instead, we're adding the high-value features directly to `mpp.t2000.ai`.

### What exists today

| Feature | Status |
|---------|--------|
| Service directory with search, categories, card/list toggle | ✅ |
| 35 services, 79 endpoints across 9 categories | ✅ |
| `GET /api/services` JSON catalog | ✅ |
| `GET /llms.txt` agent-readable catalog | ✅ |
| Copy service URL to clipboard | ✅ |
| Custom 404 page for direct browser visits | ✅ |
| Vercel Analytics | ✅ |

### What we're adding

| Feature | Why | Phase |
|---------|-----|-------|
| Payment logging | Prerequisite for everything below | 0 |
| Homepage + services split: pitch page (`/`) + catalog (`/services`) + terminal demo | Focused first impression. Answer 3 questions in 3s. Services get their own page. | 1 |
| Explorer page (`/explorer`) | Deep-dive: full payment history with search, filters, Suiscan links, charts | 2 |
| Protocol spec page (`/spec`) | Make mpp.t2000.ai the reference for how MPP works on Sui | 3 |
| Developer docs (`/docs`) | "Pay for APIs" and "Accept payments" guides | 3 |
| 13 new Track A services (→ 48 total) | Wider coverage, viral stories, new categories | Ongoing |

---

## Phase 0: Payment Logging — 1-2 days

**Goal:** Log every MPP payment so we have data for the feed and explorer.

### Prerequisites

**The gateway currently has NO database.** It's entirely stateless — `chargeProxy()` in `lib/gateway.ts` proxies requests and `mppx` handles payments. We need to:

1. Add Prisma + a database to `apps/gateway`
2. Use a **separate NeonDB** instance for the gateway (not the existing NeonDB used by the banking stack)

**Why separate DB?** The existing NeonDB holds banking data (agents, transactions, gas ledger, yield snapshots). Payment logging is conceptually different. Keeping them separate means the gateway DB can migrate cleanly to `suimpp.dev` later if needed.

**Status:** `DATABASE_URL` already added to `apps/gateway/.env.local`.

### Database setup

**Step 1: Add Prisma to gateway**

```bash
pnpm add prisma @prisma/client --filter @t2000/gateway
```

**Step 2: Create schema**

```prisma
// apps/gateway/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model MppPayment {
  id        Int      @id @default(autoincrement())
  service   String
  endpoint  String
  amount    String   // string amount (e.g. "0.01") to match chargeProxy input
  digest    String?  // tx digest — nullable until Payment-Receipt parsing confirmed
  sender    String?  // sender address — nullable until Payment-Receipt parsing confirmed
  createdAt DateTime @default(now()) @map("created_at")

  @@index([createdAt(sort: Desc)])
  @@index([service])
  @@map("mpp_payments")
}
```

**Step 3: Run migration**

```bash
cd apps/gateway
npx prisma migrate dev --name init
npx prisma generate
```

For production deploys, add `DATABASE_URL` to Vercel environment variables and run `npx prisma migrate deploy` once against production, or add it to the Vercel build command.

**Step 4: Prisma client singleton**

```typescript
// apps/gateway/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

This avoids creating new connections on every Vercel serverless invocation (hot module reloading in dev, connection reuse in prod). NeonDB supports serverless drivers natively so no pooling proxy needed.

### chargeProxy() change

**Problem:** `chargeProxy()` currently wraps everything in a single `mppx.charge({ amount })(handler)(request)` call. This is a black box — we don't get access to the payment digest or sender address. The function also doesn't know which "service" or "endpoint" it's proxying (it only receives the upstream URL).

**Solution:** Add `service` and `endpoint` params. Extract digest from the `Payment-Receipt` response header that mppx adds on successful payment.

```typescript
export function chargeProxy(
  amount: string,
  upstream: string,
  upstreamHeaders: Record<string, string>,
  options?: ProxyOptions & { service?: string; endpoint?: string },
): RouteHandler {
  return async (req: Request) => {
    const mppx = getGateway();
    const bodyText = await req.text();
    const method = options?.upstreamMethod ?? 'POST';

    const handler: RouteHandler = async () => {
      // ... existing proxy logic (unchanged) ...
    };

    const response = await mppx.charge({ amount })(handler)(
      new Request(req.url, { method: req.method, headers: req.headers })
    );

    // Log successful payments (non-402 responses)
    if (response.status !== 402 && options?.service) {
      const receipt = response.headers.get('Payment-Receipt');
      logPayment({
        service: options.service,
        endpoint: options.endpoint ?? new URL(req.url).pathname,
        amount,
        digest: parseReceiptDigest(receipt),  // best-effort, may be null
      }).catch(() => {});  // fire-and-forget
    }

    return response;
  };
}
```

**Route file changes:** Each route file adds `service` and `endpoint` to the options:

```typescript
// Before
export const POST = chargeProxy('0.01', 'https://api.openai.com/v1/chat/completions', {
  authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
});

// After — add service/endpoint for logging
export const POST = chargeProxy('0.01', 'https://api.openai.com/v1/chat/completions', {
  authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
}, { service: 'openai', endpoint: '/v1/chat/completions' });
```

This touches ~89 route files but it's a mechanical change (add 4th argument).

**Alternative (simpler, no route changes):** Infer service/endpoint from the request URL path instead:

```typescript
// Inside chargeProxy, after successful response
const url = new URL(req.url);
const parts = url.pathname.split('/').filter(Boolean);
const service = parts[0];  // "openai"
const endpoint = '/' + parts.slice(1).join('/');  // "/v1/chat/completions"
```

This avoids touching 89 files. The URL path already IS the service/endpoint. **Recommend this approach.**

### Payment-Receipt header parsing

mppx adds a `Payment-Receipt` header on successful payments. **Before starting Phase 0, make a real MPP payment and inspect the header format.** We need the Sui transaction digest for Suiscan links.

```typescript
// lib/receipt.ts
function parseReceiptDigest(receipt: string | null): string | null {
  if (!receipt) return null;
  try {
    // Step 1: Inspect actual header format from mppx (base64 JSON? structured header?)
    // Step 2: Extract digest field
    // Step 3: Validate it looks like a Sui digest (44-char base64)
    const parsed = JSON.parse(Buffer.from(receipt, 'base64').toString());
    return parsed.digest ?? parsed.txDigest ?? null;
  } catch {
    return null;
  }
}
```

**Action item:** Run `t2000 pay <any-mpp-url>` with verbose logging, capture the `Payment-Receipt` response header, and update this parser accordingly. If the digest isn't in the header, check if `mppx` exposes it elsewhere.

### Logging utility

```typescript
// lib/log-payment.ts
import { prisma } from './prisma';

export async function logPayment(data: {
  service: string;
  endpoint: string;
  amount: string;
  digest: string | null;
}) {
  await prisma.mppPayment.create({
    data: {
      service: data.service,
      endpoint: data.endpoint,
      amount: data.amount,
      digest: data.digest,
    },
  });
}
```

Fire-and-forget — don't block the API response. Wrap in try/catch so logging failures never break payment flow.

### New API routes

```
GET /api/mpp/payments?limit=20&offset=0&service=openai

Response: {
  payments: [
    {
      service: "openai",
      endpoint: "/v1/chat/completions",
      amount: "0.01",
      digest: "abc123..." | null,
      createdAt: "2026-03-21T10:30:00Z"
    }
  ],
  total: 847,
  hasMore: true
}
```

```
GET /api/mpp/stats

Response: {
  totalPayments: 847,
  totalVolume: "412.50",
  services: [
    { service: "openai", count: 312, volume: "156.00" },
    { service: "brave", count: 201, volume: "1.01" }
  ]
}
```

Keep it simple — two routes. No single-payment detail route for now (add it when explorer needs it).

**Rate limiting & caching:**
- `/api/mpp/stats` — cache in-memory for 60s (or use Next.js `revalidate: 60`). This endpoint will be hit by every homepage visitor.
- `/api/mpp/payments` — cap `limit` param at 50 max. No caching needed (paginated, low frequency).
- Both routes are public (no auth) — acceptable since they only expose aggregate/payment data, no sensitive info.

### Checklist

- [x] Add `prisma` + `@prisma/client` dependencies to gateway
- [x] Create `apps/gateway/prisma/schema.prisma` with `MppPayment` model
- [x] Run `npx prisma migrate dev --name init` (DATABASE_URL already in .env.local)
- [x] Add `lib/prisma.ts` singleton client
- [x] Add `lib/log-payment.ts` utility
- [x] Add `lib/receipt.ts` — inspect actual `Payment-Receipt` header format from mppx
- [x] Modify `chargeProxy()` to infer service/endpoint from URL path and log after success
- [x] `GET /api/mpp/payments` route with pagination + service filter (limit capped at 50)
- [x] `GET /api/mpp/stats` route (counts + volume, 60s cache)
- [x] Add `DATABASE_URL` to Vercel project env vars
- [x] Add `npx prisma generate` to Vercel build command
- [x] Run `npx prisma migrate deploy` against production (migration applied via `migrate dev`)
- [x] Test: make a real payment, verify it appears in API
- [x] Deploy gateway update

---

## Phase 1: Homepage + Services Split — 3-4 days

**Goal:** Split the current page into two: a focused homepage (`/`) that tells the story, and a dedicated services catalog (`/services`). The homepage should answer three questions in 3 seconds: what is this, is it real, and how easy is it.

### Why split?

The current page tries to be everything — catalog, pitch, docs. The services directory (35 expandable cards with search, filters, endpoint tables) dominates the page and buries the compelling parts (live feed, terminal demo). Great product pages (Stripe, Vercel, Linear) don't dump the full catalog on the homepage — they hook you and let you explore.

- **Homepage (`/`)** = the pitch. Focused, one screen, no scrolling through 35 services.
- **Services (`/services`)** = the catalog. Full directory with search, filters, cards. What the current homepage is today.

### Homepage layout (`/`)

```
┌──────────────────────────────────────────────────────────────────┐
│  mpp.t2000.ai                        Services · Explorer · Docs  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Machine Payment Protocol                                        │
│  Pay-per-request APIs on Sui. No keys, no accounts.             │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  847 payments  ·  $412 USDC  ·  35 services  ·  ~400ms   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌ Live ●─────────────────────────────────────────────────────┐  │
│  │ 2s ago   OpenAI    /v1/chat/completions    0.01 USDC    ↗ │  │
│  │ 14s ago  Brave     /v1/web/search          0.005 USDC   ↗ │  │
│  │ 32s ago  fal.ai    flux-pro                0.03 USDC    ↗ │  │
│  │ 1m ago   Lob       /v1/postcards           1.00 USDC    ↗ │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ terminal ─────────────────────────────────────────────────┐  │
│  │ $ t2000 pay .../lob/v1/postcards                           │  │
│  │   --data '{"to":{"name":"Mom",...},"message":"Miss you"}'  │  │
│  │                                                            │  │
│  │ ✓ Paid 1.50 USDC  ·  Tx: FjhtzF...R5AC (0.4s)           │  │
│  │ { "id": "psc_xxx", "carrier": "USPS" }                    │  │
│  │                                                            │  │
│  │ No API key. No signup. One command.                        │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              ● ○ ○ ○                             │
│                                                                  │
│  ┌──────────────────┐  ┌───────────────┐  ┌────────────────────┐│
│  │ 35 services       │  │ Browse all →  │  │ npm i -g @t2000/cli││
│  │ 9 categories      │  │               │  │ t2000 init         ││
│  └──────────────────┘  └───────────────┘  └────────────────────┘│
│                                                                  │
│  Powered by MPP + Sui                                            │
└──────────────────────────────────────────────────────────────────┘
```

**The flow:**
1. **Hero** — what is this (title + one-liner)
2. **Stats bar** — is it real (payment count, volume, service count, speed)
3. **Live feed** — prove it (real payments streaming)
4. **Terminal demo** — how easy is it (command → response, no signup)
5. **CTA** — what next ("Browse all →" links to `/services`, install snippet)

Everything fits on one screen (or minimal scroll on mobile). No catalog clutter.

### Services page layout (`/services`)

Move the current homepage content here. This is the full catalog:

```
┌──────────────────────────────────────────────────────────────────┐
│  mpp.t2000.ai                        Services · Explorer · Docs  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Services                                                        │
│  35 services · 79 endpoints · Sui USDC                          │
│                                                                  │
│  [search...]                                        [list|grid]  │
│  [AI & LLMs] [Media] [Search] [Commerce] ...                     │
│                                                                  │
│  OpenAI           4 endpoints    $0.005–$0.05                    │
│  Anthropic        2 endpoints    $0.005–$0.05                    │
│  Brave            2 endpoints    $0.005                          │
│  ...                                                             │
│                                                                  │
│  (sidebar: Use with t2000 — Install, CLI, SDK, MCP)             │
└──────────────────────────────────────────────────────────────────┘
```

This is essentially the current `page.tsx` moved to `/services/page.tsx` with no changes except removing the "How it works" section (replaced by the homepage terminal demo).

### Navigation

```
mpp.t2000.ai                        Services · Explorer · Docs
```

- **Home** = `/` (click `mpp.t2000.ai` logo)
- **Services** = `/services` (full catalog)
- **Explorer** = `/explorer` (Phase 2)
- **Docs** = `/docs` (Phase 3, links to t2000.ai/docs until ready)

### Hero section

```
Machine Payment Protocol
Pay-per-request APIs on Sui. No keys, no accounts.
```

- Title: `text-xl font-medium`
- Subtitle: `text-sm text-muted`
- Minimal — no images, no background, just text. Consistent with the existing design.

### Stats bar

```
┌──────────────────────────────────────────────────────────────┐
│  847 payments  ·  $412 USDC  ·  35 services  ·  ~400ms      │
└──────────────────────────────────────────────────────────────┘
```

- Geist Mono, small text (`text-xs`), muted color
- Fetched from `/api/mpp/stats` via ISR (60s revalidate) or client-side with `useQuery`
- `35 services` is hardcoded from `services.length` (already available)
- Falls back to `—` if API is down (never show 0 if it's a fetch error)

### Live payment feed

```
┌──────────────────────────────────────────────────────────────┐
│  Live ●                                                      │
│                                                              │
│  2s ago   OpenAI    /v1/chat/completions    0.01 USDC    ↗  │
│  14s ago  Brave     /v1/web/search          0.005 USDC   ↗  │
│  32s ago  fal.ai    flux-pro                0.03 USDC    ↗  │
│  1m ago   Lob       /v1/postcards           1.00 USDC    ↗  │
│  2m ago   DeepL     /v1/translate           0.005 USDC   ↗  │
└──────────────────────────────────────────────────────────────┘
```

- Green dot (●) pulses when connected
- ↗ links to Suiscan transaction page (only if `digest` is available)
- Shows last 5 payments
- Client-side polling every 30s from `/api/mpp/payments?limit=5`
- Relative timestamps ("2s ago", "1m ago")
- New payments animate in from the top (subtle slide)

**Empty state:** "Waiting for first payment..." with a subtle pulse animation. Not a blank void.

### Terminal demo

The centerpiece of the homepage. Cycles through real command + response examples — the "oh shit, that's it?" moment.

```
┌─ terminal ───────────────────────────────────────────────────┐
│                                                              │
│  $ t2000 pay https://mpp.t2000.ai/lob/v1/postcards \        │
│      --data '{"to":{"name":"Mom",...},"message":"Miss you"}' │
│                                                              │
│  ✓ Paid 1.50 USDC  ·  Tx: EXJvQd...sygq (0.4s)            │
│                                                              │
│  { "id": "psc_xxx", "carrier": "USPS",                      │
│    "expected_delivery": "Mar 28" }                           │
│                                                              │
│  No API key. No signup. One command.                         │
│                                                              │
└──────────────────────────────────────────────────────────────┘

    ● ○ ○ ○   (dots cycling through 4 examples)
```

**4 rotating examples** (auto-cycle every ~8 seconds, clickable dots to jump):

Pick examples that tell a *story* — things that feel tangible, not abstract API calls.

1. **Mail a postcard** — physical object in the real world
   ```
   $ t2000 pay https://mpp.t2000.ai/lob/v1/postcards \
       --data '{"to": {"name": "Mom", "address": "379 University Ave..."}, "message": "Miss you!"}'

   ✓ Paid 1.50 USDC  ·  Tx: EXJvQd...sygq (0.4s)
   { "id": "psc_xxx", "carrier": "USPS", "expected_delivery": "Mar 28" }
   ```

2. **Buy a gift card** — agent buying something for the user
   ```
   $ t2000 pay https://mpp.t2000.ai/reloadly/v1/order \
       --data '{"productId": 4521, "unitPrice": 25, "recipientEmail": "me@email.com"}'

   ✓ Paid 26.25 USDC  ·  Tx: FjhtzF...R5AC (0.5s)
   { "cardNumber": "XXXX-XXXX-XXXX", "brand": "Uber Eats", "value": "$25.00" }
   ```

3. **Generate an image** — creative output from a prompt
   ```
   $ t2000 pay https://mpp.t2000.ai/fal/v1/image \
       --data '{"prompt": "a neon-lit Tokyo alley in the rain, cyberpunk"}'

   ✓ Paid 0.03 USDC  ·  Tx: 6aivNU...BjZv (0.3s)
   { "url": "https://fal.ai/output/abc123.png", "seed": 42 }
   ```

4. **Order a custom t-shirt** — merch printed and shipped
   ```
   $ t2000 pay https://mpp.t2000.ai/printful/v1/orders \
       --data '{"product_id": 71, "design_url": "https://...", "ship_to": {...}}'

   ✓ Paid 18.50 USDC  ·  Tx: HnqYvR...k4Lm (0.4s)
   { "id": "ord_xxx", "status": "pending", "estimated_ship": "Mar 26" }
   ```

Each example ends with the tagline: **No API key. No signup. One command.**

**Why these 4:** They span the range of what agents can do — physical mail, commerce, creative AI, and merch. Each one is something tangible a person can relate to, not just "here's some JSON." When Wave 7a ships (Suno, Heygen, Twilio), swap in the best ones (e.g., "compose a song" or "send me a text").

**Design notes:**
- Terminal styling: dark bg (`bg-panel`), Geist Mono, subtle border
- Typing animation on the command (optional — adds polish but not required)
- Fade transition between examples
- Dots below to indicate which example is showing (clickable)

### Bottom CTA

Bridge between the homepage pitch and the catalog:

```
┌──────────────────┐  ┌───────────────┐  ┌────────────────────┐
│ 35 services       │  │ Browse all →  │  │ npm i -g @t2000/cli│
│ 9 categories      │  │               │  │ t2000 init         │
└──────────────────┘  └───────────────┘  └────────────────────┘
```

- Left: quick stats (service count, categories)
- Center: "Browse all →" links to `/services`
- Right: install snippet with copy button
- Compact, single row on desktop. Stacks on mobile.

### What to defer

- **Interactive playground** (real payments) — Phase 3+ at earliest
- **Per-service card examples** — not now, the service cards are clean
- **`/examples` or `/recipes` page** — build after Wave 7a ships (Suno, Heygen, Twilio). Once "my agent composed a song" exists, a recipes page writes itself.

### Implementation

- New `app/page.tsx` — homepage (hero + stats + feed + demo + CTA)
- Move current `app/page.tsx` → `app/services/page.tsx` (remove "How it works" section, keep everything else)
- Stats bar: fetches `/api/mpp/stats` with ISR or client-side `useQuery`
- Live feed: client component with `useQuery` + `refetchInterval: 30000`
- Terminal demo: client component with `useState` cycling through 4 examples
- Relative time: small utility function (`formatRelativeTime`)
- Keep existing design system (same fonts, colors, spacing)
- No new dependencies (TanStack Query is already in the monorepo)

### Checklist

- [x] Move current `page.tsx` → `services/page.tsx`
- [x] Remove "How it works" from services page
- [x] New homepage `page.tsx` (hero + stats + feed + terminal demo + CTA)
- [x] Update header nav: `Services · Explorer · Docs`
- [x] Stats bar component (fetches `/api/mpp/stats`)
- [x] Live payment feed component (polls `/api/mpp/payments?limit=5`)
- [x] Terminal demo component (4 rotating examples, auto-cycle ~8s, dot navigation)
- [x] Bottom CTA component (stats + "Browse all →" + install)
- [x] Relative time formatting utility
- [x] Empty state handling (feed)
- [x] New payment slide-in animation
- [x] Mobile responsive (all sections stack naturally)
- [x] Test with real payment data
- [x] Deploy

---

## Phase 2: Explorer Page — 3-4 days

**Goal:** Full payment explorer at `mpp.t2000.ai/explorer`.

### Route: `/explorer`

A dedicated page for browsing all MPP payment history.

```
┌──────────────────────────────────────────────────────────────┐
│  mpp.t2000.ai                          Services · Explorer   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Payment Explorer                                            │
│  847 payments · $412.50 USDC total                          │
│                                                              │
│  [Search by digest or address...]   [All services ▾]        │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Time          Service    Endpoint              Amount  │  │
│  │ Mar 21 10:30  OpenAI     /v1/chat/completions  $0.01  │  │
│  │ Mar 21 10:29  Brave      /v1/web/search        $0.005 │  │
│  │ Mar 21 10:28  fal.ai     flux-pro              $0.03  │  │
│  │ Mar 21 10:25  Lob        /v1/postcards         $1.00  │  │
│  │ ...                                                    │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ← 1 2 3 ... 43 →                                           │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ Volume (7d)      │  │ By Service      │                   │
│  │  ▁▂▃▅▇▆▄        │  │  OpenAI   37%   │                   │
│  │                  │  │  Brave    24%   │                   │
│  └─────────────────┘  │  fal.ai   12%   │                   │
│                        └─────────────────┘                   │
└──────────────────────────────────────────────────────────────┘
```

### Features

| Feature | Details |
|---------|---------|
| Payment table | Sortable by time, service, amount. Paginated (20 per page) |
| Search | By transaction digest or sender address |
| Service filter | Dropdown to filter by service |
| Suiscan links | Every row links to the on-chain transaction |
| Volume chart | 7-day payment volume line chart (simple, no heavy library) |
| Service breakdown | Pie/bar chart showing % by service |
| Payment detail | Click a row → slide-out or modal with full tx info |

### Navigation

Explorer link already added to header nav in Phase 1 (`Services · Explorer · Docs`). Services page remains the default `/` route. Explorer is the deep-dive for power users — anyone who wants to search specific transactions, filter by date, or see volume charts.

### Checklist

- [ ] `/explorer` page route
- [ ] Payment table with pagination
- [ ] Search by digest / address
- [ ] Service filter dropdown
- [ ] Suiscan link for each row
- [ ] Volume chart (7d) — lightweight, CSS or small chart lib
- [ ] Service breakdown chart
- [ ] Payment detail view (click to expand)
- [ ] Add Explorer to nav
- [ ] Mobile responsive
- [ ] Deploy

---

## Phase 3: Spec + Docs Pages — 2-3 days

**Goal:** Make mpp.t2000.ai the reference for MPP on Sui.

### Route: `/spec`

Rendered version of the Sui MPP charge method spec (the one submitted to `tempoxyz/mpp-specs`).

- MDX rendered with proper code highlighting
- Clean, readable layout
- Copy buttons on code blocks
- This becomes the URL you share: "here's how MPP works on Sui"

### Route: `/docs`

Developer guide split into two paths:

**"Pay for APIs"** (consumer side):
1. Install `mppx` + `@t2000/mpp-sui`
2. Configure wallet
3. Make a payment — code example
4. Browse services at mpp.t2000.ai

**"Accept Payments"** (provider side):
1. Install `@t2000/mpp-sui`
2. Set up `chargeProxy()`
3. Define your endpoints
4. Register with the gateway (or run your own)

### Navigation update

```
Services · Explorer · Spec · Docs
```

### Checklist

- [ ] `/spec` page — render MPP charge method spec (MDX)
- [ ] `/docs` page — two-track developer guide
- [ ] Code examples with copy buttons
- [ ] Update nav with Spec + Docs links
- [ ] Mobile responsive
- [ ] Deploy

---

## Phase 4: Expand Track A Services — Ongoing

**Goal:** 35 → 50+ services. Prioritize services that tell compelling real-world stories on Twitter/X over generic API proxies.

### Wave 7a: Viral-worthy services (priority)

Services that make people say "wait, an AI agent did THAT?"

| # | Service | The tweet | What actually happens | API | Price | Difficulty |
|---|---------|-----------|----------------------|-----|-------|------------|
| 36 | **Suno** | "My agent composed a song about Sui" | AI music generation — full tracks from text prompts | `api.suno.ai` | $0.05/song | Medium |
| 37 | **Heygen** | "My agent made a video of me presenting" | AI avatar video from text script | `api.heygen.com` | $0.10/video | Medium |
| 38 | **Runway** | "My agent turned my photo into a video" | Image-to-video, text-to-video generation | `api.runwayml.com` | $0.05/gen | Medium |
| 39 | **Twilio SMS** | "My agent texts me when my portfolio hits $1K" | Real SMS to user's phone | `api.twilio.com` | $0.02/msg | Medium |
| 40 | **Pushover** | "My agent sends push notifications to my phone" | Instant push notifications | `api.pushover.net` | $0.005/msg | Easy |
| 41 | **Amadeus** | "My agent found me flights to Tokyo for $400" | Flight search + pricing (not booking) | `api.amadeus.com` | $0.01/search | Medium |

**Twilio revisit:** Phone provisioning was the blocker before. Solution: provision a single shared sender number for the gateway. Users provide their own phone number in the request. No per-user provisioning needed.

### Wave 7b: Utility services (fill gaps)

Useful capabilities, less flashy but agents need them.

| # | Service | What it unlocks | API | Price | Difficulty |
|---|---------|----------------|-----|-------|------------|
| 42 | **Mistral** | European AI models (Mistral Large, Codestral) | `api.mistral.ai` | $0.005/req | Easy |
| 43 | **Cohere** | Embeddings, reranking, RAG-optimized | `api.cohere.com` | $0.005/req | Easy |
| 44 | **Remove.bg** | Background removal from any image | `api.remove.bg` | $0.01/req | Easy |
| 45 | **VirusTotal** | URL/file security scanning | `virustotal.com/api` | $0.01/req | Easy |
| 46 | **ExchangeRate** | Forex rates for 140+ currencies | `v6.exchangerate-api.com` | $0.005/req | Easy |
| 47 | **Postmark** | Transactional email (high deliverability) | `api.postmarkapp.com` | $0.005/email | Easy |
| 48 | **Short.io** | URL shortening with analytics | `api.short.io` | $0.005/req | Easy |

### Reloadly storytelling (already live — needs better UX)

Reloadly is live with gift cards for 140+ countries. The agent can buy:
- **Uber/Uber Eats** gift cards → "My agent bought me dinner"
- **Amazon** gift cards → "My agent bought me a book"
- **Starbucks** gift cards → "My agent bought me coffee"
- **Netflix/Spotify** gift cards → "My agent paid for my Netflix"
- **Steam/PlayStation** gift cards → "My agent bought me a game"

**Friction reduction — email delivery + clickable links:**

The order endpoint already supports `recipientEmail`. When provided, Reloadly sends the user a formatted HTML email with a "Redeem Now" button. No code to copy-paste.

```json
{
  "productId": 12345,
  "unitPrice": 25,
  "countryCode": "US",
  "recipientEmail": "user@email.com"
}
```

For the agent's response, construct clickable redemption links for major brands:

| Brand | Redemption URL pattern |
|-------|----------------------|
| Amazon | `https://www.amazon.com/gc/redeem?claimCode={code}` |
| Google Play | `https://play.google.com/redeem?code={code}` |
| Others | Fall back to showing the code + Reloadly's `redeemInstruction.concise` field |

**Ideal agent response format:**

```
Here's your $25 Uber Eats gift card:

Code: XXXX-XXXX-XXXX-XXXX
PIN: 1234

Redeem: https://www.ubereats.com/redeem?code=XXXX-XXXX

I've also emailed it to user@email.com.
```

| Approach | User steps | Friction |
|----------|-----------|---------|
| Code only (current) | Copy code → open app → find settings → paste → order | High |
| Email delivery | Open email → click "Redeem" → order | Low |
| Clickable link | Click link → order | Low |

**Implementation:** No gateway changes needed. This is agent response formatting — update the MCP `t2000_pay` tool response to include `recipientEmail` guidance in the Reloadly service description, and add a redemption URL lookup table to the MCP prompt for gift card orders. The `/reloadly/v1/order` route already passes `recipientEmail` through to Reloadly.

### Per-service checklist (template)

- [ ] Register upstream API key
- [ ] Create route file(s) in `apps/gateway/app/{service}/`
- [ ] Add to `lib/services.ts` registry
- [ ] Set pricing
- [ ] Test with real payment
- [ ] Update service count in homepage, llms.txt, api/services

---

## Technical Notes

### Database

Gateway gets its own **NeonDB** instance (separate from the banking stack NeonDB). One Prisma schema, one table (`MppPayment`). `DATABASE_URL` already configured in `apps/gateway/.env.local`. The existing NeonDB holds agents, transactions, gas ledger, yield snapshots — conceptually different data. Keeping them separate means the gateway DB can migrate cleanly to `suimpp.dev` later if needed.

### Prisma on Vercel (serverless)

- Use the Prisma singleton pattern (`lib/prisma.ts`) to avoid exhausting connections
- Add `DATABASE_URL` to Vercel project environment variables for production
- Add `npx prisma generate` to the Vercel build command so the client is available at runtime
- NeonDB supports serverless natively — no cold start or pooling issues

### Performance

- Payment logging is fire-and-forget (non-blocking, try/catch wrapped)
- `/api/mpp/stats` — cache for 60s (Next.js `revalidate` or in-memory). This gets hit by every homepage visitor.
- `/api/mpp/payments` — cap `limit` at 50. No caching needed (paginated, low frequency).
- Live feed polling at 30s is gentle — even at 1000 concurrent viewers, that's ~33 req/s to the payments API
- No need for cursor-based pagination until we have 10k+ payments

### chargeProxy() scope of change

`chargeProxy()` is used by ~89 route files. The recommended approach (infer service/endpoint from URL path) means we only modify `lib/gateway.ts` — no route file changes needed. Same for `chargeCustom()`.

### Incremental rollout

Each phase ships independently. Phase 0 is invisible to users (backend only). Phase 1 splits the homepage and adds new components but the services catalog stays intact at `/services`. Phase 2-3 are new routes that don't affect existing functionality.

### Infrastructure

- No server/indexer changes needed — those are for the banking stack (ECS Fargate)
- Gateway stays on Vercel
- MCP tools (`t2000_services`, `t2000_pay`) don't need changes — they already work with the gateway
- No SDK/CLI changes needed

### What we're NOT building (deferred)

| Feature | Why deferred |
|---------|-------------|
| Separate suimpp.dev site | No ecosystem activity yet to justify |
| Provider self-serve onboarding | Wait for demand |
| Multi-gateway aggregation | Only one gateway exists |
| Different design system | Stays consistent with existing mpp.t2000.ai |
| Track B (BYOK) services | Deferred per SERVICES_ROADMAP.md |
| Single payment detail page | Add when explorer needs it |
| Sender address logging | Add when Payment-Receipt parsing is confirmed |

---

## Housekeeping (parallel with any phase)

| Task | Notes |
|------|-------|
| Update `SUI_PAYMENTS_HUB.md` | Mark suimpp.dev as deferred, note features absorbed into gateway |
| Update `t2000-roadmap-v2.md` | Add Gateway v2 phases to roadmap, update priorities |
| Update root `README.md` | Add gateway features (explorer, live feed) to MPP section |
| Commit spec files to git | `SUI_PAYMENTS_HUB.md` and `mysten-strategy.md` are still untracked |

### `t2000 history` UX improvement (follow-up)

The current CLI history output is minimal and doesn't tell a useful story:

```
  Transaction History

  EXJvQd...sygq  transaction  21/03/2026, 5:57:06 pm
  FjhtzF...R5AC  transaction  21/03/2026, 4:44:49 pm
```

**Improvement targets (separate task, not blocking gateway work):**
- Show transaction type: `send`, `invest buy`, `invest sell`, `mpp payment`, `deposit`
- Show amount + token: `1.50 USDC`, `0.005 SUI`
- Show recipient/service: `→ 0x1234...abcd` or `→ openai/chat`
- Show Suiscan link for each tx
- Payment receipts: `t2000 history <digest>` for full details

### Tests

No gateway tests exist today (`apps/gateway` has zero test files). For the new API routes:

- [ ] `GET /api/mpp/payments` — returns paginated results, respects `limit`/`service` params
- [ ] `GET /api/mpp/stats` — returns correct counts and volume
- [ ] `logPayment()` — inserts correctly, handles errors gracefully

MCP tool tests (`t2000_services`, `t2000_pay`) already pass and don't need changes.

---

## Execution Order

| Order | Phase | Effort | Depends on |
|-------|-------|--------|-----------|
| 1 | Phase 0: Payment Logging | 1-2 days | Nothing (start here) |
| 2 | Phase 1: Homepage + Services Split | 3-4 days | Phase 0 (needs data) |
| 3 | Phase 4: New Services | Ongoing | Nothing (parallel) |
| 4 | Phase 2: Explorer | 3-4 days | Phase 0 (needs data, can wait for volume) |
| 5 | Phase 3: Spec + Docs | 2-3 days | Nothing (can do anytime) |

**Phase 0 + 1 ships in ~5 days. New services in parallel. Explorer and docs follow when there's enough payment data to make them interesting.**

---

## Success Metrics

| Metric | How we know it's working |
|--------|------------------------|
| Payments logged | > 0 payments appearing in `/api/mpp/payments` |
| Feed engagement | Users spending time on homepage (Vercel Analytics) |
| Explorer visits | Page views on `/explorer` |
| Mysten reaction | "this is real" when they see live payments flowing |
| Service growth | 35 → 48 services shipped |
