import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * PLN-14 — what a delay did to the completion date, on Project 360, with auth on.
 *
 * An EOT claim is a contractual instrument, and its number is the most disputed figure on a
 * construction project. A contractor claims the days the event lasted; an employer grants the days
 * completion actually moved; float is usually what separates them. A screen showing only one of
 * those has taken a side.
 *
 * So this proves the delay ledger carries both, that the derived impact comes off the same CPM that
 * produces the programme, that a delay absorbed by float says so rather than reporting the claim,
 * and that an assessment is a recorded act against a named person which survives the plan moving
 * underneath it.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

interface Plan { tasks: Array<{ id: string; name: string }> }

const planOf = async (request: APIRequestContext, projectId: string): Promise<Plan> => {
  const response = await request.get(`${API}/projects/schedules?projectId=${projectId}`, { headers: apiAuthHeaders() });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as Plan[])[0];
};

test.describe('What a delay did to the completion date', () => {
  test.setTimeout(240_000);

  test('shows the claim beside the impact, and records an assessment against a name', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };
    const post = async <T>(path: string, data: unknown): Promise<T> => {
      const response = await request.post(`${API}${path}`, { headers, data });
      expect(response.ok(), `${path} — ${await response.text()}`).toBe(true);
      return response.json() as Promise<T>;
    };

    const calendar = await post<{ id: string }>('/admin/calendar', { name: `Gulf week ${run}`, weekends: [5, 6], standardHoursPerDay: 8 });
    const project = await post<{ id: string }>('/projects/projects', { title: `Delay job ${run}`, reference: `DLY-${run}` });
    await post(`/projects/schedules/${project.id}/working-calendar`, { calendarId: calendar.id });

    const node = async (code: string, title: string) =>
      (await post<{ id: string }>('/projects/wbs', { projectId: project.id, code, title, plannedValue: 10_000 })).id;

    // A → B on the critical path, plus a one-day activity off it with plenty of slack.
    const containment = `Containment ${run}`;
    const cabling = `Cabling ${run}`;
    const signage = `Signage ${run}`;
    await post('/projects/schedules', {
      projectId: project.id,
      tasks: [
        { wbsNodeId: await node(`1.${run}`, `Containment ${run}`), name: containment, plannedStart: '2026-03-09', plannedEnd: '2026-03-10', durationWorkingDays: 2 },
        { wbsNodeId: await node(`2.${run}`, `Cabling ${run}`), name: cabling, plannedStart: '2026-03-11', plannedEnd: '2026-03-12', durationWorkingDays: 2 },
        { wbsNodeId: await node(`3.${run}`, `Signage ${run}`), name: signage, plannedStart: '2026-03-09', plannedEnd: '2026-03-09', durationWorkingDays: 1 },
      ],
    });
    const plan = await planOf(request, project.id);
    const idOf = (name: string) => plan.tasks.find((task) => task.name === name)!.id;
    await post(`/projects/schedules/${project.id}/dependencies`, {
      edges: [{ predecessorTaskId: idOf(containment), successorTaskId: idOf(cabling) }],
    });

    const delay = await post<{ id: string }>('/projects/delays', {
      projectId: project.id, title: `Storm ${run}`, causeCategory: 'force_majeure',
      startDate: '2026-03-09', endDate: '2026-03-11', delayDays: 3,
    });

    await page.goto(`/project/${project.id}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: /time|eot|delay/i }).first().click().catch(() => undefined);
    const panel = page.getByTestId(`delay-assessment-${delay.id}`);
    await expect(panel).toBeVisible();

    // ── Nothing to assess while it names no activity ──────────────────────────
    // The event carries a WBS code as free text, which is a note and not a link a claim rests on.
    await expect(page.getByTestId(`delay-impact-${delay.id}`)).toContainText('No impact can be derived');
    await expect(page.getByTestId(`delay-assessed-${delay.id}`)).toHaveText('Not assessed');

    // ── Named on the critical path: the whole claim lands ─────────────────────
    await panel.getByLabel(`Activities affected by Storm ${run}`).selectOption([idOf(containment)]);
    await expect(page.getByTestId(`delay-impact-${delay.id}`))
      .toContainText('3 working days of completion lost');
    await expect(page.getByTestId(`delay-impact-${delay.id}`)).toContainText('on the critical path');

    // ── Moved onto an activity with float: absorbed, not three days ───────────
    await panel.getByLabel(`Activities affected by Storm ${run}`).selectOption([idOf(signage)]);
    await expect(page.getByTestId(`delay-impact-${delay.id}`))
      .toContainText('Claimed 3 days · absorbed by float');

    // ── The assessment is a recorded act against a name ───────────────────────
    await panel.getByLabel(`Activities affected by Storm ${run}`).selectOption([idOf(containment)]);
    await panel.getByLabel(`Assessed impact for Storm ${run}`).fill('3');
    await panel.getByLabel(`Assessment note for Storm ${run}`).fill('Full impact on the critical path');
    await panel.getByRole('button', { name: 'Record assessment' }).click();

    await expect(page.getByTestId(`delay-assessed-${delay.id}`)).toHaveText('3 working days');

    // ── And it survives the plan moving underneath it ─────────────────────────
    // Widened as well as stretched, because PLN-03 refuses work that cannot fit its window.
    const current = await planOf(request, project.id);
    await post('/projects/schedules', {
      projectId: project.id,
      tasks: current.tasks.map((task) => ({
        id: task.id, name: task.name,
        plannedStart: '2026-03-09',
        plannedEnd: task.name === containment ? '2026-03-18' : '2026-03-20',
        durationWorkingDays: task.name === containment ? 6 : 2,
      })),
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: /time|eot|delay/i }).first().click().catch(() => undefined);
    // The submitted figure is untouched: it was made against the plan as it then stood, and
    // rewriting it whenever somebody edited an activity would quietly rewrite history.
    await expect(page.getByTestId(`delay-assessed-${delay.id}`)).toHaveText('3 working days');
  });
});
