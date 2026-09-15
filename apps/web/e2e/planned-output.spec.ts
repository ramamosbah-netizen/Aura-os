import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { canBuildGovernedDelivery, createGovernedDelivery } from './governed-delivery';

/**
 * PLN-11 — measured against what, in the browser, with auth on.
 *
 * PLN-12 put a measured number on the bar. On its own that number cannot be late: 60% is only
 * behind against a quantity somebody sold, a rate somebody priced, and dates somebody planned.
 *
 * This proves the plan screen carries all three without anybody retyping them — the sold quantity
 * and the priced crew rate come off the award, frozen at handover — and that where one of those
 * facts was never stated the screen says so rather than quietly reporting the work on track.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

/** A date `offset` days from today, so the activity's window really does contain today. */
const day = (offset: number): string =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

interface Schedule {
  projectId: string;
  tasks: Array<{ id: string; name: string }>;
  output: Record<string, { verdict: string; installedQuantity: number | null; pricedRatePerDay: number | null }>;
}

const planOf = async (request: APIRequestContext, projectId: string): Promise<Schedule> => {
  const response = await request.get(`${API}/projects/schedules?projectId=${projectId}`, { headers: apiAuthHeaders() });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as Schedule[])[0];
};

test.describe('The rate the work was priced at', () => {
  test.setTimeout(300_000);

  test('carries the sold quantity and the priced rate onto the plan, and says when it cannot judge', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    test.skip(!canBuildGovernedDelivery(), 'needs the guarded API to walk the governed award path');
    const run = Date.now().toString().slice(-6);

    // 200 m² sold, priced at 2 technicians × 100 hours each for the whole line → 16 m²/day.
    const delivery = await createGovernedDelivery(request, {
      title: `Riser${run}`, quantity: 200, unit: 'm2', labour: { count: 2, hours: 100 },
    });
    try {
      // A second package with no award line behind it: nothing was sold or priced for it, and the
      // screen has to say that rather than call it on track.
      const unmapped = await request.post(`${API}/projects/wbs`, {
        headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
        data: { projectId: delivery.projectId, code: `2.R${run}`, title: `Riser commissioning ${run}`, plannedValue: 40_000 },
      });
      expect(unmapped.ok(), await unmapped.text()).toBe(true);
      const unmappedNodeId = ((await unmapped.json()) as { id: string }).id;

      // Ten days of a twenty-day window already used, so the elapsed side of the rate is real.
      const pricedName = `Install riser containment ${run}`;
      const unmappedName = `Commission riser ${run}`;
      const saved = await request.post(`${API}/projects/schedules`, {
        headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
        data: {
          projectId: delivery.projectId,
          tasks: [
            { wbsNodeId: delivery.wbsNodeId, name: pricedName, plannedStart: day(-9), plannedEnd: day(10) },
            { wbsNodeId: unmappedNodeId, name: unmappedName, plannedStart: day(-9), plannedEnd: day(10) },
          ],
        },
      });
      expect(saved.ok(), await saved.text()).toBe(true);
      const plan = await planOf(request, delivery.projectId);
      // By NAME: both activities share a window, so the saved order is not the order sent.
      const pricedId = plan.tasks.find((task) => task.name === pricedName)!.id;
      const unmappedId = plan.tasks.find((task) => task.name === unmappedName)!.id;

      // ── Site installs 60 of the 200 m² — well under the priced pace ────────
      const installed = await request.post(`${API}/site/installations`, {
        headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
        data: { projectId: delivery.projectId, boqItemId: delivery.boqItemId, date: day(0), description: `Riser L1 ${run}`, quantity: 60, unit: 'm2' },
      });
      expect(installed.ok(), await installed.text()).toBe(true);
      await expect
        .poll(async () => (await planOf(request, delivery.projectId)).output[pricedId]?.installedQuantity, { timeout: 30_000 })
        .toBe(60);

      // ── The plan screen ───────────────────────────────────────────────────
      await page.goto(`/projects/schedule?projectId=${delivery.projectId}`, { waitUntil: 'domcontentloaded' });

      // What was sold and what is in — neither typed by a planner.
      await expect(page.getByTestId(`output-sold-${pricedId}`)).toHaveText('60 of 200 m2 installed');
      // …and the pace against the pace the company sold itself at, with the recovery rate named.
      await expect(page.getByTestId(`output-rate-${pricedId}`))
        .toHaveText('Behind the priced rate · 6 m2/day against 16 m2/day priced · 14 m2/day needed to finish in the window');
      // The headline agrees with the row rather than reporting an average that hides it.
      await expect(page.getByText('Activities installing slower than the award was priced at').first()).toBeVisible();

      // An activity with no award line behind it stays silent — it is the ordinary case, and
      // printing "unknown" under every bar teaches people to stop reading the ones that matter.
      await expect(page.getByTestId(`output-sold-${unmappedId}`)).toHaveCount(0);
      await expect(page.getByTestId(`output-rate-${unmappedId}`)).toHaveCount(0);

      // ── Site catches up to the priced rate ────────────────────────────────
      const caughtUp = await request.post(`${API}/site/installations`, {
        headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
        data: { projectId: delivery.projectId, boqItemId: delivery.boqItemId, date: day(0), description: `Riser L2-L4 ${run}`, quantity: 100, unit: 'm2' },
      });
      expect(caughtUp.ok(), await caughtUp.text()).toBe(true);
      await expect
        .poll(async () => (await planOf(request, delivery.projectId)).output[pricedId]?.verdict, { timeout: 30_000 })
        .toBe('ON_RATE');

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId(`output-rate-${pricedId}`))
        .toHaveText('At the priced rate · 16 m2/day against 16 m2/day priced');
      await expect(page.getByText('No activity is losing ground against what was priced').first()).toBeVisible();

      // ── What those metres COST in hours ───────────────────────────────────
      // On rate and still ruinous: the pace is exactly what was sold, and it is taking twice the
      // hours priced into it. One line cannot carry both facts, so the screen carries two.
      await expect(page.getByTestId(`output-labour-${pricedId}`)).toContainText('no labour has been attributed');

      const labour = await request.post(`${API}/site/labour`, {
        headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
        data: { projectId: delivery.projectId, date: day(0), trade: 'Electrician', headcount: 40, hours: 8, wbsNodeId: delivery.wbsNodeId },
      });
      expect(labour.ok(), await labour.text()).toBe(true);
      // Hours that belong to no one package — mobilisation, standing time — are real and are not
      // added to it. They are reported beside the figure so nobody reads it as complete.
      const general = await request.post(`${API}/site/labour`, {
        headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
        data: { projectId: delivery.projectId, date: day(0), trade: 'General', headcount: 10, hours: 8 },
      });
      expect(general.ok(), await general.text()).toBe(true);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId(`output-labour-${pricedId}`))
        .toHaveText('Costing more hours than priced · 320h spent against 160h earned (factor 0.5) · 20% of this project’s hours name no work package');
      // …counted separately from lateness in the headline, because they are separate failures.
      await expect(page.getByText('Activities spending more crew hours than the work earned').first()).toBeVisible();
      await expect(page.getByTestId(`output-rate-${pricedId}`))
        .toHaveText('At the priced rate · 16 m2/day against 16 m2/day priced');
    } finally {
      await delivery.cleanup();
    }
  });

  test('refuses to judge a pace against a rate nobody committed to', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    test.skip(!canBuildGovernedDelivery(), 'needs the guarded API to walk the governed award path');
    const run = Date.now().toString().slice(-6);

    // No `labour`: a supply-only line, priced as material. Nothing about a crew exists to freeze.
    const delivery = await createGovernedDelivery(request, { title: `Supply${run}`, quantity: 100, unit: 'nr' });
    try {
      const name = `Deliver panels ${run}`;
      const saved = await request.post(`${API}/projects/schedules`, {
        headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
        data: {
          projectId: delivery.projectId,
          tasks: [{ wbsNodeId: delivery.wbsNodeId, name, plannedStart: day(-9), plannedEnd: day(10) }],
        },
      });
      expect(saved.ok(), await saved.text()).toBe(true);
      const installed = await request.post(`${API}/site/installations`, {
        headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
        data: { projectId: delivery.projectId, boqItemId: delivery.boqItemId, date: day(0), description: `Panels ${run}`, quantity: 30, unit: 'nr' },
      });
      expect(installed.ok(), await installed.text()).toBe(true);
      const plan = await planOf(request, delivery.projectId);
      const taskId = plan.tasks.find((task) => task.name === name)!.id;
      await expect
        .poll(async () => (await planOf(request, delivery.projectId)).output[taskId]?.installedQuantity, { timeout: 30_000 })
        .toBe(30);

      await page.goto(`/projects/schedule?projectId=${delivery.projectId}`, { waitUntil: 'domcontentloaded' });
      // Everything knowable is still shown — what was sold, and what is in.
      await expect(page.getByTestId(`output-sold-${taskId}`)).toHaveText('30 of 100 nr installed');
      // …but there is no committed rate to be behind, and the screen says so in those words rather
      // than reporting the work on track against a number nobody ever agreed to.
      await expect(page.getByTestId(`output-rate-${taskId}`)).toContainText('No rate can be judged');
      await expect(page.getByTestId(`output-rate-${taskId}`)).toContainText('no crew was priced');
      await expect(page.getByText('No activity is losing ground against what was priced').first()).toBeVisible();
    } finally {
      await delivery.cleanup();
    }
  });
});
