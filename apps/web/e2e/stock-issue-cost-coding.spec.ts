// AURA OS — COST-CODE-01, the stock-issue slice: material issued to a job on the stock screen is
// charged to a cost line there, reaches the Cost Ledger with its work package, and a charge to
// another project's cost line is refused. Auth ON, PostgreSQL.
//
// The project-issue bar sent project, BOQ item and work package but no cost line, and the material
// cost strand posts only a coded movement — so material issued through the screen reached the job
// and never its books. And the server accepted ANY cost line on a movement: one coded to project A
// naming a line of project B was recorded against A and posted onto B's books.
//
//   coded     the Storekeeper issues 20 m on screen to a package and a cost line; the ledger holds
//             100.00 actual (20 × 5.00) on that line with that package; the cost line, the work
//             package and the planning screen all read 100
//   uncoded   4 m issued with "not charged to a cost line" posts nothing to the ledger, and the
//             item's history says it was not charged — visible, not missing
//   refused   a movement on project A naming project B's cost line is refused, and posts nothing
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { memberPassword, signInAs } from './project-member-harness';
import { provisionedActorsUnavailable } from './provisioned-actors';

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

async function seat(browser: Browser, baseURL: string, username: string): Promise<Page> {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  expect(await signInAs(page, baseURL, username), `${username} could not sign in`).toBe(true);
  return page;
}

