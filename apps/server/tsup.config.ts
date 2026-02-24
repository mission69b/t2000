import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/indexer/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  external: ['@prisma/client'],
});
