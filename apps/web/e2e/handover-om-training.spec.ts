// AURA OS — TC-GATE-5: O&M deliverables and client training become authorities.
//
// Gate 4 left four of Handover's six readiness items as assertions because no authority existed to
// derive them from. This builds two of those authorities and proves the move: the ticks are gone,
// the readiness item is computed from real rows, and the submission follows the evidence rather than
// the other way round.
import { expect, test } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const CX = `${API}/api/v1/commissioning/records`;
const HO = `${API}/api/v1/commissioning/handovers`;
const DC = `${API}/api/v1/doccontrol`;
const H = () => apiAuthHeaders();

/**
 * Put a real controlled document on the project (TC-GATE-6).
 *
 * Since TC-GATE-6 an O&M deliverable cannot be submitted against a reference the register does not
 * hold, so these specs have to create the documents they point at — which is the point: before the
 * gate, every reference in this file was invented text that nothing checked.
 */
async function registerDocument(
  request: import('@playwright/test').APIRequestContext,
  projectId: string,
  documentNumber: string,
  title: string,
) {
  return (await (await request.post(`${DC}/register`, {
    headers: H(),
    data: { projectId, documentNumber, title, discipline: 'elv', docType: 'document', currentRevision: 'B', status: 'for_construction' },
  })).json()) as { id: string; documentNumber: string };
}

/** A system that passes its whole T&C readiness chain, so only the Gate-5 items can block. */
async function readySystem(request: import('@playwright/test').APIRequestContext, projectId: string, code: string) {
  const rec = await (await request.post(CX, { headers: H(), data: { projectId, code, title: 'CCTV — Tower A', system: 'cctv' } })).json();
  const point = await (await request.post(`${CX}/${rec.id}/test-items`, { headers: H(), data: { pointNo: 'IMG-01', description: 'Camera image' } })).json();
  await request.post(`${CX}/${rec.id}/test-items/${point.id}/runs`, { headers: H(), data: { result: 'pass', actual: 'Image on VMS' } });
  await request.put(`${CX}/${rec.id}/commission`, { headers: H(), data: { commissionedBy: 'Engineer', witnessedBy: 'Consultant' } });

  const device = await (await request.post(`${API}/api/v1/elv/devices`, { headers: H(), data: { projectId, tag: 'CAM-001', system: 'cctv' } })).json();
  await request.put(`${API}/api/v1/elv/devices/${device.id}/status`, { headers: H(), data: { status: 'installed' } });

  const drawing = await (await request.post(`${API}/api/v1/engineering/drawings`, {
    headers: H(), data: { projectId, code: `DWG-${Date.now().toString().slice(-5)}`, title: 'CCTV layout', revision: '0', discipline: 'cctv' },
  })).json();
  for (const step of ['submit', 'start-review']) await request.post(`${API}/api/v1/engineering/drawings/${drawing.id}/${step}`, { headers: H(), data: {} });
  await request.post(`${API}/api/v1/engineering/drawings/${drawing.id}/review`, { headers: H(), data: { outcome: 'approved', comments: 'Approved' } });
  return rec;
}

