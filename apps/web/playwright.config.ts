// AURA OS — Playwright smoke config (TIER-2 #41).
// Boots `next dev` on a scratch port and runs headless chromium smoke checks.
// The API is optional: the web shell degrades gracefully when it is unreachable.
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.WEB_PORT ?? 3100);
// localhost, NOT 127.0.0.1: Next dev blocks cross-origin dev resources from a bare IP, which
// kills the HMR socket and with it the client bundle. The page still server-renders, so the DOM
// looks right while nothing hydrates — no effects, no fetches, every picker stuck on its loading
// text. Two "gaps" in the admin suite were traced to this before the cause was found.
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // One worker, everywhere. `fullyParallel: false` only orders tests *within* a file — separate
  // files still ran concurrently, and against a single `next dev` that means two workers racing
  // the same on-demand compiler. Locally that produced four failures the identical CI run did not
  // have, because Playwright already defaults to one worker under CI. Same number in both places
  // is worth more than the minute it saves.
  workers: 1,
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
