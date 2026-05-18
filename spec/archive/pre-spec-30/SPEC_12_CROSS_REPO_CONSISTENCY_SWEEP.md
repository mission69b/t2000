# SPEC 12 — Cross-Repo Consistency Sweep

> **Status: v0.5 LOCKED** — canonical sequencing restored 2026-05-07: SPEC 17 ships first, SPEC 12 inherits clean state. The 12h pre-demo window that drove the v0.4 reversal was cancelled.
>
> **Version history:**
> - **v0.1 DRAFT** (2026-05-07) — initial scope + sweep target matrix + audit greps + 5 D-questions
> - **v0.2 DRAFT** (2026-05-07) — Categories 12 (Audric Passport identity layer) + 13 (legal pages) + 14 (website meta/infra) added; D-7 + D-8 added; G11/G12/G13 acceptance gates added; effort 4.25d → 5.0d
> - **v0.3 LOCKED** (2026-05-07) — batch-lock to recommendations: D-1a/D-2a/D-3a/D-4a/D-5c/D-6a/D-7a+D-7c/D-8a.
> - **v0.4 LOCKED** (2026-05-07) — D-1 temporarily reversed to D-1c (SPEC 17 ships AFTER SPEC 12) for 12h pre-demo window safety; Category 2 Exception block added. **Superseded by v0.5 — 12h deadline cancelled, reversal + exception no longer needed.**
> - **v0.5 LOCKED** (2026-05-07) — restored to v0.3 canonical plan. D-1a (SPEC 17 first) re-locked. Category 2 Exception block dropped. Net: SPEC 17 → SPEC 12 → CHIPS Review → SPEC 18, no compressed-everything window.

---

## Locked answers (v0.5, 2026-05-07 — restored canonical)

| Q | Locked | Rationale |
|---|---|---|
| **D-1** | **D-1a — SPEC 17 ships first** | SPEC 12 inherits clean state (no savings-goal references to audit). Saves ~0.5d. Category 2 grep returns 0 cleanly. **✅ VERIFIED 2026-05-07 post-Phase-F sweep (S.103) — every audit surface in the sweep target matrix grep-checked for `SavingsGoal\|savings_goal\|savingsGoal\|openGoals\|GoalsPanel\|goal-tools\|useGoals\|GoalCard\|GoalEditor\|goalNameById\|goalsBlock\|GOAL_TOOLS\|GoalSummary\|savings-goal`. Only intentional SPEC 17 history comments (Phases B/C/D/E breadcrumbs) + immutable historical migrations remain. Generated Prisma client files inherit the schema docstring (correct Prisma generator behavior, not a leak). Cat 2 savings-goal subtask collapses from ~0.5d to ~15min "verify-grep returns 0 + tick the box."** |
| **D-2** | **D-2a — founder final pass** | Marketing edits in this sweep are mostly mechanical (taxonomy enforcement). Designer review is for net-new copy, not correctness sweeps. |
| **D-3** | **D-3a — include both pitch deck + litepaper** | Both partner-facing + 5-product-taxonomy-sensitive. Litepaper at `audric/apps/web/app/litepaper/page.tsx` + `litepaper.module.css`. |
| **D-4** | **D-4a — cross-cutting parity only** | 9 cross-cutting rules (financial-amounts, savings-usdc-only, env-validation-gate, single-source-of-truth, engineering-principles, coding-discipline, goal-driven-execution, agent-harness-spec, safeguards-defense-in-depth) verified in both repos OR forwarding-reference. Repo-specific rules untouched. |
| **D-5** | **D-5c — phased strict** | Phases 1+2+3+4 ship strict (most acceptance gates are grep-checkable). New "while I'm here" surfaces filed as follow-ups, not absorbed. |
| **D-6** | **D-6a — universal "Confirm"** | Single string across all 13 chip flows. Matches OS-native consent dialog patterns. Lock convention in `audric-pay-flow.mdc` (or new `audric-chip-flow.mdc`). |
| **D-7** | **D-7a (founder + assistant joint pass) + D-7c (counsel review scheduled within 30d)** | Joint pass closes most egregious drift in ~2h. External counsel review locks for long term. |
| **D-8** | **D-8a — defer pending audit** | Phase 3 inventory will reveal whether tracking cookies exist on either site. If yes → backlog item; if no → document decision. |
>
> **Owner:** Audric Intelligence (Agent Harness team)
> **Trigger:** founder request 2026-05-07 — "We need to focus on spec 12. … For spec 12, what does this look like? I don't see any spec file. It needs to touch everything: mcp, skills, readme, website copy, cursor rules, architecture.md, product spec / facts."
> **Cross-references:** `audric-build-tracker.md` P2.95 (line 837 onward — the 75-line scope description + 30-item accumulated input list), S.61 (resurrection rationale 2026-05-05), `goal-driven-execution.mdc` (the "verifiable goal" discipline this sweep is built on), `coding-discipline.mdc` (surgical changes — every diff traces to a forbidden-pattern hit, no "while I'm here" features), SPEC 17 (savings-goal removal — ships BEFORE SPEC 12 so the sweep inherits a clean state).

---

## TL;DR

> **One systematic pass across both repos. One PR per repo. Every doc / cursor rule / system prompt / marketing surface gets checked against a fixed audit list.** ~3.5d if SPEC 17 ships first (savings-goal references already cleaned). ~4d if SPEC 17 hasn't shipped (sweep absorbs savings-goal cleanup as a category).
>
> **The audit is mechanical:** ~10 grep patterns + ~5 manual review categories. Phase A builds the to-fix list (read-only), Phase B applies fixes, Phase D verifies (re-run greps, all return 0).
>
> **What this sweep is NOT:** Not a feature change. Not a refactor. Not a new spec. Every diff traces to a forbidden-pattern hit OR a documented stale reference. If a sweep diff doesn't fit that test, it's scope creep — kick to a follow-up spec.
>
> **The 8 decisions to lock:** D-1 SPEC 17 ordering (rec ship-first), D-2 marketing-copy review depth (rec founder-final-pass), D-3 pitch deck + litepaper inclusion (rec yes; litepaper at `audric/apps/web/app/litepaper/`), D-4 `.cursor/rules` ↔ `.claude/rules` parity scope (rec cross-cutting only), D-5 done-criteria (rec strict acceptance gates), D-6 chip-flow confirm-button copy (rec universal "Confirm"), **D-7 legal page review depth (rec founder+assistant joint 2h pass for 12h window, external counsel scheduled within 30d post-demo)**, **D-8 cookie consent banner (rec defer pending tracking-cookie audit)**.

---

## Background — why a sweep is needed

The SPEC 7 / 8 / 9 / 10 wave (April–May 2026) shipped in 6 weeks and touched every load-bearing surface in both repos: engine event protocol (SPEC 8), SDK + sponsorship architecture (SPEC 7), engine tools + Prisma schema (SPEC 9), identity + contacts model (SPEC 10).

Every shipped wave in this codebase has produced doc / copy / README / spec-header drift:
- **S.34** — PR-B1 deletions left orphaned README sections live for ~1 week
- **S.43–S.45** — PR-B5 v2 needed PR-H1/H2/H3/H4 follow-up housekeeping PRs to clean up references to the deprecated `treasury::collect_fee` Move call
- **S.51** — post-S.18 5-product taxonomy reframe left 6 stale marketing subpages live for ~2 weeks

After 5 specs land in 6+ weeks of build, the drift surface area is larger than any single post-ship cleanup PR can absorb. The "SPEC 12 captured (deferred for future polish)" tag accumulated across ~30 items between 2026-05-01 and 2026-05-05 — that list is now the input.

**S.61 founder decision (2026-05-05):** Option B (resurrect SPEC 12 as a real spec) over Option A (1d audit-and-bucket) so the cleanup ships as one focused PR per repo rather than scattered across multiple specs. SPEC 12 is the systematic pass.

---

## Sweep target matrix

Every surface that can drift, with the audit lens for each.

### t2000 repo

