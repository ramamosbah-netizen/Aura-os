// AURA OS — TC-GATE-8: an as-built drawing is linked to the system it documents.
//
// Since TC-GATE-6 Handover's as-built gate has read the controlled register, but asked one question
// of the whole project: "is there an entry marked as_built?" One drawing answered for every system.
// A ten-system project with a single as-built lift-lobby layout read READY.
//
// It could not be split per system before, because nothing joined the two sides: every ELV system on
// a project carries the discipline `elv`, so discipline cannot tell the CCTV as-built from the
// access-control one. The link is now explicit and T&C-owned, and this proves the three things that
// matter: it is refused when it would be a lie, the gate is answered per system, and unlinking puts
// the question back where it was.
import { expect, test } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const CX = `${API}/api/v1/commissioning/records`;
const DC = `${API}/api/v1/doccontrol`;
const H = () => apiAuthHeaders();

type Req = import('@playwright/test').APIRequestContext;

async function registerDocument(request: Req, projectId: string, documentNumber: string, title: string, status: string) {
  return (await (await request.post(`${DC}/register`, {
    headers: H(),
    data: { projectId, documentNumber, title, discipline: 'elv', docType: 'drawing', currentRevision: 'B', status },
  })).json()) as { id: string; documentNumber: string };
}

test('an as-built link is refused unless the register already says as-built', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate8 Links', baseURL);
  const stamp = Date.now().toString().slice(-5);
  const created = await page.request.post(CX, { headers: H(), data: { projectId, code: `TC-G8-${stamp}`, title: 'CCTV — Tower A', system: 'cctv' } });
  test.skip(created.status() === 502 || created.status() === 404 || !created.ok(), 'commissioning API not reachable');
  const system = await created.json();

  // A reference the register does not hold at all.
  const missing = await page.request.post(`${CX}/${system.id}/asbuilt-links`, { headers: H(), data: { documentId: `ELV-NOPE-${stamp}` } });
  expect(missing.ok(), 'a reference the register does not hold must be refused').toBe(false);
  expect(JSON.stringify(await missing.json())).toMatch(/must match a controlled document/i);

  // A real document that is not an as-built. This is the refusal that matters: linking a
  // for-construction drawing would put a not-yet-as-built document behind an as-built claim.
  const draft = await registerDocument(page.request, projectId, `ELV-FC-${stamp}`, 'CCTV layout', 'for_construction');
  const tooEarly = await page.request.post(`${CX}/${system.id}/asbuilt-links`, { headers: H(), data: { documentId: draft.documentNumber } });
  expect(tooEarly.ok(), 'a for-construction drawing must not be linkable as an as-built').toBe(false);
  const message = JSON.stringify(await tooEarly.json());
  expect(message).toMatch(/must be marked as-built/i);
  expect(message, 'the refusal names the state it actually found').toMatch(/for_construction/i);

  // The real thing.
  const asBuilt = await registerDocument(page.request, projectId, `ELV-AB-${stamp}`, 'CCTV layout — as-built', 'as_built');
  const linked = await page.request.post(`${CX}/${system.id}/asbuilt-links`, { headers: H(), data: { documentId: asBuilt.documentNumber } });
  expect(linked.ok(), `a current as-built must link — ${await linked.text()}`).toBe(true);

  // Twice is refused: counting one drawing twice would inflate the pack.
  const again = await page.request.post(`${CX}/${system.id}/asbuilt-links`, { headers: H(), data: { documentId: asBuilt.documentNumber } });
  expect(again.ok(), 'the same drawing must not link to one system twice').toBe(false);
});

test('the gate is answered per system, and unlinking puts the question back', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate8 Per System', baseURL);
  const stamp = Date.now().toString().slice(-5);
  const first = await page.request.post(CX, { headers: H(), data: { projectId, code: `TC-A-${stamp}`, title: 'CCTV — Tower A', system: 'cctv' } });
  test.skip(!first.ok(), 'commissioning API not reachable');
  const systemA = await first.json();
  const systemB = await (await page.request.post(CX, { headers: H(), data: { projectId, code: `TC-B-${stamp}`, title: 'Access control — Tower A', system: 'access_control' } })).json();

  const asBuilt = await registerDocument(page.request, projectId, `ELV-AB-${stamp}`, 'CCTV layout — as-built', 'as_built');
  await page.request.post(`${CX}/${systemA.id}/asbuilt-links`, { headers: H(), data: { documentId: asBuilt.documentNumber } });

  // ── On screen: one system covered, one not ──────────────────────────────────────────────────────
  await page.goto(`/commissioning?project=${projectId}&section=certificates`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('asbuilt-links')).toBeVisible();
  await expect(page.getByTestId(`asbuilt-state-TC-A-${stamp}`)).toHaveText('as-built linked');
  await expect(page.getByTestId(`asbuilt-state-TC-B-${stamp}`)).toHaveText('none linked');

  // THE WEAKNESS THIS GATE CLOSES: before it, that single drawing satisfied both systems.
  const links = (await (await page.request.get(`${CX}/${systemA.id}/asbuilt-links`, { headers: H() })).json()) as { id: string }[];
  expect(links).toHaveLength(1);

  // ── Link the second from the UI, and both are covered ───────────────────────────────────────────
  const secondAsBuilt = await registerDocument(page.request, projectId, `ELV-AB2-${stamp}`, 'Access control layout — as-built', 'as_built');
  await page.getByTestId(`asbuilt-ref-TC-B-${stamp}`).fill(secondAsBuilt.documentNumber);
  await page.getByTestId(`asbuilt-link-btn-TC-B-${stamp}`).click();
  await expect(page.getByTestId(`asbuilt-state-TC-B-${stamp}`)).toHaveText('as-built linked', { timeout: 15_000 });

  // ── Unlink, and the system goes back to having nothing said about it ────────────────────────────
  await page.getByTestId(`asbuilt-unlink-${links[0].id}`).click();
  await expect(page.getByTestId(`asbuilt-state-TC-A-${stamp}`)).toHaveText('none linked', { timeout: 15_000 });
  // The drawing itself is untouched — only T&C's statement about it went away.
  const stillThere = await page.request.get(`${DC}/register/${asBuilt.id}/history`, { headers: H() });
  expect(stillThere.ok(), 'unlinking must not touch the controlled document').toBe(true);
});

test('a superseded as-built stops counting, without anything being unlinked', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate8 Superseded', baseURL);
  const stamp = Date.now().toString().slice(-5);
  const created = await page.request.post(CX, { headers: H(), data: { projectId, code: `TC-S-${stamp}`, title: 'CCTV — Tower A', system: 'cctv' } });
  test.skip(!created.ok(), 'commissioning API not reachable');
  const system = await created.json();

  const asBuilt = await registerDocument(page.request, projectId, `ELV-AB-${stamp}`, 'CCTV layout — as-built', 'as_built');
  await page.request.post(`${CX}/${system.id}/asbuilt-links`, { headers: H(), data: { documentId: asBuilt.documentNumber } });

  await page.goto(`/commissioning?project=${projectId}&section=certificates`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId(`asbuilt-state-TC-S-${stamp}`)).toHaveText('as-built linked');

  // The register moves on. The link is still there; what it points at is no longer current.
  await page.request.put(`${DC}/register/${asBuilt.id}/revise`, { headers: H(), data: { revision: 'C', status: 'superseded' } });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId(`asbuilt-state-TC-S-${stamp}`)).toHaveText('not current');
  await expect(page.getByTestId('asbuilt-links')).toContainText(/superseded/i);
});
