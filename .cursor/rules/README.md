# .cursor/rules

Cursor IDE rules, auto-applied by Cursor via its MDC convention (`description`, `globs`, `alwaysApply` front-matter). Each `.mdc` file describes cross-cutting engineering constraints that should apply regardless of which file you're editing.

## Always-applied (every task)

| File | What it covers |
|------|---------|
| `engineering-principles.mdc` | Trace the path, single source of truth, fix at the root, layer awareness |
| `goal-driven-execution.mdc` | Verifiable goals, multi-step plans, ask vs proceed |
| `coding-discipline.mdc` | Think before coding, simplicity first, surgical changes (Karpathy) |
| `single-source-of-truth.mdc` | Canonical fetchers + ESLint enforcement |
| `env-validation-gate.mdc` | Every env var goes through Zod schema, never raw `process.env` |
| `safeguards-defense-in-depth.mdc` | Engine preflight + guards + USD permission resolver |
| `agent-harness-spec.mdc` | Spec 1 + Spec 2 contracts (attemptId, TurnMetrics, modifiableFields) |
| `financial-amounts.mdc` | Always floor display amounts, never round up |
| `savings-usdc-only.mdc` | Saves/borrows are USDC-only |
| `token-data-architecture.mdc` | Canonical token data sources (TOKEN_MAP, COIN_REGISTRY) |

## Glob-scoped (apply when editing matching files)

| File | Scope |
|------|---------|
| `engine-tool-development.mdc` | `packages/engine/src/tools/**/*.ts` — tool factory, permission levels, flags, preflight |
| `blockvision-resilience.mdc` | `packages/engine/src/**/*.ts` — retry, circuit breaker, sticky cache |
| `cron-job-architecture.mdc` | `apps/server/src/cron/**/*.ts` — t2000 cron → audric internal API contract |
| `metrics-and-monitoring.mdc` | Reference — TurnMetrics, SessionUsage, dashboards |

## Relationship to `CLAUDE.md` and `.claude/rules/`

- `CLAUDE.md` (repo root) is the primary spec for Claude Code sessions, auto-loaded every turn.
- `.claude/rules/*.md` holds per-subsystem notes (packages, gateway) — not auto-loaded; reference material.
- Files here are the IDE-layer rules auto-applied by Cursor.

If a rule needs to apply in both Cursor and Claude Code, prefer putting it in `CLAUDE.md` and linking to the `.mdc` from there (the root `CLAUDE.md § Key Documents` section does this).
