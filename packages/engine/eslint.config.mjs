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
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@t2000/ui', '@t2000/ui/*'],
              message:
                '@t2000/ui is a UI/React design system. @t2000/engine MUST stay React-free — it runs on Node (server, CLI, MCP host). Move any shared types/utilities into @t2000/sdk, then import from @t2000/sdk here.',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
);
