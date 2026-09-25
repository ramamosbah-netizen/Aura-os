// AURA OS — TC-08 (part c): the defect and corrective-action register, as a document.
//
// Two defects, each carried through its governed path by the shipped people who own each act (the
// screens for those acts are proven in defect-corrective-action.spec.ts and quality-escalation.spec.ts):
//
//   D1 — failing point → routed by T&C to the engineer → corrected by the engineer → retested → closed by T&C
//   D2 — escalated by T&C → Quality raises an NCR from it
//
// The register document is then read by the people it is for — T&C, QA/QC and the engineer — and
// printed from the same records: evidence, routing, correction, retest, closure and Quality's decision.
// A viewer without a commissioning grant is refused it.
import zlib, { inflateSync } from 'node:zlib';
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
const ENG = process.env.E2E_ENG_USERNAME ?? 'u-e2e-eng';
const QAQC = process.env.E2E_QAQC_USERNAME ?? 'u-e2e-qaqc';
const VIEWER = process.env.E2E_VIEWER_USERNAME ?? 'u-e2e-viewer';
const H = () => apiAuthHeaders();

/** The text a compressed PDF actually carries, stream by stream (literal parentheses arrive escaped). */
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
  // WinAnsi, the standard fonts' encoding: its dashes and quotes sit where latin1 has control codes.
  return parts.join('\n').replace(/\\([()])/g, '$1')
    .replace(/\x97/g, '\u2014').replace(/\x96/g, '\u2013').replace(/\x92/g, '\u2019');
}

async function openAs(browser: Browser, baseURL: string, username: string): Promise<Page> {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  expect(await signInAs(page, baseURL, username), `sign-in as ${username} must complete`).toBe(true);
  return page;
}

