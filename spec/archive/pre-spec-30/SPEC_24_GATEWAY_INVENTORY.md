# SPEC 24 Phase 1 — Gateway Inventory

> **Status:** Phase 1 complete 2026-05-11 ~19:50 AEST.
> **Local-only, gitignored.**
>
> This is the ground-truth inventory of MPP gateway services × engine tools × system prompt × audric host registry that locks Phase 2 fix scope.

---

## 1. Gateway catalog (24-I1)

**Endpoint:** `https://mpp.t2000.ai/api/services` (also reachable via `/services`).

**Probe results:**
- `GET /` → 200, 1.18s
- `GET /api/services` → 200, 0.86s, 19,214 bytes
- `GET /services` → 200, 0.96s
- `GET /api/catalog` → 404
- `GET /v1/services` → 404
- `GET /health` → 404

**Filter behavior — CRITICAL:** `?category=` query parameter is **silently IGNORED**. Probed `?category=media`, `?category=music`, `?category=audio`, `?category=ai` — all four returned the IDENTICAL 19,214-byte response (the full catalog). The gateway does no server-side filtering. **All filtering happens client-side in the engine `mpp_services` tool.**

**40 services live in the catalog**, organized by `categories: string[]` (each service can be in multiple categories). Distinct categories used by the gateway:

| Category | Count | Services |
|---|---|---|
| `ai` | 16 | openai, anthropic, fal, gemini, groq, perplexity, deepseek, together, elevenlabs, replicate, stability, assemblyai, mistral, cohere, exa |
| `media` | 8 | openai, fal, together, elevenlabs, replicate, stability, assemblyai |
| `data` | 11 | firecrawl, openweather, googlemaps, coingecko, alphavantage, newsapi, jina, pdfshift, qrcode, hunter, ipinfo |
| `search` | 7 | perplexity, brave, exa, serper, serpapi, newsapi |
| `web` | 5 | firecrawl, jina, screenshot, pdfshift |
| `commerce` | 2 | lob, printful |
| `translation` | 2 | deepl, translate |
| `communication` | 1 | resend |
| `compute` | 1 | judge0 |
| `messaging` | 1 | pushover |
| `security` | 1 | virustotal |
| `finance` | 1 | exchangerate |
| `utility` | 1 | shortio |

**Categories the LLM hallucinates that DO NOT exist:**
- `music` — no service in this category. Suno isn't deployed.
- `audio` — no service in this category. ElevenLabs is `ai/media` (TTS + sound effects).
- `pdf` — no service in this category. PDFShift is `web/data`.
- `image` — not a category. Image gen is `ai/media` (fal, openai, together, stability, replicate).
- `mail` / `postcard` — not a category. Lob is `commerce`.
- `flowers` / `cake` — not categories. Teleflora / CakeBoss aren't deployed.

**Full service list with prices (USDC per call):**

| Service | Categories | Endpoints | Price range |
|---|---|---|---|
| openai | ai, media | 5 (chat / embeddings / images-DALLE / whisper / TTS) | $0.001–$0.05 |
| anthropic | ai | 1 (messages) | $0.01 |
| fal | ai, media | 5 (Flux Dev / Flux Pro / Flux Realism / Recraft 20B / Whisper) | $0.01–$0.05 |
| firecrawl | web, data | 4 (scrape / crawl / map / extract) | $0.01–$0.05 |
| gemini | ai | 3 (Flash / Pro / embeddings) | $0.001–$0.02 |
| groq | ai | 2 (chat / Whisper) | $0.005 |
| perplexity | ai, search | 1 (Sonar) | $0.01 |
| brave | search | 5 (web / images / news / videos / summarizer) | $0.005–$0.01 |
| deepseek | ai | 1 (chat — V3 + R1) | $0.005 |
| resend | communication | 2 (email / batch) | $0.005–$0.01 |
| together | ai, media | 3 (chat / images / embeddings) | $0.001–$0.03 |
| elevenlabs | ai, media | 2 (TTS / sound-generation) | $0.05 |
| openweather | data | 2 (weather / forecast) | $0.005 |
| googlemaps | data | 3 (geocode / places / directions) | $0.01 |
| judge0 | compute | 2 (submissions / languages) | $0.001–$0.005 |
| lob | commerce | 3 (postcards / letters / verify) | $0.01–$1.50 |
| coingecko | data | 3 (price / markets / trending) | $0.005 |
| alphavantage | data | 3 (quote / daily / search) | $0.005 |
| newsapi | data, search | 2 (headlines / search) | $0.005 |
| deepl | translation | 1 (translate) | $0.005 |
| exa | search, ai | 2 (search / contents) | $0.01 |
| jina | web, data | 1 (read) | $0.005 |
| serper | search | 2 (search / images) | $0.005 |
| screenshot | web | 1 (capture) | $0.01 |
| pdfshift | web, data | 1 (convert) | $0.01 |
| qrcode | data | 1 (generate) | $0.005 |
| replicate | ai, media | 2 (predictions / status) | $0.001–$0.02 |
| stability | ai, media | 2 (generate / edit) | $0.03 |
| assemblyai | ai, media | 2 (transcribe / result) | $0.001–$0.02 |
| hunter | data | 2 (search / verify) | $0.02 |
| ipinfo | data | 1 (lookup) | $0.005 |
| translate | translation | 2 (translate / detect) | $0.005 |
| serpapi | search | 3 (search / flights / locations) | $0.005–$0.01 |
| printful | commerce | 3 (products / estimate / order) | $0.005–dynamic |
| pushover | messaging | 1 (push) | $0.005 |
| mistral | ai | 2 (chat / embeddings) | $0.005 |
| cohere | ai | 3 (chat / embed / rerank) | $0.005 |
| virustotal | security | 1 (scan) | $0.01 |
| exchangerate | finance | 2 (rates / convert) | $0.005 |
| shortio | utility | 1 (shorten) | $0.005 |

