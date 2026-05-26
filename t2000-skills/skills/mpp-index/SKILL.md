---
name: mpp-index
description: >-
  Intent-grouped discovery page for every MPP-protected service at
  mpp.t2000.ai. Use when picking a service: scan by "what I want to do",
  copy the one-line example, refine with the dedicated recipe (if one
  exists) or `t2000-pay`. 40 services, 88 endpoints, all payable with
  Sui USDC via `t2000 pay`. No API keys. No accounts.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: t2000 CLI (npx @t2000/cli init) + funded USDC balance
---

# MPP Recipe Index

Quick scan: find a service by what you're trying to do.

**Dedicated recipes** (open these for full details):
- 🖼️ `mpp-image-gen` — OpenAI image generation ($0.05)
- 💬 `mpp-gpt4o` — OpenAI chat completions ($0.01)
- 🎙️ `mpp-transcription` — OpenAI Whisper transcription ($0.01)

Everything else lives in this index with a one-line working example.

For the live, canonical service list call `t2000_services` (MCP) or `GET https://mpp.t2000.ai/api/services`.

---

## 🧠 I want to ask an LLM / generate text

| Use case | Service | Price | One-liner |
|---|---|---|---|
| Hosted GPT-4o (deep, multimodal) | OpenAI Chat | $0.01 | See `mpp-gpt4o` |
| Cheaper / faster general LLM | Together AI Chat | $0.005 | `t2000 pay https://mpp.t2000.ai/together/v1/chat/completions --data '{"model":"meta-llama/Llama-3.3-70B-Instruct-Turbo","messages":[{"role":"user","content":"…"}]}'` |
| Even cheaper, reasoning-strong | DeepSeek | $0.005 | `t2000 pay https://mpp.t2000.ai/deepseek/v1/chat/completions --data '{"model":"deepseek-chat","messages":[…]}'` |
| Fastest inference (groq) | Groq Chat | $0.005 | `t2000 pay https://mpp.t2000.ai/groq/v1/chat/completions --data '{"model":"llama-3.3-70b-versatile","messages":[…]}'` |
| Search-grounded answers | Perplexity | $0.01 | `t2000 pay https://mpp.t2000.ai/perplexity/v1/chat/completions --data '{"model":"sonar","messages":[…]}'` |
| Claude (long context, careful reasoning) | Anthropic | $0.01 | `t2000 pay https://mpp.t2000.ai/anthropic/v1/messages --data '{"model":"claude-3-5-sonnet-latest","max_tokens":500,"messages":[…]}'` |
| Gemini (free upstream tier, multimodal) | Google Gemini Flash | $0.005 | `t2000 pay https://mpp.t2000.ai/gemini/v1beta/models/gemini-2.5-flash --data '{"contents":[{"parts":[{"text":"…"}]}]}'` |
| EU-hosted, low-latency | Mistral | $0.005 | `t2000 pay https://mpp.t2000.ai/mistral/v1/chat/completions --data '{"model":"mistral-large-latest","messages":[…]}'` |
| Multilingual + reranking | Cohere | $0.005 | `t2000 pay https://mpp.t2000.ai/cohere/v1/chat --data '{"message":"…","model":"command-r-plus"}'` |

## 🔍 I want embeddings (vector search)

| Service | Price | One-liner |
|---|---|---|
| OpenAI Embeddings | $0.005 | `t2000 pay https://mpp.t2000.ai/openai/v1/embeddings --data '{"model":"text-embedding-3-small","input":"…"}'` |
| Together AI Embeddings | $0.005 | `t2000 pay https://mpp.t2000.ai/together/v1/embeddings --data '{"model":"BAAI/bge-large-en-v1.5","input":"…"}'` |
| Mistral Embeddings | $0.005 | `t2000 pay https://mpp.t2000.ai/mistral/v1/embeddings --data '{"model":"mistral-embed","input":["…"]}'` |
| Cohere Embed | $0.005 | `t2000 pay https://mpp.t2000.ai/cohere/v1/embed --data '{"texts":["…"],"model":"embed-english-v3.0","input_type":"search_document"}'` |
| Cohere Rerank | $0.005 | `t2000 pay https://mpp.t2000.ai/cohere/v1/rerank --data '{"query":"…","documents":["…","…"],"model":"rerank-v3.5"}'` |
| Gemini Embeddings | $0.005 | `t2000 pay https://mpp.t2000.ai/gemini/v1beta/models/embedding-001 --data '{"content":{"parts":[{"text":"…"}]}}'` |

## 🖼️ I want to generate an image

