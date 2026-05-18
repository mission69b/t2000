# SPEC 23 — Harness UX Demo-Parity (Three-Phase Trio)

> Locked 2026-05-11 ~06:35 AEST. Supersedes the prior `spec_smooth_chrome` placeholder in `HANDOFF_NEXT_AGENT.md` §2 Item 1.
>
> The work splits into three independently shippable specs (23A, 23B, 23C) so each can land + be reviewed in isolation. Founder picked **Option A** (full sequence) on 2026-05-11 ~06:30 AEST after the production audit revealed most universal primitives already exist (cutting Phase A scope) and `pay_api` per-MPP-service rendering is the single biggest visual gap (justifying Phase B as the bulk of the work).

---

## 0. The pre-audit findings (the picture this spec is built on)

Before locking scope I read every file under `apps/web/components/engine/{cards,timeline,canvas}/` + `ToolResultCard.tsx` + `PermissionCard.tsx`. Three things drove the scope shape:

1. **Most demo primitives already exist.** `ParallelToolsRow`, `ParallelToolsGroup`, `HowIEvaluated`, `AudricLine`, `TaskInitiated`, `ThinkingHeader`, `ReasoningStream`, `TransitionChip` all match the demo bar structurally. The gaps are narrow: per-tool result preview text inside `ParallelToolsRow.sub`, anticipatory header copy in `ParallelToolsGroup`, sub-text per row in `BundleStepsList`, `BalanceCard` post-write 3-col grid variant. **This shrinks Phase A from "build the primitives" to "wire them up correctly".**

2. **`ToolResultCard` is the canonical dispatch.** 19 read tools have dedicated cards (RatesCard, BalanceCard, SavingsCard, PortfolioCard, ExplainTxCard, HealthCard, TransactionHistoryCard, SwapQuoteCard, ServiceCatalogCard, SearchResultsCard, YieldEarningsCard, ActivitySummaryCard, PaymentLinkCard, InvoiceCard, StakingCard, ProtocolCard, PriceCard). 11 writes share `TransactionReceiptCard` (generic). 7 tools fall through to `null` — `spending_analytics`, `resolve_suins`, `pending_rewards`, `cancel_payment_link`, `cancel_invoice`, `save_contact`, `render_canvas` (latter goes through `CanvasModal`, not this dispatch). **This is the work surface for Phase B.**

3. **`pay_api` is genuinely the worst gap.** `TransactionReceiptCard.getHeroLines` for `pay_api` returns three label/value rows (`Service / Cost / Delivery`). Demos show `<CardPreview>` (DALL-E art with serif "For my dearest"), `<TrackPlayer>` (Suno audio with cover art + waveform), `<Receipt>` cards (3-col grid for Lob / Teleflora / vendor). **Every MPP service deserves a bespoke surface; today every MPP service gets the same 3-line generic card.** This is the moat surface and it's the lowest-fidelity surface today.

---

## 1. SPEC 23A — Universal Chat Primitives (Phase 1, ~3-4d incl. legacy rip)

**Goal:** Bring the universal "DISPATCHING / DONE / preview" chat surface to demo parity for every read tool *without* per-tool card changes. Single render path, all 25 read tools inherit at once.

### P0 prerequisite — Kill the legacy harness renderer (~½d, audit complete)

Resolved as Q1. v2 is the production default for every new session (verified via Vercel env audit 2026-05-11). The `'legacy'` code path is dead-code-with-a-pulse.

**Upstash audit run 2026-05-11 ~07:25 AEST (one-shot script `scripts/legacy-harness-count.mjs`, deleted post-run):**
```
Total sessions scanned:                 52
Pinned legacy (any age):                0
Pinned v2 (any age):                    52
Active legacy sessions (last 7d):       0
```

**0 sessions to migrate.** The pin only ever sets at session-create time via `currentHarnessVersion()`, and that's been returning `'v2'` for every session since the rollout dial hit 100% weeks ago. Older sessions all aged out via the 24h Upstash TTL.

**Steps (simplified now that the migration is a no-op):**
1. ✅ Audit: 0 active legacy sessions confirmed.
2. Delete `LegacyReasoningRender.tsx`, the `ChatMessage` v2/legacy selector branch, `rolloutPercent()`, `bucketFor()`, `NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT` from env schema, the rollout-percent test surface in `__tests__/interactive-harness.test.ts`.
3. Replace `currentHarnessVersion()` with a stub returning `'v2'` for one release cycle (consumer compatibility), then fully delete in the next minor.
4. Keep `NEXT_PUBLIC_INTERACTIVE_HARNESS` flag as a kill-switch for **≥2 release cycles**, then evaluate based on incident-free deploy track record. (Bumped from "1 cycle" — having the kill-switch ready costs ~10 lines and saves a re-deploy if v2 has a latent regression.)
5. Defensively, add a one-time guard in `apps/web/app/api/engine/chat/route.ts` that auto-flips any `metadata.harnessVersion === 'legacy'` it encounters back to `'v2'` (in case a stale pin somehow surfaces during the deprecation cycle). Remove with the stub.

**Acceptance — P0:**
- [ ] `LegacyReasoningRender` removed from the codebase.
- [ ] No `'legacy'` strings remain in active code paths (test files OK during the deprecation cycle).
- [ ] `pnpm test` stays green (legacy-specific tests deleted as part of the rip).
- [ ] Founder can still toggle `NEXT_PUBLIC_INTERACTIVE_HARNESS=false` and have rendering fall through cleanly (kill-switch preserved ≥2 cycles).

### Items