**Total endpoints across all services: ~80**

---

## 2. Engine tool source (24-I2)

### `mpp_services` tool (`packages/engine/src/tools/mpp-services.ts`, 174 lines)

**Default behavior (no args):** Returns full catalog (~40 services) as a single card. Fixed in v0.46.7 — pre-v0.46.7 default returned a `_refine` payload nudging the LLM to re-call with a category, which often led to the empty-card bug.

**Filter logic:**
```typescript
let filtered = catalog;
if (input.category) {
  const cat = input.category.toLowerCase();
  filtered = filtered.filter((s) => s.categories.some((c) => c.toLowerCase() === cat));
}
if (input.query) {
  filtered = filtered.filter((s) => matchesQuery(s, input.query!));
}
```

`matchesQuery` checks: service id, name, description, categories array, and endpoint descriptions — case-insensitive substring match. So `query: "music"` would match Suno's description if Suno existed, and would currently match nothing.

`category` is **exact lowercase match** against the gateway's `categories` array. So `category: "music"` returns `[]` because no service has `"music"` in its categories.

**No recovery loop.** When `filtered.length === 0`, the tool returns `{ services: [], total: 0 }` and the LLM has no signal that it should retry with a different filter.

**Caching:** 120s in-memory cache of the catalog. No cache busting needed for this tool (catalog is stable).

### `pay_api` tool

Not read in detail this phase. Confirmed:
- Returns `{ success, paymentDigest, price, serviceId, result }` (the `ServiceResult` shape that flows through to `<MppCardShell>`).
- No `tx` field (which is why SPEC 23B-MPP2 had to bypass `TransactionReceiptCard`).

---

## 3. System prompt MPP guidance (24-I3)

**The relevant text** (lines 9 + 33 of `packages/engine/src/prompt/index.ts`):

> "You can also call **40+ paid APIs (music, image, research, translation, weather, fulfilment) via MPP micropayments using the pay_api tool** — this is an internal capability, not a promoted product, so only mention it when the user asks for something that needs it."

> "For real-world questions (weather, search, news, prices), use pay_api. Tell the user the cost first."

**CRITICAL gaps in the prompt:**

1. **The prompt LIES about music availability.** It says "music, image, research, translation, weather, fulfilment" — but **there is no music service in the gateway**. The closest is ElevenLabs sound-generation ($0.05) which makes sound effects, not songs. This is the smoking gun for the "create a song about sui" smoke failure.

2. **No category enumeration.** The prompt doesn't list the 13 actual gateway categories (`ai`, `media`, `web`, `data`, `search`, `commerce`, `translation`, `communication`, `compute`, `messaging`, `security`, `finance`, `utility`) so the LLM invents categories like `music` / `audio` / `pdf` that the filter exact-matches to zero.

3. **No service enumeration.** The prompt doesn't list the 40 actual services. The LLM has no way to know that "PDF colouring book" needs `pdfshift` (web/data category), or that "image" needs `fal` / `openai` / `together` / `stability` / `replicate`.

4. **No discovery recovery guidance.** The prompt doesn't teach: "if `mpp_services` returns 0 results, call it again with no args to see the full catalog before declining." The tool description has guidance ("Use `mode:\"summary\"` first if you need to see the category list") but the LLM doesn't follow it under category-shaped queries.

5. **`pay_api` guidance is too narrow.** "For real-world questions (weather, search, news, prices), use pay_api" implies pay_api is for data fetches only. The 11 `commerce`/`media`/`compute`/etc. services aren't covered by this guidance.

---

## 4. Coverage matrix (24-I4)

### MPP_SERVICE_RENDERERS (audric `cards/mpp/registry.tsx`, 12 entries):

