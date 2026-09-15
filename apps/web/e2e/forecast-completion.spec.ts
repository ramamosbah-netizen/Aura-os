import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * PLN-16 — when this project will actually finish, on the plan screen, with auth on.
 *
 * Three dates that a management report must never confuse: the BASELINE it was committed to, the
 * PLANNED finish the programme claims today, and the FORECAST the work is actually heading for.
 * A "forecast" that repeats the planned finish is the plan with a new label, and it is the most
 * common lie a project system tells.
 *
 * So this proves the screen carries all three, that the forecast moves when the evidence does
 * rather than when the plan does, that the variance is measured against the committed date, and
 * that the confidence — how much of the date rests on measured rather than declared progress —
 * travels with it instead of sitting in a footnote.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

interface Plan { tasks: Array<{ id: string; name: string; plannedStart: string; plannedEnd: string; durationWorkingDays: number | null }> }

const planOf = async (request: APIRequestContext, projectId: string): Promise<Plan> => {
  const response = await request.get(`${API}/projects/schedules?projectId=${projectId}`, { headers: apiAuthHeaders() });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as Plan[])[0];
};

test.describe('Where this programme actually lands', () => {
  test.setTimeout(240_000);

  test('shows baseline, planned and forecast apart, and says what the date rests on', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };
    const post = async <T>(path: string, data: unknown): Promise<T> => {
      const response = await request.post(`${API}${path}`, { headers, data });
      expect(response.ok(), `${path} — ${await response.text()}`).toBe(true);
      return response.json() as Promise<T>;
    };

    const project = await post<{ id: string }>('/projects/projects', { title: `Forecast job ${run}`, reference: `FC-${run}` });
    const node = async (code: string, title: string) =>
      (await post<{ id: string }>('/projects/wbs', { projectId: project.id, code, title, plannedValue: 10_000 })).id;

    const first = `Containment ${run}`;
    const second = `Cabling ${run}`;
    await post('/projects/schedules', {
      projectId: project.id,
      tasks: [
        { wbsNodeId: await node(`1.${run}`, `Containment ${run}`), name: first, plannedStart: '2026-03-09', plannedEnd: '2026-03-12', durationWorkingDays: 4 },
        { wbsNodeId: await node(`2.${run}`, `Cabling ${run}`), name: second, plannedStart: '2026-03-13', plannedEnd: '2026-03-16', durationWorkingDays: 4 },
      ],
    });
    const plan = await planOf(request, project.id);
    const idOf = (name: string) => plan.tasks.find((task) => task.name === name)!.id;
    await post(`/projects/schedules/${project.id}/dependencies`, {
      edges: [{ predecessorTaskId: idOf(first), successorTaskId: idOf(second) }],
    });

    await page.goto(`/projects/schedule?projectId=${project.id}`, { waitUntil: 'domcontentloaded' });
    const forecast = page.getByTestId('forecast-panel');
    await expect(forecast).toBeVisible();

    // ── Nothing committed to yet ──────────────────────────────────────────────
    // "0 days late" against no baseline would be an answer rather than the absence of one.
    await expect(forecast).toContainText('Baseline not committed');
    await expect(page.getByTestId('forecast-variance')).toHaveText('Nothing committed to measure against');
    await expect(page.getByTestId('forecast-finish')).toContainText('2026-03-16');

    // ── Committed, and nothing has moved ──────────────────────────────────────
    await post(`/projects/schedules/${project.id}/baseline`, {});
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(forecast).toContainText('Baseline 2026-03-16');
    await expect(page.getByTestId('forecast-variance')).toHaveText('On the committed date');
    // Every activity's percentage is a declaration, and the panel says so rather than presenting a
    // confident date built on numbers nobody measured.
    await expect(page.getByTestId('forecast-confidence')).toHaveText('0 of 2 activities driving this date carry measured progress');

    // ── The drivers are named, so the date can be drilled into ────────────────
    await expect(page.getByTestId(`forecast-driver-${idOf(first)}`)).toContainText('4 days left');
    await expect(page.getByTestId(`forecast-driver-${idOf(first)}`)).toContainText('declared');

    // ── Stretching the plan pushes the forecast out, and it is LATE against the
    //    committed date rather than against the plan somebody just edited ──────
    const current = await planOf(request, project.id);
    await post('/projects/schedules', {
      projectId: project.id,
      tasks: current.tasks.map((task) => ({
        id: task.id, name: task.name, plannedStart: task.plannedStart,
        plannedEnd: task.name === second ? '2026-03-24' : task.plannedEnd,
        durationWorkingDays: task.name === second ? 8 : task.durationWorkingDays,
      })),
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('forecast-finish')).toContainText('2026-03-20');
    await expect(page.getByTestId('forecast-variance')).toHaveText('4 working days late');
    // The baseline did not move when the plan did — which is the whole point of having one.
    await expect(forecast).toContainText('Baseline 2026-03-16');

    // ── Progress pulls it back in ─────────────────────────────────────────────
    const progressed = await planOf(request, project.id);
    await post('/projects/schedules', {
      projectId: project.id,
      tasks: progressed.tasks.map((task) => ({
        id: task.id, name: task.name, plannedStart: task.plannedStart, plannedEnd: task.plannedEnd,
        durationWorkingDays: task.durationWorkingDays,
        percentComplete: task.name === first ? 100 : 50,
      })),
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    // Four days of the second activity left, and the first finished: the date comes in, driven by
    // what has been done rather than by anybody editing a date.
    await expect(page.getByTestId('forecast-finish')).toContainText('2026-03-12');
    await expect(page.getByTestId('forecast-variance')).toHaveText('4 working days early');
  });
});
