// AURA OS — TC-08 (part a): a defect that needs a design correction, routed to Engineering.
//
// The programme owner's decision of 2026-09-25, driven through the shipped screens by the people who do
// it: the T&C engineer (u-e2e-tc) raises the defect from a failing point and ROUTES it to the project's
// Design / Technical Engineer (u-e2e-eng); the engineer RECEIVES it in My Work, opens their corrections
// queue with the evidence it answers, and RECORDS the corrective action; the T&C engineer is refused
// closing it until the retest passes, and then closes it. Each authority is proven from the other side:
// T&C cannot record the correction, the engineer cannot close the defect or record a test run, and a
// person who is not on the project cannot be routed anything.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';
import { provisionedActorsUnavailable } from './provisioned-actors';
import { signInAs } from './project-member-harness';
import { bearer, systemFromChecklist, tokenFor } from './approved-checklist';

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const V1 = `${API}/api/v1`;
const CX = `${V1}/commissioning/records`;
const TC = process.env.E2E_TC_USERNAME ?? 'u-e2e-tc';
const ENG = process.env.E2E_ENG_USERNAME ?? 'u-e2e-eng';
const OUTSIDER = process.env.E2E_TECHMGR_USERNAME ?? 'u-e2e-techmgr';
const H = () => apiAuthHeaders();

async function openAs(browser: Browser, baseURL: string, username: string): Promise<Page> {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  expect(await signInAs(page, baseURL, username), `sign-in as ${username} must complete`).toBe(true);
  return page;
}

