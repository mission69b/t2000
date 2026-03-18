# Phase 12e — MPP Gateway (Sui USDC)

**Goal:** Run MPP-compatible API proxies that accept Sui USDC payments. Same pattern as Tempo's `openai.mpp.tempo.xyz` — but settling on Sui instead of Tempo.

**Why:** `@t2000/mpp-sui` exists but no services accept Sui payments yet. Without a Sui-native MPP ecosystem, t2000 agents can't pay for anything. This phase creates that ecosystem.

**Positioning:** Tempo proxies accept pathUSD. t2000 proxies accept Sui USDC. Same APIs, different settlement chain. t2000 agents already have Sui USDC from the banking stack — no bridging, no second wallet.

---

## Architecture

```
t2000 agent (Sui USDC)
    → t2000 pay / agent.pay()
        → openai.mpp.t2000.ai
            → @t2000/mpp-sui/server (verify Sui TX)
                → api.openai.com (with our API key)
                    → response back to agent
```

Each proxy is:
1. A reverse proxy that injects the upstream API key
2. Wrapped in `@t2000/mpp-sui/server` for 402 challenge/verify
3. USDC payment goes to t2000 treasury address
4. Upstream API cost paid by t2000's API key

### Hosting

- **App:** `apps/gateway/` — separate Next.js app
- **Deploy:** Vercel (consistent with `apps/web`)
- **Domain:** `mpp.t2000.ai` with subdomains per service
  - `openai.mpp.t2000.ai`
  - `anthropic.mpp.t2000.ai`
  - `fal.mpp.t2000.ai`
  - etc.
- **Alternative (v1):** Single domain with path routing: `mpp.t2000.ai/openai/v1/chat/completions`

### Gateway Framework

One generic handler that all services share:

```ts
import { Mppx } from 'mppx';
import { sui } from '@t2000/mpp-sui/server';

interface ServiceConfig {
  id: string;
  name: string;
  upstream: string;
  apiKey: string;
  pricing: Record<string, string>;  // route pattern → amount
  defaultPrice: string;
  headers?: Record<string, string>;
}

function createProxy(config: ServiceConfig) {
  const mppx = Mppx.create({
    methods: [sui({
      currency: SUI_USDC,
      recipient: TREASURY_ADDRESS,
      network: 'mainnet',
    })],
  });

  return async (req: Request, path: string) => {
    const price = resolvePrice(config, path, req);

    return mppx.charge({ amount: price })(
      async () => {
        const upstream = `${config.upstream}/${path}`;
        const res = await fetch(upstream, {
          method: req.method,
          headers: {
            'content-type': req.headers.get('content-type') ?? 'application/json',
            'authorization': `Bearer ${config.apiKey}`,
            ...config.headers,
          },
          body: req.method !== 'GET' ? req.body : undefined,
        });
        return new Response(res.body, {
          status: res.status,
          headers: res.headers,
        });
      }
    )(req);
  };
}
```

### Per-Service Config

```ts
const services: ServiceConfig[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    upstream: 'https://api.openai.com',
    apiKey: process.env.OPENAI_API_KEY!,
    defaultPrice: '0.01',
    pricing: {
      'v1/chat/completions': '0.01',     // per request (varies by model)
      'v1/embeddings': '0.001',
      'v1/images/generations': '0.04',
      'v1/audio/transcriptions': '0.01',
    },
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    upstream: 'https://api.anthropic.com',
    apiKey: process.env.ANTHROPIC_API_KEY!,
    defaultPrice: '0.01',
    pricing: {
      'v1/messages': '0.01',
    },
    headers: {
      'anthropic-version': '2023-06-01',
    },
  },
  {
    id: 'fal',
    name: 'fal.ai',
    upstream: 'https://fal.run',
    apiKey: process.env.FAL_KEY!,
    defaultPrice: '0.05',
    pricing: {
      'fal-ai/flux/dev': '0.03',
      'fal-ai/flux-pro': '0.05',
    },
  },
  {
    id: 'exa',
    name: 'Exa',
    upstream: 'https://api.exa.ai',
    apiKey: process.env.EXA_API_KEY!,
    defaultPrice: '0.01',
    pricing: {
      'search': '0.01',
      'contents': '0.01',
    },
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    upstream: 'https://api.firecrawl.dev',
    apiKey: process.env.FIRECRAWL_API_KEY!,
    defaultPrice: '0.01',
    pricing: {
      'v1/scrape': '0.01',
      'v1/crawl': '0.05',
    },
  },
];
```

