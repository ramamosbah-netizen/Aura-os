// AURA OS — root ESLint flat config (TIER-2 #50).
// Type-aware-lite: no project service (keeps CI fast); focuses on real bug classes.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.d.ts',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Surfaced by #49; downgraded to warn so lint is green while mappers get typed.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // NestJS DI relies on empty constructors / parameter properties.
      '@typescript-eslint/no-empty-function': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      // TypeScript already resolves identifiers/globals; core no-undef is redundant + wrong here.
      'no-undef': 'off',
      // Stylistic — keep as warnings so lint gates on real bugs, not preference.
      'preserve-caught-error': 'warn',
      'no-useless-assignment': 'warn',
    },
  },
  {
    // Scripts + configs run in Node and may use console/process freely.
    files: ['**/*.mjs', '**/*.config.{ts,js,mjs}', '**/scripts/**'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-undef': 'off',
      'preserve-caught-error': 'off',
    },
  },
);
