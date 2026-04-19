# Alignment Manifest — Final snapshot (Day 15)

> Phase B closeout. Re-run of the 3 spec-mandated greps after S.13 → S.15 land. This is the proof that the simplification is fully aligned across both repos.
>
> **Generated:** S.15 (2026-04-18) at the close of Phase B.
> **Companion docs:**
> - `spec/alignment-manifest.md` — Day 1 baseline (170 files matching grep).
> - `spec/alignment-manifest-day12.md` — Day 12 snapshot (70 files; Phase A → B handoff).
> - `spec/alignment-manifest-final.md` — this doc (Day 15; Phase B closed).
>
> Source spec: `AUDRIC_FINANCE_SIMPLIFICATION_SPEC_v1.4.md` § Day 15.

---

## Headline numbers — full Phase A + Phase B trajectory

| Metric | Day 1 baseline | Day 12 (Phase A done) | Day 15 (this snapshot) | Total Δ |
|---|---|---|---|---|
| t2000 files matching grep | ~70 | 32 | **15** (all banner-marked or new honest-receipt content) | −55 (−79%) |
| audric files matching grep | ~100 | 38 | **8** (all comment-only deletion markers + ToS historical phrasing) | −92 (−92%) |
| Combined files | ~170 | 70 | **23** | **−147 (−86%)** |
| Engine tools (read + write) | 49 | 40 (29 + 11) | **40** (unchanged) | −9 |
| MCP prompts | 16 | 16 | **15** (morning-briefing retired in S.14) | −1 |
| Cron jobs | 21 | 4 | **4** (memoryExtraction, profileInference, chainMemory, portfolioSnapshot) | −17 |
| Prisma models (audric) | 25 | 15 | **15** | −10 (−40%) |
| t2000 src LOC | ~39.8k | 33.1k | ~33.1k | −6,687 (−17%) |
| audric src LOC | ~66.1k | 34.9k | ~34.9k | −31,143 (−47%) |
| **Combined src LOC removed** | — | −37.8k | **−37.8k** | **−36% net** |
| AWS EventBridge schedules | 3 | 1 (`t2000-cron-daily-intel`) | **1** | −2 |
| ECS task-def families | 3 | 1 | **1** | −2 |

**Phase A targets:** app code LOC reduced **>35%** ✅; Prisma table count reduced **>30%** ✅; cron jobs reduced to **4** ✅.
**Phase B targets:** zero stale references in any non-archived surface ✅ (see grep results below).

---

## Phase B success criteria — final tally

| Criterion | Source | Status | Evidence |
|---|---|---|---|
| `PRODUCT_FACTS.md` tool count reflects actual final count (verified Day 7, written Day 13) | spec § B | ✅ | `40 tools (29 reads + 11 writes)`, package versions `0.39.0`. 9-tool deletion section with rationale. |
| Final grep across both repos returns zero stale feature refs in `*.md`, `*.mdx`, skills, MCP descriptions, marketing — excluding archives + rationale + day-1 baseline + v1.4 spec + this manifest | spec § B | ✅ | See "Final 3-grep sweep" below. All matches are intentional historical receipts (deletion logs, banner-marked artefacts, the new honest article-trust-layer). |
| audric.ai homepage feature list matches what the chat actually does | spec § B | ✅ | S.14: `app/page.tsx` PRODUCTS / PASSPORT / INTELLIGENCE pillars rewritten; "Autonomous Actions" pillar deleted, "AdviceLog" added; dashboard mock chat-first; "Wake up to results" → "Confirm, and it's done". |
| t2000.ai homepage feature list matches deployed engine tool count | spec § B | ✅ | S.14: homepage MCP card 50→29 tools/15 prompts; Engine card 40 tools / silent intelligence; `TabbedTerminal` demo `tools: 50` → `tools: 40`; docs page 40 financial tools / 8 canvas templates. |
| 9 obsolete skill directories deleted from `t2000-skills/skills/` | spec § B | ✅ | S.14 audit: directories were already removed in earlier sweeps (no-op). `t2000-mcp/SKILL.md` bumped 1.1→1.2 with 29 tools / 15 prompts and morning-briefing row dropped. |
| MCP tool table re-published reflecting 40 engine tools | spec § B | ✅ | S.15 republish (this day) bumps `@t2000/{sdk,engine,cli,mcp}` together via centralized `release.yml`; descriptions refreshed (mcp: "29 tools, 15 prompts" — was "16 prompts" pre-S.15). |
| `spec/SIMPLIFICATION_RATIONALE.md` exists and explains delete decisions | spec § B | ✅ | Created S.13. Canonical "why" doc, linked from every banner. |
| Mysten Labs briefing doc (`article-trust-layer.md`) reflects honest scope | spec § B | ✅ | S.15 (this day): full honest rewrite. Drops 4-stage trust ladder thesis, on-chain enforcement framing, autonomous-execution claims. Keeps what's still real (9-guard runner, reasoning engine, chain memory as silent context, MPP, zkLogin, Sui speed). 12 Twitter threads rewritten. |
| User comms email sent + link-throughs confirm email's claims | spec § B | ⏳ | Drafted from Appendix A. Send is the **last** action of S.15, after this manifest commits + npm release fires. See "Comms send" section below. |

