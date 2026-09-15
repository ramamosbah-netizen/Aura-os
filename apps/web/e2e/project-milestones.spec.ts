import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * PLN-04 — the points where something must be true, on the plan screen, with auth on.
 *
 * Project 360 has been offering a link labelled "Add task or milestone" that opened a screen which
 * could only add a task. This proves the label is now true, and that what it opens does the four
 * things that stop a milestone being a decoration:
 *
 *   · the committed date is AUTHORED and stays put when the plan slips;
 *   · the forecast moves instead, and agrees with the project's own forecast about the same work;
 *   · a milestone nothing gates reads "not established" rather than "on track";
 *   · and an achievement recorded while the gating work is unfinished shows BOTH facts, in one
 *     place, instead of a green badge over a forty-percent activity.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

interface Plan { tasks: Array<{ id: string; name: string; plannedStart: string; plannedEnd: string; durationWorkingDays: number | null }> }

/** Everything below is anchored to today: a milestone's status depends on whether it has passed. */
const fromToday = (days: number): string => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const day = (offset: number): string => fromToday(60 + offset);

const planOf = async (request: APIRequestContext, projectId: string): Promise<Plan> => {
  const response = await request.get(`${API}/projects/schedules?projectId=${projectId}`, { headers: apiAuthHeaders() });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as Plan[])[0];
};

test.describe('The points where this programme must be true', () => {
  test.setTimeout(240_000);

  test('commits a milestone, keeps its date when the plan slips, and shows a sign-off against unfinished work', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };
    const post = async <T>(path: string, data: unknown): Promise<T> => {
      const response = await request.post(`${API}${path}`, { headers, data });
      expect(response.ok(), `${path} — ${await response.text()}`).toBe(true);
      return response.json() as Promise<T>;
    };

    const project = await post<{ id: string }>('/projects/projects', { title: `Milestone job ${run}`, reference: `MS-${run}` });
    const node = async (code: string, title: string) =>
      (await post<{ id: string }>('/projects/wbs', { projectId: project.id, code, title, plannedValue: 20_000 })).id;

    const first = `Containment ${run}`;
    const second = `Cabling ${run}`;
    await post('/projects/schedules', {
      projectId: project.id,
      tasks: [
        { wbsNodeId: await node(`1.${run}`, first), name: first, plannedStart: day(0), plannedEnd: day(3), durationWorkingDays: 4 },
        { wbsNodeId: await node(`2.${run}`, second), name: second, plannedStart: day(4), plannedEnd: day(7), durationWorkingDays: 4 },
      ],
    });
    const plan = await planOf(request, project.id);
    const idOf = (name: string) => plan.tasks.find((task) => task.name === name)!.id;
    await post(`/projects/schedules/${project.id}/dependencies`, {
      edges: [{ predecessorTaskId: idOf(first), successorTaskId: idOf(second) }],
    });

    await page.goto(`/projects/schedule?projectId=${project.id}`, { waitUntil: 'domcontentloaded' });
    const panel = page.getByTestId('milestones-panel');
    await expect(panel).toBeVisible();

    // ── Nothing committed yet, and it says so rather than showing an empty list ──
    await expect(panel).toContainText('No milestone has been committed on this programme.');

    // ── Author one from the screen, gated on the plan already on it ──────────────
    await page.getByTestId('milestone-add-toggle').click();
    await page.getByTestId('milestone-name').fill(`Level 1 energisation ${run}`);
    await page.getByTestId('milestone-target').fill(day(11));
    await page.getByTestId(`milestone-gate-${idOf(first)}`).check();
    await page.getByTestId(`milestone-gate-${idOf(second)}`).check();
    await page.getByTestId('milestone-save').click();

    // Reloaded from the API, not from the form that submitted it.
    const committed = panel.locator('li').filter({ hasText: `Level 1 energisation ${run}` });
    await expect(committed).toBeVisible();
    await expect(committed).toContainText('On track');
    await expect(committed).toContainText(`Committed ${day(11)}`);
    await expect(committed).toContainText(`Forecast ${day(7)}`);
    await expect(committed).toContainText('4 working days early');

    // ── A milestone nothing gates is NOT established ─────────────────────────────
    // A date with no work behind it is a wish, and rounding that up to "on track" is the false
    // confidence the whole model exists to prevent.
    await page.getByTestId('milestone-add-toggle').click();
    await page.getByTestId('milestone-name').fill(`Client hands over site ${run}`);
    await page.getByTestId('milestone-target').fill(day(16));
    await page.getByTestId('milestone-save').click();
    const ungated = panel.locator('li').filter({ hasText: `Client hands over site ${run}` });
    await expect(ungated).toContainText('Not established');
    await expect(ungated).toContainText('no activity in this programme gates this milestone');

    // ── Stretch the plan: the FORECAST moves, the COMMITMENT does not ────────────
    const current = await planOf(request, project.id);
    await post('/projects/schedules', {
      projectId: project.id,
      tasks: current.tasks.map((task) => ({
        id: task.id, name: task.name, plannedStart: task.plannedStart,
        plannedEnd: task.name === second ? day(22) : task.plannedEnd,
        durationWorkingDays: task.name === second ? 12 : task.durationWorkingDays,
      })),
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const slipped = panel.locator('li').filter({ hasText: `Level 1 energisation ${run}` });
    await expect(slipped).toContainText('At risk');
    // The committed date did not move when the plan did — which is the whole point of having one.
    await expect(slipped).toContainText(`Committed ${day(11)}`);
    await expect(slipped).toContainText(`Forecast ${day(15)}`);
    await expect(slipped).toContainText('4 working days late');

    // ── Sign it off while the work is still open ─────────────────────────────────
    // Accepted, because real milestones are accepted with snags. What is refused is the silence:
    // the badge goes green AND the unfinished work is named, in the same place.
    await slipped.getByTestId(/^milestone-achieve-/).click();
    await expect(slipped).toContainText('Achieved');
    const contradiction = slipped.getByTestId(/^milestone-contradiction-/);
    await expect(contradiction).toBeVisible();
    await expect(contradiction).toContainText('Recorded as met while the work behind it is unfinished');
    await expect(contradiction).toContainText(first);
    await expect(contradiction).toContainText(second);

    // And it survives a reload — it is derived on every read, not a flash at the moment of sign-off.
    await page.reload({ waitUntil: 'domcontentloaded' });
    const reloaded = panel.locator('li').filter({ hasText: `Level 1 energisation ${run}` });
    await expect(reloaded).toContainText('Achieved');
    await expect(reloaded.getByTestId(/^milestone-contradiction-/)).toContainText('the work behind it is unfinished');
  });
});
