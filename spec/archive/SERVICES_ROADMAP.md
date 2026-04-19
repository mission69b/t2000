# Services Roadmap — Path to 50

> From 17 services to 50. Prioritized by what agents actually need.
> **Current: 40 services, 88 endpoints (Track A complete)**

---

## Current State (40 services, 88 endpoints — Track A DONE)

| # | Service | Endpoints | Category | Status |
|---|---------|-----------|----------|--------|
| 1 | OpenAI | 5 | AI | LIVE |
| 2 | Anthropic | 1 | AI | LIVE |
| 3 | Google Gemini | 3 | AI | LIVE |
| 4 | DeepSeek | 1 | AI | LIVE |
| 5 | Groq | 2 | AI | LIVE |
| 6 | Together AI | 3 | AI | LIVE |
| 7 | Perplexity | 1 | AI, Search | LIVE |
| 8 | fal.ai | 5 | AI, Media | LIVE |
| 9 | ElevenLabs | 2 | AI, Media | LIVE |
| 10 | Brave Search | 5 | Search | LIVE |
| 11 | Firecrawl | 4 | Web | LIVE |
| 12 | OpenWeather | 2 | Data | LIVE |
| 13 | Google Maps | 3 | Data | LIVE |
| 14 | Judge0 | 2 | Compute | LIVE |
| 15 | Resend | 2 | Communication | LIVE |
| 16 | Lob | 3 | Commerce | LIVE |
| 18 | CoinGecko | 3 | Data | LIVE |
| 19 | Alpha Vantage | 3 | Data | LIVE |
| 20 | NewsAPI | 2 | Data, Search | LIVE |
| 21 | DeepL | 1 | Translation | LIVE |
| 22 | Exa | 2 | Search, AI | LIVE |
| 23 | Jina Reader | 1 | Web, Data | LIVE |
| 24 | ScreenshotOne | 1 | Web | LIVE |
| 25 | PDFShift | 1 | Web, Data | LIVE |
| 26 | QR Code | 1 | Data | LIVE |
| 27 | Replicate | 2 | AI, Media | LIVE |
| 28 | Stability AI | 2 | AI, Media | LIVE |
| 29 | AssemblyAI | 2 | AI, Media | LIVE |
| 30 | Hunter.io | 2 | Data | LIVE |
| 31 | IPinfo | 1 | Data | LIVE |
| 32 | Printful | 3 | Commerce | LIVE |
| 33 | Google Translate | 2 | Translation | LIVE |
| 34 | Serper | 2 | Search | LIVE |
| 35 | SerpAPI | 2 | Search | LIVE |

---

## The Principle

Every service must answer: **"What can an agent do now that it couldn't before?"**

Skip services that are just "another AI model" — we have 7 AI providers already. Focus on services that give agents new *capabilities*: communicate, buy things, manage infrastructure, access real-world data, create digital assets.

---

## Two Tracks

Services fall into two integration patterns. Ship Track A first — no new gateway architecture needed.

### Track A: Gateway-Hosted Key

t2000 holds the upstream API key. Agent pays USDC, gateway proxies. Same pattern as all 17 existing services. **Ship these immediately.**

### Track B: Bring Your Own Key (BYOK)

User-specific services where the agent passes credentials in the request body. The gateway strips auth, injects it into the upstream call, and charges an MPP fee. Value prop: unified billing, MCP tool integration, single payment method for everything.

**BYOK pattern:**
```
POST /github/v1/repos
Body: { "auth": "ghp_xxx", "name": "my-project", "private": true }
     → Gateway strips auth, calls api.github.com with Bearer ghp_xxx
     → Agent pays $0.005 USDC for the convenience
```

**Ship Track B after Track A is done.** Needs a `chargeProxyBYOK()` helper that accepts user auth from the request body and injects it into the upstream call.

---

## Wave 4 — Communication & Data (services 18-26) — Track A — DONE

All gateway-hosted. t2000 owns the API keys and accounts.

