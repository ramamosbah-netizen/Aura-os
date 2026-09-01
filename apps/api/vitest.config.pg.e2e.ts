// Disposable PostgreSQL regression config. The repository default intentionally forces in-memory
// stores for ordinary e2e; this opt-in config preserves DATABASE_URL for the authorized DB proof.
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/c4-certification.e2e-spec.ts', 'test/quantity-ledger.e2e-spec.ts', 'test/c5-cost-ledger.pg.e2e-spec.ts', 'test/c6-change-control.pg.e2e-spec.ts'],
    globals: true,
    root: '.',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: { NODE_ENV: 'test' },
  },
  plugins: [swc.vite({ module: { type: 'es6' }, jsc: { transform: { useDefineForClassFields: false } } })],
});
