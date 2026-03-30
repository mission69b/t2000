---
name: t2000-pay
description: >-
  Pay for an MPP-protected API service using the t2000 wallet. Use when asked
  to call an AI model, search the web, generate images, send email, buy gift
  cards, send physical mail, check weather, execute code, or any task that
  requires a paid API. Handles the full MPP 402 challenge automatically.
  Use t2000_services to discover all available services first.
license: MIT
status: active
metadata:
  author: t2000
  version: "2.0"
  requires: t2000 CLI (npx @t2000/cli init)
  available: true
---

# t2000: Pay for MPP API Service

## Status
Active — requires `t2000` CLI with `@mppsui/mpp` installed.

## Purpose
Make a paid HTTP request to any MPP-protected endpoint. Handles the 402
challenge, pays via Sui USDC, and returns the API response.

## Service Discovery
Before calling `t2000 pay`, discover available services:
```bash
# CLI
t2000 pay https://mpp.t2000.ai/api/services

# MCP
t2000_services
```

All services are hosted at `https://mpp.t2000.ai/`.

## Command
```bash
t2000 pay <url> [options]
```

## Options
| Option | Description | Default |
|--------|-------------|---------|
| `--method <method>` | HTTP method (GET, POST, PUT) | POST |
| `--data <json>` | Request body for POST/PUT | — |
| `--max-price <amount>` | Max USDC per request | $1.00 |
| `--header <key=value>` | Additional HTTP header (repeatable) | — |
| `--timeout <seconds>` | Request timeout in seconds | 30 |
| `--dry-run` | Show what would be paid without paying | — |

## Available Services (41 services, 90 endpoints)

> For the live, canonical list use `t2000_services` (MCP) or GET `https://mpp.t2000.ai/api/services`.
> The table below is a quick reference.

### AI Models
| Service | Endpoint | Price |
|---------|----------|-------|
| OpenAI Chat | `/openai/v1/chat/completions` | $0.01 |
| OpenAI Embeddings | `/openai/v1/embeddings` | $0.005 |
| OpenAI Audio Transcription | `/openai/v1/audio/transcriptions` | $0.01 |
| OpenAI Text-to-Speech | `/openai/v1/audio/speech` | $0.02 |
| Anthropic | `/anthropic/v1/messages` | $0.01 |
| Google Gemini Flash | `/gemini/v1beta/models/gemini-2.5-flash` | $0.005 |
| Google Gemini Pro | `/gemini/v1beta/models/gemini-2.5-pro` | $0.01 |
| Google Gemini Embeddings | `/gemini/v1beta/models/embedding-001` | $0.005 |
| DeepSeek | `/deepseek/v1/chat/completions` | $0.005 |
| Groq Chat | `/groq/v1/chat/completions` | $0.005 |
| Groq Audio Transcription | `/groq/v1/audio/transcriptions` | $0.005 |
| Together AI Chat | `/together/v1/chat/completions` | $0.005 |
| Together AI Embeddings | `/together/v1/embeddings` | $0.005 |
| Perplexity | `/perplexity/v1/chat/completions` | $0.01 |
| Mistral Chat | `/mistral/v1/chat/completions` | $0.005 |
| Mistral Embeddings | `/mistral/v1/embeddings` | $0.005 |
| Cohere Chat | `/cohere/v1/chat` | $0.005 |
| Cohere Embed | `/cohere/v1/embed` | $0.005 |
| Cohere Rerank | `/cohere/v1/rerank` | $0.005 |

### Media & Generation
| Service | Endpoint | Price |
|---------|----------|-------|
| OpenAI DALL-E | `/openai/v1/images/generations` | $0.05 |
| Fal.ai Flux Dev | `/fal/fal-ai/flux/dev` | $0.03 |
| Fal.ai Flux Pro | `/fal/fal-ai/flux-pro` | $0.05 |
| Fal.ai Flux Realism | `/fal/fal-ai/flux-realism` | $0.05 |
| Fal.ai Recraft 20B | `/fal/fal-ai/recraft-20b` | $0.05 |
| Fal.ai Whisper | `/fal/fal-ai/whisper` | $0.01 |
| Together AI Images | `/together/v1/images/generations` | $0.03 |
| ElevenLabs TTS | `/elevenlabs/v1/text-to-speech/:voiceId` | $0.05 |
| ElevenLabs SFX | `/elevenlabs/v1/sound-generation` | $0.05 |
| Replicate (any model) | `/replicate/v1/predictions` | $0.02 |
| Replicate (check status) | `/replicate/v1/predictions/status` | $0.005 |
| Stability AI (generate) | `/stability/v1/generate` | $0.03 |
| Stability AI (edit) | `/stability/v1/edit` | $0.03 |
| AssemblyAI (transcribe) | `/assemblyai/v1/transcribe` | $0.02 |
| AssemblyAI (get result) | `/assemblyai/v1/result` | $0.005 |

