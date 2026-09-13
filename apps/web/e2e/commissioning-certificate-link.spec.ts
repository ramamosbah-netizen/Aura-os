// AURA OS — TC-GATE-10: the evidence pack becomes a controlled document.
//
// Since TC-GATE-3 the Certificates surface has said "Formal issue — DocControl — not linked", and
// meant it. T&C could produce the evidence — the test sheet, every run behind every point including
// the failures, the witnessed sign-off — and print it, but the result was a SCREEN: no number, no
// revision, no place in the register the client is handed. A dossier citing it cited a URL.
//
// T&C still creates no document. A person registers it in document control, where documents are
// registered, and says here that the entry IS this system's certificate. This proves the two guards
// that keep that sentence honest, and that the printed pack and the dossier then cite it.
import { expect, test } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const CX = `${API}/api/v1/commissioning/records`;
const DC = `${API}/api/v1/doccontrol`;
const H = () => apiAuthHeaders();

type Req = import('@playwright/test').APIRequestContext;

async function registerDocument(request: Req, projectId: string, documentNumber: string, title: string) {
  return (await (await request.post(`${DC}/register`, {
    headers: H(),
    data: { projectId, documentNumber, title, discipline: 'elv', docType: 'document', currentRevision: 'A', status: 'for_review' },
  })).json()) as { id: string; documentNumber: string };
}

test('a certificate cannot be registered before the system is signed off, or against nothing', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate10 Guards', baseURL);
  const stamp = Date.now().toString().slice(-5);
  const created = await page.request.post(CX, { headers: H(), data: { projectId, code: `TC-G10-${stamp}`, title: 'CCTV — Tower A', system: 'cctv' } });
  test.skip(created.status() === 502 || created.status() === 404 || !created.ok(), 'commissioning API not reachable');
  const system = await created.json();

  const doc = await registerDocument(page.request, projectId, `CX-CERT-${stamp}`, 'CCTV commissioning certificate');

  // GUARD 1 — the evidence must exist before the document that attests to it.
  const tooEarly = await page.request.post(`${CX}/${system.id}/certificate-link`, { headers: H(), data: { documentId: doc.documentNumber } });
  expect(tooEarly.ok(), 'an uncommissioned system must not carry a certificate').toBe(false);
  expect(JSON.stringify(await tooEarly.json())).toMatch(/only a commissioned system can have its certificate registered/i);

  // Sign the system off, properly: a point, a passing run, a witnessed sign-off.
  const point = await (await page.request.post(`${CX}/${system.id}/test-items`, { headers: H(), data: { pointNo: 'IMG-01', description: 'Camera image' } })).json();
  await page.request.post(`${CX}/${system.id}/test-items/${point.id}/runs`, { headers: H(), data: { result: 'pass', actual: 'Image on VMS' } });
  await page.request.put(`${CX}/${system.id}/commission`, { headers: H(), data: { commissionedBy: 'Engineer', witnessedBy: 'Consultant' } });

  // GUARD 2 — the reference must be a document the register actually holds.
  const typo = await page.request.post(`${CX}/${system.id}/certificate-link`, { headers: H(), data: { documentId: `CX-CERT-${stamp}X` } });
  expect(typo.ok(), 'a reference the register does not hold must be refused').toBe(false);
  expect(JSON.stringify(await typo.json())).toMatch(/must match a controlled document/i);

  // The real thing.
  const linked = await page.request.post(`${CX}/${system.id}/certificate-link`, { headers: H(), data: { documentId: doc.documentNumber } });
  expect(linked.ok(), `a registered document must link — ${await linked.text()}`).toBe(true);

  // ONE per system: a second certificate for one sign-off is ambiguous, not richer.
  const second = await registerDocument(page.request, projectId, `CX-CERT2-${stamp}`, 'Duplicate certificate');
  const again = await page.request.post(`${CX}/${system.id}/certificate-link`, { headers: H(), data: { documentId: second.documentNumber } });
  expect(again.ok(), 'a system must not carry two certificates').toBe(false);
});