test('the register prints each defect\'s evidence, routing, correction, retest, closure and Quality decision — for the people it is for', async ({ browser, page, baseURL }) => {
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  const unavailable = await provisionedActorsUnavailable(page.request);
  test.skip(unavailable !== null, unavailable ?? '');
  test.setTimeout(240_000);

  const run = Date.now().toString().slice(-6);
  const projectId = await createProject(page.request, `TC-08 register ${run}`, baseURL);
  for (const [userId, roleId] of [[TC, 'r-commissioning-engineer'], [ENG, 'r-technical-engineer'], [QAQC, 'r-qa-qc']] as const) {
    const m = await page.request.post(`${V1}/projects/${projectId}/members`, { headers: H(), data: { userId, roleId } });
    expect([200, 201, 409].includes(m.status()), `putting ${userId} on the project: ${await m.text()}`).toBe(true);
  }
  const tcApi = bearer(await tokenFor(page.request, TC));
  const engApi = bearer(await tokenFor(page.request, ENG));
  const qaApi = bearer(await tokenFor(page.request, QAQC));
  const ok = async (res: import('@playwright/test').APIResponse, act: string) => {
    expect(res.ok(), `${act} — ${res.status()} ${await res.text()}`).toBe(true);
    return res.json();
  };

  const code = `CX-RG-${run}`;
  const rec = await ok(await page.request.post(CX, { headers: tcApi, data: { projectId, code, title: 'CCTV — Car park', system: 'cctv' } }), 'registering the system');
  const point = await ok(await page.request.post(`${CX}/${rec.id}/test-items`, { headers: tcApi, data: { pointNo: 'IMG-07', description: 'Night image' } }), 'the test point');
  await ok(await page.request.post(`${CX}/${rec.id}/test-items/${point.id}/runs`, { headers: tcApi, data: { result: 'fail', actual: 'No image beyond 12 m', remarks: 'IR range too short' } }), 'the failing run');

  // D1 — routed, corrected, retested, closed.
  const d1 = await ok(await page.request.post(`${CX}/${rec.id}/punch`, { headers: tcApi, data: { description: 'IR illuminators under-specified', severity: 'major', testItemId: point.id } }), 'D1');
  await ok(await page.request.post(`${CX}/${rec.id}/punch/${d1.id}/route-to-engineering`, { headers: tcApi, data: { assigneeId: ENG, reason: 'Night-time IR range needs a design change' } }), 'routing D1');
  await ok(await page.request.post(`${CX}/${rec.id}/punch/${d1.id}/corrective-action`, { headers: engApi, data: { action: 'IR illuminators upgraded to 50 m', reference: 'DWG-CCTV-007 rev B' } }), 'correcting D1');
  await ok(await page.request.post(`${CX}/${rec.id}/test-items/${point.id}/runs`, { headers: tcApi, data: { result: 'pass', actual: 'Identifiable at 35 m' } }), 'the retest');
  await ok(await page.request.put(`${CX}/${rec.id}/punch/${d1.id}/close`, { headers: tcApi, data: { resolution: 'Upgraded and retested' } }), 'closing D1');

  // D2 — escalated; Quality raises an NCR from it.
  const d2 = await ok(await page.request.post(`${CX}/${rec.id}/punch`, { headers: tcApi, data: { description: 'Cable containment unsupported', severity: 'major' } }), 'D2');
  await ok(await page.request.put(`${CX}/${rec.id}/punch/${d2.id}/escalate`, { headers: tcApi, data: {} }), 'escalating D2');
  const queue = (await ok(await page.request.get(`${V1}/quality/escalations?projectId=${projectId}`, { headers: qaApi }), 'the queue')) as Array<{ id: string; sourceId: string }>;
  const ncrNumber = `NCR-RG-${run}`;
  await ok(await page.request.post(`${V1}/quality/escalations/${queue.find((e) => e.sourceId === d2.id)!.id}/raise-ncr`, { headers: qaApi, data: { ncrNumber } }), 'raising the NCR');

  // ── T&C: the link is on the Defects section, and the document says what happened ──────────
  const tc = await openAs(browser, baseURL!, TC);
  await tc.goto(`/commissioning?project=${projectId}&section=defects`, { waitUntil: 'domcontentloaded' });
  await expect(tc.getByTestId('defect-register-pdf')).toBeVisible({ timeout: 30_000 });
  const doc = await tc.request.get(`/api/commissioning/records/defect-register.pdf?projectId=${projectId}`);
  expect(doc.status()).toBe(200);
  expect(doc.headers()['content-type']).toContain('application/pdf');
  const printed = pdfText(await doc.body());
  for (const expected of [
    'DEFECT AND CORRECTIVE-ACTION REGISTER',
    `${code} — IR illuminators under-specified`,
    'test point IMG-07, run 1 failed: No image beyond 12 m — IR range too short',
    `to ${ENG} by ${TC}`, 'Night-time IR range needs a design change',
    'IR illuminators upgraded to 50 m (DWG-CCTV-007 rev B) — by u-e2e-eng',
    'IMG-07 latest result PASS after 2 runs',
    `closed by ${TC}`, 'Upgraded and retested',
    `${code} — Cable containment unsupported`,
    `escalated — Quality raised ${ncrNumber} (${QAQC})`,
    '2 defects, 1 open',
  ]) expect(printed, `the register must print: ${expected}`).toContain(expected);

  // ── The people it is for read the same document; a viewer does not ─────────────────────────
  for (const who of [QAQC, ENG]) {
    const reader = await openAs(browser, baseURL!, who);
    const res = await reader.request.get(`/api/commissioning/records/defect-register.pdf?projectId=${projectId}`);
    expect(res.status(), `${who} reads the register`).toBe(200);
    expect(pdfText(await res.body())).toContain(`escalated — Quality raised ${ncrNumber}`);
  }
  const viewer = await openAs(browser, baseURL!, VIEWER);
  expect((await viewer.request.get(`/api/commissioning/records/defect-register.pdf?projectId=${projectId}`)).status(), 'a viewer is refused the register').toBe(403);
});
