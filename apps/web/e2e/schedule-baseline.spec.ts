import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * PLN-05 — committing a baseline, and what it costs to replace one, in the browser with auth on.
 *
 * A baseline is what every variance figure on a project is measured against: a delay's assessed
 * impact, what a recovery recovered, an SPI. It was overwritten silently — no record of who, no
 * reason, and the previous one gone. Accept a recovery, re-baseline, and the delay that recovery
 * was answering is suddenly measured against the dates the recovery produced.
 *
 * So the screen now says which revision the programme is on, replacing one is asked for in words
 * first, and the replaced baseline is kept — which is what makes superseding an addition rather
 * than a destruction.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

interface Plan {
  baselineSetAt: string | null;
  baselineSetBy: string | null;
  baselineRevision: number | null;
  tasks: Array<{ id: string; name: string; plannedStart: string; plannedEnd: string; baselineStart: string | null; baselineEnd: string | null }>;
}
interface Baseline { revision: number; setBy: string | null; reason: string | null; tasks: Array<{ start: string; end: string }> }

const planOf = async (request: APIRequestContext, projectId: string): Promise<Plan> => {
  const response = await request.get(`${API}/projects/schedules?projectId=${projectId}`, { headers: apiAuthHeaders() });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as Plan[])[0];
};

test.describe('Committing a baseline, and replacing one', () => {
  test.setTimeout(240_000);

  test('locks it against a name, keeps it through an edit, and charges a reason to replace it', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };
    const post = async <T>(path: string, data: unknown): Promise<T> => {
      const response = await request.post(`${API}${path}`, { headers, data });
      expect(response.ok(), `${path} — ${await response.text()}`).toBe(true);
      return response.json() as Promise<T>;
    };

    const project = await post<{ id: string }>('/projects/projects', { title: `Baseline job ${run}`, reference: `BSL-${run}` });
    const node = await post<{ id: string }>('/projects/wbs', {
      projectId: project.id, code: `1.${run}`, title: `Containment ${run}`, plannedValue: 10_000,
    });
    const activity = `Containment ${run}`;
    await post('/projects/schedules', {
      projectId: project.id,
      tasks: [{ wbsNodeId: node.id, name: activity, plannedStart: '2026-03-09', plannedEnd: '2026-03-12' }],
    });

    await page.goto(`/projects/schedule?projectId=${project.id}`, { waitUntil: 'domcontentloaded' });
    const state = page.getByTestId(`baseline-state-${project.id}`);
    const commit = page.getByTestId(`set-baseline-${project.id}`);

    // ── Nothing committed yet ─────────────────────────────────────────────────
    await expect(state).toHaveText('Draft plan');
    await expect(commit).toHaveText('Set baseline');

    // ── Committed, and the revision is on screen ──────────────────────────────
    await commit.click();
    await expect(state).toHaveText('Baseline r0 locked');
    await expect(commit).toHaveText('Replace baseline');
    const locked = await planOf(request, project.id);
    expect(locked.baselineRevision).toBe(0);
    expect(locked.baselineSetBy).toBeTruthy();
    expect(locked.tasks[0]).toMatchObject({ baselineStart: '2026-03-09', baselineEnd: '2026-03-12' });

    // ── A later edit retains it, which is the point of having one ─────────────
    await post('/projects/schedules', {
      projectId: project.id,
      tasks: locked.tasks.map((task) => ({ id: task.id, name: task.name, plannedStart: '2026-03-16', plannedEnd: '2026-03-19' })),
    });
    const slipped = await planOf(request, project.id);
    expect(slipped.tasks[0]).toMatchObject({
      plannedStart: '2026-03-16', baselineStart: '2026-03-09', baselineEnd: '2026-03-12',
    });

    // ── Replacing it is asked for in words, and declining changes nothing ─────
    await page.reload({ waitUntil: 'domcontentloaded' });
    // One handler for the whole test, told what to do next: two `once` handlers race the reload
    // that follows an accepted prompt.
    let answer: string | null = null;
    const asked: string[] = [];
    page.on('dialog', (dialog) => {
      asked.push(dialog.message());
      void (answer === null ? dialog.dismiss() : dialog.accept(answer));
    });

    await page.getByTestId(`set-baseline-${project.id}`).click();
    await expect(page.getByTestId(`baseline-state-${project.id}`)).toHaveText('Baseline r0 locked');
    expect(asked[0]).toContain('revision 0');
    expect((await planOf(request, project.id)).baselineRevision).toBe(0);

    // ── Given a reason, it adds a revision rather than destroying one ─────────
    answer = 'recovery accepted after the storm';
    const posted = page.waitForResponse((response) =>
      response.url().includes(`/schedules/${project.id}/baseline`) && response.request().method() === 'POST');
    await page.getByTestId(`set-baseline-${project.id}`).click();
    const response = await posted;
    expect(response.status(), await response.text()).toBe(201);
    await expect
      .poll(async () => (await planOf(request, project.id)).baselineRevision, { timeout: 15_000 })
      .toBe(1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId(`baseline-state-${project.id}`)).toHaveText('Baseline r1 locked');

    const history = (await request.get(`${API}/projects/schedules/${project.id}/baselines`, { headers: apiAuthHeaders() })
      .then((response) => response.json())) as Baseline[];
    expect(history.map((entry) => entry.revision)).toEqual([1, 0]);
    expect(history[0].reason).toBe('recovery accepted after the storm');
    // THE POINT: revision 0 still says what was originally committed to, so a variance against the
    // original stays computable after the re-baseline that answered for it.
    expect(history[1]).toMatchObject({ reason: null });
    expect(history[1].tasks[0]).toMatchObject({ start: '2026-03-09', end: '2026-03-12' });
  });
});
