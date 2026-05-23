# v0.7c — RETROSPECTIVE (Chatbot Template Fork)

> **Status:** v0.7c shipped 2026-05-18 → 2026-05-20 (~3 days intensive; SPEC estimated 37 working days / 7-10 calendar weeks). Phase 6 cutover live in production. Phase 7 observation Day 0 GREEN.
>
> **Author intent:** Audit what actually shipped vs what the SPEC promised. Capture lessons learned for v0.7e/v0.7f. Identify dead code in `apps/web` that v0.7e structural Phase 2 will absorb. Single-pass retrospective — feeds the next 5 SPEC blocks (v0.7e structural promotion, LOCK-1 ORM, v0.7f forward map, SPEC 30 Phase 2, HANDOFF refresh).
>
> **Cross-references:** `BENEFITS_SPEC_v07c.md` (the SPEC), `audric-build-tracker.md` S.162-S.225 (the shipped-slice ledger), `spec/runbooks/RUNBOOK_v07c_phase_6_cutover.md` v1→v2→v3 (the cutover ops trajectory).

---

## 1. v0.7c at a glance

| Phase | SPEC estimate | Actual | Delta | Outcome |
|---|---|---|---|---|
| **Phase 0** — baseline + setup | 3d | 1d (S.162) | -67% | ✅ CLOSED — G1 closed; LoC inventory captured (chat-shell 6,249 + renderer 17,150 = 23,399 LoC); D-questions locked; behavior catalogue drafted; 5-Anthropic-feature smoke |
| **Phase 1** — side-by-side stand-up + template fork + Auth.js eviction | 2d | 1d (S.164-167) | -50% | ✅ CLOSED — Day 1a (blank scaffold) + 1b (template fork) + 1c (Auth.js eviction + zkLogin stub) + 1d (baseline cleanup) all same-day; G2/G3 closed |
| **Phase 2** — first end-to-end round-trip + AI Gateway + intent-dispatcher + Agent + OTel | 4-5d | 2d (S.168-174) | -60% | ✅ CLOSED — Day 2a + 2b (balance_check round-trip) + 2c (gateway live) + 2d (intent-dispatcher D-14 locked) + 2e (full Agent migration) shipped in 2 days; G4/G6/G6.5 closed |
| **Phase 3** — first write-tool via Slice D | 4d | 0.5d (S.175) | -88% | ✅ STRUCTURALLY SHIPPED — `save_deposit` canary live via `addToolApprovalResponse` + sponsored-tx prepare/execute |
| **Phase 4** — mechanical write tool migration | 5d | 0.5d (S.176) | -90% | ✅ SHIPPED — 10 writes wired (save/withdraw/borrow/repay_debt/send_transfer/swap_execute/claim_rewards/harvest_rewards/volo_stake/volo_unstake/save_contact) via generalised `sponsored-tx.ts` dispatcher; pay_api dropped from web-v2 set per S.177 (Agentic Commerce defer) |
| **Phase 4b** — outcome-update slice (G5 telemetry gap close) | included | 0.25d (S.176) | inline | ✅ SHIPPED AS STRATEGIC DEFERRAL — TurnMetrics `attemptId`-keyed updateMany on resume |
| **Phase 4.5** — structured-output classifier migration (D-16) | 2d | DEFERRED | — | 🚧 NOT SHIPPED — deferred to v0.7d; ~150-300 LoC delete opportunity, no founder blocker for v0.7c close |
| **Phase 5** — renderer migration sweep (5a.0 → 5a.4 + 5b + 5c + 5d + 5e + 5.5) | 9d (re-sized from 5d after Phase 0 finding) | ~2.5d (S.178-184) | -72% | ✅ FULLY SHIPPED — all 21 read-tool cards + 8 canvas templates + PermissionCard single-write + Payment Intents (Approach A) + Language Model Middleware (D-17). 90% effort reduction vs SPEC; 43% file reduction; 66% LoC reduction. |
| **Phase 5.5** — Language Model Middleware adoption (D-17) | 3d | included in Phase 5 | inline | ✅ SHIPPED — guards + log-redact + observability middleware; 494 LoC across 5 files |
| **Phase 6 prep** — runbook v1→v3 + 7-session multi-step plan | included | 1d (S.185-187) | - | ✅ RUNBOOK SHIPPED — 3 audit reframes (v1 freeze→v2 rebuild→v3 Tier A/B/C phased archive locked) |
| **Phase 6 Session 2** — Settings rebuild | included | 0.5d (S.188) | - | ✅ SHIPPED — 22 files / 3,176 LoC |
| **Phase 6 Session 3** — Audric Store rebuild | included | 0.5d (S.189) | - | ✅ SHIPPED — `/[username]` + OG + cross-app portfolio fetch; 9 files / 1,384 LoC |
| **Phase 6 Session 4** — Pay rebuild | included | 0.5d (S.190) | - | ✅ SHIPPED — `/pay/[slug]` receipt + 2 public API routes + payment-kit dep; 2,193 LoC |
| **Phase 6 Session 4.5** — Internal-API sweep | included | 1d (S.191) | - | ✅ SHIPPED — 6 routes (payments + portfolio + 4 analytics) + canonical SSOT `lib/portfolio.ts` LEAN port; 8 new libs + 14 files / 2,309 LoC; AUDIT-FIRST CORRECTION shipped (5/6 routes NOT under `/internal/`) |
| **Phase 6 Session 5** — founder ops (env flip + Vercel rewrites + cutover + soak) | included | founder-owned | - | ✅ CUTOVER LIVE in production |
| **Phase 6 Block A** (v0.7d) — Memory pipeline retirement | included as v0.7d | shipped | - | ✅ SHIPPED — MemWal migration (deferred from v0.7c) |
| **Phase 6 Block B** (v0.7d) — Vercel cron migration | included as v0.7d | shipped | - | ✅ SHIPPED — `vercel.json` structural fix + ECS retirement |
| **Phase 6 Block C** (v0.7d) — Indexer + apps/server deletion + AUDRIC_INTERNAL_KEY consolidation | included as v0.7d | shipped (S.223-S.224) | - | ✅ SHIPPED — C.1 stats refactor + C.2 server deletion + C.3 env consolidation |
| **Phase 7** — post-cutover engine deletion sweep + 7d observation | 7d observation + 2d work | observation Day 0 GREEN (started 2026-05-21) | in-flight | 🟡 IN OBSERVATION — Day 3-7 stability window through ~2026-05-28 |
| **Phase 8** — hardening + 30d realization checks | 30d soak + 2d work | not started | - | 🚧 NOT STARTED (gated on Phase 7 close) |

