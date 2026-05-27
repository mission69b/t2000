# @t2000/ui

t2000 design system — Geist Design System tokens + shadcn/ui primitives themed for the t2000 brand family.

Consumed by:

- [`t2000.ai`](https://t2000.ai) — `apps/web` (accent: `#0072F3` blue)
- [`mpp.t2000.ai`](https://mpp.t2000.ai) — `apps/gateway` (accent: `#12A594` teal)
- [`suimpp.dev`](https://suimpp.dev) — separate repo (accent: monochrome)
- [`developers.t2000.ai`](https://developers.t2000.ai) — `apps/docs` Mintlify (token hex values synced manually)

## Install

```bash
pnpm add @t2000/ui
```

### Required Tailwind plugin

Several primitives (`Dialog`, `DropdownMenu`, `Sheet`, `Tooltip`) ship with `data-[state=open]:animate-in` / `animate-out` utility classes for their open/close transitions. You **must** install the matching plugin or those primitives will render with no animation (functional, but visually janky):

| Your Tailwind version | Plugin to install | How it's wired |
|---|---|---|
| **Tailwind v4** | `tw-animate-css` | `@import "tw-animate-css";` in `globals.css` (top, alongside `@import "tailwindcss";`) |
| **Tailwind v3** | `tailwindcss-animate` | `plugins: [require('tailwindcss-animate')]` in `tailwind.config.ts` |

```bash
# Tailwind v4 consumers
pnpm add -D tw-animate-css

# Tailwind v3 consumers
pnpm add -D tailwindcss-animate
```

## Quickstart

Pick **one** path based on which major version of Tailwind you run. The two paths are mutually exclusive — don't combine them.

### Path A — Tailwind v4 (recommended; current major version)

```css
/* app/globals.css */
@import "tailwindcss";
@import "tw-animate-css";             /* required for primitive animations */
@import "@t2000/ui/tokens";           /* --ds-* + --fg-* primitives */
@import "@t2000/ui/tokens/page";      /* optional: t2k-* utility classes */
@import "@t2000/ui/tokens/responsive";/* optional: responsive helpers */
@import "@t2000/ui/tokens/theme";     /* @theme block — registers utilities */

:root {
  --t2k-accent: var(--ds-blue-700);
  --t2k-accent-hover: var(--ds-blue-800);  /* tier-down for accent buttons */
}
```

You don't need a `tailwind.config.ts` with v4 — the `@theme` block in `tokens/theme` registers `bg-background`, `text-foreground`, `font-sans`, etc.

### Path B — Tailwind v3 (legacy)

```tsx
// app/layout.tsx
import '@t2000/ui/tokens';
import '@t2000/ui/tokens/page';
import '@t2000/ui/tokens/responsive';
import './globals.css'; // your --t2k-accent override
```

```ts
// tailwind.config.ts
import t2000UiPreset from '@t2000/ui/tailwind-preset';
import tailwindcssAnimate from 'tailwindcss-animate';

export default {
  presets: [t2000UiPreset],
  plugins: [tailwindcssAnimate], // required for primitive animations
  content: [
    './app/**/*.{ts,tsx}',
    './node_modules/@t2000/ui/dist/**/*.js',
  ],
};
```

```css
/* app/globals.css */
:root {
  --t2k-accent: var(--ds-blue-700);
  --t2k-accent-hover: var(--ds-blue-800);  /* tier-down for accent buttons */
}
```

### Usage (both paths)

```tsx
import { Button, Card, cn } from '@t2000/ui';

export function Hero() {
  return (
    <Card className={cn('p-6')}>
      <Button>Get started</Button>
    </Card>
  );
}
```

## Primitives

15 themed shadcn/ui primitives ship today. 14 from the main barrel: `Button`, `Card`, `Badge`, `Table`, `Separator`, `Dialog`, `Sheet`, `DropdownMenu`, `Tabs`, `Tooltip`, `Accordion`, `ScrollArea`, `Command`, `Skeleton`. One from a client-only sub-entry: `Toaster` (Sonner) from `@t2000/ui/toaster`.

### Skeleton

Loading placeholders, per CURSOR.md §9 "Skeleton states". Use shapes that match the eventual content (not generic spinners):

```tsx
import { Skeleton } from '@t2000/ui';

<Skeleton className="h-4 w-32" />        {/* metric label */}
<Skeleton className="h-8 w-48 mt-2" />   {/* metric value */}
```

The pulse animation is Tailwind's built-in `animate-pulse` (honors `prefers-reduced-motion`).

### Toaster (Sonner)

**Import from the `@t2000/ui/toaster` sub-entry, not the main barrel.** Sonner uses client-only React hooks at the top of its render function; the sub-entry ships with `'use client'` baked in so it works when imported from a server component (e.g. your root layout). The main `@t2000/ui` barrel stays RSC-friendly so server components can import `Card` / `Badge` / `Table` without paying client-bundle cost.

Mount once at your app root; trigger from anywhere via the re-exported `toast`:

```tsx
// app/layout.tsx (server component — fine, the sub-entry is 'use client')
import { Toaster } from '@t2000/ui/toaster';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}

// any-client-component.tsx (must already have 'use client' to call toast())
'use client';
import { Button } from '@t2000/ui';
import { toast } from '@t2000/ui/toaster';

<Button onClick={() => toast.success('Copied to clipboard')}>Copy</Button>
```

Defaults: `theme="dark"`, `position="bottom-right"`. Override either as a `<Toaster theme="light" position="top-center" />` prop. Sonner v2 inherits `--popover` + `--popover-foreground` tokens via the `bg-popover` / `text-popover-foreground` Tailwind classes in `classNames.toast`, which `@t2000/ui/tokens/theme` maps to `--bg-elevated` (Geist surface).

## Utility classes

Optional helpers from `@t2000/ui/tokens/page` — opt-in via class name (not applied to every element by default):

| Class | Purpose | Pattern (per CURSOR.md §9) |
|---|---|---|
| `.t2k-card-hover` | Interactive Card hover. Border darkens to `--ds-gray-alpha-500`, bg stays flat. | Border-strengthen |
| `.t2k-list-row` | Row in a list (accordion trigger, sidebar item). Bg lifts to `--ds-gray-alpha-100` on hover. | Surface-lift |
| `.t2k-link` | Inline link in body copy. Color shifts to `--t2k-accent` on hover, underline tracks. | Color-shift |
| `.t2k-hero-headline` | Text overlaying a glow/gradient. Forces GPU compositing to avoid fringing. | (anti-aliasing fix) |
| `.t2k-code` | Code blocks (Geist Mono). Forces `line-height: 1.75` — Tailwind's `leading-relaxed` is under-leaded for Geist Mono. | (line-height fix) |
| `.t2k-tabular` | Re-assert tabular-nums inside an element that opted out via `.t2k-prose`. | (numeric grid) |
| `.t2k-prose` | Opt OUT of global `tabular-nums` (body copy, long-form, FAQ answers). | (prose readability) |

Global defaults (no class needed): dark color-scheme, `-webkit-font-smoothing: antialiased`, `text-rendering: optimizeLegibility`, `font-feature-settings: "ss01" "cv11"`, `font-variant-numeric: tabular-nums`, 4px Geist-blue focus ring on every `<button>` / `<a>` / `<input>` / `<textarea>` / `<select>` / `[tabindex]` via low-specificity `:where()` rule. Per CURSOR.md §9 "Anti-aliasing & rendering" + "Focus rings" + "Dark mode is the default".

## Per-property accent

Every primitive references `var(--t2k-accent)`. Each consumer redefines it (plus `--t2k-accent-hover` for the tier-down on accent buttons) in its own globals.css:

| Property | Accent | Override |
|---|---|---|
| `t2000.ai` + `developers.t2000.ai` | `#0072F3` blue | `--t2k-accent: var(--ds-blue-700); --t2k-accent-hover: var(--ds-blue-800);` |
| `mpp.t2000.ai` | `#12A594` teal | `--t2k-accent: var(--ds-teal-700); --t2k-accent-hover: var(--ds-teal-800);` |
| `suimpp.dev` | monochrome (links only) | `--t2k-accent: var(--ds-blue-700); --t2k-accent-hover: var(--ds-blue-800);` (no fills) |

`--t2k-accent-hover` is the tier-down per CURSOR.md §9 "Tier-down" hover discipline — one ramp tier darker than the resting accent. If you omit it, the `bg-accent-hover` Tailwind utility falls back to `--t2k-accent` (accent buttons will appear static on hover instead of darkening).

## Per-property migration checklist

When wiring `@t2000/ui` into a new app (or fixing drift on an existing one), tick through this list in order. Most failure modes silently degrade — buttons render but don't tier-down, focus rings vanish, dark mode flickers — so verify each step rather than assuming defaults work.

- [ ] **Install** `@t2000/ui` and the matching animate plugin (`tw-animate-css` for v4, `tailwindcss-animate` for v3).
- [ ] **Wire `globals.css` imports** in this exact order: `tailwindcss` → `tw-animate-css` → `@t2000/ui/tokens` → `@t2000/ui/tokens/page` → `@t2000/ui/tokens/responsive` → `@t2000/ui/tokens/theme`. Order matters — `tokens` must load before `tokens/theme` so the `@theme` block can reference the primitives.
- [ ] **Define BOTH accent vars** in `:root`: `--t2k-accent` (resting) AND `--t2k-accent-hover` (one ramp tier darker). Skipping the hover var silently no-ops every accent button's tier-down. The hex values per property are in the table above; sync them from `--ds-blue-700` / `--ds-blue-800` (or `--ds-teal-700` / `--ds-teal-800`) — never hardcode the literal hex.
- [ ] **Wire Geist fonts** in root `layout.tsx` via `next/font/google`'s `GeistSans` + `GeistMono`, applied as className variables on `<html>`. Tokens reference `--font-sans` / `--font-mono` which resolve to the variables.
- [ ] **Confirm dark is the default.** No `data-theme` attribute on `<html>` = dark. Light mode is opt-in via `data-theme="light"`. Don't ship a property in light mode without an explicit design decision.
- [ ] **Mount `<Toaster />`** from `@t2000/ui/toaster` once in the root layout, only if the property uses `toast()` feedback. The sub-entry has `'use client'` baked in; the main `@t2000/ui` barrel is RSC-safe.
- [ ] **Verify focus rings render.** Tab through any `<button>` / `<a>` / `<input>`. Should get a 4px Geist-blue ring (`var(--shadow-focus)`) — same color on every property, including teal MPP and monochrome suimpp. If the browser default ring appears instead, the `:where()` rule in `tokens/page.css` isn't loading.
- [ ] **Verify hover states tier-down.** Hover any primary button — bg should swap to one ramp tier darker, no scale, no glow, no opacity fade. Hover a card — border-strengthen only. If any element opacity-fades or scales on hover, that's a CURSOR.md §9 violation; grep the component for `hover:opacity-` / `hover:scale-` and fix.

If hygiene drift on an existing app surfaces, that's the same list run as an audit — start from the top and find the first step that's wrong. The bug is almost always there.

## Dark / light mode

Default theme is **dark** (matches Geist). To switch to light, set `data-theme="light"` on `<html>` (or `data-mode="light"` on any ancestor):

```tsx
// app/layout.tsx — server-rendered light mode
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <body>{children}</body>
    </html>
  );
}
```

```tsx
// Client-side toggle
'use client';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      {theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
    </button>
  );
}
```

## Tokens

CSS variables only — port of Vercel's [Geist Design System](https://vercel.com/geist). 314 custom properties under `--ds-*` (primitive scales) and `--fg-*` (semantic foregrounds) namespaces.

Canonical hex values synced to `apps/docs/docs.json` (Mintlify cannot import this package; sync is manual per token edit):

| Var | Hex | Used by |
|---|---|---|
| `--ds-blue-700` | `#0072F3` | `t2000.ai`, `developers.t2000.ai`, `suimpp.dev` link color |
| `--ds-teal-700` | `#12A594` | `mpp.t2000.ai` |
| `--ds-background-100` | `#0a0a0a` | All surfaces (dark mode default) |
| `--ds-background-200` | `#000000` | All page backdrops |

### Primitive vs alias names

Seven Tailwind-reserved names (`--font-sans`, `--font-mono`, `--font-display`, `--radius-sm`, `--radius-md`, `--radius-lg`, `--ease-out`) collide with Tailwind v4's `@theme` namespaces. To avoid CSS custom-property cycles, these are stored under namespaced primitives and re-exported as bare-name aliases:

| Primitive (canonical) | Alias (consumer-facing) |
|---|---|
| `--ds-font-sans` | `--font-sans` |
| `--ds-font-mono` | `--font-mono` |
| `--ds-font-display` | `--font-display` |
| `--ds-radius-sm` | `--radius-sm` |
| `--ds-radius-md` | `--radius-md` |
| `--ds-radius-lg` | `--radius-lg` |
| `--ds-ease-out` | `--ease-out` |

You can reference either form. The Tailwind v3 preset and page-level utility classes use the bare aliases; the Tailwind v4 `@theme` block uses the `--ds-*` primitives.

## Fonts

Consumers wire Geist Sans + Geist Mono via `next/font/google` in their root layout. `@t2000/ui` tokens reference the resulting CSS variables (`--font-sans`, `--font-mono`).

```tsx
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

## License

MIT
