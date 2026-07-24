---
description: Cut an npm release of all 5 @t2000 packages via the GitHub Release workflow
argument-hint: patch | minor | major
---

Cut a release of the t2000 package stack. Bump type requested: **$1** (default
`patch` if empty).

## Before anything, verify the bump is right

All 5 packages (`sdk`, `cli`, `mcp`, `id`, `serve`) move together to the same
version — no drift.

| Change | Bump |
|--------|------|
| New tool, method, or command | `minor` |
| Bug fix, type fix, test fix | `patch` |
| Breaking change to code an external consumer could have written | `major` |

**Majors are rare — default down.** Internal refactors, removals of unshipped or
unused surface, and doc/catalog changes are `minor` at most. Never ship majors
back-to-back; batch queued breaking removals into one. When in doubt, `patch`.

Look at `git log` since the last tag and state which bump the actual changes
justify. **If the requested bump disagrees with what the diff shows, say so and
ask before proceeding.**

## Steps

1. Confirm the working tree is clean and you're on `main` (`git status`).
2. Confirm CI is green on the current HEAD.
3. **Ask the user to confirm the version and bump type before triggering.** This
   publishes to npm publicly and is not reversible.
4. Trigger the workflow:

   ```bash
   gh workflow run release.yml --field bump=<patch|minor|major>
   ```

   That runs `.github/workflows/release.yml`, which bumps all 5 package versions,
   commits `📦 build: vX.Y.Z`, pushes the annotated tag, and dispatches
   `publish.yml` (CI → `pnpm publish` ×5 → GitHub Release → Discord `#releases`).

5. Watch it: `gh run watch` or `gh run list --workflow=release.yml --limit 3`.
6. Once npm publish completes, remind the user about the downstream bump:

   ```bash
   cd /Users/funkii/dev/audric/apps/web-v3 && pnpm add @t2000/sdk@latest
   ```

## Never do

- Run `npm --prefix packages/X version Y` manually before pushing a tag.
- Push a `vX.Y.Z` tag by hand.
- Run `pnpm publish` locally.
- Push multiple tags in one session to fix failures — fix the code, re-run the workflow.

## Fallback

`release.yml` needs a `RELEASE_TOKEN` secret (a PAT with `contents: write` +
branch-protection bypass). If the workflow fails on its push to main, that secret
is missing — the manual fallback is documented in `CLAUDE.md § Release process`.
Surface the failure to the user rather than silently switching to manual mode.