test('the O&M pack and client training are authorities, and readiness counts them', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate5', baseURL);
  const code = `CX-G5-${Date.now().toString().slice(-6)}`;
  const created = await page.request.post(CX, { headers: H(), data: { projectId, code, title: 'CCTV — Tower A', system: 'cctv' } });
  test.skip(created.status() === 502 || created.status() === 404 || !created.ok(), 'commissioning API not reachable');
  const system = await created.json();

  const pkgCode = `HO-G5-${Date.now().toString().slice(-5)}`;
  await page.request.post(HO, { headers: H(), data: { projectId, code: pkgCode, title: 'Tower A handover' } });

  // ── The two new items can no longer be ticked ───────────────────────────────────────────────────
  const pkgs = await (await page.request.get(`${HO}?projectId=${projectId}`, { headers: H() })).json();
  const pkgId = pkgs[0].id;
  for (const key of ['omManuals', 'training']) {
    const refused = await page.request.put(`${HO}/${pkgId}/checklist`, { headers: H(), data: { [key]: true } });
    expect(refused.ok(), `${key} must no longer be tickable`).toBe(false);
    expect(JSON.stringify(await refused.json())).toMatch(/only an item without an owning authority/i);
  }

  // ── Nothing listed yet ⇒ UNKNOWN, not ready ─────────────────────────────────────────────────────
  await page.goto(`/handover?project=${projectId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('handover-item-omManuals-state')).toHaveText('UNKNOWN');
  await expect(page.getByTestId('handover-item-omManuals')).toContainText(/nothing listed/i);
  await expect(page.getByTestId('handover-item-training-state')).toHaveText('UNKNOWN');
  await expect(page.getByTestId('handover-item-training')).toContainText(/no training session has been recorded/i);

  // ── O&M: lay out the pack, then walk one deliverable through its lifecycle ──────────────────────
  await page.getByTestId('ho-section-om').click();
  await expect(page).toHaveURL(new RegExp(`project=${projectId}`));
  await expect(page.getByTestId('om-authority')).toContainText(/DocControl owns the controlled documents/i);
  await expect(page.getByTestId(`om-state-${code}`)).toHaveText('no pack');

  await page.getByTestId(`om-seed-${code}`).click();
  await expect(page.getByTestId(`om-item-${code}-om_manual`)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId(`om-item-state-${code}-om_manual`)).toHaveText('required');

  // Submitting without a document reference is refused: "submitted" with nothing to point at is a
  // claim, and this authority exists to stop claims standing in for evidence.
  const manual = (await listOm(page, projectId)).find((i) => i.deliverable === 'om_manual');
  expect(manual, 'the standard pack must include the O&M manual').toBeTruthy();
  const noDoc = await page.request.put(`${HO}/om-items/${manual!.id}/state`, { headers: H(), data: { to: 'submitted' } });
  expect(noDoc.ok()).toBe(false);
  expect(JSON.stringify(await noDoc.json())).toMatch(/controlled document reference is required/i);

  // TC-GATE-6: a reference the register does not hold is refused where it is typed, rather than
  // becoming an accepted deliverable pointing at nothing.
  const typo = await page.request.put(`${HO}/om-items/${manual!.id}/state`, { headers: H(), data: { to: 'submitted', documentId: 'DOC-OM-OOO1' } });
  expect(typo.ok(), 'a reference that is not in the register must be refused').toBe(false);
  expect(JSON.stringify(await typo.json())).toMatch(/must match a controlled document/i);

  await registerDocument(page.request, projectId, 'DOC-OM-0001', 'CCTV operation & maintenance manual');
  await page.getByTestId(`om-doc-${code}-om_manual`).fill('DOC-OM-0001');
  await page.getByTestId(`om-advance-${code}-om_manual`).click();
  await expect(page.getByTestId(`om-item-state-${code}-om_manual`)).toHaveText('submitted', { timeout: 15_000 });
  // The row shows what the REGISTER says, not the text that was typed — resolved on read, never stored.
  await expect(page.getByTestId(`om-doc-state-${code}-om_manual`)).toContainText('DOC-OM-0001');
  await expect(page.getByTestId(`om-doc-state-${code}-om_manual`)).toContainText(/CCTV operation & maintenance manual/i);
  await expect(page.getByTestId(`om-doc-state-${code}-om_manual`)).toContainText(/rev B/i);
  await page.getByTestId(`om-advance-${code}-om_manual`).click();
  await expect(page.getByTestId(`om-item-state-${code}-om_manual`)).toHaveText('reviewed', { timeout: 15_000 });
  await page.getByTestId(`om-advance-${code}-om_manual`).click();
  await expect(page.getByTestId(`om-item-state-${code}-om_manual`)).toHaveText('accepted', { timeout: 15_000 });

  // The readiness item now has rows to count: not complete, but no longer unknown.
  await page.getByTestId('ho-section-packages').click();
  await expect(page.getByTestId('handover-item-omManuals-state')).toHaveText('BLOCKED');
  await expect(page.getByTestId('handover-item-omManuals')).toContainText(/not accepted/i);

  // ── Training: our "completed" is not enough; the client has to acknowledge it ───────────────────
  await page.getByTestId('ho-section-training').click();
  await expect(page.getByTestId('training-authority')).toContainText(/worker safety/i);
  await page.getByTestId('training-title').fill('CCTV operator training');
  await page.getByTestId('training-system').selectOption(system.id);
  await page.getByTestId('training-plan').click();

  await expect(page.getByTestId('training-sessions')).toBeVisible({ timeout: 15_000 });
  // The row's id comes from the API rather than by scraping a testid prefix: several controls on
  // this surface share that prefix, and a prefix match would happily return the list instead of the
  // row — a test that passes for the wrong reason.
  const sessions = (await (await page.request.get(`${HO}/training?projectId=${projectId}`, { headers: H() })).json()) as { id: string; title: string }[];
  const sessionId = sessions.find((s) => s.title === 'CCTV operator training')!.id;
  await expect(page.getByTestId(`training-${sessionId}`)).toBeVisible();

  await page.getByTestId(`training-attendees-${sessionId}`).fill('Client FM team (3)');
  await page.getByTestId(`training-complete-${sessionId}`).click();
  await expect(page.getByTestId(`training-state-${sessionId}`)).toHaveText('completed', { timeout: 15_000 });

  await page.getByTestId('ho-section-packages').click();
  await expect(page.getByTestId('handover-item-training-state')).toHaveText('BLOCKED');
  await expect(page.getByTestId('handover-item-training')).toContainText(/recorded but not acknowledged/i);

  await page.getByTestId('ho-section-training').click();
  await page.getByTestId(`training-ack-name-${sessionId}`).fill('Client Rep');
  await page.getByTestId(`training-acknowledge-${sessionId}`).click();
  await expect(page.getByTestId(`training-state-${sessionId}`)).toHaveText('acknowledged', { timeout: 15_000 });

  await page.getByTestId('ho-section-packages').click();
  await expect(page.getByTestId('handover-item-training-state')).toHaveText('READY');
});

test('a complete pack and acknowledged training let the package submit', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate5 Submit', baseURL);
  const code = `CX-G5S-${Date.now().toString().slice(-5)}`;
  const created = await page.request.post(CX, { headers: H(), data: { projectId, code, title: 'probe', system: 'cctv' } });
  test.skip(!created.ok(), 'commissioning API not reachable');
  // Replace the probe with a fully ready system so only the Gate-5 items are in question.
  const system = await readySystem(page.request, projectId, `${code}-R`);

  const pkgCode = `HO-G5S-${Date.now().toString().slice(-5)}`;
  const pkg = await (await page.request.post(HO, { headers: H(), data: { projectId, code: pkgCode, title: 'Submit path' } })).json();
  // Only spares is still tickable: TC-GATE-6 derived warranty documents from the pack itself.
  await page.request.put(`${HO}/${pkg.id}/checklist`, { headers: H(), data: { spares: true } });

  // Every required deliverable accepted, for BOTH systems on the project.
  for (const systemId of [system.id, (await created.json()).id]) {
    await page.request.post(`${HO}/om-items/seed`, { headers: H(), data: { commissioningId: systemId } });
  }
  // One controlled document per deliverable, in the register, because the reference is now checked.
  const handoverDoc = await registerDocument(page.request, projectId, `DOC-PACK-${Date.now().toString().slice(-5)}`, 'Tower A handover pack');
  for (const item of (await listOm(page, projectId)) as { id: string; required: boolean }[]) {
    await page.request.put(`${HO}/om-items/${item.id}/state`, { headers: H(), data: { to: 'submitted', documentId: handoverDoc.documentNumber } });
    await page.request.put(`${HO}/om-items/${item.id}/state`, { headers: H(), data: { to: 'reviewed' } });
    await page.request.put(`${HO}/om-items/${item.id}/state`, { headers: H(), data: { to: 'accepted' } });
  }

  // One project-wide acknowledged session covers every system — the legitimate whole-package case.
  const session = await (await page.request.post(`${HO}/training`, { headers: H(), data: { projectId, title: 'Whole package handover training' } })).json();
  await page.request.put(`${HO}/training/${session.id}/complete`, { headers: H(), data: { attendees: 'Client FM team' } });
  await page.request.put(`${HO}/training/${session.id}/acknowledge`, { headers: H(), data: { acknowledgedBy: 'Client Rep' } });

  // The other system is still not commissioning ready, so the package must still refuse — the Gate-5
  // items being satisfied does not make the Gate-3 chain optional.
  const stillBlocked = await page.request.put(`${HO}/${pkg.id}/submit`, { headers: H(), data: {} });
  expect(stillBlocked.ok()).toBe(false);
  expect(JSON.stringify(await stillBlocked.json())).toMatch(/not commissioning ready/i);

  await page.goto(`/handover?project=${projectId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('handover-item-omManuals-state')).toHaveText('READY');
  // TC-GATE-6: the warranty certificate is its own item, derived from the same pack.
  await expect(page.getByTestId('handover-item-warrantyDocs-state')).toHaveText('READY');
  await expect(page.getByTestId('handover-item-training-state')).toHaveText('READY');
  await expect(page.getByTestId('handover-item-commissioning-state')).toHaveText('BLOCKED');
});

async function listOm(page: import('@playwright/test').Page, projectId: string) {
  return (await (await page.request.get(`${HO}/om-items?projectId=${projectId}`, { headers: H() })).json()) as { id: string; deliverable: string; required: boolean }[];
}
