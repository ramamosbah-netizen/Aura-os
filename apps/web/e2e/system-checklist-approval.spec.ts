// AURA OS — TC-08 / TC-09: the approved system checklist, in the browser, under shipped roles.
//
// Quality owns the checklist a system is commissioned against; Testing & Commissioning executes it.
// This drives both halves through the shipped screens as the people who do them:
//
//   u-e2e-qaqc   (r-qa-qc)                  writes the template, adopts it into the project, submits
//   u-e2e-qaqc2  (r-qa-qc)                  approves — the preparer may not
//   u-e2e-tc     (r-commissioning-engineer) creates the system FROM the approved revision, executes
//                                           it through fail → defect → retest, and commissions
//
// and asserts every refusal the contract names: self-approval, a hand-typed point on a bound record,
// commissioning an unbound record, incomplete mandatory points, a failing point, an open defect,
// another project's or another system's checklist, a superseded revision, and editing an approved
// one. Every point is declared here, for this test: the library starts empty and stays that way.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';
import { provisionedActorsUnavailable } from './provisioned-actors';
import { signInAs } from './project-member-harness';
import { bearer, tokenFor, QAQC, QAQC_APPROVER } from './approved-checklist';

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const V1 = `${API}/api/v1`;
const TC = process.env.E2E_TC_USERNAME ?? 'u-e2e-tc';
const SYSTEM = 'intercom';

async function openAs(browser: Browser, baseURL: string, username: string): Promise<Page> {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  expect(await signInAs(page, baseURL, username), `sign-in as ${username} must complete`).toBe(true);
  return page;
}