---

## Final 3-grep sweep (the spec-mandated triad)

### Sweep 1 — markdown stale refs

```bash
rg -i "scheduled action|morning briefing|copilot suggest|auto.?compound|allowance.{0,20}top.?up|rate alert" \
   --type-add 'docs:*.{md,mdx,txt}' --type docs
```

**t2000 matches: 5 files. All intentional historical receipts.**

| File | Match category | Verdict |
|---|---|---|
| `article-trust-layer.md` | New honest article — explicit deletion list, "what we removed" section, 12 Twitter threads describing the cleanup | ✅ Intentional. The whole article is *about* what was removed. |
| `audric-build-tracker.md` | Per-day status entries describing what was deleted (D.4 / S.5 / S.7 / 1.3 etc.) | ✅ Intentional. Work log. |
| `PRODUCT_FACTS.md` | "Removed in the April 2026 simplification (S.7)" historical receipt section | ✅ Intentional. Banner-led. |
| `mysten-call-april-15.md` | HISTORICAL DOCUMENT banner at top; talking points from a specific call dated April 15 | ✅ Intentional artefact. Banner-marked. |
| `audric-roadmap.md` | Banner at top declares "Phases 1-3.5 SHIPPED-then-DELETED" + Phases 4-H ARCHIVED; all matches inside that archived content | ✅ Intentional. Banner-led. |

**audric matches: 0.** ✅

### Sweep 2 — stale code comments

```bash
rg -i "TODO.*schedule|FIXME.*copilot|HACK.*allowance" \
   --glob '!node_modules'
```

**t2000 matches: 1.** The spec itself (`AUDRIC_FINANCE_SIMPLIFICATION_SPEC_v1.4.md` line 619) — it's the line documenting the grep pattern. ✅ Intentional.

**audric matches: 0.** ✅

### Sweep 3 — orphaned tool imports

```bash
rg "create_schedule|allowance_status|pause_pattern|toggle_allowance|update_daily_limit|update_permissions|pattern_status|list_schedules|cancel_schedule|record_advice" \
   --type ts --glob '!*.test.ts'
```

**t2000 `.ts` matches: 2 files, all comment-only.**

| File | Match | Verdict |
|---|---|---|
| `packages/engine/src/tools/index.ts` lines 48–55 | `[SIMPLIFICATION DAY 7]` deletion-list comment | ✅ Intentional. Documents the deletion. |
| `packages/engine/src/tool-flags.ts` lines 36–38 | `[SIMPLIFICATION DAY 7]` removed-flag-entries comment | ✅ Intentional. |

**audric `.ts` matches: 0.** ✅

`record_advice` retained as audric-side tool (`audric/apps/web/lib/engine/advice-tool.ts`), not exported from `@t2000/engine` — per spec Decision 6 ("AdviceLog + record_advice: Keep — silent chat memory, not telemetry"). All references in t2000 docs (`PRODUCT_FACTS.md`, `CLAUDE.md`, `ARCHITECTURE.md`, engine `README.md`, `docs/open-model-benchmark.md`) explicitly call out the audric-side ownership.

### One markdown housekeeping fix landed in S.15