| Slug | Renderer | Live in gateway? | Notes |
|---|---|---|---|
| `fal` | CardPreview | ✅ | Routes correctly |
| `dalle` | CardPreview | ❌ DEAD | Gateway slug is `openai` for DALL-E (`openai/v1/images/generations`) |
| `dall-e` | CardPreview | ❌ DEAD | Same as above |
| `suno` | TrackPlayer | ❌ DEAD | Suno not deployed in gateway |
| `elevenlabs` | TrackPlayer | ✅ | Routes correctly (TTS + sound effects, NOT music) |
| `pdfshift` | BookCover | ✅ | Routes correctly |
| `lob` | VendorReceipt | ✅ | Routes correctly |
| `teleflora` | VendorReceipt | ❌ DEAD | Not deployed in gateway |
| `cakeboss` | VendorReceipt | ❌ DEAD | Not deployed |
| `amazon` | VendorReceipt | ❌ DEAD | Not deployed |
| `walmart` | VendorReceipt | ❌ DEAD | Not deployed |
| `partycity` / `party-city` | VendorReceipt | ❌ DEAD | Not deployed |
| `openweather` | VendorReceipt | ✅ | Routes correctly |
| `anthropic` | VendorReceipt | ✅ | Routes correctly |

**Registry correctness stats:**
- ✅ Live + routes: 6 entries (fal, elevenlabs, pdfshift, lob, openweather, anthropic)
- ❌ DEAD (registered, not in gateway): 7 entries (suno, teleflora, cakeboss, amazon, walmart, partycity, party-city) + 2 misnamed aliases (dalle, dall-e)

### Gateway services WITHOUT a per-vendor renderer (silent fall-through to `<GenericMppReceipt>`):

| Service | Categories | Notes |
|---|---|---|
| `openai` | ai, media | **Includes DALL-E images.** Currently renders Generic for image gen because `dalle`/`dall-e` aliases don't fire — the actual slug is `openai`. Needs special handling: dispatch on **endpoint** not slug for openai. |
| `firecrawl` | web, data | Web scraping. Result is structured JSON. Generic ok. |
| `gemini` | ai | Chat completions. Generic ok. |
| `groq` | ai | Chat + Whisper. Generic ok. |
| `perplexity` | ai, search | Sonar search. Could benefit from a search-style render. |
| `brave` | search | Web/images/news/videos. Could benefit from a search-style render. |
| `deepseek` | ai | Chat. Generic ok. |
| `resend` | communication | Email send. Could benefit from a send-style receipt (similar to Lob). |
| `together` | ai, media | Chat + images + embeddings. Image branch should route to CardPreview (similar to fal). |
| `googlemaps` | data | Geocode/places/directions. Could benefit from a map-style render. |
| `judge0` | compute | Code execution. Generic ok. |
| `coingecko` | data | Crypto prices. Generic ok (or PriceCard-style?). |
| `alphavantage` | data | Stock quotes. Generic ok (or PriceCard-style?). |
| `newsapi` | data, search | News headlines. Could benefit from a news-list render. |
| `deepl` | translation | Translation. Generic ok (or text-side-by-side render?). |
| `exa` | search, ai | Semantic search. Search-style render. |
| `jina` | web, data | URL → markdown. Generic ok. |
| `serper` | search | Google results. Search-style render. |
| `screenshot` | web | Webpage capture. Could route to CardPreview (it returns an image). |
| `qrcode` | data | QR generation. Could route to CardPreview (returns an image). |
| `replicate` | ai, media | Open-source models. Per-model rendering would be ideal but complex. |
| `stability` | ai, media | SD3 image gen. Should route to CardPreview. |
| `assemblyai` | ai, media | Transcription. Could benefit from a transcript-style render. |
| `hunter` | data | Email finder. Generic ok. |
| `ipinfo` | data | IP lookup. Generic ok. |
| `translate` | translation | Translation. Generic ok. |
| `serpapi` | search | Google/Bing/YouTube. Search-style render. |
| `printful` | commerce | Print-on-demand. **Should render like Lob** — VendorReceipt with shipping ETA. |
| `pushover` | messaging | Push notification. Generic ok. |
| `mistral` | ai | Chat. Generic ok. |
| `cohere` | ai | Chat + embed + rerank. Generic ok. |
| `virustotal` | security | URL/file scan. Generic ok. |
| `exchangerate` | finance | Forex rates. Generic ok. |
| `shortio` | utility | URL shortener. Could benefit from a copyable-URL render. |

**Coverage stats:**
- 6 of 40 (15%) live gateway services have a dedicated per-vendor primitive.
- 34 of 40 (85%) fall through to `<GenericMppReceipt>`.
- 7 dead registry entries pointing at services that don't exist in the gateway.

### STEP_ICONS (audric `AgentStep.tsx`):

`pay_api` has a single glyph `⚡`. There is NO per-MPP-service glyph dispatch today. The B-MPP3 work (per-vendor glyphs — ✦ DALL-E, ♪ ElevenLabs, 📄 PDFShift, ✉ Lob, etc.) is unimplemented. The code comment at line 31-34 acknowledges this is SPEC 23B territory (now folded into SPEC 24).

---

## 5. Phase 2 fix prioritization (locked from this inventory)