**Cumulative actual:** ~10-12 working days agent + founder ops, vs SPEC's ~37-41 working days estimate (~71% effort reduction).

---

## 2. What shipped — the headline numbers

### LoC deltas (verified post-Phase-6 close)

| Surface | SPEC estimate (post-Phase-0 re-sizing) | Actual delivered |
|---|---|---|
| `apps/web` chat-shell core (useEngine + 3 routes + dispatcher + harness-metrics + session-store) | 6,249 → ~2,016 (delete -4,233) | Chat shell ROUTING change shipped (Phase 6 cutover); deletion sweep scheduled v0.7e Phase 2 (1,475 LoC v0.7e Phase 1A; rest in 1B) |
| `apps/web` renderer surface | 17,150 → ~3,500-4,500 (delete -12,650 to -13,650) | All 21 read-tool cards re-implemented in `web-v2`; legacy renderers DEAD-rewritten-code in `apps/web` (rewrite layer serves web-v2; deletion staged for v0.7e Phase 2) |
| `apps/web-v2` new code | +6,000-8,000 estimate | ~+15,800 LoC shipped (8 cards + 4 canvas templates + permission card + chat shell + 6 internal API routes + audric-auth + portfolio canonical + sponsored-tx + settings/store/pay surfaces) |
| Engine | 24,604 → ~13,250 (delete -11,354) | Phase 7 deletion sweep deferred to v0.7c Phase 7 (post-observation) |
| **Net trajectory (locked in v0.7c)** | -78k LoC across 3 phases | On track; v0.7c portion delivered the rebuild + cutover + soak start; Phase 7 deletes + v0.7e Tier C deletes will realize the rest |

