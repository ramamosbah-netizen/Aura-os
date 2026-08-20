// AURA OS — Playwright global setup: sign in once, share the session (audit G-03).
//
// When the API runs with a JWT verifier configured, `PermissionsGuard` engages across the WHOLE
// surface — every route, not just the ones a spec cares about. An unauthenticated request then has
// no actor and is refused, so without a shared session the entire browser suite 403s.
//
// This signs in through the REAL login form (not a token mint) exactly once, and saves the httpOnly
// session cookie as Playwright storage state for every spec to reuse. Two reasons to drive the form
// rather than POST the login route: it proves the login journey itself works, and it means the
// cookie is set the same way a user's is.
//
// When auth is OFF (the default local setup) this is a no-op that still writes an empty state file,
// so the suite behaves identically either way.
import { chromium, type FullConfig } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const STORAGE_STATE = 'e2e/.auth/state.json';

const EMPTY_STATE = { cookies: [], origins: [] };

/**
 * Refuse to start against an environment the suite must not touch, or cannot run in.
 *
 * ## The database rule
 *
 * This suite is destructive by nature: it registers users, files reports, sends mail and posts into
 * conversations. It has exactly two legitimate targets —
 *
 *   TIER-2  an in-memory API                 (health reports "applied": null)
 *   TIER-3  a DISPOSABLE PostgreSQL per run  (CI service container, marked at provisioning)
 *
 * — and one it must never have: the shared development database, which stays a live development
 * environment where real work is done by hand. That is not hypothetical. Local runs drove the API
 * on :4000, which apps/api/.env.local points at Supabase, so ten days of suite runs accumulated
 * there — and it was not merely untidy: the Operations centre renders `slice(0, 8)` of active
 * projects sorted by title, so accumulated projects pushed a spec's own to position 9 and failed
 * it. The shared database authored a test result.
 *
 * ## Two independent facts, because one is not enough
 *
 *   1. `E2E_DISPOSABLE_DB=1` — the RUNNER asserts the target is disposable.
 *   2. health.environment === 'e2e-disposable' — the DATABASE says so about itself.
 *
 * (1) alone is only a declaration by whoever typed the command: set it beside the wrong
 * DATABASE_URL and it is still true and still wrong. (2) comes from a row no migration creates, so
 * an unmarked database — development, production, anything real — answers null by default and is
 * refused without anyone having to remember anything. Requiring both means neither an edited
 * .env.local nor a copied command is sufficient on its own.
 */
