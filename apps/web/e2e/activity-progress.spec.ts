import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { canBuildGovernedDelivery, createGovernedDelivery } from './governed-delivery';

/**
 * PLN-12 — the number on a Gantt bar, in the browser, with auth on.
 *
 * The API proof (apps/api/test/activity-progress.e2e-spec.ts) establishes that the chain
 * resolves: installed quantity → Quantity Ledger → WBS node → activity progress. What it cannot
 * establish is what a planner actually SEES and is allowed to do about it, which is where a
 * measured figure is most easily mistaken for a typed one — they render as the same "75%".
 *
 * So this proves the plan screen says which of the three each number is, that the plain box a
 * planner has always used is GONE wherever something has been measured, that stating a different
 * figure costs a reason and keeps the measurement beside it, and that withdrawing the statement
 * hands the bar back to the site.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

interface Schedule {
  projectId: string;
  tasks: Array<{ id: string; name: string; percentComplete: number }>;
  progress: Record<string, { effective: number | null; source: string; evidence: number | null }>;
}

const schedulesOf = async (request: APIRequestContext, projectId: string): Promise<Schedule> => {
  const response = await request.get(`${API}/projects/schedules`, { headers: apiAuthHeaders() });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as Schedule[]).find((schedule) => schedule.projectId === projectId)!;
};

test.describe('What an activity’s progress is, and who may say otherwise', () => {
  test.setTimeout(300_000);

  test('names the source of every bar, and makes a different figure cost a reason', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    test.skip(!canBuildGovernedDelivery(), 'needs the guarded API to walk the governed award path');
    const run = Date.now().toString().slice(-6);

    // ── A project whose work package is genuinely quantity-controlled ─────────
    const delivery = await createGovernedDelivery(request, { title: `Riser${run}`, quantity: 200, unit: 'm2' });
    // The approver identities the fixture signed in exist only for it; they go either way.
    try {
      // …and a second package in the same project with nothing mapped to it. Its activity's number
      // is a declaration, and the screen has to say so rather than let it pass for measurement.
      const unmeasured = await request.post(`${API}/projects/wbs`, {
        headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
        data: { projectId: delivery.projectId, code: `2.R${run}`, title: `Riser commissioning ${run}`, plannedValue: 40_000 },
      });
      expect(unmeasured.ok(), await unmeasured.text()).toBe(true);
      const unmeasuredNodeId = ((await unmeasured.json()) as { id: string }).id;

      const measuredName = `Install riser containment ${run}`;
      const declaredName = `Commission riser ${run}`;
      const saved = await request.post(`${API}/projects/schedules`, {
        headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
        data: {
          projectId: delivery.projectId,
          tasks: [
            { wbsNodeId: delivery.wbsNodeId, name: measuredName, plannedStart: '2026-09-01', plannedEnd: '2026-09-30', percentComplete: 10 },
            { wbsNodeId: unmeasuredNodeId, name: declaredName, plannedStart: '2026-10-01', plannedEnd: '2026-10-15', percentComplete: 40 },
          ],
        },
      });
      expect(saved.ok(), await saved.text()).toBe(true);
      const plan = await schedulesOf(request, delivery.projectId);
      const measuredId = plan.tasks.find((task) => task.name === measuredName)!.id;
      const declaredId = plan.tasks.find((task) => task.name === declaredName)!.id;

      // ── Site installs 150 of the 200 m² ──────────────────────────────────────
      const installed = await request.post(`${API}/site/installations`, {
        headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
        data: { projectId: delivery.projectId, boqItemId: delivery.boqItemId, date: '2026-09-05', description: `Riser L1-L3 ${run}`, quantity: 150, unit: 'm2' },
      });
      expect(installed.ok(), await installed.text()).toBe(true);
      await expect
        .poll(async () => (await schedulesOf(request, delivery.projectId)).progress[measuredId]?.effective, { timeout: 30_000 })
        .toBe(75);

      // ── The plan screen ──────────────────────────────────────────────────────
      await page.goto(`/projects/schedule?projectId=${delivery.projectId}`, { waitUntil: 'domcontentloaded' });
      const measuredSource = page.getByTestId(`progress-source-${measuredId}`);
      const declaredSource = page.getByTestId(`progress-source-${declaredId}`);

      // The bar reads 75% — which is NOT the 10% typed into the plan — and says where that came from.
      await expect(measuredSource).toHaveText('Measured from installed quantity · 75%');
      await expect(page.getByLabel(`${measuredName}, 75% complete`)).toBeVisible();
      // The declared activity keeps its typed 40% and is labelled as a declaration, not a measurement.
      await expect(declaredSource).toHaveText('Declared · nothing measured against this activity');
      await expect(page.getByLabel(`${declaredName}, 40% complete`)).toBeVisible();
      // And the page's own headline agrees with the bars instead of averaging the typed numbers.
      await expect(page.getByText('1 of 2 measured from site quantity').first()).toBeVisible();

      // ── The plain box is gone where something has been measured ──────────────
      const statement = page.getByTestId(`progress-statement-${measuredId}`);
      await expect(statement).toBeVisible();
      // The declared activity still has exactly the control it always had.
      await expect(page.getByTestId(`progress-statement-${declaredId}`)).toHaveCount(0);

      // ── Stating a different figure ───────────────────────────────────────────
      await statement.getByLabel(`Stated progress for ${measuredName}`, { exact: true }).fill('90');
      await statement.getByRole('button', { name: 'State' }).click();
      // Refused without a reason, and the bar does not move: an unexplained claim is not a fact.
      await expect(page.getByText('a reason is required to state progress against the measurement')).toBeVisible();
      await expect(measuredSource).toHaveText('Measured from installed quantity · 75%');

      await statement.getByLabel(`Stated progress for ${measuredName}`, { exact: true }).fill('90');
      await statement.getByLabel(`Reason for stated progress for ${measuredName}`).fill('riser complete on site, awaiting joint measure');
      await statement.getByRole('button', { name: 'State' }).click();

      // Both numbers stay on screen. The measurement is not overwritten or hidden — which is what
      // makes the disagreement something a reader can see rather than something they must discover.
      await expect(measuredSource).toHaveText('Stated 90% against a measured 75% · riser complete on site, awaiting joint measure');
      await expect(page.getByLabel(`${measuredName}, 90% complete`)).toBeVisible();

      // Stored where it belongs: on the activity, with provenance — and the evidence untouched.
      const stated = await schedulesOf(request, delivery.projectId);
      expect(stated.progress[measuredId]).toMatchObject({ effective: 90, source: 'override', evidence: 75 });
      expect(stated.tasks.find((task) => task.id === measuredId)!.percentComplete).toBe(10);

      // ── Withdrawing it hands the bar back to the site ────────────────────────
      await statement.getByRole('button', { name: `Withdraw stated progress for ${measuredName}` }).click();
      await expect(measuredSource).toHaveText('Measured from installed quantity · 75%');

      // ── And the site keeps moving it, with nobody opening the programme ──────
      const finished = await request.post(`${API}/site/installations`, {
        headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
        data: { projectId: delivery.projectId, boqItemId: delivery.boqItemId, date: '2026-09-20', description: `Riser L4-L5 ${run}`, quantity: 50, unit: 'm2' },
      });
      expect(finished.ok(), await finished.text()).toBe(true);
      await expect
        .poll(async () => (await schedulesOf(request, delivery.projectId)).progress[measuredId]?.effective, { timeout: 30_000 })
        .toBe(100);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(measuredSource).toHaveText('Measured from installed quantity · 100%');
    } finally {
      await delivery.cleanup();
    }
  });
});
