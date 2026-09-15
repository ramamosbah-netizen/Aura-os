import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * PLN-07 — a resource allocation reaching the person it names.
 *
 * The chain under proof, end to end and in the browser:
 *
 *   HR links an employment record to a login  ->  the planner commits that employee to an
 *   activity  ->  the allocation appears in THAT person's My Work with the project, the activity
 *   and the dates  ->  and in nobody else's.
 *
 * The negatives matter as much as the positive: an employee with no link reaches no list, one
 * account cannot be held by two employment records, releasing the booking removes the item
 * (proving it is read through rather than copied), and unlinking says so instead of silently
 * emptying the list.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

const day = (offset: number): string =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function post<T>(request: APIRequestContext, path: string, data: unknown): Promise<T> {
  const response = await request.post(`${API}${path}`, {
    headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
    data,
  });
  expect(response.ok(), `${path} — ${await response.text()}`).toBe(true);
  return response.json() as Promise<T>;
}

interface ScheduleResponse {
  projectId: string;
  tasks: Array<{ id: string; name: string; requirements: Array<{ id: string; resource: { canonicalResourceId: string } }> }>;
}

test.describe('Employee account link carries an allocation into My Work', () => {
  test.setTimeout(180_000);

  test('delivers a named allocation to the linked account and to no other', async ({ page, request, baseURL }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const account = process.env.E2E_USERNAME ?? 'u-admin';

    const project = await post<{ id: string; title: string }>(request, '/projects/projects', {
      title: `Allocation proof ${run}`, reference: `ALLOC-${run}`,
    });
    const linkedPackage = await post<{ id: string }>(request, '/projects/wbs', {
      projectId: project.id, code: '1.1', title: 'CCTV termination', plannedValue: 8_000,
    });
    const otherPackage = await post<{ id: string }>(request, '/projects/wbs', {
      projectId: project.id, code: '1.2', title: 'Access control commissioning', plannedValue: 6_000,
    });
    const mine = await post<{ id: string }>(request, '/hr/employees', {
      firstName: 'Maya', lastName: `Linked ${run}`, role: 'Site Engineer', department: 'Projects', joinedDate: '2026-01-01',
    });
    const colleague = await post<{ id: string }>(request, '/hr/employees', {
      firstName: 'Sami', lastName: `Unlinked ${run}`, role: 'Technician', department: 'Projects', joinedDate: '2026-01-01',
    });

    // The signed-in identity is seeded and shared across runs, so a run that failed before its
    // own unlink can leave the account claimed. Releasing a stale claim is setup, not leniency:
    // the refusal it would otherwise mask is asserted explicitly a few lines below.
    const employees = await request.get(`${API}/hr/employees`, { headers: apiAuthHeaders() });
    expect(employees.ok(), await employees.text()).toBe(true);
    for (const stale of ((await employees.json()) as Array<{ id: string; userId: string | null }>).filter((item) => item.userId === account)) {
      await request.delete(`${API}/hr/employees/${stale.id}/account`, { headers: apiAuthHeaders() });
    }

    // ── The link, made in the browser by an administrator ─────────────────────
    await page.goto(`${baseURL}/hr/control`, { waitUntil: 'domcontentloaded' });
    const accountCell = page.getByTestId(`employee-account-${mine.id}`);
    await expect(accountCell).toBeVisible({ timeout: 30_000 });
    await expect(accountCell.getByRole('combobox')).toBeVisible();
    await accountCell.getByRole('combobox').selectOption(account);
    // The CHIP, not the cell's text: an unlinked cell renders a picker whose options carry every
    // account name, so asserting on text alone would pass before anything was written.
    await expect(page.getByTestId(`employee-account-linked-${mine.id}`)).toHaveText(account, { timeout: 30_000 });

    // One account, one employment record. A second claim on the same login is refused, so
    // "whose allocation is this?" never has two answers.
    const doubleClaim = await request.post(`${API}/hr/employees/${colleague.id}/account`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() }, data: { userId: account },
    });
    expect(doubleClaim.status()).toBe(409);
    expect(await doubleClaim.text()).toContain('already linked');

    // An account nobody registered is refused rather than stored as a link that matches no one.
    const ghost = await request.post(`${API}/hr/employees/${colleague.id}/account`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() }, data: { userId: `u-ghost-${run}` },
    });
    expect(ghost.status()).toBe(400);
    expect(await ghost.text()).toContain('not registered');

    // Reading HR is not administering identity. An account that may read the whole employee
    // register still cannot decide whose login an employment record belongs to — the link changes
    // whose name a commitment carries, so it is its own authority.
    const password = process.env.E2E_PASSWORD ?? process.env.AUTH_DEV_PASSWORD;
    expect(password, 'the permission proof needs the seeded member password').toBeTruthy();
    await post(request, '/admin/access/grants', { userId: 'u-e2e-viewer', roleId: 'r-hse' });
    const readerLogin = await request.post(`${API}/auth/login`, { data: { username: 'u-e2e-viewer', password } });
    expect(readerLogin.ok(), await readerLogin.text()).toBe(true);
    const readerHeaders = { 'content-type': 'application/json', Authorization: `Bearer ${((await readerLogin.json()) as { token: string }).token}` };
    expect((await request.get(`${API}/hr/employees`, { headers: readerHeaders })).status(), 'HR read is granted').toBe(200);
    const readerLink = await request.post(`${API}/hr/employees/${colleague.id}/account`, {
      headers: readerHeaders, data: { userId: 'u-e2e-checker' },
    });
    expect(readerLink.status(), 'HR read does not carry the account-link authority').toBe(403);

    // ── The plan, and the commitments made from it ────────────────────────────
    const mineActivity = `Terminate CCTV cameras ${run}`;
    const colleagueActivity = `Commission access control ${run}`;
    await post<ScheduleResponse>(request, '/projects/schedules', {
      projectId: project.id,
      tasks: [
        {
          wbsNodeId: linkedPackage.id, name: mineActivity,
          plannedStart: day(3), plannedEnd: day(5), durationWorkingDays: 3,
          requirements: [{ resource: { resourceType: 'employee', canonicalResourceId: mine.id }, quantity: 2, unit: 'persons' }],
        },
        {
          wbsNodeId: otherPackage.id, name: colleagueActivity,
          plannedStart: day(3), plannedEnd: day(5), durationWorkingDays: 3,
          requirements: [{ resource: { resourceType: 'employee', canonicalResourceId: colleague.id }, quantity: 1, unit: 'persons' }],
        },
      ],
    });

    const schedules = await request.get(`${API}/projects/schedules`, { headers: apiAuthHeaders() });
    expect(schedules.ok(), await schedules.text()).toBe(true);
    const saved = ((await schedules.json()) as ScheduleResponse[]).find((schedule) => schedule.projectId === project.id)!;
    const requirementFor = (employeeId: string) =>
      saved.tasks.flatMap((task) => task.requirements).find((requirement) => requirement.resource.canonicalResourceId === employeeId)!.id;

    const held = await post<{ booking: { id: string } }>(request, `/projects/${project.id}/resource-bookings`, {
      requirementId: requirementFor(mine.id),
    });
    await post(request, `/projects/${project.id}/resource-bookings`, { requirementId: requirementFor(colleague.id) });

    // ── The person's own work list ────────────────────────────────────────────
    await page.goto(`${baseURL}/my-work/tasks`, { waitUntil: 'domcontentloaded' });
    const search = page.getByPlaceholder('Search tasks, projects or records');
    await expect(search).toBeVisible({ timeout: 30_000 });
    await search.fill(run);

    const allocation = page.getByTestId('work-item').filter({ hasText: `Allocated to ${mineActivity}` });
    await expect(allocation).toBeVisible({ timeout: 30_000 });
    await expect(allocation).toContainText('Planning');
    await expect(allocation).toContainText(`Allocation proof ${run}`);
    await expect(allocation).toContainText(`2 persons held · ${day(3)} → ${day(5)}`);
    // A booking is the project's commitment to capacity, not a task this person closes.
    await expect(allocation.getByRole('button', { name: 'Start' })).toHaveCount(0);
    await expect(allocation.getByRole('button', { name: 'Complete' })).toHaveCount(0);

    // The colleague's allocation is committed and is not this account's work.
    await expect(page.getByTestId('work-item').filter({ hasText: colleagueActivity })).toHaveCount(0);

    // ── Read through, not copied: releasing the booking removes the item ──────
    const released = await request.post(`${API}/projects/${project.id}/resource-bookings/${held.booking.id}/release`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
      data: { reason: 'activity resequenced after coordination' },
    });
    expect(released.status(), await released.text()).toBe(201);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await search.fill(run);
    await expect(page.getByTestId('work-item').filter({ hasText: `Allocated to ${mineActivity}` })).toHaveCount(0, { timeout: 30_000 });

    // ── Unlinking says so, rather than leaving an unexplained empty list ──────
    await page.goto(`${baseURL}/hr/control`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: `Unlink account from Maya Linked ${run}` }).click();
    await expect(page.getByTestId(`employee-account-${mine.id}`).getByRole('combobox')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId(`employee-account-linked-${mine.id}`)).toHaveCount(0);

    await page.goto(`${baseURL}/my-work/tasks`, { waitUntil: 'domcontentloaded' });
    const coverage = page.getByText('Task source coverage');
    await expect(coverage).toBeVisible({ timeout: 30_000 });
    await coverage.click();
    await expect(page.getByText('not linked to an employee record')).toBeVisible({ timeout: 30_000 });
  });
});
