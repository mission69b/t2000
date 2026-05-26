# SPEC Inventory — Single Source of Truth

> **Last refreshed:** 2026-05-26 ~22:00 AEST after **S.346 — post-v4 hygiene slice (install.sh symlink + t2 receive asset hint + Mintlify polish: skills repo link + Twitter handle + one-prompt install) + `SPEC_MARKETING_SITE_REDESIGN.md` promoted from STUB → DESIGNER-HANDOFF DRAFT.** S.346 hygiene closed 5 small drift items in commit `70c994b4`; the SPEC promotion expanded a 51-LoC stub into a comprehensive designer-facing brief covering all 3 brand surfaces (`t2000.ai` + `mpp.t2000.ai` + `suimpp.dev`) with 2 concrete deliverables (Scope A: Circle-style 6-card "with stablecoins, agents can…" panel; Scope B: live MPP catalog browser embedded on `t2000.ai`). Trigger criteria revised — the original "≥2-week soak post-pivot" requirement waived per founder decision (designer in flight). SPEC still in `spec/active/` (not yet `shipping/` — moves on first phase ship). **Prior:** 2026-05-26 ~20:00 AEST after **S.344 — Phase G SHIPPED + v4 pivot CLOSED (`@t2000/{sdk,engine,cli,mcp}@4.0.0` live on npm).** `gh workflow run release.yml --field bump=major` triggered the canonical bump-tag-publish chain: release.yml run `26436201851` bumped all 4 packages 3.3.0 → 4.0.0 in 34s using the SDK-source-of-truth pattern + committed `📦 build: v4.0.0` + tagged + pushed to origin; publish.yml run `26436221884` ran CI + `pnpm publish` (1m8s) + GitHub Release v4.0.0 (7s) + Discord notification (10s); all 4 packages confirmed live at 4.0.0 via `npm view`. Pre-publish verify gate green: SDK 612 + Engine 1225 + CLI 213 + MCP 64 = **2114 tests pass**, 4-package typecheck + build clean. `SPEC_AGENT_WALLET_GREENFIELD.md` PROMOTED from `spec/active/shipping/` → `spec/archive/v4-greenfield/` (the canonical pivot home — joins the 4 v4-greenfield archives from S.342). `spec/active/shipping/` now holds 3 files (the pivot anchor SPEC is gone). The pivot was a one-day execution: ~7h total across 11 SPEC sessions (S.327 planning + S.328-S.335 Phase A + S.336-S.339 Phase B + S.340 Phase C + S.341 Phase D + S.342 Phase E + S.343 Phase F + S.344 Phase G). Audric `apps/web-v2` downstream bump (`pnpm add @t2000/sdk@4.0.0 @t2000/engine@4.0.0`) + Mintlify dashboard connect for `developers.t2000.ai` remain as founder-side follow-ups. **Prior:** 2026-05-26 ~19:30 AEST after **S.343 — Phase F SHIPPED (Agent Wallet Greenfield Pivot Phase F: `apps/docs/` Mintlify project scaffolded for `developers.t2000.ai`).** Scope per SPEC locked decision 9: flat 5-page nav (Quickstart + Agent Wallet + Agent Payments + Agent SDK + Agent Engine), no sub-tree expansion, every key destination ≤1 click from home. All 4 SPEC verification gates pass (install ≤0 clicks inline on home; MCP setup, skills inventory, gateway catalog ≤1 click each via 4-card `<CardGroup>`). Structural smoke clean (`docs.json` valid JSON, 5/5 nav pages resolve to files, internal cross-links + anchor links resolve). `pnpm install` integrates cleanly with `mintlify@4.2.577`. Live `mintlify validate` deferred — monorepo Node 25 incompatible with Mintlify LTS-only requirement; documented `nvm use 22` workaround in `apps/docs/README.md`; Mintlify hosted CI will run validate on first deploy. `docs/REPO_LAYOUT.md` updated with `apps/docs/` row + Mintlify path convention in the where-does-X-go table. No spec/ inventory changes in this slice — Phase F is pure code-side scaffold + docs sync; the only `spec/` touch is the SPEC head + Phase row update on `SPEC_AGENT_WALLET_GREENFIELD.md`. The pivot is now at **6/7 phases shipped — only Phase G (publish `@t2000/{sdk,cli,mcp}@4.0.0` + engine 4.0.0 version-locked) remains.** **Prior:** 2026-05-26 ~18:00 AEST after **S.342 — Phase E SHIPPED (Agent Wallet Greenfield Pivot Phase E: test + spec cleanup + RPC invariant verification).** Phase E archived 4 shipped SPECs to `spec/archive/v4-greenfield/` — `SPEC_CLI_v3_SMOKE.md` + `SPEC_MCP_v3_SMOKE.md` + `SPEC_SDK_v3_SMOKE.md` (all SMOKE-2 v3 checklists, fully superseded by the v4 pivot's Phase A code-side mainnet smokes in S.335) + `SPEC_AGENTIC_STACK.md` (Phase 5 absorbed into pivot Phase D; absorption shipped via S.341). `spec/active/shipping/` now holds 4 active SPECs (`SPEC_AGENT_WALLET_GREENFIELD.md` + `SPEC_30_CROSS_REPO_SECURITY_REVIEW.md` + `SPEC_272_CRON_RATE_LIMITS.md` + `SPEC_AUDRIC_STREAM_RESUME.md`). Phase E also tightened 4 actionable stale references in `packages/sdk/src/{contacts.ts,contacts.test.ts,t2000.ts}` (user-facing error messages still pointing at deleted v3 commands `t2000 contacts add` + `t2000 save` + `t2000 fund`); refreshed package descriptions for `@t2000/{cli,sdk,mcp}` from the v3 surface (PIN, 29 tools, 15 prompts, "Agentic Wallets") to v4 ("Agent Wallets", 9 tools, 8 prompts, gasless USDC+USDsui, MCP integration first-class); confirmed `T2000_RPC_URL` + `T2000_GRPC_URL` env vars wired end-to-end. **Prior:** 2026-05-26 ~10:00 AEST after **S.327 — Agent Wallet Greenfield Pivot SPEC drafted (planning, no code).** Founder review of S.321 → S.326 (Agentic Stack Phases 1-4) + Circle's reference surfaces produced the canonical pivot SPEC at `spec/active/shipping/SPEC_AGENT_WALLET_GREENFIELD.md` (~9-10 days, 7 phases, ships as `@t2000/{sdk,cli,mcp}@4.0.0` major; engine 4.0.0 version-locked). 3 deferred follow-up stubs opened in `spec/active/`: `SPEC_REMOTE_MCP_AND_ZKLOGIN.md` (supersedes SPEC 39), `SPEC_MARKETING_SITE_REDESIGN.md`, `SPEC_FULL_GRPC_MIGRATION.md` (calendar-triggered by Mysten July 2026 JSON-RPC deactivation). `SPEC_AGENTIC_STACK.md` Phase 5 marked ABSORBED into the pivot's Phase D. Next session = Phase A (CLI greenfield rewrite + gRPC/gasless). **Prior:** 2026-05-26 ~07:30 AEST after **S.326 SHIPPED (code only — release pending)** — Agentic Stack Phase 4: 3 hero MPP recipes (`mpp-image-gen`, `mpp-gpt4o`, `mpp-transcription`) + `mpp-index` discovery + `apps/gateway/README.md` rewrite 56 → 138 LoC; skills 17 → 21; CLI `skills uninstall` extended for `mpp-` prefix via `isManagedSkillName()` helper. **Note S.327 deletes all 4 of these `mpp-*` skills** (founder Path A decision — they're "marketing material disguised as skills"). **Prior:** 2026-05-26 ~07:00 AEST after **S.325 SHIPPED** — Skills install UX (`t2000-skills/README.md` rewrite leading with MCP install = 17 slash commands story + `t2000 skills install` CLI command). **Prior:** 2026-05-26 ~06:20 AEST after **S.324 SHIPPED** — P1-P3 audit pass (4 bugs found + fixed). **Prior:** 2026-05-25 ~21:50 AEST after **S.323 SHIPPED (code only — release pending)** — Full Volo removal across SDK + CLI + MCP. Founder review of S.322's freshly-added `t2000-stake` skill triggered the cleanup: "Oh then we should remove t2000 stake all together. This is a dead feature." The S.277 "retain Volo for non-Audric consumers" rationale didn't hold up (no such consumers exist). Deleted 5 files (`packages/sdk/src/protocols/volo.{ts,test.ts}`, `packages/cli/src/commands/{stake,unstake}.ts`, `t2000-skills/skills/t2000-stake/SKILL.md`), edited ~21 (SDK + CLI + MCP + engine surfaces + skills + docs + .cursor/rules + specs). 4-package typecheck + test (SDK 586/586 + CLI 66/66 + MCP 130/130 + engine 1225/1225) + build all clean. CLI smoke `t2000 stake 5` → `unknown command`. Ready for `@t2000/{sdk,engine,cli,mcp}@3.3.0` minor release (matches S.245 / S.269 / S.277 feature-cut convention). **Prior:** 2026-05-25 ~21:35 AEST after **S.322 SHIPPED** — Agentic Stack SPEC Phase 2+3 bundled (Skills Modernization + One-Prompt Install Infrastructure). 4 new skills (`t2000-setup` / `t2000-swap` / `t2000-stake` / `t2000-yields`; **`t2000-stake` deleted in S.323**), Rules blocks on 5 write skills, drift fix on `t2000-engine`, Next.js dynamic route `/skills/[slug]` + `.well-known/agent-skills/index.json` manifest, 18-skill manifest verified (**17 post-S.323**) via build trace + prerendered output. No npm release (skills + routes static; Vercel handles deploy). **Prior:** 2026-05-25 ~20:50 AEST after **S.321 SHIPPED** — Agentic Stack Phase 1 → `@t2000/*@3.2.0`. **Earlier:** 2026-05-25 ~16:50 AEST after **S.319 SHIPPED** — `SPEC_AI_SDK_HARDENING.md` ✅ CLOSED. Founder ran V3-SMOKE-1 through V3-SMOKE-6 on https://audric.ai prod (~16:00-16:40 AEST); all signals PASS. P7.5 trigger criteria (post-bundle user confusion during execute latency) NOT hit by V3-SMOKE-5 — chain-mode bundle executed atomically with single sign popup + clean receipt narration. Both `SPEC_AI_SDK_HARDENING.md` + `SPEC_AI_SDK_HARDENING_V3_SMOKE.md` promoted from `active/shipping/` → `archive/v07f/`. Three follow-up findings logged separately as pre-existing audric/web-v2 host bugs (NOT v3 regressions): (a) borrow display lag post-approve, (b) financial-context cron stale 51h, (c) DeFi protocol AbortError pattern in portfolio_ms. **Prior refresh:** 2026-05-25 ~14:55 AEST after **S.314 SHIPPED** (`SPEC_AI_SDK_HARDENING.md` Phase 7 P7.2 + P7.3 — `inputCoinFromStep` + `cetusRoute` end-to-end through audric `apps/web-v2`; engine compose-bundle +5 chain-mode invariant tests; t2000 `5d621e9d` + audric `77e3f1b`) and **SMOKE-1 drafted** (`SPEC_AI_SDK_HARDENING_V3_SMOKE.md` added to shipping/ — 6 items covering save/borrow/swap/`update_todo` regression/chain-mode bundle/read tools sample for the v3.0.0+v3.1.0+S.314 surface). Phase 7 status: 4/5 items SHIPPED (P7.1+P7.2+P7.3+P7.4); only P7.5 remains. **Prior refresh:** Engine 2.20.1 → **3.0.0** (P4.1, defineTool → native `tool()`; legacy `Tool` interface + all dead surfaces removed) → **3.1.0** (P4.1 follow-up: dead `LLMProvider` pathway retired + `AISDKAnthropicProvider` deleted + CLI/MCP ESLint configs landed + Audric `TurnMetrics.todoUpdateCount` column dropped via Prisma migration). All 4 packages — `sdk` / `engine` / `cli` / `mcp` — at npm @ **3.1.0**. Audric `apps/web-v2` consuming @ 3.1.0 in prod via `3ea7fd2`. Phase 5 smoke (`SPEC_AI_SDK_HARDENING_PHASE_5_SMOKE.md`) archived to `spec/archive/v07e/` (passed 2026-05-24). External narrative for S.277 archived to `spec/archive/one-offs/`. **`SPEC_AI_SDK_HARDENING.md` is now 6/7 phases shipped; only Phase 7 (bundle hardening — P7.2/P7.3/P7.5) remains open** — Phase 7 is the natural next pickup. **🚨 Latent finding surfaced 2026-05-25:** audric CI workflow at `audric/.github/workflows/ci.yml` still filters `pnpm --filter web …` (the package `web` was deleted in v0.7e Phase 5 / S.253, 2026-05-22). All 3 jobs report `No projects matched the filters` and exit 0 → CI has been silently green-but-empty for ~3 days. P0 fix tracked in `HANDOFF_NEXT_AGENT.md` (CI-FIX-1).
>
> **Pre-2026-05-25 refresh history:** 2026-05-24 ~21:30 AEST after S.310 — **Canvas positionFetcher fallback SHIPPED** (`render_canvas` no longer defaults to $1000/4.5% when host wires `positionFetcher` instead of pre-fetching into `serverPositions`; engine patch bump 2.20.0 → 2.20.1; +4 regression tests, 1323/1333 engine tests pass) — and S.311 — **P4.3 subagent pilot DEFERRED** (`spec/reference/SUBAGENT_PILOT_DEFERRAL.md`, "no current pain"; 4 named re-litigation triggers documented). Together with S.309 these close out the production smoke that surfaced (a) intent classifier strips writes, (b) dead `temperature` config noise, (c) canvas defaults divorced from real positions. Earlier: S.305-S.308 — AI SDK Hardening **Phase 4 decision docs batch SHIPPED** (P4.2 `CANVAS_VS_ARTIFACT.md` + P4.4 `PRISMA_VS_DRIZZLE.md` + P4.5 `LONG_RUNNING_WORKFLOWS.md` + P4.6 `LLM_CACHING_DECISION.md`). Phase 4 progress: 5/7 items closed (P4.2 + P4.4 + P4.5 + P4.6 + P4.7); only P4.1 (defineTool→tool migration, engine v3.0.0) + P4.3 (subagent pilot) remain. Tracked-file count: `spec/reference/` +4 (4 new decision docs). Earlier this evening: S.304 — **P4.7** SHIPPED (USD-aware auto-execute rule correction, closes F-10 from v0.7a smoke plan). S.303 — **P3.3** CLOSED as DORMANT STRATEGIC SEAM (`McpPromptAdapter` + `skillRecipeBlock` stays unwired by design; new decision doc at `spec/reference/MCP_PROMPTS_INTEGRATION_DECISION.md`). **Phase 3 of `SPEC_AI_SDK_HARDENING.md` CLOSED** (P3.1+P3.2+P3.3+P3.4 all shipped or locked). Earlier today: S.302 (P3.1 intent classifier + activeTools, audric host-only), S.301 (P3.4 onStepFinish unification, engine 2.20.0), S.300 (P3.2 `experimental_repairToolCall`), S.299 (Phase 6 PII self-audit fix), S.298 (Phase 6 typed-error classification), S.292 (P5.6 live HF/APY metadata), S.291 (P5.1 edit/truncate/5 tests, audric `9029eb1`), S.290 (P5.2 + P5.3 + P5.4 batch), SPEC promotion (`.cursor/plans/ai_sdk_hardening_bc37c5e8.plan.md` → `spec/active/shipping/SPEC_AI_SDK_HARDENING.md`), S.289 Phase 3 self-audit fixes (audric `2239d30`, t2000 `eb9c0e21`), S.288 (Phase 2 + flag drop), S.287 (Phase 1 ship + SPEC promotion `spec/active/` → `shipping/`), S.286 (SPEC v0.1 → v0.2), S.285 (AI SDK Hardening Phase 2 code ship).
> **Purpose:** answer "what's actually in `spec/` right now, what's drifted, what's archive-ready" in one read. Run a fresh sweep against this table at the start of any session that touches `spec/`.
> **Companion:** `spec/README.md` (the layout + promotion rules contract).