Fixes ranked by user-visible impact per day of work:

### F1 — System prompt rewrite (highest impact, ~½d)

**Replace** the misleading "music, image, research, translation, weather, fulfilment" enumeration with the **actual 13 gateway categories** + the most-useful 10 services + recovery guidance. Concretely:

- Add to `packages/engine/src/prompt/index.ts` an MPP guidance section listing the 13 categories.
- For 5 high-recall categories (`ai`, `media`, `commerce`, `data`, `search`), enumerate the 1–3 most-useful services so the LLM doesn't have to call `mpp_services` for common intents (e.g. "DALL-E images = `pay_api` to `openai/v1/images/generations`").
- Add explicit recovery guidance: "If `mpp_services` returns 0 results for a category-filtered query, call it once more with NO arguments to see the full catalog before telling the user it's not available."
- Remove the false "music" claim. Add an explicit "no music composition service is available — closest is ElevenLabs sound-generation for sound effects."

### F2 — Engine `mpp_services` 0-result auto-recovery (medium impact, ~½d)

Modify the tool: if a category-filtered call returns `services: []`, augment the response with a `_refine` payload listing the actual gateway categories so the LLM can self-correct in the same turn:

```typescript
if (filtered.length === 0 && input.category) {
  const validCategories = [...new Set(catalog.flatMap((s) => s.categories))].sort();
  return {
    data: {
      services: [],
      total: 0,
      _refine: {
        reason: `Category "${input.category}" doesn't exist on the gateway.`,
        validCategories,
        suggestion: 'Re-call with no `category` arg to see the full catalog, or pick from `validCategories`.',
      },
    },
    displayText: `No services in category "${input.category}". Valid: ${validCategories.join(', ')}.`,
  };
}
```

The LLM is instructed elsewhere to follow `_refine` payloads — this teaches it to recover from bad category guesses without giving up.

### F3 — Audric registry cleanup + key extensions (medium impact, ~½d)

- **Delete** the 7 dead entries (`suno`, `teleflora`, `cakeboss`, `amazon`, `walmart`, `partycity`, `party-city`) — they only confuse maintainers.
- **Add** an alias for openai's image endpoint. The dispatch needs to inspect the URL not just the slug for openai, since `openai/v1/images/generations` is image-gen but `openai/v1/chat/completions` is chat. Probably refactor `normaliseServiceSlug` → `normaliseServiceKey(serviceId, url)` so we can route on the endpoint path when needed.
- **Add** per-vendor entries for the 8 services where a bespoke render is clearly higher-value than Generic: `openai` (chat → VendorReceipt, image → CardPreview, audio → TrackPlayer), `together` (chat → VendorReceipt, image → CardPreview), `stability` (image → CardPreview), `replicate` (need to decide based on model), `printful` (VendorReceipt with shipping ETA — mirror Lob), `qrcode` (CardPreview-like image render), `screenshot` (CardPreview-like image render), `resend` (VendorReceipt — email send confirmation).

### F4 — B-MPP3: per-vendor STEP_ICONS glyphs (low impact UI polish, ~½d)

Add a `getPayApiGlyph(input: { url?: string }): string` helper that maps the call's URL to a vendor glyph:
- `openai/v1/images/generations` → ✦
- `openai/v1/audio/speech` → 🎤
- `openai/v1/chat/completions` → 💬
- `fal/...` → ✦
- `elevenlabs/v1/text-to-speech/...` → 🎤
- `elevenlabs/v1/sound-generation` → 🎶
- `pdfshift/v1/convert` → 📄
- `lob/v1/postcards` → ✉
- `lob/v1/letters` → ✉
- ... (one per popular vendor)

Wire into AgentStep header + ParallelToolsGroup row glyphs.

### F5 — Smoke harness (Phase 3, ~1–1.5d)

`apps/web/scripts/smoke-mpp.ts` — one test per live service, real-USDC for initial pin, stub for weekly CI. See SPEC 24 §3 Phase 3 for details.

---

## 6. Phase 2 sequencing

**Recommend:** F1 (prompt rewrite) → F2 (tool recovery) → F3 (registry cleanup + extensions) → F4 (glyphs). Then ship as one engine bump (F1+F2) + one audric ship (F3+F4) before moving to Phase 3.

**Effort total for Phase 2:** ~2d (½ + ½ + ½ + ½). On track for the SPEC 24 budget of ~3–4d total.

**Dependencies:**
- F1 + F2 are independent. Ship as one engine minor bump (`@t2000/engine@1.29.0`).
- F3 + F4 are independent of each other and of F1/F2. Ship as one audric commit after the engine bump lands.
- F5 (smoke harness) depends on F3 (renderer changes need to be in place for assertions to be accurate).

---

## 7. Risks surfaced from Phase 1

| Risk | Mitigation |
|---|---|
| The prompt rewrite (F1) might over-correct and bloat the system prompt by listing all 40 services. | Keep the enumeration to ~10 services + 13 categories. ~150 token cost. The `mpp_services` tool is still the canonical discovery surface. |
| The 0-recovery `_refine` payload (F2) might cause an infinite recovery loop if the LLM keeps picking bad categories. | Cap at one recovery attempt per turn. If the second call also returns 0, accept the LLM's decline. |
| Registry cleanup (F3) deletes vendors the founder might have plans for (e.g. partycity for Audric Store). | Document the deletion in a code comment + add a "to add a new vendor: …" pointer to SPEC 24 docs. |
| openai-style multi-endpoint dispatch (F3) introduces complexity to `normaliseServiceSlug`. | Add a comment + tests pinning the dispatch logic. |

---

**End Phase 1.** Proceed to Phase 2 — F1 (prompt rewrite) is the next concrete deliverable.

---

## 8. Supported services — LOCKED 5-service set (founder review 2026-05-11 ~20:05 AEST + audit fix 2026-05-11 ~20:30 AEST)

**Principle:** small, sharp, verb-aligned. Audric is a financial agent; MPP catalog breadth is not the moat. Every service we keep maps to a concrete user intent OR an Audric Store creator workflow at Phase 5 launch. Services we don't have, Audric says so honestly — that's better than offering 40 mediocre services badly.

**Audit fix 2026-05-11 ~20:30 AEST (Suno dropped):** The 6-service version listed Suno as "available (Phase 5)". Gateway probe `GET https://mpp.t2000.ai/api/services` confirms Suno is NOT actually deployed today. Listing it in the prompt would have repeated the same "lying about availability" mistake we're trying to fix. Suno joins via the add-back recipe (~5 min) when Phase 5 deploys it on the gateway.

