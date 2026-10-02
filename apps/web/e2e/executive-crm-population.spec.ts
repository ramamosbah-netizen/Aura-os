// AURA OS — F-06 / MGT-01: the executive pipeline read says what it counted, opens every figure to
// exactly the deals behind it, and tells a role that may not read it so.
//
// The read used to aggregate the newest 5,000 opportunities with nothing on screen to say so, no way
// to see which deals a figure stood for, and a role without the permission watched "Loading the
// executive read…" forever. Past-the-cap reconciliation is proved against PostgreSQL in
// apps/api/test/executive-crm-population.pg.e2e-spec.ts (6,483 rows, every figure held against SQL).
//
// Proved here, Auth ON against PostgreSQL:
//   reachable   u-e2e-salesmgr (r-sales-manager) gets there by clicking — launcher → Sales &
//               Commercial → Analytics
//   population  the page states how many decided deals it counted, of how many on record, and that
//               every one was read — the same numbers the API read gives
//   drill       a loss reason, a competitor and the no-account coverage each open to their exact deals
//               (this run's are among them at their values), with the figure's own count; a deal
//               opens on its own page
//   authority   a Sales rep is told their role does not include the read — not left loading
import { expect, test, type Browser, type Page } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { memberPassword, signInAs } from './project-member-harness';
import { provisionedActorsUnavailable } from './provisioned-actors';

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const RUN = Date.now().toString().slice(-6);

async function seat(browser: Browser, baseURL: string, username: string): Promise<Page> {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  expect(await signInAs(page, baseURL, username), `${username} could not sign in`).toBe(true);
  return page;
}

const number = (text: string, pattern: RegExp): number => Number((pattern.exec(text)?.[1] ?? 'NaN').replace(/,/g, ''));

