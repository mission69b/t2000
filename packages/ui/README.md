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

## Quickstart

### Tailwind v4 (recommended; current major version)

```css
/* app/globals.css */
@import "tailwindcss";
@import "@t2000/ui/tokens";        /* --ds-* + --fg-* primitives */
@import "@t2000/ui/tokens/page";   /* utility classes (optional) */
@import "@t2000/ui/tokens/responsive";
@import "@t2000/ui/tokens/theme";  /* @theme block — registers utilities */

:root { --t2k-accent: var(--ds-blue-700); }  /* per-property accent */
```

### Tailwind v3 (legacy)

```tsx
// app/layout.tsx
import '@t2000/ui/tokens';
import '@t2000/ui/tokens/page';
import '@t2000/ui/tokens/responsive';
import './globals.css'; // your --t2k-accent override

// globals.css
:root { --t2k-accent: var(--ds-blue-700); }
```

```ts
// tailwind.config.ts
import t2000UiPreset from '@t2000/ui/tailwind-preset';

export default {
  presets: [t2000UiPreset],
  content: ['./app/**/*.{ts,tsx}', './node_modules/@t2000/ui/dist/**/*.js'],
};
```

### Usage (both versions)

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

## Tokens

CSS variables only — port of Vercel's [Geist Design System](https://vercel.com/geist). 314 custom properties under `--ds-*` (primitive scales) and `--fg-*` (semantic foregrounds) namespaces.

Canonical hex values synced to `apps/docs/docs.json` (Mintlify cannot import this package; sync is manual per token edit):

| Var | Hex | Used by |
|---|---|---|
| `--ds-blue-700` | `#0072F3` | `t2000.ai`, `developers.t2000.ai`, `suimpp.dev` link color |
| `--ds-teal-700` | `#12A594` | `mpp.t2000.ai` |
| `--ds-background-100` | `#0a0a0a` | All surfaces (dark mode default) |
| `--ds-background-200` | `#000000` | All page backdrops |

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