**Locked set (5 of 40 — 87.5% cut):**

| # | Service | Purpose | Categories | Audience | Supported Endpoints |
|---|---|---|---|---|---|
| 1 | **openai** | DALL-E images + Whisper transcription + GPT-4o chat | ai, media | AI Swiss-army (image/transcription/chat) | 3 |
| 2 | **elevenlabs** | Premium TTS + sound generation | ai, media | Audio specialist (narration + SFX) | 2 |
| 3 | **pdfshift** | HTML/URL → PDF | web, data | Store eBook / colouring book binding | 1 |
| 4 | **lob** | Postcards, letters, address verify | commerce | Physical mail fulfillment | 3 |
| 5 | **resend** | Transactional email + batch | communication | "Email me this report" verb | 2 |

**Total supported endpoints: 11.** Smoke harness scope: 9 active tests today, ~$1.20 USDC initial pin (mostly Lob postcard at $1.00). When Suno joins in Phase 5: 6 services / 12 endpoints / 10 smoke tests / +$0.10 estimated smoke cost.

**Founder rationale captured (cut history):**

| Cut | Original 40-service set | Founder review 1 (10 services) | Founder review 2 (6 services) |
|---|---|---|---|
| Drop search / research | perplexity, newsapi, brave, serper, serpapi, exa | ✗ Dropped (Audric is action, not research) | — |
| Drop translation | deepl, translate | ✗ Dropped (English-default) | — |
| Drop code/security/lead-gen | judge0, hunter, virustotal, ipinfo | ✗ Dropped (wrong audience) | — |
| Drop alt-LLMs | gemini, groq, deepseek, together, mistral, cohere, replicate | ✗ Dropped (chat-zoo redundant) | — |
| Drop alt-services | coingecko, alphavantage, stability, qrcode, shortio, pushover, printful, firecrawl, jina, screenshot, googlemaps, assemblyai | ✗ Dropped (overlap or off-thesis) | — |
| Drop one-offs | openweather, exchangerate | ✓ Kept as "delightful one-offs" | ✗ Dropped (off-thesis; weather isn't financial; USD is crypto-default) |
| Drop fal | fal (image gen) | ✓ Kept as cheap image option | ✗ Dropped (DALL-E is "really good" — single image vendor) |
| Drop anthropic | anthropic (Claude chat) | ✓ Kept for Store content gen | ✗ Dropped (OpenAI GPT-4o chat covers it; one LLM vendor) |

**OpenAI endpoint cuts (founder review 2):** 5 endpoints → 3 supported.
- ✓ `/v1/images/generations` (DALL-E) — primary image gen
- ✓ `/v1/audio/transcriptions` (Whisper) — transcription verb
- ✓ `/v1/chat/completions` (GPT-4o) — Store creator content gen (replaces Anthropic)
- ✗ `/v1/embeddings` — internal infrastructure, no user-facing intent
- ✗ `/v1/audio/speech` (TTS) — ElevenLabs is the premium TTS lane; pick one TTS vendor

### Each vendor's lane (no two services overlap on the same intent)

| Asset / verb | Service |
|---|---|
| Image generation | OpenAI DALL-E |
| Transcription (audio → text) | OpenAI Whisper |
| Chat / content generation (long-form prose) | OpenAI GPT-4o |
| Premium TTS (narration) | ElevenLabs |
| Sound effects / music stings | ElevenLabs |
| PDF binding | PDFShift |
| Physical mail (postcards, letters) | Lob |
| Address verification | Lob |
| Songs (async-gen, Phase 5) | Suno |
| Transactional email | Resend |

### What we lose (trade-offs accepted)

- **No cheap image-gen tier.** $0.05 (DALL-E) is the floor; Fal Flux Dev was $0.03.
- **No photorealistic image gen.** Fal Flux Realism was tier-1 for photorealism; DALL-E 3 is good but not equivalent.
- **No vector / branded-asset image gen.** Fal Recraft was the differentiated lane.
- **No multi-LLM chat choice.** Only GPT-4o for content gen (Claude not exposed as a separate vendor — Audric internally is still Claude for the agent loop).
- **No cheap TTS tier.** ElevenLabs at $0.05 is the floor; OpenAI TTS was $0.02.
- **No weather, forex, news, search, translation, maps, scraping, code exec, security scanning, push notifications, URL shortening, IP lookup, lead gen, embeddings.**

If any of these become real, verified user demand, the **add-back recipe** (~5 min per service) makes the re-enable trivial.

### The 34 services to drop (final list)

**Chat / LLM zoo (one LLM vendor — OpenAI — covers chat):**
`anthropic`, `gemini`, `groq`, `deepseek`, `together`, `mistral`, `cohere`, `replicate`, `assemblyai`

**Image gen alternatives (DALL-E covers it):**
`fal`, `stability`

**One-offs / delightful but off-thesis:**
`openweather`, `exchangerate`

**Stack overlap with kept services or audric internals:**
`coingecko`, `alphavantage`, `qrcode`, `shortio`, `pushover`

**Wrong audience for Audric:**
`printful`, `judge0`, `hunter`, `virustotal`, `ipinfo`

**Search / research:**
`perplexity`, `newsapi`, `brave`, `serper`, `serpapi`, `exa`

**Web research / scraping:**
`firecrawl`, `jina`, `screenshot`, `googlemaps`

**Translation:**
`deepl`, `translate`

### Add-back recipe (for future gateway launches)

When a dropped service genuinely needs to come back (e.g. Fal Recraft for Audric Store creators wanting branded vector art, or DeepL when Audric ships in a non-English market):

1. Add ONE line to `MPP_SERVICE_RENDERERS` in `apps/web/components/engine/cards/mpp/registry.tsx`:
   ```ts
   fal: (data) => <CardPreview data={data} />,
   ```
2. Add ONE line to `getPayApiGlyph` (B-MPP3 helper, post-F4):
   ```ts
   case 'fal': return '✦';
   ```
3. Add ONE line to the system prompt MPP guidance section (under the right asset/verb).
4. Add ONE smoke-harness test in `apps/web/scripts/smoke-mpp.ts`.

**Total add-back cost per service: ~5 minutes.** Documented at the top of `MPP_SERVICE_RENDERERS` so any maintainer can find it. The cost of *not* having a service is far smaller than the maintenance cost of carrying 30+ stale entries.

---

## 9. Updated Phase 2 plan (against the locked 5-service set)

> **Status update 2026-05-11 ~21:00 AEST:**
> - **F1 + F2 SHIPPED** as engine 1.29.0 (commit `fd2c16ba`, GH Actions run `25666005084` in flight at writeup time).
> - **F3 + F4 PENDING** — audric ship after engine 1.29.0 lands on npm.
> - **Locked set tightened from 6 to 5** — Suno was dropped after Phase 1 audit confirmed it isn't actually deployed on the gateway today (would have repeated the "lying about availability" mistake we're trying to fix). Suno joins via add-back recipe (~5 min) when Phase 5 deploys it on the gateway.

