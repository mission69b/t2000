# SPEC 24 — MPP Integration Audit + Smoke Harness

> **Status:** locked 2026-05-11 ~19:25 AEST. Phase 1 in progress.
>
> **Local-only, gitignored** — same convention as SPEC 23 series, AUDRIC_HARNESS_*_SPEC, audric-roadmap, audric-build-tracker.
>
> **Predecessor:** SPEC 23B-MPP1 + MPP2 shipped 2026-05-11 ~17:30 + 19:00 AEST (audric `f7613ae` + `dca80e8` + `5e7c92d`). Per-vendor MPP UI primitives now exist and dispatch correctly. SPEC 24 closes the gap between "we can render any MPP service" and "the LLM can actually reach every MPP service."
>
> **Trigger:** founder smoke 2026-05-11 ~19:15 AEST. Image generation (Fal Flux) + postcard mailing (Lob) worked end-to-end with the new per-vendor primitives. **But "create a song about sui" and "make me a PDF colouring book about whales" both returned `0 total` services from `mpp_services` despite Suno + PDFShift being live in the gateway.** Audric correctly degraded and offered alternatives — but offered them WRONGLY (we have those services).
>
> The MPP1/MPP2 work proved Audric can render every MPP vendor beautifully. SPEC 24 ensures the LLM can actually find every vendor.

---

## 1. Background

Audric exposes 40+ MPP gateway services (DALL-E, Suno, ElevenLabs, PDFShift, Lob, Teleflora, CakeBoss, Amazon, Walmart, OpenWeather, Anthropic, etc.) via two engine tools:

- `mpp_services` (read) — discovers the catalog of available services. Returns `{ services: [...], categories: {...} }` with optional filter params.
- `pay_api` (write, confirm-tier) — executes a service via on-chain USDC micropayment to `mpp.t2000.ai`.

Per-service receipts are now rendered by `MPP_SERVICE_RENDERERS` in `apps/web/components/engine/cards/mpp/registry.tsx` (12 vendor entries + `<GenericMppReceipt>` fallback) wired into `ToolResultCard.CARD_RENDERERS['pay_api']` (SPEC 23B-MPP2).

The 2026-05-11 ~19:15 AEST founder smoke surfaced THREE behavior-class gaps:

1. **Catalog discovery returns 0 for legitimate queries.** "Create a song" → `mpp_services` → `0 total`. "Make a PDF" → `mpp_services` → `0 total`. The LLM had no way to know Suno + PDFShift exist.
2. **No recovery loop.** Once `mpp_services` returns 0, the LLM gives up and offers an inferior alternative ("I can write song lyrics for you instead"). It never retries with a wider filter or no filter.
3. **Coverage uncertainty.** We don't know — across the full live gateway — which services have a per-vendor `MPP_SERVICE_RENDERERS` entry vs which fall through to `<GenericMppReceipt>`. Untested in production.

These are not UI bugs. They're integration / system-prompt / tool-shape bugs. SPEC 24 fixes them holistically with a smoke harness that prevents regression.

---

## 2. Scope

### In scope
- Inventory every live service on the MPP gateway (`mpp.t2000.ai`).
- Audit the engine `mpp_services` + `pay_api` tools (params they pass, filter logic, default behavior).
- Audit the engine system prompt MPP guidance (what does it teach the LLM about catalog discovery, filter recovery, when to give up).
- Cross-walk gateway services × `MPP_SERVICE_RENDERERS` × `STEP_ICONS` (per-vendor glyphs in `AgentStep`).
- Build an end-to-end smoke harness that exercises every live service.
- Add `MppTelemetry` to surface vendor coverage in production.
- Wire the harness into a weekly CI cron.
- Fix the gaps surfaced in Phase 1 before declaring SPEC 24 closed.

