import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: process.env.SMOKE
      ? ['src/__smoke__/**/*.test.ts']
      : ['src/**/*.test.ts'],
    exclude: process.env.SMOKE
      ? []
      : ['src/__smoke__/**'],
    testTimeout: process.env.SMOKE ? 60_000 : 30_000,
  },
});