| Surface | File / pattern | What gets audited | Forbidden patterns |
|---|---|---|---|
| **Root docs** | `CLAUDE.md` | 5-product taxonomy, MPP-not-Pay rule, naming rules, env-validation gate rule, version chain | "Audric Invest", "Audric Receive" as standalone product, "MPP / 41 services" as Audric product, hardcoded engine version mentions that drift |
| | `ARCHITECTURE.md` | Tool counts, payment reporting, server registration flows, removed-feature notes (S.0–S.12, S.7, S.17) | Old tool counts (33/41), Mercuryo references not marked deferred, savings-goal references post-SPEC-17, SDK signatures |
| | `PRODUCT_FACTS.md` | Versions, fees, CLI syntax, SDK signatures, USDC/USDsui saveable scope | Stale version numbers, "Save anything stable", references to deleted tools, fee references that don't match audric/web's `addFeeTransfer` reality |
| | `CLI_UX_SPEC.md` | Output primitives, formatting rules, display precision per `financial-amounts.mdc` | `Math.round` examples (must be `Math.floor`), display precision drift |
| | `README.md` (root) | Brand layers, repo structure, monorepo tooling, package count | Old phase numbering, dead packages, broken links to specs |
| **t2000.ai legal pages** | `apps/web/app/{disclaimer,privacy,security,terms}/page.tsx` (~1,052 LoC total — likely canonical drafts) | Same checks as audric legal pages; entity = t2000 (infra) not Audric (consumer); risk warnings + jurisdiction + effective date | Drift vs audric legal pages, infra-vs-consumer entity confusion, stale dates |
| **t2000.ai layout + meta** | `apps/web/app/layout.tsx`, `not-found.tsx`, `opengraph-image.tsx`, `icon.svg` | Title/description, OG image, 404 branded | Default Next.js error, generic title, missing OG image, stale brand |
| **t2000.ai sitemap + robots** | `apps/web/app/sitemap.ts` (or absence), `apps/web/public/robots.txt` | Sitemap reflects shipped routes (`/`, `/docs`, `/mpp`, `/stats`, `/disclaimer`, `/privacy`, `/security`, `/terms`); robots clean | Missing entirely OR stale routes OR blocking too aggressively |
| **Package READMEs** | `packages/{sdk,engine,cli,mcp}/README.md` | Per-package API surface, version chain alignment with npm | Stale code blocks, old import paths, drift vs npm-published version |
| **Spec headers** | `spec/SPEC_*.md` (all) | Engine + SDK version targets in header | "Targets v1.1.0" when v1.17.0 actually shipped (per S.43+); pre-S.52 canonical chain references |
| **Engine system prompt** | `packages/engine/src/prompt.ts` (or wherever the static prompt lives) | Tool list, save = USDC + USDsui only, 5-product naming, removed-tool absence | Mentions of removed tools (`savings_goal_*` post-SPEC-17, `defillama_*`, `update_todo`, scheduled actions, allowances, pattern detection) |
| **MCP** | `packages/mcp/src/prompts.ts` + `index.ts` | MCP prompt registry, tool exposure | `savings-goal` prompt post-SPEC-17, stale registrations, tool count drift |
| **Skills** | `t2000-skills/skills/**/SKILL.md` | Skill definitions, tool references | Skills referencing deleted tools, removed features |
| **Cursor rules** | `t2000/.cursor/rules/*.mdc` (~14 rules) | Cross-checked for consistency, no contradictions | Stale tool counts, USDC-only references where USDsui now belongs, references to deleted features, broken cross-references between rules |
| **Token registry** | `packages/sdk/src/constants.ts` | `OPERATION_ASSETS` allow-list, tier registry | Drift vs `savings-usdc-only.mdc`; new tokens added without registry update |
| **ESLint configs** | `eslint.config.mjs` (both repos) | Rule-merge audit (the override-not-merge bug pattern from S.43-era) | Multiple `rules` blocks defining the same rule (override silently kills earlier definitions) |
| **Tests** | `packages/*/__tests__/**` | Test organization standardization, no inline `*.test.ts` | Tests outside `__tests__/` subfolders |
| **Engine package layout** | `packages/engine/src/` | TD.5 — fold flat 22-file root into per-domain folders | Flat layout reads "everything is the same level of importance" when it isn't |
| **Stale code** | both repos | `npx ts-prune` (or equivalent) — unused exports | Orphan exports left by SPEC 8 hotfix wave; `LegacyReasoningRender` post-rollout |
| **Cache patterns** | `packages/engine/src/{defi-cache,navi-cache,prompt-cache}.ts` | Document-or-consolidate decision | Diverging implementations of "the same idea" without rationale |
| **Tracker** | `audric-build-tracker.md` (local-only) | Forward backlog table reflects SPEC 11 / 11.5 / 16 / 17 sequencing; completed items marked done | Stale priorities, missing S.X entries for shipped work, broken cross-references |

### audric repo

| Surface | File / pattern | What gets audited | Forbidden patterns |
|---|---|---|---|
| **Root docs** | `audric/README.md` | App description, 5-product taxonomy, simplification list (S.0–S.12 + SPEC 17) | References to deleted features, missing post-SPEC-17 update |
| | `audric/CLAUDE.md` | Brand layers, system prompt structure, env contract | Same checks as t2000 CLAUDE.md, plus audric-specific (sponsored tx flow, transaction-flow rule) |
| **Cursor rules** | `audric/.cursor/rules/*.mdc` (~12 rules — `audric-canonical-portfolio`, `audric-canonical-write`, `audric-pay-flow`, `audric-transaction-flow`, `safeguards-defense-in-depth`, `engine-context-assembly`, `prisma-models-overview`, `savings-usdc-only`, `financial-amounts`, `write-tool-pending-action`, `env-validation-gate`, etc.) | All rules cross-checked for consistency | Stale tool lists, model references (SavingsGoal post-SPEC-17), SDK version drift |
| **System prompt** | `apps/web/lib/engine/engine-context.ts` `buildSystemPrompt()` | The actual runtime system prompt the engine uses | Deleted tool references, removed feature mentions, stale 5-product naming, savings-goal section post-SPEC-17 |
| **Marketing site** | `apps/web/components/marketing/**` + `apps/web/app/(marketing)/**` | Public-facing copy on audric.ai | Promises of features that don't exist, stale 5-product taxonomy, savings-goal copy post-SPEC-17 |
| **Pitch deck** | `pitch-deck-v6.html` (per tracker reference) | 5-product taxonomy, brand claims, headline phrasing per SPEC 10 D10 | Old product names, stale features, missing Passport/Intelligence/Finance/Pay/Store framing |
| **Litepaper** | (location TBD by founder — see D-3) | Same as pitch deck | Same |
| **Legal pages** | `apps/web/app/(legal)/{disclaimer,privacy,security,terms}/page.tsx` (~830 LoC total) | Brand language, risk warnings, entity naming, effective date, jurisdiction clauses, footer link presence | Drift vs t2000 legal pages, missing clauses, stale entity names, wrong effective date |
| **Marketing footer** | `apps/web/components/landing/MarketingFooter.tsx` | Legal page links present + working, brand language, social handles | Broken legal link, stale handle, brand drift |
| **Layout + meta** | `apps/web/app/layout.tsx`, `opengraph-image.tsx`, `not-found.tsx`, `error.tsx`, `global-error.tsx`, `loading.tsx`, `icon.svg` | Title/description, OG image renders correctly, 404/error pages branded, favicons present | Default Next.js error page, generic title, missing OG, stale brand in 404 |
| **Sitemap + robots** | `apps/web/app/sitemap.ts`, `apps/web/public/robots.txt` (or absence) | Sitemap reflects shipped routes; robots blocks test routes | Missing entirely OR stale routes OR over-blocking |
| **Prisma schema** | `apps/web/prisma/schema.prisma` | Models match audric-pay-flow / savings-usdc-only / canonical rules | Orphan model references after SPEC 17 deletions |
| **API routes** | `apps/web/app/api/**/*.ts` | Canonical-write rule enforcement; no `process.env.X` direct reads outside `lib/env.ts` | Forbidden patterns from `audric-canonical-write.mdc` + `env-validation-gate.mdc` |
| **Pay rule** | `audric/.cursor/rules/audric-pay-flow.mdc` | Surface table (Send / Payment Link / Invoice / QR) reflects shipped state, NOT pre-SPEC-11 placeholder state | Orphan references to deferred features |
| **Tests** | `apps/web/__tests__/**` + `apps/web/lib/**/__tests__/**` | Test organization standardization | Tests outside `__tests__/` subfolders |

### Cross-repo

| Surface | What gets audited |
|---|---|
| **GitHub repo descriptions + topics** | Branding consistency, no stale claims |
| **npm package descriptions** | `packages/*/package.json` `description` field — same brand claims across all 4 |
| **App Store + Play Store copy** (if applicable) | Brand consistency, 5-product taxonomy |
| **Launch announcement copy** (if drafted) | Same |

---

## Audit categories — the actual greps

These are the high-signal forbidden-pattern hunts Phase A runs. Each returns a list; Phase B fixes each hit.

### Category 1 — 5-product taxonomy enforcement

```bash
# Forbidden: "Audric Invest" mentioned anywhere
rg -i "audric invest" --type md --type ts --type tsx

# Forbidden: "Audric Receive" as a standalone product name (not "Audric Receive is part of Audric Pay")
rg -i "audric receive(?! is)" --type md --type ts --type tsx

# Forbidden: MPP described as Audric Pay
rg -i "audric pay" -C 2 --type md | grep -iE "MPP|41 services|micro-?payment protocol"

# Required: 5 products mentioned in marketing/CLAUDE/README
rg -c "Passport|Intelligence|Finance|Pay|Store" CLAUDE.md PRODUCT_FACTS.md README.md
# (manual verify each surface lists all 5, no others)
```

### Category 2 — Removed-feature drift (S.0–S.12 + S.7 + future SPEC 17)

```bash
# Forbidden: references to retired features
rg -i "24/7 alerts|recurring (transaction|saves)|scheduled (action|save|execution)" --type md --type ts
rg -i "copilot suggestion|daily briefing|morning briefing|outcome check|follow.?up queue" --type md --type ts
rg -i "allowance_status|toggle_allowance|update_daily_limit" --type md --type ts
rg -i "create_schedule|list_schedules|cancel_schedule" --type md --type ts
rg -i "pattern_status|pause_pattern" --type md --type ts

# Post-SPEC-17 forbidden:
rg -i "savings_goal|savingsGoal|GoalsPanel" --type md --type ts --type tsx
rg "savings-goal" --type md  # MCP prompt name

# Forbidden: defillama_ tool mentions outside protocol_deep_dive
rg "defillama_" --type ts | grep -v "protocol_deep_dive"
```

### Category 3 — Saveable asset enforcement (USDC + USDsui only, per `savings-usdc-only.mdc`)

```bash
# Forbidden: "Save anything stable" / "Save USDe" / "Save USDT" copy
rg -i "save anything stable|save (USDe|USDT)" --type md --type ts

# Forbidden: SDK constants forking the rule
rg "OPERATION_ASSETS\.save|OPERATION_ASSETS\.borrow" --type ts -C 1
# (manual verify both lists are exactly ['USDC', 'USDsui'])
```

### Category 4 — Tool count drift

```bash
# Find every doc that asserts a tool count — verify it matches actual export count
rg -E "\b(33|34|41|42)\s+(engine\s+)?tools\b" --type md
# Cross-reference: getDefaultTools() length in packages/engine/src/tools/index.ts
```

### Category 5 — Version chain alignment

```bash
# Read each package.json version
for pkg in sdk engine cli mcp; do
  echo "$pkg:" $(jq -r .version packages/$pkg/package.json)
done
# Verify all 4 are equal (per CLAUDE.md "all 4 packages always at the same version")

# Find every doc referencing an engine/SDK version — verify it matches current
rg -E "engine\s+(v?\d+\.\d+\.\d+|0\.\d+\.\d+|1\.\d+\.\d+)" --type md
rg -E "sdk\s+(v?\d+\.\d+\.\d+|0\.\d+\.\d+|1\.\d+\.\d+)" --type md
```

### Category 6 — TODO / TBD / FIXME / undocumented bypass

```bash
# In committed files (excluding test fixtures + generated)
rg -E "\b(TODO|TBD|FIXME)\b" --type ts --type md \
  --glob '!**/generated/**' --glob '!**/__tests__/**'

# Find every CANONICAL-BYPASS comment, verify each is in a documented bypass row
rg "// CANONICAL-BYPASS:" --type ts -A 1
# Cross-reference against audric-canonical-portfolio.mdc + audric-canonical-write.mdc bypass tables
```