---

## V1 Services (Launch with 5)

Pick the highest-value services for AI agents:

| # | Service | Why | Upstream | Price Range |
|---|---------|-----|----------|-------------|
| 1 | **OpenAI** | Chat, embeddings, images, audio — the most-used AI API | api.openai.com | $0.001–$0.04 |
| 2 | **Anthropic** | Claude models — second most-used | api.anthropic.com | $0.005–$0.02 |
| 3 | **fal.ai** | Image/video gen — visual content for agents | fal.run | $0.03–$0.10 |
| 4 | **Exa** | Web search — agents need to search the internet | api.exa.ai | $0.01 |
| 5 | **Firecrawl** | Web scraping — agents need to read web pages | api.firecrawl.dev | $0.01–$0.05 |

### Why These Five

- **OpenAI + Anthropic** = core intelligence (agents calling other LLMs)
- **fal.ai** = media generation (images, video)
- **Exa + Firecrawl** = web access (search + scrape)

This covers the 3 things AI agents need most: thinking, creating, and reading the web.

---

## Pricing

### V1: Fixed Per-Request

Simple, predictable. Each route has a fixed USDC price. Match or slightly undercut Tempo's pricing.

```
POST /v1/chat/completions   → $0.01 USDC
POST /v1/embeddings         → $0.001 USDC
POST /v1/images/generations → $0.04 USDC
```

### Revenue Model

- **Upstream cost:** Paid from t2000's API key (OpenAI bills us)
- **Agent pays:** Fixed USDC per request via MPP
- **Margin:** Set prices to cover upstream cost + 10-20% margin
- **Treasury:** All USDC goes to t2000 treasury on Sui

### V2 (Future): Dynamic Pricing

For LLMs, cost varies by model + tokens. Future improvements:
- Parse model from request body → price by model tier
- Estimate token cost from input length
- Post-request reconciliation

Not needed for v1. Fixed pricing is what Tempo uses and it works.

---

## Service Discovery

Expose a discovery endpoint (like `mpp.dev/api/services`):

```
GET mpp.t2000.ai/api/services
```

Returns:
```json
[
  {
    "id": "openai",
    "name": "OpenAI",
    "serviceUrl": "https://openai.mpp.t2000.ai",
    "description": "Chat completions, embeddings, image generation via Sui USDC.",
    "chain": "sui",
    "currency": "USDC",
    "categories": ["ai"]
  }
]
```

Also expose `llms.txt` for agent discovery:
```
GET mpp.t2000.ai/llms.txt
```

---

## File Structure

```
apps/gateway/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                          # Landing page (service directory)
│   ├── api/
│   │   ├── services/route.ts             # Discovery endpoint
│   │   ├── [service]/[...path]/route.ts  # Generic proxy catch-all
│   └── llms.txt/route.ts                 # Agent discovery
├── lib/
│   ├── gateway.ts                        # createProxy framework
│   ├── pricing.ts                        # Price resolution
│   ├── services.ts                       # Service registry
│   └── constants.ts                      # Treasury address, USDC type
├── package.json
├── tsconfig.json
├── next.config.ts
└── vercel.json
```

---

## What We Don't Build

- **Custom UIs per service** — these are API proxies, not dashboards
- **Usage analytics dashboards** — track on-chain via indexer later
- **Rate limiting** — rely on upstream API rate limits initially
- **Caching** — pass-through only, no caching of upstream responses
- **Model-specific pricing** — v1 is fixed per-route, not per-model

