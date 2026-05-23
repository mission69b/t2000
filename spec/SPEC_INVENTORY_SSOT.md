# SPEC Inventory — Single Source of Truth

> **Last refreshed:** 2026-05-23 ~20:35 AEST after S.280 (PIPELINE-AUDIT-PHASE-2 S1 — blockvision-prices.ts split). `spec/active/AUDIT_ON_CHAIN_PIPELINE_2026-05-23.md` mutated in place with a ship-log appendix marking S1 ✅ shipped (S2/S3/S5 still pending). The audit doc is gitignored (founder-local), so file counts unchanged. Patch release v2.19.2. Last `spec/` tracked-file mutation was S.278 (SPEC 272 Lever 1 moved to `active/shipping/`).
> **Purpose:** answer "what's actually in `spec/` right now, what's drifted, what's archive-ready" in one read. Run a fresh sweep against this table at the start of any session that touches `spec/`.
> **Companion:** `spec/README.md` (the layout + promotion rules contract).

---

## 0. TL;DR — current state (post-S.279 ship — no `spec/` mutation; counts unchanged from S.278)

The 2026-05-23 cleanup pass archived **19 files** + deleted 1 stub. S.278 added one shipping/ entry. S.279 (2026-05-23 ~19:25 AEST — CLI-CONTACTS-CLEANUP) made no `spec/` changes — it's an HANDOFF backlog item that shipped without a SPEC artifact (same pattern as S.277). `spec/active/` still holds **5 working files** + 2 subdirs (harness + shipping with 2 entries).

| Bucket | Count | State |
|---|---|---|
| ✅ Genuinely active (in flight or pending decision) | **5** | In `spec/active/` |
| 🚀 Shipping (first phase shipped, follow-ups open) | **2** | In `spec/active/shipping/` (SPEC 30, SPEC 272) |
| 🟡 Long-lived harness specs (gitignored) | **3** | In `spec/active/harness/` |
| 📦 Archived 2026-05-23 cleanup | **19** | Now in `spec/archive/<version>/` |
| 🗑️ Deleted (dead stub) | **1** | SPEC 38b (S.253 absorbed its scope) |

**See §1.1 below for the canonical list of what's still active.** Anything else either shipped (look in `archive/`) or never existed.

---

## 1. The full inventory

### 1.1 `spec/active/` (current state — 5 files)

| # | File | Status | Why it's still active |
|---|---|---|---|
| 1 | `AUDIT_ENGINE_FN_INJECTION_REFACTOR.md` | 🟢 ACTIVE | M2 backlog row in `audric/HANDOFF_NEXT_AGENT.md` (rank 17). Re-baseline scope first — most legacy `apps/web` rewrites died with S.253. Audit-only; no code changes yet. |
| 2 | `AUDIT_ON_CHAIN_PIPELINE_2026-05-23.md` | 🟢 ACTIVE | PIPELINE-AUDIT-PHASE-2 backlog row (rank 7.5). Phase 1 audit (read-only) shipped 2026-05-23. Phase 2 (decision) + Phase 3 (migration) pending founder triage on the recommendation. |
| 3 | `SPEC_31_SCOPING.md` | 🟢 ACTIVE | Founder triage pending to lock SPEC scope (CSP polish). Agent-only ready-to-ship once locked. M1 backlog row (rank 14). |
| 4 | `V07E_STALE_FINCONTEXT_WRITE_REFUSAL.md` | 🟢 ACTIVE | Phase 1 SHIPPED via S.242 (Path 6 locked). **Phase 2 still pending:** Q2 (Prisma migration timing for column drop) + Q3 (audit coverage) unlocked. **D8** in handoff backlog (rank 19.9). ~20 min impl. |
| 5 | `V07F_FORWARD_MAP.md` | 🟢 ACTIVE | REFRAMED 2026-05-22 (S.245). New scope = Audric Store SPEC clean-slate Commerce design. Stays as forward-looking placeholder until Audric Store SPEC kickoff (D3/D4 rank 21-22). |

### 1.1.b `spec/active/` — what was archived in the 2026-05-23 cleanup pass

