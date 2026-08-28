import { expect, test } from '@playwright/test';

/** Customers workspace smoke journey — proves the unified IA without assuming seed records. */
test.beforeAll(async ({ request, baseURL }) => {
  const res = await request.get(`${baseURL}/api/crm/accounts/paged?limit=1&offset=0`).catch(() => null);
  const reachable = res !== null && res.status() !== 502 && res.status() !== 404;
  if (!reachable) {
    if (process.env.CI) throw new Error('customers E2E: API is not reachable behind the web shell');
    test.skip(true, 'API not running behind the web shell — start it to run Customers journey');
  }
});

test('Customers workspace switches Accounts, Contacts, and Stakeholder Map', async ({ page }) => {
  await page.goto('/crm/customers?view=accounts', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Accounts/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Contacts/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Stakeholder Map/ })).toBeVisible();

  await page.getByRole('button', { name: /^Contacts/ }).click();
  await expect(page).toHaveURL(/view=contacts/);
  await expect(page.getByPlaceholder(/Search name, title, email, account/)).toBeVisible();

  await page.getByRole('button', { name: /^Stakeholder Map/ }).click();
  await expect(page).toHaveURL(/view=stakeholders/);
  await expect(page.getByRole('region', { name: 'Stakeholder map' })).toBeVisible();
});