### Capabilities delivered (the user-visible deltas)

| Feature | State pre-v0.7c | State post-v0.7c | Win |
|---|---|---|---|
| Chat shell | Hand-rolled `useEngine.ts` (2,170 LoC) + 3 routes (2,784 LoC) | Vercel `ai-chatbot` template fork + `useChat` + `Experimental_Agent` | ~70% LoC reduction in chat-shell surface; one mental model |
| Tool dispatch | Bespoke `EarlyToolDispatcher` + `orchestration.ts` agent loop | AI SDK v6 native parallel-tool dispatch + `streamText` step model | Free AI SDK feature surface; no manual SSE coding |
| HITL (write confirmation) | Engine `pending_action` event + audric `PermissionCard` + resume route round-trip | AI SDK v6 `tool-approval-request` semantics + `addToolApprovalResponse` + `addToolOutput` | Native AI SDK pattern; `approvalId` forward-compat alias on engine side |
| AI Gateway | Direct Anthropic only | `gateway('anthropic/claude-sonnet-4-6')` + `providerOptions.gateway.caching: 'auto'` | Multi-provider failover; per-turn caching; OTel telemetry |
| OTel telemetry | Custom audric instrumentation | `experimental_telemetry` with sessionId/userId metadata | Vercel-native observability dashboard |
| Per-user cost attribution | None | `providerOptions.gateway.user = walletAddress` (S.234) | Vercel AI Gateway Custom Reporting dashboard |
| Auth | NextAuth.js | zkLogin direct (Google → Enoki → Sui address) | Deleted ~1,500 LoC of NextAuth machinery |
| Renderer architecture | Stream-coupled (custom SSE events → React components) | Result-coupled (AI SDK `tool-result` → ToolUIPart discriminator → V2 cards) | Cards now pure props consumers; no SSE coupling |
| Settings (Passport/Safety/Contacts) | apps/web monolith | web-v2 standalone rebuild | Cleaner v2 patterns; Memory section deferred to v0.7d MemWal-aware rebuild |
| Audric Store (`/[username]`) | apps/web monolith | web-v2 standalone rebuild | Foundation for v0.7f Agentic Commerce work |
| Payment links | apps/web `/pay/[slug]` | web-v2 `/pay/[slug]` + 2 public API routes + `@mysten/payment-kit` | Public-facing surface lives natively in web-v2 |
| Crons (financial-context, portfolio-snapshot, payment retention) | ECS (3-7d stale at times) | Vercel native via `vercel.json` (Phase 6 Block B fix) | Self-managed by Vercel infra; visibility via `vercel crons list` |

---

## 3. What the SPEC promised vs what we deferred (explicit)

### Strategic deferrals (gated, NOT failures)