The general Phase 2 outline (F1 → F2 → F3 → F4) doesn't change. The CONCRETE entries do:

### F1 — System prompt rewrite (revised for 5-service set, expanded scope, SHIPPED engine 1.29.0)

**Audit gaps caught + folded into F1 before ship (2026-05-11 ~20:30 AEST):**
- **`pay_api` tool description hardcoded `fal/fal-ai/flux/dev`** in the Lob postcard multi-step flow — would have made the LLM call a dropped service for every postcard request after F3 ships. Fixed: now uses `openai/v1/images/generations` (model "dall-e-3", $0.05).
- **`SERVICE_PRICES` map advertised stale prices for 14 dropped services** (fal $0.03, perplexity $0.01, brave $0.005, etc.) and missed every supported one — meaning DALL-E calls were estimated at the $0.005 default and would have surprised users with a 10x cost overshoot at confirmation. Fixed: rewritten with endpoint-aware pricing for all 5 supported services. Lob postcards/letters get distinct prices ($1.00 / $1.50) before the generic `/lob/` $0.01 catch-all.
- **Suno listed in the prompt as "available (Phase 5)"** — repeats the "lying about availability" mistake. Fixed: Suno removed from prompt entirely. Joins via add-back recipe when Phase 5 deploys it.
- **`pay_api` tool description claimed "40+ services (88 endpoints)"** — encouraged the LLM to think the surface was wider than what we support. Fixed: replaced with explicit 5-service enumeration up front + decline guidance for the rest.
- **JSON schema example URL was `openweather/v1/weather`** (an unsupported service post-SPEC-24). Fixed: now `openai/v1/images/generations`.
- **Multi-step PDF composition pattern was missing.** "Make me a colouring book about whales" couldn't reliably chain DALL-E × N + PDFShift. Fixed: added a 3-line "PDFShift composition guidance" block to the `pay_api` description PLUS a "Multi-step compositions" section to the system prompt that teaches the LLM to chain calls and quote total cost upfront.

