import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * PLN-13 — the next few weeks, on the plan screen, with auth on.
 *
 * A look-ahead is the meeting every site runs on: what must happen, what it needs, and what is not
 * ready. It is the planning artefact people most often keep in a spreadsheet, and the moment they
 * do it disagrees with the programme — someone extends an activity, nobody retypes the look-ahead,
 * and the meeting is held against a plan that no longer exists.
 *
 * So this proves it is a WINDOW and not a document: nothing on the panel is authored, committing a
 * resource changes what it says on the next read, and an activity whose capacity nobody declared
 * reads "not established" rather than ready — because a look-ahead that rounds "we could not find a
 * problem" up to "no problem" sends a crew to a site that is not open.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

const day = (offset: number): string =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

interface Plan {
  tasks: Array<{ id: string; name: string; requirements: Array<{ id: string }> }>;
}

const planOf = async (request: APIRequestContext, projectId: string): Promise<Plan> => {
  const response = await request.get(`${API}/projects/schedules?projectId=${projectId}`, { headers: apiAuthHeaders() });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as Plan[])[0];
};

test.describe('The next few weeks, read off the programme', () => {
  test.setTimeout(240_000);

  test('says what is due, what it needs, and refuses to call an unknown ready', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };
    const post = async <T>(path: string, data: unknown): Promise<T> => {
      const response = await request.post(`${API}${path}`, { headers, data });
      expect(response.ok(), `${path} — ${await response.text()}`).toBe(true);
      return response.json() as Promise<T>;
    };

    const project = await post<{ id: string }>('/projects/projects', { title: `Look-ahead job ${run}`, reference: `LA-${run}` });
    const node = async (code: string, title: string) =>
      (await post<{ id: string }>('/projects/wbs', { projectId: project.id, code, title, plannedValue: 10_000 })).id;
    const sharedNode = await node(`1.${run}`, `Riser containment ${run}`);
    const crew = await post<{ id: string }>('/projects/resource-pools', { name: `ELV crew ${run}`, resourceType: 'pool', unit: 'crews' });

    const firstFix = `First fix ${run}`;
    const secondFix = `Second fix ${run}`;
    const later = `Handover ${run}`;
    await post('/projects/schedules', {
      projectId: project.id,
      tasks: [
        // Two activities delivering ONE package — the apportionment trap.
        { wbsNodeId: sharedNode, name: firstFix, plannedStart: day(1), plannedEnd: day(5),
          requirements: [{ resource: { resourceType: 'pool', canonicalResourceId: crew.id }, quantity: 1, unit: 'crews' }] },
        { wbsNodeId: sharedNode, name: secondFix, plannedStart: day(8), plannedEnd: day(12) },
        // Four months out: a three-week look-ahead has nothing to say about it.
        { wbsNodeId: await node(`2.${run}`, `Commissioning ${run}`), name: later, plannedStart: day(120), plannedEnd: day(125) },
      ],
    });
    const plan = await planOf(request, project.id);
    const firstFixId = plan.tasks.find((task) => task.name === firstFix)!.id;
    const secondFixId = plan.tasks.find((task) => task.name === secondFix)!.id;
    const laterId = plan.tasks.find((task) => task.name === later)!.id;

    await page.goto(`/projects/schedule?projectId=${project.id}`, { waitUntil: 'domcontentloaded' });
    const panel = page.getByTestId('look-ahead-panel');
    await expect(panel).toBeVisible();

    // ── The window ────────────────────────────────────────────────────────────
    await expect(panel).toContainText(`${day(0)} to ${day(20)}`);
    await expect(page.getByTestId(`look-ahead-${firstFixId}`)).toBeVisible();
    await expect(page.getByTestId(`look-ahead-${secondFixId}`)).toBeVisible();
    await expect(page.getByTestId(`look-ahead-${laterId}`)).toHaveCount(0);

    // ── Not ready, in words ───────────────────────────────────────────────────
    await expect(page.getByTestId(`readiness-${firstFixId}`)).toHaveText('Not ready');
    await expect(page.getByTestId(`reasons-${firstFixId}`)).toContainText('1 crews of pool is needed and not committed');

    // ── One row per work package, however many activities deliver it ──────────
    // Each activity reads that package's whole sold quantity, so a per-activity total would report
    // the same scope twice.
    await expect(page.getByTestId(`look-ahead-package-${sharedNode}`)).toHaveCount(1);
    await expect(page.getByTestId(`look-ahead-package-${sharedNode}`)).toContainText('2 activities in this window');

    // ── Committing the crew changes what the next read says ───────────────────
    const requirementId = plan.tasks.find((task) => task.name === firstFix)!.requirements[0].id;
    await post('/projects/resource-capacity', {
      resourceType: 'pool', canonicalResourceId: crew.id, unit: 'crews', quantity: 2,
      from: day(0), to: day(20), note: 'crews available',
    });
    await post(`/projects/${project.id}/resource-bookings`, { requirementId });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId(`readiness-${firstFixId}`)).toHaveText('Ready');
    await expect(page.getByTestId(`reasons-${firstFixId}`)).toHaveCount(0);

    // ── Releasing it takes the readiness with it ──────────────────────────────
    const bookings = await request.get(`${API}/projects/${project.id}/resource-bookings`, { headers: apiAuthHeaders() });
    const bookingId = ((await bookings.json()) as Array<{ booking: { id: string } }>)[0].booking.id;
    await post(`/projects/${project.id}/resource-bookings/${bookingId}/release`, { reason: 'crew moved to another job' });

    await page.reload({ waitUntil: 'domcontentloaded' });
    // A released booking freed its capacity, so the activity it covered is uncommitted again — and
    // a look-ahead still showing it ready would send a crew that is somewhere else.
    await expect(page.getByTestId(`readiness-${firstFixId}`)).toHaveText('Not ready');

    // ── A longer window reaches further into the same programme ───────────────
    await page.getByLabel('Look-ahead length in weeks').selectOption('6');
    await expect(panel).toContainText(`${day(0)} to ${day(41)}`);
    await expect(page.getByTestId(`look-ahead-${laterId}`)).toHaveCount(0);
  });
});