| Use case | Service | Price | One-liner |
|---|---|---|---|
| Highest quality (default) | OpenAI gpt-image-1 | $0.05 | See `mpp-image-gen` |
| Cheap / open-weights | Fal.ai Flux Dev | $0.03 | `t2000 pay https://mpp.t2000.ai/fal/fal-ai/flux/dev --data '{"prompt":"…"}'` |
| Premium quality | Fal.ai Flux Pro | $0.05 | `t2000 pay https://mpp.t2000.ai/fal/fal-ai/flux-pro --data '{"prompt":"…"}'` |
| Photorealistic | Fal.ai Flux Realism | $0.05 | `t2000 pay https://mpp.t2000.ai/fal/fal-ai/flux-realism --data '{"prompt":"…"}'` |
| Vector / illustration | Fal.ai Recraft 20B | $0.05 | `t2000 pay https://mpp.t2000.ai/fal/fal-ai/recraft-20b --data '{"prompt":"…","style":"vector_illustration"}'` |
| Together AI (batch-friendly) | Together AI Images | $0.03 | `t2000 pay https://mpp.t2000.ai/together/v1/images/generations --data '{"model":"black-forest-labs/FLUX.1-schnell-Free","prompt":"…"}'` |
| Stability AI (Stable Diffusion 3) | Stability Generate | $0.03 | `t2000 pay https://mpp.t2000.ai/stability/v1/generate --data '{"prompt":"…"}'` |
| Edit an existing image | Stability Edit | $0.03 | `t2000 pay https://mpp.t2000.ai/stability/v1/edit --data '{"image":"https://…","prompt":"add a red hat"}'` |
| Any model on Replicate | Replicate | $0.02 | `t2000 pay https://mpp.t2000.ai/replicate/v1/predictions --data '{"model":"black-forest-labs/flux-dev","input":{"prompt":"…"}}'` |

## 🎙️ I want speech / audio

| Use case | Service | Price | One-liner |
|---|---|---|---|
| Transcribe audio (default) | OpenAI Whisper | $0.01 | See `mpp-transcription` |
| Transcribe + diarize | AssemblyAI | $0.02 | `t2000 pay https://mpp.t2000.ai/assemblyai/v1/transcribe --max-price 0.05 --data '{"audio_url":"…","speaker_labels":true}'` (then poll `/assemblyai/v1/result` $0.005) |
| Cheaper / faster transcription | Groq Whisper | $0.005 | `t2000 pay https://mpp.t2000.ai/groq/v1/audio/transcriptions --data '{"file":"…","model":"whisper-large-v3"}'` |
| Open-source Whisper | Fal.ai Whisper | $0.01 | `t2000 pay https://mpp.t2000.ai/fal/fal-ai/whisper --data '{"audio_url":"…"}'` |
| Text → speech (OpenAI) | OpenAI TTS | $0.02 | `t2000 pay https://mpp.t2000.ai/openai/v1/audio/speech --data '{"model":"tts-1","input":"Hello","voice":"alloy"}'` |
| Text → speech (premium voices) | ElevenLabs TTS | $0.05 | `t2000 pay https://mpp.t2000.ai/elevenlabs/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM --data '{"text":"Hello"}'` |
| Sound effects | ElevenLabs SFX | $0.05 | `t2000 pay https://mpp.t2000.ai/elevenlabs/v1/sound-generation --data '{"text":"rain on a tin roof"}'` |

## 🌐 I want to search the web

| Use case | Service | Price | One-liner |
|---|---|---|---|
| Web search | Brave Web | $0.005 | `t2000 pay https://mpp.t2000.ai/brave/v1/web/search --data '{"q":"…"}'` |
| Image search | Brave Image | $0.005 | `t2000 pay https://mpp.t2000.ai/brave/v1/images/search --data '{"q":"…"}'` |
| News search | Brave News | $0.005 | `t2000 pay https://mpp.t2000.ai/brave/v1/news/search --data '{"q":"…"}'` |
| Video search | Brave Video | $0.005 | `t2000 pay https://mpp.t2000.ai/brave/v1/videos/search --data '{"q":"…"}'` |
| LLM summary of search | Brave Summarizer | $0.01 | `t2000 pay https://mpp.t2000.ai/brave/v1/summarizer/search --data '{"q":"…"}'` |
| Google search (structured) | Serper | $0.005 | `t2000 pay https://mpp.t2000.ai/serper/v1/search --data '{"q":"…"}'` |
| Google Flights | SerpAPI | $0.01 | `t2000 pay https://mpp.t2000.ai/serpapi/v1/flights --data '{"departure_id":"LAX","arrival_id":"NRT","outbound_date":"2026-07-01","type":"2"}'` |
| Semantic search (neural) | Exa | $0.01 | `t2000 pay https://mpp.t2000.ai/exa/v1/search --data '{"query":"…","numResults":5}'` |
| Get page content | Exa Contents | $0.01 | `t2000 pay https://mpp.t2000.ai/exa/v1/contents --data '{"urls":["https://…"]}'` |
| News headlines | NewsAPI | $0.005 | `t2000 pay https://mpp.t2000.ai/newsapi/v1/headlines --data '{"country":"us"}'` |

