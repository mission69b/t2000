# .cursor/rules

Cursor IDE rules, auto-applied by Cursor via its MDC convention (`description`, `globs`, `alwaysApply` front-matter). Each `.mdc` file describes cross-cutting engineering constraints that should apply regardless of which file you're editing.

| File | Applies |
|------|---------|
| `engineering-principles.mdc` | Every task — scalability, single source of truth, trace-before-fix. |
| `token-data-architecture.mdc` | Adding tokens, fixing decimal/display bugs. Canonical token data sources (`TOKEN_MAP`, `SUPPORTED_ASSETS`). |
| `savings-usdc-only.mdc` | Savings / lending flows — USDC is the only supported asset into NAVI lend. |
| `financial-amounts.mdc` | Any code touching user-facing amount formatting. |
| `audric-transaction-flow.mdc` | Sponsored tx vs SDK-direct paths — which runs when. |

## Relationship to `CLAUDE.md` and `.claude/rules/`

- `CLAUDE.md` (repo root) is the primary spec for Claude Code sessions, auto-loaded every turn.
- `.claude/rules/*.md` holds per-subsystem notes (packages, gateway) — not auto-loaded; reference material.
- Files here are the IDE-layer rules auto-applied by Cursor.

If a rule needs to apply in both Cursor and Claude Code, prefer putting it in `CLAUDE.md` and linking to the `.mdc` from there (as the root `CLAUDE.md § Key Documents` section does today for `engineering-principles.mdc`, `token-data-architecture.mdc`, and `audric-transaction-flow.mdc`).