| # | Title | What it is | Files touched |
|---|---|---|---|
| A1 | **Per-tool result preview registry** | New `getResultPreview(toolName, result): string` returns demo-quality strings (e.g. `"fetched 4 wallets · $94 total"`, `"USDC 4.84% · USDsui 8.57%"`, `"BLUEFIN · $4.50 → 4.443 SUI"`). Wire into `ParallelToolsGroup.rowSub` (currently returns `"querying…"` / `"ran in 1.2s"` — generic). | `components/engine/timeline/result-preview.ts` (new), `ParallelToolsGroup.tsx` (rowSub call site) |
| A2 | **Anticipatory header copy registry** | Tool-name-aware header per parallel group. Demos show `"DISPATCHING 5 READS · PARALLEL"` / `"DISPATCHING 4 MPP CALLS"` / `"QUERYING 4 VENDORS IN PARALLEL · MPP DISCOVERY"`. Currently hardcoded `"Running tasks in parallel"`. New `getParallelHeaderLabel(tools): string`. | `ParallelToolsGroup.tsx` |
| A3 | **Per-tool glyph fidelity** | Audit `getStepIcon` in `AgentStep.tsx` against demo glyphs (📅 ⊞ ✦ ✉ ✿ 🛒 ◇ ⊡ ♪ etc.). Single source of truth — fixing here lifts every parallel row at once. | `components/engine/AgentStep.tsx` |
| A4 | **`BundleStepsList` row sub-text** | `BundleClusterRow.detail` is declared in the type but never populated (`clusterBundleSteps` returns `detail: undefined` in every branch). Demo 05 shows sub-text per row (`"AI-generated · already previewed"`, `"USPS First-Class · ETA Fri · to Mom"`). Compute from step.input shape per-tool. | `PermissionCard.tsx` (`clusterBundleSteps`) |
| A5 | **`PermissionCard` polish** | (a) add `subtitle="ATOMIC · USDC"` styled per demo; (b) add ⚡ bolt icon leading the `"GAS · SPONSORED"` footer; (c) tighten spacing to match demo 5 (currently slightly looser). | `PermissionCard.tsx` |
| A6 | **PostWrite refresh surface grouping** | Today: PWR-injected `balance_check` + `savings_info` cards stack vertically below the receipt as standalone rows. Demo bar: group them under one subtle "POST-WRITE" wrapper so the visual reads as "this happened *because* of the write you just approved". New `<PostWriteRefreshSurface>` primitive that wraps the PWR-flagged tool blocks. **Requires engine support — see Q-source below: `tool_start` / `tool_result` events get a new `source: 'pwr' \| 'llm' \| 'user'` field. Host routes blocks by source.** | engine: `packages/engine/src/types.ts` + `engine.ts` (stamp source on PWR-injected tools); host: `components/engine/timeline/PostWriteRefreshSurface.tsx` (new), `BlockRouter.tsx` (route by source) |
| A7 | **Typography pass** | Audit current sizes/weights/letter-spacing against `audric_demos_v2/shared/colors_and_type.css` + `audric.css` token set. Confirm Geist mono / serif / sans usage matches demo (font-mono 9-11px / font-serif for hero numbers / font-sans 12-13px for body). One commit, one file ideally (`apps/web/app/globals.css` token deltas). | `globals.css`, primitive components for inline overrides |

**Items deliberately NOT in 23A** (already-shipped or out-of-scope):
- ParallelToolsRow visual structure (already at demo bar)
- HowIEvaluated header layout (already shows `"▸ HOW I EVALUATED THIS · 75 TOKENS · AUDRIC v2.0 · 1.4s"` — matches demo exactly)
- AudricLine ✦ prefix (already shipping the green sparkle)
- TransitionChip phase morphs (SPEC 21 territory, already shipped)

### Acceptance — 23A

> **Acceptance bar (resolved Q-acceptance, 2026-05-11):** softened to **subjective side-by-side founder review**. No automated screenshot-diff infra, no pixel/SSIM/perceptual-hash gates. Each acceptance row is a "founder loads the demo URL in one tab + Audric production in the other tab + scrolls through, eyeballs each step, gives a thumbs up or files specific deltas". Rationale: capturing demo screenshots at correct viewport + rendering the same prompt deterministically in production would itself cost ~1d of infra; subjective review is faster, catches the same defects (whitespace, font weight, line-height drift), and the founder is the visual-quality owner anyway. The scoring rubric is **green / yellow / red per row**: green = ship; yellow = file delta + ship; red = block.

- [ ] **Side-by-side founder review:** `01-save-50.html` step 5 ("DISPATCHING 5 READS · PARALLEL") vs production rendering of the same prompt — green or yellow.
- [ ] **Side-by-side founder review:** demo 05 step 6 (`PermissionCard` with `BundleStepsList` showing 3 rows with sub-text + `<CardPreview>` companion) vs production — green or yellow on the `PermissionCard` portion only (companion `CardPreview` is 23B).
- [ ] All 25 read tools' `ParallelToolsRow.sub` returns a non-generic preview string when called via the parallel grouping path (sample 5 tools across types: balance_check, swap_quote, mpp_services, web_search, transaction_history).
- [ ] PWR-injected reads after a `save_deposit` are visually grouped under one wrapper (not stacked as standalone cards) **and** the underlying tool events carry `source: 'pwr'` (see Q-source decision below).
- [ ] No regression: `pnpm test` (currently 2041/2041) stays green. New tests for `result-preview.ts` registry + the PostWriteRefreshSurface group.

### Effort — 23A

~2-3d. Mostly registry-style additions to existing primitives, no engine changes, no new packages.

---

## 2. SPEC 23B — Per-Tool Result Surfaces (Phase 2, ~5-8d)

**Goal:** Close every ❌ and ⚠️ row in the inventory matrix below. Bulk of effort lands in `pay_api` per-MPP-service surfaces (the moat).

