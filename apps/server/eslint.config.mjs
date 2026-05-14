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
      // outside `src/env.ts` (the canonical Zod-validated env module).
      // The exception list intentionally excludes everything except the
      // build-time `NODE_ENV` constant. Mirrors the canonical pattern at
      // `audric/apps/web/eslint.config.mjs` — see the rule
      // `t2000/.cursor/rules/env-validation-gate.mdc` for rationale.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name!='NODE_ENV']",
          message:
            "Use the typed `env` proxy from `src/env.ts` instead of `process.env.X`. See SPEC 30 D-14 + .cursor/rules/env-validation-gate.mdc.",
        },
        {
          selector:
            "MemberExpression[object.name='process'][property.name='env']:not(MemberExpression > MemberExpression)",
          message:
            "Use the typed `env` proxy from `src/env.ts` instead of accessing `process.env` directly. See SPEC 30 D-14.",
        },
      ],
    },
  },
  {
    files: ['src/env.ts'],
    rules: {
      // The env module is the gate — it must access `process.env` directly.
      'no-restricted-syntax': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'prisma/migrations/**'],
  },
);