### Search
| Service | Endpoint | Price |
|---------|----------|-------|
| Brave Web Search | `/brave/v1/web/search` | $0.005 |
| Brave Image Search | `/brave/v1/images/search` | $0.005 |
| Brave News Search | `/brave/v1/news/search` | $0.005 |
| Brave Video Search | `/brave/v1/videos/search` | $0.005 |
| Brave Summarizer | `/brave/v1/summarizer/search` | $0.01 |
| Exa (semantic search) | `/exa/v1/search` | $0.01 |
| Exa (content extract) | `/exa/v1/contents` | $0.01 |
| Serper (Google search) | `/serper/v1/search` | $0.005 |
| Serper (image search) | `/serper/v1/images` | $0.005 |
| SerpAPI (Google search) | `/serpapi/v1/search` | $0.01 |
| SerpAPI (Google Flights) | `/serpapi/v1/flights` | $0.01 |
| SerpAPI (locations) | `/serpapi/v1/locations` | $0.005 |
| NewsAPI (headlines) | `/newsapi/v1/headlines` | $0.005 |
| NewsAPI (article search) | `/newsapi/v1/search` | $0.005 |

### Data
| Service | Endpoint | Price |
|---------|----------|-------|
| OpenWeather Current | `/openweather/v1/weather` | $0.005 |
| OpenWeather Forecast | `/openweather/v1/forecast` | $0.005 |
| Google Maps Geocode | `/googlemaps/v1/geocode` | $0.01 |
| Google Maps Places | `/googlemaps/v1/places` | $0.01 |
| Google Maps Directions | `/googlemaps/v1/directions` | $0.01 |
| CoinGecko (price) | `/coingecko/v1/price` | $0.005 |
| CoinGecko (markets) | `/coingecko/v1/markets` | $0.005 |
| CoinGecko (trending) | `/coingecko/v1/trending` | $0.005 |
| Alpha Vantage (quote) | `/alphavantage/v1/quote` | $0.005 |
| Alpha Vantage (daily) | `/alphavantage/v1/daily` | $0.005 |
| Alpha Vantage (search) | `/alphavantage/v1/search` | $0.005 |

### Web & Documents
| Service | Endpoint | Price |
|---------|----------|-------|
| Firecrawl Scrape | `/firecrawl/v1/scrape` | $0.01 |
| Firecrawl Crawl | `/firecrawl/v1/crawl` | $0.02 |
| Firecrawl Map | `/firecrawl/v1/map` | $0.01 |
| Firecrawl Extract | `/firecrawl/v1/extract` | $0.02 |
| Jina Reader | `/jina/v1/read` | $0.005 |
| ScreenshotOne | `/screenshot/v1/capture` | $0.01 |
| PDFShift (HTML to PDF) | `/pdfshift/v1/convert` | $0.01 |
| QR Code | `/qrcode/v1/generate` | $0.005 |

### Translation
| Service | Endpoint | Price |
|---------|----------|-------|
| DeepL (translate) | `/deepl/v1/translate` | $0.005 |
| Google Translate | `/translate/v1/translate` | $0.005 |
| Google Detect Language | `/translate/v1/detect` | $0.005 |

### Intelligence
| Service | Endpoint | Price |
|---------|----------|-------|
| Hunter.io (domain search) | `/hunter/v1/search` | $0.02 |
| Hunter.io (verify email) | `/hunter/v1/verify` | $0.02 |
| IPinfo (IP lookup) | `/ipinfo/v1/lookup` | $0.005 |

