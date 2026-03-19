# Phase 12e — MPP Gateway (Sui USDC)

**Goal:** Run MPP-compatible API proxies that accept Sui USDC payments. Same pattern as Tempo's `openai.mpp.tempo.xyz` — but settling on Sui instead of Tempo.

**Why:** `@t2000/mpp-sui` exists but no services accept Sui payments yet. Without a Sui-native MPP ecosystem, t2000 agents can't pay for anything. This creates that ecosystem.

**Model:** [mpp.dev/services](https://mpp.dev/services) — service directory, per-endpoint pricing, llms.txt, "Use with agents" sidebar.

---

## Architecture

```
t2000 agent (Sui USDC)
    → t2000 pay / agent.pay()
        → mpp.t2000.ai/openai/v1/chat/completions
            → mppx/nextjs + @t2000/mpp-sui/server (402 / verify)
                → api.openai.com (with our API key)
                    → response back to agent
```

Each proxy is:
1. A Next.js route handler wrapped with `mppx.charge()`
2. `@t2000/mpp-sui/server` as the payment method (Sui USDC)
3. Forwards request to upstream API with injected auth
4. USDC goes to t2000 treasury address on Sui

### Hosting

- **App:** `apps/gateway/` — separate Next.js app in monorepo
- **Deploy:** Vercel
- **Domain:** `mpp.t2000.ai` with path routing (v1)
  - `mpp.t2000.ai/openai/v1/chat/completions`
  - `mpp.t2000.ai/anthropic/v1/messages`
  - `mpp.t2000.ai/fal/fal-ai/flux/dev`
  - `mpp.t2000.ai/firecrawl/v1/scrape`
- **Future:** Subdomains (`openai.mpp.t2000.ai`) when traffic justifies it

---

## Gateway Framework

Using `mppx/nextjs` middleware — handles 402 challenge/credential flow automatically:

```ts
// lib/gateway.ts
import { Mppx } from 'mppx/nextjs';
import { sui } from '@t2000/mpp-sui/server';
import { SUI_USDC_TYPE } from './constants';

export function createGateway() {
  return Mppx.create({
    methods: [sui({
      currency: SUI_USDC_TYPE,
      recipient: process.env.TREASURY_ADDRESS!,
      network: 'mainnet',
    })],
  });
}
```

### Per-Service Route Handler

```ts
// app/openai/v1/chat/completions/route.ts
import { createGateway } from '@/lib/gateway';

const mppx = createGateway();

export const POST = mppx.charge({ amount: '0.01' })(
  async (req: Request) => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: req.body,
    });
    return new Response(res.body, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    });
  }
);
```

---

## V1 Services (4)

| # | Service | Why | Upstream | Endpoints |
|---|---------|-----|----------|-----------|
| 1 | **OpenAI** | Most-used AI API | api.openai.com | 5 endpoints |
| 2 | **Anthropic** | Claude models | api.anthropic.com | 1 endpoint |
| 3 | **fal.ai** | Image/video gen | fal.run | 2 endpoints |
| 4 | **Firecrawl** | Web scraping | api.firecrawl.dev | 2 endpoints |

### OpenAI Endpoints

| Method | Path | Description | Price |
|--------|------|-------------|-------|
| POST | `/openai/v1/chat/completions` | Chat completions (GPT-4o, o1, etc.) | $0.01 |
| POST | `/openai/v1/embeddings` | Create embeddings | $0.001 |
| POST | `/openai/v1/images/generations` | Generate images with DALL-E | $0.05 |
| POST | `/openai/v1/audio/transcriptions` | Transcribe audio with Whisper | $0.01 |
| POST | `/openai/v1/audio/speech` | Text-to-speech | $0.02 |

### Anthropic Endpoints

| Method | Path | Description | Price |
|--------|------|-------------|-------|
| POST | `/anthropic/v1/messages` | Chat completions (Sonnet, Opus, Haiku) | $0.01 |

### fal.ai Endpoints

| Method | Path | Description | Price |
|--------|------|-------------|-------|
| POST | `/fal/fal-ai/flux/dev` | Flux Dev image generation | $0.03 |
| POST | `/fal/fal-ai/flux-pro` | Flux Pro image generation | $0.05 |

### Firecrawl Endpoints

| Method | Path | Description | Price |
|--------|------|-------------|-------|
| POST | `/firecrawl/v1/scrape` | Scrape a URL to structured data | $0.01 |
| POST | `/firecrawl/v1/crawl` | Crawl a website | $0.05 |

---

## Pricing

### V1: Fixed Per-Request

Simple, predictable. Match or slightly undercut Tempo pricing. Each endpoint has one price regardless of model or input size.

### Revenue Model

- **Upstream cost:** Paid from t2000's API keys (OpenAI/Anthropic/fal/Firecrawl bill us)
- **Agent pays:** Fixed USDC per request via MPP
- **Margin:** Prices cover average upstream cost + margin
- **Treasury:** All USDC goes to t2000 treasury on Sui

### V2 (Future): Model-Tier Pricing

Parse model from request body → price by tier (like Tempo does with "Varies" for chat completions). Not needed for v1.

---

## Landing Page (mpp.t2000.ai)

Modeled after [mpp.dev/services](https://mpp.dev/services):

### Left side: Service Directory

Table with columns:
- **Provider** — icon + name + category tag
- **Description** — one-line description
- **Service URL** — `mpp.t2000.ai/openai` (copiable)

Clicking a provider expands to show per-endpoint detail:
- Method badge (POST/GET)
- Path
- Description
- Price

### Right sidebar: "Use with t2000"

```
Use with t2000
Install t2000 CLI and fund your agent's Sui wallet.

Install t2000
$ npm i -g @t2000/cli && t2000 init

Pay for a service
$ t2000 pay mpp.t2000.ai/openai/v1/chat/completions \
    --data '{"model":"gpt-4o","messages":[...]}' \
    --max-price 0.05

Or use the SDK
const result = await agent.pay({
  url: 'https://mpp.t2000.ai/openai/v1/chat/completions',
  body: JSON.stringify({ model: 'gpt-4o', messages: [...] }),
  maxPrice: 0.05,
});

Point your agent to llms.txt for full service documentation.

→ llms.txt (service discovery for agents)
→ Documentation
→ npm install @t2000/mpp-sui
```

---

## Service Discovery

### GET /api/services

```json
[
  {
    "id": "openai",
    "name": "OpenAI",
    "serviceUrl": "https://mpp.t2000.ai/openai",
    "description": "Chat completions, embeddings, image generation, and audio via Sui USDC.",
    "chain": "sui",
    "currency": "USDC",
    "categories": ["ai", "media"],
    "endpoints": [
      { "method": "POST", "path": "/v1/chat/completions", "description": "Chat completions (GPT-4o, o1, etc.)", "price": "0.01" },
      { "method": "POST", "path": "/v1/embeddings", "description": "Create embeddings", "price": "0.001" },
      { "method": "POST", "path": "/v1/images/generations", "description": "Generate images with DALL-E", "price": "0.05" },
      { "method": "POST", "path": "/v1/audio/transcriptions", "description": "Transcribe audio with Whisper", "price": "0.01" },
      { "method": "POST", "path": "/v1/audio/speech", "description": "Text-to-speech", "price": "0.02" }
    ]
  },
  {
    "id": "anthropic",
    "name": "Anthropic",
    "serviceUrl": "https://mpp.t2000.ai/anthropic",
    "description": "Claude chat completions (Sonnet, Opus, Haiku) via Sui USDC.",
    "chain": "sui",
    "currency": "USDC",
    "categories": ["ai"],
    "endpoints": [
      { "method": "POST", "path": "/v1/messages", "description": "Chat completions (Sonnet, Opus, Haiku)", "price": "0.01" }
    ]
  },
  {
    "id": "fal",
    "name": "fal.ai",
    "serviceUrl": "https://mpp.t2000.ai/fal",
    "description": "Image and video generation with Flux models via Sui USDC.",
    "chain": "sui",
    "currency": "USDC",
    "categories": ["ai", "media"],
    "endpoints": [
      { "method": "POST", "path": "/fal-ai/flux/dev", "description": "Flux Dev image generation", "price": "0.03" },
      { "method": "POST", "path": "/fal-ai/flux-pro", "description": "Flux Pro image generation", "price": "0.05" }
    ]
  },
  {
    "id": "firecrawl",
    "name": "Firecrawl",
    "serviceUrl": "https://mpp.t2000.ai/firecrawl",
    "description": "Web scraping and crawling for AI agents via Sui USDC.",
    "chain": "sui",
    "currency": "USDC",
    "categories": ["web", "data"],
    "endpoints": [
      { "method": "POST", "path": "/v1/scrape", "description": "Scrape a URL to structured data", "price": "0.01" },
      { "method": "POST", "path": "/v1/crawl", "description": "Crawl a website", "price": "0.05" }
    ]
  }
]
```

### GET /llms.txt

```
# t2000 MPP Gateway — Sui USDC

> MPP-enabled APIs payable with Sui USDC. No API keys. No accounts. Just pay.
> Docs: https://t2000.ai/docs
> Service discovery: https://mpp.t2000.ai/api/services

## Use with t2000

Install the CLI and create an agent wallet:
  $ npm i -g @t2000/cli && t2000 init

Make a paid request:
  $ t2000 pay https://mpp.t2000.ai/openai/v1/chat/completions \
      --data '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}' \
      --max-price 0.05

Or use the SDK:
  import { T2000 } from '@t2000/sdk';
  const agent = await T2000.create();
  const result = await agent.pay({ url: '...', body: '...', maxPrice: 0.05 });

## Services

### OpenAI
Chat completions, embeddings, image generation, and audio.
Base URL: https://mpp.t2000.ai/openai
- POST /v1/chat/completions — Chat completions (GPT-4o, o1, etc.) — $0.01
- POST /v1/embeddings — Create embeddings — $0.001
- POST /v1/images/generations — Generate images with DALL-E — $0.05
- POST /v1/audio/transcriptions — Transcribe audio with Whisper — $0.01
- POST /v1/audio/speech — Text-to-speech — $0.02

### Anthropic
Claude chat completions (Sonnet, Opus, Haiku).
Base URL: https://mpp.t2000.ai/anthropic
- POST /v1/messages — Chat completions — $0.01

### fal.ai
Image and video generation with Flux models.
Base URL: https://mpp.t2000.ai/fal
- POST /fal-ai/flux/dev — Flux Dev image generation — $0.03
- POST /fal-ai/flux-pro — Flux Pro image generation — $0.05

### Firecrawl
Web scraping and crawling for AI agents.
Base URL: https://mpp.t2000.ai/firecrawl
- POST /v1/scrape — Scrape a URL to structured data — $0.01
- POST /v1/crawl — Crawl a website — $0.05

## Payment

All services accept Sui USDC via MPP (Machine Payments Protocol).
Chain: Sui · Currency: USDC (Circle) · Settlement: ~400ms · Gas: <$0.001
```

---

## File Structure

```
apps/gateway/
├── app/
│   ├── layout.tsx                                    # Root layout
│   ├── page.tsx                                      # Landing page (service directory)
│   ├── api/
│   │   └── services/route.ts                         # GET /api/services (JSON discovery)
│   ├── llms.txt/route.ts                             # GET /llms.txt (agent discovery)
│   ├── openai/
│   │   └── v1/
│   │       ├── chat/completions/route.ts             # POST — chat
│   │       ├── embeddings/route.ts                   # POST — embeddings
│   │       ├── images/generations/route.ts           # POST — images
│   │       └── audio/
│   │           ├── transcriptions/route.ts           # POST — whisper
│   │           └── speech/route.ts                   # POST — tts
│   ├── anthropic/
│   │   └── v1/messages/route.ts                      # POST — claude
│   ├── fal/
│   │   └── fal-ai/
│   │       ├── flux/dev/route.ts                     # POST — flux dev
│   │       └── flux-pro/route.ts                     # POST — flux pro
│   └── firecrawl/
│       └── v1/
│           ├── scrape/route.ts                       # POST — scrape
│           └── crawl/route.ts                        # POST — crawl
├── lib/
│   ├── gateway.ts                                    # createGateway() + createProxy() helpers
│   ├── services.ts                                   # Service registry (config + endpoints)
│   └── constants.ts                                  # Treasury address, USDC type
├── package.json
├── tsconfig.json
├── next.config.ts
└── .env.local                                        # API keys (not committed)
```

### Why explicit routes, not catch-all

Each endpoint is a separate Next.js route file instead of a `[...path]` catch-all because:
- Each endpoint has its own price via `mppx.charge({ amount })`
- Explicit routes = clear, auditable, no routing bugs
- Easy to add/remove endpoints
- Each route is ~15 lines

---

## Route Template

Every proxy route follows this pattern:

```ts
// app/openai/v1/chat/completions/route.ts
import { createGateway } from '@/lib/gateway';

const mppx = createGateway();

export const POST = mppx.charge({ amount: '0.01' })(
  async (req: Request) => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: req.body,
    });
    return new Response(res.body, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    });
  }
);
```

Anthropic is slightly different (different auth header):

```ts
// app/anthropic/v1/messages/route.ts
export const POST = mppx.charge({ amount: '0.01' })(
  async (req: Request) => {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: req.body,
    });
    return new Response(res.body, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    });
  }
);
```

---

## What We Don't Build (v1)

- **Streaming** — v1 returns complete responses. Streaming (SSE) is a v2 feature.
- **Usage analytics** — track on-chain via indexer later
- **Rate limiting** — rely on upstream API rate limits
- **Caching** — pass-through only
- **Model-specific pricing** — fixed per-route
- **User accounts** — MPP is stateless, no accounts needed

---

## Environment Variables

```
# Treasury
TREASURY_ADDRESS=0x...

# Upstream API keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
FAL_KEY=...
FIRECRAWL_API_KEY=fc-...

# Sui network
NEXT_PUBLIC_SUI_NETWORK=mainnet
```

---

## Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 12e.1 | Scaffold `apps/gateway` (Next.js, package.json, tsconfig, pnpm workspace) | gateway | 1h | ⬜ |
| 12e.2 | `lib/gateway.ts` — createGateway() using mppx/nextjs + @t2000/mpp-sui/server | gateway | 1h | ⬜ |
| 12e.3 | `lib/services.ts` — service registry with endpoints and pricing | gateway | 1h | ⬜ |
| 12e.4 | OpenAI routes (5 endpoints) | gateway | 1h | ⬜ |
| 12e.5 | Anthropic route (1 endpoint) | gateway | 30m | ⬜ |
| 12e.6 | fal.ai routes (2 endpoints) | gateway | 30m | ⬜ |
| 12e.7 | Firecrawl routes (2 endpoints) | gateway | 30m | ⬜ |
| 12e.8 | `/api/services` discovery endpoint (JSON) | gateway | 30m | ⬜ |
| 12e.9 | `/llms.txt` agent discovery endpoint | gateway | 30m | ⬜ |
| 12e.10 | Landing page — service directory + "Use with t2000" sidebar | gateway | 3h | ⬜ |
| 12e.11 | Vercel deploy + DNS (mpp.t2000.ai) | infra | 1h | ⬜ |
| 12e.12 | Test locally with `t2000 pay` | testing | 1h | ⬜ |
| 12e.13 | Update roadmap, docs, MPP page links | docs | 30m | ⬜ |

**Estimated total:** 2-3 days

---

## Competitive Positioning

| | Tempo Proxies | t2000 Gateway |
|---|---|---|
| **Chain** | Tempo | Sui |
| **Currency** | pathUSD | USDC (Circle) |
| **Settlement** | ~seconds | ~400ms |
| **Gas** | Tempo gas | <$0.001 |
| **Wallet** | Tempo wallet | Sui wallet (t2000 banking stack) |
| **Ecosystem** | 50+ services | 4 services (v1) |
| **Edge** | First mover, ecosystem size | Sui-native, USDC, full banking stack |

The edge isn't service count — it's the closed loop. t2000 agents already have USDC. They earn yield on it. They pay for intelligence with it. No new chain, no new token, no bridging.
