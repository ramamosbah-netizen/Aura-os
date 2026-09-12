// AURA OS — TC-GATE-3: integration, pre-commissioning, evidence and handover readiness.
//
// Gate 2 made T&C's own evidence usable. This proves the part that is NOT T&C's: that readiness is
// DERIVED from the domains that own it — the ELV device register, Engineering, Quality — and that a
// gate nobody can answer blocks rather than passes. The distinction the whole gate rests on is
// asserted directly: a system can be legitimately commissioned and still not be COMMISSIONING READY.
import { expect, test } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const CX = `${API}/api/v1/commissioning/records`;
const H = () => apiAuthHeaders();

test('readiness is derived from the domains that own it, and UNKNOWN blocks', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate3', baseURL);
  const code = `CX-RD-${Date.now().toString().slice(-6)}`;

  const created = await page.request.post(CX, { headers: H(), data: { projectId, code, title: 'CCTV — Tower A', system: 'cctv' } });
  test.skip(created.status() === 502 || created.status() === 404 || !created.ok(), 'commissioning API not reachable');
  const { id } = await created.json();

  // T&C's own evidence: one point, passed, signed off and witnessed. By Gate-2 rules this system is
  // commissioned — and that is exactly the state this gate must not confuse with readiness.
  const point = await (await page.request.post(`${CX}/${id}/test-items`, { headers: H(), data: { pointNo: 'IMG-01', description: 'Camera image on VMS', expected: 'Sharp image' } })).json();
  await page.request.post(`${CX}/${id}/test-items/${point.id}/runs`, { headers: H(), data: { result: 'pass', actual: 'Image on VMS' } });
  await page.request.put(`${CX}/${id}/commission`, { headers: H(), data: { commissionedBy: 'Test Engineer', witnessedBy: 'Client Consultant' } });

  // ── Readiness: commissioned, but not ready — and the chain says which domains have not answered ─
  await page.goto(`/commissioning?section=readiness&project=${projectId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId(`readiness-${code}`)).toBeVisible();
  await expect(page.getByTestId(`readiness-state-${code}`)).not.toHaveText('COMMISSIONING READY');
  await expect(page.getByTestId(`readiness-gate-${code}-signoff-state`)).toHaveText('READY');
  // Nothing is registered for this system anywhere, so these are UNKNOWN — not passes.
  await expect(page.getByTestId(`readiness-gate-${code}-equipment-state`)).toHaveText('UNKNOWN');
  await expect(page.getByTestId(`readiness-gate-${code}-engineering-state`)).toHaveText('UNKNOWN');
  await expect(page.getByTestId(`readiness-gate-${code}-equipment`)).toContainText(/no equipment is registered/i);
  // Quality answered — it has nothing open — so that gate is READY on real evidence.
  await expect(page.getByTestId(`readiness-gate-${code}-quality-state`)).toHaveText('READY');

  // ── Pre-Commissioning shows the same four gates, with their sources named ───────────────────────
  await page.getByTestId('cx-section-pre-commissioning').click();
  await expect(page.getByTestId('pre-authority')).toContainText(/derived from the domain that owns it/i);
  await expect(page.getByTestId(`pre-state-${code}`)).toHaveText('prerequisites outstanding');
  await expect(page.getByTestId(`pre-gate-${code}-installation`)).toContainText('ELV device register');

  // ── Answer the ELV register: register a device and install it ───────────────────────────────────
  const device = await (await page.request.post(`${API}/api/v1/elv/devices`, {
    headers: H(),
    data: { projectId, tag: 'CAM-001', system: 'cctv', model: 'DS-2CD2143G2-I', location: 'Level 3 — East' },
  })).json();
  await page.request.put(`${API}/api/v1/elv/devices/${device.id}/status`, { headers: H(), data: { status: 'installed' } });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId(`pre-gate-${code}-equipment-state`)).toHaveText('READY');
  await expect(page.getByTestId(`pre-gate-${code}-installation-state`)).toHaveText('READY');
  await expect(page.getByTestId(`pre-gate-${code}-installation`)).toContainText(/installed and terminated/i);
  // Engineering has still not answered, so the system is still not ready.
  await expect(page.getByTestId(`pre-gate-${code}-engineering-state`)).toHaveText('UNKNOWN');

  // ── Answer Engineering: an approved drawing for a discipline this system recognises ─────────────
  const drawing = await (await page.request.post(`${API}/api/v1/engineering/drawings`, {
    headers: H(),
    data: { projectId, code: `DWG-${Date.now().toString().slice(-5)}`, title: 'CCTV layout — Level 3', revision: '0', discipline: 'cctv' },
  })).json();
  await page.request.post(`${API}/api/v1/engineering/drawings/${drawing.id}/submit`, { headers: H(), data: {} });
  await page.request.post(`${API}/api/v1/engineering/drawings/${drawing.id}/start-review`, { headers: H(), data: {} });
  await page.request.post(`${API}/api/v1/engineering/drawings/${drawing.id}/review`, { headers: H(), data: { outcome: 'approved', comments: 'Approved for construction' } });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId(`pre-gate-${code}-engineering-state`)).toHaveText('READY');
  await expect(page.getByTestId(`pre-state-${code}`)).toHaveText('ready to test');

  // ── Every domain has answered: COMMISSIONING READY ──────────────────────────────────────────────
  await page.getByTestId('cx-section-readiness').click();
  await expect(page.getByTestId(`readiness-state-${code}`)).toHaveText('COMMISSIONING READY');
  await expect(page.getByTestId('readiness-summary')).toContainText('1');
  await expect(page.getByTestId('readiness-authority')).toContainText(/Handover owns/i);

  // ── Certificates: the evidence pack, and what it is not ─────────────────────────────────────────
  await page.getByTestId('cx-section-certificates').click();
  await expect(page.getByTestId('certificates-authority')).toContainText(/DocControl/i);
  await expect(page.getByTestId(`certificate-${code}`)).toContainText('DocControl — not linked');
  await page.getByTestId(`certificate-open-${code}`).click();
  await page.waitForURL('**/certificate');
  await expect(page.getByText('TESTING & COMMISSIONING EVIDENCE PACK')).toBeVisible();
  await expect(page.getByText('IMG-01')).toBeVisible();
  await expect(page.getByText(/Formal controlled issue/i)).toBeVisible();
});

test('a Quality ITP is linked, shown with Quality’s own result, and blocks until it passes', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate3 ITP', baseURL);
  const code = `CX-ITP-${Date.now().toString().slice(-6)}`;
  const created = await page.request.post(CX, { headers: H(), data: { projectId, code, title: 'Structured cabling', system: 'structured_cabling' } });
  test.skip(!created.ok(), 'commissioning API not reachable');
  const { id } = await created.json();

  // Quality's plan. Its free-text discipline is deliberately NOT an ELV system name — the point of
  // the explicit link is that the two vocabularies cannot be matched automatically.
  const itpRef = `ITP-${Date.now().toString().slice(-5)}`;
  const itp = await (await page.request.post(`${API}/api/v1/quality/itps`, {
    headers: H(),
    data: {
      projectId, reference: itpRef, title: 'Cabling installation and test', discipline: 'building services',
      points: [{ activity: 'Permanent link test', pointType: 'hold', acceptanceCriteria: 'Fluke pass on every link' }],
    },
  })).json();
  // Quality's own lifecycle: a plan must be active before results can be recorded against it.
  await page.request.put(`${API}/api/v1/quality/itps/${itp.id}/activate`, { headers: H(), data: {} });

  await page.goto(`/commissioning?section=itp&project=${projectId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('itp-authority')).toContainText(/owned by/i);
  await expect(page.getByTestId(`itp-system-${code}`)).toContainText(/No ITP is linked/i);

  await page.getByTestId(`itp-select-${code}`).selectOption(itp.id);
  await page.getByTestId(`itp-link-${code}`).click();

  // The requirement appears with Quality's own result — pending, because Quality has not signed it.
  await expect(page.getByTestId(`itp-req-${itpRef}-0`)).toContainText('Permanent link test');
  await expect(page.getByTestId(`itp-req-${itpRef}-0`)).toContainText('pending');
  await expect(page.getByTestId(`itp-req-${itpRef}-0`)).toContainText('Fluke pass on every link');

  // …and it blocks the Quality gate, because an unproven hold point is not a pass.
  await page.getByTestId('cx-section-pre-commissioning').click();
  await expect(page.getByTestId(`pre-gate-${code}-quality-state`)).toHaveText('BLOCKED');
  await expect(page.getByTestId(`pre-gate-${code}-quality`)).toContainText(/ITP point/i);

  // Quality passes the point — in Quality, where it is owned. T&C never writes it.
  await page.request.put(`${API}/api/v1/quality/itps/${itp.id}/points/0`, { headers: H(), data: { result: 'passed' } });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId(`pre-gate-${code}-quality-state`)).toHaveText('READY');
  await expect(page.getByTestId(`pre-gate-${code}-quality`)).toContainText(/all 1 linked ITP point passed/i);
});