test('Quality approves the checklist independently; T&C executes exactly it, and PASS means its mandatory points', async ({ browser, page, baseURL }) => {
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  const unavailable = await provisionedActorsUnavailable(page.request);
  test.skip(unavailable !== null, unavailable ?? '');
  test.setTimeout(300_000);

  const run = Date.now().toString().slice(-6);
  const projectId = await createProject(page.request, `TC-08 checklist ${run}`, baseURL);
  const otherProjectId = await createProject(page.request, `TC-08 other ${run}`, baseURL);
  for (const pid of [projectId, otherProjectId]) {
    for (const [userId, roleId] of [[QAQC, 'r-qa-qc'], [QAQC_APPROVER, 'r-qa-qc'], [TC, 'r-commissioning-engineer']] as const) {
      const m = await page.request.post(`${V1}/projects/${pid}/members`, { headers: apiAuthHeaders(), data: { userId, roleId } });
      expect([200, 201, 409].includes(m.status()), `putting ${userId} on the project: ${await m.text()}`).toBe(true);
    }
  }
  const qaqcApi = bearer(await tokenFor(page.request, QAQC));
  const approverApi = bearer(await tokenFor(page.request, QAQC_APPROVER));
  const tcApi = bearer(await tokenFor(page.request, TC));

  // ── 1. QUALITY writes the template — the library proposes nothing ───────────────────────────
  const qa = await openAs(browser, baseURL!, QAQC);
  await qa.goto('/quality/system-checklists', { waitUntil: 'domcontentloaded' });
  await expect(qa.getByTestId('template-library')).toBeVisible();
  // A system nobody has written a template for is shown as not ready, never given default points.
  await expect(qa.getByTestId('tpl-published-parking_management')).toHaveText('No template — not ready');

  await qa.getByTestId('tpl-new').click();
  await qa.getByTestId('tpl-system').selectOption(SYSTEM);
  await qa.getByTestId('tpl-title').fill(`Intercom SAT ${run}`);
  await expect(qa.getByTestId('tpl-point-code-0'), 'the editor starts with one EMPTY point').toHaveValue('');
  await qa.getByTestId('tpl-add-point').click();
  await qa.getByTestId('tpl-add-point').click();
  const points = [
    ['IC-01', 'Call from door station to master', 'Two-way speech, clear at 1 m', true],
    ['IC-02', 'Door release from master station', 'Lock releases within 1 s', true],
    ['IC-03', 'Call log export', 'CSV exports', false],
  ] as const;
  for (const [i, [code, activity, criterion, mandatory]] of points.entries()) {
    await qa.getByTestId(`tpl-point-code-${i}`).fill(code);
    await qa.getByTestId(`tpl-point-activity-${i}`).fill(activity);
    await qa.getByTestId(`tpl-point-criterion-${i}`).fill(criterion);
    if (!mandatory) await qa.getByTestId(`tpl-point-mandatory-${i}`).uncheck();
  }
  await qa.getByTestId('tpl-save').click();
  await expect(qa.getByTestId(`tpl-row-${SYSTEM}`)).toContainText(/draft · 3 points/, { timeout: 30_000 });
  await qa.getByTestId(`tpl-publish-${SYSTEM}`).click();
  await expect(qa.getByTestId(`tpl-published-${SYSTEM}`)).toHaveText(/^v\d+$/, { timeout: 30_000 });

  // ── 2. QUALITY adopts it into the project, adapts it, submits it ────────────────────────────
  await qa.goto(`/quality/system-checklists?project=${projectId}`, { waitUntil: 'domcontentloaded' });
  const row = qa.getByTestId(`chk-row-${SYSTEM}`);
  await expect(qa.getByTestId(`chk-approved-${SYSTEM}`)).toContainText(/not ready/i);
  await row.getByTestId(`chk-prepare-${SYSTEM}`).click();
  await expect(qa.getByTestId(`chk-open-${SYSTEM}`)).toContainText('Revision 1 · draft', { timeout: 30_000 });
  await qa.getByTestId(`chk-edit-${SYSTEM}`).click();
  await qa.getByTestId(`chk-${SYSTEM}-point-criterion-0`).fill('Two-way speech, clear at 1 m, no echo');
  await qa.getByTestId(`chk-save-${SYSTEM}`).click();
  await expect(qa.getByTestId(`chk-submit-${SYSTEM}`)).toBeVisible({ timeout: 30_000 });
  await qa.getByTestId(`chk-submit-${SYSTEM}`).click();
  await expect(qa.getByTestId(`chk-open-${SYSTEM}`)).toContainText('Revision 1 · submitted', { timeout: 30_000 });

  // NEGATIVE — the preparer cannot approve their own revision.
  await qa.getByTestId(`chk-approve-${SYSTEM}`).click();
  await expect(qa.getByTestId(`chk-error-${SYSTEM}`)).toContainText(/may not approve/i, { timeout: 30_000 });
  await expect(qa.getByTestId(`chk-open-${SYSTEM}`)).toContainText('submitted');

  // ── 3. A SECOND QA/QC person approves it ────────────────────────────────────────────────────
  const approver = await openAs(browser, baseURL!, QAQC_APPROVER);
  await approver.goto(`/quality/system-checklists?project=${projectId}`, { waitUntil: 'domcontentloaded' });
  await approver.getByTestId(`chk-approve-${SYSTEM}`).click();
  await expect(approver.getByTestId(`chk-approved-${SYSTEM}`)).toContainText(`revision 1 approved by ${QAQC_APPROVER}`, { timeout: 30_000 });
  await approver.getByTestId(`chk-points-toggle-${SYSTEM}-1`).click();
  await expect(approver.getByTestId(`chk-points-${SYSTEM}-1`)).toContainText('no echo');
  await expect(approver.getByTestId(`chk-points-${SYSTEM}-1`)).toContainText('Optional');

  const itps = (await (await page.request.get(`${V1}/quality/itps?projectId=${projectId}`, { headers: qaqcApi })).json()) as Array<{ id: string; projectId: string; kind: string; system: string; status: string; reference: string; revision: number }>;
  // The list answers for THIS project only — it used to answer with the whole tenant.
  expect(itps.every((i) => i.projectId === projectId), 'a project-scoped read returns only that project').toBe(true);
  const r1 = itps.find((i) => i.kind === 'system_commissioning' && i.system === SYSTEM && i.status === 'approved')!;
  expect(r1, 'the approved revision is readable').toBeTruthy();

  // NEGATIVE — an approved revision cannot be changed.
  const mutate = await page.request.put(`${V1}/quality/itps/${r1.id}/checklist`, { headers: qaqcApi, data: { title: 'changed after approval' } });
  expect(mutate.status(), 'an approved revision is immutable').toBe(409);
  expect(await mutate.text()).toMatch(/immutable/i);

  // Installation inspection plans and commissioning checklists are never shown as each other.
  await qa.goto(`/quality/itps?projectId=${projectId}`, { waitUntil: 'domcontentloaded' });
  await expect(qa.locator('body')).not.toContainText(r1.reference);

  // ── 4. T&C creates the system FROM the approved revision ────────────────────────────────────
  const tc = await openAs(browser, baseURL!, TC);
  await tc.goto(`/commissioning?project=${projectId}&section=systems`, { waitUntil: 'domcontentloaded' });
  await expect(tc.getByTestId(`cx-coverage-${SYSTEM}`)).toContainText(`${r1.reference} · rev 1`);

  const boundCode = `IC-B-${run}`;
  await tc.getByTestId('register-system').click();
  await tc.getByTestId('system-code').fill(boundCode);
  await tc.getByTestId('system-title').fill('Intercom — Tower A');
  await tc.getByTestId('system-type').selectOption(SYSTEM);
  await expect(tc.getByTestId('register-checklist')).toContainText(`Create it from ${r1.reference} · revision 1`, { timeout: 30_000 });
  await tc.getByTestId('system-save').click();
  await expect(tc.getByTestId('cx-scope')).toContainText(boundCode, { timeout: 30_000 });

  const unboundCode = `IC-U-${run}`;
  await tc.getByTestId('register-system').click();
  await tc.getByTestId('system-code').fill(unboundCode);
  await tc.getByTestId('system-title').fill('Intercom — Podium');
  await tc.getByTestId('system-type').selectOption(SYSTEM);
  await expect(tc.getByTestId('register-from-checklist')).toBeVisible({ timeout: 30_000 });
  await tc.getByTestId('register-from-checklist').uncheck();
  await tc.getByTestId('system-save').click();
  await expect(tc.getByTestId('cx-scope')).toContainText(unboundCode, { timeout: 30_000 });
  await expect(tc.getByTestId(`cx-coverage-state-${SYSTEM}`)).toContainText('1 record not yet bound', { timeout: 30_000 });

  const records = (await (await page.request.get(`${V1}/commissioning/records?projectId=${projectId}`, { headers: tcApi })).json()) as Array<{ id: string; code: string; itpId: string | null; itpRevision: number | null }>;
  const bound = records.find((r) => r.code === boundCode)!;
  const unbound = records.find((r) => r.code === unboundCode)!;
  expect(bound.itpId, 'created FROM the approved revision').toBe(r1.id);
  expect(unbound.itpId, 'registered without it').toBeNull();

  // ── 5. The bound record's points are Quality's — and nothing typed can join them ────────────
  await tc.goto(`/commissioning?project=${projectId}&section=testing`, { waitUntil: 'domcontentloaded' });
  await tc.getByTestId(`cx-open-${boundCode}`).click();
  const panel = tc.getByTestId(`system-panel-${boundCode}`);
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByTestId('cx-checklist-bound')).toContainText(`${r1.reference} · revision 1`);
  await expect(panel.getByTestId('point-origin-IC-01')).toHaveText('mandatory');
  await expect(panel.getByTestId('point-origin-IC-03')).toHaveText('optional');
  await expect(panel.getByTestId('test-point-IC-01')).toContainText('no echo');
  // NEGATIVE — no hand-typed point on a bound record: not offered, and refused if sent.
  await expect(panel.getByTestId('add-test-point')).toHaveCount(0);
  const typed = await page.request.post(`${V1}/commissioning/records/${bound.id}/test-items`, { headers: tcApi, data: { pointNo: 'X-01', description: 'Hand-typed' } });
  expect(typed.status(), 'a hand-typed point on a bound record is refused').toBe(409);
  expect(await typed.text()).toMatch(/hand-typed test point is not allowed/i);

  // NEGATIVE — incomplete mandatory points.
  await panel.getByPlaceholder('Commissioned by').fill('T&C Engineer');
  await panel.getByPlaceholder('Witnessed by (consultant/client)').fill('Consultant');
  await expect(panel.getByTestId('cx-pass-gaps')).toContainText(/2 mandatory points of the approved revision never executed/);
  await panel.getByTestId('btn-commission').click();
  await expect(panel.getByTestId('cx-error')).toContainText(/mandatory point/i, { timeout: 30_000 });

  // Execute: IC-01 passes, IC-02 fails.
  await panel.getByTestId('record-run-IC-01').click();
  await panel.getByTestId('run-actual-IC-01').fill('Clear speech');
  await panel.getByTestId('run-pass-IC-01').click();
  await expect(panel.getByTestId('point-result-IC-01')).toHaveText('pass', { timeout: 30_000 });
  await panel.getByTestId('record-run-IC-02').click();
  await panel.getByTestId('run-actual-IC-02').fill('Lock held 4 s');
  await panel.getByTestId('run-remarks-IC-02').fill('Relay sticking');
  await panel.getByTestId('run-fail-IC-02').click();
  await expect(panel.getByTestId('point-result-IC-02')).toHaveText('fail', { timeout: 30_000 });

  // The failure becomes a defect, where defects are raised.
  await tc.getByTestId('cx-section-defects').click();
  await tc.getByTestId('raise-defect-IC-02').click();
  await expect(tc.getByTestId('defect-raised-IC-02')).toBeVisible({ timeout: 30_000 });

  // NEGATIVE — a failing point and an open defect.
  await tc.getByTestId('cx-section-testing').click();
  await tc.getByTestId(`cx-open-${boundCode}`).click();
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByTestId('cx-pass-gaps')).toContainText(/failing — retest required \(IC-02\)/);
  await expect(panel.getByTestId('cx-pass-gaps')).toContainText(/1 open defect/);
  await panel.getByPlaceholder('Commissioned by').fill('T&C Engineer');
  await panel.getByPlaceholder('Witnessed by (consultant/client)').fill('Consultant');
  await panel.getByTestId('btn-commission').click();
  await expect(panel.getByTestId('cx-error')).toContainText(/failing|open defect/i, { timeout: 30_000 });

  // Retest passes; the failure stays in the lineage.
  await panel.getByTestId('record-run-IC-02').click();
  await panel.getByTestId('run-actual-IC-02').fill('Released in 0.5 s');
  await panel.getByTestId('run-remarks-IC-02').fill('Relay replaced and re-tested');
  await panel.getByTestId('run-pass-IC-02').click();
  await expect(panel.getByTestId('point-result-IC-02')).toHaveText('pass', { timeout: 30_000 });
  await expect(panel.getByTestId('run-IC-02-1')).toContainText('fail');
  await expect(panel.getByTestId('run-IC-02-2')).toContainText('pass');

  // NEGATIVE — the open defect alone still blocks.
  await expect(panel.getByTestId('cx-pass-gaps')).toHaveText(/1 open defect/, { timeout: 30_000 });
  await panel.locator('[data-testid^="close-punch-"]').first().click();
  await expect(panel.getByTestId('punch-gate')).toHaveCount(0, { timeout: 30_000 });

  // PASS: every mandatory point passed, nothing failing, no defect open — IC-03 (optional) never ran.
  await panel.getByPlaceholder('Commissioned by').fill('T&C Engineer');
  await panel.getByPlaceholder('Witnessed by (consultant/client)').fill('Consultant');
  await panel.getByTestId('btn-commission').click();
  await expect(panel.getByTestId('cx-locked')).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByTestId('point-result-IC-03')).toHaveText('pending');

  // ── 6. The unbound record: refused, then bound by a person ──────────────────────────────────
  await tc.getByTestId(`cx-open-${unboundCode}`).click();
  const other = tc.getByTestId(`system-panel-${unboundCode}`);
  await expect(other).toBeVisible({ timeout: 30_000 });
  await expect(other.getByTestId('cx-checklist-unbound')).toContainText(`${r1.reference} · revision 1`, { timeout: 30_000 });
  // NEGATIVE — an unbound record is not commissioned, whatever it holds.
  await other.getByPlaceholder('Commissioned by').fill('T&C Engineer');
  await other.getByPlaceholder('Witnessed by (consultant/client)').fill('Consultant');
  await other.getByTestId('btn-commission').click();
  await expect(other.getByTestId('cx-error')).toContainText(/only a system bound to an approved ITP revision/i, { timeout: 30_000 });
  await other.getByTestId('cx-checklist-bind').click();
  await expect(other.getByTestId('cx-checklist-bound')).toContainText(`${r1.reference} · revision 1`, { timeout: 30_000 });
  await expect(other.getByTestId('test-point-IC-02')).toBeVisible();

  // NEGATIVE — another project's checklist, another system's, and a second binding.
  const p2 = await page.request.post(`${V1}/commissioning/records`, { headers: tcApi, data: { projectId: otherProjectId, code: `IC-P2-${run}`, title: 'Intercom elsewhere', system: SYSTEM } });
  const crossProject = await page.request.post(`${V1}/commissioning/records/${(await p2.json()).id}/checklist-binding`, { headers: tcApi, data: { itpId: r1.id } });
  expect(crossProject.status()).toBe(409);
  expect(await crossProject.text()).toMatch(/different project/i);
  const cctv = await page.request.post(`${V1}/commissioning/records`, { headers: tcApi, data: { projectId, code: `CC-${run}`, title: 'CCTV', system: 'cctv' } });
  const crossSystem = await page.request.post(`${V1}/commissioning/records/${(await cctv.json()).id}/checklist-binding`, { headers: tcApi, data: { itpId: r1.id } });
  expect(crossSystem.status()).toBe(409);
  expect(await crossSystem.text()).toMatch(/different system/i);
  const rebind = await page.request.post(`${V1}/commissioning/records/${unbound.id}/checklist-binding`, { headers: tcApi, data: { itpId: r1.id } });
  expect(rebind.status(), 'a binding is pinned once made').toBe(409);

  // ── 7. Revision 2 applies to NEW records only ───────────────────────────────────────────────
  await qa.goto(`/quality/system-checklists?project=${projectId}`, { waitUntil: 'domcontentloaded' });
  await qa.getByTestId(`chk-revise-${SYSTEM}`).click();
  await expect(qa.getByTestId(`chk-open-${SYSTEM}`)).toContainText('Revision 2 · draft', { timeout: 30_000 });
  await qa.getByTestId(`chk-submit-${SYSTEM}`).click();
  await expect(qa.getByTestId(`chk-open-${SYSTEM}`)).toContainText('Revision 2 · submitted', { timeout: 30_000 });
  const r2 = (await (await page.request.get(`${V1}/quality/itps?projectId=${projectId}`, { headers: qaqcApi })).json() as Array<{ id: string; system: string; revision: number; kind: string }>)
    .find((i) => i.kind === 'system_commissioning' && i.system === SYSTEM && i.revision === 2)!;
  const approved2 = await page.request.post(`${V1}/quality/itps/${r2.id}/approve`, { headers: approverApi, data: {} });
  expect(approved2.ok(), `revision 2 approved by the second QA/QC: ${await approved2.text()}`).toBe(true);

  // The record executing revision 1 stays on it, and says so.
  await tc.goto(`/commissioning?project=${projectId}&section=testing`, { waitUntil: 'domcontentloaded' });
  await tc.getByTestId(`cx-open-${unboundCode}`).click();
  await expect(tc.getByTestId(`system-panel-${unboundCode}`).getByTestId('cx-checklist-superseded')).toBeVisible({ timeout: 30_000 });
  const pinned = (await (await page.request.get(`${V1}/commissioning/records/${bound.id}`, { headers: tcApi })).json()) as { itpRevision: number; status: string };
  expect(pinned).toMatchObject({ itpRevision: 1, status: 'commissioned' });

  // NEGATIVE — the superseded revision cannot be bound; a new record takes revision 2.
  const late = await page.request.post(`${V1}/commissioning/records`, { headers: tcApi, data: { projectId, code: `IC-L-${run}`, title: 'Intercom — Car park', system: SYSTEM } });
  const lateId = ((await late.json()) as { id: string }).id;
  const toSuperseded = await page.request.post(`${V1}/commissioning/records/${lateId}/checklist-binding`, { headers: tcApi, data: { itpId: r1.id } });
  expect(toSuperseded.status()).toBe(409);
  expect(await toSuperseded.text()).toMatch(/superseded/i);
  const fresh = await page.request.post(`${V1}/commissioning/records`, { headers: tcApi, data: { projectId, code: `IC-N-${run}`, title: 'Intercom — Tower B', system: SYSTEM, itpId: r2.id } });
  expect(fresh.status()).toBe(201);
  expect(((await fresh.json()) as { itpRevision: number }).itpRevision).toBe(2);

  // ── 8. Each authority stays with its owner ──────────────────────────────────────────────────
  // T&C executes the checklist; it does not write, adopt or approve one.
  const tcTemplate = await page.request.post(`${V1}/quality/itp-templates`, {
    headers: tcApi, data: { system: SYSTEM, title: 'x', points: [{ code: 'A', activity: 'a', acceptanceCriteria: 'c' }] },
  });
  expect(tcTemplate.status(), 'T&C may not write a template').toBe(403);
  const tcAdopt = await page.request.post(`${V1}/quality/itps/system`, { headers: tcApi, data: { projectId, templateId: r2.id } });
  expect(tcAdopt.status(), 'T&C may not adopt a template into the project').toBe(403);
  const tcApprove = await page.request.post(`${V1}/quality/itps/${r2.id}/approve`, { headers: tcApi, data: {} });
  expect(tcApprove.status(), 'T&C may not approve a checklist').toBe(403);
  // Quality writes the checklist; it does not choose which record executes it.
  const qaBind = await page.request.post(`${V1}/commissioning/records/${lateId}/checklist-binding`, { headers: qaqcApi, data: { itpId: r2.id } });
  expect(qaBind.status(), 'QA/QC may not bind a commissioning record').toBe(403);
});
