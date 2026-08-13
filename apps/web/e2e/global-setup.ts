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

export default async function globalSetup(config: FullConfig): Promise<void> {
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
        if (altToken) process.env.E2E_ALT_API_TOKEN = altToken;
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
 */
async function warmRoutes(page: import('@playwright/test').Page, baseURL: string): Promise<void> {
  const routes = [
    '/crm/accounts', '/crm/leads', '/crm/quotations',
    '/contracts/contracts', '/projects/projects', '/finance/invoices',
    '/hse/permits', '/amc/work-orders', '/assets/register', '/fleet/fines',
  ];
  for (const route of routes) {
    await page.goto(`${baseURL}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
  }
}
