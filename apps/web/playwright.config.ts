// AURA OS — Playwright smoke config (TIER-2 #41).
// Boots `next dev` on a scratch port and runs headless chromium smoke checks.
// The API is optional: the web shell degrades gracefully when it is unreachable.
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.WEB_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Invoke Next's bin via node directly — `pnpm exec` forces an implicit install that
    // trips the ignored-build guard in this workspace and exits non-zero.
    command: `node ./node_modules/next/dist/bin/next dev -p ${PORT}`,
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
