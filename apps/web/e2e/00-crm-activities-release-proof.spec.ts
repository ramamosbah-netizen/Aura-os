import { test, expect } from '@playwright/test';
import { scoped } from './fixtures';

test.describe('CRM Activities release proof', () => {
  test('Opportunity 360 → contextual follow-up → My Work execution → completed timeline', async ({ page }) => {
    const accountResponse = await page.request.post('/api/crm/accounts', { data: { name: scoped('Activities proof account'), status: 'prospect', industry: 'construction' } });
    const accountBody = await accountResponse.text();
    expect(accountResponse.ok(), `account creation failed (${accountResponse.status()}): ${accountBody}`).toBe(true);
    const account = JSON.parse(accountBody) as { id?: string; value?: { id?: string } };
    const accountId = account.id ?? account.value?.id;
    expect(accountId, `account creation returned no id: ${accountBody}`).toBeTruthy();
    if (!accountId) throw new Error(`account creation returned no id: ${accountBody}`);

    const opportunityResponse = await page.request.post('/api/crm/opportunities', {
      data: { title: scoped('Activities proof opportunity'), accountId, value: 125000, stage: 'qualification' },
    });
    const opportunityBody = await opportunityResponse.text();
    expect(opportunityResponse.ok(), `opportunity creation failed (${opportunityResponse.status()}): ${opportunityBody}`).toBe(true);
    const opportunity = JSON.parse(opportunityBody) as { id?: string; value?: { id?: string } };
    const opportunityId = opportunity.id ?? opportunity.value?.id;
    expect(opportunityId, `opportunity creation returned no id: ${opportunityBody}`).toBeTruthy();
    if (!opportunityId) throw new Error(`opportunity creation returned no id: ${opportunityBody}`);

    await page.goto(`/crm/opportunities/${opportunityId}`, { waitUntil: 'load' });
    await expect(page.getByRole('heading', { name: /Activities proof opportunity/ })).toBeVisible();
    await page.getByRole('tab', { name: 'Engagement' }).click();
    await page.getByRole('link', { name: /log the next step/i }).click();
    await expect(page).toHaveURL(new RegExp(`/crm/activities\\?relatedType=opportunity&record=${opportunityId}`));
    await expect(page.getByRole('heading', { name: 'Opportunity Activity Timeline' })).toBeVisible();

    const drawer = page.getByTestId('drawer-activity');
    let attempts = 0;
    await expect(async () => {
      if (!(await drawer.isVisible())) {
        attempts += 1;
        await page.getByTestId('create-activity').click();
      }
      await expect(drawer).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    if (attempts > 1) {
      console.warn(`e2e: the activity drawer needed ${attempts} clicks to open — investigate hydration timing`);
    }
    // `exact` is load-bearing. getByLabel matches by case-insensitive SUBSTRING, and this drawer
    // renders both "Type" and "Related type" whenever it opens against a linked record — which is
    // exactly the path this test drives. Without it the locator resolves to two elements and fails
    // in strict mode, and the failure reads like a duplicate-label defect in the product rather
    // than an over-broad matcher in the test.
    await drawer.getByLabel('Type', { exact: true }).selectOption('follow_up');
    // Hold the scoped subject and match on IT, never on the bare phrase. Every run of this spec
    // leaves an activity behind, so a `/Send revised quotation/` regex starts matching previous
    // runs' rows the second time the suite meets the same database — the accumulation failure
    // global-setup.ts documents, where the database ends up authoring the test result.
    const subject = scoped('Send revised quotation');
    await drawer.getByLabel('Subject').fill(subject);
    await expect(drawer.getByLabel('Related type')).toHaveValue('opportunity');
    await expect(drawer.getByLabel('Related record')).toHaveValue(opportunityId);
    await drawer.getByLabel('Assignee').fill(process.env.E2E_USERNAME ?? 'u-admin');
    await drawer.getByTestId('submit-activity').click();
    await expect(page.getByText(subject)).toBeVisible();
    const activityRow = page.getByText(subject).locator('xpath=ancestor::tr');
    const openInMyWork = activityRow.getByRole('link', { name: /Open in My Work/ });
    await expect(openInMyWork).toBeVisible();
    await openInMyWork.click();

    await expect(page).toHaveURL(/\/my-work\/tasks\?task=/);
    // Arriving with ?task= focuses the item, and for one the actor may edit it also opens the task
    // editor over the list (my-tasks-workspace.tsx:186). Assert that contract, then close it — the
    // lifecycle actions live on the row underneath, and the dialog covers them.
    const taskEditor = page.getByRole('dialog', { name: 'Edit task' });
    await expect(taskEditor).toBeVisible();
    await taskEditor.getByRole('button', { name: 'Cancel' }).click();
    await expect(taskEditor).toBeHidden();

    const workItem = page.getByTestId('work-item').filter({ hasText: subject });
    await expect(workItem).toBeVisible();
    // `complete` is always promoted to the single primary button (my-tasks-workspace.tsx:145), so
    // every other action — Start included — sits behind the More-actions menu. Open it rather than
    // asserting the flat row of buttons this workspace used to render.
    await workItem.getByLabel(/^More actions for/).click();
    await workItem.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(workItem.getByText('In progress')).toBeVisible();
    await workItem.getByRole('button', { name: 'Complete' }).click();
    await expect(workItem.getByText('Done')).toBeVisible();

    await page.goto(`/crm/activities?relatedType=opportunity&record=${opportunityId}`, { waitUntil: 'load' });
    const completedRow = page.getByText(subject).locator('xpath=ancestor::tr');
    // The row renders the completed state in more than one badge; assert the row SAYS it rather
    // than pinning how many elements say it, which is presentation, not the contract under test.
    await expect(completedRow).toContainText('completed');
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