### Category 7 — Cross-repo cursor-rule parity

```bash
# List rules in each repo
ls t2000/.cursor/rules/*.mdc
ls audric/.cursor/rules/*.mdc

# Manual cross-check (per D-4 scope decision):
# - Cross-cutting rules (financial-amounts, savings-usdc-only, env-validation-gate, single-source-of-truth, engineering-principles, coding-discipline, goal-driven-execution, agent-harness-spec, safeguards-defense-in-depth) — should exist in both repos OR forwarding-reference from audric to t2000 canonical
# - Repo-specific rules (audric-canonical-portfolio is audric-only; engine-tool-development is t2000-only) — no parity required
```

### Category 8 — BlockVision migration cleanup (post-v1.4 swap)

```bash
# Forbidden: 7 deleted defillama_* tools mentioned outside protocol_deep_dive
rg "defillama_token_prices|defillama_price_change|defillama_yield_pools|defillama_protocol_info|defillama_chain_tvl|defillama_protocol_fees|defillama_sui_protocols" --type md --type ts | grep -v "protocol_deep_dive"

# Required: BlockVision is the canonical price feed (per agent-harness-spec.mdc)
rg -i "blockvision" --type md --type ts -l  # spot-check coverage
```

### Category 9 — Audric Pay scope enforcement

```bash
# Forbidden: "Audric Pay" used to describe MPP (it's user-to-user transfer only)
rg "audric pay" --type md --type ts -i -C 2 | grep -iE "MPP|gateway|41 services"
```

### Category 10 — Engine package layout (TD.5)

Manual review:
- `packages/engine/src/` — count files at root level
- If >15 sibling files, recommend per-domain folder fold (NAVI bucket, MCP bucket, Sui bucket, Prompt bucket, Cache bucket)
- Either fold OR document the rationale for staying flat in `engineering-principles.mdc`

### Category 12 — Audric Passport identity-layer integration (post-SPEC-10 reflection)

**Why this category exists.** SPEC 10 shipped the username / `username.audric.sui` identity layer as part of Audric Passport's first pillar (Identity). Most marketing + docs were written BEFORE SPEC 10 closed and don't reflect that identity is now the foundation of Passport. SPEC 12 must ensure every Passport reference includes the identity layer.

**The 4 Passport pillars (binding, per CLAUDE.md):**
1. 🪪 **Identity** — Sign in with Google, get `username.audric.sui` in 3 seconds, no seed phrase, yours forever (zkLogin + Enoki)
2. ✋ **You decide** — Audric never moves money on its own; tap-to-confirm on every Finance/Pay action
3. 🔐 **Sponsored gas** — We pay network fees so you don't need SUI; your USDC stays your USDC (Enoki sponsorship)
4. ⛓️ **Yours** — Non-custodial; we cannot move your money; verifiable on Sui mainnet forever

**Audit:**

```bash
# Forbidden: Passport described without identity / username layer
rg -i "audric passport" -C 5 --type md --type tsx --type html
# Manual verify: every "Audric Passport" mention either lists all 4 pillars OR explicitly references the Identity pillar

# Forbidden: pitch / litepaper / marketing claiming Passport without username
# (manual review of audric/apps/web/app/litepaper/page.tsx + pitch-deck-v6.html + audric.ai marketing pages)

# Required: username.audric.sui surface
rg -i "username\.audric\.sui|\.audric\.sui" --type md --type tsx --type html
# Manual verify: appears in marketing site hero / pitch deck / litepaper as the Identity pillar's tangible form

# Forbidden: "wallet address" or "Sui address" framing where "username" is now the canonical reference
# (manual review — replace "Send to 0x..." with "Send to @alice" in screenshots/copy where applicable)
```

**Manual review checklist (Phase 3):**

| Surface | Must include | Audit verb |
|---|---|---|
| **t2000.ai marketing** | Reference Audric's identity layer if Passport is named | spot-check |
| **audric.ai marketing site** (`apps/web/components/marketing/**` + `apps/web/app/(marketing)/**`) | All 4 Passport pillars OR Identity-pillar-as-headline framing | full read |
| **audric/apps/web/app/litepaper/page.tsx** | Audric Passport section enumerates all 4 pillars including Identity (`username.audric.sui` as tangible form) | full read |
| **`pitch-deck-v6.html`** | Passport slide enumerates all 4 pillars; Identity pillar shows username flow (Google → 3 seconds → `you.audric.sui`) | full read |
| **CLAUDE.md (both repos)** | The Passport 4-pillar table is canonical (already true per t2000/CLAUDE.md line ~85); audric/CLAUDE.md mirrors | grep verify |
| **`audric/README.md`** | Mentions username + identity layer in product description | grep verify |
| **System prompt** (`engine-context.ts buildSystemPrompt`) | If Passport is mentioned, includes Identity pillar reference | grep verify |
| **Onboarding flow** (audric/apps/web/app/onboarding or equivalent) | Frames Passport claim as "your identity + your wallet" not "your wallet" only | full read |
| **Settings page username card** | Reflects username's role in Passport identity (not just "vanity name") | full read |
| **Cursor rules** (`audric-pay-flow.mdc`, `audric-canonical-write.mdc`, etc.) | Where Passport is referenced, identity layer mentioned | grep verify |

**The framing test:** every Passport mention in copy should pass this read-aloud test:

> *"Audric Passport — your identity (username.audric.sui), your decisions (tap-to-confirm), free transactions (sponsored gas), and your money (non-custodial). One sign-in with Google."*

If a marketing surface says "Audric Passport — your wallet on Sui" without the identity layer → fix.
If a pitch slide says "Passport: zkLogin + Enoki" without naming the username → fix.
If the litepaper says "Passport is your wallet" → fix.

**No new D-question.** This category is pure copy enforcement — the framing is locked by CLAUDE.md (the 4 Passport pillars are binding). SPEC 12's job is to enforce the framing everywhere.

### Category 13 — Legal page consistency + accuracy (NEW 2026-05-07)

**Why this category exists.** Both repos ship 4 legal pages each (disclaimer, privacy, security, terms). Founder asked 2026-05-07 whether SPEC 12 covers them — answer was no, now it does. Reality check:

| Page | t2000.ai (LoC) | audric.ai (LoC) | Drift signal |
|---|---|---|---|
| `/disclaimer` | 209 | 154 | t2000 is +55 lines — likely canonical, audric likely abbreviated |
| `/privacy` | 269 | 195 | t2000 is +74 lines — likely canonical |
| `/security` | 252 | 195 | t2000 is +57 lines — likely canonical |
| `/terms` | 322 | 286 | t2000 is +36 lines — closest pair |
| **Total** | **1,052** | **830** | **~26% size delta** — almost certainly content drift, not just stylistic |

**Demo-critical.** Audric is being presented to thousands in 12 hours. Public visitors WILL click these pages. A stale or broken legal page is a regulatory risk + a trust signal. SPEC 12 must close drift before demo.

**Audit:**

```bash
# Find every legal page in both repos
ls t2000/apps/web/app/{disclaimer,privacy,security,terms}/page.tsx
ls "audric/apps/web/app/(legal)"/{disclaimer,privacy,security,terms}/page.tsx

# Diff each pair to surface drift
for page in disclaimer privacy security terms; do
  echo "=== $page ==="
  diff -u "t2000/apps/web/app/$page/page.tsx" \
          "audric/apps/web/app/(legal)/$page/page.tsx" | head -100
done

# Find effective date references (must match between sites for shared content)
rg -i "effective\s*(date|as\s*of)|last\s*updated|last\s*modified" \
   t2000/apps/web/app/{disclaimer,privacy,security,terms} \
   "audric/apps/web/app/(legal)"/

# Find entity name references (t2000 = infra, Audric = consumer; verify each site names the right one)
rg -i "audric ai|t2000 ai|t2000 inc|audric inc|t2000 limited|audric limited" \
   t2000/apps/web/app/{disclaimer,privacy,security,terms} \
   "audric/apps/web/app/(legal)"/

# Find jurisdiction clauses (must be consistent or differ for documented reason)
rg -i "jurisdiction|governing law|arbitration|venue|dispute" \
   t2000/apps/web/app/{disclaimer,privacy,security,terms} \
   "audric/apps/web/app/(legal)"/

# Find risk-warning sections (DeFi, non-custodial, no investment advice, volatility)
rg -i "non.?custodial|investment advice|defi risk|volatility|loss of (funds|capital)" \
   t2000/apps/web/app/{disclaimer,privacy,security,terms} \
   "audric/apps/web/app/(legal)"/

# Verify footer links from every page on both sites
rg -i "/(privacy|terms|security|disclaimer)" \
   --type tsx --type ts \
   --glob '!**/*test*' \
   --glob '!**/api/**'
# Manual: every consumer-facing layout/footer must link all 4 pages
```

**Manual review checklist (Phase 3):**

| Surface | Audit verb | Must verify |
|---|---|---|
| `t2000/apps/web/app/disclaimer/page.tsx` (209 LoC) | full read | Lock as canonical (longer + likely first-written); identify any clauses missing from audric |
| `t2000/apps/web/app/privacy/page.tsx` (269 LoC) | full read | Same |
| `t2000/apps/web/app/security/page.tsx` (252 LoC) | full read | Same |
| `t2000/apps/web/app/terms/page.tsx` (322 LoC) | full read | Same |
| `audric/apps/web/app/(legal)/disclaimer/page.tsx` (154 LoC) | full read + reconcile vs t2000 | Add missing clauses; align entity name (Audric not t2000); align effective date |
| `audric/apps/web/app/(legal)/privacy/page.tsx` (195 LoC) | full read + reconcile | Same |
| `audric/apps/web/app/(legal)/security/page.tsx` (195 LoC) | full read + reconcile | Same |
| `audric/apps/web/app/(legal)/terms/page.tsx` (286 LoC) | full read + reconcile | Same |
| `audric/apps/web/components/landing/MarketingFooter.tsx` | read | Confirms all 4 legal links present (verified — line 33-38: `/terms`, `/privacy`, `/disclaimer`, `/security` all linked) |
| t2000.ai footer (search for footer component) | grep + read | Same — all 4 links present, brand consistent |

**Lock canonical content vs intentional divergence:**