async function assertRunnableEnvironment(): Promise<void> {
  const apiBase = process.env.AURA_API_URL;
  if (!apiBase) {
    throw new Error(
      'e2e: AURA_API_URL is not set. Specs that call the API directly cannot be authenticated ' +
        'without it and fail as 401s that look like product bugs. Set AURA_API_URL=http://localhost:4000 ' +
        '(see the CI web-smoke job).',
    );
  }

  const health = (await fetch(`${apiBase}/api/v1/health`)
    .then((r) => r.json())
    .catch(() => null)) as
    | { environment?: string | null; schema?: { applied?: number | null; reason?: string } }
    | null;

  if (!health?.schema) {
    throw new Error(`e2e: ${apiBase} did not answer /health with a schema report — refusing to run blind.`);
  }

  const databaseBacked = health.schema.applied !== null && health.schema.applied !== undefined;
  if (!databaseBacked) return; // in-memory: nothing durable to protect

  const runnerAsserts = process.env.E2E_DISPOSABLE_DB === '1';
  const databaseAsserts = health.environment === 'e2e-disposable';

  if (!runnerAsserts || !databaseAsserts) {
    throw new Error(
      `e2e: REFUSING TO RUN against ${apiBase}. This suite writes destructively, the API is backed ` +
        `by a database (${health.schema.reason}), and it is not proven disposable:\n` +
        `  runner says disposable (E2E_DISPOSABLE_DB=1): ${runnerAsserts}\n` +
        `  database says disposable (health.environment): ${health.environment ?? 'unmarked'}\n` +
        'Both are required. Point the suite at an in-memory API (start it with DATABASE_URL= ), or ' +
        'run it against a throwaway database that was MARKED as such when it was created. The shared ' +
        'development database is never a valid target: it is a live environment, and suite data has ' +
        'previously accumulated there and changed a test outcome.',
    );
  }
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  await assertRunnableEnvironment();

  // Stamp this run. Workers inherit the runner's environment, so every spec can scope the records
  // it creates to the run that created them — which keeps two runs against one database from
  // colliding, and makes a row afterwards attributable to a test rather than to a person.
  process.env.E2E_RUN_ID ??= `r${Date.now().toString(36).slice(-6)}`;
  console.log(`e2e: run id ${process.env.E2E_RUN_ID}`);

  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:3100';
  mkdirSync(dirname(STORAGE_STATE), { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Is the API even asking for credentials? `/auth/status` reports whether a verifier is set.
    const status = await page.request.get(`${baseURL}/api/auth/status`).catch(() => null);
    const authEnabled = status?.ok() ? (((await status.json()) as { enabled?: boolean }).enabled ?? false) : false;

    if (!authEnabled) {
      // Auth off: no session to establish, and every spec runs as the dev actor.
      writeFileSync(STORAGE_STATE, JSON.stringify(EMPTY_STATE));
      return;
    }

    const username = process.env.E2E_USERNAME ?? 'u-admin';
    const password = process.env.E2E_PASSWORD ?? process.env.AUTH_DEV_PASSWORD ?? 'e2e-password';

    await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('login-username').fill(username);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();

    // The BFF sets the httpOnly session cookie and the app redirects off /login. If the credentials
    // are wrong the form shows the API's message — surface it rather than timing out opaquely.
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 }).catch(async () => {
      const shown = await page.getByTestId('login-error').innerText().catch(() => null);
      throw new Error(`e2e global setup: sign-in as '${username}' did not complete${shown ? ` — ${shown}` : ''}`);
    });

    await context.storageState({ path: STORAGE_STATE });

    // A couple of specs call the API on its own port instead of through the BFF, so the session
    // cookie never reaches them. Mint a token here and pass it down the environment — workers
    // inherit the runner's env, and `apiAuthHeaders()` reads it at the call sites.
    const apiBase = process.env.AURA_API_URL;
    if (apiBase) {
      const minted = await page.request
        .post(`${apiBase}/api/v1/auth/login`, { data: { username, password } })
        .catch(() => null);
      const token = minted?.ok() ? (((await minted.json()) as { token?: string }).token ?? null) : null;
      if (!token) {
        throw new Error(`e2e global setup: auth is on but the API refused to mint a token for '${username}'`);
      }
      process.env.E2E_API_TOKEN = token;

      // A second actor, so specs can exercise segregation of duties — a permit requested by this
      // one and approved by the session user. Optional: absent, those specs assert the refusal.
      const altUser = process.env.E2E_ALT_USERNAME;
      if (altUser) {
        const altRes = await page.request
          .post(`${apiBase}/api/v1/auth/login`, { data: { username: altUser, password } })
          .catch(() => null);
        const altToken = altRes?.ok() ? (((await altRes.json()) as { token?: string }).token ?? null) : null;
        if (!altToken) {
          throw new Error(
            `e2e global setup: E2E_ALT_USERNAME='${altUser}' was named but could not sign in. ` +
              'Leaving it unset is fine — the segregation-of-duties specs then assert the refusal ' +
              'path — but a named actor that cannot authenticate makes them pass for the wrong reason.',
          );
        }
        process.env.E2E_ALT_API_TOKEN = altToken;
      }
    }
    await warmRoutes(page, baseURL);
  } finally {
    await browser.close();
  }
}

/**
 * Compile the routes the suite drives, once, before any assertion runs.
 *
 * `next dev` compiles a route on its first request. A cold compile regularly ran past the 15s
 * assertion timeout while every warm re-run passed — which shows up as a spec "failing" on a
 * product assertion that was never really exercised. Paying it here keeps the specs measuring the
 * product rather than the bundler, and costs nothing on the second run.
 *
 * Two things this got wrong, both visible in CI failures:
 *
 * 1. It warmed TEN routes while the suite drives about thirty. The three specs that flaked in
 *    TIER-2 across separate runs — compliance, admin-control-center, admin-consolidation — are all
 *    on routes that were never in this list.
 *
 * 2. `domcontentloaded` resolves when the HTML arrives, which is the SERVER render. The client
 *    bundle can still be compiling behind it, so a warmed route could still hand a spec a page
 *    whose buttons have no handlers yet. That is the shape of every one of these failures: the
 *    click reports success and the thing it should have caused never appears — a create drawer in
 *    TIER-3 (twice, on different tests), a dispute action in TIER-2. `load` waits for the scripts
 *    themselves, which is the state the clicks actually need.
 *
 * Front-loading is all this does; the same compilation gets paid either way. The difference is
 * that it is paid where nothing is being measured.
 */
async function warmRoutes(page: import('@playwright/test').Page, baseURL: string): Promise<void> {
  const routes = [
    '/crm/accounts', '/crm/leads', '/crm/quotations', '/crm/my-day',
    '/contracts/contracts', '/projects/projects', '/finance/invoices',
    '/hse/permits', '/amc/work-orders', '/assets/register', '/fleet/fines',
    '/compliance', '/quality/ncrs', '/engineering/drawings', '/doccontrol/register',
    '/site/execution', '/site/daily-reports', '/commissioning', '/operations/overview',
    '/my-work', '/my-work/approvals', '/my-work/communication', '/my-work/tasks',
    '/my-work/my-day', '/my-work/favorites', '/admin', '/admin/users', '/suites',
  ];
  for (const route of routes) {
    // `load`, not `domcontentloaded` — see above. Failures are swallowed on purpose: a route that
    // will not warm is the specs' problem to report against their own assertions, with their own
    // diagnostics, not something to fail the whole run from here.
    await page.goto(`${baseURL}${route}`, { waitUntil: 'load', timeout: 60_000 }).catch(() => {});
  }
}
