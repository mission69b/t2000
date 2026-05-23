# v0.7e Phase 2 Surface Map

> **Status:** DRAFTED 2026-05-21 ~21:20 AEST. **STALE-DOC RECONCILIATION applied 2026-05-22 S.252** — see banner below.
> **Purpose:** File-level inventory of what moves from apps/web → web-v2 in v0.7e Phase 2, plus the fn-injection refactor that ships within Phase 2. Subsumes the OLD Phase 2 scope + the corrected Phase 1B chat-shell cutover work + the fn-injection refactor (which the audit `AUDIT_ENGINE_FN_INJECTION_REFACTOR.md` ruled lands inside v0.7e per Correction #2).
> **Built on:** AUDIT_ENGINE_FN_INJECTION_REFACTOR.md + V07E_PHASE_1_EXECUTION_PLAN.md + tonight's G3 cutover-semantics correction (S.231).
>
> ## ⚠️ Stale-doc reconciliation (S.252 — 2026-05-22 ~15:00 AEST)
>
> This document was drafted 2026-05-21 ~21:20 AEST, BEFORE the S.245 D-2 reframe (2026-05-22 ~08:30 AEST) which deleted pay_api entirely and eliminated the apps/web MPP shim. The MPP-related rows below (specifically §3.1 "MPP-shim STAYS", §3.2 service-catalog/gateway/pricing rows, and §6 components/engine/mpp rows) describe code that ALREADY EXISTED but the disposition ("STAYS IN apps/web") is now wrong per S.245. The correct disposition for all MPP-shim code is **DELETE** alongside the apps/web death in Phase 6 (per D-2 = B+ entirely-delete lock).
>
> Specifically affected rows (do NOT trust the "Disposition" column on these — defer to S.245 + V07E_D_QUESTION_AUDITS.md D-2 entry):
> - Line ~56: "MIGRATE all EXCEPT `mpp-services-tool`" → all engine tools were DELETED in S.245
> - Line ~117: "service-catalog.ts, service-gateway.ts, service-pricing.ts → STAYS IN apps/web" → DELETED in S.245 + Phase 6
> - Line ~144: "MPP-shim STAYS ~2,000 LoC" → DELETED en bloc
> - Line ~157: "MPP renderers STAY in apps/web with pay_api" → DELETED en bloc
> - Line ~294: "Phase 5 gated on v0.7f pay_api shipping" → REVERSED; Phase 5 ships in v0.7e per S.245
>
> Additionally, per S.252 Q2/Q3 locks: sub-slice 2.2 becomes a pure deletion task (no `/api/engine/*` route creation) and sub-slice 2.3 covers only `/api/swap/quote` + `/api/quote` (NOT `/api/history`).
>
> Future agents: read the banner before trusting any disposition column. A full §3 rewrite is deferred to "if/when Phase 2 execution surfaces enough drift to warrant a v2 of this doc" — for now the audit + V07E_D_QUESTION_AUDITS.md D-2/D-9/D-10 entries are the SSOT.

---

## 1 — What Phase 2 owns

Per v0.7e SPEC §4 + corrections from tonight:

1. **Engine + chat-coupled backend migration** (original Phase 2):
   - Move `lib/engine/*` from apps/web → web-v2
   - Move `lib/chain-memory/*`, `lib/voice/*`, `lib/payment-kit.ts`, `lib/billing.ts`, `lib/portfolio.ts`, `lib/transaction-history.ts`, `lib/rates.ts`, `lib/jobs/*`, `lib/identity/*`, `lib/redis/*`, `lib/sui-rpc.ts`, etc.
   - Move `components/engine/*` from apps/web → web-v2
   - Move related hooks: `useAgent.ts`, `executeToolAction.ts`, `useExpirySoonToast.ts`, `useVersionCheck.ts`, etc.

2. **Chat-shell cutover** (from Phase 1B per audit correction):
   - Add path-remap rewrites for `/api/engine/chat` → web-v2's `/api/chat`
   - Add simple rewrites for `/api/transactions/{prepare,execute}` (web-v2 has equivalents at same paths)
   - Create web-v2 equivalents for `/api/engine/{regenerate,regen-append,resume,resume-with-input,sessions,sessions/[id]}` (or accept feature loss)
   - Create web-v2 equivalents for `/api/swap/quote`, `/api/quote`, `/api/history`
   - Add page rewrites for `/new`, `/chat/[sessionId]`
   - Delete apps/web's chat-shell routes (cutover pattern: 2-hop → 4-hop)

3. **fn-injection refactor** (Phases 1-6 from AUDIT_ENGINE_FN_INJECTION_REFACTOR.md):
   - Now runs WITHIN web-v2 (engine-factory + lib/* are in same app)
   - 12 `AudricApi` methods, 13 fetch sites → 13 typed function calls
   - Delete `audric-api.ts` HTTP plumbing (~150 LoC saved)
   - Delete `AUDRIC_INTERNAL_KEY` infrastructure (closes engine-internal-key-final-delete backlog)

---

## 2 — `lib/engine/*` inventory (56 files, 10,277 LoC source + 10,701 LoC tests)

Reproducible: `find apps/web/lib/engine -name "*.ts" -not -name "*.test.ts" -exec cat {} + | wc -l` from apps/web root.

### 2.1 Top-3 biggest files (most architecturally significant)

| File | LoC | What it does | Phase 2 disposition |
|---|---|---|---|
| `engine-factory.ts` | 1,257 | Constructs the AISDKEngine instance + injects all tools, MCP clients, prepare-step hooks, memory stores | MIGRATE (heart of engine wiring) |
| `engine-context.ts` | 906 | Per-turn ToolContext assembly (auth, env, signal, walletAddress, audricApi, etc.) | MIGRATE |
| `intent-dispatcher.ts` | 458 | Server-side intent classification + early-tool dispatch (the S.173 lock) | MIGRATE |
| `init-engine-stores.ts` | 137 | Injects Upstash session/cache stores into engine | MIGRATE |
| `dispatch-intents.ts` | 53 | Thin client adapter for intent dispatch results | MIGRATE |

### 2.2 Category breakdown (~56 files)

| Category | Files | Phase 2 disposition |
|---|---|---|
| Core engine wiring (engine-factory, engine-context, init-engine-stores, dispatch-intents) | 5 | MIGRATE all |
| Intent classification (intent-dispatcher, confirm-detection, apply-modifications) | 4 | MIGRATE all |
| Bundle / multi-step (fast-path-bundle, prepare-bundle-tool, bundle-metrics, bundle-proposal-store) | 4 | MIGRATE all |
| Tool definitions (advice-tool, contact-tools, compose-pdf-tool, compose-image-grid-tool, mpp-services-tool, lookup-user-tool) | 6 | MIGRATE all EXCEPT `mpp-services-tool` (D-2 defers pay_api to v0.7f; mpp-services-tool stays in apps/web shim) |
| Metrics + telemetry (txn-metrics, harness-metrics, plan-context-metrics, post-write-refresh-metrics, quote-refresh-metrics, log-session-usage, session-spend, vercel-sink, cost-rates) | 9 | MIGRATE all |
| Upstash storage adapters (upstash-conversation-state-store, upstash-defi-cache, upstash-fetch-lock, upstash-navi-cache, upstash-session-store, upstash-stream-checkpoint-store, upstash-wallet-cache) | 7 | MIGRATE all |
| SSE + streaming (sse-types, stream-errors, live-stream-clobber-detection, strip-llm-directives, regen-error-copy) | 5 | MIGRATE all |
| Permissions + safety (account-age-gate, permission-tiers-client, expects-confirm-decorator) | 3 | MIGRATE all |
| Memory + post-write (memory-path-flag, post-write-anchor, advice-tool) | 3 | MIGRATE all |
| Spec consistency (spec-consistency) | 1 | MIGRATE all |
| Synthetic sessions (synthetic-sessions) | 1 | MIGRATE (load-testing infrastructure) |
| Tests (37 `.test.ts` files in `__tests__/`) | 37 | MIGRATE all (web-v2 needs vitest infrastructure — see Risk R-2 below) |

### 2.3 Migration mechanics

Per L-1 (migration is `git mv` + import updates, NOT rebuild):

```bash
# From audric repo root
git mv apps/web/lib/engine apps/web-v2/lib/engine
# Update imports across all files in web-v2 that reference @/lib/engine/*
# (no path changes needed — both apps use @/ alias rooted at app root)

# Then update apps/web/app/api/engine/* routes to point at web-v2 OR delete them (per Phase 1B plan)
```

**Estimated effort:** ~6-8h for the move + import updates + test verification.

---

## 3 — `lib/*` (non-engine) chat-coupled inventory

Per the v0.7e SPEC, these libs are chat-coupled (only the chat-shell uses them) and must migrate with the chat-shell in Phase 2.

### 3.1 Chat-coupled libs (full MIGRATE list)

| Lib | What it does | Phase 2 disposition |
|---|---|---|
| `portfolio.ts` | Canonical portfolio fetcher (the SSOT pattern). Used by `/api/portfolio`, useBalance hook, engine | MIGRATE (web-v2 already imports a copy — verify equivalence) |
| `transaction-history.ts` | Canonical history fetcher | MIGRATE (same situation) |
| `rates.ts` | NAVI lending rates | MIGRATE |
| `portfolio-data.ts` | Helpers for portfolio formatting | MIGRATE |
| `payment-kit.ts` | Payment link helpers | MIGRATE |
| `billing.ts` | T2000 fee + overlay fee constants | MIGRATE (also used by transactions/prepare) |
| `auth-fetch.ts` | Client-side authenticated fetch wrapper | MIGRATE |
| `auth.ts` | Server-side zkLogin auth + assertOwnsOrWatched | MIGRATE |
| `internal-auth.ts` | Internal-key dual-auth (engine self-fetches) | MIGRATE (delete during fn-injection refactor) |
| `balance-changes.ts` | Parse Sui tx balance changes | MIGRATE |
| `enoki-error.ts` | Enoki error mapping | MIGRATE |
| `errors.ts` | Custom error classes | MIGRATE |
| `feed-types.ts` | Chat feed type definitions | MIGRATE |
| `format-quote-age.ts` | Quote freshness display | MIGRATE |
| `format.ts` | Number formatting | MIGRATE |
| `harness-transitions.ts` | Harness state transitions | MIGRATE |
| `interactive-harness.ts` | Interactive harness state machine | MIGRATE |
| `intent-parser.ts` | Intent string parsing | MIGRATE |
| `jwt-client.ts` | JWT client helpers | MIGRATE |
| `log-redact.ts`, `log-sanitize.ts` | Logging redaction | MIGRATE (web-v2 has copies — verify equivalence) |
| `prisma.ts` | Prisma client instance | MIGRATE (web-v2 has its own — verify schema parity) |
| `proactive-marker.ts` | Proactive nudge markers | MIGRATE |
| `protocol-registry.ts` | NAVI / Cetus protocol metadata | MIGRATE |
| `rate-limit.ts` | In-process rate limiter | MIGRATE |
| `redis.ts` + `redis/` dir | Upstash Redis adapters | MIGRATE |
| `sanitize-text.ts` | Text sanitization | MIGRATE |
| `service-catalog.ts`, `service-gateway.ts`, `service-pricing.ts` | MPP service catalog + gateway | STAYS IN apps/web (D-2 defers pay_api to v0.7f) |
| `slug.ts` | Slug generation for payment links | MIGRATE |
| `sponsor-allowed-addresses.ts` | Sponsored-tx allowed-address gate | MIGRATE |
| `sse-heartbeat.ts` | SSE keep-alive | MIGRATE |
| `suggested-actions.ts` | Suggested-action chips | MIGRATE |
| `sui-address.ts`, `sui-pay-uri.ts`, `sui-retry.ts`, `sui-rpc.ts` | Sui utility helpers | MIGRATE (web-v2 has some copies — verify) |
| `suins-cache.ts`, `suins-resolver.ts` | SuiNS resolution | MIGRATE |
| `thinking-similarity.ts` | Anti-repetition for "thinking" blocks | MIGRATE |
| `timeline-builder.ts`, `timeline-groups.ts`, `transition-state-utils.ts` | Timeline computation | MIGRATE |
| `token-registry.ts` | (re-exports `@t2000/sdk`'s registry) | MIGRATE |
| `upstash-tx-history-cache.ts` | Tx history Upstash cache | MIGRATE |
| `version-drift-check.ts` | Version-check helpers | DELETE in Phase 1A.3 (D-6 lock) |
| `zklogin.ts`, `zklogin-jwt-expiry.test.ts` | zkLogin client adapter | MIGRATE (web-v2 has its own; verify equivalence) |
| `voice/*` dir (timeline-voice-slices, word-alignment) | Voice mode helpers | DELETE in Phase 1A.2 (D-3 Option A) |
| `identity/*` dir (admission-control, audric-handle-helpers, check-fetcher, contact-prompt-skip, contact-schema, contact-suins-backfill, reserved-usernames, suggest-usernames, username-skip, validate-label) | Identity / username flow | MIGRATE all (used by both chat-shell AND signup) |
| `chain-memory/` dir | (empty per audit; chain-memory was retired in v0.7d Block A) | DELETE (empty leftover) |
| `jobs/financial-context-snapshot.ts` + `portfolio-snapshot.ts` | Cron job implementations | MIGRATE (Phase 4 cron cutover) |
| `marketing/` dir | Marketing-page helpers | STAYS IN apps/web (per L-4 + D-5) |
| `activity-*.ts` (counterparty, data, formatting, types) | Activity timeline | MIGRATE |
| `chip-configs.ts`, `confirm-chips.ts` | UI chip configuration | MIGRATE |
| `cn.ts`, `constants.ts`, `env.ts`, `generated/`, `icons/`, `mocks/`, `scroll/`, `theme/` | Misc support | EVALUATE per file (mostly MIGRATE; some have web-v2 copies) |

### 3.2 Approximate total lib/* (non-engine) Phase 2 migration

| Category | Approx LoC | Approx files |
|---|---|---|
| Chat-coupled MIGRATE | ~30,000 | ~100 |
| MPP-shim STAYS | ~2,000 (service-catalog, service-gateway, service-pricing + supporting) | ~10 |
| Marketing STAYS | ~500 | ~5 |
| DELETE in Phase 1A (voice, version-check, chain-memory empty dir) | ~1,500 | ~10 |
| **TOTAL Phase 2 lib/* migration** | **~30,000 LoC** | **~100 files** |

---

## 4 — `components/*` chat-coupled inventory

`components/` has ~250 files / 45,811 LoC. Categorized at high level:

| Category | What | Phase 2 disposition |
|---|---|---|
| `engine/*` (cards, canvas, mpp, panels, shell) | Chat-shell UI: tool result cards, full-screen canvases, MPP renderers, shell layout | Mostly MIGRATE; MPP renderers (TrackPlayer, mpp/registry) STAY in apps/web with pay_api |
| `panels/PayPanel.tsx` | Payment list panel for chat-shell | DELETE in Phase 1A.5 |
| `ui/*` | Shared UI primitives (Button, Card, Tag, etc.) | MIGRATE (web-v2 has its own; verify equivalence and consolidate) |
| `shell/ChunkErrorReloader.tsx` | Version-check chunk error handler | DELETE in Phase 1A.3 |
| `settings/MemorySection.tsx` | Memory display section | DELETE in Phase 1A.4 |
| `marketing/*` | Marketing pages UI | STAYS IN apps/web (per L-4 + D-5) |
| Legal / disclaimer pages UI | Static page UI | STAYS IN apps/web (per L-4 + D-5) |

**Estimated MIGRATE LoC:** ~35,000 (the bulk is `components/engine/*` cards/canvases). Web-v2 has its own modern card system (per Phase 5a in audric-build-tracker.md) — the migration is partial; some apps/web cards have already been re-implemented in web-v2 as V2 variants (BalanceCardV2, HealthCardV2, etc.). For each apps/web card, the question is: is the V2 already present? If yes, DELETE the apps/web one. If no, MIGRATE.

**This is the longest-tail work in Phase 2.** Could extend to ~1-2 weeks if every chat-shell card needs review.

---

## 5 — fn-injection refactor (lands inside Phase 2)

Per AUDIT_ENGINE_FN_INJECTION_REFACTOR.md + tonight's corrections.

### 5.1 Final `AudricApi` interface (12 methods)

```typescript
export interface AudricApi {
  // Already-factored routes
  getPortfolio(address: string): Promise<AudricPortfolioResult>;
  getPortfolioHistory(address: string, opts: { days: number }): Promise<{ change?: WeekChange } | null>;
  getHistory(address: string, opts?: { limit?: number }): Promise<AudricHistoryRecord[]>;
  getActivitySummary(targetAddress: string, opts: { period: 'week' | 'month' | 'year' | 'all'; callerAddress: string }): Promise<ActivitySummary>;

  // New extractions (Phase 2.1 of fn-injection — within web-v2)
  getSpending(address: string, period: 'week' | 'month' | 'year' | 'all'): Promise<SpendingResponse>;
  getYieldSummary(address: string): Promise<YieldSummary>;

  // Payments extractions (Phase 2.2 of fn-injection — within web-v2)
  createPaymentLink(walletAddress: string, input: PaymentLinkInput): Promise<PaymentLink>;
  listPaymentLinks(walletAddress: string): Promise<{ links: PaymentLink[] }>;
  cancelPaymentLink(walletAddress: string, slug: string): Promise<{ cancelled: boolean }>;
  createInvoice(walletAddress: string, input: InvoiceInput): Promise<Invoice>;
  listInvoices(walletAddress: string): Promise<{ invoices: Invoice[] }>;
  cancelInvoice(walletAddress: string, slug: string): Promise<{ cancelled: boolean }>;
}
```

### 5.2 Phase 2 sub-slices for fn-injection (within v0.7e Phase 2)

| Slice | Effort | What |
|---|---|---|
| 2.A — Extract `lib/analytics/{spending,yield-summary}.ts` from web-v2 routes | ~3-4h | Two extractions; activity-summary already factored |
| 2.B — Extract `lib/payments.ts` from web-v2 `/api/internal/payments/route.ts` (6 functions) | ~3-4h | Single file, 6 exports |
| 2.C — Add `AudricApi` interface + `audricApi` slot to `ToolContext` in `@t2000/engine` | ~1-2h | Engine type changes, no breaking changes |
| 2.D — Migrate 13 engine fetch sites to `context.audricApi?.xxx()` | ~4-5h | Mechanical refactor |
| 2.E — Wire `AudricApi` in web-v2's `engine-factory.ts` | ~1-2h | Now lives in web-v2 (per L-2) |
| 2.F — Engine release + audric bump + production smoke | ~2-3h | `@t2000/engine` minor + audric web-v2 bump |
| **fn-injection subtotal within Phase 2** | **~14-20h** | — |

### 5.3 What fn-injection UNBLOCKS

1. **`engine-internal-key-final-delete`** — delete `AUDRIC_INTERNAL_KEY`, `validateInternalKey`, `x-internal-key` dual-auth branch. ~30min after fn-injection lands.
2. **`audric-api.ts` deletion** — ~150 LoC of HTTP plumbing + `_engineNoCache` workaround + 5-layer env lookup gone. Just delete the file.
3. **`/api/internal/payments` route deletion (web-v2)** — if no remaining server-side callers (CLI / cron). Verify before delete.

---

## 6 — Phase 2 total effort

| Sub-phase | Effort |
|---|---|
| `lib/engine/*` migration | ~6-8h |
| `lib/*` (non-engine) chat-coupled migration | ~6-8h |
| `components/*` migration (cards + canvases) | ~8-16h (longest tail) |
| Chat-shell rewrite-with-remap + page rewrites | ~3-4h |
| `/api/engine/*` web-v2 route creation (or feature-loss matrix) | ~4-6h |
| `/api/swap/quote`, `/api/quote`, `/api/history` web-v2 routes | ~2-3h |
| fn-injection refactor (Phases 2.A-2.F) | ~14-20h |
| Chat-shell deletion + cutover smoke per route | ~2-3h |
| **PHASE 2 TOTAL** | **~45-68h (~6-9 days)** |

This is bigger than v0.7e SPEC §4 Phase 2 estimate (3-4 days). Recommend the founder consider SPLITTING Phase 2 into 2.A (engine + lib migration; ~3-4 days) + 2.B (fn-injection + chat-shell cutover; ~3-5 days) for cleaner observation windows.

---

## 7 — Risk surface (Phase 2 specific)

### R-1 — Web-v2 lacks vitest infrastructure

Web-v2 only has Playwright e2e + 1 mock-models file. Migrating `lib/engine/__tests__/*` (37 test files, ~10,701 LoC) requires:
1. Install `vitest`, `@vitest/ui`, `@vitest/coverage-v8` as devDeps in web-v2
2. Write `vitest.config.ts` matching web-v2's TypeScript paths
3. Add `pnpm test` script + CI integration
4. Verify all 37 tests pass with web-v2's import paths

**Estimated:** ~2-4h vitest installation + ~4-8h test migration validation. This is REAL work that the SPEC §4 Phase 2 didn't budget.

### R-2 — Cross-package type breaking changes during fn-injection

`AudricApi` interface is a new typescript contract between `@t2000/engine` and web-v2. Changes after publishing the engine version create breakage windows. **Mitigation:** ship `AudricApi` interface in a minor engine release BEFORE Phase 2 ships the actual migration; gives 1 release cycle of buffer.

### R-3 — Apps/web's chat-shell breaking during cutover

The cutover is multi-step (add rewrite → verify → delete route). A bad rewrite OR misconfigured web-v2 route produces 404s for live users. **Mitigation:** ship per-route (not per-batch); smoke each rewrite addition before next slice; rollback per-route via single commit revert.

### R-4 — Engine import cycle risk

`engine-factory.ts` imports from `@/lib/portfolio`, `@/lib/transaction-history`, etc. Those libs MUST NOT import from `@t2000/engine` (cycle). **Verified for `portfolio.ts` + `transaction-history.ts` today** — both clean. **TODO before Phase 2 ship:** verify all migrated libs are cycle-free; add ESLint rule to enforce.

### R-5 — Chat-shell test migration

`apps/web/__tests__/spec30-idor-regression.test.ts` (and any remaining unit tests) imports the chat-shell routes directly. Need to either:
- Migrate test imports to web-v2's chat routes (after web-v2 has them)
- Delete tests (regression class still covered by Phase 1 auth gate + PR review)

Same trade-off as G3's spec30-cache-header-regression.test.ts handling tonight.

### R-6 — Effort estimate variance

This map estimates 45-68h for Phase 2 (~6-9 agent days). SPEC §4 estimated 3-4 days. The variance is real and tied to: vitest infrastructure (R-1), the cards migration tail (3,000-5,000 LoC of card components), and the fn-injection refactor (14-20h) being lumped in. **Recommendation:** SPEC §4 Phase 2 budget should update to 6-9 days, OR Phase 2 splits to 2.A + 2.B as above.

---

## 8 — Verification gates for Phase 2 closure

Per the SPEC §4 acceptance pattern:

- [ ] All 56 `lib/engine/*` files migrated to web-v2; tests passing in vitest
- [ ] All ~100 chat-coupled `lib/*` files migrated; web-v2 typecheck clean
- [ ] All chat-coupled `components/*` migrated; web-v2 has functional UI parity for every apps/web card
- [ ] Apps/web chat-shell routes (12 routes per V07E_PHASE_1_EXECUTION_PLAN.md §"Phase 1B") all deleted with 4-hop cutover smoke green
- [ ] `/new` + `/chat/[sessionId]` page rewrites firing; web-v2 serves chat
- [ ] fn-injection: 13 fetch sites migrated to `context.audricApi?.xxx()`; `audric-api.ts` HTTP plumbing deleted (~150 LoC); `AUDRIC_INTERNAL_KEY` retired
- [ ] Engine release shipped; audric web-v2 bumped
- [ ] Production smoke: zero apps/web origin requests for migrated paths in 24h post-ship Vercel logs

## 9 — Forward windows

After Phase 2 closes, v0.7e Phase 3 (Tier C copy-port for analytics/identity/user routes) can ship. Phase 3 is mechanical (~3,500 LoC, ~23 routes) and faster than Phase 2.

Phase 4 (cron cutover) requires Phase 2 to have moved `lib/jobs/*` to web-v2 first.

Phase 5 (final archive ritual) is GATED on v0.7f Agentic Commerce SPEC shipping pay_api in web-v2 (per D-2 finding). v0.7e final state: apps/web shrinks to ~5k LoC MPP shim + marketing keepers.

## 10 — Cross-references

- AUDIT_ENGINE_FN_INJECTION_REFACTOR.md (full fn-injection design)
- V07E_PHASE_1_EXECUTION_PLAN.md (Phase 1A safe-today slices)
- V07E_PHASE_0_BASELINE.md (LoC baseline)
- V07E_D_QUESTION_AUDITS.md (D-2 deferral; D-3 / D-6 deletions)
- BENEFITS_SPEC_v07e.md §4 Phase 2 (original SPEC scope — to be revised upward per R-6)
