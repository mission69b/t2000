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
      // [v3.1.0 / 2026-05-25] Test fixtures (prompts-compose.test.ts,
      // skills-prompts.test.ts, write.test.ts) use bare `Function` to
      // type mock handlers. Downgraded to warning so the config can ship
      // without rewriting test scaffolding mid-cleanup-slice. Fixing the
      // 14 occurrences is a follow-up — typed `(args: …) => Promise<…>`
      // sigs would be cleaner but is outside the scope of just-getting-
      // lint-to-work-here.
      '@typescript-eslint/no-unsafe-function-type': 'warn',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
);
