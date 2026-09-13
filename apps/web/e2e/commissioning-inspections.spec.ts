// AURA OS — TC-GATE-13: inspection requests finally count towards readiness.
//
// They contributed nothing for ten gates, recorded as F-G3-02 in every closure since TC-GATE-3. The
// reason was not an oversight: an IR's `discipline` was civil | mechanical | electrical | plumbing,
// and NONE of those could name an ELV system — on an ELV ERP. There was no value on an inspection
// request that could be matched to a commissioning record. TC-GATE-12 widened it to the canonical
// platform vocabulary; this proves what that unblocked.
import { expect, test } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const CX = `${API}/api/v1/commissioning/records`;
const QA = `${API}/api/v1/quality`;
const H = () => apiAuthHeaders();


/**
 * The readiness chain is TEN gates per system, so the cards are collapsed and the chain sits behind
 * a disclosure. The state tag stays on the closed card; the gates need opening. Deliberately not in
 * the URL — it is view state, not a filter — so a reload closes it and this is called again.
 */
const openGates = (page: import('@playwright/test').Page, code: string) =>
  page.getByTestId(`readiness-open-${code}`).click();

test('an open inspection blocks the system, and approving it clears the gate', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate13 Inspections', baseURL);
  const stamp = Date.now().toString().slice(-5);
  const code = `TC-G13-${stamp}`;
  const created = await page.request.post(CX, { headers: H(), data: { projectId, code, title: 'CCTV — Tower A', system: 'cctv' } });
  test.skip(created.status() === 502 || created.status() === 404 || !created.ok(), 'commissioning API not reachable');

  // ── Nothing raised: NOT_APPLICABLE, and it passes ───────────────────────────────────────────────
  // An unreadable Quality is "we asked and could not hear". A project that filed no inspection for
  // this trade has been heard perfectly well, and blocking on it would invent a requirement.
  await page.goto(`/commissioning?project=${projectId}&section=readiness`, { waitUntil: 'domcontentloaded' });
  await openGates(page, code);
  await expect(page.getByTestId(`readiness-gate-${code}-inspections-state`)).toHaveText('NOT APPLICABLE');
  await expect(page.getByTestId(`readiness-gate-${code}-inspections`)).toContainText(/none is owed/i);
  await expect(page.getByTestId(`readiness-gate-${code}-inspections`)).toContainText(/Quality/i);

  // ── Quality raises one against CCTV — a discipline that did not exist on an IR before ───────────
  const ir = await page.request.post(`${QA}/irs`, {
    headers: H(),
    data: {
      projectId,
      irNumber: `IR-${stamp}`,
      discipline: 'cctv',
      locationDetail: 'Level 3 riser — camera terminations',
      inspectionDate: new Date().toISOString().slice(0, 10),
    },
  });
  expect(ir.ok(), `an ELV discipline must be accepted on an IR — ${await ir.text()}`).toBe(true);
  const { id: irId } = await ir.json();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await openGates(page, code);
  await expect(page.getByTestId(`readiness-gate-${code}-inspections-state`)).toHaveText('BLOCKED');
  await expect(page.getByTestId(`readiness-gate-${code}-inspections`)).toContainText(`IR-${stamp}`);
  await expect(page.getByTestId(`readiness-gate-${code}-inspections`)).toContainText(/awaiting Quality/i);

  // ── Quality approves it — in Quality, which is the only place that can ──────────────────────────
  const approved = await page.request.put(`${QA}/irs/${irId}/resolve`, { headers: H(), data: { status: 'approved' } });
  expect(approved.ok(), `Quality must resolve its own inspection — ${await approved.text()}`).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await openGates(page, code);
  await expect(page.getByTestId(`readiness-gate-${code}-inspections-state`)).toHaveText('READY');
  await expect(page.getByTestId(`readiness-gate-${code}-inspections`)).toContainText(/1 of 1 inspection approved/i);
});

test('a rejected inspection does not block here — the non-conformance is what answers it', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate13 Rejected', baseURL);
  const stamp = Date.now().toString().slice(-5);
  const code = `TC-G13R-${stamp}`;
  const created = await page.request.post(CX, { headers: H(), data: { projectId, code, title: 'CCTV — Tower A', system: 'cctv' } });
  test.skip(!created.ok(), 'commissioning API not reachable');

  const ir = await (await page.request.post(`${QA}/irs`, {
    headers: H(),
    data: {
      projectId, irNumber: `IR-R-${stamp}`, discipline: 'cctv',
      locationDetail: 'Level 3 riser', inspectionDate: new Date().toISOString().slice(0, 10),
    },
  })).json();
  await page.request.put(`${QA}/irs/${ir.id}/resolve`, { headers: H(), data: { status: 'rejected', comments: 'Terminations not to spec' } });

  // Quality's own model makes a rejection the trigger for a non-conformance, and the `quality` gate
  // already blocks on open NCRs. Counting the rejection here too would report one problem as two —
  // the rule this chain has followed since TC-GATE-6.
  await page.goto(`/commissioning?project=${projectId}&section=readiness`, { waitUntil: 'domcontentloaded' });
  await openGates(page, code);
  await expect(page.getByTestId(`readiness-gate-${code}-inspections-state`)).toHaveText('READY');
  await expect(page.getByTestId(`readiness-gate-${code}-inspections`)).toContainText(/non-conformance rather than this gate/i);
});

test('another trade’s inspection is not this system’s precondition', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate13 Trade', baseURL);
  const stamp = Date.now().toString().slice(-5);
  const code = `TC-G13T-${stamp}`;
  const created = await page.request.post(CX, { headers: H(), data: { projectId, code, title: 'CCTV — Tower A', system: 'cctv' } });
  test.skip(!created.ok(), 'commissioning API not reachable');

  await page.request.post(`${QA}/irs`, {
    headers: H(),
    data: {
      projectId, irNumber: `IR-P-${stamp}`, discipline: 'plumbing',
      locationDetail: 'Basement pump room', inspectionDate: new Date().toISOString().slice(0, 10),
    },
  });

  await page.goto(`/commissioning?project=${projectId}&section=readiness`, { waitUntil: 'domcontentloaded' });
  await openGates(page, code);
  await expect(page.getByTestId(`readiness-gate-${code}-inspections-state`), 'a plumbing inspection is not a CCTV precondition')
    .toHaveText('NOT APPLICABLE');
});
