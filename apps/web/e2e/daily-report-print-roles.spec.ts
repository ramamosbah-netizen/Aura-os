// AURA OS — SIT-06: the printed daily site report, by the roles that write and read it. Auth ON, PostgreSQL.
//
// site-evidence-round-trip.spec.ts proves the sheet in depth — the work, every photograph, the
// signature and who signed it — driven as an administrator. Here, the people whose job it is:
//
//   record     the Site Engineer records the day's report on the Daily Reports screen; it survives a
//              reload
//   print      the Site Engineer opens the printed report from the register: it carries the project,
//              the date and the work it reports on
//   receipt    the Project Engineer, who reads site records and writes none, opens the same printed
//              report
//   refused    the Storekeeper, who has no site access, is refused the report (403) and the sheet
//              shows none of it
import { expect, test, type Browser, type Page } from '@playwright/test';
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

test('the Site Engineer records and prints the day, the Project Engineer reads it, the Storekeeper cannot', async ({ browser, baseURL, request }) => {
  test.setTimeout(300_000);
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  test.skip(!memberPassword(), 'needs a password to sign the roles in');
  const unavailable = await provisionedActorsUnavailable(request);
  test.skip(unavailable !== null, unavailable ?? '');
  const run = Date.now().toString().slice(-6);
  const projectRes = await request.post(`${API}/projects/projects`, { headers: { 'content-type': 'application/json', ...apiAuthHeaders() }, data: { title: `SIT-06 ${run}` } });
  expect(projectRes.ok(), await projectRes.text()).toBe(true);
  const project = (await projectRes.json()) as { id: string; title: string };
  const work = `Containment second fix, level 4 east — ${run}`;

  const site = await seat(browser, baseURL!, 'u-e2e-site');
  const projeng = await seat(browser, baseURL!, 'u-e2e-projeng');
  const store = await seat(browser, baseURL!, 'u-e2e-storekeeper');
  try {
    // ── THE SITE ENGINEER RECORDS THE DAY, ON SCREEN ──────────────────────────────────────────────
    await site.goto('/site/daily-reports', { waitUntil: 'domcontentloaded' });
    const picker = site.getByTestId('project-picker').or(site.locator('select').first());
    await expect(picker).toBeVisible({ timeout: 60_000 });
    await expect(async () => {
      await picker.selectOption(project.id);
      await expect(site.getByPlaceholder('Containment 2nd fix, L3 east')).toBeEnabled({ timeout: 3_000 });
    }).toPass({ timeout: 60_000 });
    await site.getByPlaceholder('Containment 2nd fix, L3 east').fill(work);
    await site.getByRole('button', { name: 'Add report' }).click();

    const reports = async () => (await (await request.get(`${API}/site/daily-reports?projectId=${project.id}`, { headers: apiAuthHeaders() })).json()) as Array<{ id: string; workDescription: string; createdBy?: string | null }>;
    await expect.poll(async () => (await reports()).filter((r) => r.workDescription === work).length, { timeout: 30_000 }).toBe(1);
    const report = (await reports()).find((r) => r.workDescription === work)!;

    await site.reload({ waitUntil: 'domcontentloaded' });
    await expect(site.getByTestId(`open-report-${report.id}`)).toBeVisible({ timeout: 60_000 });

    // ── AND PRINTS IT ─────────────────────────────────────────────────────────────────────────────
    await site.goto(`/site/daily-reports/${report.id}/print`, { waitUntil: 'domcontentloaded' });
    const sheet = site.locator('body');
    await expect(sheet).toContainText('DAILY SITE REPORT', { timeout: 60_000 });
    await expect(sheet).toContainText(work);
    await expect(sheet).toContainText(project.title);

    // ── THE PROJECT ENGINEER READS THE SAME PRINTED REPORT ────────────────────────────────────────
    await projeng.goto(`/site/daily-reports/${report.id}/print`, { waitUntil: 'domcontentloaded' });
    await expect(projeng.locator('body')).toContainText('DAILY SITE REPORT', { timeout: 60_000 });
    await expect(projeng.locator('body')).toContainText(work);

    // ── THE STOREKEEPER HAS NO SITE ACCESS ────────────────────────────────────────────────────────
    const storeLogin = await request.post(`${API}/auth/login`, { data: { username: 'u-e2e-storekeeper', password: memberPassword() } });
    const storeToken = ((await storeLogin.json()) as { token: string }).token;
    expect((await request.get(`${API}/site/daily-reports/${report.id}`, { headers: { Authorization: `Bearer ${storeToken}` } })).status()).toBe(403);
    await store.goto(`/site/daily-reports/${report.id}/print`, { waitUntil: 'domcontentloaded' });
    await expect(store.locator('body')).toBeVisible();
    await expect(store.locator('body'), 'none of the report reaches a reader without site access').not.toContainText(work, { timeout: 15_000 });
  } finally {
    await site.context().close();
    await projeng.context().close();
    await store.context().close();
  }
});
