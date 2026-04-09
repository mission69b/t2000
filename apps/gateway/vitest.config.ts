import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['test/e2e/**', 'node_modules/**'],
    alias: {
      '@': path.resolve(__dirname),
    },
  },
});