| Deferral | SPEC location | Why | Landing target |
|---|---|---|---|
| **Phase 4.5 — Structured-output classifier migration (D-16)** | §"Phase 4.5" | 8+ classifiers using `generateObject`/`streamObject` (~150-300 LoC delete opportunity). Web-v2 doesn't have classifiers wired yet; D-16 doesn't gate any user-visible feature. | v0.7d (after MemWal stability) or v0.7f |
| **Phase 5c PostWriteRefreshSurface** | §"Phase 5c" + index.ts comments | Requires engine work (Day 3b PWR injection in v2 — explicitly deferred per `step-finish.ts:36-44`); current cache-invalidation gets 90% of the way; visual framing only. **Audit 2026-05-21 / S.236** registered as backlog row, agent recommends shelving permanently under sponsored-zkLogin's <2s post-write latency window. | Deferred to v0.7f or permanently shelved (founder decision post-Phase-7) |
| **V1 BalanceCard / HealthCard** | renderers' `index.ts` comment | V2 absorbs the `variant` prop; the post-write branch is deferred to Phase 5c → same shelf candidate | Delete when `apps/web` archives in v0.7e structural Phase 2 |
| **ServiceCatalogCard + MppReceiptGrid + DownloadableArtifact** | renderers' `index.ts` comment | Audric Store / MPP commerce surfaces — depend on engine output discriminator for `pay_api` tool that doesn't exist in v0.7c | v0.7f Agentic Commerce SPEC |
| **`pay_api` tool** | S.177 framing | Dropped from web-v2's tool set via one-line `WRITE_TOOLS.filter`. Engine `WRITE_TOOLS` still exports all 12; legacy `apps/web` still uses it. | v0.7f Agentic Commerce |
| **Motion family** (MountAnimate, NumberTicker, TypingDots, WorkingState, ReceiptChoreography) | founder lock 2026-05-19 | DELETED from scope (NOT deferred). Sponsored zkLogin's instant tap-to-confirm doesn't need motion choreography for the 5-15s wallet-signing window that motion was designed for. | Never (intentional) |
| **Engine Phase 7 deletion sweep** (providers/ai-sdk-anthropic + EarlyToolDispatcher + orchestration + streaming + McpClientManager + bridge/) | §"Phase 7" | Gated on Phase 7 observation close (~2026-05-28) — engine 2,500-3,500 LoC delete that hits the v0.7a E-1 target retroactively | Phase 7 + 7d observation closure |
| **Invoice product deprecation** | mid-audit founder finding | Payment-link + invoice overlap ~95%; only differentiator (`dueDate`) does nothing actionable. Cross-cutting (engine tools + Prisma enum + audric API + chat surfaces + system prompt + DB migration). | Own mini-SPEC post-Phase-7 |

### Implementation-time fixes (audit-driven course corrections)

| Issue | Where it surfaced | Resolution |
|---|---|---|
| **Phase 6 runbook v1 wrong cutover URL** (`audric.ai/` ≠ chat dashboard; chat is `/new`) | Pre-Phase 6 audit (S.185) | Runbook v2 fixed the routing target |
| **Phase 6 runbook v2 "keep everything in apps/web" lazy scope discipline** | Audit-2 (S.186) | Runbook v2 — surfaces that EVOLVE (settings, store, pay) get v2-pattern rebuild; trivial server routes stay put for v0.7e |
| **Phase 6 runbook v2 trajectory was 1-mega-phase** | Audit-3 (S.187) | Runbook v3 — Tier A/B/C tiering; 3 independently-shippable phases (v0.7c + v0.7d + v0.7e) with 7d soaks between |
| **Session 4.5 "6 `/api/internal/*` endpoints" framing was wrong** | Audit-first correction (S.191) | Reality: only 1 of 6 is under `/internal/`; `/api/internal/balance` doesn't exist; balance_check uses `/api/portfolio` as DeFi fallback |
| **D-17 "convert guards to middleware adapters / ~400-600 LoC delete" framing was wrong** | Phase 5.5 audit (S.184) | v0.7a engine fork already removed the legacy decorator boilerplate via `toAISDKTools`. Architecturally honest D-17 close: `activate-what's-wired` + `close logging PII gap` + `add observability middleware`. 0 LoC delete (delete-side absorbed in v0.7a); +494 LoC of new value |
| **Engine v2.0.2 cache invalidation was missing** | Post-Phase-3 staleness reports | Cache invalidation added as "strict subset of full PWR" — explicit deferral of Day 3b injection |
| **Phase 5e bundle composer 3rd call site** | Phase 5e (S.183) | Re-used canonical `composeBundleFromToolResults` engine helper (3rd call site, zero engine release needed) |
| **F-12 (prompt-cache regression) + F-13 (extended-thinking regression)** | Phase 2 Day 2c | Both shipped in engine v2.7.2 + audric commit `5c76d18`; F-13 captured first-ever real extended-thinking output |
| **Vercel `vercel.json` Root Directory rule** | Phase 6 Block B (S.222) | `vercel.json` MUST live at `apps/web/vercel.json`, NOT repo root; ALL 5 cron entries had been silently never-registered for ~7 days |