test('the registered certificate shows on the surface, the printed pack and the dossier', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate10 Pack', baseURL);
  const stamp = Date.now().toString().slice(-5);
  const code = `TC-G10P-${stamp}`;
  const created = await page.request.post(CX, { headers: H(), data: { projectId, code, title: 'CCTV — Tower A', system: 'cctv' } });
  test.skip(!created.ok(), 'commissioning API not reachable');
  const system = await created.json();

  const point = await (await page.request.post(`${CX}/${system.id}/test-items`, { headers: H(), data: { pointNo: 'IMG-01', description: 'Camera image' } })).json();
  await page.request.post(`${CX}/${system.id}/test-items/${point.id}/runs`, { headers: H(), data: { result: 'pass', actual: 'Image on VMS' } });
  await page.request.put(`${CX}/${system.id}/commission`, { headers: H(), data: { commissionedBy: 'Engineer', witnessedBy: 'Consultant' } });

  // ── Before registration: the surface and the pack both say so plainly ───────────────────────────
  await page.goto(`/commissioning?project=${projectId}&section=certificates`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId(`certificate-issue-${code}`)).toHaveText('evidence pack only');

  await page.goto(`/commissioning/${system.id}/certificate`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toContainText(/not registered/i);
  await expect(page.locator('body')).toContainText(/this pack is the evidence, not an issued document/i);

  // ── Register it in document control, then say so here ───────────────────────────────────────────
  const doc = await registerDocument(page.request, projectId, `CX-CERT-${stamp}`, 'CCTV commissioning certificate');

  await page.goto(`/commissioning?project=${projectId}&section=certificates`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId(`certificate-ref-${code}`).fill(doc.documentNumber);
  await page.getByTestId(`certificate-link-btn-${code}`).click();
  await expect(page.getByTestId(`certificate-issue-${code}`)).toContainText(`${doc.documentNumber} rev A`, { timeout: 15_000 });

  // ── The printed pack now cites its own document ─────────────────────────────────────────────────
  await page.goto(`/commissioning/${system.id}/certificate`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toContainText(`${doc.documentNumber} rev A`);
  await expect(page.locator('body')).toContainText(new RegExp(`registered in the controlled register as ${doc.documentNumber}`, 'i'));
  // And still says who owns the issue, because that did not change.
  await expect(page.locator('body')).toContainText(/owned by Document Control and are not performed here/i);

  // ── The dossier cites the document rather than the system code ──────────────────────────────────
  const pkgCode = `HO-G10-${stamp}`;
  await page.request.post(`${API}/api/v1/commissioning/handovers`, { headers: H(), data: { projectId, code: pkgCode, title: 'Tower A handover' } });
  await page.goto(`/handover?project=${projectId}&section=dossier`, { waitUntil: 'domcontentloaded' });
  const card = page.getByTestId(`dossier-${pkgCode}`);
  // The manifest is behind a caret — the card head shows the count, not the entries.
  await page.getByTestId(`dossier-open-${pkgCode}`).click();
  await expect(card.getByTestId('dossier-section-commissioning_certificate')).toContainText(doc.documentNumber);
  await expect(card.getByTestId('dossier-section-commissioning_certificate')).toContainText(/rev A/i);

  // ── Supersede it in the register: the link stands, what it points at stops counting ─────────────
  await page.request.put(`${DC}/register/${doc.id}/revise`, { headers: H(), data: { revision: 'B', status: 'superseded' } });

  await page.goto(`/commissioning?project=${projectId}&section=certificates`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId(`certificate-issue-${code}`)).toContainText(/superseded/i);

  // ── Withdrawing the registration leaves the controlled document alone ───────────────────────────
  await page.getByTestId(`certificate-unlink-${code}`).click();
  await expect(page.getByTestId(`certificate-issue-${code}`)).toHaveText('evidence pack only', { timeout: 15_000 });
  const stillThere = await page.request.get(`${DC}/register/${doc.id}/history`, { headers: H() });
  expect(stillThere.ok(), 'withdrawing a registration must not touch the document').toBe(true);
});
