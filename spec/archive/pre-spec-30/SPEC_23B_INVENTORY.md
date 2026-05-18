# SPEC 23B Inventory — Per-Tool Result Surfaces

**Phase 1 deliverable** for SPEC 23B (`SPEC_23_HARNESS_UX_PARITY.md`).
Walks every read tool, write receipt, canvas, and MPP service against the demo bar at `audric_demos_v2/demos/*.html`.

**Date:** 2026-05-11
**Author:** post-23A inventory pass
**Status:** complete; ready for founder prioritization sign-off before phase 2 kicks off
**Engine version observed:** `@t2000/engine@1.28.x` (post-A6 source-field bump)
**Audric ref:** `abaaffa` (post-23A ship)

---

## TL;DR

- **19 of 25 read tools render via explicit cards.** All ✅ as visual surfaces in their own right (no broken cards, no shape mismatches in production smoke). 6 tools have no card (`cancel_payment_link`=N1, `cancel_invoice`=N2, `spending_analytics`=N3, `resolve_suins`=N4, `pending_rewards`=N5, `save_contact`=N6) — all confirmed missing per the SPEC 23 numbering. `render_canvas` renders via a separate `CanvasTemplateRenderer` path and is OK.
- **Write receipts** (`TransactionReceiptCard` + `BundleReceiptBlockView`) cover every write tool (`save_deposit` / `withdraw` / `swap_execute` / `send_transfer` / `borrow` / `repay_debt` / `claim_rewards` / `harvest_rewards` / `volo_stake` / `volo_unstake` / `pay_api`). All ✅ structurally — the items below are polish (W1–W13).
- **8 canvases exist** under `cards/canvas/` — all 8 are wired into `CanvasTemplateRenderer.tsx` and reachable via `render_canvas`. Zero defined-but-unreached. The under-weighted area in the original audit was **canvas-mediated tool invocation**, not the canvases themselves: e.g. `spending_analytics` returns text + a `SpendingBreakdownCanvas` exists but the LLM doesn't auto-route through `render_canvas('spending_breakdown')`.
- **MPP top-5 (last 30d, NeonDB `ServicePurchase` table):** `Anthropic` (3 calls, $0.03), `Fal/Flux` (3, $0.09), `ElevenLabs` (1, $0.05), `Lob` (1, $1.00), `OpenWeather` (1, $0.01). Total 9 paid MPP calls in 30d — production traffic is essentially zero. **B-MPP work is positioning for future, not addressing user pain today**, but the 5 services map cleanly to demo primitives so we can build them confidently.

**Recommended phase 2/3 order (justified at the end):**
1. **N1, N2, N6** (≤1d each, high user value, low risk) — confirmation chips for `cancel_*` + `save_contact` clarity
2. **W1, W2, W6, W12** (~1.5d) — receipt polish hot spots
3. **N3** (~½d) — wire `spending_analytics` → `SpendingBreakdownCanvas` via prompt directive (engine change, not card)
4. **N4, N5** (~1d combined) — `<SuinsResolution>` inline + `PendingRewardsCard`
5. **B-MPP1 + B-MPP2** (~2d) — MPP service primitive registry + wire to `pay_api` receipt
6. **W3, W4, W5, W7–W11, W13** (~2d) — remaining write polish
7. **B-MPP3, B-MPP5, B-MPP6** (~1.5d) — multi-service grid + ReviewCard

Total ≈ **8–9d** of focused work, lines up with the SPEC 23B 5–8d estimate within margin.

---

## Section 1 — Read tools (24 tools, 19 cards)