---

## 4. Dead-rewritten code in apps/web (v0.7e Phase 2 absorption inventory)

This is the inventory that v0.7e Phase 2 will delete. As of post-Phase-6-cutover + S.228/S.229/S.231 deletions, the apps/web rewrite-layer surface looks like:

| `apps/web` path | Status | Disposition for v0.7e Phase 2 |
|---|---|---|
| `app/(chat)/` route group + `app/new/page.tsx` + `app/chat/[id]/page.tsx` | DEAD-rewritten via `next.config.ts` rewrite to `audric-web-v2.vercel.app/*` | **DELETE** — chat shell fully migrated; rewrite layer serves web-v2 |
| `app/api/engine/{chat,resume,regenerate}/route.ts` (~2,784 LoC) | DEAD-rewritten | **DELETE** — web-v2 owns `/api/audric-chat` |
| `app/api/transactions/{prepare,execute}/route.ts` | DEAD-rewritten | **DELETE** — web-v2 owns sponsored-tx routes |
| `app/api/analytics/{spending,yield-summary,portfolio-history,activity-summary}/route.ts` | DELETED 2026-05-21 / S.228+S.229 | ✅ DONE |
| `app/api/internal/payments/route.ts` | DELETED 2026-05-21 / S.229 | ✅ DONE |
| `app/api/portfolio/route.ts` | DELETED 2026-05-21 / S.231 (G3 cutover) | ✅ DONE |
| `hooks/useEngine.ts` (2,170 LoC) | DEAD (no consumer) | **DELETE** — chat shell migrated |
| `lib/engine/*` (intent-dispatcher, harness-metrics, fast-path-bundle, upstash-session-store, etc.) | DEAD or stale | **DELETE most; AUDIT each** for cross-app imports from web-v2 |
| `components/engine/*` (renderers, timeline, motion) | DEAD-rewritten via chat route migration | **DELETE** — web-v2 owns all renderers |
| `components/engine/cards/V1 BalanceCard.tsx + HealthCard.tsx` | DEAD (V2 supersedes; PWR variant deferred) | **DELETE** — per S.236 PWR shelf decision |
| `components/engine/motion/*` (MountAnimate, NumberTicker, TypingDots, WorkingState, ReceiptChoreography) | DEAD (founder-locked DELETE 2026-05-19) | **DELETE** |
| `lib/portfolio.ts` (canonical SSOT) | LIVE — used by remaining apps/web pages + cron consumers | **MIGRATE** to web-v2 as part of v0.7e Tier C; both apps consume during transition |
| `lib/audric-auth.ts` (zkLogin server-side adapter) | LIVE in apps/web; extended-in-place in web-v2 (S.191) | **MIGRATE** to engine-tendril decouple in v0.7e Phase 2 |
| `app/api/internal/financial-context-snapshot/route.ts` | DELETED 2026-05-21 / S.224 (Block C.3) | ✅ DONE |
| `apps/server/` directory | DELETED 2026-05-21 / S.224 (Block C.2) | ✅ DONE |
| `app/marketing/*`, `app/legal/*`, `app/litepaper/*`, `app/admin/*` | LIVE — Tier C copy-port targets | **MIGRATE** to web-v2 v0.7e Phase 2 |
| Vercel crons (`/api/cron/*`) | LIVE — Phase 6 Block B migrated to Vercel native | **MIGRATE** to web-v2 v0.7e Phase 2 (path move + `vercel.json` location move) |

