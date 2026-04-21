# t2000 Codebase Audit — Findings

**Date:** 2026-04-21
**Branch:** `claude/codebase-audit-review-NjTO2`
**Scope:** Full monorepo — apps, packages, docs, infra, scripts, skills

This report is the deliverable of a findings-only audit (plus a short list of safe cleanups applied in this same PR). Each finding was produced by an exploration agent and then spot-verified against the codebase; verification notes are included where the agent's recommendation differed from ground truth.

Action tags:
- **[DELETE]** — verified safe to remove
- **[REFACTOR]** — worth simplifying, low risk
- **[KEEP-BUT-FLAG]** — leave as-is, but worth knowing
- **[INVESTIGATE-FURTHER]** — needs human judgement / coordination
- **[FALSE-POSITIVE]** — agent flagged it; verification shows no action needed

---

## Executive summary

The t2000 monorepo is in **good shape**. The S.0–S.22 simplification pass (April 2026) already removed most legacy and the code that's left is coherent. The audit agent produced ~40 findings; after verification the list is much shorter:

- **Verified safe cleanups applied in this PR:** 2 unused root devDependencies (`@zodios/core`, `axios`).
- **Real issues worth addressing soon:** ~4 (MCP/CLI dep declaration, `.cursor` vs `.claude` rules, MCP tool count drift, scripts/infra READMEs).
- **Agent false positives caught in verification:** 4 (`lock` command, `fundStatus`, `@naviprotocol/lending` patch, `audric-*.md` cross-repo concern — all intentional).

Most of the audit's value is confirming the codebase does **not** have the pathologies the owner was worried about: no abandoned v1 alongside v2, no plugin systems with one plugin, no reinvented utilities, no half-finished features. The simplification was executed well.

---

## 1. Verified safe cleanups (applied in this PR)

### [DELETE] Unused root devDependencies — `@zodios/core`, `axios`

- **File:** `package.json`
- **Verification:** `grep -r "@zodios/core\|from ['\"]axios['\"]"` returns zero source hits. SDK uses native `fetch`.
- **Action taken in this PR:** both removed.

---

## 2. Real issues (not auto-fixed — need decisions)

### [FALSE-POSITIVE — moved from Section 2] Cross-project docs

- **Files:** `audric-roadmap.md` (156KB), `audric-build-tracker.md` (134KB).
- **Initial agent claim:** these belong in audric, not t2000.
- **Ground truth (from `CLAUDE.md` § "Key Documents"):** both are canonical references for this repo — "`audric-roadmap.md` — Product roadmap, feature specs, revenue model" and "`audric-build-tracker.md` — Execution status per phase and task". CLAUDE.md explicitly points readers here. Naming rule 10 even cites `audric-build-tracker.md` as the source of truth for the S.18 decision. Keep as-is.

### [INVESTIGATE] `@t2000/mcp` and `@t2000/cli` declare runtime deps as devDependencies

- **Files:** `packages/mcp/package.json`, `packages/cli/package.json`
- **Problem:** Both have `"dependencies": {}` and put `@modelcontextprotocol/sdk`, `zod`, `commander` in `devDependencies`. If these packages are published to npm, consumers won't get runtime deps installed. Current state works for the monorepo because they're bundled via `tsup`, but it's a footgun for external consumers.
- **Recommended:** verify the bundle produced by `tsup` inlines these. If yes, leave as-is and add a comment. If no, move to `dependencies`.
- **Not auto-applied because:** this intersects with the publish pipeline — getting it wrong could break `npm install @t2000/mcp` for downstream users.

### [REFACTOR] Two parallel rule systems: `.cursor/rules/` and `.claude/rules/`

- **Files:** `.cursor/rules/` (5 `.mdc` files), `.claude/rules/` (3 files), plus `.claude/settings.json`.
- **Problem:** no documentation of why both exist. They overlap in content (both discuss engineering principles, architecture). Cursor and Claude Code are different tools but nothing stops both from being active. If one is abandoned, the other drifts.
- **Recommended:** pick one canonical location, or add a README explaining the split.

### [KEEP-BUT-FLAG] `ARCHITECTURE.md` likely has stale MCP tool count

- **File:** `ARCHITECTURE.md` — line ~66 describes `@t2000/mcp` as "50 tools (mirrors engine)".
- **Problem:** PRODUCT_FACTS.md says 40 tools total (29 read + 11 write); MCP package.json description says 29 tools. Numbers disagree.
- **Recommended:** reconcile to a single authoritative count.

### [INVESTIGATE] `scripts/` and `scripts/cli/` — undocumented collection

