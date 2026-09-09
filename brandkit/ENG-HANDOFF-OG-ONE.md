# Eng handoff — one static OG + generated-card nit

> PNG **already copied** to audric `public/og-home.png` and
> `public/brand/og-home.png` (hash `f20f8bed…` = brandkit).
> Docs `apps/docs/og.png` already matches. This prompt is the rest.

---

## Paste into Claude Code on `/Users/funkii/dev/audric`

```
One static OG + drop // on generated job/profile/service OG cards.
The PNG is ALREADY in place — do not recopy unless shasum drifts:

  apps/console/public/og-home.png
  apps/console/public/brand/og-home.png
  must equal /Users/funkii/dev/t2000/brandkit/og-home.png
  (f20f8bed1c2e3ff296b4d6d5a495ea231670cea9)

Do not Design. Do not touch hire IA, home fold, emails, or MCP cards.

────────────────────────────────────────
1) STATIC — one file
────────────────────────────────────────
Point every images: ["/og-jobs.png"] or ["/og-agents.png"] at
["/og-home.png"]:
  app/(store)/jobs/page.tsx
  app/(store)/agents/page.tsx

Delete:
  apps/console/public/og-jobs.png
  apps/console/public/og-agents.png

Fix comments that still say the jobs board keeps og-jobs.png.

rg: no href to /og-jobs.png or /og-agents.png.

────────────────────────────────────────
2) GENERATED CARDS — drop //
────────────────────────────────────────
Same family as the static card: wordmark left, NOTHING that looks like
a console comment. Eyebrows if kept = human words, no slashes.

jobs/[jobId]/opengraph-image.tsx
  "// SETTLED" → "SETTLED"
  "// JOB" → "JOB"
  "// OPEN" → "OPEN"
  "// JOBS" → "JOBS"  (or drop the top-right on fallback)
  Header comment: no `//` eyebrow, no og-jobs.png as the chrome SSOT
  (chrome matches og-home: void + ember bleed + wordmark + footer).
  Footer "ON SUI" / "RECEIPTS PUBLIC" → "RECEIPTS" / "ON-CHAIN"
  (Sui is not a slogan). Support already says open marketplace — keep.

lib/og-card.tsx + profile + service opengraph-image.tsx
  "// AGENTS" → "AGENTS"
  "// SELLER" / "// AGENT" → "SELLER" / "AGENT"
  "// SERVICES" → "SERVICES"
  "// SERVICE" if present → "SERVICE"
  Update the header comment that says `//` eyebrow top-right.
  Fallback supports may drop "receipts on Sui" → "receipts on-chain"
  or just "USDC, receipts."

Do not redesign the ImageResponse layout. Copy + comment + delete
statics only.

────────────────────────────────────────
VERIFY
────────────────────────────────────────
rg og-jobs.png og-agents.png  → no public routes
rg '"//' apps/console/app/\(store\) apps/console/lib/og-card.tsx
  → no OG eyebrows
shasum the two public og-home.png files = brandkit
typecheck @audric/console

Commit: 📝 docs(web): one static OG + drop // on job cards
Do not push unless I ask.
```

---

## t2000 (if art still uncommitted)

Commit `brandkit/og-home.png`, deleted `og-jobs`/`og-agents`, `apps/docs/og.png`, README, VOICE OG H1, this handoff.

```
📝 docs: one static OG (Open marketplace.)
```
