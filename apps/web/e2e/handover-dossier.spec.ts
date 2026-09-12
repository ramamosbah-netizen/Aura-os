// AURA OS — TC-GATE-7: the handover dossier.
//
// The dossier owns nothing: every line belongs to a domain that already produced it. So the two
// assertions that matter are about the DIFFERENCE between two things that look alike on screen:
//
//   the DERIVED view, which must change the moment any source domain changes, and
//   the ISSUED manifest, which must not change at all once a package has been sent.
//
// The last block proves both at once: supersede a document the client was already given, and watch
// today's pack drop it while the issued manifest keeps citing exactly what went out.
import { expect, test } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const CX = `${API}/api/v1/commissioning/records`;
const HO = `${API}/api/v1/commissioning/handovers`;
const DC = `${API}/api/v1/doccontrol`;
const H = () => apiAuthHeaders();

type Req = import('@playwright/test').APIRequestContext;

async function registerDocument(request: Req, projectId: string, documentNumber: string, title: string, status = 'for_construction') {
  return (await (await request.post(`${DC}/register`, {
    headers: H(),
    data: { projectId, documentNumber, title, discipline: 'elv', docType: 'document', currentRevision: 'B', status },
  })).json()) as { id: string; documentNumber: string };
}

/** A system that passes its whole T&C chain, so only the handover items can block. */
async function readySystem(request: Req, projectId: string, code: string) {
  const rec = await (await request.post(CX, { headers: H(), data: { projectId, code, title: 'CCTV — Tower A', system: 'cctv' } })).json();
  const point = await (await request.post(`${CX}/${rec.id}/test-items`, { headers: H(), data: { pointNo: 'IMG-01', description: 'Camera image' } })).json();
  await request.post(`${CX}/${rec.id}/test-items/${point.id}/runs`, { headers: H(), data: { result: 'pass', actual: 'Image on VMS' } });
  await request.put(`${CX}/${rec.id}/commission`, { headers: H(), data: { commissionedBy: 'Engineer', witnessedBy: 'Consultant' } });

  const device = await (await request.post(`${API}/api/v1/elv/devices`, { headers: H(), data: { projectId, tag: 'CAM-001', system: 'cctv' } })).json();
  await request.put(`${API}/api/v1/elv/devices/${device.id}/status`, { headers: H(), data: { status: 'installed' } });

  // Engineering's drawing release, for T&C's own pre-commissioning gate — a different question to
  // the as-built one below, asked of the domain that can answer it.
  const drawing = await (await request.post(`${API}/api/v1/engineering/drawings`, {
    headers: H(), data: { projectId, code: `DWG-${Date.now().toString().slice(-5)}`, title: 'CCTV layout', revision: '0', discipline: 'cctv' },
  })).json();
  for (const step of ['submit', 'start-review']) await request.post(`${API}/api/v1/engineering/drawings/${drawing.id}/${step}`, { headers: H(), data: {} });
  await request.post(`${API}/api/v1/engineering/drawings/${drawing.id}/review`, { headers: H(), data: { outcome: 'approved', comments: 'Approved' } });
  return rec as { id: string; code: string };
}

