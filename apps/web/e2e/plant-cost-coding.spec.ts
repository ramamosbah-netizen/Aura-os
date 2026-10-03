// AURA OS — COST-CODE-01, the plant slice: plant is logged on the Site screen, charged to a cost
// line and the work package it served, and reaches the Cost Ledger with both. Auth ON, PostgreSQL.
//
// Plant usage had an API and no screen at all, and recorded no work package even through the API —
// so a project run through the screens recorded no plant, and every plant hour posted through the
// API read as cost no activity could claim. Labour and plant also took any cost line they were sent:
// one of another project would post this project's cost onto that project's books.
//
//   coded      10 h × 120 logged on screen to a cost line and a package → 1,200 actual on that line
//              with that package; the cost line, the work package and the planning screen read it
//   uncoded    plant logged with no cost line posts nothing and reads "Not charged (uncoded)"
//   refused    plant or labour naming another project's cost line is refused, and posts nothing
import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

async function get<T>(request: APIRequestContext, path: string): Promise<T> {
  const res = await request.get(`${API}${path}`, { headers: apiAuthHeaders() });
  expect(res.ok(), `${path} — ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()) as T;
}

interface LedgerRow { source: string; type: string; amount: number; cbsNodeId: string | null; wbsNodeId: string | null }

test('plant is logged on screen to a cost line and its package, reaches the ledger with both, and another project\'s line is refused', async ({ page, request }) => {
  test.setTimeout(300_000);
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  const run = Date.now().toString().slice(-6);
  const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };
  const post = async <T>(path: string, data: unknown): Promise<T> => {
    const res = await request.post(`${API}${path}`, { headers, data });
    expect(res.ok(), `${path} — ${await res.text()}`).toBe(true);
    return res.json() as Promise<T>;
  };

  const project = await post<{ id: string; title: string }>('/projects/projects', { title: `Riser works ${run}` });
  const other = await post<{ id: string }>('/projects/projects', { title: `Other job ${run}` });
  const line = await post<{ id: string; code: string; title: string }>('/projects/cbs', { projectId: project.id, code: `P-${run}`, title: `Plant hire ${run}`, budgetAmount: 20_000 });
  const otherLine = await post<{ id: string }>('/projects/cbs', { projectId: other.id, code: `PO-${run}`, title: `Other plant ${run}`, budgetAmount: 20_000 });
  const pkg = await post<{ id: string; code: string; title: string }>('/projects/wbs', { projectId: project.id, code: `R-${run}`, title: `Riser 2 containment ${run}`, plannedValue: 8_000 });
  const taskName = `Install riser 2 ${run}`;
  await post('/projects/schedules', { projectId: project.id, tasks: [{ wbsNodeId: pkg.id, name: taskName, plannedStart: '2026-10-01', plannedEnd: '2026-10-25', percentComplete: 0 }] });

  const plantLedger = async () => (await get<LedgerRow[]>(request, `/projects/cost-ledger?projectId=${project.id}`)).filter((t) => t.source === 'plant_usage' && t.type === 'actual');

  // ── ON THE SITE SCREEN, SCOPED TO THE PROJECT ─────────────────────────────────────────────────────
  const logPlant = async (equipment: string, hours: string, rate: string, coded: boolean) => {
    await page.goto(`/site/control?project=${project.id}&section=plant-usage`, { waitUntil: 'domcontentloaded' });
    await expect(async () => {
      await page.getByTestId('create-plant-usage').click();
      await expect(page.getByTestId('drawer-plant-usage')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 60_000 });
    await page.getByTestId('field-date').fill('2026-10-05');
    await page.getByTestId('field-equipment').fill(equipment);
    await page.getByTestId('field-hours').fill(hours);
    await page.getByTestId('field-rate').fill(rate);
    if (coded) {
      await page.getByTestId('field-cbsNodeId').selectOption(line.id);
      await page.getByTestId('field-wbsNodeId').selectOption(pkg.id);
    }
    await page.getByTestId('submit-plant-usage').click();
    await expect(page.getByRole('row').filter({ hasText: equipment })).toBeVisible({ timeout: 30_000 });
    return page.getByRole('row').filter({ hasText: equipment });
  };

  const codedRow = await logPlant(`Scissor lift ${run}`, '10', '120', true);
  await expect(codedRow).toContainText('1,200');
  await expect(codedRow).toContainText(`${line.code} · ${line.title}`);
  await expect(codedRow).toContainText(`${pkg.code} · ${pkg.title}`);

  const uncodedRow = await logPlant(`Generator ${run}`, '6', '50', false);
  await expect(uncodedRow).toContainText('Not charged (uncoded)');
  await expect(uncodedRow).toContainText('Unattributed');

  // ── THE LEDGER HOLDS THE CODED PLANT ONLY, WITH ITS LINE AND PACKAGE ─────────────────────────────
  await expect.poll(async () => (await plantLedger()).length, { timeout: 30_000 }).toBe(1);
  expect((await plantLedger()).map((t) => [t.amount, t.cbsNodeId, t.wbsNodeId])).toEqual([[1200, line.id, pkg.id]]);
  await expect.poll(async () => (await get<Array<{ id: string; actualAmount: number }>>(request, `/projects/cbs?projectId=${project.id}`)).find((c) => c.id === line.id)?.actualAmount, { timeout: 30_000 }).toBe(1200);
  expect((await get<{ actualCost: number }>(request, `/projects/wbs/${pkg.id}`)).actualCost, 'the work package').toBe(1200);
  const schedule = (await get<Array<{ projectId: string; tasks: Array<{ id: string; name: string }> }>>(request, `/projects/schedules?projectId=${project.id}`)).find((s) => s.projectId === project.id)!;
  const task = schedule.tasks.find((t) => t.name === taskName)!;
  await page.goto(`/projects/schedule?projectId=${project.id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId(`package-cost-${task.id}`)).toContainText('Package cost · 1,200 actual (1 posting)', { timeout: 60_000 });

  // ── ANOTHER PROJECT'S COST LINE IS REFUSED — FOR PLANT AND FOR LABOUR ───────────────────────────
  const plant = await request.post(`${API}/site/plant`, { headers, data: { projectId: project.id, date: '2026-10-06', equipment: `Crane ${run}`, hours: 2, rate: 500, cbsNodeId: otherLine.id } });
  expect(plant.status(), await plant.text()).toBe(400);
  expect(String((await plant.json()).message)).toContain('does not belong to project');
  const labour = await request.post(`${API}/site/labour`, { headers, data: { projectId: project.id, date: '2026-10-06', trade: `Fitter ${run}`, headcount: 2, hours: 8, costRate: 40, cbsNodeId: otherLine.id } });
  expect(labour.status(), await labour.text()).toBe(400);
  expect((await get<Array<{ id: string; actualAmount: number }>>(request, `/projects/cbs?projectId=${other.id}`)).find((c) => c.id === otherLine.id)?.actualAmount, 'nothing landed on the other project').toBe(0);
  expect(await plantLedger()).toHaveLength(1);
});
