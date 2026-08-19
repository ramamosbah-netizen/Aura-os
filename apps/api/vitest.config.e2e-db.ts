// AURA OS — API HTTP e2e against a REAL database.
//
// The default e2e config pins `DATABASE_URL: ''` so CI runs everything on the in-memory adapters.
// That is the right default for speed, but it cannot see defects that only exist in persistence —
// the deprovisioning hole was exactly one of those: an identity row was deleted while its session
// row survived in Postgres, something an in-memory Map cannot reproduce faithfully.
//
// Run with a connection string supplied from outside, against a migrated database:
//   DATABASE_URL=... pnpm --filter @aura/api exec vitest run --config vitest.config.e2e-db.ts test/user-deprovisioning.e2e-spec.ts
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    globals: true,
    root: '.',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // DATABASE_URL is deliberately NOT set here — it comes from the caller.
    env: { NODE_ENV: 'test' },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
