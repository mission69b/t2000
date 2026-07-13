# t2000 Repo Layout

> **Single source of truth for "where does X go?" in this monorepo.**

This is the public-facing layout reference.

## Top-level structure

```
t2000/
├── README.md, LICENSE, CLAUDE.md           ← entry points
├── PRODUCT.md                               ← the product map (2 products · customers · paths in)
├── ARCHITECTURE.md                          ← system architecture
├── REPO_LAYOUT.md                           ← this file (contributor "where does X go?")
├── SECURITY.md                              ← disclosure policy
├── apps/                                    ← deployable apps
│   ├── docs/                                (developers.t2000.ai — Mintlify docs site)
│   ├── gateway/                             (MPP API gateway — mpp.t2000.ai)
│   ├── verify/                              (verify.t2000.ai — public confidential-receipt explorer + paste-to-verify)
│   └── web/                                 (t2000.ai marketing site)
├── packages/                                ← npm packages (3 published: sdk, cli, mcp)
│   ├── cli/                                 (@t2000/cli)
│   ├── mcp/                                 (@t2000/mcp)
│   └── sdk/                                 (@t2000/sdk)
│   # design tokens live in design-tokens/tokens.css (copy-in, no package)
├── t2000-skills/                            ← agent skills (canonical SKILL.md source)
└── tsconfig.base.json, turbo.json,          ← workspace config
    package.json, pnpm-workspace.yaml
```

> Internal product specs, design decisions, and runbooks live in a local-only `spec/` tree that is not part of the public repo. Ask the maintainers if you need access.
## Where does X go?

| If X is a... | Put it in... |
|---|---|
| Public developer docs page (setup, API ref, examples) | `apps/docs/<slug>.mdx` (Mintlify; deploys to `developers.t2000.ai`) |
| Package README | `packages/<pkg>/README.md` |
| App README | `apps/<app>/README.md` |

All public developer docs live in `apps/docs/` (Mintlify). There is no public `docs/` folder.

If a file would go at the repo root and it's not on the allowlist below, push it into one of the above subdirectories instead.

## Root-level allowlist

These are the ONLY files that should live at repo root (everything else moves to a subdir):

| File | Purpose |
|---|---|
| `README.md` | Public landing page |
| `LICENSE` | MIT |
| `CLAUDE.md` | Agent context (loaded every session by Claude Code) |
| `PRODUCT.md` | The product map — 2 products, their customers, the one path into each |
| `ARCHITECTURE.md` | System architecture reference |
| `REPO_LAYOUT.md` | Contributor "where does X go?" SSOT (this file) |
| `SECURITY.md` | Security disclosure policy |
| `.gitignore`, `.npmrc`, `.prettierrc`, `.nvmrc` | Tooling config (`.nvmrc` pins node 22 — matches CI; node 25+ breaks native deps like sqlite3 + mintlify) |
| `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | Workspace |
| `tsconfig.base.json`, `turbo.json`, `glama.json` | Build config |
| `install.sh` | One-shot installer |

Plus founder-local truth source (gitignored, not visible publicly):
- `audric-build-tracker.md` (build progress log, ~3 MB rotation policy)
- `PRODUCT_ROADMAP.md` (whole-product master roadmap)
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
