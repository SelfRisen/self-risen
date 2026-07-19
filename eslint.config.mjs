// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn'
    },
  },
  {
    // Jest mock scaffolding is inherently loosely typed (mock objects,
    // jest.mock factories, require() in module mocks) — don't fight it.
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      // Mocked fetch responses use `async json() { return {...} }` to match
      // the real Response shape; there is nothing to await.
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    // LLM prompt templates are prose, not code. Escaped quotes inside them are
    // harmless (`\"` and `"` are the same character in a template literal) and
    // hand-stripping hundreds of them risks corrupting the prompt.
    files: ['src/**/prompts/**/*.ts'],
    rules: {
      'no-useless-escape': 'off',
    },
  },
);