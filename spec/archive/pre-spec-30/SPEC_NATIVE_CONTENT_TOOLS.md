# SPEC `spec_native_content_tools` — v0.4 ✅ COMPLETE (P7 verified prod)

> **Status:** v0.4 — All 7 phases shipped + verified end-to-end on prod. Founder picks SPEC# at promotion.
>
> **P7 verification (2026-05-13 ~13:55 AEST):**
> - PROBE A `compose_pdf` ✅ — 3-page mixed PDF (text cover + gpt-image-1 image + markdown summary) generated; `<DownloadableArtifact kind="pdf">` rendered with correct filename / "3 PAGES · 2.4 MB" / "EXPIRES IN 7 DAYS" / DOWNLOAD chip; PDF download link valid Vercel Blob URL.
> - PROBE B `compose_image_grid` ✅ (partial) — 2x2 grid rendered inline; OPEN chip valid Blob URL. Caveat: only 3 of 4 image gens succeeded (4th hit OpenAI rate limit but was still charged $0.05). The grid degraded gracefully with the 4th cell empty. Rate-limit-charge is a class of `bug_mpp_no_refund_on_failure` (downstream of pre-charge validate gate); tracked separately, NOT a P7 blocker.
> - Total smoke cost: $0.20 ($0.05 probe A + $0.15 probe B).
> - Gateway b64→Blob normalization (commit `8479db02` + BLOB_READ_WRITE_TOKEN) confirmed working — every gpt-image-1 response correctly rewritten to dall-e-shaped `{ url }` and consumed by audric `<CardPreview>` + `compose_*` tools without the "Preview unavailable" failure mode that broke the first P7 attempt.
> **Scope:** Locked 2026-05-12 ~08:45 AEST in `audric-build-tracker.md` row 7i.
> **Effort:** ~3d total (compose_pdf ~1d core + ½d markdown + compose_image_grid ~½d + render card + system prompt + smoke).
> **Predecessors:** SPEC 23C ✅ COMPLETE + SPEC 23C smoke fixes A+B (commits `8b15c44`, `f9f7ecb` 2026-05-13).
>
> **Lock decisions (founder, 2026-05-13 ~09:50 AEST):**
> - D-1 → A (`<DownloadableArtifact>` generic card)
> - D-2 → 7-day signed-URL expiry
> - D-3 → A4 default page size
> - D-4 → `'auto'` layout default
> - D-5 → always `auto` permission
> - D-6 → telemetry yes
> - D-7 → engine bump minor (NOTE: tools live audric-side; no engine code touches required → can ship without engine bump)
> - Render phase → ship `<DownloadableArtifact>` WITH the tools (P5 in scope, not deferred)
>
> **Dep audit correction (2026-05-13 ~09:50 AEST):**
> The v0.1 spec said `sharp` was already in audric/web's dep stack. **Wrong.** Verified `apps/web/package.json` — none of the four required deps are installed:
> - `pdf-lib` (P2 core)
> - `markdown-it` (P3)
> - `sharp` (P4)
> - `@vercel/blob` (P2 storage)
>
> All four installed in P2 prep step. Bundle-size impact: pdf-lib ~50kb, sharp ~5MB (native binary, server-only), markdown-it ~80kb, @vercel/blob ~20kb. None affect client bundle (all server-only).
>
> **New env var (added in P2):**
> - `BLOB_READ_WRITE_TOKEN` — required string, server-only. Vercel Blob auto-injects this on Blob-enabled projects.

---

## 1. Why this spec exists

SPEC 24 founder smoke surfaced the recurring failure mode of routing artifact-composition work through MPP gateway services:

- **Whale-book test (PDFShift `pdf_compile`):** gateway 400'd, user paid $0.01 for nothing, ended up with 6 separate DALL-E images instead of a bound PDF.
- **Founder framing:** *"instead of using mpp call for pdf generation i think i see a gap with specific tools we might need to build, maybe its best to create a pdf tool to generate the pdf?"*

PDFShift (and similar gateway-mediated transforms) are the wrong abstraction for "compose what we already have." Audric already has the source artifacts (DALL-E images, LLM markdown, prior MPP outputs); we shouldn't pay a gateway to re-fetch them, transform them server-to-server, and bill the user for the privilege.

