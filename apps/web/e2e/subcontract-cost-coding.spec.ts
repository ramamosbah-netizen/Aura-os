// AURA OS — COST-CODE-01, the subcontract slice: a subcontract is charged to a cost line where it is
// raised, its commitment reaches the Cost Ledger on that line when it is awarded, an uncoded one is
// said to be uncoded, and another project's line is refused. Auth ON, PostgreSQL.
//
// The subcontract form had no cost line, so a subcontract raised on screen never committed anything
// to the ledger — its award and every certified claim were invisible to the project's books — and the
// API took any cost line it was sent, so one of another project would have carried the commitment
// onto that project's books.
import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

async function get<T>(request: APIRequestContext, path: string): Promise<T> {
  const res = await request.get(`${API}${path}`, { headers: apiAuthHeaders() });
  expect(res.ok(), `${path} — ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()) as T;
}

interface LedgerRow { source: string; type: string; amount: number; cbsNodeId: string | null }

test('a subcontract is charged to its cost line on screen, commits on award, and another project\'s line is refused', async ({ page, request }) => {
  test.setTimeout(300_000);
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  const run = Date.now().toString().slice(-6);
  const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };
  const post = async <T>(path: string, data: unknown): Promise<T> => {
    const res = await request.post(`${API}${path}`, { headers, data });
    expect(res.ok(), `${path} — ${await res.text()}`).toBe(true);
    return res.json() as Promise<T>;
  };

  const project = await post<{ id: string; title: string }>('/projects/projects', { title: `Tower B fit-out ${run}` });
  const other = await post<{ id: string }>('/projects/projects', { title: `Other job ${run}` });
  const line = await post<{ id: string; code: string; title: string }>('/projects/cbs', { projectId: project.id, code: `S-${run}`, title: `Subcontract containment ${run}`, budgetAmount: 80_000 });
  const otherLine = await post<{ id: string }>('/projects/cbs', { projectId: other.id, code: `SO-${run}`, title: `Other subcontract ${run}`, budgetAmount: 80_000 });
  const committed = async () => (await get<LedgerRow[]>(request, `/projects/cost-ledger?projectId=${project.id}`)).filter((t) => t.source === 'subcontract' && t.type === 'committed');

  // ── RAISED ON SCREEN, IN THE PROJECT'S OWN CONTEXT ────────────────────────────────────────────────
  const raise = async (title: string, value: string, coded: boolean) => {
    await page.goto(`/subcontracts/subcontracts?projectId=${project.id}`, { waitUntil: 'domcontentloaded' });
    await expect(async () => {
      await page.getByTestId('create-subcontract').click();
      await expect(page.getByTestId('drawer-subcontract')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 60_000 });
    await page.getByTestId('field-title').fill(title);
    await page.getByTestId('field-subcontractorName').fill(`Gulf Containment ${run}`);
    await page.getByTestId('field-value').fill(value);
    const costLine = page.getByTestId('field-cbsNodeId');
    // The lines are the chosen project's own, and empty is said to be "not charged".
    await expect(costLine.locator('option').first()).toHaveText('Not charged to a cost line', { timeout: 30_000 });
    if (coded) {
      await expect(costLine.locator(`option[value="${line.id}"]`)).toHaveCount(1, { timeout: 30_000 });
      await costLine.selectOption(line.id);
    }
    await page.getByTestId('submit-subcontract').click();
    const row = page.getByRole('row').filter({ hasText: title });
    await expect(row).toBeVisible({ timeout: 30_000 });
    return row;
  };

  const codedRow = await raise(`Containment L1-L10 ${run}`, '50000', true);
  await expect(codedRow).toContainText('charged to a cost line');
  const uncodedRow = await raise(`Fire stopping ${run}`, '12000', false);
  await expect(uncodedRow).toContainText('not charged (uncoded)');
  expect(await committed(), 'a draft commits nothing').toHaveLength(0);

  // ── AWARDED ON SCREEN → THE COMMITMENT IS ON THE LINE ─────────────────────────────────────────────
  for (const row of [codedRow, uncodedRow]) {
    await row.getByRole('button', { name: 'Activate' }).click();
    await expect(row).toContainText('active', { timeout: 30_000 });
  }
  await expect.poll(async () => (await committed()).length, { timeout: 30_000 }).toBe(1);
  expect((await committed()).map((t) => [t.amount, t.cbsNodeId]), 'only the coded subcontract commits, on its line').toEqual([[50000, line.id]]);
  await expect.poll(async () => (await get<Array<{ id: string; committedAmount: number }>>(request, `/projects/cbs?projectId=${project.id}`)).find((c) => c.id === line.id)?.committedAmount, { timeout: 30_000 }).toBe(50000);

  // ── ANOTHER PROJECT'S COST LINE IS REFUSED ────────────────────────────────────────────────────────
  const crossed = await request.post(`${API}/subcontracts`, {
    headers, data: { projectId: project.id, title: `Crossed ${run}`, subcontractorName: 'X', value: 1000, cbsNodeId: otherLine.id },
  });
  expect(crossed.status(), await crossed.text()).toBe(400);
  expect(String((await crossed.json()).message)).toContain('does not belong to project');
});
