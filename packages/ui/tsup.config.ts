import { defineConfig } from 'tsup';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Two configs so the `'use client'` directive can be applied ONLY to the
// toaster entry. Three things conspire against the obvious approach
// (top-of-source directive + `banner` option):
//
//   1. esbuild ignores top-of-file `"use client"` source directives
//      during bundling (it warns "Module level directives cause errors
//      when bundled, 'use client' was ignored"). The directive is
//      stripped from the source AST before esbuild emits.
//   2. tsup's `banner.js` option fires BEFORE esbuild's strip pass, so
//      the banner-injected directive ALSO gets stripped — esbuild
//      cannot tell apart a banner-injected directive from a real one.
//   3. Splitting / treeshake settings don't change this.
//
// The reliable hook is `onSuccess`, which fires AFTER esbuild has
// written the output file. We re-prepend the directive as the very
// first bytes of `dist/toaster.js`.
//
// The MAIN barrel (`dist/index.js`) intentionally does NOT get this
// treatment. It re-exports server-safe primitives (Card, Badge, Table,
// Separator, Skeleton) alongside Radix-backed primitives that ship
// their own `'use client'` directives inside `@radix-ui/react-*`.
// Adding a blanket directive to the barrel would force every consumer
// to pay client-bundle cost for purely presentational components used
// on RSC marketing pages.
const shared = {
  format: ['esm'] as const,
  dts: true,
  sourcemap: true,
  treeshake: true,
};

const USE_CLIENT = '"use client";\n';

function prependUseClient(filename: string): void {
  const path = resolve(filename);
  if (!existsSync(path)) {
    console.warn(`[tsup:onSuccess] ${filename} not found; skipping 'use client' prepend`);
    return;
  }
  const content = readFileSync(path, 'utf8');
  if (content.startsWith('"use client"') || content.startsWith("'use client'")) {
    return;
  }
  writeFileSync(path, USE_CLIENT + content);
}

export default defineConfig([
  {
    ...shared,
    entry: ['src/index.ts', 'src/tailwind-preset.ts'],
    clean: true,
  },
  {
    ...shared,
    entry: ['src/toaster.ts'],
    clean: false,
    onSuccess: async () => {
      prependUseClient('./dist/toaster.js');
    },
  },
]);
