// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Shared flat ESLint config (ESLint v9+ flat config format).
 *
 * Every package/app imports this and can extend it, e.g.:
 *
 *   import base from '@carpool/config/eslint';
 *   export default [...base, { ...overrides }];
 *
 * @type {import("eslint").Linter.Config[]}
 */
export default tseslint.config(
  {
    // Things ESLint should never look at.
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/.expo/**',
      '**/.turbo/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/drizzle/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2023,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The whole point of this skeleton is type-safety: ban `any`.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  // Must come last so Prettier-conflicting stylistic rules are switched off.
  eslintConfigPrettier,
);
