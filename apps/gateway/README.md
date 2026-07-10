# @t2000/gateway

MPP gateway — **every major AI + data API, payable with Sui USDC**.

**Live:** [mpp.t2000.ai](https://mpp.t2000.ai)

## What it does

Proxies requests to upstream APIs (OpenAI, Anthropic, Brave, Firecrawl, etc.) behind MPP (Machine Payments Protocol) 402 challenges. Agents pay per-request with USDC on Sui — no API keys, no accounts, no subscriptions.

Pay $0.02 – $0.10 per call. Pay $2.00 – $3.00 per physical postcard/letter. Fund the wallet via `t2 fund` (prints your deposit address + QR).

## Get started in 30 seconds

```bash
# 1. Install + initialize wallet
npm i -g @t2000/cli && t2 init

# 2. Fund the wallet with $1 USDC (covers ~100 LLM calls) — t2 fund prints the address
t2 fund

# 3. Make your first paid request
t2 pay https://mpp.t2000.ai/openai/v1/chat/completions \
  --data '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello, world!"}]}'
```

That's it. No signup. No API keys. The MPP 402 challenge is handled automatically; payment broadcasts to Sui mainnet; the response comes back.

## Hero examples

### 🖼️ Generate an image ($0.06)

```bash
t2 pay https://mpp.t2000.ai/openai/v1/images/generations \
  --data '{
    "prompt": "a serene mountain lake at dawn, photorealistic",
    "size": "1024x1024"
  }'
```

Returns `{ data: [{ url: "https://...vercel-storage.com/..." }] }`. The gateway uploads each gpt-image-1 result to Vercel Blob and rewrites the response to dall-e shape — you get a permanent CDN URL.

### 💬 Ask GPT-4o ($0.02)

```bash
t2 pay https://mpp.t2000.ai/openai/v1/chat/completions \
  --data '{
    "model": "gpt-4o",
    "messages": [{"role":"user","content":"Summarize the Sui consensus algorithm in 3 sentences."}],
    "max_tokens": 200
  }'
```

Standard OpenAI Chat Completions response shape. Pass vision via `image_url` content blocks. For cheaper alternatives (Together AI, Mistral, DeepSeek, Groq) browse the catalog (`t2 services search "chat"`).

### 🎙️ Transcribe audio ($0.02)

```bash
t2 pay https://mpp.t2000.ai/openai/v1/audio/transcriptions \
  --data '{
    "file": "https://example.com/podcast.mp3",
    "language": "en"
  }'
```

Whisper transcription. Up to 25 MB / 30 min. Pass `response_format: "verbose_json"` for timestamps. For speaker diarization use AssemblyAI (same catalog).

## Discover the catalog

| What you want | Where to look |
|---|---|
| Search by intent (image, chat, search, mail, …) | `t2 services search "<query>"` · [`t2000-services` skill](https://t2000.ai/skills/t2000-services) |
| Live service catalog (JSON) | `GET https://mpp.t2000.ai/api/services` |
| Agent-readable catalog | `GET https://mpp.t2000.ai/llms.txt` |
| OpenAPI 3.1 spec | `GET https://mpp.t2000.ai/openapi.json` |
| MCP tool | `t2000_services` |

Categories covered: AI Chat (9), Embeddings (6), Image Generation (9), Audio/TTS (7), Web Search (10), Web Scraping (8), Translation (3), Data (Maps/Weather/Crypto/Stocks/Currency) (9), Email & Push (3), Physical Mail (3), Commerce (3), Intelligence (4), Tools (3).

## Pages

| Route | What |
|-------|------|
| `/` | Gateway homepage with live payment feed |
| `/services` | Service catalog |
| `/explorer` | Payment explorer |
| `/docs` | Developer guide |
| `/spec` | Protocol spec |
| `/llms.txt` | Agent-readable catalog |
| `/openapi.json` | OpenAPI 3.1 discovery document |
| `/api/services` | Service catalog JSON |
| `/api/mpp/payments` | Payment feed API |
| `/api/mpp/stats` | Aggregate stats |

## Stack

- **Next.js 16** (App Router, Vercel deployment)
- **mppx** + `@suimpp/mpp` for payment verification
- **Prisma** for payment logging (NeonDB)
- **Tailwind** for service catalog + explorer UI

## Development

```bash
pnpm --filter @t2000/gateway dev
```

Runs on `http://localhost:4402`.

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `TREASURY_ADDRESS` | Yes | Sui address receiving payments |
| `NEXT_PUBLIC_SUI_NETWORK` | Yes | `mainnet` or `testnet` |
| `NEXT_PUBLIC_GATEWAY_URL` | No | Override base URL (defaults to `https://mpp.t2000.ai`) |
| `OPENAI_API_KEY` | Yes | OpenAI upstream key |
| `BLOB_READ_WRITE_TOKEN` | Yes for binary endpoints | Vercel Blob read-write token. Backs all artifact hosting: (a) `gpt-image-*` base64 payloads rewritten to dall-e shape `{ data: [{ url }] }`, and (b) any binary upstream (audio/TTS, raw image bytes, PDFs) hosted + returned as JSON `{ url, contentType, sizeBytes }` so the bytes survive JSON/text transports uncorrupted. Without it, binary endpoints return `503` (never a corrupted body). |
| Various `*_API_KEY` | Yes | Per-service upstream keys |

## Tests

```bash
pnpm --filter @t2000/gateway test
```

## Related

- **`@t2000/cli`** — the CLI that pays the 402 challenges (`t2 pay`, `t2 fund`, `t2 services`).
- **`@t2000/mcp`** — MCP server exposing `t2000_pay` + `t2000_services` (and the rest of the wallet toolset) as JSON-RPC tools.
- **`t2000-skills`** — Markdown playbooks (`t2000-services`, `t2000-pay`, …) served at `t2000.ai/skills/<slug>`.
- **`@suimpp/mpp`** — the underlying MPP protocol SDK.
