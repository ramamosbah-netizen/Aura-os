// AURA OS — Playwright smoke config (TIER-2 #41).
// Boots `next dev` on a scratch port and runs headless chromium smoke checks.
// The API is optional: the web shell degrades gracefully when it is unreachable.
import { defineConfig, devices, type ReporterDescription } from '@playwright/test';
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

// T23-3D — sequential webServer phases. The two `next dev` servers are never needed at once: only
// web-auth-gate.spec runs against the gate-ON server; every other spec (and global setup) uses the
// gate-OFF server. E2E_SERVER selects a SINGLE phase so CI can run them one after the other, which
// halves the peak `next dev` memory that was tipping the full run into a forced job teardown. Unset
// (local/default) keeps BOTH servers and both projects — the original one-invocation behaviour, so
// nothing local changes. A per-phase output suffix keeps each phase's failure diagnostics separate
// (Playwright wipes outputDir at the start of a run, so a shared dir would let phase 2 erase phase 1).
const SERVER = process.env.E2E_SERVER; // 'gate-off' | 'gate-on' | undefined (both)
const SUFFIX = SERVER ? `-${SERVER}` : '';

// T23-3E — under CI, name each test as it STARTS. A SIGTERM'd step skips every later step,
// `always()` included, so stdout is the only evidence that survives; `list` prints on finish and
// therefore never names the test that was actually running. Local output is unchanged.
const PROGRESS: ReporterDescription[] = process.env.CI
  ? [['./e2e/reporters/progress-reporter.ts']]
  : [];

// T23-3F — memory-isolation knob. `retain-on-failure` RECORDS a trace for EVERY test and throws it
// away when the test passes, so it is a live suspect for the monotonic climb that exhausts the
// runner. E2E_TRACE lets one CI run answer that without editing the default, which stays exactly
// as argued below. Unset everywhere except the isolation run.
const TRACE = (process.env.E2E_TRACE ?? 'retain-on-failure') as 'off' | 'on' | 'retain-on-failure';

// T23-3G — `next dev` was the memory owner behind the cancelled Smoke steps: 14.1 GB of a 16 GB
// runner, in BOTH tiers, with chromium at ~0.4 GB and postgres at ~0.2 GB. `next start` serves a
// prebuilt app instead of compiling on demand — measured at 126-172 MB and FLAT across 72 route
// loads. CI therefore drives the suite against the production server, which is also what a
// release-proof gate should assert. Local keeps `next dev`: HMR, and no build step to run first.
const START = process.env.E2E_WEB_START === '1';
const webCommand = (port: number) =>
  `node ./node_modules/next/dist/bin/next ${START ? 'start' : 'dev'} -p ${port}`;
// WEB_AUTH_REQUIRED is read per REQUEST by proxy.ts and is NOT inlined into the build: a single
// build served :3100 gate-off and :3101 gate-on at once, and the gate-on server still answered 307
// -> /login though the build was made without the variable. So `next start` needs no dist dir at
// all — that only ever existed to stop two `next dev` processes fighting over one build directory.
const serverEnv = (authRequired: 'true' | 'false', distDir: string): Record<string, string> =>
  START ? { WEB_AUTH_REQUIRED: authRequired } : { WEB_AUTH_REQUIRED: authRequired, NEXT_DIST_DIR: distDir };

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
  reporter: [...PROGRESS, ['list'], ['html', { open: 'never', outputFolder: `playwright-report${SUFFIX}` }]],
  // Per-phase output dir so a Phase-2 run never wipes Phase-1's trace/screenshot (see SUFFIX above).
  outputDir: `test-results${SUFFIX}`,
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
    trace: TRACE,
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
    // T23-3D: a phase keeps only its own project; global setup reads projects[0].use.baseURL, so
    // the gate-on phase (auth-gate first) correctly targets :3101, never the stopped :3100.
  ].filter((project) => !SERVER || project.name === (SERVER === 'gate-on' ? 'auth-gate' : 'chromium')),
  // Two declared environments rather than one that inherits whatever the developer has.
  //
  // WEB_AUTH_REQUIRED changes a behaviour the suite asserts: with the gate off an anonymous read
  // reaches the page and must RENDER a refusal; with it on the proxy bounces it to /login and
  // there is no page. Both are correct, and both are now tested — each against a server that
  // declares its own value, so neither depends on apps/web/.env.local. `pnpm auth:configure-local`
  // writes WEB_AUTH_REQUIRED=true there, which silently flipped the spine suite's assumption and
  // cost a wrong "pre-existing failure" call; an explicit env is what stops that recurring.
  //
  // Separate NEXT_DIST_DIR per server applies to `next dev` ONLY: Next refuses a second `next dev`
  // sharing a build directory. Two `next start` processes only READ the build, so they share one.
  webServer: [
    {
      // Invoke Next's bin via node directly — `pnpm exec` forces an implicit install that
      // trips the ignored-build guard in this workspace and exits non-zero.
      command: webCommand(PORT),
      url: BASE_URL,
      env: serverEnv('false', '.next-e2e'),
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: webCommand(AUTH_GATE_PORT),
      url: AUTH_GATE_BASE_URL,
      env: serverEnv('true', '.next-e2e-auth'),
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
    // T23-3D: index 0 = gate-off (:3100), index 1 = gate-on (:3101). A phase starts only its server.
  ].filter((_server, index) => !SERVER || index === (SERVER === 'gate-on' ? 1 : 0)),
});