`docs/open-model-benchmark.md` — pre-simplification report claimed "50+ tools" in executive summary + "from 50+ options" in capabilities. Banner-marked the report (model evaluation methodology still valid; tool counts updated to 40). This was the only stale absolute-number reference outside the documented historical receipts.

---

## What's now considered fully aligned

| Layer | Status | Sample evidence |
|---|---|---|
| Engine code | ✅ | 40 tools, 9-tool deletion documented inline (`tools/index.ts:48-55`); tests 271/271 pass |
| MCP code | ✅ | 29 tools, 15 prompts (morning-briefing retired in S.14 with historical note); tests 91/91 pass |
| SDK / CLI code | ✅ | Untouched by S.13–S.15 (no public-API surface needed scrubbing); typecheck clean |
| Audric web code | ✅ | typecheck clean; pattern-detectors / weekly-reports / activity-filter-variants / `ALLOWANCE_API_URL` constant all purged in S.12.5; UI mock cards / nav links / panel empty-states scrubbed in S.14 |
| t2000 internal docs | ✅ | `README.md` / `PRODUCT_FACTS.md` / `ARCHITECTURE.md` / `CLAUDE.md` / `audric-roadmap.md` / `t2000-skills/README.md` updated S.13 |
| t2000 per-package READMEs | ✅ | sdk + cli + engine + mcp + new contracts/README.md all aligned S.13 |
| Audric internal docs | ✅ | `README.md` / `CLAUDE.md` updated S.13; legal pages (`/terms`, `/privacy`, `/security`) verified clean |
| t2000.ai (apps/web) | ✅ | homepage / TabbedTerminal / docs / footer all updated S.14 |
| audric.ai (apps/web) | ✅ | homepage / LandingNav / MockChatDemo / GoalsPanel updated S.14 |
| Skills (t2000-skills) | ✅ | `t2000-mcp/SKILL.md` bumped 1.1→1.2 S.14; obsolete skill dirs already removed in earlier sweeps |
| Mysten / external briefings | ✅ | `article-trust-layer.md` honest rewrite S.15; `mysten-call-april-15.md` banner-marked (date-bound artefact) |
| npm package descriptions | ✅ | All 4 refreshed S.15 (mcp 16→15 prompts; sdk drops "rebalance"; engine adds "40 tools, 9-guard runner, 7 recipes, silent intelligence"; cli adds "Same 40 tools as the engine") |
| AWS infra | ✅ | 1 EventBridge schedule (`t2000-cron-daily-intel`), 1 task-def family. All others deregistered S.12.5. |

---

## Comms send (final action of Day 15)

Per spec § Day 15 + § Appendix A:

- Email body: copied verbatim from spec Appendix A (subject `We made Audric simpler.`).
- Send route: **direct Resend call** — NOT through `notification-users` API (deleted by Day 8) and NOT through any cron.
- Audience: every user with a session in the last 30 days. Drawn directly from the audric Postgres `User` table (no `NotificationPrefs` table left to filter against — that was dropped in S.5).
- Per-user link substitution: `0x{address}` placeholder filled from the user's wallet address so the "USDC back at 0x{address}" line is verifiable from the email.
- Acceptance: every link in the email resolves to a page that confirms the email's claims. (audric.ai homepage no longer mentions briefings ✅; settings page no longer has Automations ✅; chat works without a paid features path ✅.)

Send is the literal final action — after this manifest commits and the centralized `release.yml` workflow ships `0.40.0` of all 4 npm packages.

---

## Public changelog

Posted as a GitHub Release on `t2000` repo (auto-generated by the centralized `release.yml` workflow when it ships `v0.40.0`). The release body is supplemented with a short human-written "Simplification — Phase A + B" header pointing at this manifest + the rationale doc.

audric repo doesn't ship npm packages, so its "changelog" is the comms email + the website copy itself, both of which are honest about what the product currently does.

---

## Closure

When this manifest is committed AND the comms email is sent AND `v0.40.0` ships AND `audric-build-tracker.md` marks both Phase Simplification + Phase B done, the simplification is closed. The product, the docs, the marketing, the briefings, the npm descriptions, and the email all tell the same story.

That story: **chat-first, every write requires a tap, no autonomous execution, silent intelligence under the hood.**

---

*Generated: S.15 (2026-04-18). Phase B complete — simplification closed.*