### Step 1 — Inventory pass (~1d, no code)

Produce `spec/SPEC_23B_INVENTORY.md` — definitive matrix with current state column locked. The matrix below is the audit-time snapshot; the inventory pass refines it after staring at every card render path side-by-side with the demo equivalent.

**Includes a canvas walkthrough** (resolved Q-canvas, 2026-05-11). The audit-time pass under-weighted canvases (only `render_canvas` and `spending_analytics` were noted; the `cards/canvas/` folder has more). The inventory pass walks every file under `apps/web/components/engine/canvas/` + `cards/canvas/` and adds a separate "Canvases" section to the matrix with: canvas name · trigger tool · current state vs demo · entry surface (modal / inline / both). Specific points to nail:

- `FullPortfolioCanvas` — entry surface (currently inline via `PortfolioCard` after `portfolio_analysis`?). Demo shows inline with rich charts.
- `SpendingBreakdownCanvas` — exists but isn't wired (B-N3 covers wiring; this confirms the canvas itself is at demo bar before wiring).
- `render_canvas` modal — vs demos showing inline canvases. Resolution likely "support both, default to inline for the new content-gen flows; modal stays as the explicit-render escape hatch." Confirm in inventory pass.
- Any HTML-snippet canvas used by `render_canvas` (the engine emits `{ type: 'canvas', html }` events — host wraps in `CanvasModal`). Audit which production prompts produce canvases today + sample 3 against the demo bar.
- Note any canvas that's defined but never reached from any tool (dead code → flag for deletion in a follow-up clean-up commit).

Adds ~½d on top of the original Step 1 budget. Was the right call — without it B-W7 (`portfolio_analysis` entry surface) and B-N3 (`spending_analytics` wiring) would both surface as surprises mid-implementation.