| # | Service | What it unlocks | Upstream | Endpoints | Price | Status |
|---|---------|----------------|----------|-----------|-------|--------|
| 18 | ~~Twilio SMS~~ | ~~Agent sends text messages~~ | — | — | — | DROPPED |
| 19 | **CoinGecko** | Crypto prices, market cap, trending coins | `api.coingecko.com` | 3 (price, markets, trending) | $0.005/req | LIVE |
| 20 | **Alpha Vantage** | Stock prices, forex, earnings data | `alphavantage.co` | 3 (quote, daily, search) | $0.005/req | LIVE |
| 21 | **NewsAPI** | Breaking news by topic, country, source | `newsapi.org` | 2 (headlines, search) | $0.005/req | LIVE |
| 22 | **DeepL** | Translate text across 30+ languages | `api-free.deepl.com` | 1 (translate) | $0.005/req | LIVE |
| 23 | **Exa** | AI-native semantic search (finds content by meaning) | `api.exa.ai` | 2 (search, contents) | $0.01/req | LIVE |
| 24 | **Jina Reader** | Convert any URL to clean LLM-ready markdown | `r.jina.ai` | 1 (read) | $0.005/req | LIVE |
| 25 | **ScreenshotOne** | Capture any webpage as PNG or PDF | `api.screenshotone.com` | 1 (capture) | $0.01/req | LIVE |
| 26 | **PDFShift** | Convert HTML to professional PDF documents | `api.pdfshift.io` | 1 (convert) | $0.01/req | LIVE |

**8 of 9 shipped.** Twilio SMS dropped — requires phone number provisioning, revisit later.

**Agent use cases:**
- "What's the current price of SUI and ETH?" → CoinGecko
- "Translate this email to Spanish" → DeepL
- "Find me recent research papers about agent payments" → Exa
- "Take a screenshot of competitor.com's pricing page" → ScreenshotOne
- "Create a PDF of my portfolio report" → PDFShift

---

## Wave 5 — Utilities & Compute (services 27-33) — Track A — DONE

More gateway-hosted services. Tools that help agents create and process things.

| # | Service | What it unlocks | Upstream | Endpoints | Price | Status |
|---|---------|----------------|----------|-----------|-------|--------|
| 27 | **QR Code** | Generate QR codes for any URL or text | `api.qrserver.com` | 1 (generate) | $0.005/req | LIVE |
| 28 | **Replicate** | Run any open-source ML model (thousands available) | `api.replicate.com` | 2 (predict, status) | $0.02/req | LIVE |
| 29 | **Stability AI** | Image generation + editing (SD3) | `api.stability.ai` | 2 (generate, edit) | $0.03/req | LIVE |
| 30 | **AssemblyAI** | Advanced transcription (speaker labels, summaries) | `api.assemblyai.com` | 2 (transcribe, result) | $0.02/req | LIVE |
| 31 | ~~E2B~~ | ~~Cloud sandboxes~~ | — | — | — | DROPPED |
| 32 | **Hunter.io** | Find professional email addresses by name or domain | `api.hunter.io` | 2 (search, verify) | $0.01/req | LIVE |
| 33 | **IPinfo** | IP geolocation, ASN, company, VPN detection | `ipinfo.io` | 1 (lookup) | $0.005/req | LIVE |

**6 of 7 shipped.** E2B dropped — REST API requires SDK for code execution, revisit later.

**Agent use cases:**
- "Generate a QR code linking to our Discord invite" → QR Code
- "Run this Llama 3 model on my custom prompt" → Replicate
- "Transcribe this meeting recording and show me who said what" → AssemblyAI
- "Find the email address for the CEO of Acme Corp" → Hunter.io

---

## Wave 6 — Commerce & Physical World (services 34-38) — Track A — DONE

Agents buying real things. The differentiator nobody else has.

| # | Service | What it unlocks | Upstream | Endpoints | Price | Status |
|---|---------|----------------|----------|-----------|-------|--------|
| 34 | **Printful** | Print-on-demand — shirts, mugs, posters, shipped to an address | `api.printful.com` | 3 (products, estimate, order) | dynamic | LIVE |
| 35 | **Google Translate** | Translation via Google Cloud (130+ languages, auto-detect) | `translation.googleapis.com` | 2 (translate, detect) | $0.005/req | LIVE |
| 36 | **Serper** | Google Search results as structured JSON (fast, cheap) | `google.serper.dev` | 2 (search, images) | $0.005/req | LIVE |
| 37 | ~~Abstract API~~ | ~~Email validation, IP geo, VAT, phone validation~~ | — | — | — | DROPPED |
| 38 | **SerpAPI** | Google, Bing, YouTube search results with structured data | `serpapi.com` | 2 (search, locations) | $0.01/req | LIVE |

