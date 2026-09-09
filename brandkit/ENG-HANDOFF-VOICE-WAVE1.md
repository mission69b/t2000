# Eng handoff — Voice Wave 1 (copy only)

> **Job A only.** Noun rewrite. No Design, no theme, no hire IA, no email.
> Two PRs: t2000 first, then audric. Voice lock: `brandkit/VOICE.md`.
> Rollout map: `brandkit/VOICE-ROLLOUT.md`.

## Locked lines (do not invent)

**Lede:** t2000 is the open marketplace.  
**Sub:** Agents, machines, robots, and humans. USDC.  
**Title:** t2000 — the open marketplace.  
**Doors (when you need verbs):** Hire, work, earn.  
**SEO:** The open marketplace. Agents, machines, robots, and humans. Hire, work, earn in USDC.  
**Connect tagline:** t2000 — the open marketplace. Hire, work, earn in USDC. Post work, list a service, claim open jobs.

**Banned in Wave 1 cold leads:** agent marketplace · agent economy · agentic · on Sui · open economy.

**Keep:** `Agent Marketplace` as the *internal* skill-tier / CLI group name. Package names `@t2000/*`. Audric lead **AI you can put to work.** Sui in CLI/docs how-tos (addresses, gas). Robots in the **sub only** — no Hire-a-robot CTA, no Why row.

**Do not find-replace** `agent marketplace` repo-wide. That hits CLI groups, `feed.json`, skills, and the whitepaper.

---

## Prompt 1 — t2000 repo

Paste into Claude Code in `/Users/funkii/dev/t2000`.

```
Wave 1 copy only. Voice lock is brandkit/VOICE.md (2026-09-09). Rollout: brandkit/VOICE-ROLLOUT.md Job A Wave 1.

Locked public lead:
- Lede: t2000 is the open marketplace.
- Sub: Agents, machines, robots, and humans. USDC.
- Title: t2000 — the open marketplace.
- Doors when you need verbs: Hire, work, earn.
- SEO: The open marketplace. Agents, machines, robots, and humans. Hire, work, earn in USDC.
- Connect tagline: t2000 — the open marketplace. Hire, work, earn in USDC. Post work, list a service, claim open jobs.

Banned as cold first words: "agent marketplace", "agent economy", "agentic", "on Sui", "open economy".
Keep "Agent Marketplace" (capital M) as the INTERNAL skill-tier / CLI group name. Do not rename feed.json, CLI [Agent Marketplace] tags, or @t2000/* packages.
Robots live in the Sub only. Do not add a robot product, Why row, or Hire-a-robot CTA.
Audric lead unchanged: AI you can put to work.

Do NOT find-replace "agent marketplace" repo-wide. Touch ONLY these files:

1) brandkit/VOICE.md — already locked. Do not rewrite. You may leave it.

2) brandkit/MARKETING-ONEPAGER.md
   - 30-second pitch: t2000 is the open marketplace. Sub + doors. Drop "on Sui" from the pitch.
   - One-line table: The open marketplace — hire · work · earn
   - Kill the Brand hierarchy "Umbrella = Agent economy on Sui" row. One public noun: open marketplace. Connect stays last beat.
   - Lines: Title / Tagline from VOICE.md. Proof "USDC on Sui" can become "USDC" + escrow/receipts (Sui is a docs fact, not a slogan).

3) brandkit/connect-directory/DESCRIPTION.md + README.md
   - Tagline / short / full from VOICE.md Passport Connect block.
   - Full description: do not open with "the agent economy on Sui".
   - Example prompts: "t2000 marketplace" / "open marketplace", not "t2000 agent marketplace".
   - Note in README: already-submitted directory filings stay until the next host edit window. Update the pack so the next paste is right.

4) README.md
   - H3: The open marketplace. (not "The agent marketplace. Hire · work · earn.")
   - Under it, the Sub or a one-line "Agents, machines, robots, and humans. USDC."
   - Drop "Live on Sui" from the billboard. Stage/fact can stay "live mainnet" in the Product table.
   - Product What row: Open marketplace — hire, work, earn in USDC. Who can stay people + agents (don't force robots into every cell).

5) PRODUCT.md
   - Voice section: drop "umbrella / marketplace / Connect" as three public brands. Point at VOICE.md one-lead lock.
   - Naming layers table: retire **Umbrella / Agent economy** as a public noun. Public lead = open marketplace. Internal inventory name Agent Marketplace (skills/CLI) may stay as a row labeled INTERNAL. Distribution = Passport Connect unchanged.
   - Delete "Index/README may lead with agent economy, then agent marketplace".
   - Marketplace vocabulary line "Surface noun = Marketplace. Umbrella = agent economy" → public noun = open marketplace; A2A remains a mode badge.
   - Two brands table: t2000.ai = the open marketplace + Passport Connect + rails. Not "Agent marketplace (A2A rails)".
   - Do NOT rewrite the 2026-08-01 product B lock, specs, or Service/Job vocabulary.

6) apps/docs/index.mdx
   - frontmatter description + opening paragraph: open marketplace, no "on Sui" in the H1/lede. Sui can stay later as a package/chain fact if needed.

Do NOT touch this pass: T2000_WHITEPAPER.md, CLAUDE.md, ARCHITECTURE.md, packages/cli, t2000-skills/feed.json, skill SKILL.md files, BASECAMP-BOOTH-SUBMIT.md, emails, contracts.

Commit style: 📝 docs: open-marketplace lead (wave 1)
Do not push unless I ask.

Verify:
- rg -n "agent marketplace|agent economy|on Sui" on the six files above — leftover only if it's an INTERNAL label or a how-to fact, not a cold lead.
- Re-read the diff. No UI, no Design, no IA.
```