---

## 0. TL;DR — current state (post-S.344 — Phase G SHIPPED + v4 pivot CLOSED; `@t2000/*@4.0.0` live)

S.344 promoted the pivot anchor SPEC (`SPEC_AGENT_WALLET_GREENFIELD.md`) from `spec/active/shipping/` → `spec/archive/v4-greenfield/` after Phase G shipped (`@t2000/{sdk,engine,cli,mcp}@4.0.0` live on npm). `spec/active/shipping/` now holds 3 files; the v4-greenfield archive holds 5 (the 4 from S.342 + the anchor SPEC itself).

| Bucket | Count | State |
|---|---|---|
| ✅ Genuinely active (in flight or pending decision) | **5** | In `spec/active/` — 5 original |
| 🟡 Deferred follow-up stubs (S.327) | **3** | In `spec/active/` — Remote MCP + zkLogin / Marketing redesign / Full gRPC migration |
| 🚀 Shipping (active or recently-shipped multi-phase SPECs) | **3** | In `spec/active/shipping/` — `SPEC_30` Phase 2-10 + `SPEC_272` Lever 2-3 + `SPEC_AUDRIC_STREAM_RESUME` Phase 4 all have open follow-ups (v4 pivot anchor archived in S.344) |
| 🟡 Long-lived harness specs (gitignored) | **3** | In `spec/active/harness/` |
| 📦 Archived (2026-05-23 cleanup) | **19** | Now in `spec/archive/<version>/` |
| 📦 Archived (2026-05-25 post-P4.1 + V3 smoke pass) | **4** | Moved in S.319 + S.294 — see §1.1.d |
| 📦 Archived (2026-05-26 / S.342-S.344 — v4 greenfield pivot) | **5** | In `spec/archive/v4-greenfield/` — see §1.1.e + §1.2.a (S.342: 4 collateral SPECs; S.344: anchor SPEC) |
| 🗑️ Deleted (dead stub) | **1** | SPEC 38b (S.253 absorbed its scope) |

