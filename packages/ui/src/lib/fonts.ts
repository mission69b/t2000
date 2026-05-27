/**
 * Font wiring reference for `@t2000/ui` consumers.
 *
 * `@t2000/ui` does NOT ship the Geist Sans / Geist Mono webfonts. Each
 * consumer wires them via `next/font/google` (or the `geist` npm package)
 * in their root layout, and the resulting CSS variables (`--font-sans`,
 * `--font-mono`) flow into the tokens declared in `@t2000/ui/tokens`.
 *
 * Canonical wiring for a Next.js consumer:
 *
 *   // app/layout.tsx
 *   import { GeistSans } from 'geist/font/sans';
 *   import { GeistMono } from 'geist/font/mono';
 *
 *   export default function RootLayout({ children }: { children: React.ReactNode }) {
 *     return (
 *       <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
 *         <body>{children}</body>
 *       </html>
 *     );
 *   }
 *
 * `GeistSans.variable` resolves to `--font-geist-sans`. To plumb that into
 * the `--font-sans` token declared in `@t2000/ui/tokens/geist-ds.css`,
 * either (a) set `--font-sans: var(--font-geist-sans);` in your own
 * globals.css, OR (b) wire `--font-sans` directly via the `next/font`
 * `variable` option (preferred — saves one CSS hop).
 *
 *   const sans = GeistSans({ variable: '--font-sans' });
 *   const mono = GeistMono({ variable: '--font-mono' });
 *
 * This module is documentation-only — no runtime exports.
 */
export {};
