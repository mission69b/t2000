import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["app/**/*.test.ts", "app/**/__tests__/**/*.test.ts"],
  },
});