**Approximate v0.7e Phase 2 deletion target:** ~25,000-35,000 LoC across `apps/web` (chat-shell + renderers + motion + 4 legacy routes + library tendrils not yet decoupled) + ~3,000-5,000 LoC migration to web-v2 (Tier C copy-port).

---

## 5. Lessons learned

### Process lessons (carry forward to v0.7e + v0.7f)

1. **Audit-first cadence compounds.** v0.7c shipped at ~30% of SPEC effort because every phase started with an audit pass that surfaced what the SPEC over-scoped. Pattern: read SPEC → grep actual surface → diff estimate vs reality → re-scope. This compressed Phase 5 alone by 90%. v0.7e structural and v0.7e persistent-chats SPECs both followed this pattern tonight — 50-60% estimate corrections in both cases.

2. **Dead-rewritten code discovery.** Next.js `rewrites()` in `next.config.ts` default to `afterFiles`, meaning local routes take precedence over rewrites UNTIL the local route is deleted. This means many "deletions" are actually "cutovers" that activate the rewrite. Discovered late in v0.7c (S.228); now in HANDOFF + critical-rules. v0.7e Phase 2 deletion sequence must respect this: every deletion is a cutover; verify hop count (2-hop = local serving; 4-hop = rewrite serving) before declaring success.

3. **Multi-version runbook for the same milestone.** Phase 6 went through v1 (freeze apps/web), v2 (rebuild settings/store/pay), v3 (Tier A/B/C phased archive). Each revision was 1-2 hours of audit + reframe. The willingness to throw away v1 + v2 because v3 was correct is the discipline that prevented shipping the wrong cutover model.

4. **Engineer-side findings often contradict SPEC framing.** D-17's "~400-600 LoC delete" was wrong because v0.7a engine fork had already cleaned the substrate. D-12 behavior catalogue was sized 100-150 behaviors but the actual 0-drift target ended up being ~75 (the rest were one-off behaviors that didn't need pinning). Trust the code more than the SPEC text when they disagree.

5. **Founder push for "everything migrated" reframed the trajectory.** Audit-3 (S.187) turned a single-phase v0.7c into a 3-phase v0.7c + v0.7d + v0.7e plan, with each phase having its own soak period. Same end state, lower risk per slice. This is now the canonical pattern for cross-cutting migrations.

### Architectural lessons (carry forward as critical rules)

1. **`vercel.json` Root Directory matters.** `vercel.json` MUST live at `apps/web/vercel.json` because Vercel reads it from the configured Root Directory, NOT repo root. This is now documented in HANDOFF. Bit us for ~7 days of silent cron-not-registered before Block B caught it.

2. **AI SDK v6 doesn't natively carry custom event metadata.** Threading our `source: 'pwr' | 'llm' | 'user'` discriminator through AI SDK to the host requires `providerMetadata`, custom UI data parts, or engine post-processing of the event stream. This blocks Phase 5c PWR cluster + future engine-discriminator-dependent features (ServiceCatalogCard, MppReceiptGrid). v0.7f Agentic Commerce should treat this as a shared design problem and solve it once.

3. **Engine cache invalidation is "90% of the way" — visual framing is the remaining 10%.** Confirmed via `packages/engine/src/v2/step-finish.ts:36-44` comment + S.236 audit. This is now the engineering judgment for any post-write UX polish work: data correctness ships first via cache invalidation + LLM re-fire; visual framing is gold-plate work that may not justify the engine investment.

4. **`toolMetadata` wire stays intentionally narrow.** Today it carries `{description, modifiableFields, attemptId}`. Engine extension fields (`guardInjections`, `currentHF`, `borrowApyBps`, etc.) deferred to follow-on slices that pair wire extension with the upstream feature plumbing. Avoid scope creep that adds fields without consuming feature work.