## 📄 I want to read / scrape a page

| Use case | Service | Price | One-liner |
|---|---|---|---|
| Scrape single page (markdown) | Firecrawl Scrape | $0.01 | `t2000 pay https://mpp.t2000.ai/firecrawl/v1/scrape --data '{"url":"https://…"}'` |
| Crawl whole site | Firecrawl Crawl | $0.02 | `t2000 pay https://mpp.t2000.ai/firecrawl/v1/crawl --data '{"url":"https://…","limit":50}'` |
| Map site URLs | Firecrawl Map | $0.01 | `t2000 pay https://mpp.t2000.ai/firecrawl/v1/map --data '{"url":"https://…"}'` |
| Extract structured data | Firecrawl Extract | $0.02 | `t2000 pay https://mpp.t2000.ai/firecrawl/v1/extract --data '{"urls":["https://…"],"schema":{…}}'` |
| Plain reader (markdown) | Jina Reader | $0.005 | `t2000 pay https://mpp.t2000.ai/jina/v1/read --data '{"url":"https://…"}'` |
| Screenshot a page | ScreenshotOne | $0.01 | `t2000 pay https://mpp.t2000.ai/screenshot/v1/capture --data '{"url":"https://…","format":"png"}'` |
| HTML → PDF | PDFShift | $0.01 | `t2000 pay https://mpp.t2000.ai/pdfshift/v1/convert --data '{"source":"https://…"}'` |
| QR code | QR Code | $0.005 | `t2000 pay https://mpp.t2000.ai/qrcode/v1/generate --data '{"data":"https://…","size":"400x400"}'` |

## 🌍 I want translation

| Use case | Service | Price | One-liner |
|---|---|---|---|
| Highest quality | DeepL | $0.005 | `t2000 pay https://mpp.t2000.ai/deepl/v1/translate --data '{"text":["Hello"],"target_lang":"ES"}'` |
| Google Translate | Google Translate | $0.005 | `t2000 pay https://mpp.t2000.ai/translate/v1/translate --data '{"q":"Hello","target":"es"}'` |
| Detect language | Google Detect | $0.005 | `t2000 pay https://mpp.t2000.ai/translate/v1/detect --data '{"q":"Bonjour"}'` |

## 📊 I want data (weather, maps, crypto, stocks)

| Use case | Service | Price | One-liner |
|---|---|---|---|
| Current weather | OpenWeather | $0.005 | `t2000 pay https://mpp.t2000.ai/openweather/v1/weather --data '{"q":"Tokyo"}'` |
| Forecast | OpenWeather Forecast | $0.005 | `t2000 pay https://mpp.t2000.ai/openweather/v1/forecast --data '{"q":"Tokyo"}'` |
| Geocode address | Google Maps Geocode | $0.01 | `t2000 pay https://mpp.t2000.ai/googlemaps/v1/geocode --data '{"address":"1 Hacker Way, Menlo Park"}'` |
| Search places | Google Maps Places | $0.01 | `t2000 pay https://mpp.t2000.ai/googlemaps/v1/places --data '{"query":"coffee in Tokyo"}'` |
| Directions | Google Maps Directions | $0.01 | `t2000 pay https://mpp.t2000.ai/googlemaps/v1/directions --data '{"origin":"SF","destination":"Palo Alto"}'` |
| Crypto price | CoinGecko Price | $0.005 | `t2000 pay https://mpp.t2000.ai/coingecko/v1/price --data '{"ids":"sui,bitcoin","vs_currencies":"usd"}'` |
| Crypto market | CoinGecko Markets | $0.005 | `t2000 pay https://mpp.t2000.ai/coingecko/v1/markets --data '{"vs_currency":"usd","ids":"sui"}'` |
| Stock quote | Alpha Vantage | $0.005 | `t2000 pay https://mpp.t2000.ai/alphavantage/v1/quote --data '{"symbol":"AAPL"}'` |
| Currency conversion | ExchangeRate | $0.005 | `t2000 pay https://mpp.t2000.ai/exchangerate/v1/convert --data '{"from":"USD","to":"EUR","amount":100}'` |

## ✉️ I want to send / message / mail

