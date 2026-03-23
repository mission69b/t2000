import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/adapters/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    noExternal: [
      /^@suilend/,
      /^@naviprotocol/,
      /^@cetusprotocol/,
      /^@pythnetwork/,
    ],
    esbuildOptions(options) {
      if (options.format === 'esm') {
        options.banner = {
          js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
        };
      }
    },
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
  },
]);
