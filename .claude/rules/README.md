# .claude/rules

Per-subsystem notes, loaded as project instructions alongside `CLAUDE.md` (the
primary SSOT). Keep them short — everything here costs context on every turn.

| File | Scope |
|------|-------|
| `packages.md` | Per-package conventions across the 5-package stack — entry points, surfaces, commit scopes, publishing. |
| `gateway.md` | `apps/gateway` — MPP payment verification patterns, payment reporting, validation checks. |

## Relationship to the rest of `.claude/`

| Path | What it's for |
|---|---|
| `CLAUDE.md` | Always-on: architecture, critical rules, engineering discipline, release process |
| `.claude/skills/*/SKILL.md` | Rule **depth** — loaded only when the task matches the skill description |
| `.claude/commands/*.md` | Rituals: `/release` · `/ship` · `/tracker` · `/next` |
| **`.claude/rules/*.md`** | **Small always-on subsystem notes** (this directory) |

The dividing line: if it's long, conditional, or only relevant to one kind of task,
it belongs in a **skill** (pay-per-use context). If it's a few lines that every turn
in this repo benefits from, it can live here. If it's universal, put it in
`CLAUDE.md`.

## Relationship to `.cursor/rules/`

As of 2026-07-24, `.cursor/rules/*.mdc` are **pointers into `.claude/`**, not
content — Claude Code has no `.mdc` loader, so keeping rule bodies there meant they
were silently absent from every Claude Code session. Edit the `.claude/` file; the
Cursor pointer doesn't need to change. See `.cursor/rules/README.md`.

## Policy

- Keep each file short and subsystem-scoped.
- **Don't contradict `CLAUDE.md`.** Both load every turn; a conflict here is worse
  than an omission. (`packages.md` used to tell you to `npm publish` locally, which
  `CLAUDE.md § Release process` forbids — that class of bug is why this line exists.)
- Avoid hard-coded counts (test-suite sizes, tool totals, version numbers) — they go
  stale. Point at the authoritative source (`package.json`, the live endpoint, the
  source directory) instead.
- If content here duplicates `CLAUDE.md`, delete it here.