- **Files:** 8 `.ts` files in `scripts/`, 6 `.sh` files in `scripts/cli/`.
- **Problem:** no README, so it's not clear which scripts are active dev utilities vs. artifacts of finished one-offs. At least some (`test-*.ts`, `debug-*.ts`) look like debugging utilities that could be kept as dev-only, but old ones testing deleted features (allowance, schedules, patterns) should be removed.
- **Recommended:** walk through them, delete any that exercise removed tools, add a one-paragraph README.

### [INVESTIGATE] `infra/` — undocumented deployment surface

- **Files:** `setup.sh`, `setup-alb.sh`, `setup-cron.sh`, `deploy.sh`, `*-task-definition.json`, `indexer.Dockerfile`.
- **Problem:** no README. If any cron job was deleted (e.g. old briefing crons), the task definition may still be here. Same for any ALB rules that pointed at deleted endpoints.
- **Recommended:** 15-minute audit — confirm each task definition corresponds to a running ECS service, delete orphans.

---

## 3. Agent false positives (verified — no action needed)

Caught during verification. Keeping here so a future audit doesn't re-flag them.

### [FALSE-POSITIVE] `packages/cli/src/commands/lock.ts`

- **Agent claim:** "Appears unused, remnant of old key management."
- **Ground truth:** `t2000 lock` and `t2000 unlock` are documented in `CLI_UX_SPEC.md`, `README.md` (twice), `PRODUCT_FACTS.md`, `packages/cli/README.md` (twice), and `t2000-skills/skills/t2000-safeguards/SKILL.md`. Live feature implementing the "freeze all operations" safeguard. Registered in `program.ts`.

### [FALSE-POSITIVE] `packages/cli/src/commands/fundStatus.ts`

- **Agent claim:** "Likely dead, superseded by `deposit`."
- **Ground truth:** `t2000 fund-status` is documented in `CLI_UX_SPEC.md` line 208 and `spec/PRODUCT_SPEC.md`. The underlying `fundStatus` data is used extensively in `packages/engine/src/tools/savings.ts` (5+ call sites) and `packages/engine/src/navi-transforms.ts`. Live.

### [FALSE-POSITIVE] `patches/@naviprotocol__lending@1.4.0.patch`

- **Agent claim (for audric; t2000 agent did not raise this): "unused".
- **Ground truth:** `pnpm-lock.yaml` shows `@naviprotocol/lending@1.4.0` is a real dependency of `@t2000/sdk`. The patch is applied at install time. Deleting it would break the install.

---

## 4. Low-priority observations (informational)

### [KEEP] `ProtocolRegistry`, `RecipeRegistry`, `McpClientManager`

Audit agent initially flagged these as potential over-engineering (abstractions used with 1–2 concrete implementations). Verification: all three are intentional extension points with tests exercising multi-adapter/multi-recipe paths. Not over-engineered — keep.

### [KEEP] `spec/archive/` (22 files, ~1.2MB)

Historical decision log. Not imported anywhere. Low maintenance cost. Keep as-is unless repo size becomes a problem.

### [KEEP] `t2000-skills/skills/` (12 SKILL.md) and `t2000-skills/recipes/` (7 YAML)

All reference live engine tools. No stale skills or recipes.

### [KEEP] `scripts/cli/test-*.sh`

Manual smoke-test wrappers. Useful during dev. Worth keeping, worth documenting in a short `scripts/README.md`.

---

## 5. Strengths observed

For context (not actions):

- **Clear package boundaries.** `sdk` / `engine` / `cli` / `mcp` have well-defined responsibilities, no circular imports, no code that "could have lived anywhere."
- **No zombie features.** S.5–S.22 simplification deleted 9 engine tools (`allowance_status`, `toggle_allowance`, schedules, patterns, etc.) and the cleanup was thorough — no orphaned call sites, no half-broken imports.
- **Consistent patterns.** Every tool uses the same `defineTool` factory, every CLI command uses the same output helpers, every adapter implements the same interface.
- **Docs are written, not auto-generated.** `CLAUDE.md`, `PRODUCT_FACTS.md`, `CLI_UX_SPEC.md`, `ARCHITECTURE.md` are substantive and current (dated within the last 3 days).
- **No TODO/FIXME/HACK comments in code.** A conscious choice — WHY comments exist but "fix later" notes have been extracted into the tracker.

---

## 6. Recommended next steps (ranked)

1. **Verify `@t2000/mcp` and `@t2000/cli` runtime deps are correctly bundled.** Quick check, prevents install bugs for external consumers.
2. **Reconcile MCP tool count in `ARCHITECTURE.md` vs `PRODUCT_FACTS.md`.**
3. **Add `scripts/README.md` and `infra/README.md`.**
4. **Pick a canonical AI-rules location (`.cursor` vs `.claude`), or document the split.**

No urgent issues. The codebase does not need a major cleanup — the simplification that already ran did the heavy lifting.