**See §1.1 below for the canonical list of what's still active.** Anything else either shipped (look in `archive/`) or never existed.

---

## 1. The full inventory

### 1.1 `spec/active/` (current state — 8 files; +3 deferred stubs added in S.327)

| # | File | Status | Why it's still active |
|---|---|---|---|
| 1 | `AUDIT_ENGINE_FN_INJECTION_REFACTOR.md` | 🟢 ACTIVE | M2 backlog row in `audric/HANDOFF_NEXT_AGENT.md` (rank 17). Re-baseline scope first — most legacy `apps/web` rewrites died with S.253. Audit-only; no code changes yet. |
| 2 | `AUDIT_ON_CHAIN_PIPELINE_2026-05-23.md` | 🟢 ACTIVE | PIPELINE-AUDIT-PHASE-2 backlog row (rank 7.5). Phase 1 audit (read-only) shipped 2026-05-23. Phase 2 (decision) + Phase 3 (migration) pending founder triage on the recommendation. |
| 3 | `SPEC_31_SCOPING.md` | 🟢 ACTIVE | Founder triage pending to lock SPEC scope (CSP polish). Agent-only ready-to-ship once locked. M1 backlog row (rank 14). |
| 4 | `V07E_STALE_FINCONTEXT_WRITE_REFUSAL.md` | 🟢 ACTIVE | Phase 1 SHIPPED via S.242 (Path 6 locked). **Phase 2 still pending:** Q2 (Prisma migration timing for column drop) + Q3 (audit coverage) unlocked. **D8** in handoff backlog (rank 19.9). ~20 min impl. |
| 5 | `V07F_FORWARD_MAP.md` | 🟢 ACTIVE | REFRAMED 2026-05-22 (S.245). New scope = Audric Store SPEC clean-slate Commerce design. Stays as forward-looking placeholder until Audric Store SPEC kickoff (D3/D4 rank 21-22). |
| 6 | `SPEC_REMOTE_MCP_AND_ZKLOGIN.md` | 🟡 DEFERRED-STUB (NEW S.327) | Supersedes SPEC 39 (HTTP MCP). 4 open questions on zkLogin address fragmentation + custody. 3 named trigger criteria. Not greenlit; founder triage post-pivot. |
| 7 | `SPEC_MARKETING_SITE_REDESIGN.md` | 🟡 DESIGNER-HANDOFF DRAFT (PROMOTED S.346) | Was a 51-LoC stub from S.327; S.346 expanded to a designer-facing brief covering all 3 brand surfaces (`t2000.ai` + `mpp.t2000.ai` + `suimpp.dev`). 2 concrete deliverables: Scope A (Circle-style 6-card panel) + Scope B (live MPP catalog browser). Cross-brand unification decisions enumerated. Designer in flight per founder note. Not yet shipping — promotes to `shipping/` on first phase ship. NOT `developers.t2000.ai` (owned by pivot Phase F via Mintlify). |
| 8 | `SPEC_FULL_GRPC_MIGRATION.md` | 🟡 DEFERRED-STUB / CALENDAR-TRIGGERED (NEW S.327) | **Mysten deactivates JSON-RPC July 2026.** MUST open immediately after pivot Phase G ships. 5-stage migration outline, 4 open questions. Calendar target: full migration by ~2026-07-15. |

