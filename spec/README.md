# spec/ — Internal Specs, Reference, Runbooks, Archive

> **The SSOT for "where does a SPEC go?"** Last updated 2026-05-18 (SPEC 38a v0.2 ship).

## Layout

```
spec/
├── README.md              ← this file (tracked)
├── active/                ← in-flight SPECs (mostly gitignored — local working notes)
│   ├── BENEFITS_SPEC_v07c.md          (drafted SPEC for active workstream)
│   ├── SPEC_38a_DOCS_SPECS_HYGIENE.md (this hygiene SPEC — gitignored)
│   ├── SPEC_38b_CODE_HYGIENE.md       (stub; fleshed out post-v0.7c)
│   ├── harness/                       (long-lived intelligence/correctness/depth specs — gitignored)
│   │   ├── AUDRIC_HARNESS_CORRECTNESS_SPEC_v1.3.md
│   │   ├── AUDRIC_HARNESS_INTELLIGENCE_SPEC_v1.4.1.md
│   │   └── AUDRIC_HARNESS_DEPTH_SPEC_v0.1.md
│   └── shipping/                      (SPECs awaiting first deploy or with open phases — tracked)
│       └── SPEC_30_CROSS_REPO_SECURITY_REVIEW.md
├── archive/                ← shipped, superseded, deferred, or deprecated (TRACKED — public history)
│   ├── v07a/                          (v0.7a engine-drain SHIPPED 2026-05-18)
│   ├── v07b/                          (V07B_ROADMAP — SKIPPED per its own promotion-criterion §)
│   ├── v07c/                          (V07C_SPIKE_DRAFT + SLICE_D — superseded by active/BENEFITS_SPEC_v07c)
│   ├── pre-spec-30/                   (SPEC 6..29 historical SPECs + chip reviews + native-content)
│   ├── deferred/                      (PAUSED specs with reactivation criteria preserved)
│   ├── deprecated/                    (old architectural direction — preserved for history only)
│   ├── one-offs/                      (audit findings, meeting prep, fundraising artifacts, etc.)
│   ├── handoffs/                      (rotating HANDOFF_NEXT_AGENT.md weekly archive)
│   ├── build-tracker/                 (rotating audric-build-tracker.md archive when > 3 MB)
│   └── pitch-decks/                   (audric repo only — historical pitch decks)
├── reference/              ← long-lived reference docs (NOT specs, NOT runbooks) (TRACKED)
│   ├── COMMERCE_V2.md
│   ├── PRODUCT_SPEC.md
│   ├── SELF_HOSTED_LLM_STRATEGY.md
│   ├── PERF_SNAPSHOTS.md
│   ├── UPSTREAM_WORKAROUNDS.md
│   ├── VERCEL_LOGS_TRIAGE.md
│   └── harness-metrics-baseline.md
└── runbooks/               ← operational runbooks (TRACKED)
    └── RUNBOOK_*.md                   (9 files: SPEC 7, SPEC 9, SPEC 18-20, SPEC 37, parent-sui, etc.)
```

## Where does X go?

| If X is a... | Put it in... |
|---|---|
| New SPEC being drafted | `spec/active/SPEC_N_<name>.md` (gitignored by default) |
| SPEC with at least one phase shipped but others open | `spec/active/shipping/SPEC_N_<name>.md` (TRACKED) |
| SPEC that just shipped fully | `spec/archive/<version>/SPEC_N_<name>.md` (TRACKED) — e.g. `spec/archive/v07c/` |
| SPEC that was DEFERRED with reactivation criteria | `spec/archive/deferred/SPEC_N_<name>.md` (TRACKED) |
| SPEC that was REPLACED by a newer architecture | `spec/archive/deprecated/<old-name>.md` (TRACKED) |
| Long-lived reference doc (CLI UX contract, telemetry baseline, etc.) | `spec/reference/<NAME>.md` (TRACKED) |
| Operational runbook (incident response, deploy procedure) | `spec/runbooks/RUNBOOK_<name>.md` (TRACKED) |
| One-off exploration or scratch (delete after?) | `spec/archive/one-offs/<name>.md` (TRACKED) |
| Harness internals (correctness, intelligence, depth specs — local-only) | `spec/active/harness/<name>.md` (gitignored) |
| Rotated HANDOFF or build-tracker chunk | `spec/archive/handoffs/HANDOFF_YYYY-MM-DD.md` or `spec/archive/build-tracker/build-tracker-pre-spec-N.md` (gitignored) |

## What stays at the repo root?

Per SPEC 38a allowlist (strict — anything else gets pushed back to a subdir):
- `README.md`, `LICENSE`, `CLAUDE.md`, `ARCHITECTURE.md`, `SECURITY.md`
- Tooling: `.gitignore`, `.npmrc`, `.prettierrc`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `turbo.json`, `glama.json`, `install.sh`
- Founder-local truth source (gitignored): `audric-build-tracker.md`, `audric-roadmap.md`, `HANDOFF_NEXT_AGENT.md`
- Live smoke tooling (gitignored): `.smoke-jwt`, `.smoke-addr`, `.smoke-runner.mjs`
- Local env (gitignored): `.env.local`, `.env.example`

## Promotion rules (when does a SPEC move?)

- `active/` → `active/shipping/` when its first phase ships to production
- `active/` → `archive/<version>/` when all phases ship AND a closeout entry lands in `audric-build-tracker.md`
- `active/` → `archive/deferred/` when work pauses with reactivation criteria documented in the SPEC
- `active/` → `archive/deprecated/` when superseded by a newer SPEC that addresses the same problem differently
- Anything `active/` that's been untouched for > 30 days → review for `archive/deferred/` or `archive/one-offs/`

## Rotation policy

- **`HANDOFF_NEXT_AGENT.md`** at root: keep current state + most recent ~7 days of session work. Older entries archive to `spec/archive/handoffs/HANDOFF_YYYY-MM-DD.md` weekly.
- **`audric-build-tracker.md`** at root: when file size exceeds ~3 MB OR line count > 15,000, archive everything before the most recent in-progress SPEC into `spec/archive/build-tracker/build-tracker-pre-spec-N.md`. Forward backlog table + canonical sequencing block always stay at root.

## See also

- `docs/REPO_LAYOUT.md` — public-facing version of these rules
- `../CLAUDE.md` — agent context (Key Documents table references this file)
- `audric-build-tracker.md` — Forward backlog (the SSOT for what SPEC ships next)
