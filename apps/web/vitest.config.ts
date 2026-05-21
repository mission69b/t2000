import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["app/**/*.test.ts", "app/**/__tests__/**/*.test.ts"],
    // [v0.7d Phase 6 Block C.1 — 2026-05-21 / S.223] aggregateFees.test.ts
    // was the only test in @t2000/web; deleted alongside the /api/stats
    // Prisma refactor. CI continues to run `pnpm --filter @t2000/web test`,
    // so `passWithNoTests` keeps the pipeline green until something new
    // here merits a test. Drop this flag the moment another test lands.
    passWithNoTests: true,
  },
});
