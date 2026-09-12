// AURA OS — TC-GATE-4: handover readiness stops being six ticks.
//
// The behaviour being removed is specific and was demonstrable: a package could read
// "test certificates ✓" while its systems had never been tested, because the tick and the evidence
// lived in different places and only one of them was ever looked at. So the assertions that matter
// are the ones that try to tick past the evidence and are refused.
import { expect, test } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const CX = `${API}/api/v1/commissioning/records`;
const HO = `${API}/api/v1/commissioning/handovers`;
const H = () => apiAuthHeaders();

test('handover readiness is projected, and a tick cannot buy a submission', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate4', baseURL);
  const code = `CX-HO-${Date.now().toString().slice(-6)}`;

  // One system, registered and never tested. By T&C's own chain it is not commissioning ready.
  const created = await page.request.post(CX, { headers: H(), data: { projectId, code, title: 'CCTV — Tower A', system: 'cctv' } });
  test.skip(created.status() === 502 || created.status() === 404 || !created.ok(), 'commissioning API not reachable');
  const { id: systemId } = await created.json();

  const pkgCode = `HO-${Date.now().toString().slice(-6)}`;
  const pkg = await (await page.request.post(HO, { headers: H(), data: { projectId, code: pkgCode, title: 'Tower A handover' } })).json();

  // ── The derived items cannot be ticked at all ───────────────────────────────────────────────────
  for (const key of ['testCertificates', 'asBuilts']) {
    const refused = await page.request.put(`${HO}/${pkg.id}/checklist`, { headers: H(), data: { [key]: true } });
    expect(refused.ok(), `${key} must not be tickable`).toBe(false);
    expect(JSON.stringify(await refused.json())).toMatch(/only an item without an owning authority/i);
  }

  // ── Tick everything a person still can, and the submission is still refused ─────────────────────
  // Only two items remain tickable after TC-GATE-5; the other four are derived.
  await page.request.put(`${HO}/${pkg.id}/checklist`, { headers: H(), data: { warrantyDocs: true, spares: true } });
  const early = await page.request.put(`${HO}/${pkg.id}/submit`, { headers: H(), data: {} });
  expect(early.ok(), 'a package whose systems are not ready must not submit').toBe(false);
  expect(JSON.stringify(await early.json())).toMatch(/not commissioning ready/i);

  // ── On screen: the projection, with its sources named ──────────────────────────────────────────
  await page.goto('/handover', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('handover-readiness')).toBeVisible();
  await expect(page.getByTestId('handover-item-commissioning-state')).toHaveText('BLOCKED');
  await expect(page.getByTestId('handover-item-commissioning')).toContainText(/Testing & commissioning/i);
  // TC-GATE-5 moved O&M from an assertion to a projection, so the "asserted" property is now tested
  // against one of the two items that still has no owning authority.
  await expect(page.getByTestId('handover-item-omManuals')).toContainText(/derived · Handover/i);
  await expect(page.getByTestId('handover-item-warrantyDocs')).toContainText(/nothing verifies this/i);
  // The two derived items are gone from the tickable checklist and said to be derived.
  await expect(page.getByTestId(`handover-checklist-${pkgCode}`)).not.toContainText('As-built drawings');
  await expect(page.getByTestId(`handover-derived-note-${pkgCode}`)).toContainText(/derived from Testing & Commissioning and\s+Engineering/i);
  // The submit control is disabled and says why, rather than offering something the API refuses.
  await expect(page.getByTestId(`handover-submit-${pkgCode}`)).toBeDisabled();
  await expect(page.getByTestId(`handover-submit-${pkgCode}`)).toHaveAttribute('title', /not commissioning ready/i);

  // ── Make the evidence real, in the domains that own it ──────────────────────────────────────────
  const point = await (await page.request.post(`${CX}/${systemId}/test-items`, { headers: H(), data: { pointNo: 'IMG-01', description: 'Camera image on VMS' } })).json();
  await page.request.post(`${CX}/${systemId}/test-items/${point.id}/runs`, { headers: H(), data: { result: 'pass', actual: 'Image on VMS' } });
  await page.request.put(`${CX}/${systemId}/commission`, { headers: H(), data: { commissionedBy: 'Test Engineer', witnessedBy: 'Client Consultant' } });

  const device = await (await page.request.post(`${API}/api/v1/elv/devices`, { headers: H(), data: { projectId, tag: 'CAM-001', system: 'cctv' } })).json();
  await page.request.put(`${API}/api/v1/elv/devices/${device.id}/status`, { headers: H(), data: { status: 'installed' } });

  const drawing = await (await page.request.post(`${API}/api/v1/engineering/drawings`, {
    headers: H(), data: { projectId, code: `DWG-${Date.now().toString().slice(-5)}`, title: 'CCTV layout', revision: '0', discipline: 'cctv' },
  })).json();
  for (const step of ['submit', 'start-review']) {
    await page.request.post(`${API}/api/v1/engineering/drawings/${drawing.id}/${step}`, { headers: H(), data: {} });
  }
  await page.request.post(`${API}/api/v1/engineering/drawings/${drawing.id}/review`, { headers: H(), data: { outcome: 'approved', comments: 'Approved' } });

  // Approved is not as-built: the gate must still refuse until the drawing is actually released.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('handover-item-commissioning-state')).toHaveText('READY');
  await expect(page.getByTestId('handover-item-asBuilts-state')).toHaveText('BLOCKED');
  await expect(page.getByTestId('handover-item-asBuilts')).toContainText(/none marked as-built/i);

  await page.request.post(`${API}/api/v1/engineering/drawings/${drawing.id}/transmit`, { headers: H(), data: {} }).catch(() => undefined);
  await page.request.post(`${API}/api/v1/engineering/drawings/${drawing.id}/close`, { headers: H(), data: {} }).catch(() => undefined);
});

test('the handover checklist no longer offers the two derived items', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate4 Checklist', baseURL);
  const pkgCode = `HO-CK-${Date.now().toString().slice(-5)}`;
  const created = await page.request.post(HO, { headers: H(), data: { projectId, code: pkgCode, title: 'Checklist shape' } });
  test.skip(!created.ok(), 'commissioning API not reachable');

  await page.goto('/handover', { waitUntil: 'domcontentloaded' });
  const checklist = page.getByTestId(`handover-checklist-${pkgCode}`);
  await expect(checklist).toContainText('O&M manuals');
  await expect(checklist).toContainText('Warranty documents');
  await expect(checklist).toContainText('Client training completed');
  await expect(checklist).toContainText('Spares & consumables handed over');
  // The two that became evidence.
  await expect(checklist).not.toContainText('As-built drawings');
  await expect(checklist).not.toContainText('Test & commissioning certificates');
});