**Note:** `SPEC_AUDRIC_STREAM_RESUME.md` (added in S.286, drafted v0.1 → v0.2) was promoted to `spec/active/shipping/` in S.287 after Phase 1 shipped. See §1.2.

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

### 1.1.d — additional archives 2026-05-25 (post-P4.1 close + V3 smoke pass)

| Old location | New location | Why it moved |
|---|---|---|
| `active/shipping/SPEC_AI_SDK_HARDENING_PHASE_5_SMOKE.md` | `archive/v07e/` | Phase 5 smoke PASSED 2026-05-24 ~13:54 AEST per S.294. The file's own header marks it "PASSED" + "kept as the smoke template for the next phase close-out" — but P4.1 / v3.0.0 + v3.1.0 shipped without producing a new smoke checklist (smoke ran inline in audric/web-v2 prod deploy), so the template role isn't load-bearing. Archive. |
| `active/EXTERNAL_NARRATIVE_S277_2026-05-23.md` | `archive/one-offs/` | Marketing draft for the S.277 "Earns Its Keep" cut. The audit it externalises lives at `archive/v07e/AUDIT_V07E_EARNS_ITS_KEEP_2026-05-23.md`. Founder picks one variant + ships externally; the draft is a one-off, not a long-lived reference. |
| `active/shipping/SPEC_AI_SDK_HARDENING.md` | `archive/v07f/` (NEW) | ✅ CLOSED 2026-05-25 (S.319). 6/7 phases SHIPPED; Phase 7 P7.1+P7.2+P7.3+P7.4 SHIPPED; P7.5 cleanly DEFERRED (trigger criteria NOT hit by V3-SMOKE-5 — chain-mode bundle executed atomically with no surfaced user confusion). V3 prod smoke (founder, audric.ai, ~16:00-16:40 AEST) verified all 6 items PASS. Three follow-up findings classified as pre-existing audric/web-v2 host bugs (not v3 regressions); tracked in build tracker forward backlog. |
| `active/shipping/SPEC_AI_SDK_HARDENING_V3_SMOKE.md` | `archive/v07f/` (NEW) | Companion smoke checklist for v3.0.0/v3.1.0/S.314 surface. PASSED 2026-05-25 (S.319). Stays as reference template for the NEXT major engine release smoke. |

