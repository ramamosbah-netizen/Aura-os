// AURA OS — TC-09: the retest history is persisted, read back, and received with the handover.
//
// A bound system fails a point, is retested and signed off by the shipped T&C engineer in the
// browser. The proof is then about what SURVIVES that:
//
//   the record's history is read back from the PERSISTED event store — every run, the retest marked,
//     who recorded it — on the system's own page and through the governed API, and a viewer
//     without the grant is refused it;
//   the evidence pack names the approved checklist revision and prints each run of the retested point;
//   the handover dossier carries "tested against … · passed on retest: …" for the T&C engineer, and
//     Handover/FM reads the same line in the ISSUED manifest.
//
// WHO SUBMITS is the one act not done by a shipped operational role here, and deliberately: submitting
// opens a document-control transmittal, which asserts `doccontrol.transmittal.create`, and no shipped
// role holds both that and `commissioning.handover.submit` (PM and T&C hold submit; the Document
// Controller holds the transmittal). That is a pre-existing authority question for the programme
// owner, recorded in the TC-09 report — not something this proof decides by widening a role. The
// administrator submits, and the RECEIPT under test is Handover/FM's.
//
// The other domains' evidence the handover needs (device, drawing, as-built, O&M, training, spares) is
// seeded through their own APIs as in handover-dossier.spec.ts; it is not what this proves.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';
import { provisionedActorsUnavailable } from './provisioned-actors';
import { signInAs } from './project-member-harness';
import { bearer, systemFromChecklist, tokenFor, QAQC } from './approved-checklist';

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const V1 = `${API}/api/v1`;
const CX = `${V1}/commissioning/records`;
const HO = `${V1}/commissioning/handovers`;
const DC = `${V1}/doccontrol`;
const TC = process.env.E2E_TC_USERNAME ?? 'u-e2e-tc';
const FM = process.env.E2E_FM_USERNAME ?? 'u-e2e-fm';
const VIEWER = process.env.E2E_VIEWER_USERNAME ?? 'u-e2e-viewer';
const H = () => apiAuthHeaders();

async function openAs(browser: Browser, baseURL: string, username: string): Promise<Page> {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  expect(await signInAs(page, baseURL, username), `sign-in as ${username} must complete`).toBe(true);
  return page;
}

