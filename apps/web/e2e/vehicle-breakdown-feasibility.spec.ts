// AURA OS — F-08: a breakdown, recorded once in Fleet, changes the feasibility of the commitments
// already made against the vehicle — without anyone re-entering it in the plan.
//
// HR leave already did this (employee-account-allocation.spec.ts). A breakdown could not: a
// vehicle's status was chosen once, at registration, and nothing could ever take one out of
// service afterwards — so a van with a dead gearbox stayed `active`, and every booking against it
// stayed AVAILABLE. The availability bridge was ready to read "out of service" as UNKNOWN; nothing
// could put a vehicle there.
//
// Proved here, Auth ON against PostgreSQL:
//   authority   the Planning Engineer is refused the act (it is not theirs to say a van is off the
//               road); the Fleet administrator (u-e2e-hrmgr, r-hr-manager) performs it on the Fleet
//               screen, with a reason the screen will not let them leave out
//   effect      the planner's desk turns the standing commitment from AVAILABLE to UNKNOWN, naming
//               the breakdown in Fleet's words and the day it was declared — and not one field of
//               the commitment changes
//   reversal    returning the van to service on the same screen makes the commitment AVAILABLE again
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { memberPassword, signInAs } from './project-member-harness';
import { provisionedActorsUnavailable } from './provisioned-actors';

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

/** The company's business day (Dubai), which is what the API means by "today". */
const businessDay = (offset = 0): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(Date.now() + offset * 86_400_000));

async function post<T>(request: APIRequestContext, path: string, data: unknown): Promise<T> {
  const response = await request.post(`${API}${path}`, { headers: { 'content-type': 'application/json', ...apiAuthHeaders() }, data });
  expect(response.ok(), `${path} — ${await response.text()}`).toBe(true);
  return response.json() as Promise<T>;
}

async function seat(browser: Browser, baseURL: string, username: string): Promise<Page> {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  expect(await signInAs(page, baseURL, username), `${username} could not sign in`).toBe(true);
  return page;
}

interface BookingView {
  booking: { id: string; status: string; quantity: number; unit: string; from: string; to: string; capacityAtCommitment: number | null; committedAt: string };
  assessment: { feasibility: string; reason?: string };
}

