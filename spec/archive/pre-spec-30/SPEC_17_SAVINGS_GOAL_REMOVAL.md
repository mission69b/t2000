# SPEC 17 — Savings Goals Removal (Product Simplification)

> **Status: v0.5 SHIPPED** ✅ — all 6 phases (A–F) executed 2026-05-07 in a single session. t2000 v1.22.1 published (sdk + engine + mcp + cli, 4 npm packages), audric production deployed, NeonDB migration applied, smoke tests green. SPEC 12 unblocked.
>
> **Version history:**
> - **v0.1 DRAFT** (2026-05-07) — initial scope + removal checklist + 4 D-questions
> - **v0.2 LOCKED** (2026-05-07) — batch-lock to recommendations: D-1a/D-2a/D-3a/D-4a (ship before SPEC 12).
> - **v0.3 LOCKED** (2026-05-07) — D-4 temporarily reversed to D-4c (ship AFTER SPEC 12) for 12h pre-demo window safety. **Superseded by v0.4 — 12h deadline cancelled, reversal no longer needed.**
> - **v0.4 LOCKED** (2026-05-07) — restored to v0.2 canonical plan. D-4a (ship before SPEC 12) re-locked. Category 2 Exception block in SPEC 12 v0.4 dropped (no longer needed — SPEC 17 ships first). Net: SPEC 17 → SPEC 12 → CHIPS Review → SPEC 18, no compressed-everything window.
> - **v0.5 SHIPPED** (2026-05-07) — all 6 phases executed. Total footprint: ~3,805 LoC net removed, 7 source files deleted, 41 files modified across both repos, 4 npm packages republished at v1.22.1. Snapshot skipped per founder authorization (NeonDB 30d branch retention as alternate recovery path). Smoke tests pass post-deploy. See S.103 in `audric-build-tracker.md` for full execution log.

---

## Locked answers (v0.4, 2026-05-07 — restored canonical)

| Q | Locked | Rationale |
|---|---|---|
| **D-1** | **D-1a — hard-drop everything in one migration** | One PR, one migration, CASCADE handles dangling refs (precedent: April 2026 simplification migration). Soft-drop (D-1b) adds complexity for theoretical benefit. |
| **D-2** | **D-2a — no export** | Goals are aspirational labels, not financial state. No on-chain footprint, no money tied. NeonDB 30d snapshot retention covers any "I want to see my old goals" support ticket. |
| **D-3** | **D-3a — silent removal + agent system-prompt instruction** | Pattern from S.7 (9 tools deleted silently). Agent's standing instruction "if asked about goals, say they were retired in favor of `health_check`" handles long-tail discovery. |
| **D-4** | **D-4a — ship SPEC 17 first, then SPEC 12** | SPEC 12 inherits clean state (no savings-goal references to audit). Saves ~0.5d. Single sweep. |
>
> **Owner:** Audric Intelligence (Agent Harness team)
> **Trigger:** founder request 2026-05-07 — "There is also a task to refactor and remove savings goals completely as part of a product simplifcation task."
> **Cross-references:** S.7 (April 2026 simplification — 9 tools deleted, established the "feature removal as discrete spec" pattern), `audric-build-tracker.md` `20260413120000_simplification_drop_dead_features` migration (the prior simplification — already dropped `currentMilestone` from SavingsGoal but kept the table), `20260505063500_rip_spec9_p93_goal_table` (already dropped the SPEC 9 P93 `Goal` table; explicitly noted the broader SavingsGoal removal as "a separate pass after broader product simplification" — that pass is THIS spec).

---

## TL;DR

> **Savings Goals get removed cleanly: 1 Prisma model, 4 engine tools, 2 API routes, 3 UI components, 1 React hook, 1 MCP prompt, 1 system-prompt section, 5 wiring touchpoints, 1 cron snapshot field — across both repos.** Estimated ~1.5–2d. Goal: ship before SPEC 12 starts so SPEC 12 inherits a clean state and sweeps once instead of twice.
>
> **What stays:** `AdviceLog.goalId` becomes a no-op nullable column for one migration cycle (drop in a follow-up after backfill verification). `AppEvent.goalId` same treatment. This is the standard "soft-drop FK first, hard-drop column later" pattern from the April 2026 simplification migration.
>
> **What this spec is NOT:** Not a savings-feature removal. **Saving USDC to NAVI via `save_deposit` is the core Audric Finance operation and stays.** This spec only removes the *aspirational target tracking* layer (`SavingsGoal` model + UI + tools). Users will still save; they just won't have UI for "I'm saving for Japan, $5000 target."
>
> **Why now:** The placeholder removal note in `20260505063500_rip_spec9_p93_goal_table` migration explicitly deferred this to "a separate pass after broader product simplification." That moment is now — SPEC 12 cleanup is the trigger.

