import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { memberPassword, signInAs } from './project-member-harness';

/**
 * STU-04 / J1-03 — CLIENT AND AUTHORITY REQUIREMENTS, from the Sales enquiry into the study, each
 * linked to the document it comes from, to its compliance and to the clarifications raised on it.
 *
 *   pre-sales          finds the enquiry's requirement and context already in the study (the J1-03
 *                      finding: they never reached it); cites the client specification for it; adds
 *                      a government/authority requirement cited to the authority circular; raises
 *                      an RFI against it; saves and reloads
 *   refused            a requirement citing a document the revision does not freeze, an RFI naming
 *                      a requirement the revision does not record, a viewer reading the study
 *   technical manager  reads each requirement with its category, source and source document, and the
 *                      RFI raised against it; opens the cited revision; approves
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const USERS = { sales: 'u-e2e-sales', presales: 'u-e2e-presales', techmgr: 'u-e2e-techmgr', viewer: 'u-e2e-viewer' } as const;
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

function pdf(text: string): Buffer {
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

test.describe('STU-04 — client and authority requirements are recorded, sourced and reviewed', () => {
  test.setTimeout(480_000);

  test('enquiry requirement arrives → sourced client and authority requirements → RFI against one → reviewer reads and approves', async ({ browser, request, baseURL }) => {
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
    const requirement = `Access control on every tower lobby door ${run}`;

    const lead = await call<{ id: string }>('sales', 'POST', '/crm/leads', {
      name: `Creek towers ${run}`, companyName: `Creek Towers ${run}`, requirement, systems: ['access_control'],
      projectName: `Creek Towers ${run}`, projectLocation: 'Dubai Creek Harbour',
    });
    await call('sales', 'PATCH', `/crm/leads/${lead.id}`, { status: 'qualified' });
    const converted = await call<{ opportunity: { id: string }; preSalesAssignment: { assignment: { id: string } } }>('sales', 'POST', `/crm/leads/${lead.id}/convert`, {
      requiresTender: false,
      preSalesAssignment: { assigneeId: USERS.presales, reviewerId: USERS.techmgr, dueDate: '2026-10-22', inputRevision: 'Tower brief Rev 01', deliverables: ['Requirements matrix', 'Technical study'] },
    });
    const O = converted.opportunity.id;
    await call('presales', 'POST', `/work-items/presales-assignment/${converted.preSalesAssignment.assignment.id}/accept`);

    // ── The enquiry's requirement and context are already in the study (J1-03) ────────────────────
    const presales = await seat(browser, baseURL!, USERS.presales);
    await presales.goto(`/crm/opportunities/${O}?area=study`, { waitUntil: 'domcontentloaded' });
    const intake = presales.getByTestId('sales-intake-context');
    await expect(intake).toContainText(requirement, { timeout: 30_000 });
    await expect(intake).toContainText('Dubai Creek Harbour');
    await expect(presales.getByLabel('Requirement statement 1')).toHaveValue(requirement);
    await expect(presales.getByLabel('Requirement statement 1')).toHaveAttribute('readonly', '');
    await expect(presales.getByText('Linked from Sales intake', { exact: false })).toBeVisible();

    // ── Source documents, uploaded on screen and frozen into the revision ─────────────────────────
    const specTitle = `Creek client specification ${run}`;
    const circularTitle = `Civil Defence circular 12 ${run}`;
    for (const [kind, title, name] of [['client_specification', specTitle, 'spec'], ['authority_requirement', circularTitle, 'circular']] as const) {
      await presales.getByLabel('Evidence type').selectOption(kind);
      await presales.getByLabel('Evidence title').fill(title);
      await presales.getByLabel('Source file · up to 25 MB').setInputFiles({ name: `${name}-${run}.pdf`, mimeType: 'application/pdf', buffer: pdf(`${title}`) });
      await presales.getByRole('button', { name: 'Upload study evidence' }).click();
      await expect(presales.getByLabel(`Use ${title} in this study revision`)).toBeVisible({ timeout: 30_000 });
      await presales.getByLabel(`Use ${title} in this study revision`).check();
    }

    await presales.getByLabel('Study title').fill(`Creek towers study ${run}`);
    await presales.getByLabel('Scope summary').fill('Access control for the tower lobbies, interfaced to the fire alarm.');
    await presales.getByLabel('Design basis 1').fill('Card readers on lobby doors');
    await presales.getByLabel('Requirement source document 1').selectOption({ label: `${specTitle} · rev 1` });
    await presales.getByLabel('Acceptance criteria 1').fill('Every lobby door controlled');
    await presales.getByLabel('Technical response 1').fill('Included');
    await presales.getByLabel('Compliance 1').selectOption('compliant');
    await presales.getByRole('button', { name: '+ Add requirement' }).click();
    await presales.getByLabel('Requirement category 2').selectOption('authority');
    await presales.getByLabel('Requirement statement 2').fill('Doors release on fire alarm');
    await presales.getByLabel('Requirement source 2').fill('CD circular 12 s.4');
    await presales.getByLabel('Requirement source document 2').selectOption({ label: `${circularTitle} · rev 1` });
    await presales.getByLabel('Acceptance criteria 2').fill('Fail-safe release on alarm');
    await presales.getByLabel('Technical response 2').fill('Dry-contact interface to the fire panel');
    await presales.getByLabel('Compliance 2').selectOption('compliant');
    await presales.getByRole('button', { name: '+ Add clarification / RFI' }).click();
    await presales.getByLabel('Clarification 1').fill('Is the fire panel interface by dry contact acceptable?');
    await presales.getByLabel('Clarification requested from 1').fill('Fire consultant');
    await presales.getByLabel('Clarification status 1').selectOption('closed');
    await presales.getByLabel('Clarification answer 1').fill('Yes, by dry contact');
    await presales.getByLabel('Clarification reference 1').fill('RFI-07');
    await presales.getByLabel('Clarification requirement 1').selectOption('CD circular 12 s.4');
    await presales.getByRole('button', { name: 'Create study draft' }).click();
    await expect(presales.getByText(/S-001 · draft/i)).toBeVisible({ timeout: 30_000 });

    await presales.reload({ waitUntil: 'domcontentloaded' });
    await expect(presales.getByLabel('Requirement category 2'), 'the requirements survive a reload').toHaveValue('authority', { timeout: 30_000 });
    await expect(presales.getByLabel('Requirement source document 2').locator('option:checked')).toHaveText(`${circularTitle} · rev 1`);
    await expect(presales.getByLabel('Requirement source document 1').locator('option:checked')).toHaveText(`${specTitle} · rev 1`);
    await expect(presales.getByLabel('Clarification requirement 1')).toHaveValue('CD circular 12 s.4');

    // ── Refused ────────────────────────────────────────────────────────────────────────────────────
    const studies = `/crm/opportunities/${O}/pre-award-package/studies`;
    const [study] = await call<Array<Record<string, unknown> & { id: string; updatedAt: string; evidence: Array<{ documentId: string; title: string }>; requirements: Array<{ sourceDocumentId: string | null; category: string }>; clarifications: Array<{ requirementRef: string }> }>>('presales', 'GET', studies);
    expect(study.requirements.map((r) => r.category)).toEqual(['client', 'authority']);
    expect(study.requirements.every((r) => r.sourceDocumentId)).toBe(true);
    expect(study.clarifications[0].requirementRef).toBe('CD circular 12 s.4');
    const body = {
      title: study.title, inputRevision: study.inputRevision, reviewerId: study.reviewerId, scopeSummary: study.scopeSummary,
      systems: study.systems, requirements: study.requirements, surveyFindings: study.surveyFindings, clarifications: study.clarifications,
      deviations: [], assumptions: [], exclusions: [], evidence: study.evidence, expectedUpdatedAt: study.updatedAt,
    };
    const unfrozen = await raw('presales', 'PATCH', `${studies}/${study.id}`, { ...body, evidence: study.evidence.filter((e) => e.title !== circularTitle) });
    expect(unfrozen.status(), 'a requirement cannot cite a document the revision does not freeze').toBe(400);
    expect(String((await unfrozen.json()).message)).toContain('a requirement must cite a source document frozen into this study revision');
    const stray = await raw('presales', 'PATCH', `${studies}/${study.id}`, { ...body, clarifications: [{ ...study.clarifications[0], requirementRef: 'Spec 99' }] });
    expect(stray.status(), 'an RFI cannot name a requirement the revision does not record').toBe(400);
    expect(String((await stray.json()).message)).toContain('a clarification must name a requirement recorded in this study revision');
    expect((await raw('viewer', 'GET', studies)).status(), 'a viewer does not read the study').toBe(403);

    await presales.getByRole('button', { name: 'Submit for technical review' }).click();
    await expect(presales.getByText(/S-001 · in review/i)).toBeVisible({ timeout: 30_000 });

    // ── The reviewer reads the requirements with their sources and the RFI, opens a source, approves ─
    const techmgr = await seat(browser, baseURL!, USERS.techmgr);
    await techmgr.goto('/my-work/tasks', { waitUntil: 'domcontentloaded' });
    const review = techmgr.locator(`[data-testid="work-item"][data-task-id="${study.id}"]`);
    await expect(review).toContainText('Technical study review', { timeout: 30_000 });
    await review.getByRole('link', { name: new RegExp(`Creek towers study ${run}`) }).first().click();
    const assessed = techmgr.getByRole('table', { name: 'Assessed requirements' });
    await expect(assessed).toContainText('government / authority', { timeout: 30_000 });
    await expect(assessed).toContainText('CD circular 12 s.4');
    await expect(assessed).toContainText(`${circularTitle} · rev 1`);
    await expect(assessed).toContainText(`${specTitle} · rev 1`);
    await expect(techmgr.getByRole('table', { name: 'Clarifications' })).toContainText('CD circular 12 s.4');
    await techmgr.getByPlaceholder('Review comment / decision basis').fill('Requirements and sources confirmed.');
    await techmgr.getByRole('button', { name: 'Approve technical basis' }).click();
    await expect(techmgr.getByText('Technical basis approved for quantity take-off and estimating.')).toBeVisible({ timeout: 30_000 });
    const circular = study.evidence.find((e) => e.title === circularTitle)!;
    await techmgr.getByRole('row', { name: /Doors release on fire alarm/ }).getByRole('button', { name: 'Open source revision' }).click();
    await expect(techmgr).toHaveURL(new RegExp(`/documents/${circular.documentId}/pdf\\?version=1`), { timeout: 30_000 });
    await expect(techmgr.getByText(`circular-${run}.pdf · Version 1`)).toBeVisible({ timeout: 30_000 });
  });
});
