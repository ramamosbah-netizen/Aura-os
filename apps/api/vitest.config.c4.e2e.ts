// C4-only integration config. Unlike the default API e2e config, this deliberately preserves
// DATABASE_URL supplied by the caller so the certification proof runs against disposable
// PostgreSQL rather than silently wiring the in-memory stores.
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/c4-certification.e2e-spec.ts'],
    globals: true,
    root: '.',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: { NODE_ENV: 'test' },
  },
  plugins: [swc.vite({ module: { type: 'es6' }, jsc: { transform: { useDefineForClassFields: false } } })],
});