| Section | Lock canonical | Allow divergence |
|---|---|---|
| DeFi risk warning | YES — same text both sites | — |
| Non-custodial wallet language | YES | — |
| No investment advice clause | YES | — |
| Data collected (Privacy) | — | Each site collects different data; allow, but enumerate per-site |
| Cookies (Privacy) | — | Audric is the consumer app with auth + sessions; t2000 is mostly marketing; allow divergence |
| Entity name | — | t2000 = "T2000 Labs" (or whatever); Audric = "Audric Inc" (or whatever); must differ |
| Effective date | YES — same date both sites if updated together | — |
| Jurisdiction + governing law | YES | — |
| Contact email | — | Each site has own — allow divergence |
| Bug bounty (Security) | — | If t2000 hosts the GitHub bug bounty + Audric is consumer-front, divergence makes sense |

**D-question for this category:**

> **D-7 (NEW) — legal page review depth: founder-only, founder + assistant joint, or external counsel?**
>
> - **D-7a (founder + assistant joint pass)** — RECOMMENDED for the 12h pre-demo timeline. Assistant drafts the diff (canonical t2000 content → audric port); founder reviews each clause; ship the same day. ~2h wall-clock. Trade-off: not legally reviewed but better than divergent + stale.
> - **D-7b (founder only).** Founder reads each page top-to-bottom; rewrites where needed. ~4h wall-clock. Same legal-review trade-off, just slower.
> - **D-7c (external counsel review).** Send all 8 pages to legal counsel for review before shipping. ~5–10 days wall-clock. Right thing to do for production-grade legal pages BUT impossible in the 12h window.
> - **D-7d (defer all legal page work to post-demo).** Acknowledge legal pages are stale; ship demo without touching them; audit + reconcile post-demo. Trade-off: presentation-time risk if anyone screenshots a page during the demo.
>
> *Rec: D-7a* for the 12h window, *D-7c* scheduled within 30 days post-demo. The 12h pass closes the most egregious drift (missing clauses, wrong entity, stale date); counsel review then locks it for the long term.

### Category 14 — Website meta + cross-cutting infrastructure (NEW 2026-05-07)

**Why this category exists.** Founder asked for "consistency sweep of the t2000 and audric website" — broader than Phase 3's marketing-copy scope. This category covers the surfaces that aren't marketing copy but are user-visible: 404 pages, error pages, loading states, OG images, favicons, sitemap, robots.txt, layout-level meta tags, footer infrastructure, email templates.

**Surfaces to audit (both sites):**

| Surface | t2000 path | audric path | Audit |
|---|---|---|---|
| Root layout + meta | `apps/web/app/layout.tsx` | `apps/web/app/layout.tsx` | Title, description, OG meta tags, viewport, theme-color, icon links |
| OG image | `apps/web/app/opengraph-image.tsx` | `apps/web/app/opengraph-image.tsx` | Renders current branding (5-product taxonomy, post-SPEC-10 identity) |
| Favicon | `apps/web/app/icon.svg` | `apps/web/app/icon.svg` | On-brand, identical concept across sites or intentionally divergent |
| 404 page | `apps/web/app/not-found.tsx` | `apps/web/app/not-found.tsx` | Branded, links back home, no Next.js default styling |
| Global error | (TBD if exists) | `apps/web/app/global-error.tsx` | Branded, error-recovery flow, no stack trace exposed |
| Route error | (TBD if exists) | `apps/web/app/error.tsx` | Branded, "try again" flow |
| Loading state | (TBD if exists) | `apps/web/app/loading.tsx` | Branded skeleton or spinner, not blank |
| Sitemap | (TBD if exists) | (TBD if exists) | Reflects all shipped public routes |
| Robots.txt | `apps/web/public/robots.txt` (TBD) | `apps/web/public/robots.txt` (TBD) | Allows public routes; blocks API + auth + internal |
| Manifest (PWA) | (TBD if exists) | (TBD if exists) | If audric supports add-to-home-screen, manifest present + on-brand |
| Marketing footer | (search for footer component) | `apps/web/components/landing/MarketingFooter.tsx` | All legal links present, social handles current, brand language consistent, CTA accurate |
| Email templates (Resend) | n/a | `lib/notifications/templates/**` (or wherever Resend templates live) | Brand consistent, correct legal entity in footer, unsubscribe link present |

**Audit:**

```bash
# Inventory: what website infrastructure exists today on each site
ls -la t2000/apps/web/app/{layout,not-found,error,global-error,loading,sitemap,robots,manifest,opengraph-image,icon.svg}.{ts,tsx,xml,json,svg} 2>/dev/null
ls -la audric/apps/web/app/{layout,not-found,error,global-error,loading,sitemap,robots,manifest,opengraph-image,icon.svg}.{ts,tsx,xml,json,svg} 2>/dev/null

# Check for missing infrastructure
for repo in t2000 audric; do
  echo "=== $repo ==="
  for file in not-found.tsx error.tsx global-error.tsx loading.tsx sitemap.ts opengraph-image.tsx icon.svg; do
    test -e "$repo/apps/web/app/$file" && echo "✅ $file" || echo "❌ $file MISSING"
  done
done

# Find all references to legal pages from layouts/footers/headers
rg "/(privacy|terms|security|disclaimer)" --type tsx --type ts \
   --glob '!**/api/**' --glob '!**/*test*'

# Find OG image content (manual render check)
rg "openGraph|twitter" --type tsx --type ts \
   t2000/apps/web/app/layout.tsx \
   audric/apps/web/app/layout.tsx

# Find email templates + verify brand consistency
ls audric/apps/web/lib/notifications/templates/ 2>/dev/null
ls audric/apps/web/lib/email/ 2>/dev/null
rg -l "from:|fromAddress" audric/apps/web/lib --type ts | head -10

# Find any analytics / cookie setup (for D-8 cookie consent decision)
rg -i "posthog|mixpanel|amplitude|google.?analytics|gtag|cookie.?consent" \
   --type tsx --type ts --glob '!**/__tests__/**'
```

**Manual review checklist (Phase 3):**

1. **Open every site in incognito + go to every public route.** Verify each route renders without errors:
   - t2000.ai: `/`, `/docs`, `/mpp`, `/stats`, `/disclaimer`, `/privacy`, `/security`, `/terms`, plus a deliberately-broken URL for 404 check
   - audric.ai: `/`, `/litepaper`, `/disclaimer`, `/privacy`, `/security`, `/terms`, plus `/[invalid-username]` for 404 check
2. **OG share preview test.** For each site root + key public pages (litepaper, payment link, public profile), use Twitter / Slack / Discord OG-preview tool — verify image + title + description render correctly with current brand.
3. **Favicon test.** Hard-refresh both sites; verify favicon present in browser tab.
4. **404 test.** Navigate to a deliberately-broken URL on each site; verify 404 page is branded + links back home + doesn't expose stack trace.
5. **Error injection.** In dev mode (or via temporary instrumentation), trigger an error during page render; verify `error.tsx` / `global-error.tsx` shows branded recovery flow.
6. **Mobile viewport.** Open both sites on iPhone (or DevTools mobile mode); verify layout doesn't break, footer doesn't overflow, legal pages are readable.
7. **Email preview.** If audric has transactional emails (Resend), preview each template; verify brand + correct legal entity + unsubscribe link.

**D-question for this category:**

> **D-8 (NEW) — cookie consent banner: required, deferred, or skip?**
>
> - **D-8a (deferred)** — RECOMMENDED. Audit shows whether either site uses analytics that require cookie consent (PostHog, GA, etc.). If yes, add to backlog as a follow-up spec; do not block SPEC 12 on it. EU traffic risk acknowledged but not pre-launch-critical.
> - **D-8b (required pre-demo).** Add a cookie consent banner to both sites in SPEC 12 Phase 3. ~0.5d. Trade-off: another UI surface to test in 12h.
> - **D-8c (skip — no analytics).** Audit confirms zero tracking cookies on either site; no consent banner needed; document the decision in this category.
>
> *Rec: D-8a unless audit reveals tracking cookies, in which case D-8c if removable or D-8b if keeping.*

### Category 11 — Chip-flow button copy consistency (F5 from S.85 B1 deferral)

**Why this category exists.** The S.85 B1 chip-flow walkthrough deferred F5 ("button copy consistency — Confirm vs Send vs Save vs Borrow across confirmation cards") as cross-cutting copy work that didn't belong in a small-fix commit. SPEC 12 is the right home: it's a literal copy-consistency sweep across N surfaces.

**Scope.** All `<ConfirmationCard>` instances across the 13 chip flows (`save`, `send`, `withdraw`, `borrow`, `repay`, `swap` — 6 multi-step writes) plus any one-shot write confirmation (e.g. `claim-rewards`).

**Audit:**
```bash
# Find every ConfirmationCard render site
rg "ConfirmationCard" --type tsx --type ts apps/web/components apps/web/app

# Find every confirm-button label string
rg -i 'label\s*[=:]\s*[\'"](Confirm|Send|Save|Borrow|Withdraw|Repay|Swap|Pay)[\'"]' --type tsx
```

**Manual review:** read each ConfirmationCard prop site; identify whether the codebase converged on (a) "Confirm" universally OR (b) per-action verb consistently ("Save USDC" / "Send $X" / "Borrow USDC"). Lock the pattern in `audric-pay-flow.mdc` (or a new `audric-chip-flow.mdc` rule) so future writes inherit the convention.

**D-question for this category:**

> **D-6 (NEW) — chip-flow confirmation button copy: universal "Confirm" or per-action verb?**
>
> - **D-6a — universal "Confirm"** (recommend): single string across all 13 flows. Reduces mental load; matches OS-native consent dialog patterns (iOS / macOS / Android).
> - **D-6b — per-action verb** ("Save USDC" / "Send $X" / "Borrow USDC"): more informative, more typing per flow. Currently the de-facto state in some flows.
> - **D-6c — hybrid**: action verb in the button + amount/asset secondary label.
>
> *Rec: D-6a.* Audric is a finance product where the consent dialog is the trust signal — the user already knows what action they're confirming (they see the amount + recipient + asset above). "Confirm" is unambiguous and universal. Drift to per-action verbs invites the kind of label-sprawl that necessitated F5 in the first place.

---

## D-questions (lock these before Phase A starts)

