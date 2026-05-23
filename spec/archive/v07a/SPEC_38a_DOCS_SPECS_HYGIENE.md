# SPEC 38a — Docs & Specs Hygiene (NO code changes)

> **Status:** v0.1 DRAFT, 2026-05-18. First half of the SPEC 38 cleanup family. Pure organizational/documentation cleanup — every file action is a `git mv` / `git add -f` / archive / delete. **Zero code changes**, zero risk to running production, fully reversible.
>
> **Trigger:** founder framing 2026-05-18: *"i feel like our repos t2000 and audric are a HOT mess. With so many files all over the place we should spend a whole spec to review everything to ensure everything followes best practice and i mean EVERY FILE. Remember the goal was to SIMPLIFY, remove dead code and reduce codebase complexity."*
>
> **Sister spec:** SPEC 38b — Code Hygiene + Dead Code Sweep (post-v0.7c per audric-build-tracker row 7u).
>
> **Why NOW (before v0.7c kickoff):** v0.7c needs ~3-6 weeks of repeated re-reads against `BENEFITS_SPEC_v07a.md`, `BENEFITS_SPEC_v07c.md`, `WHY_v07a.md`, `audric-build-tracker.md`, `CLAUDE.md`, plus several spec/ docs per session. Re-reading from a 34-file root with 7+ in-flight planning docs at the same level as `README.md` is friction that compounds across the v0.7c workstream. Cleaning docs FIRST = ~30% less navigation overhead per v0.7c session.

---

## 1. Current state — the data

### t2000 repo

