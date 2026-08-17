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
      // NEXT_DIST_DIR (apps/web/next.config.ts) builds to a second directory. Unignored, its
      // generated bundles are linted as source — 41,996 errors the first time it was used.
      '**/.next-e2e/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.d.ts',
      '**/playwright-report/**',
      '**/test-results/**',
      // Local-only: git worktrees created under .claude/ are full repo copies and must not
      // be linted (they'd double-count and lint stale code CI never sees).
      '.claude/**',
      '**/.turbo/**',
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
      // Same `_`-prefix convention the TS block uses — deliberately-ignored destructured
      // entries (`for (const [_k, v] of map)`) are intent, not dead code.
      // tseslint's recommended set is not file-scoped, so its rule is the one that fires here.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // The service worker runs in the ServiceWorkerGlobalScope, not Node and not the window:
    // `self`, `caches`, `clients` and the Fetch/Cache APIs are its globals, and without this
    // block core no-undef flags all 13 of them.
    files: ['**/public/sw.js', '**/public/*.worker.js'],
    languageOptions: {
      globals: { ...globals.serviceworker, ...globals.browser },
      sourceType: 'script',
    },
  },
);