test('a retest is persisted, read back, printed on the pack and received in the issued handover dossier', async ({ browser, page, baseURL }) => {
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  const unavailable = await provisionedActorsUnavailable(page.request);
  test.skip(unavailable !== null, unavailable ?? '');
  test.setTimeout(240_000);

  const run = Date.now().toString().slice(-6);
  const projectId = await createProject(page.request, `TC-09 retest ${run}`, baseURL);
  for (const [userId, roleId] of [[TC, 'r-commissioning-engineer'], [FM, 'r-handover-fm']] as const) {
    const m = await page.request.post(`${V1}/projects/${projectId}/members`, { headers: H(), data: { userId, roleId } });
    expect([200, 201, 409].includes(m.status()), `putting ${userId} on the project: ${await m.text()}`).toBe(true);
  }
  const tcApi = bearer(await tokenFor(page.request, TC));

  // The approved checklist (QA/QC prepares, a second QA/QC approves), and the system created FROM it
  // by the T&C engineer. One mandatory point, declared here.
  const code = `CX-RT-${run}`;
  const system = await systemFromChecklist(page.request, {
    projectId, code, title: 'CCTV — Tower A', system: 'cctv',
    points: [{ code: 'IMG-01', activity: 'Camera image on VMS', acceptanceCriteria: 'Sharp image at 4 m' }],
  }, tcApi);

  // ── The T&C engineer fails the point, retests it and signs off — in the browser ───────────────
  const tc = await openAs(browser, baseURL!, TC);
  await tc.goto(`/commissioning/${system.id}`, { waitUntil: 'domcontentloaded' });
  await tc.getByTestId('record-run-IMG-01').click();
  await tc.getByTestId('run-actual-IMG-01').fill('No image');
  await tc.getByTestId('run-remarks-IMG-01').fill('Cable fault at camera end');
  await tc.getByTestId('run-fail-IMG-01').click();
  await expect(tc.getByTestId('point-result-IMG-01')).toHaveText('fail', { timeout: 30_000 });
  await tc.getByTestId('record-run-IMG-01').click();
  await tc.getByTestId('run-actual-IMG-01').fill('Sharp image');
  await tc.getByTestId('run-remarks-IMG-01').fill('Re-terminated and re-tested');
  await tc.getByTestId('run-pass-IMG-01').click();
  await expect(tc.getByTestId('point-result-IMG-01')).toHaveText('pass', { timeout: 30_000 });
  await tc.getByPlaceholder('Commissioned by').fill('A. Engineer');
  await tc.getByPlaceholder('Witnessed by (consultant/client)').fill('R. Consultant');
  await tc.getByTestId('btn-commission').click();
  await expect(tc.getByTestId('cx-status')).toHaveText('Commissioned', { timeout: 30_000 });

  // ── ACTUAL OUTPUT: the history, read back from the persisted event store ──────────────────────
  await tc.reload({ waitUntil: 'domcontentloaded' });
  const history = tc.getByTestId('cx-history');
  await expect(history).toContainText('Bound to ITP-CCTV revision 1');
  await expect(history).toContainText('IMG-01 run 1: fail — No image — Cable fault at camera end');
  await expect(history).toContainText('IMG-01 run 2: pass (retest) — Sharp image — Re-terminated and re-tested');
  await expect(history).toContainText('Commissioned');
  await expect(history).toContainText(TC);

  const read = await page.request.get(`${CX}/${system.id}/history`, { headers: tcApi });
  expect(read.status()).toBe(200);
  const body = (await read.json()) as { readable: boolean; events: Array<{ type: string; actorId: string | null; payload: Record<string, unknown> }> };
  expect(body.readable).toBe(true);
  const runs = body.events.filter((e) => e.type === 'commissioning.test-run.recorded');
  expect(runs.map((e) => `${e.payload.runNo}:${e.payload.result}:${e.payload.isRetest}:${e.actorId}`))
    .toEqual([`1:fail:false:${TC}`, `2:pass:true:${TC}`]);
  // QA/QC reads it too; somebody without a commissioning grant is refused.
  const asQa = await page.request.get(`${CX}/${system.id}/history`, { headers: bearer(await tokenFor(page.request, QAQC)) });
  expect(asQa.status(), 'QA/QC reads the record history').toBe(200);
  const asViewer = await page.request.get(`${CX}/${system.id}/history`, { headers: bearer(await tokenFor(page.request, VIEWER)) });
  expect(asViewer.status(), 'a viewer without a commissioning grant is refused the history').toBe(403);

  // The evidence pack names the approved revision and prints both runs of the retested point.
  await tc.goto(`/commissioning/${system.id}/certificate`, { waitUntil: 'domcontentloaded' });
  await expect(tc.locator('body')).toContainText('ITP-CCTV rev 1, approved by u-e2e-qaqc2');
  await expect(tc.locator('body')).toContainText('#1 fail (No image — Cable fault at camera end) → #2 pass');

  // ── The rest of the handover's evidence, in the domains that own it (admin fixture) ───────────
  const device = await (await page.request.post(`${V1}/elv/devices`, { headers: H(), data: { projectId, tag: `CAM-${run}`, system: 'cctv' } })).json();
  await page.request.put(`${V1}/elv/devices/${device.id}/status`, { headers: H(), data: { status: 'installed' } });
  const drawing = await (await page.request.post(`${V1}/engineering/drawings`, {
    headers: H(), data: { projectId, code: `DWG-RT-${run}`, title: 'CCTV layout', revision: '0', discipline: 'cctv' },
  })).json();
  for (const step of ['submit', 'start-review']) await page.request.post(`${V1}/engineering/drawings/${drawing.id}/${step}`, { headers: H(), data: {} });
  await page.request.post(`${V1}/engineering/drawings/${drawing.id}/review`, { headers: H(), data: { outcome: 'approved', comments: 'Approved' } });
  for (const [documentNumber, title, status] of [[`ELV-AB-${run}`, 'CCTV layout — as-built', 'as_built'], [`DOC-OM-${run}`, 'CCTV O&M manual', 'for_construction']]) {
    const reg = await page.request.post(`${DC}/register`, {
      headers: H(), data: { projectId, documentNumber, title, discipline: 'elv', docType: 'document', currentRevision: 'B', status },
    });
    expect(reg.ok(), `registering ${documentNumber}: ${await reg.text()}`).toBe(true);
  }
  expect((await page.request.post(`${CX}/${system.id}/asbuilt-links`, { headers: H(), data: { documentId: `ELV-AB-${run}` } })).ok()).toBe(true);
  await page.request.post(`${HO}/om-items/seed`, { headers: H(), data: { commissioningId: system.id } });
  const omItems = (await (await page.request.get(`${HO}/om-items?projectId=${projectId}`, { headers: H() })).json()) as { id: string }[];
  for (const item of omItems) {
    await page.request.put(`${HO}/om-items/${item.id}/state`, { headers: H(), data: { to: 'submitted', documentId: `DOC-OM-${run}` } });
    await page.request.put(`${HO}/om-items/${item.id}/state`, { headers: H(), data: { to: 'reviewed' } });
    await page.request.put(`${HO}/om-items/${item.id}/state`, { headers: H(), data: { to: 'accepted' } });
  }
  const session = await (await page.request.post(`${HO}/training`, { headers: H(), data: { projectId, title: 'Handover training' } })).json();
  await page.request.put(`${HO}/training/${session.id}/complete`, { headers: H(), data: { attendees: 'Client FM team' } });
  await page.request.put(`${HO}/training/${session.id}/acknowledge`, { headers: H(), data: { acknowledgedBy: 'Client Rep' } });
  const spare = await (await page.request.post(`${HO}/spares`, { headers: H(), data: { commissioningId: system.id, description: 'Spare camera', quantityRequired: 1 } })).json();
  await page.request.put(`${HO}/spares/${spare.id}/hand-over`, { headers: H(), data: { quantity: 1 } });
  await page.request.put(`${HO}/spares/${spare.id}/acknowledge`, { headers: H(), data: { acknowledgedBy: 'Client Rep' } });
  const pkgCode = `HO-RT-${run}`;
  const pkg = await page.request.post(HO, { headers: H(), data: { projectId, code: pkgCode, title: 'Tower A handover' } });
  expect(pkg.ok(), `the handover package: ${await pkg.text()}`).toBe(true);

  const retestLine = 'tested against ITP-CCTV rev 1 · passed on retest: IMG-01';

  // ── The derived dossier already carries it, as the T&C engineer reads it ──────────────────────
  await tc.goto(`/handover?project=${projectId}&section=dossier`, { waitUntil: 'domcontentloaded' });
  const caret = tc.getByTestId(`dossier-open-${pkgCode}`);
  await expect(caret).toBeEnabled({ timeout: 30_000 });
  await caret.click();
  await expect(tc.getByTestId(`dossier-entry-${system.id}`)).toContainText(retestLine);

  // The package is ready once every domain answers — and the issue is captured on submission.
  const pkgId = ((await pkg.json()) as { id: string }).id;
  const submitted = await page.request.put(`${HO}/${pkgId}/submit`, { headers: H(), data: {} });
  expect(submitted.ok(), `the package must submit once the evidence supports it — ${await submitted.text()}`).toBe(true);

  // ── HANDOFF: Handover/FM reads the ISSUED manifest, retest history and all ────────────────────
  const fm = await openAs(browser, baseURL!, FM);
  await fm.goto(`/handover?project=${projectId}&section=dossier`, { waitUntil: 'domcontentloaded' });
  const fmCaret = fm.getByTestId(`dossier-open-${pkgCode}`);
  await expect(fmCaret).toBeEnabled({ timeout: 30_000 });
  await fmCaret.click();
  const issue = fm.getByTestId(`dossier-issue-${pkgCode}-1`);
  await expect(issue).toBeVisible({ timeout: 30_000 });
  const toggle = fm.getByTestId(`dossier-issue-toggle-${pkgCode}-1`);
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(issue).toContainText(`${code} — CCTV — Tower A`);
  await expect(issue).toContainText(retestLine);
});
