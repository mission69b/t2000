import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      // [SPEC 30 D-14 — 2026-05-14] Block direct `process.env.X` reads
      // outside `lib/env.ts` (the canonical Zod-validated env module).
      // Mirrors `apps/server/eslint.config.mjs` and the canonical pattern
      // at `audric/apps/web/eslint.config.mjs`. NODE_ENV is exempt as a
      // build-time constant.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name!='NODE_ENV']",
          message:
            "Use the typed `env` proxy from `@/lib/env` instead of `process.env.X`. See SPEC 30 D-14 + .cursor/rules/env-validation-gate.mdc.",
        },
        {
          selector:
            "MemberExpression[object.name='process'][property.name='env']:not(MemberExpression > MemberExpression)",
          message:
            "Use the typed `env` proxy from `@/lib/env` instead of accessing `process.env` directly. See SPEC 30 D-14.",
        },
      ],
    },
  },
  {
    files: ['lib/env.ts', 'vitest.config.ts', 'vitest.config.e2e.ts', 'scripts/**/*'],
    rules: {
      // - lib/env.ts is the gate; must access process.env directly.
      // - vitest.config.ts seeds test env vars before any test imports env.ts.
      // - scripts/*.mjs are codemod / one-off tools that need raw env access.
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['test/**/*', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      // Tests legitimately read process.env.NODE_ENV, set test fixtures
      // via process.env, and use vi.stubEnv. Allow it.
      'no-restricted-syntax': 'off',
    },
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'prisma/migrations/**', 'public/**'],
  },
);