5. **Cross-app imports are the implicit coupling that delays migration.** Phase 6 Session 4.5's 4 deprecated apps/web helpers (`decodeJwt`, `validateJwt`, `isJwtEmailVerified`, `validateAmount`) were skipped because they're consumed only by apps/web — they die when apps/web archives. Don't migrate helpers that have no v2 consumer; let them die with the app.

### Anti-patterns to avoid in v0.7e

1. **Avoid abstractions for single-use code.** v0.7c shipped multiple "cache stores" (defi, wallet, navi, turn-read, prompt) that share SHAPE but not LOGIC — keeping them separate was the right call (Engineering Principles #6). v0.7e should resist the urge to factor common cron/route patterns prematurely.

2. **Don't pre-emptively delete deferred features.** V1 BalanceCard / HealthCard files stayed in `apps/web` despite V2 absorbing the variant prop because Phase 5c was planned. We now know Phase 5c is likely shelved. Delete them only when apps/web archives, not as a separate slice.

3. **Don't migrate cron crons via direct fetch self-call.** v0.7d Block B's vercel.json Root Directory fix would have been less harrowing if the cron WASN'T fanning out via internal HTTP self-fetch. v0.7e Phase 2's cron migration should consolidate to direct function calls (engine-fn-injection-refactor pattern) AT THE SAME TIME as the path move.

---

## 6. Cumulative wins

- **~10-12 working days agent + founder ops** vs **37-41 working days SPEC estimate** (~71% reduction)
- **All 21 read-tool cards + 4 canvas templates ported + wired** in web-v2
- **All 10 sponsored writes + save_contact non-tx write** routed through `useChat` + `addToolApprovalResponse`
- **AI Gateway live** with caching + OTel + (S.234) per-user cost attribution
- **All 4 v0.7d Phase 6 blocks** (Memory A, Cron B, Server C, Stats refactor) shipped within 5 days of Phase 6 cutover
- **Phase 7 observation** Day 0 GREEN; passive watch through ~2026-05-28
- **5 SPECs drafted tonight (2026-05-21)** unblocking next 2-3 sessions: v0.7e structural, persistent chats, v0.7e Phase 0 baseline, v0.7e Phase 1 execution plan, v0.7e Phase 2 surface map

---

## 7. Open items going into v0.7e

1. **Founder lock on D-1 through D-7** (7 questions in `BENEFITS_SPEC_v07e.md`) — required before Phase 1 ships
2. **Founder lock on LOCK-0 through LOCK-5** (6 questions in `BENEFITS_SPEC_v07e_persistent_chats.md`) — required before persistent-chats Phase 1 ships
3. **Phase 7 observation close** (~2026-05-28) — required before engine Phase 7 deletion sweep
4. **Phase 5c PWR decision** (per S.236) — founder lock on shelf vs ship-in-v0.7f
5. **Phase 4.5 structured-output classifiers** — defer to v0.7d/v0.7f decision
6. **Invoice product deprecation** — mini-SPEC needed
7. **Agentic Commerce v0.7f scoping** — pay_api + ServiceCatalogCard + MppReceiptGrid + Audric Store evolution
8. **engine-fn-injection-refactor** — execute AFTER v0.7e Tier C migration (per S.228 rebaselined plan)
9. **engine-internal-key-final-delete** — gated on fn-injection

---

## 8. Bottom line

**v0.7c delivered the full chat-shell migration + cutover + 4 v0.7d Phase 6 blocks at 30% of the SPEC-estimated effort.** The audit-first cadence is the structural reason. Same discipline applied to v0.7e (structural + persistent chats) and v0.7f (Agentic Commerce) will likely produce similar effort compressions.

The remaining `apps/web` surface is mostly Tier C (server-only APIs + marketing + legal + crons) — easy `git mv` + import-update + redeploy work. v0.7e Phase 2 will close the loop and fully archive `apps/web`.

**Phase 7 observation Day 0 GREEN.** No regressions surfaced from Phase 6 cutover. The chat-shell rewrite landed cleanly.
