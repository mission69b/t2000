# Audric Build Tracker

> Companion to `audric-roadmap.md` — tracks execution status only. The roadmap has all implementation detail.

**Rules:**
- Work phases in order. Do not start Phase N+1 until Phase N is complete.
- Within a phase, work sections in numbered order (they are dependency-ordered).
- Update status after each commit/deploy.
- Status values: `not started` · `in progress` · `done` · `blocked`

---

## Pre-work (Days 1–4) — ✅ COMPLETE

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| 0.1 | Conversation logging | ~2h | done | — | audric | — |
| 0.2 | Strip multi-asset save/borrow (USDC-only) | ~3h | done | — | both | SDK `assertAllowedAsset`, engine tool descriptions, LLM system prompt, UI flows |
| 0.3 | Add User table to Prisma | ~2h | done | — | audric | — |
| 0.4 | Email capture + verification | ~4h | done | 0.3 | audric | Resend integration live |
| 0.5 | Asset architecture (token-registry.ts) | ~3h | done | — | both | GOLD decimals fixed (9 not 6) |
| 0.6 | Fix savings APY display | ~1h | done | — | audric | — |
| 0.7 | Swap fee (Cetus Overlay Fee) | ~30m | done | — | both | 0.1% overlay fee live in SDK + Audric |
| 0.8 | Allowance top-up flow | ~2h | blocked | allowance.move | audric | Deferred to Phase 1 |
| 0.9 | Settings page architecture (scaffold) | ~3h | done | — | audric | — |
| 0.10 | Error boundaries + route loading states | ~1h | done | — | audric | — |
| — | Swap chip flow (Save replaced Pay) | ~1d | done | — | both | Asset picker → amount → quote → confirm |
| — | Dust filtering v2 | ~2h | done | — | both | `<=` threshold, USD-based filter, `Math.floor` everywhere |
| — | Financial amount safety (flooring) | ~2h | done | — | both | Dynamic precision, floor not round, unified `heldAmount()`/`heldUsd()` |
| — | Test coverage + CI integration | ~1d | done | — | t2000 | Unit, API integration, mainnet smoke tests |
| — | Cursor rules | ~1h | done | — | both | `savings-usdc-only.mdc`, `financial-amounts.mdc`, `usdc-only-saves.mdc` |

**Execution order:**
- **Phase A (t2000 repo first):** 0.5 → 0.2 → 0.7 → tests → docs → npm release — **DONE (v0.26.0)**
- **Patch (t2000):** Dust filtering + stablecoin cleanup — **DONE (v0.26.1)**
- **Phase C (t2000):** USDC-only engine fixes, GOLD decimals, balance tool `saveableUsdc`, system prompt, flooring — **DONE (v0.26.2, SDK 0.22.3, Engine 0.7.6)**
- **Phase B (audric repo after each release):** pnpm update → chip flows → dust filtering v2 → financial amount safety → Cursor rules — **DONE**

**Status:** Pre-work 10/10 complete (0.8 blocked on `allowance.move` — deferred to Phase 1). t2000 v0.26.2 released (SDK 0.22.3, Engine 0.7.6). Audric deployed with USDC-only enforcement, Swap chip, dust filtering, financial amount safety, and Cursor rules.

---

## Phase 1 — Daily habit loop (Weeks 1–2)

**Testing rule:** Tests ship with each task, not as a separate phase. CI pipeline from pre-work runs unit + integration + smoke tests on every PR.

### Week 1 — Infrastructure + free features (no allowance needed)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| — | **Deploy `allowance.move` contract** | 1d | in progress | — | t2000 | ✅ Contract written + 12 tests passing. Needs `sui client upgrade` to mainnet |
| 1.1 | Notification infrastructure | 3d | not started | 0.3, 0.4 | both | ECS cron, EventBridge, Resend, UserNotificationPrefs table |
| 1.2 | Health factor alerts (free) | 2d | not started | 1.1 | both | Indexer HF check, dedup, email template. Ships without allowance |
| 1.6 | Unified activity feed + filter navigation | 3d | not started | — | audric | Includes Swap filter. Independent — no blockers |
| — | CostTracker instrumentation | 0.5d | not started | — | both | Pipe @t2000/engine CostTracker data to NeonDB analytics |

**Week 1 total: ~9.5 days effort.** allowance.move + 1.1 run in parallel (both 1–3d). 1.2 starts after 1.1. 1.6 and CostTracker are independent.

### Week 2 — Paid features + onboarding (needs allowance deployed)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| — | Allowance onboarding wizard (`/setup`) | 1d | not started | allowance.move | audric | 4-step full-screen flow, deposit() call |
| 1.3 | Morning briefing (email + in-app card) | 3d | not started | 1.1, allowance.move | both | $0.005/day charge via allowance deduct() |
| 1.3.1 | Deep link action system | 1d | not started | — | audric | Ships with 1.3. `/action?type=` routing page |
| 1.4 | Savings goals (chat + management UI) | 3d | not started | 0.3 | audric | USDC-denominated goals, milestone emails |
| 1.5 | New user onboarding ($0.25) | 1d | not started | 0.6 | audric | Welcome message + save/swap/explore paths |
| — | AI session charge ($0.01/session) | 0.5d | not started | allowance.move | both | Deducted via same ECS cron as briefing fees |

