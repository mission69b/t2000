---
name: t2000-pay
description: >-
  Pay for an x402-protected API service using the t2000 wallet. Use when asked
  to call an AI model, search the web, generate images, send email, buy gift
  cards, send physical mail, check weather, execute code, or any task that
  requires a paid API. Handles the full x402 402 challenge automatically.
  Use t2000_services to discover all available services first.
license: MIT
status: active
metadata:
  author: t2000
  version: "3.0"
  requires: t2000 CLI (npm install -g @t2000/cli)
  available: "true"
---

# t2000: Pay for x402 API Service

## Status
Active — bundled with `@t2000/cli` (no separate install).

**USDC payment is gasless.** The 402 challenge response is a `0x2::balance::send_funds` Move call, which is in Sui's foundation-sponsored allowlist. The wallet can pay even with 0 SUI in the gas reserve.

## Purpose
Make a paid HTTP request to any x402-protected endpoint. Handles the 402
challenge, pays via Sui USDC, and returns the API response.

## Service Discovery
Before calling `t2 pay`, discover available services:
```bash
# CLI — search by name / category / endpoint
t2 services search "image"           # find image-gen services
t2 services search "chat"            # find chat/completion endpoints
t2 services search ""                # list everything

# CLI — inspect a service or endpoint
t2 services inspect https://mpp.t2000.ai/openai
t2 services inspect https://mpp.t2000.ai/openai/v1/chat/completions

# MCP — full catalog JSON
t2000_services
```

Most services are hosted at `https://mpp.t2000.ai/`; the catalog also federates **direct sellers** (marked `direct` — e.g. JMPR Travel at `agent.jmpr.world`) whose endpoints live on their own origin and settle straight to their wallet. `t2 pay` works identically for both; note the gateway's no-charge-on-failure guarantee covers proxied services only. See the `t2000-services` skill for the full discovery workflow.

## Command
```bash
t2 pay <url> [options]
```

## Options
| Option | Description | Default |
|--------|-------------|---------|
| `--method <method>` | HTTP method (GET, POST, PUT) | GET (auto-promotes to POST when `--data` is set) |
| `--data <json>` | Request body for POST/PUT (JSON bodies default `content-type: application/json`) | — |
| `--max-price <amount>` | Max USDC to auto-approve (enforced before any payment) | $1.00 |
| `--header <key=value>` | Additional HTTP header (repeatable) | — |
| `--estimate` | Show the price without paying (no funds spent) | — |
| `--force` | Override spending limits for this call (see `t2 limit`) | — |

## Available Services

> **The live catalog is the only source of truth for what's available and what it costs.**
> Discover services and current per-endpoint prices with `t2000_services` (MCP) or
> `GET https://mpp.t2000.ai/api/services`. Inspect one with `t2 services inspect <url>`.
> Prices are NOT listed here on purpose — they would drift from the catalog. Resolve the
> real price at call time (the `--max-price` ceiling guards against overpaying), or run
> `t2 pay <url> --estimate` to see what would be charged before paying.

The catalog spans every major AI + data API, grouped roughly as:

- **AI models & reasoning** — OpenAI, Anthropic (Claude), Google Gemini, DeepSeek, Groq, Together AI, Perplexity, Mistral, Cohere (chat, embeddings, rerank).
- **Media & generation** — OpenAI (images, text-to-speech), fal.ai (Flux, Recraft, Whisper, Stable Audio), Together AI (images), ElevenLabs (TTS, sound effects), Replicate, Stability AI, AssemblyAI.
- **Search** — Brave, Exa, Serper, SerpAPI, NewsAPI.
- **Web & documents** — Firecrawl (scrape / crawl / map / extract), Jina Reader, ScreenshotOne, PDFShift, QR Code.
- **Data & finance** — OpenWeather, Google Maps (geocode / places / directions), CoinGecko, Alpha Vantage, ExchangeRate.
- **Translation** — DeepL, Google Translate.
- **Intelligence & security** — Hunter.io, IPinfo, VirusTotal.
- **Tools & utility** — Judge0 (code exec), Resend (email), Pushover (push), Short.io (URL shortener), TinyPNG (image compression & resize).
- **Commerce** — Lob (postcards, letters, address verification).

This list is a capability map, not the exhaustive endpoint set — always discover via the catalog before calling.

## Example Commands

### Ask an AI model
```bash
t2 pay https://mpp.t2000.ai/openai/v1/chat/completions \
  --data '{"model":"gpt-4o","messages":[{"role":"user","content":"Explain quantum computing in 3 sentences"}]}'
```

### Search the web
```bash
t2 pay https://mpp.t2000.ai/brave/v1/web/search \
  --data '{"q":"latest Sui blockchain news"}'
```

### Generate an image
```bash
t2 pay https://mpp.t2000.ai/fal/fal-ai/flux/dev \
  --data '{"prompt":"a futuristic city at sunset, cyberpunk style"}'
```

### Check weather
```bash
t2 pay https://mpp.t2000.ai/openweather/v1/weather \
  --data '{"q":"Tokyo"}'
```

### Send an email
```bash
t2 pay https://mpp.t2000.ai/resend/v1/emails \
  --data '{"from":"agent@t2000.ai","to":"user@example.com","subject":"Hello","text":"Sent by an AI agent"}'
```

### Execute code
```bash
t2 pay https://mpp.t2000.ai/judge0/v1/submissions \
  --data '{"source_code":"print(42)","language_id":71}'
```

