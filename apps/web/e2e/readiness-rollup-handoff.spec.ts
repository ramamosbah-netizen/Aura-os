// AURA OS — TC-11: the readiness rollup names the checklist gate, prints as a document, and is what
// Handover reads.
//
// One CCTV system whose other gates are satisfied in their own domains (device installed, drawing
// approved), so the approved checklist is the ONLY thing between it and COMMISSIONING READY:
//
//   the T&C engineer sees the checklist gate by name, BLOCKED, in the real browser — then READY once
//     the system is bound to Quality's approved revision and signed off;
//   the rollup downloads as a PDF printed from the same read, naming the gate and the revision;
//   Handover/FM, downstream, reads the same blocker in the handover's own readiness, and sees it clear;
//   a viewer without a commissioning grant is refused the checklist coverage and the document.
import zlib, { inflateSync } from 'node:zlib';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';
import { provisionedActorsUnavailable } from './provisioned-actors';
import { signInAs } from './project-member-harness';
import { approvedChecklist, bearer, tokenFor } from './approved-checklist';

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const V1 = `${API}/api/v1`;
const CX = `${V1}/commissioning/records`;
const TC = process.env.E2E_TC_USERNAME ?? 'u-e2e-tc';
const FM = process.env.E2E_FM_USERNAME ?? 'u-e2e-fm';
const VIEWER = process.env.E2E_VIEWER_USERNAME ?? 'u-e2e-viewer';
const H = () => apiAuthHeaders();

