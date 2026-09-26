import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { memberPassword, signInAs } from './project-member-harness';

/**
 * STU-02 / J1-05 — A SITE SURVEY ON AN EXISTING OPPORTUNITY, recorded in its study, cited to the
 * survey sheet the study freezes, and read by the reviewer who decides on it.
 *
 *   pre-sales          on the opportunity's study: uploads the survey sheet, records findings on
 *                      screen, cites the sheet, saves and reloads
 *   refused            a finding citing a sheet the revision does not freeze, a sheet from another
 *                      opportunity, a viewer reading the study, the estimator writing it
 *   technical manager  receives the study in My Work, reads each finding with the revision it
 *                      cites, opens that revision, and approves
 *   frozen             the sheet is re-issued after approval; the approved survey still cites rev 1
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const USERS = { sales: 'u-e2e-sales', presales: 'u-e2e-presales', techmgr: 'u-e2e-techmgr', estimator: 'u-e2e-estimator', viewer: 'u-e2e-viewer' } as const;
type Actor = keyof typeof USERS;
type Headers = Record<string, string>;

async function bearer(request: APIRequestContext, username: string): Promise<Headers | null> {
  const res = await request.post(`${API}/auth/login`, { data: { username, password: memberPassword() } }).catch(() => null);
  if (!res?.ok()) return null;
  const token = ((await res.json()) as { token?: string }).token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

async function seat(browser: Browser, baseURL: string, username: string): Promise<Page> {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  expect(await signInAs(page, baseURL, username), `${username} could not sign in`).toBe(true);
  return page;
}

/** A small, valid one-page PDF — a real survey sheet a viewer can render. */
function sheetPdf(text: string): Buffer {
  const content = `BT /F1 18 Tf 72 760 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

test.describe('STU-02 — a site survey on an existing opportunity is recorded, cited and reviewed', () => {
  test.setTimeout(480_000);

  test('survey sheet → findings cite it → save/reload → refusals → reviewer reads and approves → frozen citation', async ({ browser, request, baseURL }) => {
    test.skip(!memberPassword(), 'requires the Auth-ON local API and the e2e password');
    const tokens = {} as Record<Actor, Headers>;
    for (const [actor, username] of Object.entries(USERS) as Array<[Actor, string]>) {
      const t = await bearer(request, username);
      test.skip(!t, `${username} is not provisioned`);
      tokens[actor] = t!;
    }
    const raw = (actor: Actor, method: 'GET' | 'POST' | 'PATCH', path: string, data?: unknown) =>
      request.fetch(`${API}${path}`, { method, headers: tokens[actor], data });
    const call = async <T>(actor: Actor, method: 'GET' | 'POST' | 'PATCH', path: string, data?: unknown): Promise<T> => {
      const res = await raw(actor, method, path, data);
      expect(res.ok(), `${actor} ${method} ${path}: ${res.status()} ${await res.text()}`).toBe(true);
      return (await res.json().catch(() => ({}))) as T;
    };
    const run = Date.now().toString().slice(-6);

    // ── An existing direct opportunity, its study assigned to Pre-Sales and accepted ──────────────
    const lead = await call<{ id: string }>('sales', 'POST', '/crm/leads', {
      name: `Palm villas survey ${run}`, companyName: `Palm Villas ${run}`, requirement: 'Villa CCTV and access control', systems: ['cctv'],
    });
    await call('sales', 'PATCH', `/crm/leads/${lead.id}`, { status: 'qualified' });
    const converted = await call<{ opportunity: { id: string }; preSalesAssignment: { assignment: { id: string } } }>('sales', 'POST', `/crm/leads/${lead.id}/convert`, {
      requiresTender: false,
      preSalesAssignment: { assigneeId: USERS.presales, reviewerId: USERS.techmgr, dueDate: '2026-10-20', inputRevision: 'Villa brief Rev A', deliverables: ['Site survey', 'Technical study'] },
    });
    const O = converted.opportunity.id;
    await call('presales', 'POST', `/work-items/presales-assignment/${converted.preSalesAssignment.assignment.id}/accept`);
    const sheetTitle = `Villa 12 site survey sheet ${run}`;
    const rev1 = sheetPdf(`Villa 12 survey ${run} rev 1`);

    // ── On screen: the survey sheet, the findings, the citation ───────────────────────────────────
    const presales = await seat(browser, baseURL!, USERS.presales);
    await presales.goto(`/crm/opportunities/${O}?area=study`, { waitUntil: 'domcontentloaded' });
    await expect(presales.getByRole('heading', { name: 'Technical Study' })).toBeVisible({ timeout: 30_000 });
    await presales.getByLabel('Evidence type').selectOption('site_survey');
    await presales.getByLabel('Evidence title').fill(sheetTitle);
    await presales.getByLabel('Source file · up to 25 MB').setInputFiles({ name: `villa-12-survey-${run}.pdf`, mimeType: 'application/pdf', buffer: rev1 });
    await presales.getByRole('button', { name: 'Upload study evidence' }).click();
    await expect(presales.getByLabel(`Use ${sheetTitle} in this study revision`)).toBeVisible({ timeout: 30_000 });
    await presales.getByLabel(`Use ${sheetTitle} in this study revision`).check();
    await presales.getByLabel('Study title').fill(`Palm villas study ${run}`);
    await presales.getByLabel('Scope summary').fill('CCTV and access control for villa 12.');
    await presales.getByLabel('Design basis 1').fill('IP CCTV, 4MP');
    await presales.getByLabel('Acceptance criteria 1').fill('Perimeter covered');
    await presales.getByLabel('Technical response 1').fill('Included');
    await presales.getByLabel('Compliance 1').selectOption('compliant');
    await presales.getByRole('button', { name: '+ Add survey finding' }).click();
    await presales.getByLabel('Survey area 1').fill('Boundary wall, east');
    await presales.getByLabel('Survey observation 1').fill('No containment route along the wall');
    await presales.getByLabel('Survey impact 1').fill('Surface conduit, 60 m');
    await presales.getByLabel(`Survey finding 1 cites ${sheetTitle}`).check();
    await presales.getByRole('button', { name: 'Create study draft' }).click();
    await expect(presales.getByText(/S-001 · draft/i)).toBeVisible({ timeout: 30_000 });
    await presales.reload({ waitUntil: 'domcontentloaded' });
    await expect(presales.getByLabel('Survey observation 1'), 'the finding survives a reload').toHaveValue('No containment route along the wall', { timeout: 30_000 });
    await expect(presales.getByLabel(`Survey finding 1 cites ${sheetTitle}`)).toBeChecked();

    // ── Refused ────────────────────────────────────────────────────────────────────────────────────
    const studies = `/crm/opportunities/${O}/pre-award-package/studies`;
    const [study] = await call<Array<{ id: string; updatedAt: string; title: string; inputRevision: string; reviewerId: string; scopeSummary: string; systems: unknown[]; requirements: unknown[]; surveyFindings: Array<{ id: string; area: string; observation: string; impact: string; evidenceDocumentIds: string[] }>; evidence: Array<{ documentId: string; revision: string }> }>>('presales', 'GET', studies);
    const sheetId = study.evidence[0].documentId;
    expect(study.surveyFindings).toEqual([expect.objectContaining({ area: 'Boundary wall, east', evidenceDocumentIds: [sheetId] })]);
    const body = {
      title: study.title, inputRevision: study.inputRevision, reviewerId: study.reviewerId, scopeSummary: study.scopeSummary,
      systems: study.systems, requirements: study.requirements, surveyFindings: study.surveyFindings,
      clarifications: [], deviations: [], assumptions: [], exclusions: [], expectedUpdatedAt: study.updatedAt,
    };
    const unfrozen = await raw('presales', 'PATCH', `${studies}/${study.id}`, { ...body, evidence: [] });
    expect(unfrozen.status(), 'a finding cannot cite a sheet the revision does not freeze').toBe(400);
    expect(String((await unfrozen.json()).message)).toContain('a survey finding must cite evidence frozen into this study revision');
    const other = await call<{ id: string }>('sales', 'POST', '/crm/opportunities', { title: `Unrelated villa ${run}`, executionType: 'direct_sale', value: 1 });
    const foreignUpload = await request.post(`${API}/crm/opportunities/${other.id}/pre-award-package/evidence`, {
      headers: tokens.presales, multipart: { category: 'site_survey', title: `Foreign survey ${run}`, file: { name: 'foreign.pdf', mimeType: 'application/pdf', buffer: sheetPdf('foreign') } },
    });
    expect(foreignUpload.status(), await foreignUpload.text()).toBe(201);
    const foreignId = ((await foreignUpload.json()) as { document: { id: string } }).document.id;
    const crossed = await raw('presales', 'PATCH', `${studies}/${study.id}`, {
      ...body, evidence: [...study.evidence, { documentId: foreignId, title: 'x', kind: 'site_survey', revision: '1' }],
      surveyFindings: [{ ...study.surveyFindings[0], evidenceDocumentIds: [sheetId, foreignId] }],
    });
    expect(crossed.status(), 'a sheet from another opportunity cannot be cited').toBe(400);
    expect(String((await crossed.json()).message)).toContain('study evidence must belong to this opportunity');
    expect((await raw('viewer', 'GET', studies)).status(), 'a viewer does not read the study').toBe(403);
    expect((await raw('estimator', 'PATCH', `${studies}/${study.id}`, { ...body, evidence: study.evidence })).status(), 'the estimator does not write it').toBe(403);

    await presales.getByRole('button', { name: 'Submit for technical review' }).click();
    await expect(presales.getByText(/S-001 · in review/i)).toBeVisible({ timeout: 30_000 });

    // ── The reviewer receives it, reads the survey with what it cites, and approves ───────────────
    const techmgr = await seat(browser, baseURL!, USERS.techmgr);
    await techmgr.goto('/my-work/tasks', { waitUntil: 'domcontentloaded' });
    const review = techmgr.locator(`[data-testid="work-item"][data-task-id="${study.id}"]`);
    await expect(review).toContainText('Technical study review', { timeout: 30_000 });
    await review.getByRole('link', { name: new RegExp(`Palm villas study ${run}`) }).first().click();
    const findings = techmgr.getByRole('table', { name: 'Site survey findings' });
    await expect(findings).toContainText('Boundary wall, east', { timeout: 30_000 });
    await expect(findings).toContainText('Surface conduit, 60 m');
    await expect(findings).toContainText(`${sheetTitle} · rev 1`);
    await techmgr.getByPlaceholder('Review comment / decision basis').fill('Survey basis accepted.');
    await techmgr.getByRole('button', { name: 'Approve technical basis' }).click();
    await expect(techmgr.getByText('Technical basis approved for quantity take-off and estimating.')).toBeVisible({ timeout: 30_000 });

    // ── Frozen: the sheet is re-issued; the approved survey still cites, and opens, revision 1 ────
    const reissued = await request.post(`${API}/crm/opportunities/${O}/pre-award-package/evidence/${sheetId}/versions`, {
      headers: tokens.presales, multipart: { note: 'Survey re-walked', file: { name: `villa-12-survey-${run}-r2.pdf`, mimeType: 'application/pdf', buffer: sheetPdf(`Villa 12 survey ${run} rev 2`) } },
    });
    expect(reissued.status(), await reissued.text()).toBe(201);
    await techmgr.goto(`/crm/opportunities/${O}?area=study`, { waitUntil: 'domcontentloaded' });
    const approvedFindings = techmgr.getByRole('table', { name: 'Site survey findings' });
    await expect(approvedFindings).toContainText(`${sheetTitle} · rev 1`, { timeout: 30_000 });
    await approvedFindings.getByRole('button', { name: 'Open cited revision' }).click();
    await expect(techmgr).toHaveURL(new RegExp(`/documents/${sheetId}/pdf\\?version=1`), { timeout: 30_000 });
    await expect(techmgr.getByText(`villa-12-survey-${run}.pdf · Version 1`)).toBeVisible({ timeout: 30_000 });
    const cited = await techmgr.request.get(`/api/documents/${sheetId}/content?version=1`);
    expect(cited.status()).toBe(200);
    expect(Buffer.compare(await cited.body(), rev1), 'the reviewer reads the survey sheet he approved, byte for byte').toBe(0);
  });
});
