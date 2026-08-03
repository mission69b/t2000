---
name: t2000-design-system
description: >-
  The t2000 family design system — token VALUES are copy-in and owned per-app
  (no shared tokens directory or package; this monorepo ships no UI after
  kill-web), shadcn primitives are owned per-app, the house look is a seamless
  near-black dark theme with a per-app --t2k-accent, and @t2000/ui must never
  be reintroduced. Use when styling any t2000-family surface, editing an app's
  tokens/globals/theme CSS, picking colors or radii, deciding whether to reach
  for shadcn, or when tempted to create a shared UI/token package.
---

# t2000 Design System (copy-in tokens + per-app shadcn)

> **Updated 2026-07-01.** The old model — `@t2000/ui` as a runtime dependency
> shipping tokens **and** shadcn primitives — was retired. It broke consuming
> apps: its "tokens" bundled a full marketing stylesheet (reset + element
> typography + `!important` responsive hacks), and packaged shadcn primitives
> can't be styled by a consumer's Tailwind (node_modules isn't scanned) →
> padding/hover/cards silently broke on platform.t2000.ai. shadcn is copy-in by
> design; so are our tokens now.

## The model — two things, decoupled

1. **VALUES are shared by COPY-IN, not by dependency.** Each app that ships UI
   owns its own tokens file — pure CSS custom properties only (Geist `--ds-*`
   palette, semantic `--fg` / `--bg` / `--bg-elevated` / `--border`, radii,
   spacing, fonts). **No element selectors, resets, utilities, `@media`, or
   `!important`** — so it's safe to drop into any app. There is no monorepo
   tokens directory to import from — after kill-web (2026-08-03) the t2000
   monorepo is docs + packages only; the live copies are in the audric repo
   (console, Connect). New surface → copy from the console's tokens, then map
   the vars you use into Tailwind via `@theme inline`.

2. **COMPONENTS are shadcn primitives, owned per-app** in `components/ui/`. Use
   them where interaction / a11y justifies (buttons, inputs, dialogs, tables,
   dropdowns, tooltips, command palettes, sidebars). **Never consume a component
   package.** Bespoke marketing/utility layout (heroes, section grids, a feed)
   can stay raw JSX + tokens — don't shadcn-ify a landing page for its own sake.

## House theme

- **Dark is canonical.** The family look is a **seamless near-black**:
  `--bg #08090a`, `--bg-elevated #0f1113` (cards/popovers), hairline
  `rgba(255,255,255,.08)` borders. Intentionally darker than raw Geist surfaces
  (its `gray-100 #1a1a1a` / `.14` read too "app-chrome").
- Apps read the **semantic** tokens (`--bg` / `--bg-elevated` / `--border`), NOT
  the raw `--ds-gray-*` primitives (those are the palette source).
- **Per-app accent** is the one knob: `:root { --t2k-accent: <brand> }` — emerald
  blue (t2000.ai). shadcn apps map the house values into
  their own token slots (`--background`/`--card`/`--border`…) because shadcn's
  names collide with the canonical's `--border`/`--font-*`/`--radius-*`
  (importing the file would cycle) — so copy the values in.

## Current adoption

| Surface | State |
|---|---|
| t2000.ai marketplace + console (`audric/apps/console`) | ✅ near-black house theme (Ember Steel) — shadcn slots on house values; Tailwind + shadcn architecture unchanged |
| suimpp.dev (separate repo) | ⏳ still on published npm `@t2000/ui` until it migrates to copy-in |
| audric.ai (`audric/apps/web-v3`) | ➖ consumer flagship — keeps its OWN theme, the ONE surface outside the family look |

## `@t2000/ui` — REMOVED (2026-07-01)

Deleted from the monorepo (and the marketing web app that consumed it was
deleted 2026-08-03). **Do not reintroduce a shared UI/token package** — it was the thing
that broke platform (bundled a marketing global stylesheet + packaged shadcn
primitives a consumer's Tailwind can't scan).

## Rules

1. **Share values by copy-in** — never a component/token package dependency.
2. **shadcn primitives, owned per-app**, where interaction justifies. Raw JSX +
   tokens for marketing/utility is fine.
3. **Read semantic surface tokens** (`--bg`/`--bg-elevated`/`--border`); set
   `--t2k-accent` per app; never hardcode hex outside `tokens.css` or the app's
   semantic mapping.
4. **Token files stay pure variables** — anything with an element selector,
   reset, or `!important` belongs in the app, never the token file.
5. **New t2000 surface** = copy the console's tokens + (if it needs real
   interaction) shadcn primitives. Don't reach for `@t2000/ui`.

## Related

- No-needless-abstraction principle → `t2000-engineering` skill §2, §8
