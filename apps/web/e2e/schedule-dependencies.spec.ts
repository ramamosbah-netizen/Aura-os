import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * PLN-02 — which activity waits for which, authored in the browser, with auth on.
 *
 * The dependency network, its cycle refusal and the CPM forward pass have existed in the planning
 * domain since Step 8, and nothing could reach them: `setScheduleDependencies` had no caller
 * anywhere in the product. Every plan carried an empty network and the critical path was computed
 * over a graph nobody could author — the engine right, and unreachable.
 *
 * So this proves the part that was missing: a planner says on the plan screen that one activity
 * waits for another, a loop is refused in words naming it, and the accepted dates follow the
 * network across the weekends the project's own calendar defines.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

interface Plan {
  tasks: Array<{ id: string; name: string; plannedStart: string }>;
  dependencies: Array<{ predecessorTaskId: string; successorTaskId: string }>;
}

const planOf = async (request: APIRequestContext, projectId: string): Promise<Plan> => {
  const response = await request.get(`${API}/projects/schedules?projectId=${projectId}`, { headers: apiAuthHeaders() });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as Plan[])[0];
};

test.describe('Making one activity wait for another', () => {
  test.setTimeout(240_000);

  test('authors the network on the plan, refuses a loop, and lets the dates follow it', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };
    const post = async <T>(path: string, data: unknown): Promise<T> => {
      const response = await request.post(`${API}${path}`, { headers, data });
      expect(response.ok(), `${path} — ${await response.text()}`).toBe(true);
      return response.json() as Promise<T>;
    };

    const calendar = await post<{ id: string }>('/admin/calendar', { name: `Gulf week ${run}`, weekends: [5, 6], standardHoursPerDay: 8 });
    const project = await post<{ id: string }>('/projects/projects', { title: `Dependency job ${run}`, reference: `DEP-${run}` });
    await post(`/projects/schedules/${project.id}/working-calendar`, { calendarId: calendar.id });

    const node = async (code: string, title: string) =>
      (await post<{ id: string }>('/projects/wbs', { projectId: project.id, code, title, plannedValue: 10_000 })).id;
    const containment = `Install containment ${run}`;
    const cable = `Pull cable ${run}`;
    // Both parked on the same Monday: only a dependency can separate them.
    await post('/projects/schedules', {
      projectId: project.id,
      tasks: [
        { wbsNodeId: await node(`1.${run}`, `Containment ${run}`), name: containment, plannedStart: '2026-03-09', plannedEnd: '2026-03-20', durationWorkingDays: 4 },
        { wbsNodeId: await node(`2.${run}`, `Cabling ${run}`), name: cable, plannedStart: '2026-03-09', plannedEnd: '2026-03-20', durationWorkingDays: 2 },
      ],
    });
    const plan = await planOf(request, project.id);
    const firstId = plan.tasks.find((task) => task.name === containment)!.id;
    const secondId = plan.tasks.find((task) => task.name === cable)!.id;

    await page.goto(`/projects/schedule?projectId=${project.id}`, { waitUntil: 'domcontentloaded' });

    // ── Nothing waits for anything yet ────────────────────────────────────────
    // Two activities on the same day is not evidence that either waits for the other.
    await expect(page.getByTestId(`waits-for-${secondId}`)).toHaveCount(0);

    // ── The planner says the cable waits for the containment ──────────────────
    await page.getByRole('button', { name: `Edit plan for ${cable}` }).click();
    const editor = page.getByTestId(`predecessors-${secondId}`).locator('select');
    await expect(editor).toBeVisible();
    await editor.selectOption([firstId]);

    // The write first, so a failure here localises to the server rather than to the repaint.
    await expect.poll(async () => (await planOf(request, project.id)).dependencies.length, { timeout: 15_000 }).toBe(1);
    expect((await planOf(request, project.id)).dependencies).toEqual([
      expect.objectContaining({ predecessorTaskId: firstId, successorTaskId: secondId }),
    ]);
    await expect(page.getByTestId(`waits-for-${secondId}`)).toHaveText(`Waits for ${containment}`);

    // ── A loop is refused in words that name it ───────────────────────────────
    // Sent through the API because the editor cannot express it in one step — which is the point:
    // the WHOLE network is judged at once, so no sequence of individually-legal edits reaches a
    // loop by stealth.
    const loop = await request.post(`${API}/projects/schedules/${project.id}/dependencies`, {
      headers,
      data: {
        edges: [
          { predecessorTaskId: firstId, successorTaskId: secondId },
          { predecessorTaskId: secondId, successorTaskId: firstId },
        ],
      },
    });
    expect(loop.status()).toBe(400);
    expect(await loop.text()).toMatch(/cycle/i);
    // Nothing was written: a refused save is not a partial save.
    expect((await planOf(request, project.id)).dependencies).toHaveLength(1);

    // ── And the dates follow the network ──────────────────────────────────────
    const { run: planningRun } = await post<{ run: { id: string } }>(`/projects/schedules/${project.id}/planning-runs`, {});
    await post(`/projects/planning-runs/${planningRun.id}/accept`, {});
    const after = await planOf(request, project.id);
    // Four working days from Monday 9th: Mon, Tue, Wed, Thu — Fri/Sat are the weekend here, so the
    // successor starts on Sunday the 15th rather than on the Friday.
    expect(after.tasks.find((task) => task.id === firstId)!.plannedStart).toBe('2026-03-09');
    expect(after.tasks.find((task) => task.id === secondId)!.plannedStart).toBe('2026-03-15');
  });
});
