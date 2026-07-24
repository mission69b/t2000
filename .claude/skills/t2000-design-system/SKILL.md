---
name: t2000-design-system
description: >-
  The t2000 family design system — design-tokens/tokens.css is the copy-in SSOT
  for VALUES, shadcn primitives are owned per-app, the house look is a seamless
  near-black dark theme with a per-app --t2k-accent, and @t2000/ui must never be
  reintroduced. Use when styling or restyling any app in apps/*, adding a new
  t2000 surface, editing tokens.css or an app's globals/theme CSS, picking
  colors or radii, deciding whether to reach for shadcn, or when tempted to
  create a shared UI/token package.
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

1. **VALUES are shared by COPY-IN, not by dependency.** The SSOT is
   `design-tokens/tokens.css` — pure CSS custom properties only (Geist `--ds-*`
   palette, semantic `--fg` / `--bg` / `--bg-elevated` / `--border`, radii,
   spacing, fonts). **No element selectors, resets, utilities, `@media`, or
   `!important`** — so it's safe to drop into any app. Each app copies it in and
   owns it (like `npx shadcn add`), then maps the vars it uses into Tailwind via
   `@theme inline`. Update the canonical file → re-copy.

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
  (verify), teal (mpp), blue (t2000.ai). shadcn apps map the house values into
  their own token slots (`--background`/`--card`/`--border`…) because shadcn's
  names collide with the canonical's `--border`/`--font-*`/`--radius-*`
  (importing the file would cycle) — so copy the values in.

## Current adoption

| Surface | State |
|---|---|
| verify.t2000.ai (`apps/verify`) | ✅ copies `tokens.css`, house theme, emerald accent |
| t2000.ai (`apps/web`), mpp.t2000.ai (`apps/gateway`) | ✅ copy-in `tokens.css` + the 2026-07 designer chrome (`app/styles/{tokens,type,page,responsive,theme}.css`); legacy `geist-ds.css` deleted; a temporary raw-primitive shim in each `globals.css` covers pre-redesign components until their port |
| agents.t2000.ai (`audric/apps/console`) | ⏳ flips to the near-black house theme (founder decision 2026-07-06) by setting the console's shadcn slots to house values; Tailwind + shadcn architecture unchanged |
| suimpp.dev (separate repo) | ⏳ still on published npm `@t2000/ui` until it migrates to copy-in |
| audric.ai (`audric/apps/web-v3`) | ➖ consumer flagship — keeps its OWN theme, the ONE surface outside the family look |

## `@t2000/ui` — REMOVED (2026-07-01)

Deleted from the monorepo. `web` + `gateway` own their token + marketing-chrome
CSS locally. **Do not reintroduce a shared UI/token package** — it was the thing
that broke platform (bundled a marketing global stylesheet + packaged shadcn
primitives a consumer's Tailwind can't scan).

## Rules

1. **Share values by copy-in** (`design-tokens/tokens.css`) — never a
   component/token package dependency.
2. **shadcn primitives, owned per-app**, where interaction justifies. Raw JSX +
   tokens for marketing/utility is fine.
3. **Read semantic surface tokens** (`--bg`/`--bg-elevated`/`--border`); set
   `--t2k-accent` per app; never hardcode hex outside `tokens.css` or the app's
   semantic mapping.
4. **`design-tokens/tokens.css` stays pure variables** — anything with an element
   selector, reset, or `!important` belongs in the app, never the token file.
5. **New t2000 surface** = copy `tokens.css` + (if it needs real interaction)
   shadcn primitives. Don't reach for `@t2000/ui`.

## Related

- Canonical tokens → `design-tokens/tokens.css`
- No-needless-abstraction principle → `t2000-engineering` skill §2, §8
