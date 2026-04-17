import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/adapters/index.ts', 'src/adapters/descriptors.ts', 'src/browser.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    // Bundle @naviprotocol/lending so the published SDK contains the patched
    // version of its dist (see patches/@naviprotocol__lending@1.4.0.patch).
    // Upstream lending still imports SuiClient/getFullnodeUrl from
    // @mysten/sui/client which no longer exist in @mysten/sui@2.x. The pnpm
    // patch fixes this in node_modules but never reaches npm consumers; tsup
    // bakes the patched dist into our published bundle.
    noExternal: ['@naviprotocol/lending'],
  },
]);