**F1 final shipped scope:**

Replaces the misleading "music, image, research, translation, weather, fulfilment" enumeration with:

```
## MPP services (pay_api) — locked supported set

Audric supports exactly 5 MPP services (11 endpoints). Use mpp_services to discover the exact URL + body shape for the chosen endpoint, then call pay_api.

  openai      — DALL-E images $0.05, Whisper transcription $0.01, GPT-4o chat $0.01
  elevenlabs  — premium TTS $0.05, sound effects $0.05
  pdfshift    — HTML/URL → PDF conversion $0.01
  lob         — physical postcards $1.00, letters $1.50, address verification $0.01
  resend      — transactional email $0.005, batch email $0.01

Intent → service mapping (memorize):
- "Generate an image / make me a picture / illustrate" → openai DALL-E ($0.05)
- "Transcribe / convert audio to text" → openai Whisper ($0.01)
- "Write me an eBook chapter / long-form content / draft a guide" → openai GPT-4o ($0.01)
- "Read this aloud / narrate this / make a TTS" → elevenlabs TTS ($0.05)
- "Make a sound effect / sting" → elevenlabs sound-generation ($0.05)
- "Make me a PDF / convert to PDF / bind into PDF" → pdfshift ($0.01)
- "Send a postcard / letter / verify an address" → lob (postcard $1.00 / letter $1.50 / verify $0.01)
- "Email me / send an email" → resend ($0.005)

Multi-step compositions (reason them out — chain pay_api calls):
- "Make me a colouring book about whales" → N x openai DALL-E + 1 x pdfshift bind. Quote total upfront ("10 images × $0.05 + $0.01 PDF = $0.51").
- "Write an illustrated eBook on X" → openai GPT-4o for prose + N x openai DALL-E for art + pdfshift to bind. Quote total upfront.
- "Send a custom postcard with my logo" → openai DALL-E for design + lob postcard. Show user the design and confirm before mailing.

What we DO NOT support (decline honestly — never invent a workaround):
- Music composition (Suno coming Phase 5; pre-Phase-5 say "music generation isn't available yet")
- Cheap image gen via Fal Flux / Recraft / Stability — DALL-E is the only image option
- Alternative chat models (Claude, Gemini, Mistral, etc.) — GPT-4o is the only content-gen option (you yourself are Claude internally; that's separate)
- Web search, news, research, perplexity-style answers
- Translation (DeepL, Google Translate)
- Weather, forex, stocks, crypto-prices-via-CoinGecko (use token_prices for on-chain prices)
- Maps, geocoding, scraping, code execution, security scanning, push notifications, URL shortening, IP lookup, lead-gen, embeddings

When the user asks for any of the above, be direct: "Audric doesn't have [X] today. [Brief reason or alternative if any]." Don't apologize, don't promise a workaround you can't deliver, don't invent a service.

mpp_services discovery rules:
- Call mpp_services with no args to see the full catalog when you need exact URLs and body schemas.
- If a category-filtered call returns 0 services and the response includes a _refine payload with validCategories, RE-CALL with one of those valid categories OR with no filter at all. Don't give up after one filtered miss.
```

This is ~50 lines, ~400 tokens (heavier than the proposed ~120-token version because the audit added intent-mapping + decline-list + multi-step guidance — all worth the prompt budget).

### F1 (continued) — pay_api tool description rewrite (also shipped engine 1.29.0)

The `pay_api` tool description was rewritten to enumerate the 5 supported services up front, explicitly call out the gateway services Audric does NOT support, and bake in the new openai-DALL-E postcard flow + multi-step PDF composition guidance. See `packages/engine/src/tools/pay.ts` for the final shipped text.

Tests in `packages/engine/src/__tests__/pay.test.ts` pin:
- No `40+ services` framing remains
- All 5 service slugs (openai, elevenlabs, pdfshift, lob, resend) appear
- Lob postcard flow uses `openai/v1/images/generations` (not `fal/fal-ai/flux/dev`)
- Multi-step PDF composition guidance present
- Decline-honestly guidance for unsupported intents present

### F2 — Engine `mpp_services` 0-result auto-recovery (SHIPPED engine 1.29.0)

