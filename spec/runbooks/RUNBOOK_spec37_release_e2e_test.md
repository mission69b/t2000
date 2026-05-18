# RUNBOOK — SPEC 37 v0.7a Release E2E Test

> **Phase 0 deliverable** — design-only (this runbook). Execution requires founder green-light because it bumps real npm package versions on `@t2000/*` (which Audric production consumes).

## Why this runbook exists

v0.7a's continuous-deployment rollout (8 phases × 1 minor engine release each) depends on the release workflow chain working end-to-end:

```
feature branch
  → PR (CI green)
  → squash-merge to main
  → gh workflow run release.yml --field bump=patch
  → release.yml bumps versions + commits + pushes tag
  → publish.yml fires on tag (CI + 4 npm publishes + GH release + Discord)
  → audric/web bumps engine version (manual `pnpm add @t2000/engine@latest`)
  → Vercel auto-deploys on push to audric/main
  → 5-user zkLogin smoke per `audric/.cursor/rules/zklogin-passport-flow.mdc`
```

**Phase 0 must verify this chain works BEFORE Phase 1 first cutover.** A bug in any link blocks every phase release. Discovering a release-pipeline bug at Phase 1 means an emergency rollback + 1-2 days lost. Discovering it now is a 30-minute fix.

## Pre-flight checklist (founder verifies before running this test)

- [ ] **GitHub secrets set** in `mission69b/t2000` repo:
  - `RELEASE_TOKEN` — Personal Access Token with `contents: write` + branch protection bypass. Required by `release.yml` to push the version-bump commit + tag.
  - `NPM_TOKEN` — npm token with publish rights for all 4 packages. Required by `publish.yml`.
  - `DISCORD_RELEASES_WEBHOOK` — webhook URL for `#releases` channel. Required by `publish.yml` discord step.
  - `SKILLS_SYNC_TOKEN` — already wired (sync-skills.yml).
- [ ] **npm 2FA configuration** — confirm `@t2000/*` packages allow CI publish without interactive 2FA (per-package settings on npmjs.com → Settings → Publishing access → "Don't require two-factor authentication").
- [ ] **No active release in flight** — `gh run list --workflow=release.yml --limit 5` shows last run completed. `gh run list --workflow=publish.yml --limit 5` ditto.
- [ ] **Working directory clean** in both `t2000` and `audric` repos: `git status` shows nothing pending.

## E2E test path (the safest possible exercise)

The test bumps `@t2000/*` from current version (1.30.4 as of 2026-05-15) to next patch (1.30.5) using a no-op change. This exercises every link in the chain without changing any runtime behavior.

### Step 1 — Land a no-op change on main (~2 min)

Pick a comment-only edit. Recommended target: append a one-line comment to `packages/engine/CHANGELOG.md` noting "v1.30.5 — release-pipeline E2E test (no behavior change)". This guarantees:
- The change touches `packages/engine/**` (so the new `engine-benchmark-smoke.yml` workflow runs).
- The change has zero runtime impact.
- The CHANGELOG entry is the historical record of WHY this version exists.

```bash
cd /Users/funkii/dev/t2000
git checkout -b chore/release-pipeline-e2e-test
echo "" >> packages/engine/CHANGELOG.md
echo "## 1.30.5 — release-pipeline E2E test (no behavior change)" >> packages/engine/CHANGELOG.md
echo "" >> packages/engine/CHANGELOG.md
echo "Phase 0 deliverable test — exercises release.yml + publish.yml + audric/web bump path." >> packages/engine/CHANGELOG.md
git add packages/engine/CHANGELOG.md
git commit -m "📝 docs(engine): note release-pipeline E2E test"
gh pr create --title "📝 docs(engine): release-pipeline E2E test" --body "Phase 0 deliverable — comment-only change to exercise the release chain end-to-end. No behavior change. See spec/runbooks/RUNBOOK_release_e2e_test.md."
```

**Verify CI passes**, then squash-merge.

### Step 2 — Trigger the release workflow (~5 min)

```bash
cd /Users/funkii/dev/t2000
git checkout main && git pull
gh workflow run release.yml --field bump=patch
```

Watch the workflow:

```bash
gh run watch --workflow=release.yml
```

**Expected outcomes:**
- `release.yml` updates 4 `package.json` files to `1.30.5`.
- Commits `📦 build: v1.30.5` to main with `[skip ci]` if configured (or runs CI again).
- Pushes annotated tag `v1.30.5`.
- Triggers `publish.yml` via `workflow_dispatch`.

**Verify locally:**

```bash
git pull
git log --oneline -5
git tag --list 'v1.30.*' | tail -3
node -p "require('./packages/sdk/package.json').version"  # should print 1.30.5
node -p "require('./packages/engine/package.json').version"  # ditto
node -p "require('./packages/cli/package.json').version"  # ditto
node -p "require('./packages/mcp/package.json').version"  # ditto
```

### Step 3 — Watch publish.yml (~10 min)

```bash
gh run watch --workflow=publish.yml
```