### 1.2 `spec/active/shipping/` (3 files — `SPEC_AGENT_WALLET_GREENFIELD.md` archived in S.344 after Phase G shipped)

| File | Status | Action |
|---|---|---|
| `SPEC_30_CROSS_REPO_SECURITY_REVIEW.md` | 🟢 SHIPPING | KEEP. Phase 1A-1C SHIPPED + URGENT BLOCK SHIPPED. Phase 2-10 spun out to follow-up SPECs (31-36) for founder triage. |
| `SPEC_272_CRON_RATE_LIMITS.md` | 🟢 SHIPPING (NEW 2026-05-23) | Lever 1 SHIPPED via S.278 (cron user-batching N=10/M=500ms). Lever 2 + 3 DEFERRED pending 3-day post-deploy metric review. Decision gate documented at top of the SPEC. Promote to `archive/v07e/` once Lever 2 + 3 explicitly retired OR shipped. |
| `SPEC_AUDRIC_STREAM_RESUME.md` | 🟢 SHIPPING (v0.4 — 2026-05-24) | Phase 1 SHIPPED via S.287 (server-side wiring + 3 routes + Prisma migration + `resumable-stream@2.2.12`). Phase 1.5 + 2 SHIPPED via S.288 (flag drop + auto-migrate + `useChat({ resume: true })` + real Stop button). Phase 3 SHIPPED via S.289 (cross-instance AbortController via `lib/stream-abort.ts` Redis pub/sub on `stream:abort:{id}` channel + abortSignal threaded to `audricAgent.stream` → stop genuinely cancels LLM call + Anthropic token spend + 6 telemetry log lines covering attempt/success/proof/stop/abort). Phase 4 OPTIONAL (stale-stop guard via server-rendered activeStreamId + 48h prod soak observation + Anthropic spend before/after validation). Promote to `archive/v07e/` once Phase 4 closes OR is explicitly retired. Companion to `SPEC_AI_SDK_HARDENING.md` — covers P2.2. |