| Use case | Service | Price | One-liner |
|---|---|---|---|
| Send email | Resend | $0.005 | `t2000 pay https://mpp.t2000.ai/resend/v1/emails --data '{"from":"agent@t2000.ai","to":"…","subject":"…","text":"…"}'` |
| Send batch email | Resend Batch | $0.01 | `t2000 pay https://mpp.t2000.ai/resend/v1/emails/batch --data '[{"from":"…","to":"…","subject":"…","text":"…"}]'` |
| Push notification | Pushover | $0.005 | `t2000 pay https://mpp.t2000.ai/pushover/v1/push --data '{"user":"USER_KEY","message":"…"}'` |
| Send a postcard | Lob Postcards | $1.00 | `t2000 pay https://mpp.t2000.ai/lob/v1/postcards --max-price 2 --data '{"to":{…},"from":{…},"front":"https://…","back":"https://…","use_type":"operational"}'` |
| Send a physical letter | Lob Letters | $1.50 | `t2000 pay https://mpp.t2000.ai/lob/v1/letters --max-price 2 --data '{"to":{…},"from":{…},"file":"https://…","use_type":"operational"}'` |
| Verify US address | Lob Verify | $0.01 | `t2000 pay https://mpp.t2000.ai/lob/v1/verify --data '{"primary_line":"123 Main St","city":"SF","state":"CA","zip_code":"94105"}'` |

## 🛒 I want commerce / fulfillment

| Use case | Service | Price | One-liner |
|---|---|---|---|
| Print-on-demand catalog | Printful Browse | $0.005 | `t2000 pay https://mpp.t2000.ai/printful/v1/products` |
| Shipping estimate | Printful Estimate | $0.005 | `t2000 pay https://mpp.t2000.ai/printful/v1/estimate --data '{"recipient":{…},"items":[{…}]}'` |
| Place an order | Printful Order | dynamic | `t2000 pay https://mpp.t2000.ai/printful/v1/order --max-price 30 --data '{"recipient":{…},"items":[{…}]}'` |

## 🔎 I want intelligence / OSINT

| Use case | Service | Price | One-liner |
|---|---|---|---|
| Find emails for a domain | Hunter.io Search | $0.02 | `t2000 pay https://mpp.t2000.ai/hunter/v1/search --data '{"domain":"…"}'` |
| Verify email | Hunter.io Verify | $0.02 | `t2000 pay https://mpp.t2000.ai/hunter/v1/verify --data '{"email":"…"}'` |
| Look up IP | IPinfo | $0.005 | `t2000 pay https://mpp.t2000.ai/ipinfo/v1/lookup --data '{"ip":"8.8.8.8"}'` |
| Scan URL for malware | VirusTotal | $0.01 | `t2000 pay https://mpp.t2000.ai/virustotal/v1/scan --data '{"url":"https://…"}'` |

## 🛠️ I want to run code / tools

| Use case | Service | Price | One-liner |
|---|---|---|---|
| Execute code (Judge0) | Judge0 | $0.005 | `t2000 pay https://mpp.t2000.ai/judge0/v1/submissions --data '{"source_code":"print(42)","language_id":71}'` |
| List languages | Judge0 Languages | $0.005 | `t2000 pay https://mpp.t2000.ai/judge0/v1/languages --method GET` |
| Shorten URL | Short.io | $0.005 | `t2000 pay https://mpp.t2000.ai/shortio/v1/shorten --data '{"url":"https://…"}'` |

---

## How recipes compose

The most common pattern is **chain two paid calls**:

```bash
# Scrape → summarize
TEXT=$(t2000 pay …/firecrawl/v1/scrape --data '{"url":"…"}' --json | jq -r '.data.markdown')
t2000 pay …/openai/v1/chat/completions --data "$(jq -nc --arg t "$TEXT" '{model:"gpt-4o-mini",messages:[{role:"user",content:$t}]}')"

# Transcribe → translate
TEXT=$(t2000 pay …/openai/v1/audio/transcriptions --data '{"file":"…"}' --json | jq -r '.text')
t2000 pay …/deepl/v1/translate --data "$(jq -nc --arg t "$TEXT" '{text:[$t],target_lang:"ES"}')"

# Search → answer
HITS=$(t2000 pay …/brave/v1/web/search --data '{"q":"…"}' --json)
t2000 pay …/openai/v1/chat/completions --data "$(jq -nc --argjson h "$HITS" '{model:"gpt-4o",messages:[{role:"system",content:"Answer using these sources."},{role:"user",content:($h|tostring)}]}')"
```

Always surface the cumulative cost to the user before kicking off a chain.

---

## See also

- `mpp-image-gen` / `mpp-gpt4o` / `mpp-transcription` — deep recipes for the 3 most-used services.
- `t2000-pay` — generic technical reference for the `t2000 pay` command (options, flags, errors).
- `t2000-services` — discovers the live service catalog at runtime.
- `https://mpp.t2000.ai/llms.txt` — agent-readable catalog.
- `https://mpp.t2000.ai/openapi.json` — full OpenAPI 3.1 spec.