/** The text a compressed PDF actually carries, stream by stream. */
function pdfText(bytes: Buffer): string {
  const parts: string[] = [];
  let at = 0;
  for (;;) {
    const open = bytes.indexOf('stream', at);
    if (open < 0) break;
    let start = open + 'stream'.length;
    if (bytes[start] === 0x0d) start += 1;
    if (bytes[start] === 0x0a) start += 1;
    const close = bytes.indexOf('endstream', start);
    if (close < 0) break;
    const raw = bytes.subarray(start, close);
    try {
      parts.push(inflateSync(raw, { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString('latin1'));
    } catch {
      parts.push(raw.toString('latin1'));
    }
    at = close + 'endstream'.length;
  }
  return parts.join('\n');
}

async function openAs(browser: Browser, baseURL: string, username: string): Promise<Page> {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  expect(await signInAs(page, baseURL, username), `sign-in as ${username} must complete`).toBe(true);
  return page;
}

test('the rollup names the checklist gate, prints it, and Handover reads the same blocker until it clears', async ({ browser, page, baseURL }) => {
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  const unavailable = await provisionedActorsUnavailable(page.request);
  test.skip(unavailable !== null, unavailable ?? '');
  test.setTimeout(240_000);

  const run = Date.now().toString().slice(-6);
  const projectId = await createProject(page.request, `TC-11 rollup ${run}`, baseURL);
  for (const [userId, roleId] of [[TC, 'r-commissioning-engineer'], [FM, 'r-handover-fm']] as const) {
    const m = await page.request.post(`${V1}/projects/${projectId}/members`, { headers: H(), data: { userId, roleId } });
    expect([200, 201, 409].includes(m.status()), `putting ${userId} on the project: ${await m.text()}`).toBe(true);
  }
  const tcApi = bearer(await tokenFor(page.request, TC));

  // The system, registered unbound by the T&C engineer; the gates before the checklist satisfied in
  // the domains that own them, so the checklist is what the rollup has to name.
  const code = `CX-RR-${run}`;
  const reg = await page.request.post(CX, { headers: tcApi, data: { projectId, code, title: 'CCTV — Tower A', system: 'cctv' } });
  expect(reg.status(), `registering the system: ${await reg.text()}`).toBe(201);
  const system = (await reg.json()) as { id: string };
  const device = await (await page.request.post(`${V1}/elv/devices`, { headers: H(), data: { projectId, tag: `CAM-${run}`, system: 'cctv' } })).json();
  await page.request.put(`${V1}/elv/devices/${device.id}/status`, { headers: H(), data: { status: 'installed' } });
  const drawing = await (await page.request.post(`${V1}/engineering/drawings`, {
    headers: H(), data: { projectId, code: `DWG-RR-${run}`, title: 'CCTV layout', revision: '0', discipline: 'cctv' },
  })).json();
  for (const step of ['submit', 'start-review']) await page.request.post(`${V1}/engineering/drawings/${drawing.id}/${step}`, { headers: H(), data: {} });
  await page.request.post(`${V1}/engineering/drawings/${drawing.id}/review`, { headers: H(), data: { outcome: 'approved', comments: 'Approved' } });
  const pkg = await page.request.post(`${V1}/commissioning/handovers`, { headers: H(), data: { projectId, code: `HO-RR-${run}`, title: 'Tower A handover' } });
  expect(pkg.ok(), `the handover package: ${await pkg.text()}`).toBe(true);

  // ── BLOCKED, by name, in the real browser ────────────────────────────────────────────────────
  const tc = await openAs(browser, baseURL!, TC);
  await tc.goto(`/commissioning?project=${projectId}&section=readiness`, { waitUntil: 'domcontentloaded' });
  await tc.getByTestId(`readiness-open-${code}`).click();
  const gate = tc.getByTestId(`readiness-gate-${code}-checklist`);
  await expect(tc.getByTestId(`readiness-gate-${code}-checklist-state`)).toHaveText('BLOCKED');
  await expect(gate).toContainText('Approved checklist');
  await expect(gate).toContainText('Not bound to an approved ITP revision');
  await expect(gate).toContainText('Quality');

  // ── DOWNSTREAM: Handover reads the same blocker, in the rollup's own words ───────────────────
  const fm = await openAs(browser, baseURL!, FM);
  await fm.goto(`/handover?project=${projectId}`, { waitUntil: 'domcontentloaded' });
  await expect(fm.getByTestId('handover-item-commissioning-state')).toHaveText('BLOCKED', { timeout: 30_000 });
  await expect(fm.getByTestId('handover-item-commissioning')).toContainText(`${code}: Not bound to an approved ITP revision`);

  // ── PERMISSIONS: no commissioning grant, no coverage and no document ─────────────────────────
  const viewerApi = bearer(await tokenFor(page.request, VIEWER));
  const coverageAsViewer = await page.request.get(`${CX}/checklist-coverage?projectId=${projectId}`, { headers: viewerApi });
  expect(coverageAsViewer.status(), 'a viewer is refused the checklist coverage').toBe(403);
  const viewer = await openAs(browser, baseURL!, VIEWER);
  const pdfAsViewer = await viewer.request.get(`/api/commissioning/records/readiness-rollup.pdf?projectId=${projectId}`);
  expect(pdfAsViewer.status(), 'a viewer is refused the rollup document').toBe(403);

  // ── Quality approves the checklist; T&C binds, executes and signs off ────────────────────────
  const checklist = await approvedChecklist(page.request, projectId, 'cctv', [{ code: 'IMG-01', activity: 'Camera image', acceptanceCriteria: 'Image on VMS' }]);
  const bound = await page.request.post(`${CX}/${system.id}/checklist-binding`, { headers: tcApi, data: { itpId: checklist.itpId } });
  expect(bound.status(), `binding: ${await bound.text()}`).toBe(201);
  const [point] = (await (await page.request.get(`${CX}/${system.id}/test-items`, { headers: tcApi })).json()) as Array<{ id: string }>;
  await page.request.post(`${CX}/${system.id}/test-items/${point.id}/runs`, { headers: tcApi, data: { result: 'pass', actual: 'Image on VMS' } });
  const signed = await page.request.put(`${CX}/${system.id}/commission`, { headers: tcApi, data: { commissionedBy: 'A. Engineer', witnessedBy: 'R. Consultant' } });
  expect(signed.ok(), `sign-off: ${await signed.text()}`).toBe(true);

  // ── READY, by name ───────────────────────────────────────────────────────────────────────────
  await tc.reload({ waitUntil: 'domcontentloaded' });
  await tc.getByTestId(`readiness-open-${code}`).click();
  await expect(tc.getByTestId(`readiness-gate-${code}-checklist-state`)).toHaveText('READY');
  await expect(tc.getByTestId(`readiness-gate-${code}-checklist`)).toContainText(`Bound to ${checklist.reference}, revision ${checklist.revision}`);
  await expect(tc.getByTestId(`readiness-state-${code}`)).toHaveText('COMMISSIONING READY');

  // ── ACTUAL OUTPUT: the rollup as a document, printed from the same read ──────────────────────
  await expect(tc.getByTestId('readiness-rollup-pdf')).toBeVisible();
  const doc = await tc.request.get(`/api/commissioning/records/readiness-rollup.pdf?projectId=${projectId}`);
  expect(doc.status()).toBe(200);
  expect(doc.headers()['content-type']).toContain('application/pdf');
  const printed = pdfText(await doc.body());
  expect(printed).toContain('COMMISSIONING READINESS ROLLUP');
  expect(printed).toContain(`${code}`);
  expect(printed).toContain('Approved checklist');
  expect(printed).toContain(`tested against ${checklist.reference} rev ${checklist.revision}`);
  expect(printed).toContain('1 of 1 system COMMISSIONING READY');

  // ── DOWNSTREAM, after: Handover sees the chain satisfied, and Handover/FM holds the document ──
  await fm.reload({ waitUntil: 'domcontentloaded' });
  await expect(fm.getByTestId('handover-item-commissioning-state')).toHaveText('READY', { timeout: 30_000 });
  await expect(fm.getByTestId('handover-item-commissioning')).toContainText('pass the full commissioning readiness chain');
  const fmDoc = await fm.request.get(`/api/commissioning/records/readiness-rollup.pdf?projectId=${projectId}`);
  expect(fmDoc.status(), 'Handover/FM receives the rollup document').toBe(200);
  expect(pdfText(await fmDoc.body())).toContain(`tested against ${checklist.reference} rev ${checklist.revision}`);
});