---

## Prompt 2 — audric repo (after t2000 PR exists)

Paste into Claude Code in `/Users/funkii/dev/audric`.

```
Wave 1 copy only on the t2000 console. Voice lock lives in the sibling repo: /Users/funkii/dev/t2000/brandkit/VOICE.md (2026-09-09).

Locked public lead:
- Title: t2000 — the open marketplace.
- Lede: t2000 is the open marketplace.
- Sub: Agents, machines, robots, and humans. USDC.
- SEO: The open marketplace. Agents, machines, robots, and humans. Hire, work, earn in USDC.
- Doors when you need verbs: Hire, work, earn.

Banned as cold first words: "agent marketplace", "agent economy", "on Sui".
Keep visible page H1s / hire IA / theme / /manage / emails UNTOUCHED. This is metadata + specimen + machine front door only.

Touch ONLY:

1) apps/console/app/layout.tsx
   - metadata.title.default → "t2000 — the open marketplace."
   - metadata.description → SEO line above. No "on Sui".

2) apps/console/app/llms.txt/route.ts
   - First markdown H1 only (and the first sentence if it still leads "the agent marketplace" / "on Sui").
   - Example: `# t2000 (t2000.ai) — the open marketplace. Hire, work, earn in USDC.`
   - Do NOT rewrite the playbook body, endpoints, CLI verbs, or earn-first facts. Sui stays where it is an operational fact (registry, scheme).
   - Machine-front-door skill: this is a lead-noun change on the apex playbook, not a new SSOT.

3) apps/console/app/(store)/brand/page.tsx
   - Meta title/description/OG: "open marketplace", not "agent marketplace".
   - Display type specimen "The agent marketplace." → "The open marketplace."
   - Language-lock comment at top of file.
   - Do NOT regenerate PNGs. The "AGENT ECONOMY" baked lockup filename can stay.

4) Store SEO metas only (not visible H1s):
   - app/(store)/services/page.tsx description
   - app/(store)/agents/page.tsx description
   - service JSON-LD / OG on (store)/(profile)/[address]/services/[slug]/page.tsx and its opengraph-image.tsx if the alt/description says "agent marketplace"
   - (store)/(profile)/[address]/opengraph-image.tsx directory card copy if it leads "Agent Marketplace" as the product noun — use open marketplace. Receipts/USDC can stay.

Do NOT touch: home page JSX, jobs/hire/sell copy, /manage, emails (packages/emails), legal, Connect host-guide body except if a one-line "USDC agent marketplace" is the only public blurb — then swap that one line.

Do NOT find-replace repo-wide.

Commit style: 📝 docs(web): open-marketplace lead (wave 1)
Do not push unless I ask.

Verify:
- rg those files for "agent marketplace" / "agent economy" — none in title/description/OG/llms H1/specimen.
- Layout + brand + llms first 5 lines re-read.
- No CSS, no theme, no component IA.
```

---

## After both land

Founder reviews diffs. Then Job B = Claude Design light marketplace (separate). Email is closed.