Same `_refine` payload as in §5. When a category- or query-filtered call returns 0 services, the response now includes `_refine: { reason, validCategories, suggestion }`. The reason text differentiates "category doesn't exist" from "query matched nothing"; the suggestion includes explicit decline guidance so the LLM tells the user "Audric doesn't support [X]" instead of getting trapped in an endless re-call loop. Tests in `aci-constraints.test.ts` pin the payload shape, the alphabetized + lowercased validCategories array, and the decline guidance text.

### F3 — Audric registry cleanup + key extensions (PENDING — ship after engine 1.29.0 lands on npm)

**Delete:**
- All current `MPP_SERVICE_RENDERERS` entries that aren't in the locked 5-service set:
  - `dalle`, `dall-e` aliases (superseded by openai endpoint-aware dispatch below)
  - `fal` (replaced by openai DALL-E)
  - `anthropic` (replaced by openai chat)
  - `suno` (Phase 5 only — joins via add-back recipe when gateway deploys it)
  - `teleflora`, `cakeboss`, `amazon`, `walmart`, `partycity`, `party-city` (commerce vendors not in gateway today AND not in supported set)

**Final renderer registry (5 entries, openai is endpoint-aware):**

```ts
function getOpenaiRenderer(url: string | undefined) {
  if (!url) return GenericMppReceipt;
  if (url.includes('/v1/images/generations'))   return CardPreview;   // DALL-E
  if (url.includes('/v1/audio/transcriptions')) return VendorReceipt; // Whisper transcription receipt
  if (url.includes('/v1/chat/completions'))     return VendorReceipt; // GPT-4o chat receipt
  return VendorReceipt; // any future supported endpoint
}

const MPP_SERVICE_RENDERERS = {
  openai:     (data) => getOpenaiRenderer(data.url)({ data }),
  elevenlabs: (data) => <TrackPlayer data={data} />,           // both TTS + sound-gen → audio player
  pdfshift:   (data) => <BookCover data={data} />,
  lob:        (data) => <VendorReceipt data={data} vendor="Lob" />,
  resend:     (data) => <VendorReceipt data={data} vendor="Resend" />,
};
```

5 entries. Endpoint-aware dispatch only needed for openai (3 endpoints). Every entry maps to a real, supported service. **No suno entry today** — the "wait for actual gateway deploy" rule applies; add via the recipe in §8 when Phase 5 lands.

**Refactor `normaliseServiceSlug` → endpoint-aware dispatch only where needed (openai).** Document the add-back recipe at the top of `MPP_SERVICE_RENDERERS` so adding a vendor back is one line.

### F4 — B-MPP3 STEP_ICONS (revised — 8 glyphs, not 40)

```ts
function getPayApiGlyph(input: { url?: string }): string {
  const url = input.url ?? '';
  // OpenAI — endpoint-aware (3 supported endpoints)
  if (url.includes('/openai/v1/images')) return '✦';                 // DALL-E
  if (url.includes('/openai/v1/audio/transcriptions')) return '🎙️'; // Whisper
  if (url.includes('/openai/v1/chat')) return '💬';                  // GPT-4o
  // ElevenLabs — endpoint-aware (2 supported endpoints)
  if (url.includes('/elevenlabs/v1/text-to-speech')) return '🎤';
  if (url.includes('/elevenlabs/v1/sound-generation')) return '🎶';
  // Single-endpoint services
  if (url.includes('/pdfshift')) return '📄';
  if (url.includes('/lob')) return '✉';
  if (url.includes('/resend')) return '📧';
  return '⚡'; // fallback (unsupported service — should be rare given the prompt)
}
```

8 case statements (no Suno today; add `if (url.includes('/suno')) return '♪';` via the recipe when Phase 5 lands).

### F5 — Smoke harness (Phase 3, revised)

**9 active tests** today (suno deferred to Phase 5):

| # | Service | Endpoint | Cost |
|---|---|---|---|
| 1 | openai | `/v1/images/generations` (DALL-E) | $0.05 |
| 2 | openai | `/v1/audio/transcriptions` (Whisper, on a 5s sample) | $0.01 |
| 3 | openai | `/v1/chat/completions` (GPT-4o, 100-token completion) | $0.01 |
| 4 | elevenlabs | `/v1/text-to-speech` (10-word sample) | $0.05 |
| 5 | elevenlabs | `/v1/sound-generation` (5s effect) | $0.05 |
| 6 | pdfshift | `/v1/convert` (1-page HTML) | $0.01 |
| 7 | lob | `/v1/postcards` (test address) | $1.00 |
| 8 | lob | `/v1/address-verify` | $0.01 |
| 9 | resend | `/v1/emails` (test address) | $0.005 |

**Initial real-USDC pin run: ~$1.20** (mostly Lob postcard at $1.00). Stubbed CI version: free, runs weekly.

When Suno lands in Phase 5, add a 10th test (~$0.10 estimated).

---

**End §8/§9.** Phase 2 ready to execute on the founder's "go" once they finish the inventory review.