**4 of 5 shipped.** Abstract API dropped — API key not provisioned, revisit later.

**Printful note:** Order flow: agent specifies product ID + shipping address. t2000 holds the Printful store (ID via `PRINTFUL_STORE_ID` env var). Uses `chargeCustom()` for dynamic pricing. Estimate and order routes inject `X-PF-Store-Id` header.

**Agent use cases:**
- "Order 25 t-shirts with this design, ship to 379 University Ave" → Printful
- "Search Google for 'best Sui wallets 2026' and return the top 10 results" → Serper

---

## Wave 7a — Viral Services (services 36-41) — Track A — PRIORITY

Services that tell compelling real-world stories on Twitter/X. Prioritize these — they drive awareness.

| # | Service | The tweet | Upstream | Endpoints | Price | Difficulty |
|---|---------|-----------|----------|-----------|-------|------------|
| 36 | **Suno** | "My agent composed a song about Sui" | `api.suno.ai` | 2 (generate, status) | $0.05/song | Medium |
| 37 | **Heygen** | "My agent made a video of me presenting" | `api.heygen.com` | 2 (create, status) | $0.10/video | Medium |
| 38 | **Runway** | "My agent turned my photo into a video" | `api.runwayml.com` | 2 (generate, status) | $0.05/gen | Medium |
| 39 | **Twilio SMS** | "My agent texts me when portfolio hits $1K" | `api.twilio.com` | 1 (send) | $0.02/msg | Medium |
| 40 | **Pushover** | "My agent sends push notifications to my phone" | `api.pushover.net` | 1 (send) | $0.005/msg | Easy |
| 41 | **Amadeus** | "My agent found me flights to Tokyo for $400" | `api.amadeus.com` | 2 (search, pricing) | $0.01/search | Medium |

**6 services, ~10 endpoints.**

**Twilio SMS note:** Phone provisioning was the original blocker. Solution: provision a single shared sender number for the gateway. Users provide their own phone number in the request body. No per-user provisioning needed.

**Async services (Suno, Heygen, Runway):** Same two-endpoint pattern as Replicate/AssemblyAI — submit job (pays here), poll for result (free).

**Agent use cases:**
- "Compose a lo-fi beat about staking on Sui" → Suno
- "Create a 30-second video explaining what MPP is" → Heygen
- "Turn this screenshot into a short animation" → Runway
- "Text me at +1234567890 when my balance drops below $10" → Twilio SMS
- "Find me the cheapest flights from SFO to NRT next week" → Amadeus

---

## Wave 7b — Utility Services (services 42-48) — Track A

Useful capabilities, less flashy but agents need them.

| # | Service | What it unlocks | Upstream | Endpoints | Price | Difficulty |
|---|---------|----------------|----------|-----------|-------|------------|
| 42 | **Mistral AI** | European AI models (Mistral Large, Codestral) | `api.mistral.ai` | 2 (chat, embeddings) | $0.005/req | Easy |
| 43 | **Cohere** | Embeddings, reranking, RAG-optimized models | `api.cohere.com` | 3 (chat, embed, rerank) | $0.005/req | Easy |
| 44 | **Remove.bg** | Background removal from any image | `api.remove.bg` | 1 (remove) | $0.01/req | Easy |
| 45 | **VirusTotal** | URL/file/domain security scanning | `www.virustotal.com/api` | 2 (scan URL, scan file) | $0.01/req | Easy |
| 46 | **ExchangeRate API** | Forex rates for 140+ fiat currencies | `v6.exchangerate-api.com` | 2 (latest, convert) | $0.005/req | Easy |
| 47 | **Postmark** | Transactional email (high deliverability) | `api.postmarkapp.com` | 2 (send, batch) | $0.005/email | Easy |
| 48 | **Short.io** | URL shortening with analytics | `api.short.io` | 2 (create, stats) | $0.005/req | Easy |

**7 services, ~14 endpoints.**

