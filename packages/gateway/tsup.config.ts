import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  banner: {
    js: [
      `import { createRequire as __createRequire } from 'module';`,
      `import { fileURLToPath as __fileURLToPath } from 'url';`,
      `import { dirname as __pathDirname } from 'path';`,
      `const require = __createRequire(import.meta.url);`,
      `const __filename = __fileURLToPath(import.meta.url);`,
      `const __dirname = __pathDirname(__filename);`,
    ].join(' '),
  },
});
