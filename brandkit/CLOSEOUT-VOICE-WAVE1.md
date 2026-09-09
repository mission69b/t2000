# Phase close-out — Voice Wave 1 (open marketplace lead)

> Job A only. Copy. Prompt 2 **already landed** on audric — do not re-run it.
> After merge: Job B is Claude Design (light shell). Not this prompt.

---

## Paste below

```
CLOSE-OUT — Voice Wave 1 (open marketplace lead).

Prompt 2 is already done. Do NOT re-edit console copy. Do NOT start Job B
(Design / light shell) in this turn. Merge + paperwork only.

Locked lead (VOICE.md 2026-09-09):
  Lede: t2000 is the open marketplace.
  Sub: Agents, machines, robots, and humans. USDC.
  Title: t2000 — the open marketplace.

────────────────────────────────────────
1) CONFIRM SHIP STATE
────────────────────────────────────────

t2000
- Branch: docs/open-marketplace-wave1
- Commit: 5f7b0cde  📝 docs: open-marketplace lead (wave 1)
- Unrelated dirty tree: leave ARCHITECTURE.md and the pile of untracked
  brandkit/refs / emails / booth files ALONE.

audric
- Branch: docs/open-marketplace-wave1
- Commit: 242c329d  📝 docs(web): open-marketplace lead (wave 1)
- Ahead of origin/main by 1. Prompt 2 already applied (layout title/SEO,
  llms.txt H1, brand specimen + H1 sub, store metas, OG fallbacks,
  connect-host-guides one-liner). Do not open those files to "finish" Prompt 2.

If either commit is missing, STOP and tell the founder. Do not recreate Wave 1.

────────────────────────────────────────
2) COMMIT THE MAP FILES (t2000 only, if still untracked)
────────────────────────────────────────

On t2000, if these are untracked, add ONLY:

  brandkit/VOICE-ROLLOUT.md
  brandkit/ENG-HANDOFF-VOICE-WAVE1.md
  brandkit/CLOSEOUT-VOICE-WAVE1.md

Commit: 📝 docs: voice wave-1 rollout + closeout

Do not add BASECAMP-*, DESIGN-*, ENG-HANDOFF-EMAILS*, refs/, marketplace-exports/.

────────────────────────────────────────
3) PUSH + PR + MERGE
────────────────────────────────────────

Independent PRs. Audric does not wait on t2000.

t2000 (/Users/funkii/dev/t2000)
  git push -u origin docs/open-marketplace-wave1
  gh pr create --title "📝 docs: open-marketplace lead (wave 1)" --body "$(cat <<'EOF'
## Summary
- One public noun: **t2000 is the open marketplace.** Sub: agents, machines, robots, and humans. USDC.
- README / PRODUCT / docs intro / marketing one-pager / Connect pack / VOICE.md.
- Agent Marketplace stays the INTERNAL skill/CLI name. No find-replace. Whitepaper / CLI / skills left for later waves.

## Test plan
- [ ] README H3 + PRODUCT naming table read as open marketplace
- [ ] docs.t2000.ai intro (after Mintlify deploy) matches
- [ ] No CLI / feed.json / whitepaper edits in this PR
EOF
)"
  If CI is docs-only and green (or no blocking checks): squash-merge + delete branch.

audric (/Users/funkii/dev/audric)
  git push -u origin docs/open-marketplace-wave1
  gh pr create --title "📝 docs(web): open-marketplace lead (wave 1)" --body "$(cat <<'EOF'
## Summary
- Console title / SEO / llms.txt H1 / brand specimen / store metas → **the open marketplace**.
- No hire IA, theme, /manage, or email changes.
- Brand-page H1 sub also says open marketplace (same page as the specimen).

## Test plan
- [ ] View-source / tab title on t2000.ai is "t2000 — the open marketplace."
- [ ] https://t2000.ai/llms.txt first line matches
- [ ] /brand specimen reads "The open marketplace."
- [ ] No visual/IA change on home, hire, jobs, manage
EOF
)"
  Known: Dependency Audit / Biome may flag pre-existing Next CVEs or
  untouched formatting in the service OG file. Do not "fix" those in this PR.
  If the only red is that pre-existing class: squash-merge + delete branch
  after founder OK (they already reviewed the diff).

Return both PR URLs + merge SHAs.

────────────────────────────────────────
4) TRACKER / HANDOFF (if those files are mounted)
────────────────────────────────────────

Do not invent a new product S.N unless the latest tracker entry expects one
for this docs slice. If you update:

- audric-build-tracker: one short shipped note — Wave 1 noun, two SHAs, not
  a storefront restyle.
- HANDOFF_NEXT_AGENT: Wave 1 copy = shipped. Next = Job B Claude Design
  (light paper storefront, all public pages; optional light manage). Do not
  start Design in this turn.

────────────────────────────────────────
5) STOP
────────────────────────────────────────

Wave 1 is closed. Next session is Claude Design (VOICE-ROLLOUT.md Job B).
Email stays closed. Wave 2 (whitepaper H1, CLI READMEs, CLAUDE.md) is later.
```