test('a sales manager reads the executive pipeline with its population and opens each figure to its deals; a sales rep is told', async ({ browser, baseURL, request }) => {
  test.setTimeout(240_000);
  test.skip(!apiAuthHeaders().Authorization, 'auth is off — there is no role to prove the read for');
  test.skip(!memberPassword(), 'needs a password to sign the actors in');
  const unavailable = await provisionedActorsUnavailable(request);
  test.skip(unavailable !== null, unavailable ?? '');
  const H = { 'content-type': 'application/json', ...apiAuthHeaders() };

  // Facts only this run owns: four losses for one reason against one rival, one of them account-less.
  const reason = `Spec price ${RUN}`;
  const rival = `Rival ${RUN}`;
  const account = await request.post(`${API}/crm/accounts`, { headers: H, data: { name: `F06 Partners ${RUN}` } });
  expect(account.ok(), await account.text()).toBe(true);
  const accountId = ((await account.json()) as { id: string }).id;
  const ids: string[] = [];
  for (const [value, withAccount] of [[1_111, true], [2_222, true], [3_333, true], [4_444, false]] as const) {
    const created = await request.post(`${API}/crm/opportunities`, {
      headers: H,
      data: { title: `F06 loss ${RUN} ${value}`, value, executionType: 'direct_sale', ...(withAccount ? { accountId } : {}) },
    });
    expect(created.ok(), await created.text()).toBe(true);
    const id = ((await created.json()) as { id: string }).id;
    const lost = await request.patch(`${API}/crm/opportunities/${id}`, { headers: H, data: { stage: 'lost', lossReason: reason, competitors: `${rival}, Someone ${RUN}` } });
    expect(lost.ok(), await lost.text()).toBe(true);
    ids.push(id);
  }
  const read = await request.get(`${API}/crm/executive?days=365`, { headers: H });
  expect(read.ok(), await read.text()).toBe(true);
  const exec = (await read.json()) as {
    population: { decidedOnRecord: number; counted: number; complete: boolean };
    coverage: { decidedWithoutAccount: number };
  };
  expect(exec.population.complete).toBe(true);

  const manager = await seat(browser, baseURL!, 'u-e2e-salesmgr');
  try {
    // The ordinary path, by clicking.
    await manager.goto('/suites', { waitUntil: 'domcontentloaded' });
    await manager.getByTestId('suite-launcher').getByRole('link', { name: /^Sales & Commercial/ }).click();
    await expect(manager.getByTestId('suite-home')).toBeVisible({ timeout: 60_000 });
    await manager.getByTestId('suite-home').getByRole('link', { name: /Analytics\s*Performance, sources/ }).click();
    await expect(manager).toHaveURL(/\/crm\/analytics/, { timeout: 60_000 });

    // What it counted, said on the page — the API read's own numbers.
    const population = manager.getByTestId('exec-population');
    await expect(population).toContainText('Every one was read', { timeout: 60_000 });
    const stated = await population.innerText();
    expect(number(stated, /Counted ([\d,]+) decided/)).toBe(exec.population.counted);
    expect(number(stated, /of ([\d,]+) decided on record/)).toBe(exec.population.decidedOnRecord);

    // A loss reason opens to exactly its deals: this run's four, at their values, nothing else.
    const lossCard = manager.locator('section', { has: manager.getByText('Why we lose', { exact: true }) });
    const reasonRow = lossCard.getByRole('row', { name: new RegExp(reason) });
    await expect(reasonRow).toContainText('AED 11,110');
    await reasonRow.getByRole('button').click();
    const drill = manager.getByTestId('exec-drill');
    await expect(manager.getByTestId('exec-drill-title')).toContainText(`lost — “${reason}”`);
    await expect(manager.getByTestId('exec-drill-total')).toContainText('4 deals · AED 11,110', { timeout: 30_000 });
    await expect(drill.getByTestId('decision-records-count')).toHaveText('4 records');
    for (const id of ids) await expect(drill.getByTestId(`decision-record-${id}`)).toBeVisible();
    await expect(drill.getByTestId(`decision-record-${ids[3]}`)).toContainText(`against ${rival}, Someone ${RUN}`);
    await manager.getByTestId('exec-drill-close').click();
    await expect(drill).toHaveCount(0);

    // A competitor opens to the losses it was named on.
    const rivals = manager.locator('section', { has: manager.getByText('Named on deals we lost', { exact: true }) });
    await rivals.getByRole('row', { name: new RegExp(rival) }).getByRole('button').click();
    await expect(manager.getByTestId('exec-drill-total')).toContainText('4 deals · AED 11,110', { timeout: 30_000 });

    // The coverage note's account-less deals open too, with the count the note gave.
    await manager.getByTestId('exec-drill-no-account').click();
    const noAccount = exec.coverage.decidedWithoutAccount;
    await expect(manager.getByTestId('exec-drill-total')).toContainText(`${noAccount} ${noAccount === 1 ? 'deal' : 'deals'}`, { timeout: 30_000 });
    await drill.getByTestId('decision-records-find').fill(`F06 loss ${RUN}`);
    await expect(drill.getByTestId('decision-records-count')).toHaveText(`1 of ${noAccount} records match`);
    await expect(drill.getByTestId(`decision-record-${ids[3]}`)).toBeVisible();

    // And a deal opens on its own page.
    await drill.getByTestId(`decision-record-${ids[3]}`).getByRole('link').click();
    await expect(manager).toHaveURL(new RegExp(`/crm/opportunities/${ids[3]}`), { timeout: 60_000 });
    await expect(manager.getByText(`F06 loss ${RUN} 4444`).first()).toBeVisible({ timeout: 60_000 });
  } finally {
    await manager.context().close();
  }

  // A role without the read is told so — not shown a read that never finishes loading.
  const rep = await seat(browser, baseURL!, 'u-e2e-sales');
  try {
    await rep.goto('/crm/analytics?view=performance', { waitUntil: 'domcontentloaded' });
    await expect(rep.getByTestId('exec-refused')).toHaveText('Your role does not include the executive read of won and lost deals.', { timeout: 60_000 });
    await expect(rep.getByTestId('exec-population')).toHaveCount(0);
  } finally {
    await rep.context().close();
  }
});
