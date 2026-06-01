---
name: t2000-services
description: >-
  Discover MPP services payable via `t2 pay`. Use when the user asks
  "what can I pay for?", "what AI models are available?", "show me the
  service catalog", "is there a weather API?", or any other discovery
  question. Pairs with the t2000-pay skill (discovery first, then pay).
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: t2000 CLI (npm install -g @t2000/cli)
---

# t2000: Discover MPP Services

## Purpose

Browse the live MPP gateway catalog at `mpp.t2000.ai` to find a service that matches the user's intent (chat, image gen, search, weather, email, code exec, mail, etc.) before calling `t2 pay`. The catalog has 40+ services across 88 endpoints with prices ranging from $0.005 to $30 per call.

## Rules

1. **Discover before paying.** Don't guess a URL — call `t2 services search` (CLI) or `t2000_services` (MCP) first. Service paths + pricing change as the gateway expands.
2. **Pick the cheapest endpoint that satisfies the user.** Many services have multiple tiers (e.g. `openai/v1/chat/completions` at $0.01 vs `openai/v1/audio/speech` at $0.05). Surface options.
3. **Surface pricing to the user before signing.** Every `t2 pay` write is opt-in via the user's own keypair — they deserve to know what they're spending.
4. **Live source of truth.** The catalog is fetched live from `https://mpp.t2000.ai/api/services` — what shows up via `t2 services search` is exactly what `t2 pay` can talk to.

## Commands

```bash
# Search by name / category / endpoint description (case-insensitive)
t2 services search <query>             # default limit: 10
t2 services search <query> --limit 50  # broaden the result set
t2 services search ""                  # list everything (empty query)

# Inspect a single service or endpoint URL
t2 services inspect <service-or-endpoint-url>

# JSON output for scripting
t2 services search "image" --json
t2 services inspect <url> --json
```

The CLI uses `T2000_GATEWAY_URL` (or `--gateway <url>`) to override the gateway base URL — useful for local dev against `apps/gateway`.

## Example workflow

### "What AI chat models are available?"

```bash
t2 services search "chat"
```

Returns a table of chat services (OpenAI, Anthropic, Gemini, Mistral, Cohere, DeepSeek, Groq, etc.) with cheapest endpoint price + base URL.

### "How much does GPT-4o cost?"

```bash
t2 services inspect https://mpp.t2000.ai/openai
```

Returns every OpenAI endpoint with method + path + price + description. The user picks one (e.g. `/v1/chat/completions` at $0.01) and copies the URL into a `t2 pay <url>` call.

### "Send an email via Resend"

```bash
t2 services search "email"
t2 services inspect https://mpp.t2000.ai/resend
```

Lists email + messaging services; inspect Resend to see `/v1/emails` at $0.05.

## Output (default — search)

```
3 services matching "chat":

OpenAI                  from $0.01  [ai, chat]
  url    https://mpp.t2000.ai/openai
  about  OpenAI Chat Completions API

Anthropic               from $0.01  [ai, chat]
  url    https://mpp.t2000.ai/anthropic
  about  Claude messages API

Mistral                 from $0.005 [ai, chat]
  url    https://mpp.t2000.ai/mistral
  about  Mistral chat completions

Use `t2 services inspect <url>` to see pricing + endpoints for a service.
```

## Output (default — inspect endpoint)

```
Service     OpenAI
URL         https://mpp.t2000.ai/openai
About       OpenAI Chat Completions API
Categories  ai, chat
Currency    USDC on Sui

POST /v1/chat/completions          $0.01  Chat completions (gpt-4o, gpt-4o-mini)
  url    https://mpp.t2000.ai/openai/v1/chat/completions

Pay with: `t2 pay https://mpp.t2000.ai/openai/v1/chat/completions`
```

## Output (--json)

```json
{
  "query": "chat",
  "count": 3,
  "services": [
    {
      "name": "OpenAI",
      "serviceUrl": "https://mpp.t2000.ai/openai",
      "description": "OpenAI Chat Completions API",
      "categories": ["ai", "chat"],
      "currency": "USDC",
      "chain": "Sui",
      "endpoints": [
        { "method": "POST", "path": "/v1/chat/completions", "price": "0.01", "description": "Chat completions" }
      ]
    }
  ]
}
```

## When called through MCP (`t2000_services` tool)

The MCP tool returns the full catalog JSON in one call (no search filter — the LLM filters in its head):

```json
{
  "services": [
    { "name": "OpenAI", "serviceUrl": "https://mpp.t2000.ai/openai", "endpoints": [...] },
    { "name": "Anthropic", "serviceUrl": "https://mpp.t2000.ai/anthropic", "endpoints": [...] },
    ...
  ]
}
```

For LLM-driven flows, this is the right shape — the LLM scans the catalog, picks the matching service, and calls `t2000_pay <url>` next.

## Categories (live)

The current catalog clusters into:

| Category | Services |
|---|---|
| AI / chat | OpenAI, Anthropic, Gemini, Mistral, Cohere, DeepSeek, Groq, … |
| AI / image gen | fal.ai, Stability AI, OpenAI DALL-E, Replicate |
| AI / audio | OpenAI Whisper, ElevenLabs, OpenAI TTS |
| Search | NewsAPI, Brave, Exa, Serper, SerpAPI, Jina |
| Weather / maps | OpenWeather, Google Maps |
| Finance | CoinGecko, AlphaVantage, ExchangeRate |
| Translation | DeepL, Google Translate |
| Code / utility | Judge0, screenshot-as-a-service, QR codes, PDFShift |
| Email / mail | Resend, Lob (postcards, letters, verify) |
| Commerce | Hunter (email discovery) |
| Security | VirusTotal |
| Messaging | Pushover |
| URL / IP | Short.io, IPinfo |

> The categories above are a snapshot — the live source is `t2 services search ""` (lists everything). New services land regularly.

## Error handling

| Error | Meaning |
|---|---|
| `GATEWAY_UNREACHABLE` | The gateway at `mpp.t2000.ai/api/services` is down or DNS is failing. Retry; if persistent, status page is at `t2000.ai`. |
| `No services match` | The search query returned zero hits. Suggest a broader query or `t2 services search ""` to list everything. |
| `No service matches <url>` (inspect) | The URL isn't in the catalog. Run `t2 services search` to find the right URL first. |

## What NOT to do

- Don't hardcode service URLs in your prompts. The catalog is the source of truth.
- Don't tell users a service costs "around $X" — call `t2 services inspect` and quote the exact price.
- Don't bundle `t2 services search` + `t2 pay` into a single hidden step. Show the user what you found before paying.
