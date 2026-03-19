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
Active — requires `t2000` CLI with `@t2000/mpp-sui` installed.

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

## Available Services (17 services, 46 endpoints)

### AI Models
| Service | Endpoint | Price |
|---------|----------|-------|
| OpenAI | `/openai/v1/chat/completions` | $0.01 |
| Anthropic | `/anthropic/v1/messages` | $0.01 |
| Google Gemini | `/gemini/v1beta/models/gemini-2.5-flash` | $0.005 |
| DeepSeek | `/deepseek/v1/chat/completions` | $0.005 |
| Groq | `/groq/v1/chat/completions` | $0.005 |
| Together AI | `/together/v1/chat/completions` | $0.005 |
| Perplexity | `/perplexity/v1/chat/completions` | $0.01 |

### Media & Generation
| Service | Endpoint | Price |
|---------|----------|-------|
| OpenAI DALL-E | `/openai/v1/images/generations` | $0.05 |
| Fal.ai Flux | `/fal/fal-ai/flux/dev` | $0.03 |
| Together AI Images | `/together/v1/images/generations` | $0.03 |
| ElevenLabs TTS | `/elevenlabs/v1/text-to-speech/:voiceId` | $0.02 |
| ElevenLabs SFX | `/elevenlabs/v1/sound-generation` | $0.03 |

### Search & Data
| Service | Endpoint | Price |
|---------|----------|-------|
| Brave Web Search | `/brave/v1/web/search` | $0.005 |
| OpenWeather | `/openweather/v1/weather` | $0.005 |
| Google Maps Geocode | `/googlemaps/v1/geocode` | $0.005 |
| Google Maps Places | `/googlemaps/v1/places` | $0.01 |
| Google Maps Directions | `/googlemaps/v1/directions` | $0.01 |

### Tools
| Service | Endpoint | Price |
|---------|----------|-------|
| Judge0 Code Exec | `/judge0/v1/submissions` | $0.005 |
| Firecrawl Scrape | `/firecrawl/v1/scrape` | $0.01 |
| Resend Email | `/resend/v1/emails` | $0.005 |

### Commerce
| Service | Endpoint | Price |
|---------|----------|-------|
| Reloadly Gift Cards (browse) | `/reloadly/v1/products` | $0.005 |
| Reloadly Gift Cards (buy) | `/reloadly/v1/order` | dynamic |
| Lob Postcards | `/lob/v1/postcards` | $1.00 |
| Lob Letters | `/lob/v1/letters` | $1.50 |
| Lob Address Verify | `/lob/v1/verify` | $0.01 |

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

### Buy a gift card
```bash
# Browse available gift cards
t2000 pay https://mpp.t2000.ai/reloadly/v1/products \
  --data '{"countryCode":"US"}'

# Purchase a $20 Netflix gift card
t2000 pay https://mpp.t2000.ai/reloadly/v1/order \
  --max-price 25 \
  --data '{"productId":120,"unitPrice":20,"quantity":1,"countryCode":"US","recipientEmail":"user@example.com"}'
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

## Flow (automatic)
1. Makes initial HTTP request to the URL
2. If 402: reads MPP challenge for amount and terms
3. If price <= --max-price: pays via Sui USDC
4. Retries with credential header
5. Returns the API response body

## Safety
- If requested price exceeds --max-price, payment is refused (no funds spent)
- Default max-price: $1.00 USDC per request
- For commerce (gift cards, mail), set --max-price higher
- Payment only broadcast after 402 terms are validated

## Errors
- `PRICE_EXCEEDS_LIMIT`: API asking more than --max-price
- `INSUFFICIENT_BALANCE`: not enough available USDC
- `UNSUPPORTED_NETWORK`: MPP requires a network other than Sui
- `PAYMENT_EXPIRED`: payment challenge has expired
- `DUPLICATE_PAYMENT`: nonce already used on-chain

## MCP
Via MCP: use `t2000_services` to discover services, then `t2000_pay` to call them.
