# t2000 Repo Layout

> **Single source of truth for "where does X go?" in this monorepo.** Last updated 2026-05-18 (SPEC 38a v0.2 ship).

This is the public-facing layout reference. Internal SPEC-specific organization is documented in `spec/README.md` (internal).

## Top-level structure

```
t2000/
├── README.md, LICENSE, CLAUDE.md           ← entry points
├── ARCHITECTURE.md                          ← system architecture
├── SECURITY.md                              ← disclosure policy
├── apps/                                    ← deployable apps
│   ├── docs/                                (developers.t2000.ai — Mintlify docs site)
│   ├── gateway/                             (MPP API gateway — mpp.t2000.ai)
│   ├── server/                              (backend API)
│   └── web/                                 (t2000.ai marketing site)
├── packages/                                ← npm packages
│   ├── cli/                                 (@t2000/cli)
│   ├── engine/                              (@t2000/engine — agent engine)
│   ├── mcp/                                 (@t2000/mcp)
│   └── sdk/                                 (@t2000/sdk)
├── t2000-skills/                            ← agent skills (canonical SKILL.md source)
├── docs/                                    ← public-facing docs
│   ├── REPO_LAYOUT.md                       (this file)
│   ├── mcp-setup.md                         (MCP setup instructions)
│   ├── open-model-benchmark.md
│   ├── marketing/                           (litepaper, etc.)
│   ├── claude-desktop.json
│   └── cursor-mcp.json
├── spec/                                    ← internal specs + reference + runbooks + archive
│   └── README.md                            (internal layout SSOT)
├── infra/, patches/                         ← infra + tooling
└── tsconfig.base.json, turbo.json,          ← workspace config
    package.json, pnpm-workspace.yaml
```

## Where does X go?

| If X is a... | Put it in... |
|---|---|
| Public-facing doc (anyone on GitHub should see) | `docs/<NAME>.md` |
| Marketing artifact (litepaper, deck) | `docs/marketing/<NAME>.md` |
| Operational runbook (incident response, deploy procedure) | `spec/runbooks/RUNBOOK_<name>.md` |
| Reference doc (CLI UX contract, telemetry baseline) | `spec/reference/<NAME>.md` |
| Active SPEC | `spec/active/SPEC_N_<name>.md` (gitignored by default) |
| Shipped SPEC | `spec/archive/<version>/SPEC_N_<name>.md` |
| Package README | `packages/<pkg>/README.md` |
| App README | `apps/<app>/README.md` |
| Public developer docs page | `apps/docs/<slug>.mdx` (Mintlify; deploys to `developers.t2000.ai`) |

If a file would go at the repo root and it's not on the allowlist below, push it into one of the above subdirectories instead.

## Root-level allowlist

These are the ONLY files that should live at repo root (everything else moves to a subdir):

| File | Purpose |
|---|---|
| `README.md` | Public landing page |
| `LICENSE` | MIT |
| `CLAUDE.md` | Agent context (loaded every session by Claude Code) |
| `ARCHITECTURE.md` | System architecture reference |
| `SECURITY.md` | Security disclosure policy |
| `.gitignore`, `.npmrc`, `.prettierrc` | Tooling config |
| `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | Workspace |
| `tsconfig.base.json`, `turbo.json`, `glama.json` | Build config |
| `install.sh` | One-shot installer |

Plus founder-local truth source (gitignored, not visible publicly):
- `audric-build-tracker.md` (build progress log, ~3 MB rotation policy)
- `audric-roadmap.md` (product roadmap)
- `HANDOFF_NEXT_AGENT.md` (agent context handoff, ~7d rotation policy)
- `.smoke-*` (live smoke tooling)
- `.env.local`, `.env.example`

## audric repo (sister repo, separate clone)

See `audric/CLAUDE.md` for analogous layout. Key conventions:

- `audric/apps/web/docs/` — runbooks, post-mortems, security advisories, regression matrices
- `audric/.cursor/rules/` — workspace rules (loaded every session)
- `audric/.claude/rules/` — Claude Code rules
- `audric/scripts/` — operational scripts (smoke, env-parity, dump-session)

## Linked references

- `spec/README.md` — internal SPEC layout SSOT (gitignored areas + promotion rules)
- `CLAUDE.md` "Key Documents" section — pointer table from agent context
- `audric/CLAUDE.md` — sister repo analogue
