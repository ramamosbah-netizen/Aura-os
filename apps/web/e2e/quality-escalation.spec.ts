// AURA OS — TC-08 (part b): Quality RECEIVES what T&C escalates, and DECIDES it.
//
// The programme owner's decision of 2026-09-25, through the shipped screens: the T&C engineer
// (u-e2e-tc) escalates two commissioning defects; both land in QA/QC's queue as Quality's own records;
// the QA/QC engineer (u-e2e-qaqc) raises a non-conformance from one — the NCR is Quality's, raised in
// Quality's register and carrying the failing run — and records that the other is not one, with a
// reason. T&C sees both outcomes on its defects. Refused along the way: T&C deciding, a viewer reading
// the queue, a second decision, an NCR reference typed by T&C, and the escalator deciding their own ask.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';
import { provisionedActorsUnavailable } from './provisioned-actors';
import { signInAs } from './project-member-harness';
import { bearer, tokenFor } from './approved-checklist';

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const V1 = `${API}/api/v1`;
const CX = `${V1}/commissioning/records`;
const TC = process.env.E2E_TC_USERNAME ?? 'u-e2e-tc';
const QAQC = process.env.E2E_QAQC_USERNAME ?? 'u-e2e-qaqc';
const VIEWER = process.env.E2E_VIEWER_USERNAME ?? 'u-e2e-viewer';
const H = () => apiAuthHeaders();

async function openAs(browser: Browser, baseURL: string, username: string): Promise<Page> {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  expect(await signInAs(page, baseURL, username), `sign-in as ${username} must complete`).toBe(true);
  return page;
}

type Row = { id: string; sourceId: string; status: string; ncrNumber: string | null };

