import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { memberPassword, signInAs } from './project-member-harness';

/**
 * J1-02 / J1-12 / J1-13 — THE SALES ENQUIRY, captured once, owned, followed up and handed over
 * (INT-02 site and systems, INT-03 deadlines and owner, INT-06 follow-up and enquiry documents).
 *
 *   sales manager      captures the enquiry on screen — customer, site, systems, scope — and assigns
 *                      it to a Sales rep with a reason
 *   sales rep          is notified ONCE, addressed to them (it was a tenant-wide broadcast); schedules
 *                      dated follow-ups on the enquiry, one already overdue, and completes it with an
 *                      outcome and the next follow-up; uploads the client specification and its
 *                      revision 2 on the enquiry
 *   pre-sales          receives the same context without re-entry, the same document at revision 2,
 *                      and the enquiry's history through the journey link to the lead itself
 *   reviewer / others  the reviewer opens the same revision; the estimator is refused it
 *   copy = gate        a governed quote's readiness says it cannot be approved, and the gate refuses
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const USERS = {
  sales: 'u-e2e-sales', salesmgr: 'u-e2e-salesmgr', presales: 'u-e2e-presales', techmgr: 'u-e2e-techmgr', estimator: 'u-e2e-estimator',
} as const;
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

const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

test.describe('J1-02/12/13 — the Sales enquiry is captured once, owned, followed up and handed over', () => {
  test.setTimeout(480_000);

  test('capture → assign → notified once → dated follow-ups → documents → Pre-Sales receives it all', async ({ browser, request, baseURL }) => {
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
    const contact = `Rania Haddad ${run}`;
    const requirement = `CCTV and access control for the Al Khail warehouse ${run}`;

    // ── INT-02: the Sales Manager captures the whole job once, on screen ──────────────────────────
    const manager = await seat(browser, baseURL!, USERS.salesmgr);
    await manager.goto('/crm/leads', { waitUntil: 'domcontentloaded' });
    await manager.getByRole('button', { name: '+ New Lead' }).click();
    const capture = manager.getByRole('dialog', { name: 'New lead' });
    await capture.getByLabel('Company / customer').fill(`Al Khail Logistics ${run}`);
    await capture.getByLabel('Contact person *').fill(contact);
    await capture.getByLabel('Phone').fill('+971501234567');
    await capture.getByLabel('Email').fill(`rania-${run}@example.invalid`);
    await capture.getByLabel('Interest / requirement').fill(requirement);
    await capture.getByLabel('Project / site name').fill(`Al Khail warehouse ${run}`);
    await capture.getByLabel('Location').fill('Al Quoz Industrial 3, plot 12');
    await capture.getByRole('checkbox', { name: 'CCTV' }).check();
    await capture.getByRole('checkbox', { name: 'Access Control' }).check();
    await capture.getByRole('button', { name: /Save lead|Create anyway/ }).click();
    await expect(capture).toBeHidden({ timeout: 30_000 });
    let lead = { id: '', assignedTo: null as string | null };
    await expect(async () => {
      const found = await call<Array<{ id: string; name: string; assignedTo: string | null; systems: string[] | null; projectLocation: string | null }>>('salesmgr', 'GET', `/crm/leads?search=${encodeURIComponent(contact)}`);
      const row = found.find((l) => l.name === contact);
      expect(row).toBeTruthy();
      expect(row!.systems).toEqual(['cctv', 'access_control']);
      expect(row!.projectLocation).toBe('Al Quoz Industrial 3, plot 12');
      lead = row!;
    }).toPass({ timeout: 30_000 });

    // ── INT-03: the manager assigns the owner on the lead, with a reason ──────────────────────────
    await manager.goto(`/crm/leads/${lead.id}`, { waitUntil: 'domcontentloaded' });
    await manager.getByLabel('Assign lead to').selectOption(USERS.sales);
    const reason = manager.getByPlaceholder('Reason (required)');
    if (await reason.isVisible().catch(() => false)) await reason.fill('Dubai industrial territory');
    await manager.getByRole('button', { name: 'Assign', exact: true }).click();
    await expect(async () => {
      expect((await call<{ assignedTo: string }>('salesmgr', 'GET', `/crm/leads/${lead.id}`)).assignedTo).toBe(USERS.sales);
    }).toPass({ timeout: 30_000 });

    // …the rep is told, ONCE, addressed to them — and nobody else receives someone else's work.
    await expect(async () => {
      const mine = (await call<Array<{ refId: string | null; title: string; userId: string | null }>>('sales', 'GET', '/notifications'))
        .filter((n) => n.refId === lead.id && n.title === 'Lead assigned to you');
      expect(mine).toHaveLength(1);
      expect(mine[0].userId).toBe(USERS.sales);
    }).toPass({ timeout: 30_000 });
    const others = (await call<Array<{ refId: string | null }>>('presales', 'GET', '/notifications')).filter((n) => n.refId === lead.id);
    expect(others, 'the assignment is not broadcast to the tenant').toEqual([]);

    // ── INT-03 / INT-06: dated follow-ups scheduled on the enquiry, one already overdue ───────────
    const rep = await seat(browser, baseURL!, USERS.sales);
    await rep.goto(`/crm/leads/${lead.id}`, { waitUntil: 'domcontentloaded' });
    const followUps = rep.getByTestId('lead-follow-ups');
    await expect(followUps.getByTestId('follow-up-rules')).toContainText(USERS.sales, { timeout: 30_000 });
    await followUps.getByLabel('Follow-up type').selectOption('call');
    await followUps.getByLabel('Follow-up subject').fill(`Call Rania to confirm the site visit ${run}`);
    await followUps.getByLabel('Follow-up due date').fill(day(-1));
    await followUps.getByRole('button', { name: 'Schedule follow-up' }).click();
    await expect(followUps.getByRole('status')).toContainText(`Scheduled for ${day(-1)} — it is on ${USERS.sales}'s My Work`, { timeout: 30_000 });
    const overdueRow = followUps.getByTestId('lead-follow-up').filter({ hasText: `Call Rania to confirm the site visit ${run}` });
    await expect(overdueRow).toContainText(`Overdue · due ${day(-1)}`);
    const [scheduled] = await call<Array<{ id: string; assigneeId: string; dueDate: string }>>('sales', 'GET', `/crm/activities?relatedType=lead&relatedId=${lead.id}`);
    expect(scheduled).toMatchObject({ assigneeId: USERS.sales, dueDate: day(-1) });

    // …it reaches the rep's My Work once, as high priority.
    await rep.goto('/my-work/tasks', { waitUntil: 'domcontentloaded' });
    const work = rep.locator(`[data-testid="work-item"][data-task-id="${scheduled.id}"]`);
    await expect(work).toHaveCount(1, { timeout: 30_000 });
    await expect(work.getByLabel('high priority')).toBeVisible();

    // …and is completed on the enquiry, with its outcome and the next follow-up.
    await rep.goto(`/crm/leads/${lead.id}`, { waitUntil: 'domcontentloaded' });
    await overdueRow.getByRole('button', { name: 'Complete' }).click({ timeout: 30_000 });
    await followUps.getByLabel('Follow-up outcome').fill('Site visit agreed for Thursday');
    await followUps.getByLabel('Next follow-up subject').fill(`Walk the warehouse with Rania ${run}`);
    await followUps.getByLabel('Next follow-up due date').fill(day(3));
    await followUps.getByRole('button', { name: 'Record outcome' }).click();
    await expect(followUps.getByRole('status')).toContainText(`Completed, and the next follow-up is scheduled for ${day(3)}.`, { timeout: 30_000 });
    await expect(followUps.getByTestId('lead-follow-up').filter({ hasText: `Walk the warehouse with Rania ${run}` })).toContainText(`due ${day(3)}`);

    // ── INT-06 / J1-13: the client specification, and its revision 2, filed on the enquiry ────────
    const specTitle = `Al Khail client specification ${run}`;
    await rep.getByRole('tab', { name: 'Documents' }).click();
    await rep.getByLabel('Enquiry document type').selectOption('client_specification');
    await rep.getByLabel('Enquiry document title').fill(specTitle);
    await rep.getByLabel('Enquiry source file').setInputFiles({ name: `spec-${run}-a.pdf`, mimeType: 'application/pdf', buffer: pdf(`${specTitle} rev A`) });
    await rep.getByRole('button', { name: 'Upload document' }).click();
    await expect(rep.getByRole('status').filter({ hasText: 'will follow the Opportunity and Technical Study automatically' })).toBeVisible({ timeout: 30_000 });
    const rev2 = pdf(`${specTitle} rev B`);
    await rep.getByLabel(`Upload a new revision for ${specTitle}`).setInputFiles({ name: `spec-${run}-b.pdf`, mimeType: 'application/pdf', buffer: rev2 });
    await expect(rep.getByRole('status').filter({ hasText: 'Revision 2 saved' })).toBeVisible({ timeout: 30_000 });

    // ── The enquiry is converted, and its study assigned — the governed route (proved on screen in STU-01) ─
    await call('sales', 'PATCH', `/crm/leads/${lead.id}`, { status: 'qualified' });
    const converted = await call<{ opportunity: { id: string }; preSalesAssignment: { assignment: { id: string } } }>('sales', 'POST', `/crm/leads/${lead.id}/convert`, {
      requiresTender: false,
      preSalesAssignment: { assigneeId: USERS.presales, reviewerId: USERS.techmgr, dueDate: day(10), inputRevision: 'Enquiry Rev B', deliverables: ['Technical study'] },
    });
    const O = converted.opportunity.id;
    await call('presales', 'POST', `/work-items/presales-assignment/${converted.preSalesAssignment.assignment.id}/accept`);

    // J1-12: the journey bar on the lead now leads to THIS deal, not the pipeline board.
    await rep.reload({ waitUntil: 'domcontentloaded' });
    await expect(rep.getByTestId('journey-opportunity')).toHaveAttribute('href', `/crm/opportunities/${O}`, { timeout: 30_000 });
    await expect(rep.getByTestId('journey-opportunity')).toHaveAttribute('data-linked', 'record');

    // ── Pre-Sales receives the same context, the same document, and the enquiry's history ────────
    const presales = await seat(browser, baseURL!, USERS.presales);
    await presales.goto(`/crm/opportunities/${O}`, { waitUntil: 'domcontentloaded' });
    await expect(presales.getByTestId('overview-requirements'), 'the customer requirement is on the Overview (J1-12)').toContainText(requirement, { timeout: 30_000 });
    await expect(presales.getByTestId('journey-lead')).toHaveAttribute('href', `/crm/leads/${lead.id}`);
    await expect(presales.getByTestId('journey-quotation')).toHaveAttribute('data-linked', 'register');
    await presales.goto(`/crm/opportunities/${O}?area=study`, { waitUntil: 'domcontentloaded' });
    const intake = presales.getByTestId('sales-intake-context');
    await expect(intake).toContainText(requirement, { timeout: 30_000 });
    await expect(intake).toContainText('Al Quoz Industrial 3, plot 12');
    await expect(intake).toContainText('CCTV');
    await expect(presales.getByText(`${specTitle}`, { exact: true })).toBeVisible();
    await expect(presales.getByText(/client specification · revision 2 · from Sales enquiry/)).toBeVisible();
    const docs = await call<Array<{ id: string; title: string; currentVersion: number }>>('presales', 'GET', `/crm/opportunities/${O}/pre-award-package/evidence`);
    const spec = docs.find((d) => d.title === specTitle)!;
    expect(spec.currentVersion).toBe(2);
    const presalesCopy = await presales.request.get(`/api/documents/${spec.id}/content?version=2`);
    expect(Buffer.compare(await presalesCopy.body(), rev2), 'Pre-Sales reads the same revision Sales filed').toBe(0);
    const reviewerCopy = await request.get(`${API}/documents/${spec.id}/content?version=2`, { headers: tokens.techmgr });
    expect(reviewerCopy.status(), 'the assigned reviewer reads it too').toBe(200);
    expect((await request.get(`${API}/documents/${spec.id}/content?version=2`, { headers: tokens.estimator })).status(), 'the estimator is not on the deal team').toBe(403);

    // …and the enquiry's history, through the lead itself.
    await presales.goto(`/crm/leads/${lead.id}`, { waitUntil: 'domcontentloaded' });
    const history = presales.getByTestId('lead-follow-ups');
    await history.getByText(/Completed \(1\)/).click({ timeout: 30_000 });
    await expect(history.getByTestId('lead-follow-up-done')).toContainText('Site visit agreed for Thursday');

    // ── J1-12: a governed quote's readiness says what the gate does ───────────────────────────────
    const quote = await call<{ id: string }>('sales', 'POST', '/crm/quotations', {
      customerName: `Al Khail Logistics ${run}`, subject: 'CCTV supply', issueDate: day(0), validUntil: day(30),
      lines: [{ description: 'IP camera complete', quantity: 4, unit: 'no', unitPrice: 1000, vatRate: 5 }],
    });
    await manager.goto(`/crm/quotations/${quote.id}?focus=approval`, { waitUntil: 'domcontentloaded' });
    await expect(manager.getByTestId('readiness-consequence')).toContainText('this quote cannot be approved until each is attached, waived or marked not applicable', { timeout: 30_000 });
    await expect(manager.getByText('and the quote cannot be approved until a checklist is set')).toBeVisible();
    await manager.getByRole('button', { name: 'Attach evidence in Documents →' }).click();
    await expect(manager.getByRole('tab', { name: 'Documents' })).toHaveAttribute('aria-selected', 'true');
    await call('sales', 'PATCH', `/crm/quotations/${quote.id}/status`, { action: 'submit_review' });
    const refused = await raw('salesmgr', 'PATCH', `/crm/quotations/${quote.id}/status`, { action: 'approve' });
    expect(refused.status(), 'the gate refuses what the copy says it refuses').toBe(409);
    expect(String((await refused.json()).message)).toContain('approval blocked');
  });
});