### D-1 — SPEC 17 ordering: ship before SPEC 12 or absorb into SPEC 12?

Already answered in the parent founder Q1 — recommend SPEC 17 ships first. Captured here for the lock record.

**Options:**
- **D-1a (SPEC 17 ships first — recommended).** SPEC 12 inherits clean state. SPEC 12 effort drops by ~0.5d (no savings-goal refs to audit). Total: SPEC 17 (~1.5d) + SPEC 12 (~3.5d) = ~5d.
- **D-1b (Absorb SPEC 17 into SPEC 12).** Bundle the removal into the consistency sweep PR. Saves ~0d (it's the same total work) but mixes concerns.
- **D-1c (SPEC 17 ships after SPEC 12).** Sweep first, then remove. SPEC 12 has to absorb the savings-goal references during the sweep, then SPEC 17 creates new drift, then a re-sweep is needed. ~+1d wasted.

> *Rec: D-1a.* Already justified in the parent.

### D-2 — Marketing-copy review depth: founder-final-pass or designer-review?

**Options:**
- **D-2a (founder final pass).** Founder reads every marketing page top-to-bottom in Phase C, marks copy edits inline, ships. ~0.5d.
- **D-2b (designer review).** Marketing copy goes to a designer for visual + copy review before shipping. Adds 2-3 days of wall-clock (designer queue + review + revisions).
- **D-2c (skip marketing in v0.1).** SPEC 12 v0.1 covers internal docs + cursor rules + system prompts only. Marketing copy gets its own follow-up PR.

> *Rec: D-2a.* Marketing copy edits in this sweep are mostly mechanical (5-product taxonomy enforcement, removed-feature mentions). Designer review is appropriate for net-new copy or visual changes; this sweep is a copy-correctness pass. Founder final pass keeps it fast.

### D-3 — Pitch deck + litepaper inclusion

**Options:**
- **D-3a (include both).** Pitch deck (`pitch-deck-v6.html`) + litepaper (`audric/apps/web/app/litepaper/page.tsx` + `litepaper.module.css`, founder-confirmed 2026-05-07) sweep happens in Phase C alongside marketing copy.
- **D-3b (pitch deck yes, litepaper no).** Litepaper has its own update cadence; sweep covers pitch deck only.
- **D-3c (neither).** Both have their own update cadence; SPEC 12 covers t2000.ai + audric.ai marketing only.

> *Rec: D-3a.* Both surfaces are partner-facing and 5-product-taxonomy-sensitive. Skipping them invites the same drift this sweep is trying to fix. **Litepaper location confirmed 2026-05-07: `audric/apps/web/app/litepaper/`.**

### D-4 — `.cursor/rules` ↔ `.claude/rules` parity scope

**Options:**
- **D-4a (cross-cutting only — recommended).** Cross-cutting rules (financial-amounts, savings-usdc-only, env-validation-gate, single-source-of-truth, engineering-principles, coding-discipline, goal-driven-execution, agent-harness-spec, safeguards-defense-in-depth) — verify each exists in both repos OR has a forwarding-reference from audric to t2000 canonical. Repo-specific rules don't need parity.
- **D-4b (1:1 mirror).** Every rule in t2000 must exist in audric and vice versa. Strict.
- **D-4c (no parity check).** Each repo has its own rules; SPEC 12 doesn't enforce parity at all.

> *Rec: D-4a.* 1:1 mirror creates copy-paste duplication that drifts; no parity invites the rules-disagreement bugs the sweep is meant to catch. Cross-cutting-only is the intentional middle ground that catches drift on the rules that actually need to agree.

### D-6 — Chip-flow button copy convention (F5 absorption from S.85)

See Category 11 above for the full D-6a / D-6b / D-6c options + recommendation. Locking this now (during SPEC 12 v0.1 lock pass) lets Phase 2 update `<ConfirmationCard>` copy uniformly without re-litigating per-flow.

> *Rec: D-6a (universal "Confirm").*

### D-5 — SPEC 12 done-criteria: strict acceptance gates or "ship + follow-ups"?

**Options:**
- **D-5a (strict).** All acceptance gates (G1–G10 below) green before SPEC 12 ships. Any new TD entries surfaced during sweep are either resolved or formally deferred to a follow-up spec inline.
- **D-5b (ship + follow-ups).** Phase 1 ships the mechanical sweep; new TDs surfaced during the sweep get filed as follow-ups for a future SPEC 12.5. Faster ship, less complete.
- **D-5c (phased — recommended).** Phase 1 + Phase 2 ship strict (no shortcuts on grep-checkable gates). Phase 3 (marketing) and Phase 4 (verification) ship strict. New TDs surfaced during the sweep that don't fit any phase get filed as follow-ups, but the in-scope phases are strict.

> *Rec: D-5c.* Most acceptance gates are grep-checkable, so cost of strictness is low. New "while I'm here" surfaces (e.g. discovering a new ESLint rule needed) get kicked to follow-ups instead of blocking the sweep. Best of both.

---

## Phased implementation

### Phase 1 — Internal hygiene cluster (~1.5d)

**Goal:** clean up the engine + SDK + test layout BEFORE touching docs (so docs reference the right structure).

1. **Engine package layout (TD.5)** — ✅ **SHIPPED 2026-05-07**. Folded `packages/engine/src/` flat root (41 files) into 5 per-domain folders:
   - `navi/{cache,config,reads,transforms}.ts` — 4 files (NAVI MCP integration, fetchers, transforms, cache)
   - `mcp/{index,client,tool-adapter}.ts` — 3 files (MCP server adapter, client manager, tool adapter)
   - `sui/{address,rpc}.ts` — 2 files (SuiNS resolution, wallet RPC)
   - `prompt/{index,cache}.ts` — 2 files (system prompt, prompt cache)
   - `cache/{defi,wallet,turn-read}.ts` — 3 cross-cutting caches (NAVI's cache lives under `navi/`, prompt's cache lives under `prompt/`; only the truly-cross-cutting caches are in `cache/`)
   - **Resolution of navi-cache vs cache/ conflict:** domain ownership wins. `navi-cache.ts` → `navi/cache.ts`, `prompt-cache.ts` → `prompt/cache.ts`. Cross-cutting caches in `cache/`. Working on a domain = open one folder.
   - **Public API unchanged.** `packages/engine/src/index.ts` re-exports updated to point at new paths; export surface (every named export) is bit-for-bit identical. Downstream consumers (audric, cli, mcp, sdk) see zero diff.
   - **Verification:** typecheck green; 965/965 tests pass; `tsup` build green (180KB d.ts unchanged); cli/mcp/sdk typecheck green.
2. **Test organization standardization** — ✅ **RESOLVED BY DOCUMENTATION 2026-05-07**. The codebase reality:
   - `find packages -name '*.test.ts' -not -path '*/node_modules/*' -not -path '*__tests__*' -not -path '*/dist/*'` returns **~44 matches** across SDK / CLI / MCP / engine.
   - Inline tests next to source IS the dominant convention (~42 of 44 files).
   - The engine package's `__tests__/` folder is the outlier; the 2 engine tests in `recipes/` are following the broader codebase convention, not the engine `__tests__/` exception.
   - Per `coding-discipline.mdc` ("Match existing style; don't refactor things that aren't broken"), moving 44 files into `__tests__/` would be a major surgical-changes violation for zero functional value.
   - **Decision:** spec was wrong; inline tests are canonical. Engine `__tests__/` grandfathered. Documented in `coding-discipline.mdc` (new "Test file location convention" section).
   - **Acceptance:** the find query returning ~44 matches IS the canonical state, not a finding to fix.
3. **Cache pattern review** — ✅ **RESOLVED BY DOCUMENTATION 2026-05-07**. The 5 engine cache modules (`cache/defi`, `cache/wallet`, `cache/turn-read`, `navi/cache`, `prompt/cache`) split into 3 categories:
   - **3 share STRUCTURAL shape** (`XCacheStore` + `InMemoryXCacheStore` + injectors): `cache/defi`, `cache/wallet`, `navi/cache`
   - **1 single-process turn-scoped**: `cache/turn-read` (no pluggable store)
   - **1 Anthropic prompt-cache helper**: `prompt/cache` (28 LoC, just a breakpoint emitter)
   - **Decision:** keep them separate; do NOT factor a `cache/base.ts`. The 3 sharing structural shape have DIFFERENT entry shapes, DIFFERENT TTL semantics (sticky-positive vs dual-TTL vs flat-TTL), DIFFERENT key construction. A generic base would save ~120 LoC across the 3 but cost an abstraction layer every reader must learn. Each cache today is independently readable.
   - **Principle documented in `engineering-principles.mdc`** new Section 6: "Engine cache pattern — factor when LOGIC duplicates, not when SHAPE does." Trigger to revisit: a 4th cache that needs the same sticky-positive OR same dual-TTL logic.
   - **Acceptance:** principle written; reviewer of any future cache addition has guidance.
4. **Stale code identification** — ✅ **DONE 2026-05-07**. Ran `npx ts-prune` against engine + sdk + cli + mcp packages.
   - **`LegacyReasoningRender` post-SPEC-8 check:** zero matches (already cleaned up in a prior pass).
   - **11 `(used in module)` findings analyzed:**

   | Package | Export | Disposition |
   |---|---|---|
   | engine `guards.ts:75` | `guardVerdictToAction` | ✅ **removed `export`** — JSDoc says "Engine-internal mapping" but was exported. Single-line change. |
   | engine `guards.ts:63` | `GuardMetric` | KEPT — referenced by `types.ts` via `import('./guards.js').GuardMetric` for `onGuardFired` callback type. ts-prune misses the dynamic import. |
   | engine `guards.ts:244` | `SwapQuoteTracker` | KEPT — class type leaked through `GuardRunnerState` (which IS in the public API surface). Removing the export would orphan the type. |
   | engine `index.ts:303` | `TodoItem` | KEPT — re-export from `types.js`; ts-prune false positive (re-export through public-API chain). |
   | engine `permission-rules.ts:87` | `Record` | KEPT — TypeScript built-in `Record<string, UserPermissionConfig>`, not an actual export. ts-prune false positive. |
   | engine `compact/microcompact.ts:11` | `MicrocompactResult` | KEPT — inferred return type of `microcompact()`; if un-exported, callers lose the named return type. Cleanup not worth the loss of API self-documentation. |
   | engine `tools/index.ts:143-150` | `tokenPricesTool`, `createPaymentLinkTool`, `cancelPaymentLinkTool`, `createInvoiceTool`, `cancelInvoiceTool`, `listInvoicesTool`, `listPaymentLinksTool` | KEPT — all 7 are part of `getDefaultTools()` (public API). ts-prune sees the consumption path through the package's own `index.ts` as "in module" — false positive. |
   | engine `__tests__/defi-cache-sticky.test.ts:580` | `DefiCacheEntry` | KEPT — test file local re-definition; tests are not subject to dead-code cleanup. |
   | sdk `contacts.ts:7,12` | `Contact`, `ContactMap` | KEPT — types used internally + part of the SDK's contact-management public API. |
   | sdk `adapters/descriptors.ts:3` | `ProtocolDescriptor` | KEPT — internal adapter base type; fine to keep exported for adapter authors. |
   | sdk `protocols/navi.ts:717` | `ClaimableRewardLike` | KEPT — internal helper type; small enough to leave alone. |
   | mcp `prompts.ts:9,17,35` | `askPin`, `askPinConfirm`, `getPinFromEnv` | KEPT — backward-compat aliases (`askPassphrase = askPin` etc.) depend on these being exported; removing them risks breaking consumers we haven't surveyed. |

   - **Net cleanup**: 1 surgical change (`guardVerdictToAction` un-exported in `engine/guards.ts`).
   - **Lesson**: ts-prune in a multi-package monorepo with public API re-export chains has a high false-positive rate (~10/11). Useful as a starting point, but every finding needs human review against the actual import graph.
   - **Acceptance**: review documented; obvious dead code removed; remaining findings explicitly justified.
5. **ESLint flat-config rule-merge audit** — ✅ **DONE 2026-05-07**. Audited all 5 flat configs across both repos:
   - `t2000/packages/sdk/eslint.config.mjs` — clean (no `no-restricted-*` rules)
   - `t2000/packages/engine/eslint.config.mjs` — clean (no `no-restricted-*` rules)
   - `t2000/apps/web/eslint.config.mjs` — clean (uses Next.js defaults only)
   - `t2000/apps/server/eslint.config.mjs` — clean (no `no-restricted-*` rules)
   - `audric/apps/web/eslint.config.mjs` — **canonical reference**. Already consolidates 4 selectors (env-gate, canonical-portfolio fetch literal, canonical-portfolio fetch template-literal, canonical-write `new Transaction()`) into a single `combinedRestrictedSyntax` rule entry. Fixed during SPEC 7 v0.4.1 C0.2 (2026-05-02) after empirical verification.
   - **Pattern documented** in `coding-discipline.mdc` new section "ESLint flat config — rules with array values OVERRIDE across blocks; consolidate". Future configs that add `no-restricted-syntax` / `no-restricted-imports` / `no-restricted-properties` will see the warning + the canonical reference.
   - **Acceptance**: zero override-bug instances across both repos; pattern documented for future drift prevention.

### Phase 2 — Internal docs cluster (~1.5d) — ✅ **SHIPPED 2026-05-07 (S.105)**

**Goal:** every doc consumed by humans-internally agrees with the post-Phase-1 reality.

**Headline result.** `getDefaultTools()` returns **35 tools (24 read + 11 write)**, not 34 / 23 / 11. SPEC 10 added `resolveSuinsTool` without a doc refresh sweep. Phase 2 corrects the drift across both repos AND drift-proofs the system prompts so the same drift can't recur.

1. **Spec headers refresh** — ✅ shipped. Forward-looking specs (SPEC 11.5 baseline 1.22.0 → 1.22.1; SPEC 18 tool count 34 → 35; PRODUCT_SPEC tool/guard/recipe drift) refreshed. Closed-spec headers (7/8/9/10/13/14/15) intentionally preserve historical version targets per their v0.5 status notes — no churn.
2. **`PRODUCT_FACTS.md` refresh** — ✅ shipped. Tool count → 35; version chain `0.54.1` → `1.22.1` for all 4 packages; "Last verified" date refreshed. Historical changelog rows (Spec 1, Spec 2 version-spans) preserved as historical record.
3. **`CLI_UX_SPEC.md` + CLI commands** — ✅ clean (no changes needed). Audit returned zero `Math.round` violations and zero tool-count or version drift.
4. **`ARCHITECTURE.md`** — ✅ shipped. Tool count → 35 in 3 places; MCP prompt count → 14 (post-SPEC-17 savings-goal MCP prompt deletion); MCP "subset of engine's 35 tools" framing corrected.
5. **READMEs (root + per-package + audric)** — ✅ shipped. Tool count → 35 in t2000 root + engine README; audric README updated for 35 tools / 24 reads + Prisma model count corrected (16 → 15 post-SPEC-17) + enumeration cleaned (removed phantom "contacts" + "goals", added missing "user preferences"); engine README v1.4 historical callout extended with SPEC 10 update line.
6. **`CLAUDE.md` (both repos)** — ✅ shipped. Tool count → 35 in 4 locations (3 in t2000/CLAUDE.md, 2 in audric/CLAUDE.md); read split → 24; built-in tools list extended with `resolve_suins`. Critical Rules list reviewed — no drift.
7. **System prompts** — ✅ shipped (drift-proofed). Engine `DEFAULT_SYSTEM_PROMPT` (`packages/engine/src/prompt/index.ts`) refactored to derive `${TOTAL_COUNT}` / `${READ_COUNT}` / `${WRITE_COUNT}` from `READ_TOOLS.length` + `WRITE_TOOLS.length` at module load — same canonical pattern audric/web's `STATIC_SYSTEM_PROMPT` already uses. Audric's `buildUnauthPrompt(tools)` updated to use `${tools.length}`. **Both prompts now stay in sync with reality automatically — this exact drift can't recur.** Token budget headroom verified ≥100 tokens (DEFAULT_SYSTEM_PROMPT ~2,650 tokens; well under 4k budget).
8. **Tracker + roadmap** — ✅ shipped. Forward backlog row 5 reflects Phase 1 + Phase 2 done; S.105 entry captures full execution log with sub-task disposition table.

**Verification (all green):**
- `pnpm --filter @t2000/engine typecheck` ✅
- `pnpm --filter @t2000/engine test` — 965 / 965 passing ✅
- `pnpm --filter @t2000/engine build` — 170.33 KB d.ts unchanged (export surface preserved) ✅
- `pnpm --filter @t2000/cli typecheck` ✅
- `pnpm --filter @t2000/mcp typecheck` ✅
- `audric/apps/web pnpm typecheck` ✅
- Cat 1/2/4/5/8 greps — zero forbidden-pattern hits in current-state assertions; historical breadcrumbs preserved with explicit "Removed in v1.4" / "post-SPEC-17" markers.

**Deferred to Phase 3** (External surfaces cluster, not in P2 scope):
- `audric/apps/web/app/litepaper/page.tsx` — 4 "34 tools" hits → marketing copy (Phase 3 Cat 12)
- `audric/apps/web/components/landing/IntelligenceSection.tsx` — 1 "34 tools" hit → marketing copy

### Phase 3 — External surfaces cluster (~1.75d, was 1d — +0.75d for legal pages + website infra)

**Goal:** every public-facing surface enforces 5-product taxonomy + reflects shipped reality.

> **Status: ✅ PHASE 3 SHIPPED 2026-05-07 (Wave 1 mechanical fixes + Wave 2 inventory + sub-task dispositions). Legal-page reconciliation deferred to founder review per D-7a (drafts queued in S.106). All other sub-tasks shipped or documented-as-absent.**

1. **t2000.ai marketing site** (apps/web/) — ✅ SHIPPED. Fixed: `apps/web/app/page.tsx` PACKAGES.MCP `15 prompts → 14 prompts`, PACKAGES.Engine `34 tools → 35 tools`, gateway stat block `41 services / 90+ endpoints → 40 services / 88 endpoints` (canonical per CLAUDE.md). `apps/web/app/docs/page.tsx` `34 tools → 35 tools`. Cat 1 (taxonomy) clean — no `Audric Invest` or `Audric Receive` (standalone) hits. Cat 9 (Pay scope) clean. Cat 12 (Passport identity layer) — t2000.ai doesn't have a dedicated Passport surface (it's an infra site); footer + nav consistent.
2. **audric.ai marketing site** — ✅ SHIPPED. Fixed: `components/landing/IntelligenceSection.tsx` `34 tools → 35 tools`. Cat 12 — `components/landing/PassportSection.tsx` Identity pillar body extended to mention `you.audric.sui` (passes framing test).
3. **Pitch deck (pitch-deck-v6.html)** — ✅ SHIPPED. Fixed: sidebar mockup `◇ Goals → ◇ Activity` (post-SPEC-17 — savings goals retired). v6 already clean of tool/guard/recipe count drift (high-level visual deck). **Deferred (queued for founder review):** Slide 10 (Passport before/after) shows "Sign in with Google → Passport ready in 3s" but doesn't enumerate the 4 Passport pillars (Identity / You decide / Sponsored gas / Yours). Slide 13 (Built on Sui) lists infra (zkLogin / Sponsored gas / 0.4s / Native USDC) — adjacent to but not identical to the 4 pillars. Per G13 acceptance gate the deck Passport section should enumerate all 4 pillars. **D-7b (NEW deferred):** add a 4-pillar Passport slide between slides 10 and 11, OR expand slide 10 to a 4-pillar layout. Founder review at end of Phase 3 close-out.
4. **Litepaper (audric/apps/web/app/litepaper/page.tsx)** — ✅ SHIPPED. Fixed: 3 hits — header/breakdown `34 tools → 35 tools (24 read + 11 write)`, layer-table `34 → 35`, safety guards `9 → 14`. Passport identity language already covered by section copy.
5. **Legal pages (Category 13)** — ⏸️ **DRAFTED, NOT SHIPPED — queued for founder review (D-7a recommended path).** Comprehensive diff prepared in S.106. Audric pages identified as missing post-SPEC-10 username collection disclosure, missing Audric Intelligence data collection disclosure (UserFinancialProfile, ChainFact, AdviceLog, daily UserFinancialContext snapshot). t2000 disclaimer Service Delivery + CLI/SDK key management sections intentionally absent from audric (audric is consumer-only, no CLI/SDK). Effective dates need bump to 2026-05-07 if any clauses change. Awaiting founder go-signal before shipping.
6. **Website meta + infrastructure (Category 14)** — ✅ SHIPPED. Inventory:
   - **t2000:** not-found ✅, opengraph-image ✅, icon ✅, error/global-error/loading ⚠️ MISSING but acceptable (fully SSG marketing site, no Suspense or runtime errors expected).
   - **audric:** not-found ✅, error ✅, global-error ✅, loading ✅, opengraph-image ✅, icon ✅.
   - **Both:** sitemap.ts MISSING → **ADDED** (`app/sitemap.ts` reflects all public routes per site).
   - **Both:** robots.txt MISSING → **ADDED** (`public/robots.txt` allows public, blocks API/auth/internal).
   - **manifest.json:** MISSING on both — documented as intentionally absent (no PWA target today; revisit if mobile add-to-home-screen becomes a use case).
   - **D-8 RESOLVED → D-8c (skip — no analytics).** Audit confirmed both sites use only `@vercel/analytics` (anonymous, cookieless). Zero third-party tracking cookies. No consent banner needed. Documented.