**Week 2 total: ~9.5 days effort.** Onboarding wizard first (unblocks paid features). 1.3 + 1.3.1 ship together. 1.4 and 1.5 are independent once deps met.

**Critical path:** allowance.move must deploy by end of Week 1. 1.1 unblocks 1.2 (Week 1) and 1.3 (Week 2). Onboarding wizard gates all paid features. 1.4, 1.5 can run in parallel.

---

## Phase 2 — Receive + fiat on-ramp (Weeks 3–5)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| 2.1 | Payment links + QR codes (all 5 page states) | 4d | not started | 1.1 | audric | Receive chip already shows deposit address + QR |
| 2.2 | Invoices | 3d | not started | 2.1 | audric | — |
| 2.3 | Transak fiat on-ramp (optional) | 2d | not started | 2.1 | audric | — |
| 2.4 | Send UX improvements (memo) | 1d | not started | — | both | — |
| 2.5 | Mini-storefront (sync products) | 2d | not started | 2.1 | audric | — |

**Critical path:** 2.1 unblocks 2.2, 2.3, and 2.5. 2.4 is independent.

---

## Phase 3 — Proactive agent + MPP discovery (Weeks 6–8)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| 3.1 | Auto-compound rewards | 3d | not started | 0.7 | both | — |
| 3.2 | USDC rate monitoring alerts | 2d | not started | 1.1 | both | Renamed from "Yield optimization alerts" |
| 3.3 | Scheduled actions (DCA) + trust ladder UI | 5d | not started | 1.1 | both | Includes 0.1% swap fee disclosure |
| 3.4 | MPP consumer discovery | 3d | not started | — | audric | — |
| 3.5 | Gifting reminders | 3d | not started | 1.1 | both | — |
| 3.6 | Credit UX improvements | 1d | not started | — | audric | — |

**Critical path:** 3.3 is the longest task. 3.4 and 3.6 are independent.

---

## Phase 4 — Async job queue (Weeks 9–10)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| 4.1 | Infrastructure (SQS + ECS worker) | 4d | not started | — | t2000 | — |
| 4.2 | Async services (ElevenLabs, Suno, Runway, Heygen) | 2d each | not started | 4.1 | both | — |

**Note:** Phase 4 infra is independent — can be built alongside Phase 3 if capacity allows.

---

## Phase 5 — Creator marketplace (Weeks 11–13)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| 5.1 | User storefront (audric.ai/username) | — | not started | 2.1 | audric | — |
| 5.2 | Song generation + listing flow | — | not started | 4.1 | both | — |
| 5.3 | Merch bundles (Printful) | — | not started | 5.1 | audric | — |
| 5.4 | File storage (Walrus + Seal) | 3d | not started | — | both | — |
| 5.5 | Data model additions | — | not started | 5.1 | audric | — |
| 5.6 | Revenue and spin-out path | — | not started | 5.1 | — | — |
| 5.7 | Storefront content catalogue | — | not started | 5.1 | audric | — |
| 5.8 | In-chat marketplace recommendations | — | not started | 5.1 | both | — |

**Critical path:** 5.1 unblocks nearly everything. 5.4 (Walrus + Seal) is independent.

---

## One-time actions (not phase-gated)

| Task | Status | Notes |
|------|--------|-------|
| Move Audric repo to BSL 1.1 licence | not started | Change Date: April 2030 |
| Add Suno commercial licence ($12/mo) | not started | Required before Phase 5 |
| Allowance Move contract (allowance.move) | done | v3 — `create`, `deposit`, `deduct`, `withdraw`, `balance`. 12 Move tests passing. Needs mainnet upgrade publish |
| Confirm MPP gateway margin (10–20%) | not started | Revenue validation |
| Allowance onboarding wizard (app/setup) | not started | Required before Phase 1 features launch |
| Terms of Service page | not started | Disclose: swap fee 0.1%, allowance model, session charge, yield spread. Required before charging users |

---

## Dependency graph

```
Pre-work: 0.1  0.2  0.3 ──→ 0.4  0.5  0.6  0.7  0.8  0.9  0.10  [swap chip]  [dust v2]  [flooring]
                  │                      │
                  ▼                      ▼
Phase 1 Week 1:   allowance.move ─────────────────────────┐
(no allowance)    1.1 ──→ 1.2 (free HF alerts)            │
                  1.6 (activity feed)                      │
                  CostTracker instrumentation              │
                                                           ▼
Phase 1 Week 2:   onboarding wizard ──→ 1.3 (paid briefing) → 1.3.1
(needs allowance)                       session charge ($0.01)
                  1.4 (savings goals)   1.5 (new user $0.25)
                   │
                   ▼
Phase 2:  2.1 ──→ 2.2, 2.3, 2.5    2.4
           │
           ▼
Phase 3:  3.1  3.2  3.3  3.4  3.5  3.6
                                          Phase 4: 4.1 → 4.2
           │                                │
           ▼                                ▼
Phase 5:  5.1 ──→ 5.2, 5.3, 5.5–5.8      5.4
```

---

*Last updated: April 2026*
*Source of truth for specs: `audric-roadmap.md`*
