import { test, expect } from '@playwright/test';
import { scoped } from './fixtures';

test.describe('CRM Activities release proof', () => {
  test('Opportunity 360 → contextual follow-up → My Work execution → completed timeline', async ({ page }) => {
    const accountResponse = await page.request.post('/api/crm/accounts', { data: { name: scoped('Activities proof account'), status: 'prospect', industry: 'construction' } });
    expect(accountResponse.ok(), await accountResponse.text()).toBe(true);
    const account = await accountResponse.json() as { id: string };

    const opportunityResponse = await page.request.post('/api/crm/opportunities', {
      data: { title: scoped('Activities proof opportunity'), accountId: account.id, value: 125000, stage: 'qualification' },
    });
    expect(opportunityResponse.ok(), await opportunityResponse.text()).toBe(true);
    const opportunity = await opportunityResponse.json() as { id: string };

    await page.goto(`/crm/opportunities/${opportunity.id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Activities proof opportunity/ })).toBeVisible();
    await page.getByRole('tab', { name: 'Engagement' }).click();
    await page.getByRole('link', { name: /log the next step/i }).click();
    await expect(page).toHaveURL(new RegExp(`/crm/activities\\?relatedType=opportunity&record=${opportunity.id}`));
    await expect(page.getByRole('heading', { name: 'Opportunity Activity Timeline' })).toBeVisible();

    await page.getByTestId('create-activity').click();
    const drawer = page.getByTestId('drawer-activity');
    await expect(drawer).toBeVisible();
    await drawer.getByLabel('Type').selectOption('follow_up');
    await drawer.getByLabel('Subject').fill(scoped('Send revised quotation'));
    await expect(drawer.getByLabel('Related type')).toHaveValue('opportunity');
    await expect(drawer.getByLabel('Related record')).toHaveValue(opportunity.id);
    await drawer.getByTestId('submit-activity').click();
    await expect(page.getByText(/Send revised quotation/)).toBeVisible();
    const activityRow = page.getByText(/Send revised quotation/).locator('xpath=ancestor::tr');
    const openInMyWork = activityRow.getByRole('link', { name: /Open in My Work/ });
    await expect(openInMyWork).toBeVisible();
    await openInMyWork.click();

    await expect(page).toHaveURL(/\/my-work\/tasks\?task=/);
    const workItem = page.getByTestId('work-item').filter({ hasText: /Send revised quotation/ });
    await expect(workItem).toBeVisible();
    await workItem.getByRole('button', { name: 'Start' }).click();
    await expect(workItem.getByText('In progress')).toBeVisible();
    await workItem.getByRole('button', { name: 'Complete' }).click();
    await expect(workItem.getByText('Done')).toBeVisible();

    await page.goto(`/crm/activities?relatedType=opportunity&record=${opportunity.id}`, { waitUntil: 'domcontentloaded' });
    const completedRow = page.getByText(/Send revised quotation/).locator('xpath=ancestor::tr');
    await expect(completedRow.getByText('completed')).toBeVisible();
  });

  test('a viewer cannot execute another user\'s personal activity', async ({ page }) => {
    const apiBase = process.env.AURA_API_URL;
    const adminToken = process.env.E2E_API_TOKEN;
    test.skip(!process.env.E2E_VIEWER_USERNAME || !apiBase || !adminToken, 'CI must provide a restricted viewer and API token for this permission proof');
    const response = await page.request.post(`${apiBase}/api/v1/crm/activities`, {
      headers: { authorization: `Bearer ${adminToken}` },
      data: { type: 'task', subject: scoped('Permission proof task') },
    });
    expect(response.ok(), await response.text()).toBe(true);
    const activity = await response.json() as { id: string };
    const login = await page.request.post(`${apiBase}/api/v1/auth/login`, { data: { username: process.env.E2E_VIEWER_USERNAME, password: process.env.E2E_PASSWORD ?? 'e2e-password' } });
    expect(login.ok(), await login.text()).toBe(true);
    const viewerToken = (await login.json() as { token: string }).token;
    const denied = await page.request.post(`${apiBase}/api/v1/crm/activities/${activity.id}/start`, { headers: { authorization: `Bearer ${viewerToken}` } });
    expect(denied.status()).toBe(403);
  });
});
