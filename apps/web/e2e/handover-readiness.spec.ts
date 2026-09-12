// AURA OS — TC-GATE-4: handover readiness stops being six ticks.
//
// The behaviour being removed is specific and was demonstrable: a package could read
// "test certificates ✓" while its systems had never been tested, because the tick and the evidence
// lived in different places and only one of them was ever looked at. So the assertions that matter
// are the ones that try to tick past the evidence and are refused.
//
// TC-GATE-6 rewrote the as-built half of this file. It used to drive ENGINEERING drawings and then
// stop at BLOCKED — because Engineering has no as-built status, so the gate could not be made to
// pass at all. Every handover package was permanently unsubmittable and this spec, by never
// asserting READY, recorded the dead end as if it were the design. The register that can say
// `as_built` is document control's, and the flow below now ends where it always should have: READY.
import { expect, test } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const CX = `${API}/api/v1/commissioning/records`;
const HO = `${API}/api/v1/commissioning/handovers`;
const DC = `${API}/api/v1/doccontrol`;
const H = () => apiAuthHeaders();

/**
 * A long journey on purpose, and it has grown with every gate: it drives Testing & Commissioning,
 * the ELV register, Engineering, document control and the handover package in one pass, because the
 * claim being made is about the CHAIN and a chain cannot be proved in pieces.
 *
 * It now has 42 awaited steps and runs 30–50s, which put it inside the default 60s timeout by
 * luck rather than design. Raised deliberately rather than split: splitting would mean re-seeding
 * the same five domains twice and asserting less, not more.
 */
