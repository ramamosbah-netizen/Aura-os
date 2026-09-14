import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

async function post<T>(request: APIRequestContext, path: string, data: unknown): Promise<T> {
  const response = await request.post(`${API}${path}`, {
    headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
    data,
  });
  expect(response.ok(), `${path} — ${await response.text()}`).toBe(true);
  return response.json() as Promise<T>;
}

test.describe('WBS-linked schedule activity', () => {
  test.setTimeout(180_000);

  test('makes the canonical work package mandatory and retains it on the Gantt', async ({ page, request, baseURL }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const project = await post<{ id: string; title: string }>(request, '/projects/projects', {
      title: `Connected plan ${run}`,
      reference: `PLAN-${run}`,
    });
    const other = await post<{ id: string }>(request, '/projects/projects', {
      title: `Foreign plan ${run}`,
      reference: `FOREIGN-${run}`,
    });
    const workPackage = await post<{ id: string }>(request, '/projects/wbs', {
      projectId: project.id,
      code: '1.1',
      title: 'CCTV installation',
      plannedValue: 10_000,
    });
    await post(request, '/projects/wbs', {
      projectId: other.id,
      code: '9.1',
      title: 'Other-project package',
      plannedValue: 5_000,
    });

    await page.goto(`${baseURL}/projects/schedule?projectId=${project.id}`, { waitUntil: 'domcontentloaded' });
    const form = page.getByTestId('start-schedule-form');
    await expect(form).toBeVisible({ timeout: 30_000 });
    await form.getByPlaceholder('First task').fill(`Install CCTV devices ${run}`);
    const dates = form.locator('input[type="date"]');
    await dates.nth(0).fill('2026-09-20');
    await dates.nth(1).fill('2026-09-22');

    await form.getByRole('button', { name: 'Create' }).click();
    await expect(page.locator('[role="alert"]').filter({ hasText: 'WBS work package' })).toContainText('WBS work package');

    const selector = form.getByLabel('WBS work package');
    await expect(selector.locator('option')).toHaveCount(2);
    expect((await selector.locator('option').allTextContents()).join(' ')).not.toContain('Other-project package');
    await selector.selectOption(workPackage.id);
    await form.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByText(`Install CCTV devices ${run}`)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('small').filter({ hasText: '1.1 · CCTV installation' })).toBeVisible();

    const schedules = await request.get(`${API}/projects/schedules`, { headers: apiAuthHeaders() });
    expect(schedules.ok(), await schedules.text()).toBe(true);
    const saved = ((await schedules.json()) as Array<{ projectId: string; tasks: Array<{ wbsNodeId: string }> }>).find(
      (schedule) => schedule.projectId === project.id,
    );
    expect(saved?.tasks[0].wbsNodeId).toBe(workPackage.id);
  });
});
