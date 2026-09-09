# Voice + light-shell rollout

> After `VOICE.md` 2026-09-09. **Audit first, then waves. Claude Design
> before any site restyle.** Do not silently rewrite the store in Cursor.

Two jobs. Do not mix them in one PR.

| Job | What | When |
|---|---|---|
| **A — Noun** | Cold copy: agent marketplace → **open marketplace** | Copy PRs, no Design |
| **B — Shell** | Light paper chrome, no dark storefront | Claude Design → then Code |

---

## What does **not** change

| Keep | Why |
|---|---|
| Sui in CLI/docs how-tos | Operational fact (addresses, gas). Not a slogan. |
| Skill tier name **Agent Marketplace** (4 skills) | Internal inventory. Renaming `feed.json` / CLI groups is a later slice. |
| CLI `[Agent Marketplace]` tags / `A2A Marketplace — earn` | Machine/CLI surface. Optional later. |
| Package names `@t2000/*` | Never rename. |
| Audric lead | **AI you can put to work.** |
| Email kit | Already on the new voice + paper shell. |
| Hire / job-rail IA | Frozen. Design may *skin* pages; do not reopen Listing \| Custom or the rail. |
| `/manage` IA | Desk IA frozen. Light skin is in-scope for Design; don’t invent banks. |

---

## Job A — noun audit (copy only)

### Wave 1 — cold lead (do this)

| File | Why |
|---|---|
| `brandkit/VOICE.md` | **Done** (this lock) |
| `brandkit/MARKETING-ONEPAGER.md` | Public pitch |
| `brandkit/connect-directory/DESCRIPTION.md` + `README.md` | Directory paste. **Filings already submitted may stay until the next edit window.** |
| `README.md` | GitHub H1 |
| `PRODUCT.md` | Surface noun row + “cold copy leads…” |
| `apps/docs/index.mdx` | Docs intro |
| `audric/apps/console/app/layout.tsx` | OG / `<title>` |
| `audric/apps/console/app/llms.txt/route.ts` | **Machine front door** — first line agents read |
| `audric/apps/console/app/(store)/brand/page.tsx` | Type specimen + meta |
| Store meta: `services/page.tsx`, `agents/page.tsx`, service JSON-LD | SEO |

### Wave 2 — same noun, less urgent

| File | Why |
|---|---|
| `apps/docs/passport-connect.mdx` + other MDX leads | Docs stay factually right |
| `t2000-skills/README.md` + skill one-liners that say “A2A Marketplace” / “agent marketplace” in the *title* | Playbook voice. Not the tier name. |
| `packages/cli/README.md` | npm page |
| `CLAUDE.md` / `ARCHITECTURE.md` | Internal; align so agents don’t re-teach the old lead |
| `brandkit/SOCIAL-DRAFTS.md` | Next posts only — don’t rewrite history |
| `BASECAMP-BOOTH-SUBMIT.md` | Booth already printed “AGENT MARKETPLACE” — **do not reprint** |

### Wave 3 — leave unless you’re doing a docs PHASE

| File | Why |
|---|---|
| `T2000_WHITEPAPER.md` | H1 → **t2000 is the open marketplace.** Same sub. Vision stays in the body. Wave 2, not a rewrite of the layers. |
| `packages/cli/src/program.ts` help text | CLI taxonomy |
| `t2000-skills/feed.json` comments / `.claude-plugin` | Shelf labels |
| Legal (`privacy`) | “agents and people” is already right |

### Do **not** “align everywhere” in one commit

A find-replace of “agent marketplace” will hit skill tiers, CLI groups, and
the whitepaper umbrella. That’s how you get a broken shelf and a lying
paper. Wave 1 only, then stop.

---

## Job B — light shell (Design first)

**Lock for Claude Design (not Code yet):**

- Storefront is **light only** — paper page `#F7F8F8`, white plates radius 16,
  ember pills, void ink. Same kit as mail.
- **Ditch storefront dark / system.** No theme toggle on `/`, jobs, services,
  how-it-works, hire, sell, agents, activity, brand.
- **Contained void hero can stay** as the one dark *band* (Airtasker navy).
  If Design kills it, that’s a founder pick on the frame — not a Code guess.
- **`/manage` today is dark by lock.** Show a light desk in Design so we can
  see it. Do not Code-port manage until you approve that frame.
- Every **public** store page in the pass2 set gets a frame. Not a new IA.

**Then** one Claude Code slice. Not before.

---

## Recommended sequence

1. You sign this voice lock (this file + `VOICE.md`).
2. Claude Code **Wave 1 only** (copy). Separate t2000 + audric PRs.
3. Claude Design: light marketplace (all public pages) + optional light manage.
4. You pick frames.
5. Claude Code skins the store. Theme picker comes out of the storefront.
6. Docs PHASE + `llms.txt` already done in wave 1.

Email is **not** in this rollout.
