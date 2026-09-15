import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * PLN-03 — which calendar these dates were counted under, in the browser, with auth on.
 *
 * The solver has counted working days since Step 8 and chose the calendar by GUESSING: the
 * tenant's calendars ordered by name, take the first. For a company running Dubai and Riyadh crews
 * that silently plans a Saudi job through a UAE Friday, and no screen said which calendar produced
 * the dates — which is what made it invisible rather than merely wrong.
 *
 * So the plan screen now says it: the calendar is named in the plan header, chosen there, and each
 * activity says what its window holds in WORKING days and how much float is in it. A project that
 * names no calendar says THAT, rather than having one picked on its behalf.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

interface Plan {
  tasks: Array<{ id: string; name: string }>;
  calendar: { calendarId: string | null; calendarName: string | null; everyDayWorked: boolean };
}

const planOf = async (request: APIRequestContext, projectId: string): Promise<Plan> => {
  const response = await request.get(`${API}/projects/schedules?projectId=${projectId}`, { headers: apiAuthHeaders() });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as Plan[])[0];
};

test.describe('The calendar a plan is counted under', () => {
  test.setTimeout(180_000);

  test('names it on the plan, counts the window in working days, and never picks one for you', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };

    const post = async <T>(path: string, data: unknown): Promise<T> => {
      const response = await request.post(`${API}${path}`, { headers, data });
      expect(response.ok(), `${path} — ${await response.text()}`).toBe(true);
      return response.json() as Promise<T>;
    };

    // TWO calendars in the tenant, which is the whole point: with two there is no defensible guess,
    // and "Gulf week" sorts first, so the old code would have chosen it for every project silently.
    await post('/admin/calendar', { name: `Gulf week ${run}`, weekends: [5, 6], standardHoursPerDay: 8 });
    await post('/admin/calendar', { name: `KSA week ${run}`, weekends: [4, 5], standardHoursPerDay: 8 });

    const project = await post<{ id: string }>('/projects/projects', { title: `Calendar job ${run}`, reference: `CAL-${run}` });
    const node = await post<{ id: string }>('/projects/wbs', {
      projectId: project.id, code: `1.${run}`, title: `Riser containment ${run}`, plannedValue: 10_000,
    });
    // Monday 2026-03-09 to Friday 2026-03-20: twelve calendar days with two weekends inside.
    const activityName = `Install riser ${run}`;
    await post('/projects/schedules', {
      projectId: project.id,
      tasks: [{ wbsNodeId: node.id, name: activityName, plannedStart: '2026-03-09', plannedEnd: '2026-03-20', durationWorkingDays: 6 }],
    });
    const taskId = (await planOf(request, project.id)).tasks.find((task) => task.name === activityName)!.id;

    await page.goto(`/projects/schedule?projectId=${project.id}`, { waitUntil: 'domcontentloaded' });
    // By the plan's own test id: the accessible name falls back to the project id when the plan
    // carries no project name, which is exactly the case for a plan saved without one.
    const picker = page.getByTestId(`working-calendar-${project.id}`).locator('select');

    // ── Nobody has named one ──────────────────────────────────────────────────
    // Said plainly on the screen, with two calendars sitting in the dropdown unchosen.
    await expect(picker).toHaveValue('');
    await expect(page.getByTestId(`window-${taskId}`)).toHaveText('Window holds 12 working days · 6 days float');

    // ── The planner names the Gulf week ───────────────────────────────────────
    await picker.selectOption({ label: `Gulf week ${run}` });
    // Fri/Sat off: three of them fall inside the window, so nine working days and three float.
    await expect(page.getByTestId(`window-${taskId}`)).toHaveText('Window holds 9 working days · 3 days float');

    // ── The very same dates, under a different calendar ───────────────────────
    await picker.selectOption({ label: `KSA week ${run}` });
    // Thu/Fri off: a different set of days, a different answer over an identical window. This is
    // the number the old guess could get wrong with nobody able to see that it had.
    await expect(page.getByTestId(`window-${taskId}`)).toHaveText('Window holds 8 working days · 2 days float');
    expect((await planOf(request, project.id)).calendar.calendarName).toBe(`KSA week ${run}`);

    // ── Work that cannot fit the window is refused where the planner can see it ─
    const refused = await request.post(`${API}/projects/schedules`, {
      headers,
      data: {
        projectId: project.id,
        tasks: [{ id: taskId, name: activityName, plannedStart: '2026-03-09', plannedEnd: '2026-03-20', durationWorkingDays: 11 }],
      },
    });
    expect(refused.status()).toBe(400);
    expect(await refused.text()).toContain('cannot fit a window that holds 8');

    // ── And clearing it returns the plan to counting every day ────────────────
    await picker.selectOption({ label: 'No calendar · every day counted' });
    await expect(page.getByTestId(`window-${taskId}`)).toHaveText('Window holds 12 working days · 6 days float');
    expect((await planOf(request, project.id)).calendar).toMatchObject({ calendarId: null, everyDayWorked: true });
  });
});
