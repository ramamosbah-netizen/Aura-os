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
