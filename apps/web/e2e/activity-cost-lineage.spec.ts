import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { canBuildGovernedDelivery, createGovernedDelivery } from './governed-delivery';

/**
 * F-07 — ONE ACTIVITY, ITS WORK PACKAGE, AND EVERYTHING THE PACKAGE CARRIES — in the browser, Auth ON,
 * against PostgreSQL.
 *
 * The activity already continued its WBS identity into demand (a requirement, then a booking that
 * names the package) and into progress (the package's installed quantity). Cost stopped short: every
 * source posted to a CBS line only, so a package's actual cost was zero whatever was spent on it.
 *
 * This walks one activity through all three and then checks the PLANNING view against the DELIVERY
 * records it is meant to agree with, without anything being typed twice:
 *
 *   demand    a person required on the activity is booked, and the booking references that requirement of
 *             that activity — which carries the package
 *   progress  150 of 200 m2 installed → the bar reads 75%, and so does the WBS package
 *   cost      labour logged against the package → the activity shows it; the WBS package and the Cost
 *             Ledger hold the same figure; plant logged with no package is NOT pinned to any activity
 *             and is shown as the unattributed remainder beside them
 */
const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const json = { 'content-type': 'application/json' };

async function post<T>(request: APIRequestContext, path: string, data: unknown): Promise<T> {
  const res = await request.post(`${API}${path}`, { headers: { ...json, ...apiAuthHeaders() }, data });
  expect(res.ok(), `${path} — ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()) as T;
}
async function get<T>(request: APIRequestContext, path: string): Promise<T> {
  const res = await request.get(`${API}${path}`, { headers: apiAuthHeaders() });
  expect(res.ok(), `${path} — ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()) as T;
}

interface Schedule {
  projectId: string;
  tasks: Array<{ id: string; name: string; requirements: Array<{ id: string; resource: { canonicalResourceId: string } }> }>;
  progress: Record<string, { effective: number | null; source: string }>;
  cost: Record<string, { wbsNodeId: string | null; packageActual: number | null; packagePostings: number; packageBudget: number | null; sharedBy: number }>;
  costCoverage: { projectActual: number | null; unattributedActual: number | null; unattributedPostings: number };
}
const scheduleOf = async (request: APIRequestContext, projectId: string) =>
  (await get<Schedule[]>(request, `/projects/schedules?projectId=${projectId}`)).find((s) => s.projectId === projectId)!;