test('T&C routes a defect to Engineering; the engineer receives it and records the correction; T&C closes it only after the retest', async ({ browser, page, baseURL }) => {
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  const unavailable = await provisionedActorsUnavailable(page.request);
  test.skip(unavailable !== null, unavailable ?? '');
  test.setTimeout(240_000);

  const run = Date.now().toString().slice(-6);
  const projectId = await createProject(page.request, `TC-08 correction ${run}`, baseURL);
  for (const [userId, roleId] of [[TC, 'r-commissioning-engineer'], [ENG, 'r-technical-engineer']] as const) {
    const m = await page.request.post(`${V1}/projects/${projectId}/members`, { headers: H(), data: { userId, roleId } });
    expect([200, 201, 409].includes(m.status()), `putting ${userId} on the project: ${await m.text()}`).toBe(true);
  }
  const tcApi = bearer(await tokenFor(page.request, TC));
  const engApi = bearer(await tokenFor(page.request, ENG));

  // A CCTV system created from Quality's approved checklist; its one point fails at night.
  const code = `CX-CA-${run}`;
  const system = await systemFromChecklist(page.request, {
    projectId, code, title: 'CCTV — Car park', system: 'cctv',
    points: [{ code: 'IMG-01', activity: 'Camera image, day and night', acceptanceCriteria: 'Identifiable image at 30 m at night' }],
  }, tcApi);
  const point = system.point('IMG-01');
  await page.request.post(`${CX}/${system.id}/test-items/${point.id}/runs`, { headers: tcApi, data: { result: 'fail', actual: 'No image beyond 12 m at night', remarks: 'IR range too short' } });

  // ── T&C raises the defect from the failing point and routes it to the engineer, on screen ─────
  const tc = await openAs(browser, baseURL!, TC);
  await tc.goto(`/commissioning?project=${projectId}&section=defects`, { waitUntil: 'domcontentloaded' });
  await tc.getByTestId('raise-defect-IMG-01').click();
  await expect(tc.getByTestId('defect-raised-IMG-01')).toBeVisible({ timeout: 30_000 });
  const [defect] = (await (await page.request.get(`${CX}/${system.id}/punch`, { headers: tcApi })).json()) as Array<{ id: string; description: string }>;
  expect(defect, 'the defect exists').toBeTruthy();

  await tc.getByTestId(`route-defect-${defect.id}`).click();
  await expect(tc.getByTestId(`route-engineer-${defect.id}`)).toContainText('u-e2e-eng', { timeout: 30_000 });
  await tc.getByTestId(`route-engineer-${defect.id}`).selectOption(ENG);
  await tc.getByTestId(`route-reason-${defect.id}`).fill('Night-time IR range needs a design change');
  await tc.getByTestId(`route-save-${defect.id}`).click();
  await expect(tc.getByTestId(`defect-routing-${defect.id}`)).toContainText(`With Engineering: ${ENG}`, { timeout: 30_000 });
  await expect(tc.getByTestId(`defect-routing-${defect.id}`)).toContainText('awaiting the engineer');

  const routed = ((await (await page.request.get(`${CX}/${system.id}/punch`, { headers: tcApi })).json()) as Array<{ id: string; routingReceiptId: string | null; routedTo: string | null }>)
    .find((p) => p.id === defect.id)!;
  expect(routed).toMatchObject({ routedTo: ENG });
  expect(routed.routingReceiptId, 'the engineer was given a My Work receipt').toBeTruthy();

  // NEGATIVE — nobody outside the project can be routed anything.
  const second = await page.request.post(`${CX}/${system.id}/punch`, { headers: tcApi, data: { description: 'Pole height', severity: 'minor' } });
  const secondId = ((await second.json()) as { id: string }).id;
  const toOutsider = await page.request.post(`${CX}/${system.id}/punch/${secondId}/route-to-engineering`, { headers: tcApi, data: { assigneeId: OUTSIDER, reason: 'x' } });
  expect(toOutsider.status(), 'a person who is not on the project cannot be routed a defect').toBe(400);
  expect(await toOutsider.text()).toMatch(/must be a member of this project/);

  // ── The engineer receives it in My Work, and records the correction from their queue ──────────
  const eng = await openAs(browser, baseURL!, ENG);
  await eng.goto('/my-work/tasks', { waitUntil: 'domcontentloaded' });
  await expect(eng.locator(`[data-testid="work-item"][data-task-id="${routed.routingReceiptId}"]`))
    .toContainText(`Design correction: ${code}`, { timeout: 30_000 });

  await eng.goto(`/engineering/corrections?project=${projectId}`, { waitUntil: 'domcontentloaded' });
  const card = eng.getByTestId(`correction-${defect.id}`);
  await expect(card).toContainText('Night-time IR range needs a design change');
  await expect(eng.getByTestId(`correction-point-${defect.id}`)).toContainText('latest result fail');
  await eng.getByTestId(`correction-action-${defect.id}`).fill('IR illuminators upgraded to 50 m; pole-mounted units re-specified');
  await eng.getByTestId(`correction-reference-${defect.id}`).fill(`DWG-CCTV-004 rev C`);
  await eng.getByTestId(`correction-save-${defect.id}`).click();
  await expect(eng.getByTestId(`correction-recorded-${defect.id}`)).toContainText('IR illuminators upgraded to 50 m', { timeout: 30_000 });
  await expect(eng.getByTestId(`correction-recorded-${defect.id}`)).toContainText('awaiting T&C');

  // NEGATIVE — each authority stays with its owner.
  const tcCorrects = await page.request.post(`${CX}/${system.id}/punch/${defect.id}/corrective-action`, { headers: tcApi, data: { action: 'x' } });
  expect(tcCorrects.status(), 'T&C does not record the design correction').toBe(403);
  const engCloses = await page.request.put(`${CX}/${system.id}/punch/${defect.id}/close`, { headers: engApi, data: { resolution: 'x' } });
  expect(engCloses.status(), 'the engineer does not close the defect').toBe(403);
  const engTests = await page.request.post(`${CX}/${system.id}/test-items/${point.id}/runs`, { headers: engApi, data: { result: 'pass' } });
  expect(engTests.status(), 'the engineer does not record a test run').toBe(403);

  // ── T&C closes it only after the retest ──────────────────────────────────────────────────────
  await tc.reload({ waitUntil: 'domcontentloaded' });
  await expect(tc.getByTestId(`defect-correction-${defect.id}`)).toContainText('corrected by u-e2e-eng');
  await tc.getByTestId(`close-defect-${defect.id}`).click();
  await expect(tc.getByTestId('defect-error')).toContainText('retest of its test point has passed', { timeout: 30_000 });

  await page.request.post(`${CX}/${system.id}/test-items/${point.id}/runs`, { headers: tcApi, data: { result: 'pass', actual: 'Identifiable image at 35 m at night' } });
  await tc.reload({ waitUntil: 'domcontentloaded' });
  await tc.getByTestId(`close-defect-${defect.id}`).click();
  await expect(tc.getByTestId(`defect-${defect.id}`)).toHaveCount(0, { timeout: 30_000 });

  const closed = ((await (await page.request.get(`${CX}/${system.id}/punch`, { headers: tcApi })).json()) as Array<{ id: string; status: string; correctiveAction: string | null; correctedBy: string | null }>)
    .find((p) => p.id === defect.id)!;
  expect(closed).toMatchObject({ status: 'closed', correctedBy: ENG });

  // The engineer's queue says what became of it.
  await eng.reload({ waitUntil: 'domcontentloaded' });
  await expect(eng.getByTestId(`correction-${defect.id}`)).toContainText('closed by T&C');
});