7. **App Store + Play Store copy** — ✅ DOCUMENTED-AS-ABSENT. Audric is web-only today. No iOS/Android apps shipped. Re-open this sub-task when mobile launch is in scope.
8. **Launch announcement copy** — ✅ DOCUMENTED-AS-ABSENT. No standalone announcement file in either repo. The pitch deck (`pitch-deck-v6.html`) IS the launch artifact — covered in sub-task 3.
9. **Pricing + fees copy** — ✅ SHIPPED (verified clean). Cross-repo grep for `treasury::collect_fee` and `addCollectFeeToTx`: zero hits (correctly removed per CLAUDE.md rule 9). All in-codebase mentions of "fees are zero" / "no fees" reviewed: `Audric Pay` "no fees" claim is correct (sending USDC has no Audric fee, gas is sponsored); `packages/sdk/src/protocols/navi.ts` "B5 v2 / 2026-04-30 No fee collection" comments are correct (SDK is fee-free; Audric is sole fee owner via inline `addFeeTransfer`); engine system prompt correctly tells the LLM NOT to say "fees are zero" for swap/save/borrow.
10. **Email templates (Resend)** — ✅ DOCUMENTED-AS-ABSENT. Resend integration removed in PR-B2 (replaced by username-based identity verification — see `audric/apps/web/lib/auth.ts` line 14, 79). No transactional emails sent today. Re-open when transactional email becomes a use case.