### Tools & Compute
| Service | Endpoint | Price |
|---------|----------|-------|
| Judge0 Code Exec | `/judge0/v1/submissions` | $0.005 |
| Judge0 Languages | `/judge0/v1/languages` | $0.005 |
| Resend Email | `/resend/v1/emails` | $0.005 |
| Resend Batch Email | `/resend/v1/emails/batch` | $0.01 |

### Commerce
| Service | Endpoint | Price |
|---------|----------|-------|
| Lob Postcards | `/lob/v1/postcards` | $1.00 |
| Lob Letters | `/lob/v1/letters` | $1.50 |
| Lob Address Verify | `/lob/v1/verify` | $0.01 |
| Printful (browse) | `/printful/v1/products` | $0.005 |
| Printful (estimate) | `/printful/v1/estimate` | $0.005 |
| Printful (order) | `/printful/v1/order` | dynamic |

### Messaging
| Service | Endpoint | Price |
|---------|----------|-------|
| Pushover | `/pushover/v1/push` | $0.005 |

### Security
| Service | Endpoint | Price |
|---------|----------|-------|
| VirusTotal (URL/file scan) | `/virustotal/v1/scan` | $0.01 |

### Finance
| Service | Endpoint | Price |
|---------|----------|-------|
| ExchangeRate (rates) | `/exchangerate/v1/rates` | $0.005 |
| ExchangeRate (convert) | `/exchangerate/v1/convert` | $0.005 |

### Utility
| Service | Endpoint | Price |
|---------|----------|-------|
| Short.io (URL shortener) | `/shortio/v1/shorten` | $0.005 |

## Example Commands

### Ask an AI model
```bash
t2000 pay https://mpp.t2000.ai/openai/v1/chat/completions \
  --data '{"model":"gpt-4o","messages":[{"role":"user","content":"Explain quantum computing in 3 sentences"}]}'
```

### Search the web
```bash
t2000 pay https://mpp.t2000.ai/brave/v1/web/search \
  --data '{"q":"latest Sui blockchain news"}'
```

### Generate an image
```bash
t2000 pay https://mpp.t2000.ai/fal/fal-ai/flux/dev \
  --data '{"prompt":"a futuristic city at sunset, cyberpunk style"}'
```

### Check weather
```bash
t2000 pay https://mpp.t2000.ai/openweather/v1/weather \
  --data '{"q":"Tokyo"}'
```

### Send an email
```bash
t2000 pay https://mpp.t2000.ai/resend/v1/emails \
  --data '{"from":"agent@t2000.ai","to":"user@example.com","subject":"Hello","text":"Sent by an AI agent"}'
```

### Execute code
```bash
t2000 pay https://mpp.t2000.ai/judge0/v1/submissions \
  --data '{"source_code":"print(42)","language_id":71}'
```

### Send physical mail
```bash
# Send a postcard
t2000 pay https://mpp.t2000.ai/lob/v1/postcards \
  --max-price 2 \
  --data '{
    "to":{"name":"Jane Doe","address_line1":"123 Main St","address_city":"San Francisco","address_state":"CA","address_zip":"94105"},
    "from":{"name":"AI Agent","address_line1":"456 Oak Ave","address_city":"Palo Alto","address_state":"CA","address_zip":"94301"},
    "front":"https://example.com/front.png",
    "back":"https://example.com/back.png",
    "use_type":"operational"
  }'

# Send a letter
t2000 pay https://mpp.t2000.ai/lob/v1/letters \
  --max-price 2 \
  --data '{
    "to":{"name":"Jane Doe","address_line1":"123 Main St","address_city":"San Francisco","address_state":"CA","address_zip":"94105"},
    "from":{"name":"AI Agent","address_line1":"456 Oak Ave","address_city":"Palo Alto","address_state":"CA","address_zip":"94301"},
    "file":"https://example.com/letter.pdf",
    "use_type":"operational",
    "color":false
  }'

# Verify a US address
t2000 pay https://mpp.t2000.ai/lob/v1/verify \
  --data '{"primary_line":"123 Main St","city":"San Francisco","state":"CA","zip_code":"94105"}'
```

### Get directions
```bash
t2000 pay https://mpp.t2000.ai/googlemaps/v1/directions \
  --data '{"origin":"San Francisco, CA","destination":"Palo Alto, CA"}'
```

