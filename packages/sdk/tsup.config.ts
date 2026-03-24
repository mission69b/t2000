import { defineConfig } from 'tsup';

// @suilend packages have broken ESM imports (missing .js extensions, bare
// directory imports) that fail on Node 25+. Bundling resolves them at build time.
const BUNDLE_DEPS = ['@suilend/sdk', '@suilend/sui-fe', '@suilend/springsui-sdk'];

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/adapters/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    noExternal: BUNDLE_DEPS,
  },
  {
    entry: ['src/browser.ts'],
    format: ['esm'],
    dts: true,
    clean: false,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    platform: 'browser',
    noExternal: BUNDLE_DEPS,
  },
]);
