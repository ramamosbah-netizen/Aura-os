import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.A11Y_WEB_PORT ?? 3120);
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Public-page accessibility gate. It deliberately has no authenticated global setup and no API
 * dependency: the login screen must stay operable even when the API is unavailable, and this scan
 * should be runnable in a small CI job without provisioning a database.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /accessibility\.spec\.ts/,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `node ./node_modules/next/dist/bin/next dev -p ${PORT}`,
    url: BASE_URL,
    env: { WEB_AUTH_REQUIRED: 'false', NEXT_DIST_DIR: '.next-e2e-a11y' },
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