test('T&C escalates; the escalation lands in QA/QC\'s queue; Quality raises one NCR and declines one; T&C sees both', async ({ browser, page, baseURL }) => {
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  const unavailable = await provisionedActorsUnavailable(page.request);
  test.skip(unavailable !== null, unavailable ?? '');
  test.setTimeout(240_000);

  const run = Date.now().toString().slice(-6);
  const projectId = await createProject(page.request, `TC-08 escalation ${run}`, baseURL);
  for (const [userId, roleId] of [[TC, 'r-commissioning-engineer'], [QAQC, 'r-qa-qc']] as const) {
    const m = await page.request.post(`${V1}/projects/${projectId}/members`, { headers: H(), data: { userId, roleId } });
    expect([200, 201, 409].includes(m.status()), `putting ${userId} on the project: ${await m.text()}`).toBe(true);
  }
  const tcApi = bearer(await tokenFor(page.request, TC));
  const qaApi = bearer(await tokenFor(page.request, QAQC));

  // A system with a failing point, and two defects: one raised from the failure, one from a walk-round.
  const code = `CX-ES-${run}`;
  const reg = await page.request.post(CX, { headers: tcApi, data: { projectId, code, title: 'CCTV — Level 2', system: 'cctv' } });
  const recordId = ((await reg.json()) as { id: string }).id;
  const point = (await (await page.request.post(`${CX}/${recordId}/test-items`, { headers: tcApi, data: { pointNo: 'IMG-04', description: 'Camera image' } })).json()) as { id: string };
  await page.request.post(`${CX}/${recordId}/test-items/${point.id}/runs`, { headers: tcApi, data: { result: 'fail', actual: 'No image', remarks: 'Cable fault at the camera end' } });
  const d1 = (await (await page.request.post(`${CX}/${recordId}/punch`, { headers: tcApi, data: { description: 'Camera 4 cable fault', severity: 'major', testItemId: point.id } })).json()) as { id: string };
  const d2 = (await (await page.request.post(`${CX}/${recordId}/punch`, { headers: tcApi, data: { description: 'Camera housing scuffed', severity: 'minor' } })).json()) as { id: string };

  // NEGATIVE — an NCR reference typed by T&C is refused: the NCR is Quality's to raise.
  const typed = await page.request.put(`${CX}/${recordId}/punch/${d1.id}/escalate`, { headers: tcApi, data: { qualityNcrId: 'NCR-TYPED' } });
  expect(typed.status()).toBe(400);
  expect(await typed.text()).toMatch(/must come from Quality's decision/);

  // ── T&C escalates both, on screen ────────────────────────────────────────────────────────────
  const tc = await openAs(browser, baseURL!, TC);
  await tc.goto(`/commissioning?project=${projectId}&section=defects`, { waitUntil: 'domcontentloaded' });
  for (const d of [d1, d2]) {
    await tc.getByTestId(`escalate-${d.id}`).click();
    await expect(tc.getByTestId(`escalated-${d.id}`)).toContainText('With Quality — awaiting its decision', { timeout: 30_000 });
  }

  // ── They land in QA/QC's queue, as Quality's records ─────────────────────────────────────────
  const queue = (await (await page.request.get(`${V1}/quality/escalations?projectId=${projectId}`, { headers: qaApi })).json()) as Row[];
  const e1 = queue.find((e) => e.sourceId === d1.id)!;
  const e2 = queue.find((e) => e.sourceId === d2.id)!;
  expect([e1?.status, e2?.status]).toEqual(['pending', 'pending']);

  // NEGATIVE — T&C does not decide; a viewer does not even read the queue.
  const tcDecides = await page.request.post(`${V1}/quality/escalations/${e1.id}/decline`, { headers: tcApi, data: { reason: 'x' } });
  expect(tcDecides.status(), 'T&C does not decide what it asked').toBe(403);
  const viewerReads = await page.request.get(`${V1}/quality/escalations?projectId=${projectId}`, { headers: bearer(await tokenFor(page.request, VIEWER)) });
  expect(viewerReads.status(), 'a viewer does not read the queue').toBe(403);

  // ── QA/QC decides both, on screen ────────────────────────────────────────────────────────────
  const qa = await openAs(browser, baseURL!, QAQC);
  await qa.goto(`/quality/escalations?project=${projectId}`, { waitUntil: 'domcontentloaded' });
  await expect(qa.getByTestId(`esc-${e1.id}`)).toContainText('Failing test point IMG-04, run 1: No image — Cable fault at the camera end');
  const ncrNumber = `NCR-ES-${run}`;
  await qa.getByTestId(`esc-ncr-number-${e1.id}`).fill(ncrNumber);
  await qa.getByTestId(`esc-raise-${e1.id}`).click();
  await expect(qa.getByTestId(`esc-outcome-${e1.id}`)).toContainText(`NCR ${ncrNumber} raised by ${QAQC}`, { timeout: 30_000 });
  await qa.getByTestId(`esc-reason-${e2.id}`).fill('Cosmetic — a snag for handover, not a non-conformance');
  await qa.getByTestId(`esc-decline-${e2.id}`).click();
  await expect(qa.getByTestId(`esc-outcome-${e2.id}`)).toContainText('Not a non-conformance — Cosmetic', { timeout: 30_000 });

  // The NCR is Quality's, in Quality's register, carrying the defect and its failing run.
  const ncrs = (await (await page.request.get(`${V1}/quality/ncrs?projectId=${projectId}`, { headers: qaApi })).json()) as Array<{ ncrNumber: string; description: string; raisedBy: string | null }>;
  const ncr = ncrs.find((n) => n.ncrNumber === ncrNumber);
  expect(ncr, 'the NCR is in Quality\'s register').toBeTruthy();
  expect(ncr!.description).toContain(`Escalated by Testing & Commissioning (${code})`);
  expect(ncr!.description).toContain('Failing test point IMG-04, run 1');
  expect(ncr!.raisedBy).toBe(QAQC);

  // NEGATIVE — a decision is final.
  const again = await page.request.post(`${V1}/quality/escalations/${e2.id}/raise-ncr`, { headers: qaApi, data: { ncrNumber: `NCR-X-${run}` } });
  expect(again.status()).toBe(409);
  expect(await again.text()).toMatch(/only a pending escalation can be decided/);

  // ── T&C sees Quality's outcomes on its defects ───────────────────────────────────────────────
  await tc.reload({ waitUntil: 'domcontentloaded' });
  await expect(tc.getByTestId(`escalated-${d1.id}`)).toContainText(`Quality raised ${ncrNumber}`);
  await expect(tc.getByTestId(`escalated-${d2.id}`)).toContainText('Quality: not a non-conformance — Cosmetic');

  // NEGATIVE — whoever escalated may not decide it, even holding both grants (the administrator).
  const d3 = (await (await page.request.post(`${CX}/${recordId}/punch`, { headers: H(), data: { description: 'Admin-escalated', severity: 'minor' } })).json()) as { id: string };
  expect((await page.request.put(`${CX}/${recordId}/punch/${d3.id}/escalate`, { headers: H(), data: {} })).ok()).toBe(true);
  const e3 = ((await (await page.request.get(`${V1}/quality/escalations?projectId=${projectId}`, { headers: qaApi })).json()) as Row[]).find((e) => e.sourceId === d3.id)!;
  const selfDecides = await page.request.post(`${V1}/quality/escalations/${e3.id}/decline`, { headers: H(), data: { reason: 'x' } });
  expect(selfDecides.status(), 'the escalator may not decide their own ask').toBe(403);
  expect(await selfDecides.text()).toMatch(/may not decide it/);
});