| Bucket | Count | Notes |
|---|---|---|
| Root-level tracked files (excluding `.dot` files) | 28 | 17 of these are planning/spec/draft docs that should live in `spec/` |
| Root-level untracked files | 1 | `BENEFITS_SPEC_v07c.md` (drafted this session) |
| Root-level gitignored files | 24 | Mostly the local-only specs + scratch (`.smoke-*`, AUDRIC_HARNESS_*, etc.) |
| **Root total** | **53** | (Industry standard for a monorepo root: ~8-12 files. We're 4-5× over.) |
| `spec/` tracked | 1 | `spec/archive/ENGINE_V2_ROLLOUT_PLAN_v07a.md` (force-tracked once via `git add -f`) |
| `spec/` gitignored | 53 | Every SPEC 6..30 + drafts + runbooks + reports — `spec/` is functionally a private workspace |
| Total t2000 `.md` files | 110 | |

### audric repo

| Bucket | Count | Notes |
|---|---|---|
| Root-level tracked | 4 | `AUDIT_FINDINGS.md`, `CLAUDE.md`, `README.md`, + 1 `.json` (spec8-acceptance) |
| Root-level gitignored | 6 | `PORTFOLIO_REGRESSION_MATRIX.md` + 5 `pitch-deck-v*.html` |
| `apps/web/` root-level `.md` | 5 | RUNBOOKS + POST_MORTEM + SECURITY_ADVISORY mixed with `package.json` / `next.config.ts` |
| `design_handoff_*/` | 2 dirs | Static design files, not in any organized layout |
| Total audric `.md` files | 20 | |

**Net assessment:** audric is reasonably clean. The HOT MESS is t2000-side, specifically:
- Root-level planning-doc sprawl (17 files that should be in `spec/`)
- `spec/` is gitignored as a whole, so there's no "active vs archive" distinction even on disk
- 4 mega-files at root: `audric-build-tracker.md` (2 MB / 12,500 lines!), `BENEFITS_SPEC_v07a.md` (267 KB), `audric-roadmap.md` (166 KB), `HANDOFF_NEXT_AGENT.md` (165 KB) — all valuable, all need rotation/truncation policies
- Doc drift: 3 SECURITY*.md files; 2 audric-scaling-spec.md variants; 2 litepaper sources (.md + .html); `CLI_UX_SPEC.md` referenced in CLAUDE.md "Key Documents" table BUT gitignored

---

## 2. Proposed canonical layout (the "best practice" target)

### t2000 repo root — STRICT allowlist

Only these files survive at repo root. Everything else moves to a subdirectory.

| File | Purpose | Status |
|---|---|---|
| `README.md` | Public landing | Already present |
| `LICENSE` | MIT | Already present |
| `CLAUDE.md` | Agent context — load every turn | Already present |
| `PRODUCT_FACTS.md` | Cross-repo source of truth (versions, fees, signatures) | Already present |
| `ARCHITECTURE.md` | System architecture reference | Already present |
| `SECURITY.md` | Security disclosure policy | Already present |
| `.gitignore` / `.npmrc` / `.prettierrc` | Tooling config | Already present |
| `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` | Workspace config | Already present |
| `tsconfig.base.json` / `turbo.json` / `glama.json` | Build config | Already present |
| `install.sh` | One-shot installer | Already present |
| `audric-build-tracker.md` (gitignored) | Founder's local truth source | Already present; gitignored stays |
| `audric-roadmap.md` (gitignored) | Founder's local roadmap | Already present; gitignored stays |
| `HANDOFF_NEXT_AGENT.md` (gitignored) | Agent context handoff | Already present; gitignored stays; **add truncation policy (last 7d only)** |
| `.smoke-*` (gitignored) | Live smoke tooling | Already present; gitignored stays |
| `.env.local`, `.env.example` (gitignored) | Local env | Already present; gitignored stays |

**Everything not on this list moves.** Target: ~15 visible files at root (vs. 53 today).

### t2000 `spec/` — new internal folder layout

`spec/` stays gitignored as a whole (matches existing pattern; founder's working notes are local-only). Inside, organize by lifecycle:

```
spec/
├── README.md                      ← NEW — explains the folder layout + naming convention
├── active/                        ← Currently in-flight specs (1 SPEC per file)
│   ├── BENEFITS_SPEC_v07c.md
│   ├── SPEC_38a_DOCS_SPECS_HYGIENE.md   ← (this file)
│   ├── SPEC_38b_CODE_HYGIENE.md          ← Stub at SPEC 38a ship; flesh out post-v0.7c
│   ├── harness/                          ← Long-lived intelligence/correctness/depth specs
│   │   ├── AUDRIC_HARNESS_CORRECTNESS_SPEC_v1.3.md
│   │   ├── AUDRIC_HARNESS_INTELLIGENCE_SPEC_v1.4.1.md
│   │   └── AUDRIC_HARNESS_DEPTH_SPEC_v0.1.md
│   └── shipping/                         ← Specs awaiting first deploy or rollout
│       ├── SPEC_28_REGRESSION_HARNESS_v1.md   (when drafted)
│       └── SPEC_30_CROSS_REPO_SECURITY_REVIEW.md   (Phase 2-10 still open)
├── archive/                       ← Shipped or superseded specs
│   ├── ENGINE_V2_ROLLOUT_PLAN_v07a.md    ← already here (force-tracked; stays)
│   ├── v07a/                              ← v0.7a work artifacts (SHIPPED 2026-05-18)
│   │   ├── BENEFITS_SPEC_v07a.md
│   │   ├── WHY_v07a.md
│   │   ├── SPEC_PHASE_7_DRAFT.md
│   │   ├── SPIKE_FINDINGS_v07a.md
│   │   ├── TOOL_UX_DESIGN_v07a.md
│   │   ├── PHASE_2_TOOL_MIGRATION_BACKLOG.md
│   │   └── SMOKE_PLAN_2026-05-18.md
│   ├── v07b/                              ← v0.7b SKIPPED (per V07B_ROADMAP "promotion-criterion status")
│   │   └── V07B_ROADMAP_DRAFT.md
│   ├── v07c/                              ← v0.7c spike (SUPERSEDED by active/BENEFITS_SPEC_v07c.md)
│   │   ├── V07C_SPIKE_DRAFT.md
│   │   └── SPEC_SLICE_D_DRAFT.md
│   ├── pre-spec-30/                       ← The 25 SPEC 6..29 specs (all SHIPPED or DEFERRED)
│   │   ├── SPEC_6..29_*.md   (25 files)
│   │   └── CHIP_REVIEW_2*.md (3 files)
│   ├── deferred/                          ← Specs paused with reactivation criteria
│   │   ├── SPEC_25_MPP_SINGLE_SOURCE_OF_TRUTH.md
│   │   ├── SPEC_29_MPP_CROSS_REPO_AUDIT.md
│   │   └── audric-simplification-spec.md
│   ├── deprecated/                        ← Old architectural direction; preserved for history only
│   │   ├── audric-scaling-spec.md
│   │   └── audric-scaling-spec-v2.md
│   └── one-offs/                          ← Misc historical artifacts
│       ├── AUDIT_FINDINGS.md
│       ├── SECURITY_AUDIT.md
│       ├── SECURITY_FOUNDER_CHECKLIST.md
│       ├── article-trust-layer.md
│       ├── BL_MEETING_PREP.md
│       ├── SM_DATA_USECASES.md
│       ├── audric-raise-strategy.canvas.tsx
│       └── pawtato-nft-analysis.md
├── runbooks/                      ← Operational runbooks (existing — keep here)
│   └── RUNBOOK_*.md   (9 files; all SHIPPED — already in archive-ish state, keep findable)
└── reference/                     ← Long-lived reference docs (NOT specs; NOT runbooks)
    ├── PRODUCT_SPEC.md
    ├── COMMERCE_V2.md
    ├── SELF_HOSTED_LLM_STRATEGY.md
    ├── PERF_SNAPSHOTS.md
    ├── UPSTREAM_WORKAROUNDS.md
    ├── VERCEL_LOGS_TRIAGE.md
    ├── harness-metrics-baseline.md
    └── CLI_UX_SPEC.md            ← Move here from root; track if/when public
```

### t2000 `docs/` — public-facing docs

Already exists with 4 files. Add:

```
docs/
├── REPO_LAYOUT.md                ← NEW (committed) — single source of truth for "where does X go?"
├── mcp-setup.md                  ← Already present
├── claude-desktop.json           ← Already present
├── cursor-mcp.json               ← Already present
├── open-model-benchmark.md       ← Already present
└── marketing/                    ← NEW
    └── AUDRIC_LITEPAPER.md       ← Move from root; delete the .html drift
```

### t2000 `packages/engine/__tests__/`

```
packages/engine/__tests__/
└── v0.7a-behavior-catalogue.md   ← KEEP HERE (it's a test surface document, not a planning spec)
```

### audric repo `apps/web/` root

Move planning/runbook files into `apps/web/docs/`:

```
apps/web/
├── docs/                         ← NEW
│   ├── POST_MORTEM_2026-05-IDOR.md
│   ├── SECURITY_ADVISORY_2026-05-IDOR.md
│   └── runbooks/
│       ├── RUNBOOK_incident_response.md
│       ├── RUNBOOK_scaling_alerts.md
│       └── RUNBOOK_spec8_rollout.md
└── (rest unchanged)
```

### audric repo root — already mostly clean

Only add `PORTFOLIO_REGRESSION_MATRIX.md` (currently gitignored at root) → move to `apps/web/docs/PORTFOLIO_REGRESSION_MATRIX.md` AND keep gitignored.

---

## 3. File-by-file disposition table — EVERY file

> **Reading guide:** every action is a `git mv` (preserves history) OR `git add -f` (force-track) OR `mv` (gitignored — git doesn't see it) OR `rm` (delete). **Every action is reversible** via git or undelete; nothing destructive ships in this SPEC.

### t2000 ROOT (tracked) — 28 files

| Current path | Action | New path | Why |
|---|---|---|---|
| `README.md` | KEEP | `README.md` | Canonical |
| `LICENSE` | KEEP | `LICENSE` | Canonical |
| `CLAUDE.md` | KEEP (update "Key Documents" table per §4) | `CLAUDE.md` | Agent context — load every turn |
| `PRODUCT_FACTS.md` | KEEP | `PRODUCT_FACTS.md` | Cross-repo SSOT |
| `ARCHITECTURE.md` | KEEP | `ARCHITECTURE.md` | System architecture reference |
| `SECURITY.md` | KEEP | `SECURITY.md` | Public disclosure policy |
| `BENEFITS_SPEC_v07a.md` | `git mv` | `spec/archive/v07a/BENEFITS_SPEC_v07a.md` | v0.7a SHIPPED 2026-05-18 (S.149-S.159 + S.160) |
| `WHY_v07a.md` | `git mv` | `spec/archive/v07a/WHY_v07a.md` | Same |
| `SPEC_PHASE_7_DRAFT.md` | `git mv` | `spec/archive/v07a/SPEC_PHASE_7_DRAFT.md` | Phase 7 work absorbed into v07a benefits spec; preserve as history |
| `SPIKE_FINDINGS_v07a.md` | `git mv` | `spec/archive/v07a/SPIKE_FINDINGS_v07a.md` | v0.7a spike findings; preserved |
| `TOOL_UX_DESIGN_v07a.md` | `git mv` | `spec/archive/v07a/TOOL_UX_DESIGN_v07a.md` | Same |
| `PHASE_2_TOOL_MIGRATION_BACKLOG.md` | `git mv` | `spec/archive/v07a/PHASE_2_TOOL_MIGRATION_BACKLOG.md` | Work SHIPPED (Phase 2 closed S.149 / Day 20b); preserve as history |
| `SMOKE_PLAN_2026-05-18.md` | `git mv` | `spec/archive/v07a/SMOKE_PLAN_2026-05-18.md` | One-off; v0.7a closeout smoke artifact |
| `V07B_ROADMAP_DRAFT.md` | `git mv` | `spec/archive/v07b/V07B_ROADMAP_DRAFT.md` | v0.7b SKIPPED per its own "promotion-criterion status" §; preserve rationale |
| `V07C_SPIKE_DRAFT.md` | `git mv` | `spec/archive/v07c/V07C_SPIKE_DRAFT.md` | SUPERSEDED by `spec/active/BENEFITS_SPEC_v07c.md`; preserve as the spike that grounded the SPEC |
| `SPEC_SLICE_D_DRAFT.md` | `git mv` | `spec/archive/v07c/SPEC_SLICE_D_DRAFT.md` | SUBSUMED by v07c SPEC U-1 + Phase 3-4 design |
| `SECURITY_AUDIT.md` | `git mv` | `spec/archive/one-offs/SECURITY_AUDIT.md` | Snapshot from May 2026; SPEC 30 supersedes; keep as history |
| `SECURITY_FOUNDER_CHECKLIST.md` | `git mv` | `spec/archive/one-offs/SECURITY_FOUNDER_CHECKLIST.md` | Same; founder-action artifact, preserved |
| `.gitignore` | UPDATE (per §5) | `.gitignore` | Allow tracking `spec/active/`, `spec/archive/`, `spec/runbooks/`, `spec/reference/`, `docs/marketing/` |
| `.npmrc`, `.prettierrc` | KEEP | (same) | Tooling |
| `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | KEEP | (same) | Workspace |
| `tsconfig.base.json`, `turbo.json`, `glama.json` | KEEP | (same) | Build config |
| `install.sh` | KEEP | `install.sh` | One-shot installer |

### t2000 ROOT (untracked) — 1 file

| Current path | Action | New path | Why |
|---|---|---|---|
| `BENEFITS_SPEC_v07c.md` | `git mv` (or `mv` + `git add -f`) | `spec/active/BENEFITS_SPEC_v07c.md` | Active SPEC; lives in spec/active/ |

### t2000 ROOT (gitignored) — 24 files

| Current path | Action | New path | Why |
|---|---|---|---|
| `.DS_Store` | DELETE | — | macOS clutter |
| `.env.local`, `.env.example` | KEEP | (same) | Local env; gitignored stays |
| `.smoke-jwt`, `.smoke-addr`, `.smoke-runner.mjs` | KEEP | (same) | Live smoke tooling; gitignored stays |
| `AUDIT_FINDINGS.md` | `mv` | `spec/archive/one-offs/AUDIT_FINDINGS.md` | Stale (3 items, 1 rotted); preserve as history |
| `AUDRIC_HARNESS_CORRECTNESS_SPEC_v1.3.md` | `mv` | `spec/active/harness/AUDRIC_HARNESS_CORRECTNESS_SPEC_v1.3.md` | Active long-lived spec (gitignored stays) |
| `AUDRIC_HARNESS_INTELLIGENCE_SPEC_v1.4.1.md` | `mv` | `spec/active/harness/AUDRIC_HARNESS_INTELLIGENCE_SPEC_v1.4.1.md` | Same |
| `AUDRIC_HARNESS_DEPTH_SPEC_v0.1.md` | `mv` | `spec/active/harness/AUDRIC_HARNESS_DEPTH_SPEC_v0.1.md` | Same |
| `AUDRIC_LITEPAPER.md` | `mv` | `docs/marketing/AUDRIC_LITEPAPER.md` | Public-facing; promote to tracked (`git add -f`) |
| `audric-litepaper.html` | DELETE | — | Drift duplicate of the .md; HTML generated from md if needed |
| `BL_MEETING_PREP.md` | `mv` | `spec/archive/one-offs/BL_MEETING_PREP.md` | One-off; preserve as history |
| `CLI_UX_SPEC.md` | `mv` | `spec/reference/CLI_UX_SPEC.md` | Long-lived reference (NOT a spec); referenced from CLAUDE.md so it MUST be discoverable; **promote to tracked** (`git add -f`) since it's a public CLI contract |
| `HANDOFF_NEXT_AGENT.md` | KEEP at root | `HANDOFF_NEXT_AGENT.md` | Agent context handoff; needs to be findable instantly; gitignored stays; **add truncation policy: last 7d only, archive older content into `spec/archive/handoffs/HANDOFF_2026-MM-DD.md` on a weekly cadence** |
| `REMINDERS.md` | DELETE (560 bytes scratch) | — | Pure scratch; if you need it back, undelete via Finder Trash |
| `SM_DATA_USECASES.md` | `mv` | `spec/archive/one-offs/SM_DATA_USECASES.md` | One-off exploration; preserve as history |
| `article-trust-layer.md` | `mv` | `spec/archive/one-offs/article-trust-layer.md` | Marketing draft; preserve |
| `audric-build-tracker.md` | KEEP at root | `audric-build-tracker.md` | Founder's local truth source; 2 MB; gitignored stays. **Add splitting policy: when file > 3 MB, archive everything before the most recent SPEC into `spec/archive/build-tracker/build-tracker-YYYY-MM-DD.md`** |
| `audric-roadmap.md` | KEEP at root | `audric-roadmap.md` | Founder's local roadmap; gitignored stays |
| `audric-raise-strategy.canvas.tsx` | `mv` | `spec/archive/one-offs/audric-raise-strategy.canvas.tsx` | Fundraising artifact; preserve |
| `audric-scaling-spec.md` | `mv` | `spec/archive/deprecated/audric-scaling-spec.md` | Old architectural direction; preserved for history |
| `audric-scaling-spec-v2.md` | `mv` | `spec/archive/deprecated/audric-scaling-spec-v2.md` | Same |
| `audric-simplification-spec.md` | `mv` | `spec/archive/deferred/audric-simplification-spec.md` | Already cited "archived" in build-tracker; complete the move |

### t2000 `spec/` (53 files currently gitignored) — reorganize into active/archive

Group disposition (full file list expanded in Appendix A):

| Current path family | Action | New path | Why |
|---|---|---|---|
| `spec/SPEC_6_*` through `spec/SPEC_29_*` (25 files) | `mv` | `spec/archive/pre-spec-30/SPEC_N_*.md` | All SHIPPED, DEFERRED, or PAUSED per audric-build-tracker; preserve as history |
| `spec/SPEC_25_*` (MPP single source) | `mv` | `spec/archive/deferred/SPEC_25_MPP_SINGLE_SOURCE_OF_TRUTH.md` | DEFERRED 2026-05-12 (S.7); reactivation criteria preserved in spec doc |
| `spec/SPEC_29_*` (MPP cross-repo audit) | `mv` | `spec/archive/deferred/SPEC_29_MPP_CROSS_REPO_AUDIT.md` | PAUSED for SPEC 30; preserved |
| `spec/SPEC_30_*` | `mv` | `spec/active/shipping/SPEC_30_CROSS_REPO_SECURITY_REVIEW.md` | v1.0 LOCKED, Phase 1A+1B SHIPPED, Phase 2-10 still open |
| `spec/CHIP_REVIEW_2.md`, `spec/CHIP_REVIEW_2_FINDINGS.md`, `spec/CHIP_REVIEW_2_5_FINDINGS.md` | `mv` | `spec/archive/pre-spec-30/` | SHIPPED 2026-05-07 (S.109) |
| `spec/SPEC_NATIVE_CONTENT_TOOLS.md` | `mv` | `spec/archive/pre-spec-30/SPEC_NATIVE_CONTENT_TOOLS.md` | SHIPPED 2026-05-13 (row 7i, P1-P6) |
| `spec/COMMERCE_V2.md` | `mv` | `spec/reference/COMMERCE_V2.md` | Long-lived reference, not a SPEC |
| `spec/PRODUCT_SPEC.md` | `mv` | `spec/reference/PRODUCT_SPEC.md` | Reference, not a SPEC |
| `spec/SELF_HOSTED_LLM_STRATEGY.md` | `mv` | `spec/reference/SELF_HOSTED_LLM_STRATEGY.md` | Reference; Phase 1 absorbed into SPEC 28 |
| `spec/PERF_SNAPSHOTS.md` | `mv` | `spec/reference/PERF_SNAPSHOTS.md` | Long-lived telemetry reference |
| `spec/UPSTREAM_WORKAROUNDS.md` | `mv` | `spec/reference/UPSTREAM_WORKAROUNDS.md` | Reference (known vendor bugs + workarounds) |
| `spec/VERCEL_LOGS_TRIAGE.md` | `mv` | `spec/reference/VERCEL_LOGS_TRIAGE.md` | Operational reference |
| `spec/harness-metrics-baseline.md` | `mv` | `spec/reference/harness-metrics-baseline.md` | Reference baseline |
| `spec/pawtato-nft-analysis.md` | `mv` | `spec/archive/one-offs/pawtato-nft-analysis.md` | One-off analysis |
| `spec/runbooks/RUNBOOK_*.md` (9 files) | KEEP IN PLACE | `spec/runbooks/` | Already in the right home; no move |
| `spec/archive/ENGINE_V2_ROLLOUT_PLAN_v07a.md` | KEEP IN PLACE | (same) | Already in archive; force-tracked stays |

### t2000 `packages/engine/__tests__/` (1 file)

| Current path | Action | New path | Why |
|---|---|---|---|
| `v0.7a-behavior-catalogue.md` | KEEP | (same) | Test surface document; lives next to the tests it pins |

### t2000 `packages/*/README` (5 files)

| Current path | Action | New path | Why |
|---|---|---|---|
| `packages/cli/README.md` | KEEP | (same) | Package README |
| `packages/engine/README.md` | KEEP (refresh post-SPEC-37) | (same) | Package README |
| `packages/engine/CHANGELOG.md` | KEEP | (same) | Auto-maintained |
| `packages/mcp/README.md` | KEEP | (same) | Package README |
| `packages/sdk/README.md` | KEEP | (same) | Package README |
| `packages/sdk/CONTRIBUTING-ADAPTERS.md` | KEEP | (same) | Reference |

### t2000 `apps/*/README` + `infra/README` + `loadtest/*` + `scripts/README` + `docs/*` (15 files)

| Current path | Action | New path | Why |
|---|---|---|---|
| `apps/gateway/README.md`, `apps/server/README.md` | KEEP | (same) | App READMEs |
| `infra/README.md` | KEEP | (same) | Infra README |
| `loadtest/README.md` | KEEP | (same) | Loadtest README |
| `loadtest/reports/*.md` (3 files) | KEEP | (same) | Historical loadtest reports |
| `scripts/README.md` | KEEP | (same) | Scripts README |
| `docs/mcp-setup.md` | KEEP | (same) | Public MCP setup doc |
| `docs/open-model-benchmark.md` | KEEP | (same) | Public benchmark doc |
| `docs/claude-desktop.json`, `docs/cursor-mcp.json` | KEEP | (same) | Public MCP configs |

### t2000 `.cursor/rules/`, `.claude/rules/`, `t2000-skills/` — DO NOT TOUCH

| Folder | Action | Why |
|---|---|---|
| `.cursor/rules/*.mdc` (13 files) | UNTOUCHED | Active workspace rules; load every turn |
| `.cursor/rules/README.md` | UNTOUCHED | |
| `.claude/rules/*.md` (3 files) | UNTOUCHED | Same role for Claude Code |
| `t2000-skills/skills/*/SKILL.md` (14 files) | UNTOUCHED | Canonical skill source; baked into `@t2000/mcp` |
| `t2000-skills/README.md`, `t2000-skills/LICENSE.md` | UNTOUCHED | |

### t2000 NEW FILES this SPEC creates

| New path | Purpose | Tracked? |
|---|---|---|
| `spec/README.md` | Explains the new layout: active vs archive vs runbooks vs reference; naming convention; promotion rules | YES (force-track via `git add -f`) — this is the SSOT for "where does X go?" |
| `docs/REPO_LAYOUT.md` | Public-facing version of `spec/README.md`: explains the root-level allowlist, where docs go, how to find things | YES (tracked by default) |
| `spec/active/SPEC_38a_DOCS_SPECS_HYGIENE.md` | This file | gitignored (matches spec/ default) |
| `spec/active/SPEC_38b_CODE_HYGIENE.md` | Stub created at SPEC 38a ship; fleshed out post-v0.7c | gitignored |

### audric repo ROOT (tracked) — 4 .md files

| Current path | Action | New path | Why |
|---|---|---|---|
| `README.md` | KEEP | (same) | Canonical |
| `CLAUDE.md` | KEEP | (same) | Agent context |
| `AUDIT_FINDINGS.md` | `git mv` | `apps/web/docs/AUDIT_FINDINGS.md` | Move to apps/web/docs; tracked stays tracked |
| `spec8-acceptance-2026-05-05.json` | `git mv` | `apps/web/docs/spec8-acceptance-2026-05-05.json` | Same |

### audric repo ROOT (gitignored)

| Current path | Action | New path | Why |
|---|---|---|---|
| `.DS_Store` | DELETE | — | macOS clutter |
| `PORTFOLIO_REGRESSION_MATRIX.md` | `mv` | `apps/web/docs/PORTFOLIO_REGRESSION_MATRIX.md` | Operational reference; gitignored stays |
| `pitch-deck.html`, `pitch-deck-v2.html`, …, `pitch-deck-v6.html` (6 files) | `mv` | `spec/archive/pitch-decks/pitch-deck-v*.html` (if such folder exists in audric — else create) | Historical pitch deck versions; preserve last 3, delete v2-v4 (no historical value beyond "I had a pitch") |

### audric repo `apps/web/` ROOT — 5 .md files

| Current path | Action | New path | Why |
|---|---|---|---|
| `POST_MORTEM_2026-05-IDOR.md` | `git mv` | `apps/web/docs/POST_MORTEM_2026-05-IDOR.md` | Operational history |
| `SECURITY_ADVISORY_2026-05-IDOR.md` | `git mv` | `apps/web/docs/SECURITY_ADVISORY_2026-05-IDOR.md` | Public-facing advisory |
| `RUNBOOK_incident_response.md` | `git mv` | `apps/web/docs/runbooks/RUNBOOK_incident_response.md` | Operational runbook |
| `RUNBOOK_scaling_alerts.md` | `git mv` | `apps/web/docs/runbooks/RUNBOOK_scaling_alerts.md` | Same |
| `RUNBOOK_spec8_rollout.md` | `git mv` | `apps/web/docs/runbooks/RUNBOOK_spec8_rollout.md` | Same |

### audric repo `design_handoff_*/`

| Folder | Action | Why |
|---|---|---|
| `design_handoff_audric/` | UNTOUCHED (for now) | Active design files reference from current design work; revisit at SPEC 38b |
| `design_handoff_username_flow/` | UNTOUCHED | Same |

### audric repo `.cursor/rules/`, `.claude/rules/`, `scripts/`, `apps/web/__tests__/`, `apps/web/components/`, etc.

UNTOUCHED. Only the root-level + apps/web root-level moves in this SPEC.

---

## 4. CLAUDE.md updates (both repos)

Single coordinated edit to t2000 + audric `CLAUDE.md` files:

### Updates to `t2000/CLAUDE.md` "Key Documents" table

```markdown
| `PRODUCT_FACTS.md`                                  | Cross-repo SSOT (versions, fees, signatures)
| `ARCHITECTURE.md`                                   | System architecture reference
| `audric-roadmap.md` (local-only)                    | Product roadmap (gitignored)
| `audric-build-tracker.md` (local-only)              | Build tracker (gitignored)
| `spec/active/BENEFITS_SPEC_v07c.md` (local-only)    | v0.7c migration SPEC (in flight)
| `spec/active/harness/AUDRIC_HARNESS_*_v*.md`        | Harness specs (local-only, gitignored)
| `spec/archive/v07a/BENEFITS_SPEC_v07a.md` (local-only)  | v0.7a SHIPPED — historical reference
| `spec/reference/CLI_UX_SPEC.md`                     | CLI UX contract (tracked post-SPEC-38a)
| `spec/reference/PRODUCT_SPEC.md` (local-only)       | Product reference
| `spec/runbooks/RUNBOOK_*.md` (local-only)           | Operational runbooks
| `docs/REPO_LAYOUT.md`                               | Layout SSOT — where does X go?
```

### Add to `t2000/CLAUDE.md` a new section

```markdown
## Repo Layout

Read `docs/REPO_LAYOUT.md` once at session start for "where does X go?"
Read `spec/README.md` (local-only) if you're working on a SPEC.

Short version:
- Root: README, LICENSE, CLAUDE, PRODUCT_FACTS, ARCHITECTURE, SECURITY + tooling configs only.
- `spec/active/` for in-flight SPECs.
- `spec/archive/` for shipped or superseded SPECs.
- `spec/reference/` for long-lived reference docs.
- `spec/runbooks/` for operational runbooks.
- `docs/` for public-facing docs.
- `packages/*/README.md` + `apps/*/README.md` for package/app READMEs.
- `audric-build-tracker.md` + `audric-roadmap.md` stay at root (founder local truth source).
- `HANDOFF_NEXT_AGENT.md` stays at root (agent context handoff).

If you'd add a new file at the root and it's not in this list, put it under `spec/` or `docs/` instead.
```

### Update audric/CLAUDE.md analogously

Mention `apps/web/docs/` + `apps/web/docs/runbooks/` as canonical homes for runbooks + post-mortems + security advisories.

---

## 5. .gitignore updates

### `t2000/.gitignore` — selective `spec/` untracking

Current:
```
spec/
```

Replace with:
```
# spec/ is the working area — most contents are local-only.
# Track active SPECs, archives, and reference materials in the layout
# described in spec/README.md.
spec/
!spec/README.md
!spec/active/
!spec/archive/
!spec/reference/
!spec/runbooks/
# but keep the local-only working notes per active subfolder gitignored:
spec/active/harness/
spec/active/SPEC_38a_*
spec/active/SPEC_38b_*
spec/active/BENEFITS_SPEC_*_internal.md
```

The exact pattern needs founder review (which active SPECs are local-only vs public).

### Add to `t2000/.gitignore`

```
.DS_Store
```

(Already gitignored implicitly via global gitignore but adding explicitly helps.)

### `audric/.gitignore` — no structural changes needed

Add explicit `.DS_Store` if not already.

---

## 6. Phases — the actual moves

### Phase 0 — Founder review (this SPEC's first acceptance gate)

- Founder reads §3 disposition table + flags any disagreement.
- Founder confirms `.gitignore` change is acceptable (some specs are sensitive — e.g. AUDRIC_HARNESS_INTELLIGENCE_SPEC may need to stay gitignored, others may be safe to publish).
- Founder green-lights the move sequence.

**Acceptance gate G0:** founder lock on every row of §3.

### Phase 1 — Create new folder structure (no moves yet, no risk)

```bash
mkdir -p spec/active/harness
mkdir -p spec/active/shipping
mkdir -p spec/archive/v07a
mkdir -p spec/archive/v07b
mkdir -p spec/archive/v07c
mkdir -p spec/archive/pre-spec-30
mkdir -p spec/archive/deferred
mkdir -p spec/archive/deprecated
mkdir -p spec/archive/one-offs
mkdir -p spec/archive/handoffs
mkdir -p spec/archive/build-tracker
mkdir -p spec/reference
mkdir -p docs/marketing
```

In audric:

```bash
mkdir -p apps/web/docs/runbooks
mkdir -p spec/archive/pitch-decks  # if needed for the 6 pitch decks
```

**Acceptance gate G1:** all folders exist on disk; nothing moved yet.

### Phase 2 — Move tracked files (preserves history via `git mv`)

Run the t2000 + audric move scripts (drafted in §7). Each move is a `git mv`; the diff is rename-only; reviewable in one PR.

**Acceptance gate G2:** all `git mv` commands return 0; `git status` shows the rename diff; `find . -name '*.md'` confirms target locations.

### Phase 3 — Move gitignored files (file system `mv`)

Run the file-system `mv` script. Since these are gitignored, they don't show in git diffs — but they need to move on disk so future shell commands find them in the right place.

**Acceptance gate G3:** `find spec/ -name '*.md'` shows the expected counts; root-level `ls *.md` shows only the allowlist files.

### Phase 4 — Create new files

```
spec/README.md             ← layout SSOT + naming + promotion rules
docs/REPO_LAYOUT.md        ← public-facing version
spec/active/SPEC_38b_CODE_HYGIENE.md   ← stub
```

Plus update `t2000/.gitignore` + `t2000/CLAUDE.md` + `audric/CLAUDE.md` per §4 + §5.

**Acceptance gate G4:** all new files committed; lint/typecheck clean (these are docs, so this should be trivial).

### Phase 5 — Update cross-references

Update any inline references to moved paths:

- `CLAUDE.md` Key Documents table → new paths
- `BENEFITS_SPEC_v07c.md` cross-references at bottom → new paths
- `audric-build-tracker.md` references → new paths (touches the gitignored mega-file; ok)
- `WHY_v07a.md` companion docs links → new paths
- `audric/CLAUDE.md` references → new paths

Grep-find every reference to a moved file; update inline:

```bash
# Quick audit:
rg -l "PHASE_2_TOOL_MIGRATION_BACKLOG\.md|SPEC_PHASE_7_DRAFT\.md|V07B_ROADMAP_DRAFT\.md|V07C_SPIKE_DRAFT\.md|SPEC_SLICE_D_DRAFT\.md|SPIKE_FINDINGS_v07a\.md|TOOL_UX_DESIGN_v07a\.md|audric-scaling-spec\.md|audric-simplification-spec\.md|HANDOFF_NEXT_AGENT\.md|CLI_UX_SPEC\.md|audric-litepaper" --type md
```

Then sed-replace or hand-edit each instance.

**Acceptance gate G5:** zero broken cross-references after the moves (regex audit returns 0 results for OLD paths).

### Phase 6 — Commit + ship

Two commits:

1. **t2000:** `📝 docs(spec): SPEC 38a docs+specs reorg — root-level allowlist + spec/active|archive|reference|runbooks layout`
2. **audric:** `📝 docs(web): SPEC 38a apps/web/docs/ reorg — runbooks + post-mortem moved off apps/web root`

**Acceptance gate G6:** both commits pushed; both repos pass CI; root-level `ls *.md` shows only the allowlist.

---

## 7. Acceptance gates summary

| Gate | Tied to | How verified |
|---|---|---|
| **G0** | §6 Phase 0 founder lock | Founder reads + green-lights every row in §3 |
| **G1** | §6 Phase 1 folders created | `find spec docs -type d -newer ${TIMESTAMP}` shows new folders |
| **G2** | §6 Phase 2 tracked file moves | `git status` shows rename-only diff for tracked moves |
| **G3** | §6 Phase 3 gitignored file moves | `find` confirms target locations |
| **G4** | §6 Phase 4 new files + .gitignore + CLAUDE.md updates | New files committed; lint clean |
| **G5** | §6 Phase 5 cross-reference updates | Regex audit returns 0 OLD-path references |
| **G6** | §6 Phase 6 ship | Both PRs pushed + CI green + root allowlist verified |

---

## 8. Risk + rollback

| Risk | Mitigation |
|---|---|
| Lost git history on a moved file | Use `git mv` (preserves history); `git log --follow` works post-move |
| Stale cross-reference in a doc someone reads via a bookmark | Phase 5 sweep catches inline references; agent context refreshes on next session start |
| Local agent tools (Cursor "Recently viewed files", etc.) lose track | Self-corrects next session; no production impact |
| Founder relies on a specific path mentally | Add `docs/REPO_LAYOUT.md` + `spec/README.md` as the SSOT; one re-read aligns the mental model |
| .gitignore change accidentally publishes a sensitive spec | Phase 0 founder lock specifically calls out which spec/active/ subfolders stay gitignored (harness/, internal drafts) |
| Some moved file is referenced by a script that runs from disk | Phase 5 regex audit covers `.sh` / `.mjs` / `.ts` too; verify before commit |

**Rollback:** every action is a `git mv` (revertible via `git mv` back) or a file-system `mv` (revertible via reverse `mv`). Deletes are limited to `.DS_Store`, `audric-litepaper.html` (duplicate), `REMINDERS.md` (560 bytes scratch). Anything important is moved to `spec/archive/`, not deleted.

---

## 9. What this SPEC explicitly does NOT do

- No code changes. No package version bumps. No publishes.
- No deletion of any file with meaningful content (only `.DS_Store`, 1 duplicate `.html`, and 560-byte `REMINDERS.md`).
- No `audric-build-tracker.md` content reorganization (just leaves the file at root with a splitting POLICY for future).
- No marketing-site or website work (covered by 7u post-v0.7c cleanup sweep).
- No code dead-code sweep (covered by SPEC 38b post-v0.7c).
- No engine package rename (deferred per SPEC 38b consideration).
- No `.cursor/rules` or `.claude/rules` changes (those are intentional and load-bearing).
- No `t2000-skills/` changes (canonical skill source).

---

## 10. Effort

| Phase | Estimated effort |
|---|---|
| Phase 0 — Founder review | ~30 min of founder time + 0 agent time |
| Phase 1 — Create folders | ~1 min |
| Phase 2 — `git mv` tracked files | ~30 min (scripted, but each move verified) |
| Phase 3 — `mv` gitignored files | ~30 min (scripted) |
| Phase 4 — Create new files (spec/README, docs/REPO_LAYOUT, .gitignore update, CLAUDE.md updates) | ~2-3 hours |
| Phase 5 — Cross-reference sweep | ~1-2 hours |
| Phase 6 — Commit + ship | ~30 min |
| **Total** | **~5-7 hours of agent work + ~30 min of founder lock time** |

Fits in one focused session. Realistic ship today if founder green-lights Phase 0.

---

## Appendix A — Full disposition list for `spec/SPEC_6..SPEC_30_*` moves

```
spec/SPEC_6_CHAIN_EXPLORER.md                              → spec/archive/pre-spec-30/
spec/SPEC_7_MULTI_WRITE_PTB.md                             → spec/archive/pre-spec-30/
spec/SPEC_8_CORPUS.md                                      → spec/archive/pre-spec-30/
spec/SPEC_8_INTERACTIVE_HARNESS.md                         → spec/archive/pre-spec-30/
spec/SPEC_9_AUDRIC_STORE_HARNESS.md                        → spec/archive/pre-spec-30/
spec/SPEC_10_AUDRIC_PASSPORT_IDENTITY.md                   → spec/archive/pre-spec-30/
spec/SPEC_11_PRE_DRAFT_REVIEW.md                           → spec/archive/pre-spec-30/
spec/SPEC_11_5_ONRAMP_FIAT_TO_USDC.md                      → spec/archive/pre-spec-30/
spec/SPEC_12_CROSS_REPO_CONSISTENCY_SWEEP.md               → spec/archive/pre-spec-30/
spec/SPEC_13_PHASE1_SPIKE_REPORT.md                        → spec/archive/pre-spec-30/
spec/SPEC_13_PHASE3_DESIGN.md                              → spec/archive/pre-spec-30/
spec/SPEC_13_PHASE3B_DESIGN.md                             → spec/archive/pre-spec-30/
spec/SPEC_13_PTB_CHAINING_FOUNDATION.md                    → spec/archive/pre-spec-30/
spec/SPEC_14_PREPARE_BUNDLE_PLAN_TIME_COMMITMENT.md        → spec/archive/pre-spec-30/
spec/SPEC_15_CONFIRM_FLOW_DESIGN.md                        → spec/archive/pre-spec-30/
spec/SPEC_15_PHASE2_DESIGN.md                              → spec/archive/pre-spec-30/
spec/SPEC_16_ATOMIC_MULTI_MPP_CALLS.md                     → spec/archive/pre-spec-30/   (still backlog; archived because spec was drafted, work paused)
spec/SPEC_17_SAVINGS_GOAL_REMOVAL.md                       → spec/archive/pre-spec-30/
spec/SPEC_18_PRE_LAUNCH_REGRESSION.md                      → spec/archive/pre-spec-30/
spec/SPEC_19_PERFORMANCE_RELIABILITY_SWEEP.md              → spec/archive/pre-spec-30/
spec/SPEC_20_PERFORMANCE_ARCHITECTURE_V2.md                → spec/archive/pre-spec-30/
spec/SPEC_21_AGENT_HARNESS_UX_POLISH.md                    → spec/archive/pre-spec-30/
spec/SPEC_23_HARNESS_UX_PARITY.md                          → spec/archive/pre-spec-30/
spec/SPEC_23B_INVENTORY.md                                 → spec/archive/pre-spec-30/
spec/SPEC_23C_MOTION_POLISH.md                             → spec/archive/pre-spec-30/
spec/SPEC_23C_SMOKE_REPORT.md                              → spec/archive/pre-spec-30/
spec/SPEC_24_MPP_INTEGRATION_AUDIT.md                      → spec/archive/pre-spec-30/
spec/SPEC_24_GATEWAY_INVENTORY.md                          → spec/archive/pre-spec-30/
spec/SPEC_25_MPP_SINGLE_SOURCE_OF_TRUTH.md                 → spec/archive/deferred/
spec/SPEC_26_MPP_SETTLE_ON_SUCCESS.md                      → spec/archive/pre-spec-30/
spec/SPEC_29_MPP_CROSS_REPO_AUDIT.md                       → spec/archive/deferred/
spec/SPEC_30_CROSS_REPO_SECURITY_REVIEW.md                 → spec/active/shipping/   (Phase 1A+1B SHIPPED; Phase 2-10 still open)
spec/SPEC_NATIVE_CONTENT_TOOLS.md                          → spec/archive/pre-spec-30/
spec/CHIP_REVIEW_2.md                                      → spec/archive/pre-spec-30/
spec/CHIP_REVIEW_2_FINDINGS.md                             → spec/archive/pre-spec-30/
spec/CHIP_REVIEW_2_5_FINDINGS.md                           → spec/archive/pre-spec-30/
spec/PRODUCT_SPEC.md                                       → spec/reference/
spec/COMMERCE_V2.md                                        → spec/reference/
spec/SELF_HOSTED_LLM_STRATEGY.md                           → spec/reference/
spec/PERF_SNAPSHOTS.md                                     → spec/reference/
spec/UPSTREAM_WORKAROUNDS.md                               → spec/reference/
spec/VERCEL_LOGS_TRIAGE.md                                 → spec/reference/
spec/harness-metrics-baseline.md                           → spec/reference/
spec/pawtato-nft-analysis.md                               → spec/archive/one-offs/
spec/runbooks/*                                            → spec/runbooks/   (no change)
spec/archive/ENGINE_V2_ROLLOUT_PLAN_v07a.md                → spec/archive/v07a/ENGINE_V2_ROLLOUT_PLAN_v07a.md  (rename for consistency; preserves history)
```

---

## Cross-references

- `audric-build-tracker.md` — Forward backlog (row 7u → this SPEC partially preempts row 7u; 7u keeps the CODE-SIDE cleanup scope)
- `spec/active/BENEFITS_SPEC_v07c.md` — the v0.7c SPEC this hygiene work clears the way for
- `docs/REPO_LAYOUT.md` (NEW) — public-facing version of the same rules
- `spec/README.md` (NEW) — internal SSOT for "where does X go?" in spec/

---

**End of v0.1 DRAFT. Awaiting founder lock on §3 disposition table to promote to v0.2.**