### Out of scope (deferred or owned elsewhere)
- New MPP gateway services. SPEC 24 audits what exists, doesn't add capacity.
- **34 of 40 gateway services are intentionally unsupported by Audric** — see SPEC_24_GATEWAY_INVENTORY.md §8 for the locked drop list (anthropic, fal, openweather, exchangerate, perplexity, newsapi, brave, serper, serpapi, exa, gemini, groq, deepseek, together, mistral, cohere, replicate, assemblyai, coingecko, alphavantage, stability, qrcode, shortio, pushover, printful, judge0, hunter, virustotal, ipinfo, firecrawl, jina, screenshot, googlemaps, deepl, translate). The system prompt + telemetry will surface attempts to use dropped services so we can re-evaluate at the data, not by speculation.
- B-MPP5 (regenerate cluster on image-gen results) and B-MPP6 (review banner on regen-limit) — stay in SPEC 23B per the existing plan; UI-only, no gateway dependency.
- Audric Store launch wiring (Phase 5 product roadmap) — sits on top of MPP but is a separate spec. The 6 supported services include Suno (async-gen, Phase 5) so the renderer + glyph land NOW; the actual creator workflow integration ships with Phase 5.
- Renaming / restructuring of MPP gateway endpoints — gateway is owned by `apps/gateway` and changes there require a separate spec.
- Re-adding a dropped service later — covered by the add-back recipe in SPEC_24_GATEWAY_INVENTORY.md §8 (~5 minutes per service, no spec needed). Most likely re-add candidates: Fal Recraft (vector / branded art for Audric Store creators), DeepL (when Audric ships in non-English markets).

### B-MPP3 — folded into SPEC 24
Per-vendor `STEP_ICONS` glyphs for `pay_api` (DALL-E sparkle, Suno note, ElevenLabs waveform, PDFShift book, Lob envelope, etc.) was originally scheduled as SPEC 23B-MPP3. It now lives in SPEC 24 because:
- The glyph map and the `MPP_SERVICE_RENDERERS` map share the same vendor enumeration. Building one fixes the other.
- The Phase 1 inventory will produce the canonical vendor list anyway — folding B-MPP3 in avoids walking the same ground twice.

---

## 3. Phases + items

### Phase 1 — Inventory + reality check (~½d)

**Goal:** produce a single ground-truth document (`SPEC_24_GATEWAY_INVENTORY.md`) showing what exists today across all four layers (gateway / engine tool / system prompt / audric host registry).

| Item | Description | Output |
|---|---|---|
| **24-I1 — Gateway catalog probe** | Hit `mpp.t2000.ai` catalog endpoint(s) directly with `curl`. Try every documented filter: no filter, by category, by vendor, by capability. | Section 1 of the inventory doc: every live service with `serviceId`, category, price, request body shape, response body shape. |
| **24-I2 — Engine tool source audit** | Read `packages/engine/src/tools/mpp-services.ts` + `packages/engine/src/tools/pay-api.ts`. Document what params they pass to the gateway, what filter logic exists, what default behaviors apply. | Section 2: tool-call shape, request transformation, response normalization. |
| **24-I3 — System prompt audit** | Read the engine system prompt MPP guidance section. Quote the exact text. Identify gaps (does it teach the LLM to recover from 0-result discovery? does it list categories? does it map intents → service names?). | Section 3: prompt text + gap list. |
| **24-I4 — Coverage matrix** | Cross-walk Phase 1 outputs: every gateway service × `MPP_SERVICE_RENDERERS` registration × `STEP_ICONS` glyph entry. | Section 4: coverage matrix with ✅ rendered (per-vendor) / ⚠️ falls to `GenericMppReceipt` / ❌ missing entirely / ❓ unknown — needs probe. |
| **24-P1-Writeup** | Synthesize the four sections into `SPEC_24_GATEWAY_INVENTORY.md` and lock the Phase 2 fix prioritization based on what was found. | The inventory doc + an updated Phase 2 task list. |

### Phase 2 — Fix the gaps (~1.5–2d, scope concretized after Phase 1)

Phase 1 will surface the actual root causes. The current best-guess fix candidates:

| Likely fix | Layer | Notes |
|---|---|---|
| **F1 — Tool / gateway query alignment** | Engine `mpp-services.ts` and/or gateway `/catalog` | If filter labels don't match between LLM intent and gateway, fix at the right layer. May involve teaching the tool to retry with no filter when count == 0. |
| **F2 — System prompt MPP block reframe** | Engine `prompt/mpp-guidance.ts` (or wherever it lives) | Add: "If `mpp_services` returns `services: []` for a category-filtered query, retry without the filter before declining. The full menu may include the service the user wants under a different category." |
| **F3 — Per-vendor renderer entries** | Audric `cards/mpp/registry.tsx` | Add `MPP_SERVICE_RENDERERS` entries for any live gateway services that fall to `GenericMppReceipt` today. |
| **F4 — Per-vendor `STEP_ICONS` glyphs (B-MPP3)** | Audric `AgentStep.tsx` | Wire vendor-specific glyphs for `pay_api` calls. May involve adding a helper `getPayApiGlyph(input)` that inspects the `url` param. |

### Phase 3 — Smoke harness (~1–1.5d)

**Goal:** prevent the SPEC 24 fixes from regressing. Make MPP integration health a first-class observable.

| Item | Description | Output |
|---|---|---|
| **24-S1 — Smoke harness script** | One end-to-end test per live gateway service. Each test (a) calls `mpp_services` with a category filter, asserts non-zero results, (b) calls `pay_api` with a known-good input, asserts success, (c) asserts the right primitive type rendered (vs `GenericMppReceipt`). | `apps/web/scripts/smoke-mpp.ts` — runs against prod or staging. Real services for an initial pinning run; stubbed for CI. |
| **24-S2 — Production telemetry** | Every `pay_api` call writes a `MppTelemetry` row: vendor slug (normalised), fall-through flag (Generic vs per-vendor), render latency, success/failure. | NeonDB `MppTelemetry` model + insert call site in `payService` route + a dashboard query (`apps/web/scripts/mpp-coverage-report.ts`). |
| **24-S3 — Weekly CI cron** | GitHub Actions workflow that runs the stubbed smoke harness weekly, comments on PRs that touch `mpp/` or `pay-api`, and alerts on first regression. | `.github/workflows/mpp-smoke.yml`. |

---

## 4. Acceptance criteria

> **Locked supported-services set (founder review 2026-05-11 ~20:05 AEST):** 6 services — `openai` (DALL-E + Whisper + GPT-4o chat), `elevenlabs` (premium TTS + SFX), `pdfshift`, `lob`, `suno` (Phase 5), `resend`. Every other service in the gateway catalog (34 of 40) is intentionally unsupported. See `SPEC_24_GATEWAY_INVENTORY.md` §8 for the full cut history + rationale.

SPEC 24 is closed when **all** of the following are true:

1. **Inventory complete.** `SPEC_24_GATEWAY_INVENTORY.md` exists with the full gateway probe + the locked 6-service supported set (12 endpoints, 9 active glyphs) + the 34 dropped services + add-back recipe.
2. **Renderer parity with the locked set.** Every supported service has a `MPP_SERVICE_RENDERERS` entry. OpenAI uses endpoint-aware dispatch (3 supported endpoints → CardPreview / VendorReceipt / VendorReceipt). `<GenericMppReceipt>` is reachable only via the catch-all fallback for the rare case the LLM ignores prompt guidance and calls a dropped service anyway.
3. **No silent 0-result failures.** Re-running the founder smoke (DALL-E image, ElevenLabs TTS, PDFShift PDF, Lob postcard) on supported services succeeds end-to-end. For dropped services (e.g. "create a song about sui" pre-Phase-5, "translate this to French", "what's the weather in Tokyo"), Audric returns an honest "that's not in my service catalog today" rather than the silent `0 services available` failure.
4. **System prompt teaches recovery + service set.** The MPP guidance section enumerates the 6 supported services + their costs + their endpoints (~12 lines, ~120 tokens), AND teaches the LLM to retry without filter when `mpp_services` returns 0. A test confirms both behaviors.
5. **Smoke harness lives + passes.** `apps/web/scripts/smoke-mpp.ts` runs cleanly against prod for every supported endpoint (9 active tests today, +1 when Suno lands). ~$1.20 USDC initial pin (mostly Lob postcard at $1.00). Stubbed CI version runs weekly without errors.
6. **Telemetry visible.** Dashboard query shows last-7-day vendor coverage breakdown for the 6 supported services. Any call to a dropped service surfaces in telemetry as a fall-through (signal that the prompt isn't doing its job).
7. **B-MPP3 shipped (folded into F4).** Per-vendor glyphs render in `<AgentStep>` for all 9 active endpoints (OpenAI ✦/🎙️/💬, ElevenLabs 🎤/🎶, PDFShift 📄, Lob ✉, Resend 📧, +Suno ♪ when live).
8. **Founder visual confirmation.** Re-run the original SPEC 24 founder smoke prompts after Phase 2 ships and verify all supported services work end-to-end with vendor-specific UI + glyphs.

---

## 5. Open questions (resolved)

| ID | Question | Lock |
|---|---|---|
| 24-Q1 | Real-service smoke or stubbed? | **Real for initial pinning run** (~$1–2 USDC), stub for weekly CI. Real-truth-value catches drift; stubbed CI avoids recurring spend. Decided 2026-05-11 ~19:25 AEST. |
| 24-Q2 | Does SPEC 24 own B-MPP3? | **Yes** — same vendor enumeration as MPP_SERVICE_RENDERERS, same registry pattern, building one builds the other. SPEC 23B retains B-MPP5 and B-MPP6 (UI-only). Decided 2026-05-11 ~19:25 AEST. |
| 24-Q3 | Engine work needed? | **Likely yes** — `mpp_services` may need filter-recovery loop or a default `category: undefined` behavior. Concrete scope set after Phase 1 inventory. May trigger an engine minor bump. |
| 24-Q4 | Where does the spec live? | `/Users/funkii/dev/t2000/spec/SPEC_24_MPP_INTEGRATION_AUDIT.md`. Local-only, gitignored. Decided 2026-05-11 ~19:25 AEST. |

---

## 6. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Phase 1 reveals the gateway catalog is genuinely missing services we thought were live (Suno not actually deployed). | Triage with `apps/gateway` owner. May trigger a separate gateway-side spec. SPEC 24 still closes by removing the missing services from `MPP_SERVICE_RENDERERS` and updating the prompt. |
| Filter-recovery loop in `mpp_services` adds round-trips, bloats turn latency. | Cap retries at 1 (filtered → no-filter). Both calls hit the cached catalog endpoint, so the cost is one extra TTFVP-irrelevant call when filtering misses. |
| Real-service smoke spends ~$1–2 USDC per run. Multiple runs during development = real money. | Test wallet has limited balance; cap initial run at one execution per service. Stubbed CI version exercises the dispatch logic without spend. |
| New services land on the gateway between SPEC 24 ship and the next regression. | Telemetry surfaces unknown-vendor fall-throughs; weekly CI fails on the first one. |

---

## 7. Effort + sequencing

- **Phase 1:** ~½d (4 inventory items + writeup)
- **Phase 2:** ~1.5–2d (concrete after Phase 1)
- **Phase 3:** ~1–1.5d (smoke + telemetry + CI)
- **Total:** ~3–4d

**Sequence:** Phase 1 → Phase 2 → Phase 3 strictly. Phase 2 depends on Phase 1 outputs (can't fix what we haven't inventoried). Phase 3 should follow Phase 2 (smoke harness should pass on first run, not surface regressions that Phase 2 should have caught).

---

## 8. Cross-references

- SPEC 23B-MPP1: `apps/web/components/engine/cards/mpp/registry.tsx` (per-vendor primitives) — `audric f7613ae`, `dca80e8` (audit fix)
- SPEC 23B-MPP2: `apps/web/components/engine/ToolResultCard.tsx` `CARD_RENDERERS['pay_api']` wiring — `audric 5e7c92d`
- Engine tools: `packages/engine/src/tools/mpp-services.ts`, `packages/engine/src/tools/pay-api.ts`
- Engine system prompt: `packages/engine/src/prompt/` (locate the MPP guidance block in Phase 1-I3)
- Audric host: `apps/web/hooks/useAgent.ts` `payService` method
- Per-vendor glyph registry: `apps/web/components/engine/AgentStep.tsx` `STEP_ICONS`
- MPP gateway: `apps/gateway/` (catalog endpoint + service registry)