### Get crypto prices
```bash
t2000 pay https://mpp.t2000.ai/coingecko/v1/price \
  --data '{"ids":"sui,bitcoin,ethereum","vs_currencies":"usd"}'
```

### Get a stock quote
```bash
t2000 pay https://mpp.t2000.ai/alphavantage/v1/quote \
  --data '{"symbol":"AAPL"}'
```

### Get breaking news
```bash
t2000 pay https://mpp.t2000.ai/newsapi/v1/headlines \
  --data '{"country":"us","category":"technology"}'
```

### Translate text
```bash
t2000 pay https://mpp.t2000.ai/deepl/v1/translate \
  --data '{"text":["Hello, how are you?"],"target_lang":"ES"}'
```

### Semantic search
```bash
t2000 pay https://mpp.t2000.ai/exa/v1/search \
  --data '{"query":"best practices for AI agent payments","numResults":5}'
```

### Read a URL as markdown
```bash
t2000 pay https://mpp.t2000.ai/jina/v1/read \
  --data '{"url":"https://docs.sui.io/concepts/tokenomics"}'
```

### Google search (structured)
```bash
t2000 pay https://mpp.t2000.ai/serper/v1/search \
  --data '{"q":"Sui blockchain TVL 2026"}'
```

### Screenshot a webpage
```bash
t2000 pay https://mpp.t2000.ai/screenshot/v1/capture \
  --data '{"url":"https://example.com","format":"png","viewport_width":"1280"}'
```

### Generate a QR code
```bash
t2000 pay https://mpp.t2000.ai/qrcode/v1/generate \
  --data '{"data":"https://t2000.ai","size":"400x400"}'
```

### Convert HTML to PDF
```bash
t2000 pay https://mpp.t2000.ai/pdfshift/v1/convert \
  --data '{"source":"https://t2000.ai/docs"}'
```

### Run a Replicate model
```bash
t2000 pay https://mpp.t2000.ai/replicate/v1/predictions \
  --data '{"model":"meta/llama-3-70b-instruct","input":{"prompt":"Explain DeFi in 3 sentences"}}'
```

### Find emails for a domain
```bash
t2000 pay https://mpp.t2000.ai/hunter/v1/search \
  --data '{"domain":"mystenlabs.com"}'
```

### Look up an IP address
```bash
t2000 pay https://mpp.t2000.ai/ipinfo/v1/lookup \
  --data '{"ip":"8.8.8.8"}'
```

### Order print-on-demand merchandise
```bash
t2000 pay https://mpp.t2000.ai/printful/v1/order \
  --max-price 30 \
  --data '{"recipient":{"name":"Jane Doe","address1":"123 Main St","city":"SF","state_code":"CA","country_code":"US","zip":"94105"},"items":[{"variant_id":4012,"quantity":1,"files":[{"url":"https://example.com/design.png"}]}]}'
```

### Search for flights
```bash
t2000 pay https://mpp.t2000.ai/serpapi/v1/flights \
  --data '{"departure_id":"LAX","arrival_id":"NRT","outbound_date":"2026-05-01","type":"2"}'
```

### Convert currency
```bash
t2000 pay https://mpp.t2000.ai/exchangerate/v1/convert \
  --data '{"from":"USD","to":"EUR","amount":100}'
```

### Scan a URL for malware
```bash
t2000 pay https://mpp.t2000.ai/virustotal/v1/scan \
  --data '{"url":"https://suspicious-site.com"}'
```

### Shorten a URL
```bash
t2000 pay https://mpp.t2000.ai/shortio/v1/shorten \
  --data '{"url":"https://example.com/very/long/url/path"}'
```

### Send a push notification
```bash
t2000 pay https://mpp.t2000.ai/pushover/v1/push \
  --data '{"user":"USER_KEY","message":"Your agent has a message!"}'
```

## Flow (automatic)
1. Makes initial HTTP request to the URL
2. If 402: reads MPP challenge for amount and terms
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
- `UNSUPPORTED_NETWORK`: MPP requires a network other than Sui
- `PAYMENT_EXPIRED`: payment challenge has expired
- `DUPLICATE_PAYMENT`: nonce already used on-chain

## MCP
Via MCP: use `t2000_services` to discover services, then `t2000_pay` to call them.