test('a defect is escalated to Quality by reference, without T&C raising an NCR', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate3 Escalation', baseURL);
  const code = `CX-ES-${Date.now().toString().slice(-6)}`;
  const created = await page.request.post(CX, { headers: H(), data: { projectId, code, title: 'CCTV — Level 2', system: 'cctv' } });
  test.skip(!created.ok(), 'commissioning API not reachable');
  const { id } = await created.json();

  const point = await (await page.request.post(`${CX}/${id}/test-items`, { headers: H(), data: { pointNo: 'IMG-04', description: 'Camera image' } })).json();
  await page.request.post(`${CX}/${id}/test-items/${point.id}/runs`, { headers: H(), data: { result: 'fail', remarks: 'No image — cable fault' } });

  // A real NCR, raised in Quality, where NCRs are owned.
  const ncrNumber = `NCR-${Date.now().toString().slice(-5)}`;
  const ncrBefore = await page.request.get(`${API}/api/v1/quality/ncrs`, { headers: H() });
  const countBefore = ((await ncrBefore.json()) as unknown[]).length;
  await page.request.post(`${API}/api/v1/quality/ncrs`, {
    headers: H(),
    data: { projectId, ncrNumber, description: 'CCTV cable fault at Level 2', severity: 'major', system: 'cctv' },
  });

  await page.goto(`/commissioning?section=defects&project=${projectId}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('raise-defect-IMG-04').click();
  await expect(page.getByTestId('defect-raised-IMG-04')).toBeVisible({ timeout: 15_000 });

  const defectRow = page.locator('[data-testid^="defect-"]').filter({ hasText: 'IMG-04' }).first();
  const defectId = (await defectRow.getAttribute('data-testid'))!.replace('defect-', '');

  await page.getByTestId(`ncr-select-${defectId}`).selectOption(ncrNumber);
  await page.getByTestId(`escalate-${defectId}`).click();
  await expect(page.getByTestId(`escalated-${defectId}`)).toContainText(ncrNumber, { timeout: 15_000 });

  // The decisive assertion: T&C recorded a REFERENCE and created nothing in Quality.
  const ncrAfter = await page.request.get(`${API}/api/v1/quality/ncrs`, { headers: H() });
  expect(((await ncrAfter.json()) as unknown[]).length, 'T&C must not have created an NCR of its own').toBe(countBefore + 1);
});

test('the eight sections are reachable and keep the project', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate3 Nav', baseURL);
  await page.goto(`/commissioning?project=${projectId}`, { waitUntil: 'domcontentloaded' });

  for (const section of ['systems', 'itp', 'pre-commissioning', 'testing', 'defects', 'certificates', 'readiness', 'overview']) {
    await page.getByTestId(`cx-section-${section}`).click();
    await expect(page).toHaveURL(new RegExp(`project=${projectId}`));
    await expect(page.getByTestId(`cx-section-${section}`)).toHaveAttribute('aria-current', 'page');
  }
  // The Overview carries the readiness count, and it leads to the chain that explains it.
  await expect(page.getByTestId('cx-card-all-readiness')).toContainText('Commissioning ready');
});