**Native composition tools** run server-side in audric, are free to the user, and can't fail with a vendor 400 — they're pure JS over data Audric already has.

---

## 2. Two tools, locked surface area

### 2.1 `compose_pdf`

**Use case.** Bind N images / text pages / markdown documents into a single PDF. `render_markdown_pdf` is folded in as a page type, NOT a separate tool.

**Input schema:**

```typescript
{
  pages: Array<
    | { type: 'image'; url: string; caption?: string }
    | { type: 'text'; content: string; title?: string }
    | { type: 'markdown'; content: string }
  >;
  filename?: string;          // default: `audric-${timestamp}.pdf`
  pageSize?: 'A4' | 'Letter'; // default: 'A4'
}
```

**Output:**

```typescript
{
  url: string;          // Vercel Blob hosted PDF URL
  filename: string;
  pageCount: number;
  sizeKb: number;
  expiresAt: string;    // ISO timestamp of signed-URL expiry
}
```

**Implementation:** `pdf-lib` (~50kb, pure JS — no chromium overhead) + `markdown-it` for the markdown→text branch. Audric host registers the tool; engine factory imports it like `audricSaveContactTool`.

**Permission:** `auto` (no funds move; server-side compute only).

**Cost to user:** Free. Vercel Blob storage cost is ~$0.05/GB/mo at the audric tier — single-user PDF traffic is rounding error.

### 2.2 `compose_image_grid`

**Use case.** Bind N images into a single grid image (e.g. "compile these 4 DALL-E generations into a 2x2 collage").

**Input schema:**

```typescript
{
  images: string[];     // 2..9 image URLs
  layout?: '2x2' | '3x2' | '3x3' | 'auto';  // default: 'auto' (picks by image count)
  format?: 'png' | 'webp';                  // default: 'webp' (smaller for grids)
}
```

**Output:**

```typescript
{
  url: string;
  layout: '2x2' | '3x2' | '3x3';
  width: number;
  height: number;
  sizeKb: number;
  expiresAt: string;
}
```

