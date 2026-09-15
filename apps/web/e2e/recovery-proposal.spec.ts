import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * PLN-14 → PLN-15 — the whole chain, in the browser, with auth on.
 *
 *   delay event → derived impact → recorded assessment → EXPLICIT prepare-recovery hand-off
 *     → recovery proposal (a scenario) → review → acceptance → governed programme consequence
 *
 * The hand-off is a BUTTON somebody presses, not something that happens by itself: an assessment
 * that silently launched a re-plan would produce a proposal nobody asked for against a programme
 * nobody agreed to move. And what it produces is a SCENARIO — stored beside the plan, changing not
 * one stored date, until a governed acceptance makes it current.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

interface Plan { tasks: Array<{ id: string; name: string; plannedStart: string; plannedEnd: string }> }

const planOf = async (request: APIRequestContext, projectId: string): Promise<Plan> => {
  const response = await request.get(`${API}/projects/schedules?projectId=${projectId}`, { headers: apiAuthHeaders() });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as Plan[])[0];
};
const finishOf = (plan: Plan) =>
  plan.tasks.reduce((latest, task) => (task.plannedEnd > latest ? task.plannedEnd : latest), plan.tasks[0].plannedEnd);

test.describe('From a delay to a recovered programme', () => {
  test.setTimeout(300_000);

  test('hands off explicitly, proposes a scenario, and moves the programme only on acceptance', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };
    const post = async <T>(path: string, data: unknown): Promise<T> => {
      const response = await request.post(`${API}${path}`, { headers, data });
      expect(response.ok(), `${path} — ${await response.text()}`).toBe(true);
      return response.json() as Promise<T>;
    };

    const calendar = await post<{ id: string }>('/admin/calendar', { name: `Gulf week ${run}`, weekends: [5, 6], standardHoursPerDay: 8 });
    const project = await post<{ id: string }>('/projects/projects', { title: `Recovery job ${run}`, reference: `REC-${run}` });
    await post(`/projects/schedules/${project.id}/working-calendar`, { calendarId: calendar.id });

    const node = async (code: string, title: string) =>
      (await post<{ id: string }>('/projects/wbs', { projectId: project.id, code, title, plannedValue: 10_000 })).id;

    // Dates deliberately later than the network requires, so a re-plan has real time to win back.
    const containment = `Containment ${run}`;
    const cabling = `Cabling ${run}`;
    await post('/projects/schedules', {
      projectId: project.id,
      tasks: [
        { wbsNodeId: await node(`1.${run}`, `Containment ${run}`), name: containment, plannedStart: '2026-03-09', plannedEnd: '2026-03-17', durationWorkingDays: 2 },
        { wbsNodeId: await node(`2.${run}`, `Cabling ${run}`), name: cabling, plannedStart: '2026-03-18', plannedEnd: '2026-03-24', durationWorkingDays: 2 },
      ],
    });
    const plan = await planOf(request, project.id);
    const idOf = (name: string) => plan.tasks.find((task) => task.name === name)!.id;
    await post(`/projects/schedules/${project.id}/dependencies`, {
      edges: [{ predecessorTaskId: idOf(containment), successorTaskId: idOf(cabling) }],
    });
    expect(finishOf(plan)).toBe('2026-03-24');

    const delay = await post<{ id: string }>('/projects/delays', {
      projectId: project.id, title: `Storm ${run}`, causeCategory: 'force_majeure',
      startDate: '2026-03-09', endDate: '2026-03-11', delayDays: 3,
    });
    await post(`/projects/delays/${delay.id}/activities`, { taskIds: [idOf(containment)] });

    // ── The assessment, then the hand-off ─────────────────────────────────────
    await page.goto(`/project/${project.id}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: /time|eot|delay/i }).first().click().catch(() => undefined);
    const panel = page.getByTestId(`delay-assessment-${delay.id}`);
    await expect(panel).toBeVisible();

    // No hand-off is offered until the delay has been assessed: a recovery prepared against an
    // unassessed delay has nothing to be a recovery OF.
    await expect(page.getByTestId(`prepare-recovery-${delay.id}`)).toHaveCount(0);

    await panel.getByLabel(`Assessed impact for Storm ${run}`).fill('3');
    await panel.getByRole('button', { name: 'Record assessment' }).click();
    await expect(page.getByTestId(`delay-assessed-${delay.id}`)).toHaveText('3 working days');

    const handoff = page.getByTestId(`prepare-recovery-${delay.id}`);
    await expect(handoff).toBeVisible();
    await handoff.click();

    // ── A scenario: nothing on the programme has moved ────────────────────────
    const runCount = async (): Promise<number> => {
      const response = await request.get(`${API}/projects/schedules/${project.id}/planning-runs`, { headers: apiAuthHeaders() });
      return response.ok() ? ((await response.json()) as unknown[]).length : 0;
    };
    await expect.poll(runCount, { timeout: 20_000 }).toBeGreaterThan(0);
    expect(finishOf(await planOf(request, project.id))).toBe('2026-03-24');

    // ── Reviewed on the plan screen, with what it would recover ───────────────
    await page.goto(`/projects/schedule?projectId=${project.id}`, { waitUntil: 'domcontentloaded' });
    const runPanel = page.getByTestId('planning-run-panel');
    await expect(runPanel).toBeVisible();
    await runPanel.getByTestId('run-plan').click();

    // Current finish, proposed finish, and the figure the decision actually rests on.
    await expect(runPanel).toContainText('Current finish');
    await expect(page.getByTestId('recovery-verdict')).toContainText('Recovered');

    // ── Acceptance is what moves the programme ────────────────────────────────
    const before = finishOf(await planOf(request, project.id));
    await runPanel.getByRole('button', { name: /accept/i }).first().click();
    await expect
      .poll(async () => finishOf(await planOf(request, project.id)), { timeout: 20_000 })
      .not.toBe(before);

    // The programme now finishes earlier than the plan anybody was working to this morning, and it
    // did so through one recorded act rather than by a re-plan quietly becoming the plan.
    expect(finishOf(await planOf(request, project.id)) < '2026-03-24').toBe(true);
  });
});