| Old location | New location | Why it shipped |
|---|---|---|
| `active/AUDIT_V07C_SESSION_5_5_UI_HARDENING.md` | `archive/v07c/` | Recommendations superseded by the architecturally-honest D-17 close in S.184 |
| `active/BENEFITS_SPEC_v07c.md` | `archive/v07c/` | All Phase 0-6 + Session 4.5 SHIPPED. Production-stable since 2026-05-20 |
| `active/SPEC_V07C_PHASE_6_5_CHAT_PARITY.md` | `archive/v07c/` | "Largely SHIPPED" per S.253 re-audit. Chat-flip live, apps/web archived |
| `active/V07C_RETROSPECTIVE.md` | `archive/v07c/` | v0.7c shipped 2026-05-18 → 2026-05-20. Retrospective complete |
| `active/BENEFITS_SPEC_v07d.md` | `archive/v07d/` (NEW) | Phases 1-3 + 6 + 8 SHIPPED via Block A (S.221) + S.253 + S.224. Phase 4 SKIPPED (S.219). Phase 5 SKIPPED (S.220). Phase 7 banner = **D7** open (rank 19.5) |
| `active/AUDIT_V07E_TEMPLATE_DIVERGENCE_2026-05-23.md` | `archive/v07e/` (NEW) | SHIPPED in full via S.269 (8 items + V07E_INVOICE_DEPRECATION 5 phases). Founder smoke verified |
| `active/BENEFITS_SPEC_v07e.md` | `archive/v07e/` | Phase 5 (apps/web archive) SHIPPED via S.253. Engine pay_api + mpp_services deleted in S.245 |
| `active/BENEFITS_SPEC_v07e_persistent_chats.md` | `archive/v07e/` | LOCK-1 + persistent chats SHIPPED at S.247. Drizzle → Prisma rewrite done |
| `active/SPEC_269_TEMPLATE_DIVERGENCE_CLEANUP.md` | `archive/v07e/` | SHIPPED 2026-05-23 via S.269 |
| `active/V07E_CONTACTS_SIMPLIFICATION.md` | `archive/v07e/` | All 5 phases substantially shipped via S.243/S.254/S.269. H3.5 reverse-lookup is the lone follow-up (rank 13) |
| `active/V07E_D_QUESTION_AUDITS.md` | `archive/v07e/` | All locks stamped via S.244 + S.245 + S.252. Decisions consumed |
| `active/V07E_INVOICE_DEPRECATION.md` | `archive/v07e/` | SHIPPED in full via S.269 (5 phases, Neon migration + CHECK constraint live) |
| `active/V07E_PERSISTENT_CHATS_LOCK1_POC.md` | `archive/v07e/` | POC findings folded into LOCK-1. Decision shipped via S.247 |
| `active/V07E_PHASE_0_BASELINE.md` | `archive/v07e/` | Baseline captured 2026-05-21. v0.7e all phases shipped |
| `active/V07E_PHASE_1_EXECUTION_PLAN.md` | `archive/v07e/` | v0.7e Phase 1 SHIPPED |
| `active/V07E_PHASE_2_PRE_EXECUTION_AUDIT.md` | `archive/v07e/` | All locks stamped (S.252). Phase 2 SHIPPED via S.253 archive |
| `active/V07E_PHASE_2_SURFACE_MAP.md` | `archive/v07e/` | Phase 2 SHIPPED via S.253 |
| `active/AUDIT_V07E_EARNS_ITS_KEEP_2026-05-23.md` | `archive/v07e/` (S.277) | SHIPPED 2026-05-23 via S.277. Engine 2.18.0 cut 5 tools (Volo trio + web_search + protocol_deep_dive) + 2 dead guards + 1 dead flag. `explain_tx` kept but description tightened. |
| `active/SPEC_38a_DOCS_SPECS_HYGIENE.md` | `archive/v07a/` | Header said "v0.1 DRAFT" but SHIPPED 2026-05-18 via S.161. Drift caught + fixed |
| `active/SPEC_26_REVIEW_2026-05-22.md` | `archive/one-offs/` | Recommendation absorbed via S.258 (founder reverted SPEC 26 wholesale) |
| `active/AUDRIC_AGENTIC_COMMERCE_SPEC_DRAFT.md` | `archive/deferred/` | DRAFT v0.1 with 7 D-questions outstanding. Paused pending Audric Store SPEC kickoff |

### 1.1.c — what was deleted entirely

- `active/SPEC_38b_CODE_HYGIENE.md` (STUB v0.0) — sister to 38a, intended to flesh out post-v0.7c. The S.253 archive absorbed most of what it would have targeted; founder ratified the delete on 2026-05-23.

### 1.2 `spec/active/shipping/` (2 files)

| File | Status | Action |
|---|---|---|
| `SPEC_30_CROSS_REPO_SECURITY_REVIEW.md` | 🟢 SHIPPING | KEEP. Phase 1A-1C SHIPPED + URGENT BLOCK SHIPPED. Phase 2-10 spun out to follow-up SPECs (31-36) for founder triage. |
| `SPEC_272_CRON_RATE_LIMITS.md` | 🟢 SHIPPING (NEW 2026-05-23) | Lever 1 SHIPPED via S.278 (cron user-batching N=10/M=500ms). Lever 2 + 3 DEFERRED pending 3-day post-deploy metric review. Decision gate documented at top of the SPEC. Promote to `archive/v07e/` once Lever 2 + 3 explicitly retired OR shipped. |

### 1.3 `spec/active/harness/` (3 files — gitignored, long-lived)

