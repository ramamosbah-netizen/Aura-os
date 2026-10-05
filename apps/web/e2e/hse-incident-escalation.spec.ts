// AURA OS — QHS-06: an incident is reported where the work is, escalates on the project, and is closed
// by HSE on a stated cause. Auth ON, PostgreSQL, the shipped roles.
//
//   report     the Site Engineer reports a MAJOR incident on the HSE screen; it reads back with who
//              reported it after a reload
//   refused    the Site Engineer, who reports incidents, may not investigate or close one (403)
//   escalate   while it is open, the project's cross-domain health is Critical, in HSE's own words,
//              for the Project Manager — HSE owns what an incident means; Project 360 only reports it
//   close      HSE investigates and closes it on a root cause, on screen; the register then says who
//              investigated, who closed it and on what cause, and the project is no longer Critical
//              for HSE
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

test('a major incident is reported on site, escalates on the project, and HSE closes it on a cause', async ({ browser, baseURL, request }) => {
  test.setTimeout(360_000);
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  test.skip(!memberPassword(), 'needs a password to sign the roles in');
  const unavailable = await provisionedActorsUnavailable(request);
  test.skip(unavailable !== null, unavailable ?? '');
  const run = Date.now().toString().slice(-6);
  const tokenOf = async (username: string) => {
    const res = await request.post(`${API}/auth/login`, { data: { username, password: memberPassword() } });
    expect(res.ok(), `${username} login`).toBe(true);
    return { 'content-type': 'application/json', Authorization: `Bearer ${((await res.json()) as { token: string }).token}` };
  };
  const projectRes = await request.post(`${API}/projects/projects`, { headers: { 'content-type': 'application/json', ...apiAuthHeaders() }, data: { title: `QHS-06 ${run}` } });
  expect(projectRes.ok(), await projectRes.text()).toBe(true);
  const project = (await projectRes.json()) as { id: string; title: string };
  const description = `Ladder slipped at riser 3, operative treated at clinic ${run}`;

  const site = await seat(browser, baseURL!, 'u-e2e-site');
  const hse = await seat(browser, baseURL!, 'u-e2e-hse');
  const pm = await seat(browser, baseURL!, 'u-e2e-pm');
  try {
    // ── THE SITE ENGINEER REPORTS IT, ON SCREEN ───────────────────────────────────────────────────
    await site.goto(`/hse/control?project=${project.id}`, { waitUntil: 'domcontentloaded' });
    await expect(async () => {
      await site.getByTestId('create-incident').click({ timeout: 3_000 });
      await expect(site.getByTestId('drawer-incident')).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 60_000 });
    const drawer = site.getByTestId('drawer-incident');
    await drawer.getByTestId('field-projectId').selectOption(project.id);
    await drawer.getByTestId('field-severity').selectOption('major');
    await drawer.getByTestId('field-locationDetail').fill('Tower B, riser 3');
    await drawer.getByTestId('field-description').fill(description);
    await drawer.getByTestId('submit-incident').click();
    await expect(drawer).toBeHidden({ timeout: 30_000 });

    const listed = async () => (await (await request.get(`${API}/hse/incidents?projectId=${project.id}`, { headers: apiAuthHeaders() })).json()) as Array<{ id: string; description: string; createdBy: string | null; status: string }>;
    await expect.poll(async () => (await listed()).filter((i) => i.description === description).length, { timeout: 30_000 }).toBe(1);
    const incident = (await listed()).find((i) => i.description === description)!;
    expect(incident.createdBy, 'the report names who made it').toBe('u-e2e-site');

    await site.reload({ waitUntil: 'domcontentloaded' });
    await expect(site.getByTestId(`incident-status-${incident.id}`)).toHaveText('reported', { timeout: 60_000 });
    await expect(site.getByTestId(`incident-record-${incident.id}`)).toContainText('Reported by u-e2e-site');

    // ── THE REPORTER MAY NOT INVESTIGATE OR CLOSE IT ──────────────────────────────────────────────
    const siteHeaders = await tokenOf('u-e2e-site');
    expect((await request.put(`${API}/hse/incidents/${incident.id}/investigate`, { headers: siteHeaders, data: {} })).status()).toBe(403);
    expect((await request.put(`${API}/hse/incidents/${incident.id}/close`, { headers: siteHeaders, data: { rootCause: 'self-closed' } })).status()).toBe(403);

    // ── IT ESCALATES ON THE PROJECT, IN HSE'S WORDS, FOR THE PROJECT MANAGER ──────────────────────
    await pm.goto(`/project/${project.id}/controls`, { waitUntil: 'domcontentloaded' });
    const health = pm.getByTestId('cross-domain-health');
    await expect(health).toContainText('Critical', { timeout: 60_000 });
    await expect(health).toContainText('major incident');
    await expect(health).toContainText('hse');

    // ── HSE INVESTIGATES AND CLOSES IT ON A CAUSE, ON SCREEN ──────────────────────────────────────
    await hse.goto(`/hse/control?project=${project.id}`, { waitUntil: 'domcontentloaded' });
    await expect(hse.getByTestId(`incident-close-${incident.id}`)).toBeVisible({ timeout: 60_000 });
    hse.on('dialog', (dialog) => void dialog.accept('Ladder not footed; no second operative assigned'));
    await expect(async () => {
      await hse.getByTestId(`incident-close-${incident.id}`).click({ timeout: 3_000 });
      await expect(hse.getByTestId(`incident-status-${incident.id}`)).toHaveText('closed', { timeout: 10_000 });
    }).toPass({ timeout: 60_000 });
    await hse.reload({ waitUntil: 'domcontentloaded' });
    const record = hse.getByTestId(`incident-record-${incident.id}`);
    await expect(record).toContainText('Reported by u-e2e-site', { timeout: 60_000 });
    await expect(record).toContainText('Investigated by u-e2e-hse');
    await expect(record).toContainText('Closed by u-e2e-hse');
    await expect(record).toContainText('cause: Ladder not footed; no second operative assigned');

    // ── THE ESCALATION CLEARS WITH IT ─────────────────────────────────────────────────────────────
    await pm.reload({ waitUntil: 'domcontentloaded' });
    await expect(pm.getByTestId('cross-domain-health')).toBeVisible({ timeout: 60_000 });
    await expect(pm.getByTestId('cross-domain-health')).not.toContainText('major incident');
  } finally {
    await site.context().close();
    await hse.context().close();
    await pm.context().close();
  }
});
