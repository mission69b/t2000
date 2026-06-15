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
| `engine-tool-development.mdc` | **HISTORICAL** — `@t2000/engine` deleted S.442; kept for rationale only |
| `blockvision-resilience.mdc` | **HISTORICAL** — BlockVision left with engine; kept for rationale only |
| `metrics-and-monitoring.mdc` | Reference — TurnMetrics, SessionUsage, dashboards |

## Skills are NOT mirrored here

`t2000-skills/skills/<name>/SKILL.md` is the canonical source for the 8 user-facing skills (setup, mcp, check-balance, receive, send, swap, pay, services). They reach end users via two channels:

1. **`@t2000/mcp`** — skill bodies are baked into the npm bundle at build time and exposed as `skill-<name>` MCP prompts in any MCP-compatible client (Claude Desktop, Cursor, Windsurf, claude-code CLI, etc.) after `t2 mcp install`.
2. **`mission69b/t2000-skills`** — auto-synced from this repo via `.github/workflows/sync-skills.yml` for direct skill marketplace consumption.

We don't mirror them into `.cursor/rules/` because (a) the skills are *consumer* content while these rules are *contributor* engineering constraints — different altitude, different audience — and (b) mirroring creates a drift class for zero gain inside the contributor repo. If you need skill content while editing this repo, read `t2000-skills/skills/<name>/SKILL.md` directly.

## Relationship to `CLAUDE.md` and `.claude/rules/`

- `CLAUDE.md` (repo root) is the primary spec for Claude Code sessions, auto-loaded every turn.
- `.claude/rules/*.md` holds per-subsystem notes (packages, gateway) — not auto-loaded; reference material.
- Files here are the IDE-layer rules auto-applied by Cursor.

If a rule needs to apply in both Cursor and Claude Code, prefer putting it in `CLAUDE.md` and linking to the `.mdc` from there (the root `CLAUDE.md § Key Documents` section does this).