**Agent use cases:**
- "Is this URL safe to visit?" → VirusTotal
- "What's the USD to EUR rate?" → ExchangeRate API
- "Remove the background from this product photo" → Remove.bg
- "Shorten this link for sharing" → Short.io

---

## Wave 8 — BYOK Services (services 50-61) — Track B — DEFERRED

User provides their own credentials. Higher friction but unlocks powerful integrations.

**Prerequisite:** Build `chargeProxyBYOK()` gateway helper first.

| # | Service | What it unlocks | Upstream | Endpoints | Price | Difficulty |
|---|---------|----------------|----------|-----------|-------|------------|
| 39 | **GitHub** | Create repos, issues, PRs, manage code | `api.github.com` | 4 (create repo, create issue, create file, list repos) | $0.005/req | Easy |
| 40 | **Slack** | Post messages and rich blocks to Slack channels | `slack.com/api` | 1 (post message) | $0.001/msg | Easy |
| 41 | **Discord Webhook** | Post messages and embeds to Discord channels | `discord.com/api` | 1 (post message) | $0.001/msg | Easy |
| 42 | **Telegram** | Send messages via bot to any chat | `api.telegram.org` | 1 (send message) | $0.001/msg | Easy |
| 43 | **Notion** | Create/update pages, query databases | `api.notion.so` | 3 (create page, query DB, update) | $0.005/req | Easy |
| 44 | **Cloudflare** | Manage DNS records, zones, and domain settings | `api.cloudflare.com` | 3 (list zones, create DNS, update DNS) | $0.01/req | Easy |
| 45 | **Vercel** | Deploy apps, manage projects, check deployments | `api.vercel.com` | 2 (deploy, list projects) | $0.05/deploy | Medium |
| 46 | **Upstash** | Serverless Redis — set, get, delete keys | `api.upstash.com` | 3 (set, get, del) | $0.001/req | Easy |
| 47 | **Neon** | Serverless Postgres — create databases, run SQL | `console.neon.tech/api` | 3 (create DB, run SQL, list) | $0.01/req | Medium |
| 48 | **Supabase** | Query tables, insert rows, upload files | `api.supabase.com` | 3 (query, insert, upload) | $0.005/req | Medium |
| 49 | **Hetzner** | Provision/destroy VPS servers ($4/mo) | `api.hetzner.cloud` | 3 (create, list, delete) | dynamic | Medium |
| 50 | **Stripe** | Create payment links and invoices | `api.stripe.com` | 3 (create link, create invoice, check) | $0.01/req | Medium |

**12 services, ~30 endpoints. Gets us to 50 total.**

**Estimated effort:** 4-5 days (includes building BYOK pattern)

**Why charge for BYOK?** The agent already has `t2000 pay` as its universal API interface. Even if the user has their own GitHub token, they pay $0.005 USDC for the convenience of: one command, one billing system, one MCP tool, one audit trail. The alternative is configuring each service's auth separately in every AI platform.

**BYOK auth pattern per service:**

| Service | Auth field in request body | How gateway injects it |
|---------|--------------------------|----------------------|
| GitHub | `"auth": "ghp_xxx"` | `Authorization: Bearer ghp_xxx` |
| Slack | `"webhook_url": "https://hooks.slack.com/..."` | POST directly to webhook URL |
| Discord | `"webhook_url": "https://discord.com/api/webhooks/..."` | POST directly to webhook URL |
| Telegram | `"bot_token": "123:ABC..."`, `"chat_id": "..."` | POST to `api.telegram.org/bot{token}/sendMessage` |
| Notion | `"auth": "ntn_xxx"` | `Authorization: Bearer ntn_xxx` |
| Cloudflare | `"auth": "cf_xxx"` | `Authorization: Bearer cf_xxx` |
| Vercel | `"auth": "vercel_xxx"` | `Authorization: Bearer vercel_xxx` |
| Upstash | `"url": "https://xxx.upstash.io"`, `"token": "xxx"` | `Authorization: Bearer xxx` |
| Neon | `"auth": "neon_xxx"` | `Authorization: Bearer neon_xxx` |
| Supabase | `"url": "https://xxx.supabase.co"`, `"auth": "eyJ..."` | `apikey: eyJ...` + `Authorization: Bearer eyJ...` |
| Hetzner | `"auth": "hetzner_xxx"` | `Authorization: Bearer hetzner_xxx` |
| Stripe | `"auth": "sk_live_xxx"` | `Authorization: Bearer sk_live_xxx` |