test.describe('F-07 — the WBS identity continued into demand, progress and cost', () => {
  test.setTimeout(300_000);

  test('one activity: its booking, its measured progress and its package cost agree with the delivery records', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    test.skip(!canBuildGovernedDelivery(), 'needs the guarded API to walk the governed award path');
    const run = Date.now().toString().slice(-6);

    const delivery = await createGovernedDelivery(request, { title: `Cost${run}`, quantity: 200, unit: 'm2' });
    try {
      const W = delivery.wbsNodeId;
      const pkg = await get<{ code: string; title: string; plannedValue: number }>(request, `/projects/wbs/${W}`);

      // A CBS line to charge — cost is always coded to one; the package is the second coordinate.
      const existing = await get<Array<{ id: string; code: string }>>(request, `/projects/cbs?projectId=${delivery.projectId}`);
      const cbsId = existing[0]?.id ?? (await post<{ id: string }>(request, '/projects/cbs', {
        projectId: delivery.projectId, code: `C${run}`, title: `Direct labour and plant ${run}`, budgetAmount: 50_000,
      })).id;

      // ── The activity on the package, with a person it needs ────────────────
      const employee = await post<{ id: string }>(request, '/hr/employees', {
        firstName: 'Omar', lastName: `Installer ${run}`, role: 'Site Engineer', department: 'Projects', joinedDate: '2026-01-01',
      });
      const name = `Install containment ${run}`;
      await post(request, '/projects/schedules', {
        projectId: delivery.projectId,
        tasks: [
          {
            wbsNodeId: W, name, plannedStart: '2026-09-01', plannedEnd: '2026-09-30', percentComplete: 0,
            requirements: [{ resource: { resourceType: 'employee', canonicalResourceId: employee.id }, quantity: 1, unit: 'persons' }],
          },
          // A second activity on the same package: the package's cost is theirs together, and must say so.
          { wbsNodeId: W, name: `Label containment ${run}`, plannedStart: '2026-10-01', plannedEnd: '2026-10-10', percentComplete: 0 },
        ],
      });
      let plan = await scheduleOf(request, delivery.projectId);
      const task = plan.tasks.find((t) => t.name === name)!;
      expect(plan.cost[task.id], 'nothing charged yet: zero is a fact here, with no postings').toMatchObject({ wbsNodeId: W, packageActual: 0, packagePostings: 0, sharedBy: 2 });

      // ── DEMAND: the booking names the activity's package ────────────────────
      const requirementId = task.requirements.find((r) => r.resource.canonicalResourceId === employee.id)!.id;
      await post(request, `/projects/${delivery.projectId}/resource-bookings`, { requirementId });
      // The booking does not copy the package: it references the exact requirement of the exact
      // activity (a database foreign key, migration 0316), and that activity carries the package.
      const bookings = await get<Array<{ booking: { requirementId: string | null; taskId: string | null; status: string } }>>(request, `/projects/${delivery.projectId}/resource-bookings`);
      const held = bookings.find((b) => b.booking.requirementId === requirementId)!.booking;
      expect(held).toMatchObject({ taskId: task.id, status: 'held' });
      expect(plan.cost[held.taskId!]?.wbsNodeId, 'booking → activity → package: the same package').toBe(W);

      // ── PROGRESS: installed quantity, measured, the same on both sides ─────
      await post(request, '/site/installations', { projectId: delivery.projectId, boqItemId: delivery.boqItemId, date: '2026-09-05', description: `L1-L3 ${run}`, quantity: 150, unit: 'm2' });
      await expect.poll(async () => (await scheduleOf(request, delivery.projectId)).progress[task.id]?.effective, { timeout: 30_000 }).toBe(75);
      expect((await get<{ progress: number }>(request, `/projects/wbs/${W}`)).progress, 'the delivery record says 75 too').toBe(75);

      // ── COST: labour on the package — logged on the Site screen, the ordinary path ───
      // 4 people × 8 h × 50 = 1,600 against the package. The page is scoped to the project, which is
      // what puts its cost lines and work packages in the form.
      await page.goto(`/site/control?project=${delivery.projectId}&section=labour-allocations`, { waitUntil: 'domcontentloaded' });
      await expect(async () => {
        await page.getByTestId('create-labour-allocation').click();
        await expect(page.getByTestId('drawer-labour-allocation')).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 60_000 });
      await page.getByTestId('field-date').fill('2026-09-05');
      await page.getByTestId('field-trade').fill(`ELV installer ${run}`);
      await page.getByTestId('field-headcount').fill('4');
      await page.getByTestId('field-hours').fill('8');
      await page.getByTestId('field-costRate').fill('50');
      await page.getByTestId('field-cbsNodeId').selectOption(cbsId);
      await page.getByTestId('field-wbsNodeId').selectOption(W);
      await page.getByTestId('submit-labour-allocation').click();
      const labourRow = page.getByRole('row').filter({ hasText: `ELV installer ${run}` });
      await expect(labourRow).toContainText('1,600', { timeout: 30_000 });
      await expect(labourRow).toContainText(`${pkg.code} · ${pkg.title}`);

      // Plant names no package (plant usage records none — see COST-CODE-01), and has no screen: API.
      // 10 h × 120 = 1,200 of cost that no activity may claim.
      await post(request, '/site/plant', { projectId: delivery.projectId, date: '2026-09-05', equipment: `Scissor lift ${run}`, hours: 10, rate: 120, cbsNodeId: cbsId });

      await expect.poll(async () => (await scheduleOf(request, delivery.projectId)).cost[task.id]?.packageActual, { timeout: 30_000 }).toBe(1600);
      plan = await scheduleOf(request, delivery.projectId);
      expect(plan.cost[task.id]).toMatchObject({ packageActual: 1600, packagePostings: 1, sharedBy: 2 });
      expect(plan.costCoverage).toMatchObject({ projectActual: 2800, unattributedActual: 1200, unattributedPostings: 1 });

      // The DELIVERY records hold the same figures — read, not re-entered.
      const ledger = await get<Array<{ source: string; amount: number; wbsNodeId: string | null; cbsNodeId: string | null; type: string }>>(request, `/projects/cost-ledger?projectId=${delivery.projectId}`);
      const labour = ledger.filter((t) => t.source === 'labour_timesheet' && t.type === 'actual');
      const plant = ledger.filter((t) => t.source === 'plant_usage' && t.type === 'actual');
      expect(labour.map((t) => [t.amount, t.wbsNodeId, t.cbsNodeId]), 'the day sheet typed on the Site screen, in the ledger with its package').toEqual([[1600, W, cbsId]]);
      expect(plant.map((t) => [t.amount, t.wbsNodeId])).toEqual([[1200, null]]);
      expect((await get<{ actualCost: number }>(request, `/projects/wbs/${W}`)).actualCost, 'the WBS package holds what the ledger attributes to it').toBe(1600);

      // ── The planning screen ──────────────────────────────────────────────────
      await page.goto(`/projects/schedule?projectId=${delivery.projectId}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId(`progress-source-${task.id}`)).toHaveText('Measured from installed quantity · 75%', { timeout: 60_000 });
      await expect(page.getByTestId(`package-cost-${task.id}`)).toContainText('Package cost · 1,600 actual (1 posting)');
      await expect(page.getByTestId(`package-cost-${task.id}`)).toContainText('shared by 2 activities');
      await expect(page.getByTestId(`cost-coverage-${delivery.projectId}`)).toContainText('Actual cost to date 2,800 (Cost Ledger)');
      await expect(page.getByTestId(`cost-coverage-${delivery.projectId}`)).toContainText('1,200 of it (1 posting) names no work package');
    } finally {
      await delivery.cleanup?.();
    }
  });
});