async function get<T>(request: APIRequestContext, path: string): Promise<T> {
  const res = await request.get(`${API}${path}`, { headers: apiAuthHeaders() });
  expect(res.ok(), `${path} — ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()) as T;
}

interface LedgerRow { source: string; type: string; amount: number; cbsNodeId: string | null; wbsNodeId: string | null }

test('a stock issue is charged to its cost line on screen, reaches the ledger with its package, and another project\'s line is refused', async ({ browser, baseURL, page, request }) => {
  test.setTimeout(300_000);
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  test.skip(!memberPassword(), 'needs a password to sign the storekeeper in');
  const unavailable = await provisionedActorsUnavailable(request);
  test.skip(unavailable !== null, unavailable ?? '');
  const run = Date.now().toString().slice(-6);
  const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };
  const post = async <T>(path: string, data: unknown): Promise<T> => {
    const res = await request.post(`${API}${path}`, { headers, data });
    expect(res.ok(), `${path} — ${await res.text()}`).toBe(true);
    return res.json() as Promise<T>;
  };

  // ── Two projects, each with its own cost line; project A has a package and a measured BOQ item ──
  const projectA = await post<{ id: string; title: string }>('/projects/projects', { title: `Cable pull ${run}` });
  const projectB = await post<{ id: string; title: string }>('/projects/projects', { title: `Other job ${run}` });
  const lineA = await post<{ id: string; code: string }>('/projects/cbs', { projectId: projectA.id, code: `M-${run}`, title: `Cabling material ${run}`, budgetAmount: 10_000 });
  const lineB = await post<{ id: string; code: string }>('/projects/cbs', { projectId: projectB.id, code: `MB-${run}`, title: `Other job material ${run}`, budgetAmount: 10_000 });
  const pkg = await post<{ id: string; code: string; title: string }>('/projects/wbs', { projectId: projectA.id, code: `W-${run}`, title: `Level 1 containment ${run}`, plannedValue: 5_000 });
  const boqItemId = `BOQ-${run}`;
  await post('/projects/quantity-ledger/baseline', { projectId: projectA.id, boqItemId, quantity: 100, unit: 'm' });
  const code = `CBL-${run}`;
  const item = await post<{ id: string }>('/inventory/stock', { code, name: '2.5mm² cable', unit: 'm', openingQty: 100, openingCost: 5 });
  const taskName = `Pull cable L1 ${run}`;
  await post('/projects/schedules', { projectId: projectA.id, tasks: [{ wbsNodeId: pkg.id, name: taskName, plannedStart: '2026-10-01', plannedEnd: '2026-10-20', percentComplete: 0 }] });

  const ledger = async () => (await get<LedgerRow[]>(request, `/projects/cost-ledger?projectId=${projectA.id}`)).filter((t) => t.type === 'actual' && t.source.startsWith('material'));

  // ── ON SCREEN, BY THE STOREKEEPER ──────────────────────────────────────────────────────────────
  const store = await seat(browser, baseURL!, 'u-e2e-storekeeper');
  try {
    await store.goto('/inventory/stock', { waitUntil: 'domcontentloaded' });
    await expect(async () => {
      await store.getByRole('row').filter({ hasText: code }).first().click();
      await expect(store.getByTestId('issue-project')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 60_000 });

    await store.getByTestId('issue-project').selectOption({ label: projectA.title });
    await store.getByTestId('issue-boq-item').selectOption(boqItemId);
    await store.getByTestId('issue-work-package').selectOption(pkg.id);
    // Until a line is chosen, the screen says the issue would not reach the books.
    await expect(store.getByTestId('issue-cost-coding')).toContainText('Not charged to a cost line');
    await store.getByTestId('issue-cost-line').selectOption(lineA.id);
    await expect(store.getByTestId('issue-cost-coding')).toContainText(`Charged to ${lineA.code}`);
    await store.getByTestId('issue-quantity').fill('20');
    await store.getByTestId('issue-out').click();
    await expect(store.getByTestId('issue-position')).toContainText('20 m currently issued', { timeout: 30_000 });

    // The same item, 4 m more, deliberately NOT charged.
    await store.getByTestId('issue-cost-line').selectOption('');
    await expect(store.getByTestId('issue-cost-coding')).toContainText('reported as uncoded');
    await store.getByTestId('issue-quantity').fill('4');
    await store.getByTestId('issue-out').click();
    await expect(store.getByTestId('issue-position')).toContainText('24 m currently issued', { timeout: 30_000 });
  } finally {
    await store.context().close();
  }

  // ── THE LEDGER HOLDS THE CODED ISSUE ONLY, WITH ITS LINE AND PACKAGE ─────────────────────────────
  await expect.poll(async () => (await ledger()).length, { timeout: 30_000 }).toBe(1);
  expect((await ledger()).map((t) => [t.amount, t.cbsNodeId, t.wbsNodeId]), '20 m × 5.00 on the chosen line and package').toEqual([[100, lineA.id, pkg.id]]);

  // ── AND EVERY VIEW OF IT READS THE SAME 100 ──────────────────────────────────────────────────────
  await expect.poll(async () => (await get<Array<{ id: string; actualAmount: number }>>(request, `/projects/cbs?projectId=${projectA.id}`)).find((c) => c.id === lineA.id)?.actualAmount, { timeout: 30_000 }).toBe(100);
  expect((await get<{ actualCost: number }>(request, `/projects/wbs/${pkg.id}`)).actualCost, 'the work package').toBe(100);
  const schedule = (await get<Array<{ projectId: string; tasks: Array<{ id: string; name: string }> }>>(request, `/projects/schedules?projectId=${projectA.id}`)).find((s) => s.projectId === projectA.id)!;
  const task = schedule.tasks.find((t) => t.name === taskName)!;
  await page.goto(`/projects/schedule?projectId=${projectA.id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId(`package-cost-${task.id}`)).toContainText('Package cost · 100 actual (1 posting)', { timeout: 60_000 });

  // ── THE UNCODED ISSUE IS VISIBLE AS UNCODED, IN THE ITEM'S OWN HISTORY ──────────────────────────
  const detail = await get<{ movements: Array<{ id: string; quantity: number; cbsNodeId: string | null; projectId: string | null }> }>(request, `/inventory/stock/${item.id}`);
  const uncoded = detail.movements.find((m) => m.quantity === 4 && m.projectId === projectA.id)!;
  expect(uncoded.cbsNodeId).toBeNull();
  await page.goto('/inventory/stock', { waitUntil: 'domcontentloaded' });
  await expect(async () => {
    await page.getByRole('row').filter({ hasText: code }).first().click();
    await expect(page.getByTestId(`movement-costing-${uncoded.id}`)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  await expect(page.getByTestId(`movement-costing-${uncoded.id}`)).toHaveText('not charged (uncoded)');

  // ── ANOTHER PROJECT'S COST LINE IS REFUSED, AND POSTS NOTHING ───────────────────────────────────
  const storeLogin = await request.post(`${API}/auth/login`, { data: { username: 'u-e2e-storekeeper', password: memberPassword() } });
  const storeToken = ((await storeLogin.json()) as { token: string }).token;
  const crossed = await request.post(`${API}/inventory/stock/${item.id}/movements`, {
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${storeToken}` },
    data: { direction: 'out', quantity: 3, projectId: projectA.id, boqItemId, cbsNodeId: lineB.id },
  });
  expect(crossed.status(), await crossed.text()).toBe(400);
  expect(String((await crossed.json()).message)).toContain('is not a cost line of this movement’s project');
  expect((await get<Array<{ id: string; actualAmount: number }>>(request, `/projects/cbs?projectId=${projectB.id}`)).find((c) => c.id === lineB.id)?.actualAmount, 'nothing landed on the other project').toBe(0);
  expect(await ledger()).toHaveLength(1);
});
