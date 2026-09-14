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

test.describe('WBS-linked and resourced schedule activity', () => {
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
    const employee = await post<{ id: string }>(request, '/hr/employees', {
      firstName: 'Maya', lastName: `Planner ${run}`, role: 'Site Engineer', department: 'Projects', joinedDate: '2026-01-01',
    });
    const asset = await post<{ id: string }>(request, '/assets', {
      name: `Fluke tester ${run}`, serialNumber: `FL-${run}`, category: 'Test equipment', purchaseDate: '2026-01-01', purchaseCost: 2500,
    });

    const spoofed = await request.post(`${API}/projects/schedules`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
      data: {
        projectId: project.id,
        tasks: [{
          wbsNodeId: workPackage.id, name: 'Spoofed resource', plannedStart: '2026-09-20', plannedEnd: '2026-09-22', durationWorkingDays: 3,
          requirements: [{ resource: { resourceType: 'employee', canonicalResourceId: '00000000-0000-4000-8000-000000000999' }, quantity: 1, unit: 'persons' }],
        }],
      },
    });
    expect(spoofed.status()).toBe(400);

    await page.goto(`${baseURL}/projects/schedule?projectId=${project.id}`, { waitUntil: 'domcontentloaded' });
    const form = page.getByTestId('start-schedule-form');
    await expect(form).toBeVisible({ timeout: 30_000 });
    await form.getByPlaceholder('First task').fill(`Install CCTV devices ${run}`);
    const dates = form.locator('input[type="date"]');
    await dates.nth(0).fill('2026-09-20');
    await dates.nth(1).fill('2026-09-22');
    await form.getByLabel('Working-day duration').fill('3');

    await form.getByRole('button', { name: 'Create' }).click();
    await expect(page.locator('[role="alert"]').filter({ hasText: 'WBS package' })).toContainText('WBS package');

    const selector = form.getByLabel('WBS work package');
    await expect(selector.locator('option')).toHaveCount(2);
    expect((await selector.locator('option').allTextContents()).join(' ')).not.toContain('Other-project package');
    await selector.selectOption(workPackage.id);
    await form.getByRole('button', { name: 'Add resource' }).click();
    await form.getByRole('button', { name: 'Add resource' }).click();
    await form.getByLabel('Resource 1', { exact: true }).selectOption(`employee:${employee.id}`);
    await form.getByLabel('Resource quantity 1').fill('2');
    await form.getByLabel('Resource 2', { exact: true }).selectOption(`asset:${asset.id}`);
    await form.getByLabel('Resource quantity 2').fill('1');
    await form.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByText(`Install CCTV devices ${run}`)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('small').filter({ hasText: '1.1 · CCTV installation' })).toBeVisible();
    await expect(page.locator('small').filter({ hasText: `2 persons · Maya Planner ${run}` })).toBeVisible();
    await expect(page.locator('small').filter({ hasText: `1 units · Fluke tester ${run}` })).toBeVisible();

    const initialSchedules = await request.get(`${API}/projects/schedules`, { headers: apiAuthHeaders() });
    expect(initialSchedules.ok(), await initialSchedules.text()).toBe(true);
    const initial = ((await initialSchedules.json()) as Array<{ projectId: string; tasks: Array<{ id: string; wbsNodeId: string; durationWorkingDays: number; requirements: Array<{ id: string; resource: { resourceType: string; canonicalResourceId: string }; quantity: number; unit: string }> }> }>).find(
      (schedule) => schedule.projectId === project.id,
    );
    const taskId = initial?.tasks[0].id;
    const employeeRequirementId = initial?.tasks[0].requirements.find((item) => item.resource.canonicalResourceId === employee.id)?.id;

    await page.getByRole('button', { name: `Edit plan for Install CCTV devices ${run}` }).click();
    const editor = page.locator('[data-testid^="edit-task-"]');
    const employeeRow = editor.locator(`[data-resource-key="employee:${employee.id}"]`);
    await employeeRow.locator('input[type="number"]').fill('3');
    await editor.getByRole('button', { name: 'Save activity' }).click();
    await expect(page.locator('small').filter({ hasText: `3 persons · Maya Planner ${run}` })).toBeVisible({ timeout: 30_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('small').filter({ hasText: `3 persons · Maya Planner ${run}` })).toBeVisible({ timeout: 30_000 });

    const schedules = await request.get(`${API}/projects/schedules`, { headers: apiAuthHeaders() });
    expect(schedules.ok(), await schedules.text()).toBe(true);
    const saved = ((await schedules.json()) as Array<{ projectId: string; tasks: Array<{ id: string; wbsNodeId: string; durationWorkingDays: number; requirements: Array<{ id: string; resource: { resourceType: string; canonicalResourceId: string }; quantity: number; unit: string }> }> }>).find((schedule) => schedule.projectId === project.id);
    expect(saved?.tasks[0].id).toBe(taskId);
    expect(saved?.tasks[0].wbsNodeId).toBe(workPackage.id);
    expect(saved?.tasks[0].durationWorkingDays).toBe(3);
    expect(saved?.tasks[0].requirements).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: employeeRequirementId, resource: { resourceType: 'employee', canonicalResourceId: employee.id }, quantity: 3, unit: 'persons' }),
      expect.objectContaining({ resource: { resourceType: 'asset', canonicalResourceId: asset.id }, quantity: 1, unit: 'units' }),
    ]));
  });
});