**Expected outcomes:**
- `ci` job: lint + typecheck + test + build all 4 packages — all green (this validates the new ai@^6 + @ai-sdk/anthropic@^3 deps still resolve).
- `publish` job: 4 npm publishes succeed. `id-token: write` permission triggers npm provenance attestation (new in Phase 0 deliverable 7).
- `release` job: GitHub Release created at `https://github.com/mission69b/t2000/releases/tag/v1.30.5`.
- `discord` job: notification posted to `#releases`.

**Verify on npm:**

```bash
npm view @t2000/sdk@1.30.5 dist
npm view @t2000/engine@1.30.5 dist
npm view @t2000/cli@1.30.5 dist
npm view @t2000/mcp@1.30.5 dist
# Each should show: tarball URL, integrity hash, AND a "provenance" field linking to the GitHub Actions run.
```

If `provenance` field is missing on any package: Phase 0 deliverable 7's `--provenance` flag isn't taking effect. Investigate before Phase 1.

### Step 4 — Bump audric/web (~5 min)

```bash
cd /Users/funkii/dev/audric/apps/web
pnpm add @t2000/sdk@1.30.5 @t2000/engine@1.30.5
cd /Users/funkii/dev/audric
git status  # should show 2 modified package.json + 1 modified pnpm-lock.yaml
git checkout -b chore/bump-engine-1.30.5
git add -A
git commit -m "📦 build(web): bump @t2000/sdk + @t2000/engine to v1.30.5"
git push -u origin chore/bump-engine-1.30.5
gh pr create --title "📦 build(web): bump @t2000/* to v1.30.5" --body "Release-pipeline E2E test. No behavior change."
```

**Verify CI passes** in audric. Squash-merge.

### Step 5 — Watch Vercel deploy (~5 min)

Open `https://vercel.com/<project>/deployments`. The push to `audric/main` should trigger a new deployment automatically.

**Expected outcomes:**
- Build succeeds (engine v1.30.5 compiles).
- Deployment promotes to production.
- `https://audric.ai` continues serving — no observable behavior change.

### Step 6 — Smoke test (~3 min)

In a fresh browser session on production audric.ai:

1. Sign in with one Google account.
2. Run a read flow: "what's my portfolio?" — agent responds normally.
3. Run a sub-threshold write: "save 1 USDC" — auto-execute path fires, receipt renders.

If anything fails, see Rollback below.

### Step 7 — Mark E2E test complete

```bash
cd /Users/funkii/dev/t2000
echo "" >> packages/engine/CHANGELOG.md
echo "[E2E test of v1.30.5 verified 2026-XX-XX — release pipeline working end-to-end.]" >> packages/engine/CHANGELOG.md
git add packages/engine/CHANGELOG.md
git commit -m "📝 docs(engine): mark v1.30.5 release-pipeline E2E test verified"
git push
```

## Exit criteria

E2E test PASSED if all of:

- [ ] `release.yml` completes green; tag `v1.30.5` exists on remote.
- [ ] `publish.yml` completes green; all 4 npm packages at v1.30.5.
- [ ] npm provenance attestation visible on all 4 packages.
- [ ] Discord notification posted.
- [ ] audric/web bump merges + Vercel deploys successfully.
- [ ] Production smoke (steps 1-3 of Step 6) passes.

If any check fails: STOP. Investigate the specific failure and fix it BEFORE Phase 1 first cutover.

## Rollback

If audric/web deploy breaks production:

```bash
cd /Users/funkii/dev/audric/apps/web
pnpm add @t2000/sdk@1.30.4 @t2000/engine@1.30.4
cd /Users/funkii/dev/audric
git add -A
git commit -m "⏪ revert(web): pin engine to v1.30.4 (E2E test rollback)"
git push
# Vercel auto-deploys the rollback.
```

The npm versions stay published (you cannot un-publish). v1.30.5 is now a "tombstone" version — never consumed by anyone. The next real release skips to v1.30.6 or v1.31.0.

## Related deliverables

- Phase 0 deliverable 7 → npm provenance + benchmark-smoke skeleton (already shipped)
- 5-user zkLogin smoke (post-deploy verification per phase) → `audric/.cursor/rules/zklogin-passport-flow.mdc` § "5-user smoke baseline"
- Per-phase release strategy → `~/.cursor/plans/audric-v07a-engine-drain.plan.md` § "Rollout"

## Notes for the agent executing this runbook

1. Do NOT run any of the commands in this runbook until the founder explicitly approves. The runbook is **design-only** at Phase 0 close.
2. After founder approval, execute steps in order — do not parallelize. Each step's verify gate is a hard requirement before the next step starts.
3. If the founder asks for a dry-run, the closest approximation is: run Step 1 (no-op change) + verify the new `engine-benchmark-smoke.yml` workflow runs on the PR. Skip Step 2-7 (which actually publish to npm).
4. Document the actual run outcome in `audric-build-tracker.md` SPEC 37 section as "Release pipeline E2E test PASSED YYYY-MM-DD" or "FAILED at step N — fix before Phase 1".
