import { test, expect } from '@playwright/test';

test.describe('Radar isolated release proof', () => {
  test('search, views, saved view, review and promote a Signal', async ({ page }) => {
    await page.goto('/crm/radar');
    await expect(page.getByRole('heading', { name: 'Radar' })).toBeVisible();
    await expect(page.getByText('Radar Proof Promotion Signal')).toBeVisible();

    const search = page.getByLabel('Search radar');
    await search.fill('Radar Proof Promotion Signal');
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
    await expect(page.getByText('Radar Proof Promotion Signal')).toBeVisible();

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
    await page.getByTestId('login-username').fill('u-viewer');
    await page.getByTestId('login-password').fill(process.env.E2E_PASSWORD ?? 'e2e-password');
    await page.getByTestId('login-submit').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await page.goto(`${baseURL}/crm/radar`);
    await expect(page.getByText(/Access denied|You do not have access/i)).toBeVisible();
    await context.close();
  });

  test('empty search is distinct from a populated page', async ({ page }) => {
    await page.goto('/crm/radar?search=radar-proof-no-such-signal');
    await expect(page.getByText(/No signals match these filters/i)).toBeVisible();
    await expect(page.getByText(/Something went wrong|Service temporarily unavailable/i)).not.toBeVisible();
  });
});