| Tool | Demo bar (sub-text · result surface) | Current state (audit 2026-05-11) | Phase 2 work |
|---|---|---|---|
| **READS — already at bar (✅, no work)** ||||
| `swap_quote` | `"USDC → DEEP · 0.086%"` · `SwapQuoteCard` | ✅ SwapQuoteCard at bar | none |
| `health_check` | `"HF 1.42 · safe"` · `HealthCard` | ✅ HealthCard at bar | none |
| `yield_summary` | `"+$0.21/day"` · `YieldEarningsCard` | ✅ at bar | none |
| `activity_summary` | `"15 tx · 7d"` · `ActivitySummaryCard` | ✅ at bar | none |
| `volo_stats` | `"vSUI 4.2% APY"` · `StakingCard` | ✅ at bar | none |
| `protocol_deep_dive` | `"NAVI · TVL $48M"` · `ProtocolCard` | ✅ at bar | none |
| `token_prices` | `"GOLD $0.0046"` · `PriceCard` | ✅ at bar | none |
| **READS — minor polish (⚠️)** ||||
| `balance_check` | row preview · breakdown card + 3-col post-write variant (AVAILABLE / EARNING / HELD) | ⚠️ card exists; missing 3-col post-write variant | B-W1 below |
| `savings_info` | `"8.4% APY · $900 saved"` · `SavingsCard` | ⚠️ exists; verify polish vs demo | B-W2 below |
| `rates_info` | rates table | ⚠️ `RatesCard` exists; verify | B-W3 below |
| `transaction_history` | scrollable history | ⚠️ `TransactionHistoryCard` exists, polish ok; preview registry handled in 23A-A1 | none beyond 23A |
| `mpp_services` | service grid | ⚠️ `ServiceCatalogCard` exists; verify visual | B-W4 below |
| `web_search` | result list | ⚠️ `SearchResultsCard` exists; verify visual | B-W5 below |
| `explain_tx` | tx digest panel | ⚠️ `ExplainTxCard` exists; verify visual | B-W6 below |
| `portfolio_analysis` | canvas | ⚠️ `PortfolioCard` + `FullPortfolioCanvas` both exist; verify entry surface | B-W7 below |
| `create_payment_link` | payment-link card with QR + copy | ⚠️ `PaymentLinkCard` exists; demo 02 bar high — verify QR + copy fidelity | B-W8 below |
| `list_payment_links` | table of links | ⚠️ uses `PaymentLinkCard` (single-link card for a list — likely renders awkwardly) | B-W9 below |
| `create_invoice` | invoice card | ⚠️ `InvoiceCard` exists; verify | B-W10 below |
| `list_invoices` | table of invoices | ⚠️ uses `InvoiceCard` for a list — same issue as `list_payment_links` | B-W11 below |
| **READS — missing entirely (❌)** ||||
| `cancel_payment_link` | confirmation card (`"Cancelled · gh5N…"`) | ❌ falls through to `null` | B-N1 |
| `cancel_invoice` | confirmation card (`"Cancelled · INV-001"`) | ❌ falls through to `null` | B-N2 |
| `spending_analytics` | canvas | ❌ no dispatch entry; falls through to `null` (note: `SpendingBreakdownCanvas` exists in `cards/canvas/` but isn't wired) | B-N3 |
| `resolve_suins` | inline single-line (`"alex.sui → 0xa3f9…b27c · verified"`) | ❌ no dispatch | B-N4 |
| `pending_rewards` | rewards card (`"$2.40 claimable"` + per-asset breakdown) | ❌ no dispatch | B-N5 |
| `save_contact` | inline confirmation chip | ❌ no dispatch (probably renders as text only) | B-N6 |
| `render_canvas` | canvas modal | ✅ via `CanvasModal` (different path, not `ToolResultCard`) | none |
| **WRITES — share generic `TransactionReceiptCard`** ||||
| `save_deposit` | receipt → 3-col `BalCard` post-write surface | ⚠️ receipt at bar; missing post-write surface (covered in 23A-A6 wrapper + 23B-W1 BalanceCard variant) | covered |
| `withdraw` | receipt → balance update | ⚠️ same as save_deposit | covered |
| `send_transfer` | receipt → balance update + "sent to {contact}" | ⚠️ receipt + ChunkedAddress at bar; post-write covered above | covered |
| `borrow` | receipt → HF + savings update | ⚠️ receipt at bar; missing post-write HF mini-surface | B-W12 below |
| `repay_debt` | receipt → HF + savings update | ⚠️ same | B-W12 below |
| `claim_rewards` | receipt → "rewards added" + balance | ⚠️ receipt at bar with per-reward rows; post-write covered | covered |
| `harvest_rewards` | receipt → multi-leg breakdown | ✅ already shows claimed / swapped / deposited / skipped lines (Track B/2026-05-08 work). Minor polish only. | none |
| `swap_execute` | receipt → balance update + new asset card | ⚠️ receipt at bar; covered by 23A-A6 + 23B-W1 | covered |
| `volo_stake` / `volo_unstake` | receipt → vSUI position | ⚠️ receipt at bar; needs StakingCard post-write polish (B-W13) | B-W13 |
| `pay_api` | **per-MPP-service surface** (CardPreview / TrackPlayer / VendorReceipt / etc.) | ❌ generic 3-line `Service / Cost / Delivery`. **Single biggest gap.** | B-MPP block below |
| `save_contact` | (already covered above as a "write" via the engine, no on-chain tx) | ❌ no dispatch | B-N6 |

### Step 2 — Read polish work items

- **B-W1 — `BalanceCard` post-write 3-col variant.** Add a `variant?: 'post-write'` prop that renders AVAILABLE / EARNING / HELD per demo `BalCard`. Used by the `<PostWriteRefreshSurface>` from 23A-A6 instead of the default 5-col Total/Wallet/Savings/DeFi/Debt layout.
- **B-W2/W3/W4/W5/W6/W7** — read each card, screenshot vs demo, file individual deltas. Most likely small (3-line) tweaks each.
- **B-W8** — `PaymentLinkCard` for `create_payment_link`: ensure QR is real (not skeleton), ensure "COPY LINK" button works, ensure URL render matches demo 02 (`audric.ai/pay/gh5Nk6h4` with mono font).
- **B-W9/W11** — split `PaymentLinkCard` and `InvoiceCard` into single-item vs list-item variants. Wire `list_payment_links` to a new `PaymentLinkListCard` (or re-use as table).
- **B-W12** — `HealthSummary` mini-surface for post-borrow/repay PWR. Render under `PostWriteRefreshSurface` when the write was `borrow` or `repay_debt`.
- **B-W13** — `StakingCard` post-write variant for `volo_stake` / `volo_unstake`.

### Step 3 — Missing read surfaces (B-N1 → B-N6)

- **B-N1/N2** — Confirmation chip primitive for cancel_*. Lightweight.
- **B-N3** — Wire `spending_analytics` into `ToolResultCard.CARD_RENDERERS` → `SpendingBreakdownCanvas` (already exists in `cards/canvas/`).
- **B-N4** — Inline `<SuinsResolution>` single-line surface (no card; just `<AudricLine>` styled output).
- **B-N5** — `PendingRewardsCard` — companion to `harvest_rewards` receipt. Demo bar: per-asset claimable list with USD totals.
- **B-N6** — Inline confirmation chip for `save_contact`.

### Step 4 — `pay_api` MPP service surface registry (B-MPP block)

This is the bulk of 23B effort. Build a `MppServiceRenderer` registry keyed on `serviceName` (or normalised slug) that returns a bespoke React surface.

**Note:** the original B-MPP4 ("side-by-side companion preview before approval") was wrong-shaped after re-reading demos 03 + 04. It's been replaced by **B-MPP6 (post-execution review with regenerate)** below — which is host-only, doesn't need engine extension, and is the more important pattern for the store launch.

```typescript
// apps/web/components/engine/cards/mpp/registry.ts
export const MPP_SERVICE_RENDERERS: Record<string, (data: PayApiResult) => ReactNode> = {
  'dalle': (data) => <CardPreview imageUrl={data.previewUrl} caption={data.prompt} />,
  'suno': (data) => <TrackPlayer audioUrl={data.audioUrl} cover={data.coverUrl} title={data.title} />,
  'lob': (data) => <PrintReceipt vendor="Lob" eta={data.deliveryEstimate} tier={data.shippingTier} />,
  'teleflora': (data) => <FlowerReceipt vendor="Teleflora" eta={data.deliveryEstimate} stems={data.stems} />,
  'walrus': (data) => <StorageStatus blobId={data.blobId} permanence="permanent" />,
  'seal': (data) => <EncryptionGate price={data.unlockPriceUsdc} />,
  'pdfshift': (data) => <DocumentBadge pages={data.pageCount} format={data.format} />,
  'cakeboss': (data) => <VendorReceipt vendor="CakeBoss" item={data.itemDescription} pickup={data.pickupTime} />,
  'partycity': (data) => <VendorReceipt vendor="Party City" item={data.itemDescription} eta={data.deliveryEstimate} />,
  'amazon': (data) => <VendorReceipt vendor="Amazon" item={data.itemDescription} eta={data.deliveryEstimate} prime={true} />,
  'walmart': (data) => <VendorReceipt vendor="Walmart" item={data.itemDescription} eta={data.deliveryEstimate} />,
  'bandcamp': (data) => <VendorReceipt vendor="Bandcamp" item={data.itemDescription} />,
  'bookshop': (data) => <VendorReceipt vendor="Bookshop.org" item={data.itemDescription} />,
  'bluebottle': (data) => <SubscriptionReceipt vendor="Blue Bottle" item={data.itemDescription} duration={data.duration} />,
  // ... fill out per-service from MPP catalog
};

// Fallback for unknown services — current TransactionReceiptCard.pay_api branch
export function renderMppService(data: PayApiResult): ReactNode {
  const slug = normaliseServiceSlug(data.serviceName ?? '');
  const renderer = MPP_SERVICE_RENDERERS[slug];
  if (renderer) return renderer(data);
  return <GenericMppReceipt service={data.serviceName} cost={data.amount} delivery={data.deliveryEstimate} />;
}
```

**Subordinate work:**
- **B-MPP1** — Build the `MppServiceRenderer` registry shape + 4 reusable primitives: `<CardPreview>` (DALL-E art + caption), `<TrackPlayer>` (Suno audio + cover + waveform + play), `<BookCover>` (PDFShift output preview), `<VendorReceipt>` (parameterised over vendor logo + delivery shape — covers Lob/Teleflora/CakeBoss/Amazon/Walmart/Bandcamp/Bookshop/etc.).
- **B-MPP2** — Wire registry into `TransactionReceiptCard.getHeroLines.pay_api` branch (or move the entire `pay_api` render out of the receipt card into a dedicated dispatch path).
- **B-MPP3** — Populate the registry for the **top-10 MPP services by call count** (audit NeonDB `TurnMetrics.toolsCalled` for last 30d to find which services actually fire). Avoid speculative coverage; iterate.
- **B-MPP4** — *(REMOVED — was wrong-shaped, replaced by B-MPP6 below.)*
- **B-MPP5** — Multi-service receipt grid: when `pay_api` fires sequentially across multiple services (today's behaviour) OR as one bundle (post-SPEC 16), the result grid shows all N service receipts as a responsive grid (per demo 05/06/07). Visual wrapper only — atomicity language ("ATOMIC PAYMENT INTENT") stays gated on `action.steps?.length > 1` and lights up automatically once SPEC 16 ships.
- **B-MPP6** — **Preview + regenerate review surface (NEW, replaces B-MPP4).** For previewable content-gen MPP services (DALL-E, Suno, PDFShift book/PDF), append a `<ReviewCard>` primitive after the result render with [Accept] [Regenerate] [Cancel] buttons + cost-transparency footer. Pattern matches demo 03 (Suno) + demo 04 (coloring book). Host-only — uses existing chip-style auto-send pattern; engine just needs the `stripLlmDirectives` strip-list extended with one new sentinel for the synthesized "Regenerate" / "Cancel" / "Accept and proceed" user messages. ~1d primitive + ½d per service integration. **Critical for Audric Store launch** — without it, every regen costs an extra LLM round-trip + the user has to type "do it again" in chat.
  - **`autonomousDailyLimit` interaction (resolved Q-regen-limit, 2026-05-11):** when cumulative session spend has crossed `autonomousDailyLimit`, the next regen — which would normally auto-execute under conservative tier — silently downgrades to a `confirm` PermissionCard via the existing safeguard. **Acceptable for v1.** ReviewCard's [Regenerate] button still fires; the `pay_api` call hits the existing tier-resolution path; if the tier resolves to `confirm`, the PermissionCard surfaces and the user taps once more. No new chrome required for v1.
  - **Follow-up (SPEC 23B.1, telemetry-gated):** if NeonDB shows ≥5% of regen attempts triggering the silent downgrade in the first 30 days post-launch, add a banner to ReviewCard ("Daily auto-spend limit hit — next regen requires confirmation"). Out of v1 to avoid speculative chrome; revisit at the 30d data review.

### Acceptance — 23B

- [ ] Inventory matrix in `spec/SPEC_23B_INVENTORY.md` shows ✅ for every row.
- [ ] Side-by-side screenshot: demo 05 step 9 (post-execution: 3-col Receipt grid for DALL-E / Lob / Teleflora) vs production rendering of an equivalent 3-MPP `pay_api` flow. Visual diff < 5%. (Note: production will show 3 sequential confirms vs demo's 1 atomic confirm until SPEC 16 ships — the receipt grid still matches.)
- [ ] Side-by-side screenshot: demo 03 step 5 (`<TrackPlayer>` for Suno + `<ReviewCard>` with Accept/Regenerate/Cancel) vs production rendering of a `suno/generate` MPP call. Visual diff < 5%. **B-MPP6 review surface fires correctly when user taps Regenerate (re-calls the MPP service with a fresh seed).**
- [ ] Side-by-side screenshot: demo 04 step 5 (`<BookCover>` for coloring book + `<ReviewCard>`) vs production. Visual diff < 5%.
- [ ] Side-by-side screenshot: demo 02 step 3 (`PaymentLinkCard` with QR) vs production. Visual diff < 5%.
- [ ] All 7 ❌ tools now render a non-null surface (test by triggering each in a dev session).
- [ ] No regression on `pnpm test` (2041/2041).

### Effort — 23B

~5-8d. The variance is in MPP coverage:
- **5d** if the top-10 MPP services covered + ⚠️ polish + ❌ closures done.
- **8d** if all 40 MPP services covered with bespoke renderers (probably not worth it; pareto-truncate).

---

## 3. SPEC 23C — Motion Polish (Phase 3, ~2-3d)

**Goal:** Layer Framer Motion polish on top of the now-correct primitives. Carry-over from the original `spec_smooth_chrome` 8-item plan.

### Items (unchanged from prior `spec_smooth_chrome`)

| # | Title | Notes |
|---|---|---|
| C1 | Card mount animation (Framer Motion `initial={{opacity:0, y:8, scale:0.98}}` → `animate`) | Multi-row cards stagger child appearance ~30ms. Reuse SPEC 21's `TransitionChip` Framer pattern. |
| C2 | Skeleton-first render | Every tool dispatches a skeleton card on `tool_start`, morphs to real content on `tool_result`. New `<SkeletonCard>` primitive. |
| C3 | Animated number transitions | Balance / HF / APY / portfolio total tick from old → new over 300-400ms. New `<NumberTicker>` primitive. |
| C4 | Smooth scroll-into-view | `easeOutCubic` ~250ms. Helper hook `useScrollNewMessageIntoView`. |
| C5 | Pre-token typing indicator | Pulsing 3-dot ellipsis during the TTFVP gap. |
| C6 | Confirm button micro-interaction | Confirm button morphs inline (label → spinner → checkmark → fade) instead of the whole card freezing. |
| C7 | Receipt success choreography | Receipt card draws checkmark stroke + single subtle accent pulse. One-shot, ~600ms total, no loops. |
| C8 | `prefers-reduced-motion` respect | Every animation degrades to opacity-only fade. |

### Acceptance — 23C

- [ ] Founder smoke says "feels smoother" on at least 3 of: swap quote render, balance update, confirm tap, receipt land, activity feed scroll.
- [ ] TTFVP p95 doesn't grow >50ms vs prior deploy (animation must not block first paint).
- [ ] CLS (cumulative layout shift) on a 3-card turn ≤ 0.1.
- [ ] `prefers-reduced-motion: reduce` users see all 8 items degrade to opacity-only fade.
- [ ] No regression on `pnpm test`.

### Effort — 23C

~2-3d. No engine changes. Framer Motion already in deps.

---

## 4. Cross-spec dependencies + sequencing

```
SPEC 23A  (universal primitives wired up correctly)
   │
   ├─→ SPEC 23B  (per-tool result surfaces close inventory ⚠️ + ❌ + MPP)
   │     │
   │     └─→ SPEC 23C  (motion polish on top of correct surfaces)
```

- **23A → 23B**: 23B uses 23A's `PostWriteRefreshSurface` wrapper for post-write groups. Without 23A, B-W1 (post-write 3-col BalanceCard) has nowhere to live.
- **23B → 23C**: 23C animates surfaces; animating the wrong surface polishes the wrong thing. Skeleton-first (C2) needs to know per-tool result shape (23B's renderers).
- **Slot SPEC 11 (PayButton) anywhere after 23A.** PayButton's confirm-card surface inherits A4 (BundleStepsList sub-text), A5 (PermissionCard polish), A6 (PostWriteRefreshSurface) and B-MPP4 (side-by-side companion) by construction.

### Sequencing options the founder picked from

- **(a) Full sequence 23A → 23B → 23C — picked.** ~10-14d total. Most thorough; demo-parity locked everywhere before SPEC 11 PayButton.
- (b) 23A only, defer 23B + 23C. Fastest visual lift but doesn't close the per-tool gap.
- (c) 23A + 23B's `pay_api` slice only. Targets the moat specifically; defers post-write family + motion.

---

## 5. Resolved questions + remaining open items

### Q1 — Legacy harness — RESOLVED 2026-05-11 ~07:00 AEST + audit confirmed 07:25 AEST

**Decision: kill the legacy renderer as a SPEC 23A-precondition (P0, before A1-A7).**

State of play (verified 2026-05-11):
- `NEXT_PUBLIC_INTERACTIVE_HARNESS` is set in Vercel production (truthy).
- `NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT` is NOT set → `rolloutPercent()` returns `null` → `currentHarnessVersion()` returns `'v2'` for every new session.
- **Upstash audit 07:25 AEST: 0 sessions pinned to `'legacy'`** (52 sessions scanned, all 52 v2-pinned, 0 unpinned, 0 active legacy in last 7d). Older 10%→50% canary sessions all aged out via the 24h Upstash TTL. Migration step is a no-op.

Cost of keeping legacy: every primitive change in SPEC 23 has to either (a) touch both paths (~30% extra work) or (b) leave legacy users seeing broken/stale primitives. Both are bad.

**Rip plan moved up to §1 SPEC 23A "P0 prerequisite" (~½d now that audit confirms 0 migration target).** See §1 above for the simplified step list.

### Q2 — `pay_api` bundle confirmation — RESOLVED 2026-05-11 ~07:00 AEST

**Decision: accept the deviation. Atomic multi-MPP bundling defers to SPEC 16.**

Founder reasoning (2026-05-11): the gap maps cleanly to existing permission tiers + SPEC 16's scope:
- Tiny micro-MPP costs (DALL-E $0.04, Suno $0.05, Walrus free, Seal free, PDFShift $0.05) auto-execute under conservative tier (`globalAutoBelow: $5`). Demo 03/04's "no PermissionCard" flow already works as designed.
- Larger MPP spends ($45 Teleflora, $55 CakeBoss, $30-50 vendor gifts) confirm individually. Demo 05/06/07 will show 2-5 sequential PermissionCards instead of one bundled "ATOMIC PAYMENT INTENT" card until SPEC 16 ships.

**Visual implication for SPEC 23B:**
- The B-MPP5 receipt grid (3-col / 5-col grid of per-vendor receipts) STILL renders correctly even when underlying writes are sequential — it's a visual wrapper, not an atomicity wrapper.
- The "1 Payment Intent · N calls · ATOMIC · USDC" PermissionCard subtitle (demo bar) downgrades to "Confirmation N of M" or similar plain-language framing on non-bundled paths.
- Once SPEC 16 ships, the visual chrome upgrades to "ATOMIC" without further host work — the renderer reads `action.steps?.length > 1` and switches mode.

### Q3 — Preview + regenerate pattern — RESOLVED + REPLACED B-MPP4

**Original framing was wrong.** The demos 03 + 04 don't show "preview before approval, side-by-side with PermissionCard." They show **post-execution review with [Accept] [Regenerate] [Cancel] buttons.**

The actual demo 03 flow (re-verified):

1. User: "Make me a lo-fi beat called Midnight Rain and sell it for $5"
2. Engine dispatches Suno + DALL-E + Walrus + Seal in parallel ($0.09 total → auto-executes under conservative tier, no PermissionCard)
3. Result lands as `<TrackPlayer>` (rich preview: cover art + audio waveform + play button)
4. `<ReviewCard>` underneath with 3 buttons:
   - **ACCEPT & LIST FOR $5** — proceed to listing
   - **REGENERATE** — re-fire the MPP calls with new seed (costs $0.09 again)
   - **CANCEL** — stop; Walrus draft expires in 24h
5. Cost transparency footer: _"Regenerating costs $0.09 in MPP calls. Cancelling costs nothing — Walrus draft expires in 24h."_

Demo 04 (coloring book) follows the identical pattern with a `<BookCover>` preview replacing `<TrackPlayer>`.

**Why this matters for the store launch:** Audric Store is creator-driven. Creators iterate ("first beat too jazzy → regenerate → still off → regenerate → that's the one → list it"). The Regenerate button IS the iteration loop. Without it, every regen costs an extra LLM round-trip + the user has to type "do it again" in chat.

**This becomes new work item B-MPP6 in SPEC 23B (replaces my earlier wrong B-MPP4):**

- New `<ReviewCard>` primitive — similar shape to existing `<ConfirmChips>`. 3 buttons + transparency footer.
- Pairs with each previewable MPP service surface (`<TrackPlayer>` from B-MPP1, `<CardPreview>` from B-MPP1, `<BookCover>` new). When the LLM detects "user is iterating on AI content" intent, it appends a ReviewCard to the result render.
- Accept / Regenerate / Cancel fire stashed-message intents (same `engine.sendChipDecision` pattern as `<ConfirmChips>`). Regenerate auto-sends a synthesized "Regenerate the previous output" user message that gets stripped from the visible chat (existing `stripLlmDirectives` from `spec_session_refresh_chat_divergence` work handles the family of stashed messages — extend the strip-list with one new sentinel).
- Cost-transparency footer is computed from the engine's `pay_api` quote response (same data shape as the receipt).

**No engine extension needed for the basic flow.** The LLM already has full conversation context — "Regenerate" maps cleanly to "re-call the most recent `pay_api` tool with the same input + a fresh seed param." Engine just needs the strip-list extended with the new sentinel + (optionally) a guard that prevents infinite regen loops if the LLM misclassifies.

**Effort:** ~1d for `<ReviewCard>` primitive + sentinel strip extension + tests. ~½d for integration with each previewable MPP service. Total ~1.5d, fits inside existing 23B envelope.

**Open dial for founder:** how many regens before we surface a budget hint? ("You've spent $0.36 regenerating this beat — set a regen budget?"). Out of scope for 23B v1 — flag as a follow-up if the data shows >5 regens per content-gen flow being common in practice.

### Q-acceptance — Screenshot-diff acceptance bar — RESOLVED 2026-05-11 ~07:25 AEST

**Decision: soften to subjective side-by-side founder review. No automated diff infra.**

Rationale: capturing demo screenshots at the right viewport + rendering production deterministically would itself cost ~1d of infra. Founder is the visual-quality owner anyway — subjective review is faster, catches the same defects (whitespace, font weight, line-height drift, shadow depth), and gives faster iteration.

Scoring rubric per acceptance row:
- **Green** = ship.
- **Yellow** = file delta + ship (delta becomes a follow-up bug, not a blocker).
- **Red** = block + iterate.

Applies to all 23A and 23B acceptance rows that previously said "visual diff < 5%". The text in the acceptance lists is updated accordingly.

### Q-source — PWR-injected vs LLM-initiated tool events — RESOLVED 2026-05-11 ~07:25 AEST

**Decision: engine adds a `source: 'pwr' | 'llm' | 'user'` field to `tool_start` + `tool_result` events.**

Rationale (recommendation accepted): the PWR contract is already part of `EngineConfig.postWriteRefresh` — adding a `source` field formalizes what's already implicit in that config. Three downstream wins beyond unblocking 23A-A6:

1. **Telemetry parity.** The dedup audit I ran for `spec_pwr_dedup` had to infer "was this PWR or LLM" from `turnPhase = 'resume'`. Brittle; one new path that bypasses `runPostWriteRefresh` and the inference breaks. Source field is exact.
2. **Future "audit trail" needs.** When AdviceLog or ChainMemory wants to ask "did the agent suggest this read or did it run automatically?", the source field is right there — no heuristic.
3. **No host heuristic to maintain.** Alternative was "host treats `balance_check` arriving within 2s of a confirmed write as PWR". False positive if the LLM ALSO calls `balance_check` in the same window (already happens — see the dedup audit). Source field has zero false positives.

**Implementation:**
- `packages/engine/src/types.ts`: extend `EngineEvent`'s `tool_start` + `tool_result` variants with `source: 'pwr' | 'llm' | 'user'` (required field).
- `packages/engine/src/engine.ts`: in `runPostWriteRefresh`, stamp `source: 'pwr'` on every emitted tool event. The default LLM dispatch path stamps `source: 'llm'`. The user-initiated path (e.g. chip flows that call tools via host wrappers) stamps `source: 'user'` — though today the engine doesn't have a "user-initiated tool" concept directly; `'user'` is reserved for host-side renderers that synthesize tool events for chip-driven recipes (SPEC 12 territory). For 23A's purpose, `'pwr'` and `'llm'` are the only ones that have to ship.
- Engine version bump: minor (new required field is technically a breaking change for downstream type consumers, but the new field is engine-emitted, never host-set on tool events; existing host code ignores unknown fields safely).
- Cross-repo coordination: ship engine vNext first, then bump audric to consume.
- Acceptance: dedup audit (and any future telemetry consumer) can filter `WHERE source = 'pwr'` directly instead of inferring from `turnPhase`.

### Q-canvas — Canvas inventory coverage — RESOLVED 2026-05-11 ~07:25 AEST

**Decision: add a canvas walkthrough to SPEC 23B Step 1 inventory pass.** Step 1 budget bumped from ½d to ~1d.

The inventory pass (now ~1d) walks every file under `apps/web/components/engine/canvas/` + `cards/canvas/` and adds a "Canvases" section to the matrix. See updated Step 1 above for the specific surface to nail (FullPortfolioCanvas, SpendingBreakdownCanvas, render_canvas modal vs inline decision, dead-canvas detection).

### Q-regen-limit — B-MPP6 regen × `autonomousDailyLimit` — RESOLVED 2026-05-11 ~07:25 AEST

**Decision: accept the silent downgrade for v1.** ReviewCard's [Regenerate] button fires; existing tier-resolution path surfaces a PermissionCard if the cumulative spend has crossed the daily limit. No new chrome.

**Follow-up (SPEC 23B.1, telemetry-gated):** if NeonDB shows ≥5% of regen attempts triggering the silent downgrade in the first 30 days post-launch, add a banner to ReviewCard. Otherwise drop the follow-up at the 30d review.

(Already inlined into B-MPP6's bullet above — captured here for the locked-decisions index.)

---

### Remaining open questions (still need answers, not blocking 23A start)

#### Q4 — `harvest_rewards` dedicated breakdown surface

Today the receipt shows `Claimed → Swapped → Deposited → Skipped` as 4 row types. Demo doesn't have a direct equivalent (no harvest demo). Keep receipt-only or add a 4-step visual flow card?

I lean receipt-only (existing implementation already covers the breakdown; visual flow card would be over-engineering for a single-tool surface).

#### Q5 — `mpp_services` list rendering — table or service grid?

Demo 05 shows tools dispatching as `ParallelToolsRow` ("DISCOVER MPP · 40 svcs · 88 endpts") but never shows the *expanded* listing. Today `ServiceCatalogCard` exists; verify against current Audric design system.

#### Q6 — `render_canvas` row-preview

Today canvases open in `CanvasModal`; the demos show inline canvases. Inline-vs-modal might be a separate decision point — render path differs entirely from `ToolResultCard.CARD_RENDERERS`. Out of scope for SPEC 23A; flag for SPEC 23B inventory pass.

#### Q7 — MPP service slug normalisation

What's the canonical slug format? Audit `pay_api` `serviceName` shape across recent NeonDB rows before locking the registry key format. Likely `lowercase-kebab` (e.g. `dalle`, `blue-bottle`, `bookshop-org`) but needs confirmation. Defer to B-MPP1 implementation moment.

#### Q8 — Engine telemetry for per-tool result-preview registry (23A-A1)

The 23A-A1 `getResultPreview(toolName, result)` registry computes a row sub-text from the tool's *result* payload. For tools where the result shape lives only in the engine (e.g. `mpp_services._refine` payload, or the `defiSource` field on `balance_check`), the registry needs to import those types. Straightforward — `@t2000/engine` exports them — but worth a one-line confirmation that no result shape is "engine-private."

---

## 6. What's deliberately NOT in SPEC 23

- **Atomic multi-MPP bundling.** Today every `pay_api` call is its own write/confirm. Demos 05/06/07 show 3-5 MPP calls bundled into one atomic Payment Intent. **SPEC 16 (atomic multi-MPP work) owns this.** SPEC 23B's B-MPP5 receipt grid renders correctly either way — once SPEC 16 ships, the "ATOMIC PAYMENT INTENT" subtitle lights up automatically based on `action.steps?.length > 1` without further host work. (Resolved Q2 above.)
- **New cards for unsupported tools.** If a tool isn't in the engine's `getDefaultTools()`, no card. We're not adding speculative coverage.
- **Dark mode polish.** Dark mode already works via the existing token system; out of scope.
- **Mobile-specific layouts.** Demos are responsive but the spec doesn't promise mobile-specific work; treat mobile bugs as separate.
- **Sound effects, haptics, theme transitions, confetti.** All out (per original `spec_smooth_chrome` scope hygiene).
- **Engine changes (mostly).** Most work is host-side. Three engine touchpoints accepted:
  - (a) `tool_start` / `tool_result` events get a new required `source: 'pwr' | 'llm' | 'user'` field (Q-source, ½d, **engine minor bump required** — ship engine vNext, then bump audric to consume).
  - (b) Extending host-side `stripLlmDirectives` strip-list with B-MPP6's "Regenerate" / "Cancel" / "Accept" sentinels (host-only, no engine change).
  - (c) The legacy harness rip's session-metadata migration is a no-op per the 0-row audit; only the host-side defensive auto-flip guard ships.
- **Regen budget hints.** Once a creator regenerates the same content >5 times, the demos suggest surfacing a "you've spent $X regenerating — set a budget?" hint. Out of 23B v1; flag as follow-up if NeonDB shows >5 regens per content-gen flow being common.

---

## 7. Tracking

When founder approves the spec, promote into `audric-build-tracker.md` Forward backlog as 3 entries (S.### per spec). Each ships independently and gets its own snapshot in `spec/PERF_SNAPSHOTS.md`.

End of SPEC 23 lock.
