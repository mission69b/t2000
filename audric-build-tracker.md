# Audric Build Tracker

> Companion to `audric-roadmap.md` — tracks execution status only. The roadmap has all implementation detail.

**Rules:**
- Work phases in order. Do not start Phase N+1 until Phase N is complete.
- Within a phase, work sections in numbered order (they are dependency-ordered).
- Update status after each commit/deploy.
- Status values: `not started` · `in progress` · `done` · `blocked`

---

## Pre-work (Days 1–4)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| 0.1 | Conversation logging | ~2h | done | — | audric | — |
| 0.2 | Strip multi-asset save/borrow | ~3h | done | — | both | — |
| 0.3 | Add User table to Prisma | ~2h | done | — | audric | — |
| 0.4 | Email capture + verification | ~4h | done | 0.3 | audric | — |
| 0.5 | Asset architecture (token-registry.ts) | ~3h | done | — | both | — |
| 0.6 | Fix savings APY display | ~1h | done | — | audric | — |
| 0.7 | Swap fee (Cetus Overlay Fee) | ~30m | done | — | t2000 | — |
| 0.8 | Allowance top-up flow | ~2h | blocked | allowance.move | audric | — |
| 0.9 | Settings page architecture (scaffold) | ~3h | done | — | audric | — |
| 0.10 | Error boundaries + route loading states | ~1h | done | — | audric | — |

**Execution order:**
- **Phase A (t2000 repo first):** 0.5 → 0.2 → 0.7 → tests → docs → npm release — **DONE (v0.26.0)**
- **Phase B (audric repo after release):** pnpm update → 0.5a, 0.2a → 0.10 → 0.6 → 0.1 → 0.3 → 0.9 → 0.4 — **DONE**

**Status:** Pre-work 9/10 complete. 0.8 (allowance top-up) blocked on `allowance.move` contract — deferred to Phase 1. npm v0.26.0 released. Audric updated and deployed.

---

## Phase 1 — Daily habit loop (Weeks 1–2)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| 1.1 | Notification infrastructure | 3d | not started | 0.3, 0.4 | both | — |
| 1.2 | Health factor alerts | 2d | not started | 1.1 | both | — |
| 1.3 | Morning briefing (email + in-app card) | 3d | not started | 1.1 | both | — |
| 1.3.1 | Deep link action system | 1d | not started | — | audric | — |
| 1.4 | Savings goals (chat + management UI) | 3d | not started | 0.3 | audric | — |
| 1.5 | New user onboarding ($0.25) | 1d | not started | 0.6 | audric | — |
| 1.6 | Unified activity feed + filter navigation | 3d | not started | — | audric | — |

**Critical path:** 1.1 unblocks 1.2 and 1.3. 1.3.1 (deep links) should ship with 1.3. 1.4, 1.5, 1.6 can run in parallel once their deps are met.

---

## Phase 2 — Receive + fiat on-ramp (Weeks 3–5)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| 2.1 | Payment links + QR codes (all 5 page states) | 4d | not started | 1.1 | audric | — |
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
| 3.2 | Yield optimization alerts | 3d | not started | 1.1 | both | — |
| 3.3 | Scheduled actions (DCA) + trust ladder UI | 5d | not started | 1.1 | both | — |
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
| Allowance Move contract (allowance.move) | not started | Required before Phase 1 allowance features |
| Confirm MPP gateway margin (10–20%) | not started | Revenue validation |
| Allowance onboarding wizard (app/setup) | not started | Required before Phase 1 features launch |

---

## Dependency graph

```
Pre-work: 0.1  0.2  0.3 ──→ 0.4  0.5  0.6  0.7  0.8  0.9  0.10
                  │                      │
                  ▼                      ▼
Phase 1:  1.1 ──→ 1.2, 1.3 → 1.3.1    1.4  1.5  1.6
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
