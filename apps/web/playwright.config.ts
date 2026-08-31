// AURA OS — Playwright smoke config (TIER-2 #41).
// Boots `next dev` on a scratch port and runs headless chromium smoke checks.
// The API is optional: the web shell degrades gracefully when it is unreachable.
import { defineConfig, devices } from '@playwright/test';
import { STORAGE_STATE } from './e2e/global-setup';

const PORT = Number(process.env.WEB_PORT ?? 3100);
// localhost, NOT 127.0.0.1: Next dev blocks cross-origin dev resources from a bare IP, which
// kills the HMR socket and with it the client bundle. The page still server-renders, so the DOM
// looks right while nothing hydrates — no effects, no fetches, every picker stuck on its loading
// text. Two "gaps" in the admin suite were traced to this before the cause was found.
const BASE_URL = `http://localhost:${PORT}`;
// A second server with the optimistic auth gate ON, so both sides of WEB_AUTH_REQUIRED are
// asserted against a declared environment instead of the developer's .env.local.
const AUTH_GATE_PORT = PORT + 1;
const AUTH_GATE_BASE_URL = `http://localhost:${AUTH_GATE_PORT}`;

export default defineConfig({
  testDir: './e2e',
  // TIER-3 drives the same specs against a real database, where every assertion sits behind SQL
  // round-trips instead of a Map lookup. The budget is therefore configurable rather than pinned
  // to what the in-memory tier happens to need — otherwise a slower backend fails on the clock and
  // reads as a product difference.
  timeout: Number(process.env.E2E_TEST_TIMEOUT ?? 60_000),
  expect: { timeout: Number(process.env.E2E_EXPECT_TIMEOUT ?? 15_000) },
  fullyParallel: false,
  // One worker, everywhere. `fullyParallel: false` only orders tests *within* a file — separate
  // files still ran concurrently, and against a single `next dev` that means two workers racing
  // the same on-demand compiler. Locally that produced four failures the identical CI run did not
  // have, because Playwright already defaults to one worker under CI. Same number in both places
  // is worth more than the minute it saves.
  workers: 1,
  // Zero retries, on purpose: a flaky test must stay a VISIBLE failure, never be masked by a
  // passing retry. Diagnostics therefore capture the first (only) attempt — see `trace` below.
  retries: 0,
  // `list` keeps the live console output CI streams line-by-line; `html` writes a self-contained
  // report into the artifact so a CI-only failure can be inspected offline. `open: 'never'` stops
  // Playwright trying to launch a browser on the runner.
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  // Signs in once through the real login form and saves the session (G-03). When the API runs with
  // a verifier configured, PermissionsGuard engages on every route, so without a shared session the
  // whole suite is refused. No-ops when auth is off, so the local setup is unchanged.
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: BASE_URL,
    // retain-on-failure, NOT on-first-retry: with retries:0 there is no retry, so on-first-retry
    // recorded nothing — every CI-only browser failure died with just its one-line assertion. This
    // keeps the trace AND a screenshot from the actual failing attempt. Video stays off (Playwright
    // default): trace + screenshot have been sufficient; revisit only if evidence shows otherwise.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    storageState: STORAGE_STATE,
  },
  projects: [
    // Everything except the gate spec runs against the gate-OFF server.
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /web-auth-gate\.spec\.ts/ },
    // The gate spec is the only thing that runs against the gate-ON server.
    {
      name: 'auth-gate',
      testMatch: /web-auth-gate\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: AUTH_GATE_BASE_URL },
    },
  ],
  // Two declared environments rather than one that inherits whatever the developer has.
  //
  // WEB_AUTH_REQUIRED changes a behaviour the suite asserts: with the gate off an anonymous read
  // reaches the page and must RENDER a refusal; with it on the proxy bounces it to /login and
  // there is no page. Both are correct, and both are now tested — each against a server that
  // declares its own value, so neither depends on apps/web/.env.local. `pnpm auth:configure-local`
  // writes WEB_AUTH_REQUIRED=true there, which silently flipped the spine suite's assumption and
  // cost a wrong "pre-existing failure" call; an explicit env is what stops that recurring.
  //
  // Separate NEXT_DIST_DIR per server: Next refuses a second `next dev` sharing a build directory.
  webServer: [
    {
      // Invoke Next's bin via node directly — `pnpm exec` forces an implicit install that
      // trips the ignored-build guard in this workspace and exits non-zero.
      command: `node ./node_modules/next/dist/bin/next dev -p ${PORT}`,
      url: BASE_URL,
      env: { WEB_AUTH_REQUIRED: 'false', NEXT_DIST_DIR: '.next-e2e' },
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `node ./node_modules/next/dist/bin/next dev -p ${AUTH_GATE_PORT}`,
      url: AUTH_GATE_BASE_URL,
      env: { WEB_AUTH_REQUIRED: 'true', NEXT_DIST_DIR: '.next-e2e-auth' },
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
