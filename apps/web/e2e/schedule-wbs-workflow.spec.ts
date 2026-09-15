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
    const otherWorkPackage = await post<{ id: string }>(request, '/projects/wbs', {
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

    await page.goto(`${baseURL}/projects/schedule?projectId=${project.id}`, { waitUntil: 'domcontentloaded' });
    const poolForm = page.getByTestId('resource-pool-form');
    await expect(poolForm).toBeVisible({ timeout: 30_000 });
    await poolForm.getByLabel('Pool name').fill(`ELV installation crew ${run}`);
    await poolForm.getByLabel('Measurement').selectOption('crews');
    await poolForm.getByRole('button', { name: 'Add pool' }).click();
    const capacityForm = page.getByTestId('resource-capacity-form');
    await expect(capacityForm.getByLabel('Resource pool').locator('option').filter({ hasText: `ELV installation crew ${run}` })).toBeAttached({ timeout: 30_000 });

    const poolsResponse = await request.get(`${API}/projects/resource-pools`, { headers: apiAuthHeaders() });
    expect(poolsResponse.ok(), await poolsResponse.text()).toBe(true);
    const pool = ((await poolsResponse.json()) as Array<{ id: string; name: string }>).find((item) => item.name === `ELV installation crew ${run}`)!;

    await capacityForm.getByLabel('Resource pool').selectOption(pool.id);
    await capacityForm.getByLabel('Available quantity').fill('2');
    const capacityDates = capacityForm.locator('input[type="date"]');
    await capacityDates.nth(0).fill('2026-09-20');
    await capacityDates.nth(1).fill('2026-10-20');
    await capacityForm.getByLabel('Capacity note').fill('Day shift capacity');
    await capacityForm.getByRole('button', { name: 'Add capacity' }).click();
    const capacityWindows = page.getByLabel('Resource capacity windows');
    await expect(capacityWindows.getByText(`ELV installation crew ${run}`, { exact: true })).toBeVisible({ timeout: 30_000 });

    const wrongUnit = await request.post(`${API}/projects/resource-capacity`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
      data: { resourceType: 'pool', canonicalResourceId: pool.id, unit: 'hours', quantity: 2, from: '2026-09-20', to: '2026-09-21' },
    });
    expect(wrongUnit.status()).toBe(409);

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
    await form.getByRole('button', { name: 'Add resource' }).click();
    await form.getByLabel('Resource 1', { exact: true }).selectOption(`employee:${employee.id}`);
    await form.getByLabel('Resource quantity 1').fill('2');
    await form.getByLabel('Resource 2', { exact: true }).selectOption(`asset:${asset.id}`);
    await form.getByLabel('Resource quantity 2').fill('1');
    await form.getByLabel('Resource 3', { exact: true }).selectOption(`pool:${pool.id}`);
    await form.getByLabel('Resource quantity 3').fill('1');
    await form.getByRole('button', { name: 'Create' }).click();

    await expect(page.locator(`[title="Install CCTV devices ${run}"]`)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('small').filter({ hasText: '1.1 · CCTV installation' })).toBeVisible();
    await expect(page.locator('small').filter({ hasText: `2 persons · Maya Planner ${run}` })).toBeVisible();
    await expect(page.locator('small').filter({ hasText: `1 units · Fluke tester ${run}` })).toBeVisible();
    await expect(page.locator('small').filter({ hasText: `1 crews · ELV installation crew ${run}` })).toBeVisible();

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
      expect.objectContaining({ resource: { resourceType: 'pool', canonicalResourceId: pool.id }, quantity: 1, unit: 'crews' }),
    ]));

    const poolRequirementId = saved?.tasks[0].requirements.find((item) => item.resource.canonicalResourceId === pool.id)?.id;
    expect(employeeRequirementId).toBeTruthy();
    expect(poolRequirementId).toBeTruthy();

    // Unknown body fields are stripped by the API validation boundary. The persisted activity
    // requirement remains the only authority for resource identity, quantity, unit and dates.
    const canonicalCommit = await request.post(`${API}/projects/${project.id}/resource-bookings`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
      data: {
        requirementId: employeeRequirementId,
        resource: { resourceType: 'pool', canonicalResourceId: pool.id },
        quantity: 999,
        unit: 'crews',
        from: '2099-01-01',
        to: '2099-12-31',
        projectId: other.id,
      },
    });
    expect(canonicalCommit.status(), await canonicalCommit.text()).toBe(201);
    const canonicalBooking = (await canonicalCommit.json()) as { booking: { resource: { resourceType: string; canonicalResourceId: string }; quantity: number; unit: string; from: string; to: string } };
    expect(canonicalBooking.booking).toMatchObject({
      resource: { resourceType: 'employee', canonicalResourceId: employee.id }, quantity: 3, unit: 'persons',
      from: '2026-09-20', to: '2026-09-22',
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    const bookingForm = page.getByTestId('resource-booking-form');
    await expect(bookingForm).toBeVisible({ timeout: 30_000 });
    await bookingForm.getByLabel('Uncommitted demand').selectOption(poolRequirementId!);
    await bookingForm.getByRole('button', { name: 'Hold selected capacity' }).click();
    await expect(page.getByText('demand 1 / capacity 2 at commitment')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('AVAILABLE', { exact: true })).toBeVisible();

    const otherSchedule = await post<{ tasks: Array<{ requirements: Array<{ id: string }> }> }>(request, '/projects/schedules', {
      projectId: other.id,
      tasks: [{
        wbsNodeId: otherWorkPackage.id, name: `Install competing CCTV package ${run}`,
        plannedStart: '2026-09-20', plannedEnd: '2026-09-22', durationWorkingDays: 3,
        requirements: [{ resource: { resourceType: 'pool', canonicalResourceId: pool.id }, quantity: 2, unit: 'crews' }],
      }],
    });
    const otherRequirementId = otherSchedule.tasks[0].requirements[0].id;

    const crossProjectSpoof = await request.post(`${API}/projects/${project.id}/resource-bookings`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() }, data: { requirementId: otherRequirementId },
    });
    expect(crossProjectSpoof.status()).toBe(400);

    const silentOverrun = await request.post(`${API}/projects/${other.id}/resource-bookings`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() }, data: { requirementId: otherRequirementId },
    });
    expect(silentOverrun.status()).toBe(400);
    expect(await silentOverrun.text()).toContain('requires a reason');

    const governedOverrun = await request.post(`${API}/projects/${other.id}/resource-bookings`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
      data: { requirementId: otherRequirementId, overCapacityReason: 'approved recovery subcontract crew' },
    });
    expect(governedOverrun.status(), await governedOverrun.text()).toBe(201);
    const competingBooking = (await governedOverrun.json()) as { booking: { id: string }; assessment: { feasibility: string }; resourceConflict: { projectsInvolved: string[] } };
    expect(competingBooking.assessment.feasibility).toBe('CONFLICTED');
    expect(competingBooking.resourceConflict.projectsInvolved).toEqual(expect.arrayContaining([project.id, other.id]));

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Shared-resource conflict involves 2 projects on 3 day(s).')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('CONFLICTED', { exact: true })).toBeVisible();

    const releaseCompeting = await request.post(`${API}/projects/${other.id}/resource-bookings/${competingBooking.booking.id}/release`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() }, data: { reason: 'recovery crew reassigned' },
    });
    expect(releaseCompeting.status(), await releaseCompeting.text()).toBe(201);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('AVAILABLE', { exact: true })).toBeVisible({ timeout: 30_000 });

    const projectBookings = await request.get(`${API}/projects/${project.id}/resource-bookings`, { headers: apiAuthHeaders() });
    expect(projectBookings.ok(), await projectBookings.text()).toBe(true);
    const heldPoolBooking = ((await projectBookings.json()) as Array<{ booking: { id: string; requirementId: string; status: string } }>).find((view) => view.booking.requirementId === poolRequirementId)?.booking;
    expect(heldPoolBooking?.status).toBe('held');
    const poolRelease = page.getByLabel(`Release reason ${heldPoolBooking!.id}`);
    await poolRelease.fill('activity resequenced after coordination');
    await poolRelease.locator('..').getByRole('button', { name: 'Release', exact: true }).click();
    await expect(page.getByText('RELEASED', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Release reason: activity resequenced after coordination')).toBeVisible();

    // Auth-ON proof: scope and function are both required. A project planning grant works only on
    // its project; a Site Engineer membership does not inherit booking functionality; the governed
    // organisation grant remains able to inspect all projects.
    const siteOnly = await post<{ id: string }>(request, '/projects/projects', { title: `Site-only plan ${run}`, reference: `SITE-${run}` });
    await post(request, `/projects/${project.id}/members`, { userId: 'u-e2e-viewer', roleId: 'r-planning-engineer' });
    await post(request, `/projects/${siteOnly.id}/members`, { userId: 'u-e2e-viewer', roleId: 'r-site-engineer' });
    const password = process.env.E2E_PASSWORD ?? process.env.AUTH_DEV_PASSWORD;
    expect(password, 'project-scope proof requires the seeded member password').toBeTruthy();
    const memberLogin = await request.post(`${API}/auth/login`, { data: { username: 'u-e2e-viewer', password } });
    expect(memberLogin.ok(), await memberLogin.text()).toBe(true);
    const memberToken = ((await memberLogin.json()) as { token: string }).token;
    const memberHeaders = { 'content-type': 'application/json', Authorization: `Bearer ${memberToken}` };
    const memberReadStatus = async (id: string) => (await request.get(`${API}/projects/${id}/resource-bookings`, { headers: memberHeaders })).status();
    const memberCreateStatus = async (id: string, requirementId: string) => (await request.post(`${API}/projects/${id}/resource-bookings`, { headers: memberHeaders, data: { requirementId } })).status();
    expect(await memberReadStatus(project.id), 'correct project + planning read permission').toBe(200);
    expect(await memberCreateStatus(project.id, poolRequirementId!), 'correct project + planning create permission').toBe(201);
    expect(await memberReadStatus(other.id), 'wrong project').toBe(403);
    expect(await memberCreateStatus(other.id, otherRequirementId), 'wrong project cannot be targeted by changing the URL').toBe(403);
    expect(await memberCreateStatus(siteOnly.id, '00000000-0000-4000-8000-000000000001'), 'correct project + wrong functional permission').toBe(403);
    const orgStatus = await request.get(`${API}/projects/${other.id}/resource-bookings`, { headers: apiAuthHeaders() });
    expect(orgStatus.status(), 'organisation-governed projects permission remains allowed').toBe(200);
  });
});
