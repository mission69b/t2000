import { defineConfig } from 'tsup';

// Bundle all protocol SDKs so their transitive peer-dependency conflicts
// (different @mysten/sui versions) don't surface as npm warnings on install.
// Also fixes broken ESM imports in @suilend packages on Node 25+.
const BUNDLE_DEPS = [
  '@suilend/sdk',
  '@suilend/sui-fe',
  '@suilend/springsui-sdk',
  '@naviprotocol/lending',
  '@cetusprotocol/aggregator-sdk',
  '@mysten/zklogin',
  '@t2000/mpp-sui',
  'mppx',
  // NOT @pythnetwork/pyth-sui-js — its CJS transitive deps (axios, form-data,
  // combined-stream) use dynamic require() which breaks Next.js Turbopack.
];

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