### 1.2.a `spec/archive/v4-greenfield/` — NEW 2026-05-26 (S.342) + anchor SPEC archived 2026-05-26 (S.344)

New archive subdirectory created in Phase E to hold the v4 Agent Wallet Greenfield Pivot's archived collateral. Now holds 5 files — 4 moved in S.342 + 1 anchor SPEC moved in S.344 after Phase G shipped:

| Old location | New location | Why it moved |
|---|---|---|
| `active/shipping/SPEC_CLI_v3_SMOKE.md` | `archive/v4-greenfield/` | v3 smoke checklist (`@t2000/cli@3.1.0`). Fully superseded by Phase A code-side mainnet smokes (S.335; 8/8 critical smokes passed end-to-end on real Sui mainnet against a fresh v4 wallet) + the `program.integration.test.ts` 213-test suite. |
| `active/shipping/SPEC_MCP_v3_SMOKE.md` | `archive/v4-greenfield/` | v3 smoke checklist (`@t2000/mcp@3.1.0`). Surface dropped from 27 → 9 tools in S.336; full prompt set replaced with 8 auto-registered `skill-*` prompts. v3 checklist no longer reflects shipped surface. |
| `active/shipping/SPEC_SDK_v3_SMOKE.md` | `archive/v4-greenfield/` | v3 smoke checklist (`@t2000/sdk@3.1.0`). The Day 2 SDK gRPC/gasless rewrite (S.329) + Day 3 CLI rewrite (S.330) + S.323 Volo cut superseded all 5 smoke items. |
| `active/shipping/SPEC_AGENTIC_STACK.md` | `archive/v4-greenfield/` | EFFECTIVELY CLOSED 2026-05-26 (per its own header). Phase 1 SHIPPED S.321, Phase 2+3 SHIPPED S.322, Phase 4 SHIPPED S.326. **Phase 5 ABSORBED into Greenfield Pivot Phase D**, fully shipped via S.341 (3 package READMEs + apps/web redeploy with manifest fresh-bake + 22/22 skill-URL smoke pass). |
| `active/shipping/SPEC_AGENT_WALLET_GREENFIELD.md` | `archive/v4-greenfield/` (S.344) | ✅ SHIPPED 2026-05-26 — all 7 phases (A-G) closed in a single day. **The pivot is the canonical example of a tightly-scoped 1-day greenfield major-version cut.** Final release: `@t2000/{sdk,engine,cli,mcp}@4.0.0` live on npm via release.yml run `26436201851` + publish.yml run `26436221884`. Pre-publish gate: 2114 tests pass + 4-package typecheck + build clean. |