### Send physical mail
```bash
# Send a postcard
t2 pay https://mpp.t2000.ai/lob/v1/postcards \
  --max-price 2 \
  --data '{
    "to":{"name":"Jane Doe","address_line1":"123 Main St","address_city":"San Francisco","address_state":"CA","address_zip":"94105"},
    "from":{"name":"AI Agent","address_line1":"456 Oak Ave","address_city":"Palo Alto","address_state":"CA","address_zip":"94301"},
    "front":"https://example.com/front.png",
    "back":"https://example.com/back.png",
    "use_type":"operational"
  }'

# Send a letter
t2 pay https://mpp.t2000.ai/lob/v1/letters \
  --max-price 2 \
  --data '{
    "to":{"name":"Jane Doe","address_line1":"123 Main St","address_city":"San Francisco","address_state":"CA","address_zip":"94105"},
    "from":{"name":"AI Agent","address_line1":"456 Oak Ave","address_city":"Palo Alto","address_state":"CA","address_zip":"94301"},
    "file":"https://example.com/letter.pdf",
    "use_type":"operational",
    "color":false
  }'

# Verify a US address
t2 pay https://mpp.t2000.ai/lob/v1/verify \
  --data '{"primary_line":"123 Main St","city":"San Francisco","state":"CA","zip_code":"94105"}'
```

### Get directions
```bash
t2 pay https://mpp.t2000.ai/googlemaps/v1/directions \
  --data '{"origin":"San Francisco, CA","destination":"Palo Alto, CA"}'
```

### Get crypto prices
```bash
t2 pay https://mpp.t2000.ai/coingecko/v1/price \
  --data '{"ids":"sui,bitcoin,ethereum","vs_currencies":"usd"}'
```

### Get a stock quote
```bash
t2 pay https://mpp.t2000.ai/alphavantage/v1/quote \
  --data '{"symbol":"AAPL"}'
```

### Get breaking news
```bash
t2 pay https://mpp.t2000.ai/newsapi/v1/headlines \
  --data '{"country":"us","category":"technology"}'
```

### Translate text
```bash
t2 pay https://mpp.t2000.ai/deepl/v1/translate \
  --data '{"text":["Hello, how are you?"],"target_lang":"ES"}'
```

### Semantic search
```bash
t2 pay https://mpp.t2000.ai/exa/v1/search \
  --data '{"query":"best practices for AI agent payments","numResults":5}'
```

### Read a URL as markdown
```bash
t2 pay https://mpp.t2000.ai/jina/v1/read \
  --data '{"url":"https://docs.sui.io/concepts/tokenomics"}'
```

### Google search (structured)
```bash
t2 pay https://mpp.t2000.ai/serper/v1/search \
  --data '{"q":"Sui blockchain TVL 2026"}'
```

### Screenshot a webpage
```bash
t2 pay https://mpp.t2000.ai/screenshot/v1/capture \
  --data '{"url":"https://example.com","format":"png","viewport_width":"1280"}'
```

### Generate a QR code
```bash
t2 pay https://mpp.t2000.ai/qrcode/v1/generate \
  --data '{"data":"https://t2000.ai","size":"400x400"}'
```

### Convert HTML to PDF
```bash
t2 pay https://mpp.t2000.ai/pdfshift/v1/convert \
  --data '{"source":"https://t2000.ai/docs"}'
```

### Run a Replicate model
```bash
t2 pay https://mpp.t2000.ai/replicate/v1/predictions \
  --data '{"model":"meta/llama-3-70b-instruct","input":{"prompt":"Explain DeFi in 3 sentences"}}'
```

### Find emails for a domain
```bash
t2 pay https://mpp.t2000.ai/hunter/v1/search \
  --data '{"domain":"mystenlabs.com"}'
```

### Look up an IP address
```bash
t2 pay https://mpp.t2000.ai/ipinfo/v1/lookup \
  --data '{"ip":"8.8.8.8"}'
```

### Search for flights
```bash
t2 pay https://mpp.t2000.ai/serpapi/v1/flights \
  --data '{"departure_id":"LAX","arrival_id":"NRT","outbound_date":"2026-05-01","type":"2"}'
```

### Convert currency
```bash
t2 pay https://mpp.t2000.ai/exchangerate/v1/convert \
  --data '{"from":"USD","to":"EUR","amount":100}'
```

### Scan a URL for malware
```bash
t2 pay https://mpp.t2000.ai/virustotal/v1/scan \
  --data '{"url":"https://suspicious-site.com"}'
```

### Shorten a URL
```bash
t2 pay https://mpp.t2000.ai/shortio/v1/shorten \
  --data '{"url":"https://example.com/very/long/url/path"}'
```

### Send a push notification
```bash
t2 pay https://mpp.t2000.ai/pushover/v1/push \
  --data '{"user":"USER_KEY","message":"Your agent has a message!"}'
```

## Flow (automatic)
1. Makes initial HTTP request to the URL
2. If 402: reads x402 challenge for amount and terms
3. If price <= --max-price: pays via Sui USDC
4. Retries with credential header
5. Returns the API response body

## Safety
- If requested price exceeds --max-price, payment is refused (no funds spent)
- Default max-price: $1.00 USDC per request
- For commerce (mail, merch), set --max-price higher
- Payment only broadcast after 402 terms are validated

## Errors
- `PRICE_EXCEEDS_LIMIT`: API asking more than --max-price
- `INSUFFICIENT_BALANCE`: not enough available USDC
- `UNSUPPORTED_NETWORK`: x402 requires a network other than Sui
- `PAYMENT_EXPIRED`: payment challenge has expired
- `DUPLICATE_PAYMENT`: nonce already used on-chain

## MCP
Via MCP: use `t2000_services` to discover services, then `t2000_pay` to call them.