**Cross-cutting drift fixes shipped during Phase 3:**
- `packages/engine/src/prompt/index.ts` DEFAULT_SYSTEM_PROMPT — `41 paid APIs → 40+ paid APIs` (canonical per CLAUDE.md "40+ services, 88 endpoints").
- `audric/apps/web/lib/engine/engine-factory.ts` buildUnauthPrompt — same fix.
- `audric-roadmap.md` — "34 tools" → "35 tools" + "9 guards, 7 skill recipes" → "14 guards, 6 skill recipes" (internal doc, gitignored, but kept consistent).
- `article-trust-layer.md` — "34 tools" → "35 tools (24 reads + 11 writes)" + guard/recipe counts updated; tool list extended to include `resolve_suins`.

**Phase 3 verification (post-Wave-1 cleanup):**
- Cat 1 grep — 0 hits (no `Audric Invest`; no standalone `Audric Receive`).
- Cat 2 grep — 0 hits in current-state assertions (only intentional SPEC 17 history breadcrumbs in `audric-build-tracker.md` + `ARCHITECTURE.md`).
- Cat 4 grep (`\b(33|34) (engine )?tools\b`) — only intentional historical comments (post-v1.4 callouts in `packages/engine/README.md` + `packages/engine/src/tools/index.ts`) + audric-build-tracker S.105 commit log. All current-state assertions correctly say 35.
- Cat 9 grep — 0 hits ("audric pay" + MPP/gateway/41 services co-occurrence).
- `pnpm --filter @t2000/web typecheck` ✅
- `pnpm --filter @t2000/engine typecheck` ✅
- `pnpm --filter @t2000/engine test` — 965 / 965 passing ✅
- `audric/apps/web pnpm typecheck` ✅

### Phase 4 — Verification cluster (~0.25d)

> **Status: ✅ FULLY COMPLETE 2026-05-07. 13/13 acceptance gates closed (G11 via privacy commit `8ed6d67`; G13 via S.108 Option C — slide 13 reframed). Step 3 (manual smoke) remains a founder-required prod-testing task before launch.**

1. **Re-run all 10 audit greps.** ✅ COMPLETE 2026-05-07. Findings:
   - Cat 1 (taxonomy): 0 forbidden hits. Only intentional binding-rule reference in `CLAUDE.md` line 83.
   - Cat 2 (removed-feature drift): 0 current-state hits; only intentional history breadcrumbs in `ARCHITECTURE.md` (S.5, S.22 history) + `CLAUDE.md` + `PRODUCT_FACTS.md` ("Removed in S.7" callouts).
   - Cat 3 (saveable assets): 0 hits.
   - Cat 4 (tool count drift): **3 additional drift hits found + fixed during Phase 4.** `apps/web/app/docs/page.tsx` line 67 (was missed in Phase 3 fix), `README.md` line 157 (Audric Intelligence intro), `ARCHITECTURE.md` line 802 (5-system intro). All updated to 35.
   - Cat 5 (version chain): ✅ all 4 packages at 1.22.1.
   - Cat 6 (TODO/CANONICAL-BYPASS): 0 current-state bypass violations. Only documentation references in `audric-canonical-portfolio.mdc`, `audric-canonical-write.mdc`, `single-source-of-truth.mdc`, `composeTx.ts` JSDoc.
   - Cat 7 (cursor-rule parity): see Step 2 below.
   - Cat 8 (BlockVision migration cleanup): 1 stale current-state reference found + fixed — `docs/open-model-benchmark.md` line 167 (`defillama_token_prices` → `token_prices` in benchmark table). All other `defillama_*` mentions are intentional history breadcrumbs (CHANGELOG, harness-metrics deletion comments, AUDRIC_HARNESS_INTELLIGENCE_SPEC v1.4.1 deletion table, audric-build-tracker S.x entries).
   - Cat 9 (Audric Pay scope): 0 forbidden hits. **1 internal inconsistency in CLAUDE.md fixed — line 82 said "MPP / 41 AI services" but line 21 (canonical) says "40+ services, 88 endpoints"; updated line 82 to "40+ AI services" to match.**
   - Cat 10 (engine layout): ✅ shipped in Phase 1 (14 files moved to navi/mcp/sui/prompt/cache).
2. **Cross-repo cursor-rule parity check (per D-4a).** ✅ COMPLETE.
   - **7 cross-cutting rules in BOTH repos:** `coding-discipline`, `cron-job-architecture`, `env-validation-gate`, `financial-amounts`, `goal-driven-execution`, `metrics-and-monitoring`, `safeguards-defense-in-depth`.
   - **Cross-repo paired rules (different filenames, same intent, explicit cross-reference):**
     - `t2000/savings-usdc-only.mdc` ↔ `audric/usdc-only-saves.mdc` — audric version explicitly references t2000 as engine-side counterpart (line 10).
     - `t2000/single-source-of-truth.mdc` ↔ `audric/audric-canonical-portfolio.mdc` + `audric/audric-canonical-write.mdc` — audric versions are repo-specific operationalizations (route through `getCanonicalPortfolio` / `composeTx`).
   - **t2000-only rules (engine-internal, no audric counterpart needed):** `engine-tool-development`, `agent-harness-spec`, `blockvision-resilience`, `engineering-principles`, `token-data-architecture`. Per D-4a these are engine-internal; consumers don't need them.
   - **audric-only rules (consumer-app-specific):** `audric-finance-flow`, `audric-pay-flow`, `audric-transaction-flow`, `design-system`, `engine-context-assembly`, `prisma-models-overview`, `write-tool-pending-action`, `zklogin-passport-flow`. No t2000 counterpart needed (web-app concerns).
   - **Net: D-4a satisfied.** Cross-cutting rules either exist in both OR pair via explicit forwarding-reference. No silent drift.
3. **Final manual smoke checklist.** ⏸️ FOUNDER-REQUIRED (prod testing). One end-to-end happy path per Audric product. Run after legal-page commit + audric Vercel deploy.
   - Passport — claim a username
   - Intelligence — chat with rich-context turn
   - Finance — save USDC, swap to USDsui, borrow against, generate a chart
   - Pay — send USDC to a contact, create a payment link, pay it from a 2nd account
   - Store — N/A (Phase 5)
4. **Two PRs landed** — one per repo. ⏸️ BLOCKS on D-7a (privacy) + D-7b (pitch deck) green-lights. All other Phase 3 + Phase 4 changes are local + ready to commit.

**Phase 4 fixes shipped (in addition to Phase 3 fixes):**
- `t2000/apps/web/app/docs/page.tsx` `"34 financial tools" → "35 financial tools"`
- `t2000/README.md` `"34 financial tools" → "35 financial tools"`
- `t2000/ARCHITECTURE.md` `"orchestrates 34 financial tools" → "35 financial tools"`
- `t2000/CLAUDE.md` `"MPP / 41 AI services" → "MPP / 40+ AI services"` (Cat 9 internal-consistency fix)
- `t2000/docs/open-model-benchmark.md` `defillama_token_prices` reference → `token_prices` with v1.4 deprecation note (Cat 8)

---

## Acceptance gates