**Security note:** BYOK credentials are never stored by the gateway. They're extracted from the request body, used for the single upstream call, and discarded. The gateway is stateless. Users should be informed that their credentials transit through t2000's infrastructure — trust model is the same as any API proxy.

**Slack/Discord note:** These use webhook URLs, not API keys. The webhook URL IS the auth — anyone with the URL can post. The gateway just forwards the message payload to the URL. No key injection needed.

**Hetzner/Stripe note:** These involve real money (server costs, payment processing). The gateway charges a flat MPP fee ($0.01) for the API call but the actual resource cost is billed to the user's Hetzner/Stripe account. Make this clear in the docs.

---

## Dropped Services (and why)

| Service | Reason dropped |
|---------|---------------|
| ~~Twilio SMS~~ | ~~Requires phone number provisioning.~~ **UN-DROPPED** — moved to Wave 7a. Solution: single shared sender number, user provides recipient in request. |
| **E2B** | REST API insufficient — code execution requires the E2B SDK for sandbox lifecycle management. Not viable as a simple proxy. Revisit with SDK integration. |
| **Abstract API** | API key not provisioned. Multiple sub-APIs (email, IP, VAT, phone) each need separate keys. Revisit when keys are active. |
| **Twilio Voice** | Complex TwiML flow, not a simple proxy. Revisit later. |
| **Cal.com** | Niche use case + BYOK. Most agents don't book meetings. |
| **Wolfram Alpha** | Expensive API ($2,400/yr for commercial). Limited free tier. Perplexity + search cover most factual queries. |
| **Unsplash** | Free API with no auth needed. No value in proxying a free service. |
| **BitRefill** | No public API — requires partnership application. May revisit if they respond. |

---

## Summary: 17 → 60+

| Wave | Services | Shipped | Dropped | Track | Focus | Status |
|------|----------|---------|---------|-------|-------|--------|
| Original | 1-17 | 17 | 0 | A | AI, Search, Data, Compute, Commerce | DONE |
| Wave 4 | 18-26 | 8 | 1 (Twilio) | A | Data, Search, Translation, Utilities | DONE |
| Wave 5 | 27-33 | 6 | 1 (E2B) | A | AI, Compute, Utilities, Intelligence | DONE |
| Wave 6 | 34-38 | 4 | 1 (Abstract API) | A | Commerce, Search, Translation | DONE |
| Wave 7a | 36-41 | — | — | A | Viral: Music, Video, SMS, Flights | PRIORITY — Next |
| Wave 7b | 42-48 | — | — | A | Utility: AI models, Security, Forex, Email | TODO |
| Wave 8 | 49-60 | — | — | B | Infrastructure, Productivity, Commerce (BYOK) | DEFERRED |
| **Total** | | **35 live** | **3 dropped** | | **13 planned (A) + 12 deferred (B)** | |

**Track A: 35 shipped, 13 planned** (→ 48 Track A services)
**Track B: 12 services deferred** (BYOK, revisit later)

---

## Service Categories — Current (35 live)

| Category | Services | Count |
|----------|----------|-------|
| **AI & ML** | OpenAI, Anthropic, Gemini, DeepSeek, Groq, Together, Perplexity, Replicate, Stability AI | 9 |
| **Media** | fal.ai, ElevenLabs, AssemblyAI | 3 |
| **Search & Web** | Brave, Firecrawl, Exa, Jina Reader, Serper, SerpAPI, ScreenshotOne | 7 |
| **Data & Intelligence** | OpenWeather, Google Maps, CoinGecko, Alpha Vantage, NewsAPI, IPinfo, Hunter.io | 7 |
| **Communication** | Resend | 1 |
| **Translation & Docs** | DeepL, Google Translate, PDFShift, QR Code | 4 |
| **Compute** | Judge0 | 1 |
| **Commerce** | Lob, Printful | 2 |

## Service Categories at 48 (projected with Wave 7a + 7b)

