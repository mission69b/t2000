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
| `metrics-and-monitoring.mdc` | Reference — TurnMetrics, SessionUsage, dashboards |

## Skill mirrors (description-matched, surface skill content to Cursor)

One `.mdc` per file in `t2000-skills/skills/<name>/SKILL.md`. Cursor auto-pulls them into agent context when the user's request matches the rule's `description`. Bodies mirror their source SKILL.md verbatim — the only delta is the YAML frontmatter (Cursor MDC convention vs the Anthropic Skills convention).

| Cursor rule | Source of truth |
|---|---|
| `t2000-setup.mdc` | `t2000-skills/skills/t2000-setup/SKILL.md` |
| `t2000-mcp.mdc` | `t2000-skills/skills/t2000-mcp/SKILL.md` |
| `t2000-check-balance.mdc` | `t2000-skills/skills/t2000-check-balance/SKILL.md` |
| `t2000-receive.mdc` | `t2000-skills/skills/t2000-receive/SKILL.md` |
| `t2000-send.mdc` | `t2000-skills/skills/t2000-send/SKILL.md` |
| `t2000-swap.mdc` | `t2000-skills/skills/t2000-swap/SKILL.md` |
| `t2000-pay.mdc` | `t2000-skills/skills/t2000-pay/SKILL.md` |
| `t2000-services.mdc` | `t2000-skills/skills/t2000-services/SKILL.md` |

**When editing a skill**: update the canonical `SKILL.md` in `t2000-skills/skills/<name>/` AND mirror the body change into the matching `.cursor/rules/t2000-<name>.mdc`. Frontmatter stays Cursor-flavored. If drift becomes painful, add a `pnpm sync:skill-rules` script that regenerates the bodies from `SKILL.md`.

## Relationship to `CLAUDE.md` and `.claude/rules/`

- `CLAUDE.md` (repo root) is the primary spec for Claude Code sessions, auto-loaded every turn.
- `.claude/rules/*.md` holds per-subsystem notes (packages, gateway) — not auto-loaded; reference material.
- Files here are the IDE-layer rules auto-applied by Cursor.

If a rule needs to apply in both Cursor and Claude Code, prefer putting it in `CLAUDE.md` and linking to the `.mdc` from there (the root `CLAUDE.md § Key Documents` section does this).