test('the dossier assembles what the client receives, and remembers what was sent', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate7 Dossier', baseURL);
  const stamp = Date.now().toString().slice(-5);
  // Reachability is checked with a READ. Creating a probe record would leave an uncommissioned
  // second system on the project, which the readiness chain would rightly refuse to submit — a
  // fixture blocking the very thing the test is here to exercise.
  const probe = await page.request.get(`${CX}?projectId=${projectId}`, { headers: H() });
  test.skip(probe.status() === 502 || probe.status() === 404 || !probe.ok(), 'commissioning API not reachable');
  const system = await readySystem(page.request, projectId, `TC-G7-${stamp}`);

  // ── The register: a real as-built and a real manual ─────────────────────────────────────────────
  await registerDocument(page.request, projectId, `ELV-AB-${stamp}`, 'CCTV layout — as-built', 'as_built');
  // TC-GATE-8: and the as-built is LINKED to the system it documents, or it answers for nobody.
  const linked = await page.request.post(`${CX}/${system.id}/asbuilt-links`, { headers: H(), data: { documentId: `ELV-AB-${stamp}` } });
  expect(linked.ok(), `the as-built must link — ${await linked.text()}`).toBe(true);
  const manual = await registerDocument(page.request, projectId, `DOC-OM-${stamp}`, 'CCTV O&M manual');

  // ── The pack, accepted against those references ─────────────────────────────────────────────────
  await page.request.post(`${HO}/om-items/seed`, { headers: H(), data: { commissioningId: system.id } });
  const items = (await (await page.request.get(`${HO}/om-items?projectId=${projectId}`, { headers: H() })).json()) as { id: string; required: boolean }[];
  for (const item of items) {
    await page.request.put(`${HO}/om-items/${item.id}/state`, { headers: H(), data: { to: 'submitted', documentId: manual.documentNumber } });
    await page.request.put(`${HO}/om-items/${item.id}/state`, { headers: H(), data: { to: 'reviewed' } });
    await page.request.put(`${HO}/om-items/${item.id}/state`, { headers: H(), data: { to: 'accepted' } });
  }

  const session = await (await page.request.post(`${HO}/training`, { headers: H(), data: { projectId, title: 'Whole package handover training' } })).json();
  await page.request.put(`${HO}/training/${session.id}/complete`, { headers: H(), data: { attendees: 'Client FM team' } });
  await page.request.put(`${HO}/training/${session.id}/acknowledge`, { headers: H(), data: { acknowledgedBy: 'Client Rep' } });

  const pkgCode = `HO-G7-${stamp}`;
  const pkg = await (await page.request.post(HO, { headers: H(), data: { projectId, code: pkgCode, title: 'Tower A handover' } })).json();
  await page.request.put(`${HO}/${pkg.id}/checklist`, { headers: H(), data: { spares: true } });

  // ── Before submission: a full pack, and nothing issued ──────────────────────────────────────────
  await page.goto(`/handover?project=${projectId}&section=dossier`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('dossier-authority')).toContainText(/owns nothing/i);
  await expect(page.getByTestId(`dossier-${pkgCode}`)).toBeVisible();

  // Scoped to THIS package's card. A project can carry more than one package — a lifecycle reactor
  // raises one of its own when a project reaches handover — and an unscoped section testid would
  // match both, which is a test that passes or fails depending on what else ran.
  const card = page.getByTestId(`dossier-${pkgCode}`);

  // Each section names the domain that produced its lines — the dossier is an assembly, and says so.
  await expect(card.getByTestId('dossier-section-commissioning_certificate')).toContainText(/Testing & commissioning/i);
  await expect(card.getByTestId('dossier-section-as_built_document')).toContainText(/Document control/i);
  await expect(card.getByTestId('dossier-section-om_deliverable')).toContainText(/O&M pack/i);
  await expect(card.getByTestId('dossier-section-training_session')).toContainText(/client training/i);
  await expect(page.getByTestId(`dossier-no-issue-${pkgCode}`)).toContainText(/captured when the package is submitted/i);

  // ── Submit: the manifest is captured ────────────────────────────────────────────────────────────
  const submitted = await page.request.put(`${HO}/${pkg.id}/submit`, { headers: H(), data: {} });
  expect(submitted.ok(), `the package must submit once the evidence supports it — ${await submitted.text()}`).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  const issue1 = page.getByTestId(`dossier-issue-${pkgCode}-1`);
  await expect(issue1).toBeVisible();

  // TC-GATE-14: document control was asked to open a transmittal for the controlled documents this
  // issue carries. The manifest is our record of what was sent; the transmittal is theirs of it being
  // conveyed — and it is what an acknowledgement later attaches to.
  // TC-GATE-15 made this line say WHAT BECAME of the conveyance rather than only that one exists,
  // so the assertion names the transmittal and its state. The full lifecycle is driven below.
  await expect(page.getByTestId(`dossier-conveyance-${pkgCode}-1`)).toContainText(`TR-${pkgCode}-1`);
  const transmittals = await (await page.request.get(`${API}/api/v1/doccontrol/transmittals`, { headers: H() })).json();
  const mine = (transmittals as { id: string; code: string; status: string; projectId: string }[]).filter((t) => t.projectId === projectId);
  expect(mine, 'document control must hold the transmittal, because it is the one that made it').toHaveLength(1);
  expect(mine[0].code).toBe(`TR-${pkgCode}-1`);
  // A DRAFT: sending needs a recipient, and a handover package does not know the client's document
  // controller. DocControl completes and sends it, which is its job.
  expect(mine[0].status, 'Handover opens it; document control sends it').toBe('draft');
  // TC-GATE-15: the stored id is read back, so the surface says what became of the conveyance
  // rather than only that one exists.
  await expect(page.getByTestId(`dossier-conveyance-${pkgCode}-1`)).toContainText(/opened, not yet sent/i);

  // ── Document control sends it, and the client acknowledges ──────────────────────────────────────
  const transmittalId = mine[0].id;
  await page.request.post(`${API}/api/v1/doccontrol/transmittals/${transmittalId}/send`, { headers: H(), data: {} });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId(`dossier-conveyance-${pkgCode}-1`)).toContainText(/not yet acknowledged/i);

  const ack = await page.request.put(`${API}/api/v1/doccontrol/transmittals/${transmittalId}/acknowledge`, {
    headers: H(), data: { note: 'Received in full' },
  });
  expect(ack.ok(), `document control must accept the acknowledgement — ${await ack.text()}`).toBe(true);

  // THE FACT THIS WHOLE SEAM EXISTS FOR: not our record of sending, but theirs of receiving.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId(`dossier-conveyance-${pkgCode}-1`)).toContainText(/acknowledged by/i);
  await expect(issue1).toContainText(`DOC-OM-${stamp}`);
  await expect(issue1).toContainText(/accepted · rev B/i);
  await expect(issue1).toContainText(`ELV-AB-${stamp}`);

  // ── The world moves: the manual the client was given is superseded ──────────────────────────────
  const revised = await page.request.put(`${DC}/register/${manual.id}/revise`, { headers: H(), data: { revision: 'C', status: 'superseded' } });
  expect(revised.ok()).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });

  // Today's pack notices — that is what a derived view is for.
  await expect(page.getByTestId(`dossier-${pkgCode}`).getByTestId('dossier-section-om_deliverable')).toContainText(/superseded/i);
  await expect(page.getByTestId(`dossier-count-${pkgCode}`)).toContainText(/outstanding/i);

  // The issued manifest does not — that is what the one stored thing is for.
  await expect(page.getByTestId(`dossier-issue-${pkgCode}-1`)).toContainText(/accepted · rev B/i);
  await expect(page.getByTestId(`dossier-issue-${pkgCode}-1`)).not.toContainText(/rev C/i);
});

test('the dossier section is addressable and keeps the project', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate7 Nav', baseURL);
  const created = await page.request.post(HO, { headers: H(), data: { projectId, code: `HO-NAV-${Date.now().toString().slice(-5)}`, title: 'Nav' } });
  test.skip(!created.ok(), 'commissioning API not reachable');

  await page.goto(`/handover?project=${projectId}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('ho-section-dossier').click();
  await expect(page).toHaveURL(new RegExp(`section=dossier`));
  await expect(page).toHaveURL(new RegExp(`project=${projectId}`));
  await expect(page.getByTestId('dossier-authority')).toBeVisible();
});
