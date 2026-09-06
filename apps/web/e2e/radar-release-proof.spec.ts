import { test, expect } from '@playwright/test';
import { scoped } from './fixtures';

test.describe('Radar isolated release proof', () => {
  // Scoped and created ONCE. A per-test fixture on a shared title stacks up a duplicate per test
  // and per run, and every assertion on the bare phrase then dies in strict mode — four of them
  // by the second run here.
  const SIGNAL = scoped('Radar Proof Promotion Signal');

  /**
   * Create the signal this suite drives, rather than inheriting it.
   *
   * `apps/api/scripts/crm-radar-release-proof.mjs` also creates a "Radar Proof Promotion Signal",
   * and CI runs it immediately before this file — but that script DELETES everything it made in a
   * `finally` block (its own signals and the leads promoted from them). So the fixture this spec
   * was written against is destroyed by the very step that produces it, and the signal is already
   * gone by the time the browser opens /crm/radar. Owning the row here removes the ordering
   * dependency entirely.
   */
  test.beforeAll(async ({ request }) => {
    const created = await request.post('/api/crm/signals', {
      data: { title: SIGNAL, source: 'MANUAL', type: 'NEW_PROJECT', confidence: 90, status: 'NEW' },
    });
    expect(created.ok(), `radar signal fixture must exist (${created.status()}): ${await created.text()}`).toBe(true);
  });

  test('search, views, saved view, review and promote a Signal', async ({ page }) => {
    await page.goto('/crm/radar');
    await expect(page.getByRole('heading', { name: 'Radar' })).toBeVisible();
    await expect(page.getByText(SIGNAL)).toBeVisible();

    const search = page.getByLabel('Search radar');
    await search.fill(SIGNAL);
    await expect(page).toHaveURL(/search=Radar\+Proof\+Promotion\+Signal|search=Radar%20Proof%20Promotion%20Signal/);

    await page.getByLabel('Radar display mode').selectOption('list');
    await expect(page).toHaveURL(/view=list/);
    await page.reload();
    await expect(page.getByLabel('Radar display mode')).toHaveValue('list');

    await page.goBack();
    await expect(page).not.toHaveURL(/view=list/);
    await page.goForward();
    await expect(page).toHaveURL(/view=list/);

    page.once('dialog', (dialog) => dialog.accept(`Radar proof ${Date.now()}`));
    await page.getByRole('button', { name: /Save view/ }).click();
    await expect(page.getByText(SIGNAL)).toBeVisible();

    await page.getByRole('button', { name: 'Lead' }).click();
    await expect(page.getByText('Review Lead before creation')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm & create Lead' }).click();
    await expect(page.getByText('Lead created:')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Open Lead →' })).toBeVisible();
  });

  test('permission-denied user sees access state', async ({ browser, baseURL }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/login?next=%2Fcrm%2Fradar');
    // The restricted actor CI provisions, not a hardcoded `u-viewer` that exists in no database
    // this suite creates — a login that never succeeds leaves waitForURL hanging on /login until
    // the test times out, which reads as a broken page rather than a missing account.
    await page.getByTestId('login-username').fill(process.env.E2E_VIEWER_USERNAME ?? 'u-e2e-viewer');
    await page.getByTestId('login-password').fill(process.env.E2E_PASSWORD ?? 'e2e-password');
    await page.getByTestId('login-submit').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await page.goto(`${baseURL}/crm/radar`);
    // Assert the refusal STATE, not its wording. `describeDataError` renders "You don't have
    // access to this" for a forbidden read — which the old `/You do not have access/` regex could
    // never match, because "don't" is not "do not". `data-error-kind` is the structural contract
    // DataStateNotice exposes for exactly this, and it survives copy edits.
    const denied = page.getByTestId('data-error');
    await expect(denied).toBeVisible();
    await expect(denied).toHaveAttribute('data-error-kind', /forbidden|unauthorized/);
    await context.close();
  });

  test('empty search is distinct from a populated page', async ({ page }) => {
    await page.goto('/crm/radar?search=radar-proof-no-such-signal');
    await expect(page.getByText(/No signals match these filters/i)).toBeVisible();
    await expect(page.getByText(/Something went wrong|Service temporarily unavailable/i)).not.toBeVisible();
  });
});
