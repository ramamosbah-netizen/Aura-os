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
 * ...and the answer coming back the other way: the person accepts or declines from My Work, and
 * the planner sees that answer against the commitment WITHOUT the commitment having changed.
 *
 * A crew commitment travels the same road and says something different at the end of it: a booking
 * of one crew reaches every named member of that pool as news about THEIR CREW, carries no
 * accept/decline (one member cannot answer for a crew), and stops reaching anyone taken off it.
 *
 * An equipment commitment reaches the ONE person the owning register names for that machine — an
 * asset's custodian — who answers for the machine rather than for their own time, and stops
 * receiving it the moment they hand it on.
 *
 * And the other half of the temporal invariant: an approved leave, decided in HR long after the
 * commitment was made, turns that standing commitment into a visible conflict naming its cause —
 * without altering one field of what was committed. The conflict is then taken on by a NAMED
 * person and closed with what they decided, while the clash itself stays exactly as true as the
 * facts make it.
 *
 * The negatives matter as much as the positive: an employee with no link reaches no list, one
 * account cannot be held by two employment records, a decline with no reason is refused, nobody
 * can answer for somebody else, releasing the booking removes the item (proving it is read
 * through rather than copied), and unlinking says so instead of silently emptying the list.
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
  tasks: Array<{
    id: string; name: string; wbsNodeId: string | null;
    plannedStart: string; plannedEnd: string; durationWorkingDays: number | null;
    requirements: Array<{ id: string; resource: { resourceType: string; canonicalResourceId: string }; quantity: number; unit: string }>;
  }>;
}