---

## User Flow

### Agent pays for OpenAI via t2000

```bash
# CLI
t2000 pay https://openai.mpp.t2000.ai/v1/chat/completions \
  --data '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}' \
  --max-price 0.05

  → POST https://openai.mpp.t2000.ai/v1/chat/completions
  ← 402 Payment Required
  Amount: $0.01 USDC · Recipient: 0x...treasury
  $0.01 ≤ $0.05 max — paying...
  ✓ Paid $0.01 USDC (tx: 7xK2m...)
  ← 200 OK (2.1s)

  {"choices":[{"message":{"content":"Hello! How can I help you today?"}}]}
```

### SDK
```ts
const result = await agent.pay({
  url: 'https://openai.mpp.t2000.ai/v1/chat/completions',
  method: 'POST',
  body: JSON.stringify({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Hello' }],
  }),
  maxPrice: 0.05,
});
```

### MCP (Claude)
```
You: "Ask GPT-4o what it thinks about Sui"
Claude: → calls t2000_pay
        → pays $0.01 USDC to openai.mpp.t2000.ai
        → returns GPT-4o's response
```

---

## Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 12e.1 | Scaffold `apps/gateway` (Next.js, package.json, tsconfig) | gateway | 1h | ⬜ |
| 12e.2 | Gateway framework — `createProxy()`, pricing resolver | gateway | 3h | ⬜ |
| 12e.3 | OpenAI proxy (chat, embeddings, images, audio) | gateway | 2h | ⬜ |
| 12e.4 | Anthropic proxy (messages) | gateway | 1h | ⬜ |
| 12e.5 | fal.ai proxy (image/video gen) | gateway | 1h | ⬜ |
| 12e.6 | Exa proxy (search, contents) | gateway | 1h | ⬜ |
| 12e.7 | Firecrawl proxy (scrape, crawl) | gateway | 1h | ⬜ |
| 12e.8 | Service discovery endpoint + llms.txt | gateway | 1h | ⬜ |
| 12e.9 | Landing page (service directory) | gateway | 2h | ⬜ |
| 12e.10 | Vercel deploy + DNS (mpp.t2000.ai) | infra | 1h | ⬜ |
| 12e.11 | Tests (proxy + payment flow) | gateway | 2h | ⬜ |
| 12e.12 | Update roadmap, docs, MPP page | docs | 1h | ⬜ |

**Estimated total:** 3-4 days

---

## Dependencies

- `@t2000/mpp-sui` (already published)
- `mppx` (already a dependency)
- Upstream API keys (OpenAI, Anthropic, fal.ai, Exa, Firecrawl)
- Vercel project + DNS for `mpp.t2000.ai`

---

## Competitive Positioning

| | Tempo Proxies | t2000 Gateway |
|---|---|---|
| **Chain** | Tempo | Sui |
| **Currency** | pathUSD | USDC (Circle) |
| **Settlement** | ~seconds | ~400ms |
| **Gas** | Tempo gas | <$0.001 |
| **Wallet** | Tempo wallet | Sui wallet (t2000 banking stack) |
| **Ecosystem** | 50+ services | 5 services (v1) |
| **Edge** | First mover, ecosystem size | Sui-native, USDC (universally held), full banking stack |

The edge isn't service count — it's the closed loop. t2000 agents already have USDC. They earn yield on it. They pay for intelligence with it. No new chain, no new token, no bridging.

---

## Future Expansion

After v1 ships with 5 services, expand based on agent usage:

**High priority:**
- Google Gemini (video gen via Veo)
- Replicate (open source models)
- Perplexity (search + answers)
- Browserbase (headless browser)

**Medium priority:**
- Stability AI, Suno (media)
- Google Maps, OpenWeather (data)
- Judge0 (code execution)

**Community-driven:**
- Open the gateway framework so anyone can add services
- PR template for new service configs