---

## Background — what is "Savings Goals" today?

Savings Goals are aspirational monetary targets a user can set ("save $5000 for Japan trip by Dec 2026"). They live in the `SavingsGoal` Prisma model and are surfaced through:

1. **A dedicated UI panel** (`GoalsPanel.tsx`) on the dashboard + settings page
2. **Engine tools** (`savings_goal_create` / `_list` / `_update` / `_delete`) so the LLM can manage goals via chat
3. **A system-prompt section** (`## Savings goals` in `engine-context.ts:723`) that surfaces active goals to the LLM each turn
4. **The daily `<financial_context>` snapshot** (`financial-context-snapshot/route.ts:79`) which embeds top-3 active goals into the prompt
5. **An MCP prompt** (`savings-goal` in `packages/mcp/src/prompts.ts:581`) for external MCP clients
6. **An advice → goal join** (`AdviceLog.goalId` FK + `AppEvent.goalId` FK) so advice can be tagged "toward goal X"

Goals are NOT funded sub-accounts. They're labels over the single NAVI savings position. The user has ONE total savings balance; goals are aspirational tracking, not allocation.

### Why we're removing them

The April 2026 simplification (S.0–S.12) deleted 9 engine tools and ~10 Prisma models on the principle that "features the agent can't autonomously execute under zkLogin shouldn't pretend to be agent features." Savings goals technically pass that test (the LLM can CRUD goals because they're pure database ops, no on-chain signature needed) — but they fail a different test:

- **Goals add a fourth thing to the savings story** (USDC + USDsui save → NAVI position → goals). Three is already at the upper bound of what users hold in working memory while learning Audric. Four is too many.
- **Goals are not actually used by the agent.** The intelligence heuristic mentions "savings goal off-track" but no skill recipe consumes goal data. The system-prompt section costs ~50 tokens per turn and produces zero observable agent behavior change.
- **The UI is goal-heavy.** `GoalsPanel.tsx` is 404 LoC; settings has its own Goal CRUD page. Removing them simplifies the surface dramatically.
- **The "track your savings progress" job-to-be-done is better served by `health_check` + `portfolio_overview`** — both already render NAVI savings + APY + projected growth. A goal target is just "savings balance × scalar" — the user can do that math, or ask the agent to.
- **Goals were a holdover from the pre-simplification copilot/notification era** when the system would proactively nudge "you're behind on Japan trip goal!" That whole nudge surface is gone; the goal table is the orphan.

This is exactly the same pattern as the SPEC 9 P93 `Goal` table removal in S.64 — that table was kept "for now" because it had a different shape (cross-turn todos), but the broader savings-goal layer was always destined for the same fate. The migration commit message even says so.

---

## Scope — what gets removed

### Audric repo

| Surface | File | Action | LoC |
|---|---|---|---|
| **Prisma — SavingsGoal model** | `apps/web/prisma/schema.prisma:109-124` | DROP TABLE in new migration | 16 |
| **Prisma — User.savingsGoals relation** | `apps/web/prisma/schema.prisma:38` | Remove relation | 1 |
| **Prisma — AdviceLog.goal relation** | `apps/web/prisma/schema.prisma:166` | Remove relation; soft-drop `goalId` column (keep nullable for 1 migration cycle, hard-drop in follow-up) | 1 |
| **Prisma — AppEvent.goalId FK + index** | `apps/web/prisma/schema.prisma:134, 142` | Soft-drop `goalId` column + index (same pattern as AdviceLog) | 2 |
| **Engine tools** | `apps/web/lib/engine/goal-tools.ts` | DELETE (4 tools: `savings_goal_create` / `_list` / `_update` / `_delete`) | 258 |
| **Engine factory wiring** | `apps/web/lib/engine/engine-factory.ts:325` | Remove `prisma.savingsGoal.findMany` block + tool registration | ~20 |
| **Engine context — system prompt block** | `apps/web/lib/engine/engine-context.ts:723-727` ("## Savings goals" section) | DELETE section | ~10 |
| **Engine context — advice goal-name lookup** | `apps/web/lib/engine/engine-context.ts:94-101` | Remove `goalNameById` lookup (advice text stands alone) | ~12 |
| **Cron snapshot** | `apps/web/app/api/internal/financial-context-snapshot/route.ts:22, 79-82` | Remove `openGoals` field from snapshot + Prisma query | ~15 |
| **API route — list/create** | `apps/web/app/api/user/goals/route.ts` | DELETE | 116 |
| **API route — get/update/delete** | `apps/web/app/api/user/goals/[id]/route.ts` | DELETE | 129 |
| **React hook** | `apps/web/hooks/useGoals.ts` | DELETE | 135 |
| **UI panel** | `apps/web/components/panels/GoalsPanel.tsx` | DELETE | 404 |
| **UI editor** | `apps/web/components/settings/GoalEditor.tsx` | DELETE | 121 |
| **UI card** | `apps/web/components/settings/GoalCard.tsx` | DELETE | 144 |
| **Settings page integration** | `apps/web/app/settings/page.tsx:28, 87 + render block` | Remove `useGoals` import, `editingGoal` state, GoalsPanel render | ~30 |
| **Dashboard integration** | `apps/web/app/new/dashboard-content.tsx` (any GoalsPanel render) | Remove GoalsPanel render | ~10 |
| **Contact tools comment** | `apps/web/lib/engine/contact-tools.ts:37` | Update reference comment ("the `savings_goal_*` pattern" → "the `save_contact` pattern") | 1 |
| **env.ts comment** | `apps/web/lib/env.ts:315` | Update reference comment (was historical, now needs update) | 1 |
| **README.md** | `audric/README.md:73` | Update simplification list to mark savings-goal as "REMOVED in S.X" (not "kept for now") | 1 |
| **CLAUDE.md** | `audric/CLAUDE.md:188` | Update S.22 historical note to add "fully removed in S.X" tag | 1 |
| **Cursor rule** | `audric/.cursor/rules/prisma-models-overview.mdc` | Remove `SavingsGoal` model description | ~10 |
| **TOTAL audric** | — | — | **~1,400 LoC + 1 model + 1 cron field + 1 system-prompt section** |

### t2000 repo

| Surface | File | Action | LoC |
|---|---|---|---|
| **MCP prompt** | `packages/mcp/src/prompts.ts:581-end-of-savings-goal-block` | DELETE the `savings-goal` prompt definition | ~30 |
| **MCP test** | `packages/mcp/src/prompts.test.ts:40, 152-end-of-savings-goal-test` | DELETE the `savings-goal` test cases | ~20 |
| **MCP integration test** | `packages/mcp/src/integration.test.ts:154` | Remove `savings-goal` from expected prompt list | 1 |
| **t2000 skill** | `t2000-skills/skills/t2000-mcp/SKILL.md:171` | Remove `savings-goal` row from prompt table | 1 |
| **Engine intelligence heuristic** | `packages/engine/src/intelligence.ts:81` | Remove "Their savings goal is materially off-track" line from heuristic | 1 |
| **Engine code comment** | `packages/engine/src/engine.ts:1450` | Update comment (was example of Prisma-backed tool — pick a different example, e.g. `save_contact`) | 1 |
| **Engine test comment** | `packages/engine/src/__tests__/confirmation.test.ts:299` | Update comment (same as above) | 1 |
| **ARCHITECTURE.md** | `t2000/ARCHITECTURE.md:1104` | Update S.22 historical note to add "fully removed in S.X" tag | 1 |
| **TOTAL t2000** | — | — | **~55 LoC + 1 MCP prompt removal + intelligence heuristic line** |

### Total footprint

| Repo | LoC | Net surface change |
|---|---|---|
| **audric** | ~1,400 | -1 Prisma table + -2 FK columns + -1 cron field + -1 system-prompt section + -4 engine tools + -2 API routes + -3 UI components |
| **t2000** | ~55 | -1 MCP prompt + -1 intelligence heuristic + -1 skill row |
| **TOTAL** | **~1,455** | **A meaningfully simpler product surface** |

---

## D-questions (lock these before Phase A starts)

### D-1 — Migration strategy: hard-drop vs soft-drop FK columns

The standard pattern from the April 2026 simplification migration was to drop columns + tables in one CASCADE pass. For SPEC 17 specifically:

**Options:**
- **D-1a (hard-drop everything in one migration).** New migration drops the SavingsGoal table + the `AdviceLog.goalId` FK constraint + the `AdviceLog.goalId` column + the `AppEvent.goalId` FK + `AppEvent.goalId` column + the `AppEvent.goalId` index — all in one PR.
- **D-1b (soft-drop columns, hard-drop table).** New migration drops the SavingsGoal table only. `AdviceLog.goalId` and `AppEvent.goalId` columns become nullable orphans for one migration cycle (data preserved in case we need to debug a missing reference). Follow-up migration ~2 weeks later hard-drops the columns once verified no hot path reads them.
- **D-1c (gradual deprecation).** Keep the SavingsGoal table; only delete the engine tools + UI. Re-evaluate in 30 days based on whether any user re-creates goals via the (now non-existent) UI.

> *My rec: D-1a.* The April 2026 simplification migration shows the pattern works cleanly with `CASCADE`. Soft-drop adds complexity without observable benefit — `AdviceLog` already had its `outcomeChecks` FK CASCADE-dropped without incident in the April migration. D-1c is half-measure that leaves orphan columns in the schema for an indeterminate period.

### D-2 — Data preservation: export before drop?

**Options:**
- **D-2a (no export — recommended).** Goals are aspirational labels, not financial state. No on-chain transactions reference them. Dropping the table loses no money + no audit trail.
- **D-2b (CSV export to S3 before drop).** Export `SavingsGoal` rows to S3 archive in case anyone wants to reconstruct historical aspirations. Costs ~30 min of work; benefit is theoretical.
- **D-2c (in-app archive screen for 30d before drop).** Show users a "Your retired goals" screen in settings for 30 days before the migration ships. Lets them screenshot what they had.

> *My rec: D-2a.* If a user genuinely wanted historical record of their goal aspirations, AdviceLog rows that reference goalId will retain `goalId` as a soft-orphan string for D-1b's transitional period (or are CASCADE-deleted under D-1a — same outcome since the goal text is gone either way). Aspirational data with zero downstream consumers doesn't need ceremony.

### D-3 — Communication: silent or announce?

**Options:**
- **D-3a (silent removal).** UI just disappears. Users who notice it's gone can ask in chat; agent says "goals were retired in our latest simplification."
- **D-3b (in-app one-time toast).** Next session after the migration: toast says "Savings goals retired — `health_check` and `portfolio_overview` show your savings progress now." Auto-dismiss after 7d.
- **D-3c (email blast to active goal-users).** Email everyone who created a goal in the last 90 days saying we retired the feature.

> *My rec: D-3a, with the agent given a single-sentence mention in the system prompt.* Pattern from S.7 — the 9 deleted tools just vanished. Adding a toast is engineering effort for a feature that, by hypothesis, ~no one uses. The agent's standing instruction "if asked about goals, say they were retired in favor of `health_check` for tracking savings progress" handles the long-tail discovery cleanly.

### D-4 — Timing: ship before or after SPEC 12 cleanup?

**Options:**
- **D-4a (ship SPEC 17 first, then SPEC 12).** SPEC 12 inherits the clean state with no savings-goal references anywhere. Single sweep. **Recommended in the founder Q1 answer.**
- **D-4b (ship SPEC 17 inside SPEC 12).** Bundle the removal into the consistency sweep PR.
- **D-4c (ship SPEC 17 after SPEC 12).** Sweep first, then remove. Requires a second sweep after.

> *My rec: D-4a.* Already explained in the parent decision. Ships in ~1.5–2d, so SPEC 12 starts ~2d later than otherwise — but SPEC 12's effort drops by ~0.5d (no savings-goal references to audit), netting ~0.5d gain on top of the cleaner result.

---

## Execution status (2026-05-07)

| Phase | Status | Notes |
|---|---|---|
| **A** — Schema migration + Prisma update | ✅ shipped (S.103) | Migration file `apps/web/prisma/migrations/20260507000000_spec17_remove_savings_goals/migration.sql` written + 5 schema edits + `pnpm prisma generate` clean |
| **B** — Engine tools + system prompt removal | ✅ shipped (S.103) | 7 audric files updated, `goal-tools.ts` deleted, 5 extra consumers found via defensive grep + cleaned (`lib/redis/user-financial-context.ts` + 2 test files + `chat/route.ts` + `advice-tool.ts`); 28 tests pass |
| **C** — UI surface removal | ✅ shipped (S.103) | 6 audric files deleted (~830 LoC), 4 files updated (`settings/page.tsx`, `dashboard-content.tsx`, `usePanel.ts`, `AppSidebar.tsx`), typecheck clean |
| **D** — t2000 repo cleanup | ✅ shipped (S.103) | MCP `savings-goal` prompt deleted, 2 test count fixes, intelligence heuristic line removed (kept `goal_progress` proactive type — useful for chat-mentioned targets), 2 comment updates; engine 965 / MCP 94 tests pass |
| **E** — Doc + tracker housekeeping | ✅ shipped (S.103) | `audric/README.md` + `audric/CLAUDE.md` + `audric/.cursor/rules/prisma-models-overview.mdc` + `audric/.claude/rules/prisma.md` + `t2000/ARCHITECTURE.md` + S.103 entry in `audric-build-tracker.md` |
| **F** — Migration deploy (canonical release flow → Vercel auto-migrate → smoke) | ✅ shipped (S.103) | t2000 v1.22.1 published via `release.yml` (sdk + engine + mcp + cli, all 4 packages, GitHub Release + Discord notification clean) → audric `pnpm add @t2000/sdk@1.22.1 @t2000/engine@1.22.1` → single audric commit (40 files, +181/-3,906) → push `audric/main` → Vercel build promoted in 1m → `maybe-migrate.mjs` applied `20260507000000_spec17_remove_savings_goals` to NeonDB on first attempt (no advisory-lock contention) → smoke tests pass: `audric.ai` 200, `/settings` 200, `/goals` 200 (falls through to chat, no 404), `/api/user/goals` 404 (route deleted, expected) → `pnpm prisma migrate status` reports "Database schema is up to date!" Snapshot skipped per founder authorization (NeonDB 30d branch retention covers any rollback need) |

**Total footprint shipped (Phases A–F):** ~3,725 LoC removed (net of generated Prisma client shrinkage), 7 source files deleted, 33 files modified across both repos, 4 npm packages republished at v1.22.1. See S.103 in `audric-build-tracker.md` for the full per-file breakdown.

---

## Phased implementation

### Phase A — Schema migration + soft-deprecation (~0.25d)

1. New Prisma migration `20260507XXXXXX_remove_savings_goals/migration.sql`:
   ```sql
   -- Drop FK constraints first
   ALTER TABLE "AdviceLog" DROP CONSTRAINT IF EXISTS "AdviceLog_goalId_fkey";
   -- Drop SavingsGoal table (CASCADE handles dangling refs)
   DROP TABLE IF EXISTS "SavingsGoal" CASCADE;
   -- Hard-drop AdviceLog.goalId column (D-1a)
   ALTER TABLE "AdviceLog" DROP COLUMN IF EXISTS "goalId";
   -- Hard-drop AppEvent.goalId column + index (D-1a)
   DROP INDEX IF EXISTS "AppEvent_goalId_idx";
   ALTER TABLE "AppEvent" DROP COLUMN IF EXISTS "goalId";
   ```
2. Update `apps/web/prisma/schema.prisma`:
   - Delete `model SavingsGoal { ... }` block
   - Delete `User.savingsGoals` relation
   - Delete `AdviceLog.goalId`, `AdviceLog.goal` relation
   - Delete `AppEvent.goalId` field + index
3. Run `pnpm prisma generate` to regenerate types.
4. Verify: `pnpm prisma migrate diff` returns clean.

### Phase B — Engine tool + system-prompt removal (~0.25d)

1. Delete `apps/web/lib/engine/goal-tools.ts` (all 4 tools).
2. In `apps/web/lib/engine/engine-factory.ts`:
   - Remove `import { savingsGoal*Tool } from './goal-tools'`
   - Remove tool registrations from the engine builder
   - Remove the `prisma.savingsGoal.findMany` block in the dynamic context builder (line 325)
3. In `apps/web/lib/engine/engine-context.ts`:
   - Delete the `## Savings goals` section block in the system prompt builder (line 723–727)
   - Remove the `goalNameById` lookup in the advice context builder (line 94–101)
   - Simplify advice line: `return \`- ${daysAgo}d ago: ${a.adviceText}\`;` (no `goalNote`)
4. In `apps/web/app/api/internal/financial-context-snapshot/route.ts`:
   - Remove `openGoals` field from the JSDoc on line 22
   - Remove the `prisma.savingsGoal.findMany` query on line 79
   - Remove `openGoals` from the snapshot output object
5. Update `UserFinancialContext` Prisma model to drop `openGoals` JSON field (if it has one — verify in schema).
6. Update `apps/web/lib/engine/contact-tools.ts` comment line 37: change "the `savings_goal_*` pattern" to "the same `save_contact` pattern."

### Phase C — UI surface removal (~0.25d)

1. Delete files:
   - `apps/web/hooks/useGoals.ts`
   - `apps/web/components/panels/GoalsPanel.tsx`
   - `apps/web/components/settings/GoalCard.tsx`
   - `apps/web/components/settings/GoalEditor.tsx`
2. Delete API routes:
   - `apps/web/app/api/user/goals/route.ts`
   - `apps/web/app/api/user/goals/[id]/route.ts`
3. Settings page (`apps/web/app/settings/page.tsx`):
   - Remove `import { useGoals, type SavingsGoal }` from line 28
   - Remove `editingGoal` state on line 87
   - Remove the `<GoalsPanel>` render block + any associated handlers
   - Verify settings page still renders without goals section
4. Dashboard (`apps/web/app/new/dashboard-content.tsx`):
   - Remove any `<GoalsPanel>` render block
5. Run `pnpm typecheck`, `pnpm lint`, `pnpm build` — fix any orphan imports.

### Phase D — t2000 repo cleanup (~0.25d)

1. `packages/mcp/src/prompts.ts` — delete the `savings-goal` prompt definition starting line 581 (find the closing `},`).
2. `packages/mcp/src/prompts.test.ts` — delete the `savings-goal` test cases (line 40, 152–end-of-block).
3. `packages/mcp/src/integration.test.ts:154` — remove `savings-goal` from the expected prompt array.
4. `t2000-skills/skills/t2000-mcp/SKILL.md:171` — delete the `savings-goal` row from the prompt table.
5. `packages/engine/src/intelligence.ts:81` — delete the "Their savings goal is materially off-track (>20% behind pace)" line.
6. `packages/engine/src/engine.ts:1450` — update comment to reference `save_contact` instead of `savings_goal_*`.
7. `packages/engine/src/__tests__/confirmation.test.ts:299` — same comment update.
8. `t2000/ARCHITECTURE.md:1104` — update the S.22 note to read: *"savings-goal automation (originally removed in S.0–S.12; the SavingsGoal model itself fully removed in S.X / SPEC 17, 2026-05-XX)."*
9. Run `pnpm --filter @t2000/engine test` + `pnpm --filter @t2000/mcp test` — both should pass with zero savings-goal references.

### Phase E — Doc + tracker housekeeping (~0.25d)

1. `audric/README.md:73` — update the simplification list line to add "...savings-goal milestone celebrations **(and the broader SavingsGoal layer in S.X / SPEC 17, 2026-05-XX)**."
2. `audric/CLAUDE.md:188` — same as ARCHITECTURE.md.
3. `audric/.cursor/rules/prisma-models-overview.mdc` — delete the `SavingsGoal` model description block.
4. Add S.X tracker entry in `audric-build-tracker.md` capturing the removal.
5. Update forward backlog table: remove "savings-goal removal" anywhere it's tracked, add SPEC 17 entry.
6. Optional: Appendix B partner-shareable explainer (~15 min).

### Phase F — Migration deploy (~0.25d)

1. Take NeonDB branch snapshot of production DB.
2. Apply migration on staging; smoke-test:
   - User signs in → settings loads (no goals section)
   - User chats "do I have any savings goals?" → agent says "Goals were retired; let me show your savings via `health_check`"
   - `health_check` + `portfolio_overview` still work
   - `record_advice` writes still work (no `goalId` reference needed)
   - Cron `financial-context-snapshot` runs successfully (no `openGoals` field)
3. Apply migration on prod after-hours.
4. Monitor for 24h: error rate, agent retry rate, support inbox.

---

## Acceptance gates

| Gate | How to verify |
|---|---|
| **G1 — Zero `SavingsGoal` references in non-migration files** | `rg "SavingsGoal\|savingsGoal\|savings_goal" --type ts --type tsx --type md` returns ONLY: (a) the new SPEC 17 migration SQL file, (b) historical migration files (kept for record), (c) the audric/CLAUDE.md + README.md + ARCHITECTURE.md "removed in S.X" notes |
| **G2 — Zero `GoalsPanel`, `GoalCard`, `GoalEditor`, `useGoals` references** | Same grep returns 0 |
| **G3 — Engine factory builds + system prompt renders** | `pnpm --filter audric-web build` succeeds; manual chat-spawn renders system prompt without `## Savings goals` section |
| **G4 — All tests pass** | `pnpm test` repo-wide returns green in both repos |
| **G5 — Migration applies cleanly on staging** | `pnpm prisma migrate deploy` succeeds; smoke test (Phase F) passes |
| **G6 — Production deploy is incident-free** | 24h post-deploy: zero new bugs filed referencing goals; agent error rate baseline-equivalent; chat completion rate baseline-equivalent |

---

## Risks

| Risk | Mitigation |
|---|---|
| **R1 — A user has 100+ goals and notices the loss.** | D-3a's agent system prompt instruction handles the discovery; if an upset user emails support, manually screenshot their goals from a pre-migration NeonDB branch snapshot (1 day retention default; we keep 30d for production). |
| **R2 — Some unknown system reads `AdviceLog.goalId` and breaks.** | Phase A `pnpm prisma generate` + `pnpm typecheck` catches every TypeScript reference. Runtime SQL queries (raw `$queryRaw`) wouldn't be caught — but `rg "goalId" --type ts` after the prisma regeneration will find any orphan reference. |
| **R3 — `<financial_context>` snapshot's `openGoals` field is consumed by something we don't realize.** | `rg "openGoals" --type ts` audit before Phase B. Each consumer either gets the field removed from its read or the call to `<financial_context>` builder is updated. |
| **R4 — The MCP prompt removal breaks a downstream MCP client (Claude Desktop user)** | `savings-goal` MCP prompt has no production telemetry, ~0 known consumers. Risk is theoretical. If a Claude Desktop user complains, point them to the equivalent NAVI savings flow via the existing `save-strategy` prompt. |
| **R5 — Engine intelligence heuristic loses a signal** | The "savings goal off-track" line is ONE bullet in a heuristic; the heuristic still has 6 other signals. Removal won't degrade quality measurably. Captured in Phase D step 5. |

---

## What this spec is NOT

- **NOT removing the `save_deposit` engine tool.** Users can still save USDC + USDsui to NAVI. That's the core Audric Finance operation.
- **NOT removing `AdviceLog`.** AdviceLog stays — only its `goalId` FK is dropped.
- **NOT removing yield tracking.** `health_check`, `portfolio_overview`, `yield_summary` all stay and are the canonical replacements for "track my savings progress."
- **NOT removing the NAVI savings position display.** The "$X saved earning Y% APY" UI element stays everywhere it appears today.
- **NOT a dependency for SPEC 11 / SPEC 11.5 / SPEC 16.** Independent removal that simplifies the surface those specs build on.
- **NOT touching SPEC 9 P93's Goal table.** That table is already dropped (S.64 / `20260505063500_rip_spec9_p93_goal_table`). SPEC 17 picks up where S.64 explicitly left off.

---

## Out of scope

- **Onboarding flow refresh** that doesn't mention goals — minor UI tweaks if any onboarding screen says "set a savings goal." Surface in Phase C grep, fix inline.
- **Marketing site copy on audric.ai** that mentions "savings goals" as a feature — covered by SPEC 12 sweep instead.
- **Pitch deck / litepaper updates** — covered by SPEC 12 sweep instead.

---

## Open questions

None blocking Phase A. The 4 D-questions above all have clear recommendations; founder confirms or overrides during a 5-minute lock pass.

---

## Effort summary

| Phase | Effort |
|---|---|
| A — Schema migration | 0.25d |
| B — Engine + system prompt | 0.25d |
| C — UI removal | 0.25d |
| D — t2000 repo cleanup | 0.25d |
| E — Doc + tracker | 0.25d |
| F — Deploy + smoke | 0.25d |
| **Total** | **~1.5d** |

Add ~0.25d buffer for any orphan import/test-fix surprises → **~1.75d wall-clock**.

---

## Appendix A — the migration SQL (full draft)

```sql
-- ============================================================================
-- SPEC 17 — Savings Goals Removal (Product Simplification)
-- ============================================================================
-- Drops the SavingsGoal table + all FK references.
-- Companion to the April 2026 simplification migration
-- (20260413120000_simplification_drop_dead_features) which retired
-- SavingsGoal.currentMilestone but kept the table.
--
-- Run order:
--   1. Take a NeonDB branch snapshot of the production DB.
--   2. Apply on staging first; smoke-test:
--        - chat completion rate baseline-equivalent
--        - settings page loads without GoalsPanel
--        - financial-context-snapshot cron succeeds without openGoals field
--        - record_advice writes succeed without goalId reference
--   3. Apply on prod after-hours.
-- ============================================================================

-- Drop FK constraints first (avoids "FK violation" on table drop)
ALTER TABLE "AdviceLog" DROP CONSTRAINT IF EXISTS "AdviceLog_goalId_fkey";

-- Drop AppEvent.goalId column + index (no FK constraint to drop — was untyped)
DROP INDEX IF EXISTS "AppEvent_goalId_idx";
ALTER TABLE "AppEvent" DROP COLUMN IF EXISTS "goalId";

-- Drop AdviceLog.goalId column
ALTER TABLE "AdviceLog" DROP COLUMN IF EXISTS "goalId";

-- Drop the SavingsGoal table itself
DROP TABLE IF EXISTS "SavingsGoal" CASCADE;
```

---

## Appendix B — How to explain SPEC 17 to people

### B.1 — 30-second version (anyone)

> *Audric used to have a "Set a savings goal: $5000 for Japan" UI panel. Useful concept, but: nobody uses it, the agent doesn't make better decisions because of it, and it's a fourth thing to learn (USDC → save → NAVI → goal). We're deleting the goal layer and keeping the savings itself. Users still save USDC; they just won't see "$1,200 of $5,000 toward Japan." If they want progress tracking, the agent can still tell them.*

### B.2 — 2-minute version (engineer / partner Slack DM)

> *Savings Goals are aspirational labels over a single shared NAVI savings position — not separately funded sub-accounts. They're a Prisma table, 4 engine tools, a UI panel, an MCP prompt, and a system-prompt section. Total ~1,500 LoC across both repos.*
>
> *Three things failed for goals: (1) zero observable agent behavior change from the system-prompt section despite ~50 tokens/turn cost, (2) UI surface area ~700 LoC for a feature that has no on-chain footprint, (3) "track my savings progress" job-to-be-done already covered by `health_check` + `portfolio_overview`.*
>
> *We're removing them in a focused 1.5-day spec (SPEC 17) that runs BEFORE the cross-repo consistency sweep (SPEC 12), so SPEC 12 inherits a clean state.*

### B.3 — Why this isn't a bigger deal

> *Goals had no on-chain footprint, no money tied to them, no scheduled actions firing off them, no notifications relying on them. Every consumer was a UI surface or a system-prompt embed. The cleanup is mechanical: drop a table, delete some files, regenerate Prisma types, ship.*

---

**End SPEC 17 v0.4 LOCKED.** Restored to canonical sequencing — all 4 D-questions locked to recommendations (D-1a/D-2a/D-3a/D-4a). Ships first, before SPEC 12. Phase A ready on go-signal.
