# .claude/rules

Supplementary per-subsystem notes for Claude Code sessions. The primary source of truth is `CLAUDE.md` at the repo root — it is auto-loaded every turn. Files here are *not* auto-loaded; treat them as reference material to read when working in the named subsystem.

| File | Scope |
|------|-------|
| `packages.md` | Per-package conventions (CLI, SDK, engine, MCP) — entry points, scopes, publishing. |
| `gateway.md` | `apps/gateway` — MPP payment verification patterns, payment reporting, validation checks. |

## Relationship to `.cursor/rules/`

`.cursor/rules/*.mdc` are Cursor IDE rules (auto-applied by Cursor via its MDC convention). They cover cross-cutting concerns (engineering principles, financial amounts, token data architecture, USDC-only saves, transaction flow). Do **not** duplicate those rules here — if a rule needs to be universal, put it in `CLAUDE.md`.

## Policy

- Keep each file short and subsystem-scoped.
- Avoid hard-coded counts (test suite sizes, tool totals, version numbers) — they go stale quickly. Reference authoritative sources (`PRODUCT_FACTS.md`, package.json) instead.
- If content here duplicates `CLAUDE.md`, delete it here.
