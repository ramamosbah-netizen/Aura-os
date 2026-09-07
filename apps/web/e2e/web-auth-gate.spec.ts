import { expect, test } from '@playwright/test';

/**
 * The optimistic auth gate, WEB_AUTH_REQUIRED=true.
 *
 * This file runs against its own server (the `auth-gate` project in playwright.config.ts), which
 * declares the flag rather than inheriting it. The counterpart — gate off, where an anonymous read
 * reaches the page and must render a refusal instead of an empty table — is spine-journey.spec.ts.
 *
 * Asserting only one side is what let a configured local machine look like a product regression:
 * the same anonymous request is a redirect under one flag and a rendered refusal under the other,
 * and both are correct. A test that changed its mind based on the developer's .env.local would
 * hide the day one of them genuinely breaks.
 */
test.describe('optimistic auth gate on', () => {
  test.describe('anonymous', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('is bounced to /login and keeps its destination', async ({ page }) => {
      await page.goto('/crm/accounts', { waitUntil: 'domcontentloaded' });

      await expect(page).toHaveURL(/\/login/);
      // The destination survives the bounce, so signing in can return the user where they aimed.
      expect(new URL(page.url()).searchParams.get('next')).toBe('/crm/accounts');
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
      // A bounce is not a refusal surface: it must not claim the tenant has no data.
      await expect(page.getByTestId('accounts-portfolio')).toHaveCount(0);
      await expect(page.getByTestId('data-error')).toHaveCount(0);
    });

    test('is bounced away from a project workspace too, not just registers', async ({ page }) => {
      // The project route carries a record id, so a bounce that dropped it would lose the
      // destination the user was aiming at. Counterpart in project-operations-workspace.spec.ts
      // asserts the gate-off behaviour (the page renders a refusal instead).
      await page.goto('/project/any-project-id', { waitUntil: 'domcontentloaded' });

      await expect(page).toHaveURL(/\/login/);
      expect(new URL(page.url()).searchParams.get('next')).toBe('/project/any-project-id');
    });

    test('leaves the login route itself reachable', async ({ page }) => {
      await page.goto('/login', { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByTestId('login-username')).toBeVisible();
    });
  });

  /**
   * Signing in THROUGH THE FORM, with the gate on. This crossing was untested.
   *
   * `web-auth-gate` asserted an authenticated session reaches a page, but it reuses the cookie
   * global-setup obtained elsewhere — its own comment says so. `spine-journey` does drive the real
   * form, but on the gate-OFF server. So the one configuration a developer actually runs, the one
   * `pnpm auth:configure-local` writes into apps/web/.env.local, had no coverage at the seam where
   * it is most likely to break: the form succeeds, the cookie is set on the response, and then
   * `land()` calls router.push — a client navigation the optimistic gate evaluates. If the gate
   * cannot see the cookie that navigation just earned, the user is returned to /login having done
   * everything right, and reports that they cannot sign in.
   */
  test.describe('signing in with the gate on', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('the real form lands the user past the gate, not back at it', async ({ page }) => {
      await page.goto('/login?next=%2Fcrm%2Faccounts', { waitUntil: 'domcontentloaded' });

      const username = page.getByTestId('login-username');
      await expect(username, 'the form must be usable before it is driven').toBeEnabled();
      await username.fill(process.env.E2E_USERNAME ?? 'u-admin');
      await page.getByTestId('login-password').fill(process.env.E2E_PASSWORD ?? 'e2e-password');
      await page.getByRole('button', { name: /^Sign in/ }).click();

      // Landed where it was asked to land, and stayed there — a bounce back to /login is the
      // failure this test exists for, and it looks identical to a rejected password from the
      // outside.
      await expect(page).toHaveURL(/\/crm\/accounts/, { timeout: 20_000 });
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.getByTestId('login-error')).toHaveCount(0);

      // And the session survives a reload, so what landed is a real cookie and not just a
      // client-side route change the next request would undo.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page).not.toHaveURL(/\/login/);
    });
  });

  test('lets an authenticated session through to the page', async ({ page }) => {
    // Uses the shared storage state from global-setup. Cookies ignore the port, so the session
    // established against the gate-off server is the same session here.
    await page.goto('/crm/accounts', { waitUntil: 'domcontentloaded' });

    await expect(page).not.toHaveURL(/\/login/);
    // Authorization itself still belongs to the API — the gate only decides who reaches the page.
    await expect(
      page.getByTestId('accounts-portfolio').or(page.getByTestId('data-error')),
    ).toBeVisible();
  });
});
