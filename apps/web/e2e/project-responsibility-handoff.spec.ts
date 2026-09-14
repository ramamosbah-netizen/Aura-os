import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { MEMBER, memberPassword, signInAs } from './project-member-harness';

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

async function post<T>(request: APIRequestContext, path: string, data: unknown): Promise<T> {
  const response = await request.post(`${API}${path}`, {
    headers: { 'content-type': 'application/json', ...apiAuthHeaders() }, data,
  });
  expect(response.ok(), `${path} — ${await response.text()}`).toBe(true);
  return response.json() as Promise<T>;
}

test.describe('project responsibility handoff', () => {
  test.setTimeout(180_000);

  test('makes assigned delivery work obvious in My Work and keeps its project history', async ({ browser, request, baseURL, page: adminPage }) => {
    test.skip(!apiAuthHeaders().Authorization || !memberPassword(), 'requires the Auth-ON local API and member login');
    const run = Date.now().toString().slice(-6);
    const project = await post<{ id: string }>(request, '/projects/projects', { title: `Responsibility ${run}`, code: `RESP-${run}` });
    await post(request, `/projects/${project.id}/members`, { userId: MEMBER, roleId: 'r-technical-engineer' });
    await adminPage.goto(`${baseURL}/project/${project.id}/team`, { waitUntil: 'domcontentloaded' });
    await adminPage.getByLabel('Responsibility title').fill(`Release approved package ${run}`);
    await adminPage.getByLabel('Responsibility assignee').selectOption(MEMBER);
    await adminPage.getByLabel('Responsibility due date').fill('2026-09-20');
    await adminPage.getByRole('button', { name: 'Assign work' }).click();
    const assignedCard = adminPage.locator('[data-responsibility-id]').filter({ hasText: `Release approved package ${run}` });
    await expect(assignedCard).toContainText('assigned', { timeout: 20_000 });
    const responsibilityId = await assignedCard.getAttribute('data-responsibility-id');
    expect(responsibilityId).toBeTruthy();

    const context = await browser.newContext();
    const page: Page = await context.newPage();
    try {
      expect(await signInAs(page, baseURL!, MEMBER), `${MEMBER} must be able to sign in`).toBe(true);
      await page.goto(`${baseURL}/my-work/tasks`, { waitUntil: 'domcontentloaded' });
      const row = page.locator(`[data-testid="work-item"][data-task-id="${responsibilityId}"]`);
      await expect(row).toContainText(`Release approved package ${run}`, { timeout: 30_000 });
      await expect(row).toContainText(`Responsibility ${run}`);
      await expect(row.getByRole('button', { name: 'Start' })).toBeVisible();

      await row.getByRole('button', { name: 'Start' }).click();
      await expect(row).toContainText('In progress', { timeout: 20_000 });
      await row.getByRole('button', { name: 'Complete' }).click();
      await expect(row).toContainText('Done', { timeout: 20_000 });

      await page.goto(`${baseURL}/project/${project.id}/team`, { waitUntil: 'domcontentloaded' });
      const source = page.locator(`[data-responsibility-id="${responsibilityId}"]`);
      await expect(source).toContainText(`Release approved package ${run}`, { timeout: 30_000 });
      await expect(source).toContainText('completed');
      await expect(page.getByText('Delivery responsibilities')).toBeVisible();
      await expect(page.getByText('Assign concrete work separately from access.')).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
