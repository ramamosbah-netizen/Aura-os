import { test, expect } from '@playwright/test';
import { scoped } from './fixtures';

test.describe('CRM Activities release proof', () => {
  test('Opportunity 360 → contextual follow-up → My Work execution → completed timeline', async ({ page }) => {
    const accountResponse = await page.request.post('/api/crm/accounts', { data: { name: scoped('Activities proof account'), status: 'prospect', industry: 'construction' } });
    const accountBody = await accountResponse.text();
    console.log(`activities-proof account: ${accountResponse.status()} ${accountBody}`);
    expect(accountResponse.ok(), `account creation failed (${accountResponse.status()}): ${accountBody}`).toBe(true);
    const account = JSON.parse(accountBody) as { id?: string; value?: { id?: string } };
    const accountId = account.id ?? account.value?.id;
    expect(accountId, `account creation returned no id: ${accountBody}`).toBeTruthy();
    if (!accountId) throw new Error(`account creation returned no id: ${accountBody}`);

    const opportunityResponse = await page.request.post('/api/crm/opportunities', {
      data: { title: scoped('Activities proof opportunity'), accountId, value: 125000, stage: 'qualification' },
    });
    const opportunityBody = await opportunityResponse.text();
    console.log(`activities-proof opportunity: ${opportunityResponse.status()} ${opportunityBody}`);
    expect(opportunityResponse.ok(), `opportunity creation failed (${opportunityResponse.status()}): ${opportunityBody}`).toBe(true);
    const opportunity = JSON.parse(opportunityBody) as { id?: string; value?: { id?: string } };
    const opportunityId = opportunity.id ?? opportunity.value?.id;
    expect(opportunityId, `opportunity creation returned no id: ${opportunityBody}`).toBeTruthy();
    if (!opportunityId) throw new Error(`opportunity creation returned no id: ${opportunityBody}`);

    await page.goto(`/crm/opportunities/${opportunityId}`, { waitUntil: 'load' });
    console.log(`activities-proof opportunity page: ${page.url()}`);
    await expect(page.getByRole('heading', { name: /Activities proof opportunity/ })).toBeVisible();
    await page.getByRole('tab', { name: 'Engagement' }).click();
    console.log(`activities-proof engagement tab: ${page.url()}`);
    await page.getByRole('link', { name: /log the next step/i }).click();
    console.log(`activities-proof activity link: ${page.url()}`);
    await expect(page).toHaveURL(new RegExp(`/crm/activities\\?relatedType=opportunity&record=${opportunityId}`));
    await expect(page.getByRole('heading', { name: 'Opportunity Activity Timeline' })).toBeVisible();

    await page.getByTestId('create-activity').click();
    const drawer = page.getByTestId('drawer-activity');
    await expect(drawer).toBeVisible();
    await drawer.getByLabel('Type').selectOption('follow_up');
    await drawer.getByLabel('Subject').fill(scoped('Send revised quotation'));
    await expect(drawer.getByLabel('Related type')).toHaveValue('opportunity');
    await expect(drawer.getByLabel('Related record')).toHaveValue(opportunityId);
    await drawer.getByLabel('Assignee').fill(process.env.E2E_USERNAME ?? 'u-admin');
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

    await page.goto(`/crm/activities?relatedType=opportunity&record=${opportunityId}`, { waitUntil: 'load' });
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