### 1.3 `spec/active/harness/` (3 files — gitignored, long-lived)

| File | Status | Action |
|---|---|---|
| `AUDRIC_HARNESS_CORRECTNESS_SPEC_v1.3.md` | 🟢 LIVE REF | KEEP. Spec 1 v1.4 — execution-ready. Engine harness contract. |
| `AUDRIC_HARNESS_INTELLIGENCE_SPEC_v1.4.1.md` | 🟢 LIVE REF | KEEP. Spec 2 v1.4.1 — execution-ready. BlockVision intelligence layer. |
| `AUDRIC_HARNESS_DEPTH_SPEC_v0.1.md` | 🟢 OUTLINE | KEEP. Spec 3 v0.1 placeholder — NOT GREENLIT. Stays until v3.0 spec drafting opens. |

### 1.4 `spec/archive/` (verified — all good, no action)

Spot-check confirmed contents match SPEC 38a layout. The 3 archive subdirs `v07c/` (2 files), `v07b/` (1), `v07a/` (8) are accurate as-is. `pre-spec-30/` (25 files), `deferred/` (3), `deprecated/` (2), `one-offs/` (7), `handoffs/` (1), `build-tracker/` (1) are stable history.

### 1.5 `spec/reference/` + `spec/runbooks/` (22 files — +1 in S.311, +4 in S.305-S.308)