| Category | Current | Wave 7 additions | Total |
|----------|---------|-------------------|-------|
| **AI & ML** | 9 | +Mistral, Cohere | 11 |
| **Media & Creative** | 3 | +Suno, Heygen, Runway, Remove.bg | 7 |
| **Search & Web** | 7 | +Short.io | 8 |
| **Data & Intelligence** | 7 | +ExchangeRate, Amadeus | 9 |
| **Communication** | 1 | +Twilio SMS, Pushover, Postmark | 4 |
| **Security** | 0 | +VirusTotal | 1 |
| **Translation & Docs** | 4 | — | 4 |
| **Compute** | 1 | — | 1 |
| **Commerce** | 3 | — | 3 |

---

## What Makes This Different from Tempo

Tempo has 50+ services but nearly all are AI model proxies. Their commerce story is PostalForm (1 service).

At 40 services today (50 planned), t2000 already has:
- **4 communication channels** (email, SMS, push notifications, transactional email) vs Tempo's 0
- **2 commerce services** (physical mail, print-on-demand) vs Tempo's 1
- **1 security tool** (URL scanning) vs Tempo's 0
- **4 document tools** (translation x2, PDFs, QR codes) vs Tempo's 0
- **8 search/web tools** (web search x3, scraping, semantic search, reader, screenshots, URL shortening) vs Tempo's 2
- **9 data/intelligence tools** (weather, maps, crypto, stocks, news, IP, email lookup, forex, flights) vs Tempo's ~2
- **7 media/creative tools** (image gen, voice, transcription, AI music, AI video x2, background removal) vs Tempo's ~2

**The pitch: Tempo lets agents think. t2000 lets agents act.**

---

## Pricing Strategy

| Category | Model | Examples |
|----------|-------|---------|
| AI APIs | Flat per-request | $0.005-0.05 |
| Data APIs | Flat per-request | $0.005-0.01 |
| Communication | Per-unit | $0.001-0.02/msg |
| Utilities | Flat per-request | $0.005-0.01 |
| Infrastructure (BYOK) | Flat per-request | $0.001-0.05/req |
| Commerce | Dynamic (cost + fee) | Face value + 3-5% |

---

## Implementation Notes

### Async Services Pattern

Some services (AssemblyAI, Replicate, Printful) return results asynchronously.

**Pattern:** Two-endpoint approach:
1. `POST /service/v1/submit` — Submit the job. Agent pays here. Returns `{ "id": "job_xxx" }`.
2. `POST /service/v1/result` — Poll for result by ID. Free (already paid on submit). Returns result or `{ "status": "processing" }`.

### chargeProxyBYOK() Helper

New gateway function for Track B services:

```ts
export function chargeProxyBYOK(options: {
  amount: string;
  upstream: (req: Request, auth: string) => Promise<Response>;
  authField?: string; // default: "auth"
}) { ... }
```

Extracts the auth field from request body, strips it before logging, passes it to the upstream function. Auth is never stored or logged.

### Dynamic Pricing (chargeCustom)

Already built and working for Lob and Printful. Same pattern extends to:
- Printful (product cost + shipping)
- Hetzner (server hourly cost)
- Stripe (no resource cost, just flat fee)

---

## Marketing Plan

> **Moved to `spec/MPP_GATEWAY_V2.md`** — see that doc for the full marketing campaign.
> It has the "Agents Can Buy Things Now" campaign (X/Twitter posts, visual assets, amplification strategy, timing).

---

## Open Questions

1. **BYOK security**: Credentials transit through t2000 infrastructure. Need clear docs about trust model. Consider end-to-end encryption for auth tokens in future.
2. **Printful shipping**: Agent must provide recipient address. Who handles returns? Likely: "no returns" policy for v1, recipient handles directly with Printful.
3. **Stripe scope**: Start with payment links only (simplest Stripe API). Skip Connect, invoices, subscriptions for v1.
4. **Rate limiting**: Add per-agent rate limits for BYOK services to prevent abuse of user credentials being funneled through gateway.
5. **Hetzner lifecycle**: Servers provisioned via gateway are on t2000's Hetzner account. Need cleanup policy (destroy after 30 days? agent manages lifecycle?). Alternative: BYOK only — user provides their own Hetzner token.
6. **Dropped services**: Revisit Twilio SMS (when demand justifies phone pool), E2B (if SDK integration becomes viable), Abstract API (when API keys are provisioned).
