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
      // Block direct `process.env.X` reads outside `lib/env.ts` (the
      // canonical Zod-validated env module). NODE_ENV is exempt as a
      // build-time constant. See .cursor/rules/env-validation-gate.mdc.
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
        // Sui JSON-RPC is deactivated (mainnet: week of July 20, 2026) — gRPC only (§8b,
        // SPEC_STORE_V2). Any `jsonrpc: '2.0'` body is a regression.
        {
          selector: "Property[key.name='jsonrpc']",
          message:
            'Sui JSON-RPC is retired — use SuiGrpcClient (@mysten/sui/grpc). See SPEC_STORE_V2 §8b.',
        },
        {
          selector: "Property[key.value='jsonrpc']",
          message:
            'Sui JSON-RPC is retired — use SuiGrpcClient (@mysten/sui/grpc). See SPEC_STORE_V2 §8b.',
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
