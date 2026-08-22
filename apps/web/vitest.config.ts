import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Resolve the `@/` path alias (tsconfig `paths`) in unit tests, so tests can import app modules the
// same way app code does. Defaults are otherwise unchanged — environment stays per-file.
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
});
