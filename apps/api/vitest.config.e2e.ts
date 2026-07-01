// AURA OS — API HTTP e2e vitest config (TIER-2 #39/#40).
// SWC transforms decorators + emits `design:*` metadata so Nest DI resolves the
// full AppModule under vitest — enabling real Supertest HTTP round-trips.
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    globals: true,
    root: '.',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // In-memory: no DATABASE_URL → AppModule wires InMemory stores (no live DB needed in CI).
    env: { DATABASE_URL: '', NODE_ENV: 'test' },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