test.setTimeout(180_000);

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
  // All six, after TC-GATE-16 gave spares an authority — the last one that had none.
  for (const key of ['testCertificates', 'asBuilts', 'omManuals', 'training', 'warrantyDocs', 'spares']) {
    const refused = await page.request.put(`${HO}/${pkg.id}/checklist`, { headers: H(), data: { [key]: true } });
    expect(refused.ok(), `${key} must not be tickable`).toBe(false);
    expect(JSON.stringify(await refused.json())).toMatch(/only an item without an owning authority/i);
  }

  // ── Nothing is tickable at all, and the submission is still refused ─────────────────────────────
  // TC-GATE-16 derived the last of the six. The checklist has nothing left in it.
  const lastTick = await page.request.put(`${HO}/${pkg.id}/checklist`, { headers: H(), data: { spares: true } });
  expect(lastTick.ok(), 'spares became a projection at TC-GATE-16').toBe(false);
  const early = await page.request.put(`${HO}/${pkg.id}/submit`, { headers: H(), data: {} });
  expect(early.ok(), 'a package whose systems are not ready must not submit').toBe(false);
  expect(JSON.stringify(await early.json())).toMatch(/not commissioning ready/i);

  // ── On screen: the projection, with its sources named ──────────────────────────────────────────
  await page.goto('/handover', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('handover-readiness')).toBeVisible();
  await expect(page.getByTestId('handover-item-commissioning-state')).toHaveText('BLOCKED');
  await expect(page.getByTestId('handover-item-commissioning')).toContainText(/Testing & commissioning/i);
  await expect(page.getByTestId('handover-item-omManuals')).toContainText(/derived · Handover/i);
  // TC-GATE-16: spares was the last item that said "nothing verifies this". Every one is now
  // derived, so the assertion is that NO item is asserted rather than that one still is.
  await expect(page.getByTestId('handover-item-warrantyDocs')).toContainText(/derived · Handover/i);
  await expect(page.getByTestId('handover-item-spares')).toContainText(/derived · Handover/i);
  await expect(page.getByTestId('handover-readiness')).not.toContainText(/nothing verifies this/i);
  // The checklist is empty, and says why.
  await expect(page.getByTestId(`handover-checklist-${pkgCode}`)).not.toContainText('As-built drawings');
  await expect(page.getByTestId(`handover-derived-note-${pkgCode}`)).toContainText(/nothing to tick/i);
  await expect(page.getByTestId(`handover-derived-note-${pkgCode}`)).toContainText(/derived/i);
  // The submit control is disabled and says why, rather than offering something the API refuses.
  await expect(page.getByTestId(`handover-submit-${pkgCode}`)).toBeDisabled();
  await expect(page.getByTestId(`handover-submit-${pkgCode}`)).toHaveAttribute('title', /not commissioning ready/i);

  // ── Make the evidence real, in the domains that own it ──────────────────────────────────────────
  const point = await (await page.request.post(`${CX}/${systemId}/test-items`, { headers: H(), data: { pointNo: 'IMG-01', description: 'Camera image on VMS' } })).json();
  await page.request.post(`${CX}/${systemId}/test-items/${point.id}/runs`, { headers: H(), data: { result: 'pass', actual: 'Image on VMS' } });
  await page.request.put(`${CX}/${systemId}/commission`, { headers: H(), data: { commissionedBy: 'Test Engineer', witnessedBy: 'Client Consultant' } });

  const device = await (await page.request.post(`${API}/api/v1/elv/devices`, { headers: H(), data: { projectId, tag: 'CAM-001', system: 'cctv' } })).json();
  await page.request.put(`${API}/api/v1/elv/devices/${device.id}/status`, { headers: H(), data: { status: 'installed' } });

  // Engineering's own drawing, for TESTING & COMMISSIONING's engineering gate. This is a different
  // question to the as-built one below, asked of a different domain on purpose: Engineering owns
  // whether the design is released, document control owns whether an as-built has been issued.
  const drawing = await (await page.request.post(`${API}/api/v1/engineering/drawings`, {
    headers: H(), data: { projectId, code: `DWG-${Date.now().toString().slice(-5)}`, title: 'CCTV layout', revision: '0', discipline: 'cctv' },
  })).json();
  for (const step of ['submit', 'start-review']) {
    await page.request.post(`${API}/api/v1/engineering/drawings/${drawing.id}/${step}`, { headers: H(), data: {} });
  }
  await page.request.post(`${API}/api/v1/engineering/drawings/${drawing.id}/review`, { headers: H(), data: { outcome: 'approved', comments: 'Approved' } });

  // A controlled document exists on the project, but it is not an as-built yet.
  const docNumber = `ELV-AB-${Date.now().toString().slice(-5)}`;
  const entry = await (await page.request.post(`${DC}/register`, {
    headers: H(),
    data: { projectId, documentNumber: docNumber, title: 'CCTV layout — as-built', discipline: 'elv', docType: 'drawing', currentRevision: 'A', status: 'for_construction' },
  })).json();

  // TC-GATE-8: nothing is linked to the system yet, so the gate is UNKNOWN rather than BLOCKED —
  // nobody has said anything about this system's as-built, and nothing has failed.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('handover-item-commissioning-state')).toHaveText('READY');
  await expect(page.getByTestId('handover-item-asBuilts-state')).toHaveText('UNKNOWN');
  await expect(page.getByTestId('handover-item-asBuilts')).toContainText(/no as-built drawing linked/i);
  await expect(page.getByTestId('handover-item-asBuilts')).toContainText(/Document control/i);

  // A drawing that is not yet an as-built cannot be linked as one.
  const tooEarly = await page.request.post(`${CX}/${systemId}/asbuilt-links`, { headers: H(), data: { documentId: docNumber } });
  expect(tooEarly.ok(), 'a for-construction drawing must not be linkable as an as-built').toBe(false);
  expect(JSON.stringify(await tooEarly.json())).toMatch(/must be marked as-built/i);

  // ── Release it as the as-built, link it, and the gate reaches READY ─────────────────────────────
  // This is the assertion TC-GATE-4 could not make: while the question went to Engineering, whose
  // drawing lifecycle has no as-built state, this item could never leave BLOCKED.
  const revised = await page.request.put(`${DC}/register/${entry.id}/revise`, { headers: H(), data: { revision: 'B', status: 'as_built' } });
  expect(revised.ok(), 'the register must accept an as-built revision').toBe(true);

  const linked = await page.request.post(`${CX}/${systemId}/asbuilt-links`, { headers: H(), data: { documentId: docNumber } });
  expect(linked.ok(), `the as-built must link once the register marks it so — ${await linked.text()}`).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('handover-item-asBuilts-state')).toHaveText('READY');
  await expect(page.getByTestId('handover-item-asBuilts')).toContainText(/current as-built drawing linked/i);
});

test('the handover checklist offers nothing at all, because everything is derived', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate4 Checklist', baseURL);
  const pkgCode = `HO-CK-${Date.now().toString().slice(-5)}`;
  const created = await page.request.post(HO, { headers: H(), data: { projectId, code: pkgCode, title: 'Checklist shape' } });
  test.skip(!created.ok(), 'commissioning API not reachable');

  await page.goto('/handover', { waitUntil: 'domcontentloaded' });
  const checklist = page.getByTestId(`handover-checklist-${pkgCode}`);
  // TC-GATE-16 emptied it: spares was the last item with no authority behind it.
  // Everything else became evidence. A checkbox the API refuses is worse than no checkbox: until
  // TC-GATE-6 this page still offered three of them, and this spec asserted they were there.
  for (const gone of ['O&M manuals', 'Warranty documents', 'Client training completed', 'As-built drawings', 'Test & commissioning certificates', 'Spares & consumables handed over']) {
    await expect(checklist, `${gone} must no longer be tickable`).not.toContainText(gone);
  }
});
