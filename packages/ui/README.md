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

:root { --t2k-accent: var(--ds-blue-700); }  /* per-property accent */
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
:root { --t2k-accent: var(--ds-blue-700); }
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

## Per-property accent

Every primitive references `var(--t2k-accent)`. Each consumer redefines it in its own globals.css:

| Property | Accent | Override |
|---|---|---|
| `t2000.ai` + `developers.t2000.ai` | `#0072F3` blue | `:root { --t2k-accent: var(--ds-blue-700); }` |
| `mpp.t2000.ai` | `#12A594` teal | `:root { --t2k-accent: var(--ds-teal-700); }` |
| `suimpp.dev` | monochrome (links only) | `:root { --t2k-accent: var(--ds-blue-700); }` (no fills) |

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