test('a van that breaks down turns its standing commitment UNKNOWN in Fleet\'s words, and back when it returns', async ({ browser, baseURL, request }) => {
  test.setTimeout(240_000);
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  test.skip(!memberPassword(), 'needs a password to sign the Fleet administrator and the planner in');
  const unavailable = await provisionedActorsUnavailable(request);
  test.skip(unavailable !== null, unavailable ?? '');

  const run = Date.now().toString().slice(-6);
  const plate = `BRK-${run}`;

  // ── The plan: one activity needing the van, committed while the van was fine ──────────────────
  const project = await post<{ id: string }>(request, '/projects/projects', { title: `Breakdown proof ${run}`, reference: `BRK-${run}` });
  await post(request, `/projects/${project.id}/members`, { userId: 'u-e2e-planner', roleId: 'r-planning-engineer' });
  const pkg = await post<{ id: string }>(request, '/projects/wbs', { projectId: project.id, code: '1.1', title: 'Cable pulling', plannedValue: 5_000 });
  const van = await post<{ id: string; plateNumber: string }>(request, '/fleet/vehicles', { make: 'Toyota', model: 'Hiace', year: 2022, plateNumber: plate });
  const activity = `Deliver cable drums ${run}`;
  await post(request, '/projects/schedules', {
    projectId: project.id,
    tasks: [{
      wbsNodeId: pkg.id, name: activity, plannedStart: businessDay(3), plannedEnd: businessDay(5), durationWorkingDays: 3,
      requirements: [{ resource: { resourceType: 'vehicle', canonicalResourceId: van.id }, quantity: 1, unit: 'units' }],
    }],
  });
  const schedules = (await (await request.get(`${API}/projects/schedules`, { headers: apiAuthHeaders() })).json()) as Array<{
    projectId: string; tasks: Array<{ requirements: Array<{ id: string; resource: { canonicalResourceId: string } }> }>;
  }>;
  const requirementId = schedules.find((s) => s.projectId === project.id)!.tasks
    .flatMap((t) => t.requirements).find((r) => r.resource.canonicalResourceId === van.id)!.id;
  // Declared before committing, so the commitment records a known capacity it fitted inside.
  await post(request, '/projects/resource-capacity', {
    resourceType: 'vehicle', canonicalResourceId: van.id, unit: 'units', quantity: 1,
    from: businessDay(3), to: businessDay(5), note: 'one van',
  });
  const held = await post<{ booking: { id: string } }>(request, `/projects/${project.id}/resource-bookings`, { requirementId });
  const bookingNow = async (): Promise<BookingView> => {
    const res = await request.get(`${API}/projects/${project.id}/resource-bookings`, { headers: apiAuthHeaders() });
    expect(res.ok(), await res.text()).toBe(true);
    return ((await res.json()) as BookingView[]).find((v) => v.booking.id === held.booking.id)!;
  };
  const before = await bookingNow();
  expect(before.assessment.feasibility, 'the van was free when it was committed').toBe('AVAILABLE');

  const planner = await seat(browser, baseURL!, 'u-e2e-planner');
  const fleet = await seat(browser, baseURL!, 'u-e2e-hrmgr');
  try {
    const card = planner.getByTestId(`booking-${held.booking.id}`);
    await planner.goto(`/projects/schedule?projectId=${project.id}`, { waitUntil: 'domcontentloaded' });
    await expect(card, 'the planner sees their commitment').toBeVisible({ timeout: 60_000 });
    await expect(card).toContainText('AVAILABLE');

    // Not the planner's to say: the same act through the planner's own session is refused.
    const refused = await planner.request.post(`/api/fleet/vehicles/${van.id}/out-of-service`, { data: { reason: 'I heard it broke' } });
    expect(refused.status(), 'a Planning Engineer may not take a vehicle out of service').toBe(403);

    // ── The breakdown, said once, on the Fleet screen ───────────────────────────────────────────
    await fleet.goto('/fleet/control', { waitUntil: 'domcontentloaded' });
    const row = fleet.getByTestId(`vehicle-row-${van.id}`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.getByTestId(`vehicle-out-of-service-${van.id}`).click();
    const dialog = fleet.getByTestId('out-of-service-dialog');
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByRole('button', { name: 'Take out of service' });
    await expect(confirm, 'no reason, no breakdown').toBeDisabled();
    await dialog.getByLabel('What happened').fill('gearbox failure, waiting for parts');
    await confirm.click();
    await expect(dialog).toHaveCount(0, { timeout: 30_000 });
    const status = fleet.getByTestId(`vehicle-status-${van.id}`);
    await expect(status).toContainText('out of service', { timeout: 30_000 });
    await expect(status).toContainText(`since ${businessDay()}: gearbox failure, waiting for parts`);

    // ── The plan says so, in Fleet's words, without anyone touching it ──────────────────────────
    await planner.reload({ waitUntil: 'domcontentloaded' });
    await expect(card).toContainText('UNKNOWN', { timeout: 60_000 });
    await expect(card).toContainText(`${plate} is out of service since ${businessDay()}: gearbox failure, waiting for parts`);
    const after = await bookingNow();
    expect(after.assessment.feasibility).toBe('UNKNOWN');
    // The verdict changed; the commitment did not.
    expect(after.booking).toEqual(before.booking);

    // ── Back on the road ────────────────────────────────────────────────────────────────────────
    await row.getByTestId(`vehicle-return-${van.id}`).click();
    await expect(status).toContainText('active', { timeout: 30_000 });
    await expect(status).not.toContainText('gearbox');
    await planner.reload({ waitUntil: 'domcontentloaded' });
    await expect(card).toContainText('AVAILABLE', { timeout: 60_000 });
    await expect(card).not.toContainText('out of service');
    expect((await bookingNow()).assessment.feasibility).toBe('AVAILABLE');
  } finally {
    await planner.context().close();
    await fleet.context().close();
  }
});
