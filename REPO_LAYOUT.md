# t2000 Repo Layout

> **Single source of truth for "where does X go?" in this monorepo.**

This is the public-facing layout reference.

## Top-level structure

```
t2000/
├── README.md, LICENSE, CLAUDE.md           ← entry points
├── ARCHITECTURE.md                          ← system architecture
├── REPO_LAYOUT.md                           ← this file (contributor "where does X go?")
├── SECURITY.md                              ← disclosure policy
├── apps/                                    ← deployable apps
│   ├── docs/                                (developers.t2000.ai — Mintlify docs site)
│   ├── gateway/                             (MPP API gateway — mpp.t2000.ai)
│   └── web/                                 (t2000.ai marketing site)
├── packages/                                ← npm packages
│   ├── cli/                                 (@t2000/cli)
│   ├── engine/                              (@t2000/engine — agent engine)
│   ├── mcp/                                 (@t2000/mcp)
│   └── sdk/                                 (@t2000/sdk)
├── t2000-skills/                            ← agent skills (canonical SKILL.md source)
├── patches/                                 ← pnpm patches
└── tsconfig.base.json, turbo.json,          ← workspace config
    package.json, pnpm-workspace.yaml
```

> Internal product specs, design decisions, and runbooks live in a local-only `spec/` tree that is not part of the public repo. Ask the maintainers if you need access. Founder-local marketing artifacts (litepaper, decks) live in a gitignored `docs/marketing/` folder.

## Where does X go?

| If X is a... | Put it in... |
|---|---|
| Public developer docs page (setup, API ref, examples) | `apps/docs/<slug>.mdx` (Mintlify; deploys to `developers.t2000.ai`) |
| Marketing artifact (litepaper, deck) | `docs/marketing/<NAME>.md` (gitignored) |
| Package README | `packages/<pkg>/README.md` |
| App README | `apps/<app>/README.md` |

All public developer docs live in `apps/docs/` (Mintlify). There is no public `docs/` folder — the `docs/marketing/` path exists only as a gitignored convenience for founder-local marketing artifacts.

If a file would go at the repo root and it's not on the allowlist below, push it into one of the above subdirectories instead.

## Root-level allowlist

These are the ONLY files that should live at repo root (everything else moves to a subdir):

| File | Purpose |
|---|---|
| `README.md` | Public landing page |
| `LICENSE` | MIT |
| `CLAUDE.md` | Agent context (loaded every session by Claude Code) |
| `ARCHITECTURE.md` | System architecture reference |
| `REPO_LAYOUT.md` | Contributor "where does X go?" SSOT (this file) |
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

- `audric/apps/web-v2/docs/` — runbooks, post-mortems, security advisories, regression matrices
- `audric/.cursor/rules/` — workspace rules (loaded every session)
- `audric/.claude/rules/` — Claude Code rules
- `audric/scripts/` — operational scripts (smoke, env-parity, dump-session)

## Linked references

- `CLAUDE.md` "Key Documents" section — pointer table from agent context
- `audric/CLAUDE.md` — sister repo analogue