test.describe('Employee account link carries an allocation into My Work', () => {
  // One journey, five chains: the identity link, the person's answer, the crew's roster, the
  // machine's custodian, and a later availability change. Long on purpose — the value is that
  // these hold TOGETHER against one plan — but the budget stays tight (it runs in about half a
  // minute) so a hang surfaces as a failure quickly rather than after seven quiet minutes.
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
    //
    // The role is created FOR this proof and carries HR read and nothing else. A standard role
    // would have worked and would also have carried `projects.*.read` at tenant scope, which
    // silently widens a shared test identity for every other spec in the suite — one of them
    // asserts that same identity is refused on a project it does not belong to. A grant is
    // durable state, so a proof that needs one builds the narrowest thing that proves the point
    // and takes it away afterwards.
    const password = process.env.E2E_PASSWORD ?? process.env.AUTH_DEV_PASSWORD;
    expect(password, 'the permission proof needs the seeded member password').toBeTruthy();
    const hrReaderRole = `r-e2e-hr-reader-${run}`;
    await post(request, '/admin/access/roles', {
      id: hrReaderRole, name: `HR reader ${run}`, permissions: ['hr.employee.read'],
    });
    await post(request, '/admin/access/grants', { userId: 'u-e2e-viewer', roleId: hrReaderRole });
    try {
      const readerLogin = await request.post(`${API}/auth/login`, { data: { username: 'u-e2e-viewer', password } });
      expect(readerLogin.ok(), await readerLogin.text()).toBe(true);
      const readerHeaders = { 'content-type': 'application/json', Authorization: `Bearer ${((await readerLogin.json()) as { token: string }).token}` };
      expect((await request.get(`${API}/hr/employees`, { headers: readerHeaders })).status(), 'HR read is granted').toBe(200);
      const readerLink = await request.post(`${API}/hr/employees/${colleague.id}/account`, {
        headers: readerHeaders, data: { userId: 'u-e2e-checker' },
      });
      expect(readerLink.status(), 'HR read does not carry the account-link authority').toBe(403);
    } finally {
      // Whatever the assertions did, this identity leaves the proof exactly as it entered it.
      await request.delete(`${API}/admin/access/grants?userId=u-e2e-viewer&roleId=${hrReaderRole}`, { headers: apiAuthHeaders() });
    }

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

    // Declared BEFORE the commitment, so the booking records a known capacity it fitted inside.
    // Without that, it would be committed against an unknown capacity and could never later be
    // said to have "fitted when it was made" — the distinction the invariant turns on.
    await post(request, '/projects/resource-capacity', {
      resourceType: 'employee', canonicalResourceId: mine.id, unit: 'persons', quantity: 3,
      from: day(3), to: day(5), note: 'declared availability',
    });
    const held = await post<{ booking: { id: string; committedAt: string } }>(request, `/projects/${project.id}/resource-bookings`, {
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

    // ── The answer travels back to the planner ────────────────────────────────
    // Nobody can answer for somebody else: this account is Maya, and Sami's allocation is not hers
    // to accept — even though she holds every work-item permission there is.
    const colleagueBookings = await request.get(`${API}/projects/${project.id}/resource-bookings`, { headers: apiAuthHeaders() });
    expect(colleagueBookings.ok(), await colleagueBookings.text()).toBe(true);
    const colleagueBooking = ((await colleagueBookings.json()) as Array<{ booking: { id: string; resource: { canonicalResourceId: string } } }>)
      .find((view) => view.booking.resource.canonicalResourceId === colleague.id)!.booking;
    const answerForAnother = await request.post(`${API}/work-items/resource-allocation/${colleagueBooking.id}/accept`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() }, data: {},
    });
    expect(answerForAnother.status(), 'only the person an allocation names can answer it').toBe(403);

    // A decline with no reason is refused: the planner it lands on has to act on it.
    const silentRefusal = await request.post(`${API}/work-items/resource-allocation/${held.booking.id}/decline`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() }, data: {},
    });
    expect(silentRefusal.status()).toBe(400);
    expect(await silentRefusal.text()).toContain('requires a reason');

    // Decline from My Work, in the browser, with the reason the dialog insists on.
    await allocation.getByRole('button', { name: 'Decline' }).click();
    const declineDialog = page.getByTestId('decline-dialog');
    await expect(declineDialog).toBeVisible({ timeout: 30_000 });
    await declineDialog.getByRole('textbox').fill('already committed to the Marina site that week');
    await declineDialog.getByRole('button', { name: 'Send decline' }).click();
    await expect(page.getByText('Your planner has been told. The booking stays until they change it.')).toBeVisible({ timeout: 30_000 });
    await expect(allocation).toContainText('You declined this: already committed to the Marina site that week');

    // THE POINT: the commitment is unchanged. Same quantity, same dates, still held.
    const afterDecline = await request.get(`${API}/projects/${project.id}/resource-bookings`, { headers: apiAuthHeaders() });
    const declined = ((await afterDecline.json()) as Array<{ booking: { id: string; status: string; quantity: number; from: string; to: string; response: string; responseReason: string } }>)
      .find((view) => view.booking.id === held.booking.id)!.booking;
    expect(declined).toMatchObject({
      status: 'held', quantity: 2, from: day(3), to: day(5),
      response: 'declined', responseReason: 'already committed to the Marina site that week',
    });

    // And the planner sees it on their own desk, beside the capacity verdict rather than inside it.
    await page.goto(`${baseURL}/projects/schedule?projectId=${project.id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId(`declined-${held.booking.id}`)).toContainText('declined this allocation: already committed to the Marina site that week', { timeout: 30_000 });
    await expect(page.getByTestId('declined-count')).toHaveText('1');

    // Changing your mind is allowed, because circumstances change.
    await page.goto(`${baseURL}/my-work/tasks`, { waitUntil: 'domcontentloaded' });
    await search.fill(run);
    await expect(allocation).toBeVisible({ timeout: 30_000 });
    await allocation.getByRole('button', { name: 'Accept' }).click();
    await expect(allocation).toContainText('You accepted this allocation.', { timeout: 30_000 });
    await page.goto(`${baseURL}/projects/schedule?projectId=${project.id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId(`accepted-${held.booking.id}`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('declined-count')).toHaveText('0');

    await page.goto(`${baseURL}/my-work/tasks`, { waitUntil: 'domcontentloaded' });
    await search.fill(run);

    // ── A crew commitment reaches the crew's named members ────────────────────
    const poolName = `ELV installation crew ${run}`;
    const pool = await post<{ id: string }>(request, '/projects/resource-pools', { name: poolName, unit: 'crews' });
    await post(request, '/projects/resource-capacity', {
      resourceType: 'pool', canonicalResourceId: pool.id, unit: 'crews', quantity: 2, from: day(3), to: day(5),
    });

    // The roster is built in the browser, from the canonical HR catalogue.
    await page.goto(`${baseURL}/projects/schedule?projectId=${project.id}`, { waitUntil: 'domcontentloaded' });
    const rosterForm = page.getByTestId('pool-member-form');
    await expect(rosterForm).toBeVisible({ timeout: 30_000 });
    await rosterForm.getByLabel('Resource pool').selectOption(pool.id);
    await rosterForm.getByLabel('Employee').selectOption(mine.id);
    await rosterForm.getByRole('button', { name: 'Add member' }).click();
    await expect(page.getByLabel('Pool members').getByText(`Maya Linked ${run}`)).toBeVisible({ timeout: 30_000 });

    // A person is on a crew once. And an id HR does not know is not a person.
    const twice = await request.post(`${API}/projects/resource-pools/${pool.id}/members`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() }, data: { employeeId: mine.id },
    });
    expect(twice.status()).toBe(409);
    const invented = await request.post(`${API}/projects/resource-pools/${pool.id}/members`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
      data: { employeeId: '00000000-0000-4000-8000-000000000999' },
    });
    expect(invented.status()).toBe(400);
    expect(await invented.text()).toContain('canonical tenant resource');

    const crewActivity = `Pull crew containment ${run}`;
    const crewTask = {
      wbsNodeId: otherPackage.id, name: crewActivity,
      plannedStart: day(3), plannedEnd: day(5), durationWorkingDays: 3,
      requirements: [{ resource: { resourceType: 'pool', canonicalResourceId: pool.id }, quantity: 1, unit: 'crews' }],
    };

    // Saving a schedule REPLACES its activity list, and both existing activities back held
    // bookings. Dropping them is refused rather than silently breaking a commitment's lineage.
    const wouldOrphan = await request.post(`${API}/projects/schedules`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
      data: { projectId: project.id, tasks: [crewTask] },
    });
    expect(wouldOrphan.status(), 'an activity backing a held booking cannot be dropped').toBe(409);
    expect(await wouldOrphan.text()).toContain('already has a held');

    // Added to the plan, not posted in place of it.
    await post<ScheduleResponse>(request, '/projects/schedules', {
      projectId: project.id,
      tasks: [
        ...saved.tasks.map((task) => ({
          id: task.id, wbsNodeId: task.wbsNodeId, name: task.name,
          plannedStart: task.plannedStart, plannedEnd: task.plannedEnd,
          durationWorkingDays: task.durationWorkingDays,
          requirements: task.requirements.map((requirement) => ({
            id: requirement.id, resource: requirement.resource, quantity: requirement.quantity, unit: requirement.unit,
          })),
        })),
        crewTask,
      ],
    });
    const withCrew = await request.get(`${API}/projects/schedules`, { headers: apiAuthHeaders() });
    const crewRequirementId = ((await withCrew.json()) as ScheduleResponse[])
      .find((schedule) => schedule.projectId === project.id)!
      .tasks.flatMap((task) => task.requirements)
      .find((requirement) => requirement.resource.canonicalResourceId === pool.id)!.id;
    const crewHeld = await post<{ booking: { id: string } }>(request, `/projects/${project.id}/resource-bookings`, {
      requirementId: crewRequirementId,
    });

    await page.goto(`${baseURL}/my-work/tasks`, { waitUntil: 'domcontentloaded' });
    await search.fill(run);
    const crewItem = page.getByTestId('work-item').filter({ hasText: `${poolName} committed to ${crewActivity}` });
    await expect(crewItem).toBeVisible({ timeout: 30_000 });
    await expect(crewItem).toContainText('crew commitment');
    await expect(crewItem).toContainText('Your crew · 1 crews held');
    await expect(crewItem).toContainText('who goes is allocated by your supervisor');
    // A crew booking is not a claim on one member's time, so there is no answer to give here.
    await expect(crewItem.getByRole('button', { name: 'Accept' })).toHaveCount(0);
    await expect(crewItem.getByRole('button', { name: 'Decline' })).toHaveCount(0);
    const memberAnswer = await request.post(`${API}/work-items/resource-allocation/${crewHeld.booking.id}/accept`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() }, data: {},
    });
    expect(memberAnswer.status(), 'a member cannot answer for the crew').toBe(403);
    expect(await memberAnswer.text()).toContain('speak for the crew');

    // Off the crew, the commitment stops being their news — while the crew still holds it.
    await page.goto(`${baseURL}/projects/schedule?projectId=${project.id}`, { waitUntil: 'domcontentloaded' });
    const removeFromCrew = page.getByRole('button', { name: `Remove Maya Linked ${run} from ${poolName}` });
    await removeFromCrew.click();
    // Scoped to THIS run's roster row: the tenant-wide counter beside it carries every other crew.
    await expect(removeFromCrew).toHaveCount(0, { timeout: 30_000 });
    await page.goto(`${baseURL}/my-work/tasks`, { waitUntil: 'domcontentloaded' });
    await search.fill(run);
    await expect(page.getByTestId('work-item').filter({ hasText: crewActivity })).toHaveCount(0, { timeout: 30_000 });
    const crewBookings = await request.get(`${API}/projects/${project.id}/resource-bookings`, { headers: apiAuthHeaders() });
    expect(((await crewBookings.json()) as Array<{ booking: { id: string; status: string } }>)
      .find((view) => view.booking.id === crewHeld.booking.id)!.booking.status, 'the crew still holds it').toBe('held');

    // ── An equipment commitment reaches whoever holds the machine ─────────────
    const tester = await post<{ id: string; name: string }>(request, '/assets', {
      name: `Fluke tester ${run}`, serialNumber: `FL-${run}`, category: 'Test equipment',
      purchaseDate: '2026-01-01', purchaseCost: 2500,
    });

    // Custody is handed over in the asset register — the authority on who holds the thing.
    await page.goto(`${baseURL}/assets/register`, { waitUntil: 'domcontentloaded' });
    const custodyCell = page.getByTestId(`asset-custody-${tester.id}`);
    await expect(custodyCell).toBeVisible({ timeout: 30_000 });
    await custodyCell.getByRole('combobox').selectOption(mine.id);
    await expect(page.getByTestId(`asset-custodian-${tester.id}`)).toHaveText(`Maya Linked ${run}`, { timeout: 30_000 });

    // Custody names somebody HR knows, or it names nobody.
    const strangerCustody = await request.post(`${API}/assets/${tester.id}/custodian`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
      data: { employeeId: '00000000-0000-4000-8000-000000000999' },
    });
    expect(strangerCustody.status()).toBe(400);
    expect(await strangerCustody.text()).toContain('active employee');

    const equipmentActivity = `Commission the head end ${run}`;
    const equipmentTask = {
      wbsNodeId: linkedPackage.id, name: equipmentActivity,
      plannedStart: day(3), plannedEnd: day(5), durationWorkingDays: 3,
      requirements: [{ resource: { resourceType: 'asset', canonicalResourceId: tester.id }, quantity: 1, unit: 'units' }],
    };
    const planWithEquipment = await request.get(`${API}/projects/schedules`, { headers: apiAuthHeaders() });
    const currentPlan = ((await planWithEquipment.json()) as ScheduleResponse[]).find((schedule) => schedule.projectId === project.id)!;
    await post<ScheduleResponse>(request, '/projects/schedules', {
      projectId: project.id,
      tasks: [
        ...currentPlan.tasks.map((task) => ({
          id: task.id, wbsNodeId: task.wbsNodeId, name: task.name,
          plannedStart: task.plannedStart, plannedEnd: task.plannedEnd,
          durationWorkingDays: task.durationWorkingDays,
          requirements: task.requirements.map((requirement) => ({
            id: requirement.id, resource: requirement.resource, quantity: requirement.quantity, unit: requirement.unit,
          })),
        })),
        equipmentTask,
      ],
    });
    const afterEquipment = await request.get(`${API}/projects/schedules`, { headers: apiAuthHeaders() });
    const equipmentRequirementId = ((await afterEquipment.json()) as ScheduleResponse[])
      .find((schedule) => schedule.projectId === project.id)!
      .tasks.flatMap((task) => task.requirements)
      .find((requirement) => requirement.resource.canonicalResourceId === tester.id)!.id;
    const equipmentHeld = await post<{ booking: { id: string } }>(request, `/projects/${project.id}/resource-bookings`, {
      requirementId: equipmentRequirementId,
    });

    await page.goto(`${baseURL}/my-work/tasks`, { waitUntil: 'domcontentloaded' });
    await search.fill(run);
    const equipmentItem = page.getByTestId('work-item').filter({ hasText: `committed to ${equipmentActivity}` });
    await expect(equipmentItem).toBeVisible({ timeout: 30_000 });
    await expect(equipmentItem).toContainText('equipment commitment');
    await expect(equipmentItem).toContainText('In your custody');
    await expect(equipmentItem).toContainText(`Fluke tester ${run} (FL-${run} · Test equipment)`);

    // The custodian answers for the MACHINE — and a refusal still needs a reason.
    await equipmentItem.getByRole('button', { name: 'Decline' }).click();
    const equipmentDecline = page.getByTestId('decline-dialog');
    await expect(equipmentDecline).toBeVisible({ timeout: 30_000 });
    await equipmentDecline.getByRole('textbox').fill('in for calibration that week');
    await equipmentDecline.getByRole('button', { name: 'Send decline' }).click();
    await expect(equipmentItem).toContainText('You declined this: in for calibration that week', { timeout: 30_000 });

    const equipmentAfter = await request.get(`${API}/projects/${project.id}/resource-bookings`, { headers: apiAuthHeaders() });
    const equipmentBooking = ((await equipmentAfter.json()) as Array<{ booking: { id: string; status: string; quantity: number; response: string; responseReason: string } }>)
      .find((view) => view.booking.id === equipmentHeld.booking.id)!.booking;
    // Same as every other answer: the commitment itself is untouched.
    expect(equipmentBooking).toMatchObject({ status: 'held', quantity: 1, response: 'declined', responseReason: 'in for calibration that week' });

    // Hand the tester on, and it stops being this person's to answer for.
    await page.goto(`${baseURL}/assets/register`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId(`asset-custody-${tester.id}`).getByRole('button', { name: /^Return/ }).click();
    await expect(page.getByTestId(`asset-custodian-${tester.id}`)).toHaveCount(0, { timeout: 30_000 });
    const noLongerTheirs = await request.post(`${API}/work-items/resource-allocation/${equipmentHeld.booking.id}/accept`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() }, data: {},
    });
    expect(noLongerTheirs.status(), 'only the person who holds it may answer for it').toBe(403);
    await page.goto(`${baseURL}/my-work/tasks`, { waitUntil: 'domcontentloaded' });
    await search.fill(run);
    await expect(page.getByTestId('work-item').filter({ hasText: equipmentActivity })).toHaveCount(0, { timeout: 30_000 });

    // ── A later availability change makes a standing commitment conflicted ────
    const beforeLeave = await request.get(`${API}/projects/${project.id}/resource-bookings`, { headers: apiAuthHeaders() });
    const beforeView = ((await beforeLeave.json()) as Array<{ booking: { id: string }; assessment: { feasibility: string } }>)
      .find((view) => view.booking.id === held.booking.id)!;
    expect(beforeView.assessment.feasibility, 'declared capacity covers the commitment').toBe('AVAILABLE');

    // A leave REQUEST is not a fact — planning must not pre-empt HR's decision.
    const leave = await post<{ id: string }>(request, '/hr/leaves', {
      employeeId: mine.id, leaveType: 'annual', startDate: day(4), endDate: day(4), reason: 'family',
    });
    await page.goto(`${baseURL}/projects/schedule?projectId=${project.id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/approved annual leave/)).toHaveCount(0);

    // HR approves it. Nothing in Projects is touched, and nothing rejects HR's decision.
    const approved = await request.put(`${API}/hr/leaves/${leave.id}/resolve`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() }, data: { status: 'approved' },
    });
    expect(approved.ok(), await approved.text()).toBe(true);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/approved annual leave/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('CONFLICTED', { exact: true }).first()).toBeVisible();

    const afterLeave = await request.get(`${API}/projects/${project.id}/resource-bookings`, { headers: apiAuthHeaders() });
    const afterView = ((await afterLeave.json()) as Array<{
      booking: { id: string; status: string; quantity: number; from: string; to: string; capacityAtCommitment: number | null; committedAt: string };
      assessment: { feasibility: string; becameInfeasible: boolean; reason?: string; conflictDays: string[] };
    }>).find((view) => view.booking.id === held.booking.id)!;

    expect(afterView.assessment.feasibility).toBe('CONFLICTED');
    // The sentence a planner needs: nobody did anything wrong, and here is what changed.
    expect(afterView.assessment.becameInfeasible).toBe(true);
    expect(afterView.assessment.reason).toContain('fitted when it was committed');
    expect(afterView.assessment.reason).toContain('approved annual leave');
    expect(afterView.assessment.conflictDays).toEqual([day(4)]);
    // And the commitment itself is exactly what it was: the verdict changed, the history did not.
    expect(afterView.booking).toMatchObject({
      status: 'held', quantity: 2, from: day(3), to: day(5),
      capacityAtCommitment: 3, committedAt: held.booking.committedAt,
    });

    // ── The conflict gets a named owner and a recorded decision ───────────────
    // Before anyone takes it on, the desk says so rather than leaving it ownerless in silence.
    await expect(page.getByTestId(`conflict-unowned-${held.booking.id}`)).toBeVisible({ timeout: 30_000 });

    const ownerSelect = page.getByLabel(`Conflict owner for ${held.booking.id}`);
    await ownerSelect.selectOption(account);
    await page.getByRole('button', { name: 'Assign owner' }).click();
    await expect(page.getByTestId(`conflict-owner-${held.booking.id}`)).toContainText(`${account} is dealing with this`, { timeout: 30_000 });

    // One resource, one open owner: "who is dealing with this?" never has two answers.
    const secondOwner = await request.post(`${API}/projects/resource-conflicts`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
      data: {
        resourceType: 'employee', canonicalResourceId: mine.id,
        from: day(3), to: day(5), ownerId: 'u-e2e-checker',
      },
    });
    expect(secondOwner.status()).toBe(409);
    expect(await secondOwner.text()).toContain('already has an open conflict owner');

    // An owner appointed over an invented resource would be accountable for nothing.
    const overNothing = await request.post(`${API}/projects/resource-conflicts`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
      data: {
        resourceType: 'employee', canonicalResourceId: '00000000-0000-4000-8000-000000000999',
        from: day(3), to: day(5), ownerId: account,
      },
    });
    expect(overNothing.status()).toBe(400);

    // Closing costs a sentence, for the same reason releasing capacity does.
    const conflicts = await request.get(`${API}/projects/resource-conflicts?resourceType=employee&canonicalResourceId=${mine.id}`, { headers: apiAuthHeaders() });
    const ownership = ((await conflicts.json()) as Array<{ id: string; status: string }>).find((entry) => entry.status === 'owned')!;
    const silentClose = await request.post(`${API}/projects/resource-conflicts/${ownership.id}/decide`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() }, data: { status: 'resolved' },
    });
    expect(silentClose.status()).toBe(400);
    expect(await silentClose.text()).toContain('decision is required');

    await page.getByLabel(`Decision for ${held.booking.id}`).fill('second electrician hired for the Thursday');
    await page.getByRole('button', { name: 'Accept exposure' }).click();
    await expect(page.getByTestId(`conflict-owner-${held.booking.id}`))
      .toContainText(`${account} accepted this: second electrician hired for the Thursday`, { timeout: 30_000 });

    // THE POINT: a recorded decision never silences the derived verdict. The leave is still
    // approved, so the clash is still there, and the desk says both.
    await expect(page.getByText('Decided, and the clash is still in the plan.')).toBeVisible();
    await expect(page.getByText('CONFLICTED', { exact: true }).first()).toBeVisible();
    const stillConflicted = await request.get(`${API}/projects/${project.id}/resource-bookings`, { headers: apiAuthHeaders() });
    const stillView = ((await stillConflicted.json()) as Array<{
      booking: { id: string }; assessment: { feasibility: string };
      conflictOwner: { ownerId: string; status: string; decision: string } | null;
    }>).find((view) => view.booking.id === held.booking.id)!;
    expect(stillView.assessment.feasibility).toBe('CONFLICTED');
    expect(stillView.conflictOwner).toMatchObject({
      ownerId: account, status: 'accepted', decision: 'second electrician hired for the Thursday',
    });

    // Decided once. A new decision needs the resource taken on again.
    const decidedTwice = await request.post(`${API}/projects/resource-conflicts/${ownership.id}/decide`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
      data: { status: 'resolved', decision: 'changed my mind' },
    });
    expect(decidedTwice.status()).toBe(409);

    // ── Read through, not copied: releasing the booking removes the item ──────
    const released = await request.post(`${API}/projects/${project.id}/resource-bookings/${held.booking.id}/release`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
      data: { reason: 'activity resequenced after coordination' },
    });
    expect(released.status(), await released.text()).toBe(201);
    // Navigate rather than reload: this journey visits several screens, and a block that depends
    // on whichever page a previous block happened to leave open fails somewhere far from its cause.
    await page.goto(`${baseURL}/my-work/tasks`, { waitUntil: 'domcontentloaded' });
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