**Implementation:** `sharp` (already in audric/web's dep stack — image-resize work is well-trodden). Composite via `sharp.composite()` with explicit `top`/`left` per cell.

**Permission:** `auto`. **Cost:** Free.

---

## 3. Out of scope (deliberately)

- **`save_to_audric_storage`** — Phase 5 Audric Store concern; persistence model not yet locked.
- **`compose_audio`** — niche; the only realistic use case (concat 2-3 TTS clips) is rarely surfaced.
- **`compose_video`** — speculative; would require a heavy `ffmpeg` dependency.
- **Code-as-image renderer** — not Audric's job; tools like Carbon / ray.so own that surface.
- **HTML→PDF** — PDFShift stays as the fallback for explicit HTML rendering needs.

---

## 4. Render surface

Both tools return artifact URLs. The `<ToolResultCard>` needs a path to render them. Two options:

**Option A — generic `<DownloadableArtifact>` card.** New primitive that takes `{ url, filename, sizeKb, kind: 'pdf' | 'image' }` and renders an icon + filename + download chip + (for images) inline preview. Used for both tools.

**Option B — extend the MPP renderer chain.** Add `compose_pdf` / `compose_image_grid` to `CARD_RENDERERS` in `ToolResultCard.tsx` directly, route to existing primitives (`<CardPreview>` for image grids, new minimal `<PdfReceiptCard>` for PDFs).

**Recommendation:** Option A. Simpler primitive, reusable for any future "tool produces a downloadable artifact" surface. Avoids growing the MPP-specific render chain for non-MPP tools.

---

## 5. System prompt update

Teach the LLM the new tools + when to use them vs. the existing `pay_api(pdfshift/...)` path:

> **Tool selection — composition vs. transformation:**
>
> - `compose_pdf` — use when binding artifacts you ALREADY have (image URLs from prior `pay_api(openai/.../images)` calls, markdown you wrote in this turn, text strings). Free, server-side, can't fail with a vendor 400.
> - `compose_image_grid` — same principle. Use when the user wants N images side-by-side / collaged.
> - `pay_api(pdfshift/v1/convert)` — fallback ONLY when the source is HTML that requires browser rendering (CSS, JS, etc.). PDFShift charges $0.01/call and routes through the gateway.

Default reach order: `compose_*` first → `pay_api(pdfshift/...)` only if source is HTML.

---

## 6. D-questions — ✅ LOCKED 2026-05-13

**D-1: Render surface** → **A (generic `<DownloadableArtifact>`)**. Reusable for any future artifact-producing tool. Simpler.

**D-2: Vercel Blob signed-URL expiry** → **7 days**. Long enough for the user to revisit a chat session and re-download; short enough that we're not paying indefinite storage.

**D-3: PDF default page size** → **A4**. Audric's user base trends international; A4 is the global default. Letter is opt-in via the `pageSize` param.

**D-4: `compose_image_grid` layout-picking** → **`'auto'` default** (2 images → 2x1, 3-4 → 2x2, 5-6 → 3x2, 7-9 → 3x3) with explicit `layout` override accepted.

**D-5: Permission level** → **always `auto`**. No funds move. The compute cap is enforced by hard input limits (max 50 pages for PDF, max 9 images for grid) — no DoS surface.

**D-6: Telemetry** → **Yes**, log via existing `console.log({ kind: 'compose_pdf', pageCount, sizeKb })` pattern (mirrors `regen-append`'s structured log).

**D-7: Engine bump** → **minor BUT skippable** if no engine code touches. The tools live audric-side via `buildTool()`. P6 ship only requires audric/web deploy.

**Render phase** → **ship `<DownloadableArtifact>` card alongside the tools** (P5 in scope).

---

## 7. Acceptance gates (G1–G6)

| Gate | What | How verified |
|---|---|---|
| G1 | `compose_pdf` accepts mixed image/text/markdown pages and produces a valid PDF | Inline test: synthesize 3-page mixed input → assert `pdf-lib` parses output without error + page count matches |
| G2 | `compose_image_grid` accepts 2-9 images and produces a valid PNG/WEBP | Inline test: 4 image URLs → assert sharp can read output dimensions + format matches request |
| G3 | Both tools enforce input bounds (PDF: max 50 pages; grid: 2-9 images) | Inline test: oversized input → assert tool returns clear error |
| G4 | Vercel Blob signed URL is reachable + has correct content-type | Inline test mocking `@vercel/blob` upload → assert returned URL + `Content-Type` header |
| G5 | Audric system prompt mentions both tools + their preferred-over-PDFShift positioning | Lint test asserting prompt string contains the binding lines |
| G6 | `<DownloadableArtifact>` card renders for both tools' results in the timeline | Inline render test against the new card primitive + integration test in `ToolResultCard.test.tsx` |

---

## 8. Phase plan — execution log

| Phase | Work | Status | Notes |
|---|---|---|---|
| **P1** | Spec lock — founder approves D-1 to D-7 | ✅ 2026-05-13 ~09:50 | All 7 D-questions locked to recommendations + render-card phase locked to "ship with tools" |
| **P2** | `compose_pdf` core: image + text page types + `pdf-lib` + Vercel Blob upload helper + 31 inline tests | ✅ 2026-05-13 ~10:50 | Tool at `audric/apps/web/lib/engine/compose-pdf-tool.ts` (~370 lines). Optional `BLOB_READ_WRITE_TOKEN` env added (deliberately optional initially — promote to required after P7) |
| **P3** | `compose_pdf` markdown page type: `markdown-it` block-walker + 9 additional tests (40 total) | ✅ 2026-05-13 ~11:00 | Block walker handles headings (h1=18pt, h2=14pt, h3=12pt), paragraphs, bullet/ordered lists, blockquotes; tables silently skipped; HTML escaped (`html: false`) |
| **P4** | `compose_image_grid`: sharp composite + auto-layout (2→2x1, 3-4→2x2, 5-6→3x2, 7-9→3x3) + 30 inline tests | ✅ 2026-05-13 ~11:10 | Tool at `audric/apps/web/lib/engine/compose-image-grid-tool.ts`. 512px cells, fit:cover, white background for empty cells, webp default |
| **P5** | `<DownloadableArtifact>` render card + ToolResultCard wiring + 17 + 6 inline tests | ✅ 2026-05-13 ~11:18 | Card at `audric/apps/web/components/engine/cards/DownloadableArtifact.tsx`. Image kind = inline preview + OPEN chip; PDF kind = stylized placeholder + DOWNLOAD chip. Fmt helpers: KB→MB above 1024, expiry as relative ("expires in N days"), filename truncation |
| **P6** | System prompt update — teach LLM compose_* > pay_api(pdfshift), promote PDF out of "cannot do today" | ✅ 2026-05-13 ~11:28 | `engine-context.ts` updated; `engine-context.test.ts` updated; harness-metrics budget cap respected (10700 tokens) |
| **P7** | Audric prod smoke (compose 3-page PDF + 2x2 image grid) | ✅ 2026-05-13 ~13:55 (re-smoke) | First attempt failed due to gpt-image-1 b64-only response shape — fixed via gateway commit `8479db02` (b64→Vercel Blob normalization in `lib/openai-image-blob-normalize.ts` + `chargeProxy.transformUpstreamResponse` hook) + new `BLOB_READ_WRITE_TOKEN` on gateway env. Re-smoke verified compose_pdf 3-page PDF (text + image + markdown) downloadable + compose_image_grid 2x2 inline preview. See header for detail. |

**Total tests added across the spec:** ~93 (40 compose_pdf + 30 compose_image_grid + 17 DownloadableArtifact + 6 ToolResultCard wiring + 1 net engine-context). Full suite: **2786 tests passing** (was 2693 pre-spec).

**Files touched:**
- `audric/apps/web/lib/engine/compose-pdf-tool.ts` (NEW, ~410 lines incl. P3 markdown)
- `audric/apps/web/lib/engine/compose-pdf-tool.test.ts` (NEW)
- `audric/apps/web/lib/engine/compose-image-grid-tool.ts` (NEW, ~210 lines)
- `audric/apps/web/lib/engine/compose-image-grid-tool.test.ts` (NEW)
- `audric/apps/web/lib/engine/engine-factory.ts` (registered both tools)
- `audric/apps/web/lib/engine/engine-context.ts` (system prompt teaching)
- `audric/apps/web/lib/engine/__tests__/engine-context.test.ts` (updated declines section)
- `audric/apps/web/components/engine/cards/DownloadableArtifact.tsx` (NEW)
- `audric/apps/web/components/engine/cards/DownloadableArtifact.test.tsx` (NEW)
- `audric/apps/web/components/engine/ToolResultCard.tsx` (CARD_RENDERERS dispatch)
- `audric/apps/web/components/engine/ToolResultCard.test.tsx` (dispatch tests)
- `audric/apps/web/lib/env.ts` (`BLOB_READ_WRITE_TOKEN` optional + SERVER_ONLY_KEYS)
- `audric/apps/web/package.json` (deps: `pdf-lib`, `markdown-it`, `sharp`, `@vercel/blob`, `@types/markdown-it`)

---

## 9. Drift-proofing — when does PDFShift get fully removed?

Not in this spec. PDFShift removal needs:

1. 30 days of `compose_pdf` adoption telemetry showing it covers ≥80% of historical PDFShift use cases.
2. An explicit founder call on whether to keep PDFShift as the HTML→PDF escape hatch or fully deprecate.

Logged as backlog placeholder `spec_pdfshift_deprecation` (no SPEC# yet).

---

## 10. References

- HANDOFF rationale: `HANDOFF_NEXT_AGENT.md` § 5
- Build tracker scope lock: `audric-build-tracker.md` row 7i
- Companion smoke evidence: `SPEC_24_GATEWAY_INVENTORY.md` (whale-book test)
- Pattern reference (audric-side tool): `audric/apps/web/lib/engine/contact-tools.ts`
- Tool-registration pattern: `audric/apps/web/lib/engine/engine-factory.ts` lines 519-572