| File | Status | Action |
|---|---|---|
| `AUDRIC_HARNESS_CORRECTNESS_SPEC_v1.3.md` | 🟢 LIVE REF | KEEP. Spec 1 v1.4 — execution-ready. Engine harness contract. |
| `AUDRIC_HARNESS_INTELLIGENCE_SPEC_v1.4.1.md` | 🟢 LIVE REF | KEEP. Spec 2 v1.4.1 — execution-ready. BlockVision intelligence layer. |
| `AUDRIC_HARNESS_DEPTH_SPEC_v0.1.md` | 🟢 OUTLINE | KEEP. Spec 3 v0.1 placeholder — NOT GREENLIT. Stays until v3.0 spec drafting opens. |

### 1.4 `spec/archive/` (verified — all good, no action)

Spot-check confirmed contents match SPEC 38a layout. The 3 archive subdirs `v07c/` (2 files), `v07b/` (1), `v07a/` (8) are accurate as-is. `pre-spec-30/` (25 files), `deferred/` (3), `deprecated/` (2), `one-offs/` (7), `handoffs/` (1), `build-tracker/` (1) are stable history.

### 1.5 `spec/reference/` + `spec/runbooks/` (16 files)

All long-lived, all current. No drift. No action.

---

## 2. The "we said it shipped but it didn't fully" list

Two specs report shipped but have genuinely-open follow-ups that should NOT get lost in the archive move:

| Open follow-up | Lives in handoff as | Effort |
|---|---|---|
| **D7 — first-session memory-reset banner** (v0.7d Phase 7 D-14 mitigation) | rank 19.5 in audric handoff | ~½d / ~30 LoC |
| **V07E_STALE_FINCONTEXT_WRITE_REFUSAL Phase 2** (Prisma column drop after Q2/Q3 lock) | NOT in handoff backlog yet — **add as D8** | ~20 min + founder lock |

Both should stay in `spec/active/` until they ship. Once D7 + the column-drop ship, archive both.

---

## 3. The proposed SSOT going forward

**Three-document model. Anything outside this is drift.**

| Doc | Lives at | What it owns |
|---|---|---|
| **SSOT for SPEC inventory** | `t2000/spec/SPEC_INVENTORY_SSOT.md` (this doc, tracked) | Which SPECs are active vs archive-ready vs stale. Refresh weekly or on every SPEC ship. |
| **SSOT for the active backlog** | `audric/HANDOFF_NEXT_AGENT.md` (tracked) | The ranked task list a new agent picks up. Kept current after every ship. |
| **SSOT for the session-by-session log** | `t2000/audric-build-tracker.md` (gitignored, founder-local) | What shipped per session (S.NNN). Never gets pruned, just rotated when > 3 MB. |

**Everything else** (BENEFITS_SPEC, AUDIT_*, SPEC_38a, V07E_*, V07F_*, retrospectives, surface maps, execution plans) is supporting context for an in-flight SPEC. It belongs in `spec/active/<name>.md` while the SPEC is in flight, and in `spec/archive/<version>/<name>.md` immediately after the SPEC closes. The promotion rule is in `spec/README.md`.

---

## 4. Cleanup pass — 2026-05-23 (executed)

The 2026-05-23 cleanup moved 19 archive-ready specs + deleted 1 stub. Before/after:

**Before:** 27 files in `spec/active/` (top level), most of them remnants of fully-shipped SPECs.

**After (2026-05-23 ~19:00 AEST post-S.278):** `spec/active/` holds exactly:

```
AUDIT_ENGINE_FN_INJECTION_REFACTOR.md     # M2 backlog
AUDIT_ON_CHAIN_PIPELINE_2026-05-23.md     # PIPELINE-AUDIT-PHASE-2 backlog
SPEC_31_SCOPING.md                         # M1/SPEC 31 — founder lock pending
V07E_STALE_FINCONTEXT_WRITE_REFUSAL.md     # Phase 2 column drop pending (D8)
V07F_FORWARD_MAP.md                        # Audric Store SPEC placeholder
harness/                                   # 3 long-lived (gitignored)
shipping/SPEC_30_CROSS_REPO_SECURITY_REVIEW.md
shipping/SPEC_272_CRON_RATE_LIMITS.md      # NEW — Lever 1 SHIPPED, 2+3 deferred
```

**5 active files + 3 harness + 2 shipping = clean working set.** Plus `spec/SPEC_INVENTORY_SSOT.md` (this doc, tracked) at the spec root for cross-session SSOT.

The exact list of moved files is in §1.1.b above.

---

## 5. Refresh discipline

This SSOT goes stale fast. Refresh on:
1. Every SPEC ship (move from `active/` to `archive/<version>/`, mark in this doc).
2. Every founder lock that opens a new SPEC (add row).
3. Weekly (catch drift).

The pattern: **`git mv` first, then update this doc**. If the table here disagrees with `spec/active/`, the filesystem wins.