| # | Tool | Card | Status | Notes |
|---|---|---|---|---|
| 1 | `balance_check` | `BalanceCard` | ✅ polish | Demo `01-save-50.html` step 5 shows 4-col layout ("Total / Wallet / Savings / DeFi"). Audric renders 3-5 cols dynamically based on what the engine returned — **W1 spec item is to add a "post-write" 3-col variant** that fits inline below a save/withdraw receipt. Sticky-stale DeFi degradation is solid (v0.54). |
| 2 | `savings_info` | `SavingsCard` | ✅ | Tables with supply/borrow positions. `Blended APY` + `Daily` summary at footer. Matches demo bar. |
| 3 | `swap_quote` | `SwapQuoteCard` | ✅ | Demo `01-save-50.html` step 6 surface — already aligned. Defensive numeric coercion for `priceImpact` (Cetus's `deviationRatio` arrives as string sometimes). |
| 4 | `rates_info` | `RatesCard` | ✅ | Sorted by saveApy descending. No issues. |
| 5 | `health_check` | `HealthCard` | ✅ | Gauge primitive + `∞` for no-debt is correct. `getHfStatus` + `formatHf` are exported pure functions for testing. |
| 6 | `portfolio_analysis` | `PortfolioCard` | ✅ polish | Hero number + MiniBar segments + breakdown rows. Insights array surfaces engine-side warnings. **W7 spec item is small polish (insights typography + spacing).** |
| 7 | `transaction_history` | `TransactionHistoryCard` | ✅ polish | 10 rows by default (v1.5.3). Per-row icon + signed amount + relative time + Suiscan link. **W12 spec item: tighten icon registry — currently 16 hardcoded glyphs in `ACTION_ICONS`; verify against actual engine label set.** |
| 8 | `explain_tx` | `ExplainTxCard` | ✅ | Status + gas + effects list. Working. |
| 9 | `mpp_services` | `ServiceCatalogCard` | ✅ polish | Category-grouped accordion, expandable. Demo `06-party-shop.html` shows a vendor cluster with line-items per service. **W11 spec item: add "in-flight" preview row when `mpp_services` is being queried** (today the streaming sub-line is generic `querying…`). |
| 10 | `web_search` | `SearchResultsCard` | ✅ | Domain extraction + line-clamp on description. Show-more button. Demo aligned. |
| 11 | `yield_summary` | `YieldEarningsCard` | ✅ polish | All-time hero + sparkline + Today/Week/Month/All breakdown. Sparkline is svg-based, works in dark mode. **W6 spec item: tighten sparkline kerning for sub-cent values (today shows `< $0.01` 4× when no yield earned yet — visually noisy).** |
| 12 | `activity_summary` | `ActivitySummaryCard` | ✅ | `MAY Activity / 355 transactions / On-chain 97% / Services 3%` rendered correctly in founder smoke. MiniBar segments + by-action rows + summary footer. |
| 13 | `create_payment_link` | `PaymentLinkCard` (single) | ✅ polish | Single-link branch shows label + amount + memo + URL with copy. **W2 spec item: add a small "preview QR" snippet inline** when `link.amount && !link.memo` (matches demo `02-payment-link.html` mid-flow). |
| 14 | `list_payment_links` | `PaymentLinkCard` (list) | ✅ polish | List branch shows status pill + amount/date + slug. Active links get a copy button. **W2 also tightens the list density (each row could be 2px tighter).** |
| 15 | `create_invoice` | `InvoiceCard` (single) | ✅ polish | Same shape as PaymentLinkCard. **W2 applies symmetrically.** |
| 16 | `list_invoices` | `InvoiceCard` (list) | ✅ polish | Same. |
| 17 | `volo_stats` | `StakingCard` | ✅ polish | APY hero + exchange rate + total staked. Working. **W13 spec item: add a "your stake / APY earned" inline section** for users who already hold vSUI (today the card is purely market data, no personalization). |
| 18 | `protocol_deep_dive` | `ProtocolCard` | ✅ | Safety score + TVL trend + fees/revenue + chains + risk factors + URL. Comprehensive. |
| 19 | `token_prices` | `PriceCard` | ✅ | Array branch (`token_prices`) + change branch (deprecated `defillama_price_change` shape). Working. |
| 20 | `cancel_payment_link` | — | ❌ N1 | No card. Falls through to `null` in `ToolResultCard.tsx`. Spec wants a confirmation chip ("Payment link `xyz123` cancelled · users can no longer pay"). |
| 21 | `cancel_invoice` | — | ❌ N2 | Same as N1, for invoices. |
| 22 | `spending_analytics` | — | ⚠️ N3 | Tool returns text; `SpendingBreakdownCanvas` exists and is unreached when LLM calls `spending_analytics` directly. Fix is engine-side: add a system-prompt directive that prefers `render_canvas('spending_breakdown', { period })` for "show me my spending" questions. **NOT a card-side fix** — the canvas already works. |
| 23 | `resolve_suins` | — | ❌ N4 | No card. Spec wants an inline `<SuinsResolution>` chip ("`alex.sui` → `0xab12…cd34` · resolved in 142ms"). |
| 24 | `pending_rewards` | `PendingRewardsCard` | ✅ N5 (shipped 2026-05-12) | Renders 3 states: healthy + claimable (Symbol/Amount/Value table + Total claimable footer with conditional USD-column suppression for unpriced rewards), healthy + empty, degraded (warning naming the protocol). Data-only by design — the existing `🌾 HARVEST ALL` / `🎁 JUST CLAIM` chips at `lib/suggested-actions.ts:131-134` cover both action affordances. See `apps/web/components/engine/cards/PendingRewardsCard.tsx` header for the design rationale. |
| 25 | `render_canvas` | — | ✅ different path | Renders via `CanvasTemplateRenderer` + `CanvasModal`, not via `CARD_RENDERERS`. Working. |
| 26 | `save_contact` | — | ❌ N6 | Engine write tool (no on-chain tx — pure host-side state). Falls through to `null` because `WRITE_TOOL_NAMES` requires `data.tx` to render `TransactionReceiptCard`. Spec wants an inline confirmation chip ("Saved `funkii` · 0x4abc…1234"). |

---

## Section 2 — Write receipts (`TransactionReceiptCard` + `BundleReceiptBlockView`)

`ToolResultCard.tsx:WRITE_TOOL_NAMES` covers every write tool. The receipt code path:

```
write tool → tool_result → audric/api/transactions/execute → success → TransactionReceiptCard.tsx
                                                          → bundle  → BundleReceiptBlockView.tsx
```

| Tool | Hero lines (TransactionReceiptCard.getHeroLines) | Status | Notes |
|---|---|---|---|
| `save_deposit` | `Deposited X USDC` + `APY ?%` | ✅ | Fine. |
| `withdraw` | `Withdrawn X USDC` | ✅ minimal | **W4: add "Remaining savings" line** (post-write balance, mirroring borrow's "Remaining"). |
| `swap_execute` | `Sold` + `Received` + `Impact` | ✅ polish | **W3: add "Route" line** (e.g. `CETUS + ALPHAFI`) — currently route only shows in the pre-tap quote, not the post-execution receipt. Easy add. |
| `send_transfer` | `Amount` + `To` (chunked address with optional contact name) | ✅ | Excellent — `ChunkedAddress` is the v0.49 lost-funds-bug fix. |
| `borrow` | `Borrowed` + `Health` (color-coded) | ✅ | Fine. |
| `repay_debt` | `Repaid` + `Remaining` | ✅ | Fine. |
| `claim_rewards` | Per-reward `Claimed X TOKEN` + `Value` | ✅ | Defensive against null/0/NaN totalValueUsd. |
| `harvest_rewards` | `Claimed` + `Swapped` + `Deposited` + skip lines | ✅ polish | **W8: tighten "skipped" rendering** — currently each skipped leg is its own row with verbose labels ("Sent to wallet (no swap route)"); demo bar collapses to a single "Skipped: 2 dust legs" footer. |
| `volo_stake` | `Staked` + `Received` + `APY` | ✅ | Fine. |
| `volo_unstake` | `Unstaked` + `Received` | ✅ | Fine. |
| `pay_api` | `Service` + `Cost` + `Delivery` | ⚠️ generic | **B-MPP2: replace generic 3-line render with `MppServiceRenderer` registry-dispatched primitive** (CardPreview / TrackPlayer / BookCover / VendorReceipt depending on serviceId). |

`BundleReceiptBlockView` is well-built (one `CardShell` + per-leg rows + Suiscan + footer). **W5: add `⚡ GAS · SPONSORED` prefix** to match the post-23A `PermissionCard` ⚡ footer (today `BundleReceiptBlockView.tsx:148` shows plain `GAS · SPONSORED`). Matches the consistency item I flagged in the founder visual review.

---

## Section 3 — Canvases (8 templates, all reachable)

Source of truth: `apps/web/components/engine/CanvasTemplateRenderer.tsx`.

| # | Canvas | Template name | Status | Reach path |
|---|---|---|---|---|
| 1 | `YieldProjectorCanvas` | `yield_projector` | ✅ | `render_canvas('yield_projector')` — pure client-side simulator, no address required |
| 2 | `HealthSimulatorCanvas` | `health_simulator` | ✅ | `render_canvas('health_simulator')` — accepts `params.address` |
| 3 | `DCAPlanner` | `dca_planner` | ✅ | `render_canvas('dca_planner')` — pure client-side simulator |
| 4 | `ActivityHeatmapCanvas` | `activity_heatmap` | ✅ | `render_canvas('activity_heatmap')` — accepts `params.address` |
| 5 | `PortfolioTimelineCanvas` | `portfolio_timeline` | ✅ | `render_canvas('portfolio_timeline')` — accepts `params.address` |
| 6 | `SpendingBreakdownCanvas` | `spending_breakdown` | ⚠️ N3 | `render_canvas('spending_breakdown')` — works, but LLM rarely picks it (calls `spending_analytics` text tool instead). Spec N3 fix is engine-prompt-side, not canvas-side. |
| 7 | `WatchAddressCanvas` | `watch_address` | ✅ | `render_canvas('watch_address')` — accepts `params.address` |
| 8 | `FullPortfolioCanvas` | `full_portfolio` | ✅ | `render_canvas('full_portfolio')` — accepts `params.address` |

**Key finding:** zero defined-but-unreached canvases (the original audit's worry). The dispatch table is exhaustive. The only "gap" is N3 (spending tool routing).

---

## Section 4 — MPP services (last 30 days, NeonDB `ServicePurchase`)

```sql
SELECT "serviceId", COUNT(*)::int AS calls, ROUND(SUM("amountUsd")::numeric, 2)::float AS total_usd, COUNT(DISTINCT "address")::int AS unique_users
FROM "ServicePurchase"
WHERE "createdAt" > NOW() - INTERVAL '30 days'
GROUP BY "serviceId" ORDER BY calls DESC LIMIT 15;
```

Result (5 services touched, 9 paid calls total):

| # | Service | Calls | Total USD | Users | Demo primitive |
|---|---|---|---|---|---|
| 1 | `mpp.t2000.ai/anthropic/v1/messages` | 3 | $0.03 | 1 | none — text response, falls back to existing receipt |
| 2 | `mpp.t2000.ai/fal/fal-ai/flux/dev` | 3 | $0.09 | 1 | **`<CardPreview>`** (image) — demo `04-coloring-book.html` |
| 3 | `mpp.t2000.ai/elevenlabs/v1/text-to-speech/...` | 1 | $0.05 | 1 | **`<TrackPlayer>`** (audio) — demo `03-make-a-beat.html` |
| 4 | `mpp.t2000.ai/lob/v1/postcards` | 1 | $1.00 | 1 | **`<VendorReceipt>`** (mail) — demo `06-party-shop.html` |
| 5 | `mpp.t2000.ai/openweather/v1/weather` | 1 | $0.01 | 1 | structured-data render (use VendorReceipt) |

**Implications:**
- Production MPP traffic is essentially zero (9 calls in 30d, 1 user). B-MPP work is **positioning for the Audric Store launch + future creator economy**, not addressing live user pain.
- The 5 actually-called services map cleanly to **3 of the 4 demo primitives** (CardPreview, TrackPlayer, VendorReceipt) — `BookCover` (demo 04 books MPP) hasn't been used yet in production, but builds on the same registry pattern.
- B-MPP3 (populate top-10 from NeonDB) is essentially free — just hardcode these 5 services into the registry initially, expand as more services come online.

---

## Recommended phase 2/3 order

Rationale: ship the user-visible quick wins first (N1/N2/N6), then receipt polish that improves perceived quality without much risk (W1/W2/W6/W12), then engine-side systemic improvements (N3 prompt directive), then the moat work (B-MPP).

| # | Item | Effort | Why now |
|---|---|---|---|
| 1 | **N1, N2, N6** confirmation chips | ½d combined | High user value (cancel actions feel done); low risk; great morale start |
| 2 | **W1** post-write `BalanceCard` 3-col variant | ½d | Highest-frequency post-write moment; matches demo `01-save-50.html` step 5 |
| 3 | **W2** PaymentLinkCard / InvoiceCard polish (single + list) | ½d | Pay-flow critical |
| 4 | **W5** `BundleReceiptBlockView` ⚡ footer + W6 sparkline tightening | ¼d | Visual consistency with 23A |
| 5 | **W12** TxHistory icon registry verification | ¼d | Cheap; reduces glyph drift |
| 6 | **N3** engine prompt directive: prefer `render_canvas('spending_breakdown')` | ½d (engine-side change) | Activates an existing canvas; no new code required |
| 7 | **N4** `<SuinsResolution>` inline chip | ¼d | Small but visible |
| 8 | **N5** `PendingRewardsCard` (companion to S.119 `pending_rewards`) | ½d | Already specced; finishes the harvest-flow loop |
| 9 | **B-MPP1** `MppServiceRenderer` registry + 4 primitives (`<CardPreview>`, `<TrackPlayer>`, `<BookCover>`, `<VendorReceipt>`) | 1d | Foundation for all MPP polish; primitives are well-defined in demos |
| 10 | **B-MPP2** wire registry into `TransactionReceiptCard.pay_api` branch | ¼d | Switches the generic 3-line render to dispatched primitives |
| 11 | **W3** swap `Route` line + W4 withdraw "Remaining savings" + W7–W11 + W13 polish | 1d combined | Lower-frequency receipts; bundle them at the end |
| 12 | **B-MPP3** seed registry with 5 NeonDB-confirmed services | included in B-MPP1 | Free given the small set |
| 13 | **B-MPP5** multi-service receipt grid (visual wrapper) | ½d | Unblocks `05-mums-birthday.html` parity |
| 14 | **B-MPP6** post-execution `<ReviewCard>` with [Accept] / [Regenerate] / [Cancel] | 1d | ✅ Shipped 2026-05-12 (Option C — plain sendMessage). Wired to DALL-E (`openai/v1/images/generations`) + ElevenLabs. PDFShift skipped (deprecating to fallback per `spec_native_content_tools` HANDOFF §5). Lob/Resend skipped (terminal — no regen possible). 13 inline tests + threaded `onSendMessage` through BlockRouter → ToolBlockView → ToolResultCard → MppServiceRenderer (matches existing CanvasBlockView precedent). See `apps/web/components/engine/cards/mpp/ReviewCard.tsx` header for the Option C vs A+ design call rationale. **Follow-up: B-MPP6-fastpath** — server-side regen bypass per ChatGPT/Claude pattern (4-5d, requires permission-tier handling on regen path). Tracked in HANDOFF §3 as next work item. |
| 14a | **B-MPP6 v1.1** `<ErrorReceipt>` — error-envelope dispatch | ½d | ✅ Shipped 2026-05-12 (audric `a9de232`). Surfaced live by ElevenLabs TTS smoke ($0.05 charged + service errored after payment). Pre-fix the error envelope fell through to `<GenericMppReceipt>` rendering "MPP SERVICE · MPP" with `—` price (the `bug_audric_error_receipt_shape` from HANDOFF §8). Three-part fix: (1) `executeToolAction.pay_api` error branch preserves `serviceId` + `price` + stamps `success: false`; (2) `PayApiResult` extended with error fields; (3) `renderMppService` checks `success === false` first and routes to new `<ErrorReceipt>` primitive — vendor-named, payment-state-aware (paid → "refund pending" + Suiscan link, unpaid → "safe to retry" + no link), warning ⚠ chrome. 21 new inline tests (16 ErrorReceipt + 5 dispatch). No engine bump — host-only. |
| 15 | **HealthSummary** — HealthCard `variant: 'post-write'` for borrow/repay/harvest | ½d | ✅ Shipped 2026-05-12 (audric `59df35f`). Mirrors W1 BalanceCard's contract: compact 3-col grid (HF · Supplied · Borrowed) with status pill in HF cell, no gauge, no Max Borrow / Liq. Threshold rows, no title bar, tighter padding (px-2.5 py-1.5), smaller value typography (text-[13px]). Triggered by `<PostWriteRefreshSurface>` after borrow/repay_debt/harvest_rewards (already in those tools' postWriteRefresh map). Borrowed cell uses warning tone when debt > $0.01 dust. ToolResultCard.health_check threads variant through (mirrors W1 balance_check pattern). 25 inline tests cover both variants + status classification + HF formatting. |
| 16 | **StakingCard polish** — volo write receipt grid hero | ½d | ✅ Shipped 2026-05-12 (audric `f433ab1`). Reorganises volo_stake / volo_unstake transaction receipt hero rows (Staked/Received/APY for stake; Unstaked/Received for unstake) as a W1-style compact CSS grid with uppercase mono labels (10px) + mono values (text-[13px]) + tighter padding + vertical dividers. USE_GRID_HERO_TOOLS set + early-return grid render path; existing label/value path unchanged for every other write (verified). Add-back recipe documented inline (1 line per future tool). 14 inline tests. |
| 17 | **B-MPP5** — MppReceiptGrid for parallel pay_api clusters | ½d | ✅ Shipped DORMANT 2026-05-12 (audric `ca7d609` + fix1 `f4ffd81` + JSDoc-honesty `472fa6c`). New `<MppReceiptGrid>` component (CSS auto-fit, minmax(280px, 1fr), responsive 1-N cols based on viewport) routed via `ParallelToolsGroup` when `shouldUseMppGrid()` returns true. ⚠️ **DORMANT TODAY — pay_api is a write tool and write tools serialize under TxMutex (`packages/engine/src/orchestration.ts` Phase 2). The timeline-grouping heuristic can never cluster two pay_api calls into a parallel group today.** Smoke probe 1 surfaced this: "Generate two images" produced two sequential `<BlockRouter>` cards, NOT a parallel cluster. Grid only triggers when SPEC 16 ATOMIC PAYMENT INTENT bundle path lands (one PTB → multiple legs settle in same on-chain tx → emitted as one cluster with the `subtitle` prop set to "ATOMIC PAYMENT INTENT · N SERVICES · $X TOTAL"). Shipped pre-built so SPEC 16 only wires the bundle dispatch path — receipt surface is already test-covered + demo-quality. **fix1 (self-review)**: threaded `onSendMessage` through `ParallelToolsGroup → MppReceiptGrid → ToolBlockView` so when SPEC 16 lands, parallel ReviewCards (DALL-E + DALL-E in one bundle) have functional Regenerate buttons. 27 inline tests (15 visual + 10 detection rule + 2 fix1 regression). |

**Total estimated effort: ~8–9 days** (matches the original 5–8d SPEC 23B estimate within reasonable margin; the +1d is the canvas walkthrough that wasn't in the original scope and the inventory writeup itself).

---

## Notes for SPEC 23C (motion polish — runs after 23B)

Items B-MPP1's `<TrackPlayer>` and N1/N2 confirmation chips will benefit from 23C motion (waveform animation, chip slide-in). Land 23B with motion-ready primitives (clean className hooks, no inline animations) so 23C is a pure CSS pass.

---

## Open questions for founder

1. **Order swap between #5 (W12) and #6 (N3)?** N3 is engine-side, requires an `@t2000/engine` minor bump + audric dep bump cycle (~1d roundtrip). Could be parallelized with audric work but adds rollout overhead. Want me to push N3 to the back of the queue and just tag it as a "later" engine improvement?
2. **B-MPP1 `<BookCover>` primitive — build or skip?** No production traffic for books today. Build it now for completeness with the demo bar, or defer until a books MPP launches?
3. **N3 alternative — instead of prompt directive, add a host-side automapper?** When the LLM calls `spending_analytics` for a spending question, the host could intercept and call `render_canvas('spending_breakdown')` instead. Pro: no engine change. Con: invisible behavior the LLM can't reason about. I'd recommend the engine-side prompt directive for honesty.