All long-lived, all current. No drift. No action. S.311 (2026-05-24) added **`spec/reference/SUBAGENT_PILOT_DEFERRAL.md`** locking the P4.3 deferral decision with 4 named re-litigation triggers + the canonical pilot architecture documented inline for execution when a trigger fires. Earlier, S.305-S.308 (2026-05-24) batched **4 new decision docs under `spec/reference/`** as part of the AI SDK Hardening Phase 4 doc work:

- `CANVAS_VS_ARTIFACT.md` (S.305 / closes P4.2) — locks 9 canvas templates as inline read-only primitives; `render_artifact` ships as a separate tool when Audric Store Phase 5 lands
- `PRISMA_VS_DRIZZLE.md` (S.306 / closes P4.4) — locks audric/web-v2 on Prisma; the chatbot template's Drizzle choice doesn't apply at Node runtime
- `LONG_RUNNING_WORKFLOWS.md` (S.307 / closes P4.5) — locks chat on inline `streamText` + `SPEC_AUDRIC_STREAM_RESUME` durability; workflows fit when Audric Store generation tasks (10s-2min) land
- `LLM_CACHING_DECISION.md` (S.308 / closes P4.6) — locks Audric on AI Gateway prompt cache only; Redis response cache structurally unsafe for finance content

S.303 (2026-05-24, earlier) added `spec/reference/MCP_PROMPTS_INTEGRATION_DECISION.md` documenting the dormant `McpPromptAdapter` + `skillRecipeBlock` strategic seam (closes `SPEC_AI_SDK_HARDENING.md` P3.3).

Each decision doc is the canonical "do not re-litigate without new evidence" surface for future agents — they prevent the next reader from re-asking the same architectural question and triggering a stalled session.

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

**After (2026-05-24 ~10:30 AEST post-S.287):** `spec/active/` holds exactly:

```
AUDIT_ENGINE_FN_INJECTION_REFACTOR.md     # M2 backlog
AUDIT_ON_CHAIN_PIPELINE_2026-05-23.md     # PIPELINE-AUDIT-PHASE-2 backlog
SPEC_31_SCOPING.md                         # M1/SPEC 31 — founder lock pending
V07E_STALE_FINCONTEXT_WRITE_REFUSAL.md     # Phase 2 column drop pending (D8)
V07F_FORWARD_MAP.md                        # Audric Store SPEC placeholder
harness/                                   # 3 long-lived (gitignored)
shipping/SPEC_30_CROSS_REPO_SECURITY_REVIEW.md
shipping/SPEC_272_CRON_RATE_LIMITS.md      # Lever 1 SHIPPED, 2+3 deferred
shipping/SPEC_AUDRIC_STREAM_RESUME.md      # NEW — Phase 1 SHIPPED via S.287, Phase 2+3 pending
```

**5 active files + 3 harness + 3 shipping = clean working set.** Plus `spec/SPEC_INVENTORY_SSOT.md` (this doc, tracked) at the spec root for cross-session SSOT.

The exact list of moved files is in §1.1.b above.

---

## 5. Refresh discipline

This SSOT goes stale fast. Refresh on:
1. Every SPEC ship (move from `active/` to `archive/<version>/`, mark in this doc).
2. Every founder lock that opens a new SPEC (add row).
3. Weekly (catch drift).

The pattern: **`git mv` first, then update this doc**. If the table here disagrees with `spec/active/`, the filesystem wins.