| Gate | How to verify |
|---|---|
| **G1 — All audit greps return 0 forbidden-pattern hits** | Re-run categories 1, 2, 3, 6, 8, 9 — all return 0 lines |
| **G2 — Tool count assertions match reality** | Category 4 grep + cross-reference vs `getDefaultTools()` length returns equal count everywhere |
| **G3 — Version chain aligned** | Category 5 grep — every doc referencing engine/SDK version matches current package.json |
| **G4 — Spec headers refreshed** | Every `SPEC_*.md` header cites correct shipped engine + SDK versions |
| **G5 — System prompts clean** | `buildSystemPrompt()` output has zero references to removed features (categories 2 + savings-goal post-SPEC-17); token budget ≥100 token headroom |
| **G6 — Cursor rule parity (cross-cutting)** | Per D-4a, cross-cutting rules verified in both repos OR documented forwarding-reference |
| **G7 — Engine package layout** | Per TD.5 — folded into per-domain folders OR explicit decision documented in `engineering-principles.mdc` |
| **G8 — No stale code** | `npx ts-prune` returns ≤ N expected exports (N captured in Phase 1 step 4); each kept export has a documented reason |
| **G9 — ESLint config audit clean** | Phase 1 step 5 grep returns 0 multi-block rule definitions in either repo's `eslint.config.mjs` |
| **G10 — Smoke checklist green** | Phase 4 step 3 — all 5 product happy-paths pass in production after the SPEC 12 PR ships |
| **G11 — Legal page parity** | Category 13 audit — t2000 + audric legal pages reconciled per lock table; effective dates aligned; all 4 footer links work on both sites; no stale entity names |
| **G12 — Website infrastructure complete** | Category 14 audit — both sites have branded 404, branded error, OG image renders, favicon present, sitemap reflects shipped routes (or absence documented), robots.txt present (or absence documented); manual smoke of every public route on both sites passes |
| **G13 — Audric Passport identity-layer integration** | Category 12 audit — every Passport mention on both sites passes the framing test (read-aloud test or 4-pillar enumeration); pitch deck + litepaper Passport sections list all 4 pillars including Identity |

---

## Risks

| Risk | Mitigation |
|---|---|
| **R1 — Scope creep ("while I'm here").** Sweep diff balloons because someone fixes adjacent issues. | Per `coding-discipline.mdc` — every diff traces to a forbidden-pattern hit. New issues surfaced during sweep get filed as follow-ups (D-5c), not absorbed. |
| **R2 — Rule drift between rules-of-rules.** Cursor rules contradicting each other (e.g. `audric-pay-flow.mdc` says X, `safeguards-defense-in-depth.mdc` says Y). | Phase 2 step 6 — read each rule end-to-end; cross-references validated; conflicts flagged inline for founder resolution. |
| **R3 — Marketing copy may need design review.** A copy edit triggers a visual layout shift. | Per D-2a — copy edits only, no visual changes. If a copy edit triggers a layout issue, surface to founder; don't auto-fix. |
| **R4 — Engine package fold (TD.5) breaks an external consumer.** | Phase 1 step 1 — codemod-only refactor; `pnpm --filter @t2000/engine test` runs full test suite; published API surface (`packages/engine/src/index.ts` exports) is unchanged; consumers shouldn't notice. |
| **R5 — Token budget in system prompt.** Phase 2 step 7 says ≥100 tokens of headroom; current is ~18. May need to compress more than just savings-goal removal claws back. | Phase 2 step 7 — measure post-SPEC-17 baseline; if still <100 token headroom, identify additional compression candidates inline. SPEC 12 v0.1 ships with whatever headroom is achievable; future v0.2 surfaces additional compressions if needed. |
| **R6 — A new spec ships during SPEC 12's wall-clock.** SPEC 12 takes ~3.5d; if SPEC 11 starts in parallel, SPEC 11's diffs create new drift mid-sweep. | Run SPEC 12 with no other in-flight spec. Sequential not parallel. Per S.95 sequencing decision, SPEC 11 doesn't draft until SPEC 12 closes. |

---

## What this sweep is NOT

- **NOT a feature change.** Zero new features. Zero behavior change.
- **NOT a refactor (except TD.5 — pure mechanical).** No semantic changes to working code.
- **NOT a new spec.** Each diff traces to a forbidden-pattern hit OR a documented stale reference.
- **NOT a SPEC 17 prerequisite.** SPEC 17 ships independently; SPEC 12 inherits its clean state but does not depend on SPEC 17 content.
- **NOT a permanent fix for drift.** SPEC 12 closes the current drift surface; ongoing drift discipline (per `engineering-principles.mdc` + `coding-discipline.mdc`) is the prevention mechanism. SPEC 12 is the recurring pattern (every 5-6 specs of build), not a one-time event.

---

## Out of scope

- **Engine API surface changes** — no new tools, no signature changes to existing tools.
- **Prisma schema changes** beyond what SPEC 17 already does.
- **New product features** — Pay flow improvements, Store flow polish, Intelligence reasoning enhancements, etc.
- **Standalone bug tickets** (G7 Enoki 401, G9a balance_check vs SDK divergence) — captured in tracker, picked up separately, not absorbed by the sweep.

---

## Open questions

1. **D-3 confirmation:** what is the litepaper file path? (Founder confirms during lock pass.)
2. **D-2 confirmation:** any specific marketing pages founder wants to skip in Phase 3? (Default: all of them.)

---

## Effort summary

| Phase | Effort |
|---|---|
| Phase 1 — Internal hygiene | 1.5d |
| Phase 2 — Internal docs | 1.5d |
| Phase 3 — External surfaces (incl. legal pages + website infra) | 1.75d (was 1d, +0.75d for Categories 13 + 14) |
| Phase 4 — Verification | 0.25d |
| **Total** | **~5.0d** (was ~4.25d) |

**Per D-1a (SPEC 17 ships first):** SPEC 12 inherits clean state. Category 2 grep returns 0 cleanly. ~0.5d saved vs D-1c (no retroactive close needed). Total combined SPEC 17 + SPEC 12 = ~6.5d.

---

## Appendix A — exhaustive forbidden-pattern grep list (Phase 4 acceptance check)

```bash
# All 10 grep categories run as a single bash script, all expected to return 0:

# Category 1 — 5-product taxonomy
rg -i "audric invest" --type md --type ts --type tsx
rg -iE "audric receive(?! is)" --type md --type ts --type tsx
rg -i "audric pay" -C 2 --type md | grep -iE "MPP|41 services|micro-?payment protocol" || true

# Category 2 — Removed-feature drift
rg -i "24/7 alerts|recurring (transaction|saves)|scheduled (action|save|execution)" --type md --type ts
rg -i "copilot suggestion|daily briefing|morning briefing|outcome check|follow.?up queue" --type md --type ts
rg -iE "allowance_status|toggle_allowance|update_daily_limit|create_schedule|list_schedules|cancel_schedule|pattern_status|pause_pattern" --type md --type ts
# Post-SPEC-17:
rg -i "savings_goal|savingsGoal|GoalsPanel" --type md --type ts --type tsx
rg "savings-goal" --type md
rg "defillama_" --type ts | grep -v "protocol_deep_dive" || true

# Category 3 — Saveable asset enforcement
rg -i "save anything stable|save (USDe|USDT)" --type md --type ts

# Category 4 — Tool count drift
rg -E "\b(33|41|42)\s+(engine\s+)?tools\b" --type md
# (sole expected match: the actual current count — at 2026-05-07 this is "35 tools" — should match getDefaultTools().length)

# Category 5 — Version chain
for pkg in sdk engine cli mcp; do echo "$pkg:" $(jq -r .version packages/$pkg/package.json); done
# (must all be equal)

# Category 6 — TODO / TBD / FIXME (excluding test fixtures + generated)
rg -E "\b(TODO|TBD|FIXME)\b" --type ts --type md \
  --glob '!**/generated/**' --glob '!**/__tests__/**'
# (each match either resolved, filed as ticket, or deleted with rationale)

# Category 7 — CANONICAL-BYPASS comments
rg "// CANONICAL-BYPASS:" --type ts -A 1
# (each match cross-referenced against documented bypass tables)

# Category 8 — BlockVision migration cleanup
rg "defillama_token_prices|defillama_price_change|defillama_yield_pools|defillama_protocol_info|defillama_chain_tvl|defillama_protocol_fees|defillama_sui_protocols" --type md --type ts | grep -v "protocol_deep_dive" || true

# Category 9 — Audric Pay scope
rg -i "audric pay" --type md --type ts -C 2 | grep -iE "MPP|gateway|41 services" || true
```

---

## Appendix B — How to explain SPEC 12 to people

### B.1 — 30-second version (anyone)

> *We just shipped 5 big features in 6 weeks. Each one updated the code but a few docs / cursor rules / marketing pages stayed pointing at the old reality. SPEC 12 is the systematic pass that gets everything pointing at the same truth — code, docs, rules, system prompts, marketing, all aligned. ~3.5 days, one PR per repo, no behavior change.*

### B.2 — 2-minute version (engineer / partner Slack DM)

> *Drift accumulates across waves of feature work. After SPEC 7 (multi-write PTB), SPEC 8 (interactive harness), SPEC 9 (chain memory), SPEC 10 (identity), and the wave of patches around them, ~30 small "doc / rule / prompt / marketing" items got tagged as "deferred to SPEC 12" because they didn't fit the surgical scope of any single feature spec.*
>
> *SPEC 12 is the cleanup pass. It runs 10 grep-based audit categories (taxonomy enforcement, removed-feature drift, asset allow-list, tool counts, version chain alignment, TODO hunt, bypass comment audit, BlockVision migration leftovers, Audric Pay scope, engine package layout). Each forbidden pattern → 0 hits. Each canonical state → matches reality. Then a manual sweep of cursor rules + system prompts + marketing copy.*
>
> *4 phases, ~3.5 days, two PRs. Done when (a) every grep returns 0, (b) every cursor rule reads consistently, (c) marketing copy aligned, (d) all 5 Audric product happy-paths smoke-test green.*

### B.3 — Why this isn't a one-time event

> *SPEC 12 is the cleanup pass for this wave. Drift accumulates again as the next wave (SPEC 11 / 11.5 / 16) ships. So this becomes a recurring pattern — every 5-6 specs of feature work, run a SPEC 12 cleanup. That cadence is the contract: "we'll let small drift accumulate during high-velocity feature work, but we'll pay it back in scheduled cleanups."*
>
> *The alternative (force every diff to maintain perfect cross-repo consistency at all times) trades velocity for hygiene at every PR — and the team has settled on the cadence model as the better trade.*

---

**End SPEC 12 v0.5 LOCKED.** Restored to canonical sequencing — all 8 D-questions locked to recommendations (D-1a/D-2a/D-3a/D-4a/D-5c/D-6a/D-7a+D-7c/D-8a). Phase 1 starts after SPEC 17 ships.
