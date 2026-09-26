import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { memberPassword, signInAs } from './project-member-harness';

/**
 * STU-01 / J1-04 — A STUDY SALES ASSIGNS IS THE ENGINEER'S TO ANSWER, AND COMES BACK WHEN APPROVED
 * (the owner's decision of 2026-09-26: bind it; accept or decline in My Work with an automatic
 * return; direct route only).
 *
 *   sales              converts a lead on screen and assigns the study — engineer and reviewer picked
 *                      from lists Sales can actually read (they were empty before)
 *   engineer           declines it in My Work with a reason; it comes back to Sales
 *   sales              reissues the package on the opportunity, with a reason — version 2
 *   engineer           accepts version 2; the study starts only now, and is bound to the package
 *   refused            the study before acceptance, anyone else answering, anyone else writing it,
 *                      another reviewer or input revision, the engineer reissuing, a viewer reading
 *   technical manager  approves the study on screen
 *   sales              receives "study approved — scope ready" and marks it received
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const USERS = {
  sales: 'u-e2e-sales', salesmgr: 'u-e2e-salesmgr', presales: 'u-e2e-presales', techmgr: 'u-e2e-techmgr',
  estimator: 'u-e2e-estimator', viewer: 'u-e2e-viewer',
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

test.describe('STU-01 — the Pre-Sales study assignment is answered, bound and returned', () => {
  test.setTimeout(480_000);

  test('assign on conversion → declined → reissued → accepted → bound study → approved → received by Sales', async ({ browser, request, baseURL }) => {
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
    const refused = async (res: import('@playwright/test').APIResponse, status: number, message: string) => {
      expect(res.status(), `${res.url()}: ${await res.text()}`).toBe(status);
      expect(String(((await res.json()) as { message: unknown }).message)).toContain(message);
    };
    const run = Date.now().toString().slice(-6);
    const leadName = `Marina Heights reception ${run}`;

    // ── Sales takes the enquiry and qualifies it ──────────────────────────────────────────────────
    const lead = await call<{ id: string }>('sales', 'POST', '/crm/leads', {
      name: leadName, companyName: `Marina Heights ${run}`, email: `facilities-${run}@example.invalid`,
      requirement: 'CCTV for the podium and car park with 30-day retention', systems: ['cctv'],
      projectName: `Marina Heights ${run}`, projectLocation: 'Dubai Marina',
    });
    await call('sales', 'PATCH', `/crm/leads/${lead.id}`, { status: 'qualified' });

    // ── …and converts it ON SCREEN, assigning the study from lists Sales can read ─────────────────
    const sales = await seat(browser, baseURL!, USERS.sales);
    await sales.goto('/crm/pipeline', { waitUntil: 'domcontentloaded' });
    const card = sales.locator('div', { has: sales.getByRole('link', { name: leadName, exact: true }) }).filter({ has: sales.getByRole('button', { name: /Qualify & Convert/ }) }).last();
    await card.getByRole('button', { name: /Qualify & Convert/ }).click({ timeout: 30_000 });
    const drawer = sales.getByRole('dialog', { name: 'Qualify and convert lead' });
    await expect(drawer.getByText('On the tender path the technical study is started by Pre-Sales on the tender itself')).toBeVisible({ timeout: 30_000 });
    await drawer.getByLabel('Path after winning').selectOption('false');
    await expect(drawer.getByLabel('Pre-Sales / Engineer *').locator('option', { hasText: USERS.presales })).toHaveCount(1, { timeout: 30_000 });
    await drawer.getByLabel('Pre-Sales / Engineer *').selectOption(USERS.presales);
    await drawer.getByLabel('Technical reviewer *').selectOption(USERS.techmgr);
    await drawer.getByLabel('Study due date *').fill('2026-10-12');
    await drawer.getByLabel('Input revision *').fill('Client enquiry Rev 01');
    await drawer.getByLabel('Required deliverables * — one per line').fill('Site survey\nTechnical study');
    await drawer.getByRole('button', { name: 'Convert to Opportunity' }).click();
    await expect(drawer).toBeHidden({ timeout: 30_000 });
    const converted = await call<{ convertedOpportunityId: string }>('sales', 'GET', `/crm/leads/${lead.id}`);
    const O = converted.convertedOpportunityId;
    expect(O).toBeTruthy();
    const { assignment: v1 } = await call<{ assignment: { id: string; version: number; status: string; assigneeId: string; reviewerId: string; assignedBy: string } }>('sales', 'GET', `/crm/opportunities/${O}/presales-assignment`);
    expect(v1).toMatchObject({ version: 1, status: 'assigned', assigneeId: USERS.presales, reviewerId: USERS.techmgr, assignedBy: USERS.sales });

    const studyBody = {
      title: `Marina Heights CCTV study ${run}`, inputRevision: 'Client enquiry Rev 01', reviewerId: USERS.techmgr,
      scopeSummary: 'CCTV for the podium and car park.', systems: [{ discipline: 'ELV', name: 'CCTV', designBasis: 'IP, 4MP', interfaces: [] }],
      requirements: [{ category: 'client', statement: 'CCTV with 30-day retention', compliance: 'compliant' }],
      surveyFindings: [], clarifications: [], deviations: [], assumptions: [], exclusions: [], evidence: [],
    };
    const studies = `/crm/opportunities/${O}/pre-award-package/studies`;
    await refused(await raw('presales', 'POST', studies, studyBody), 409, 'not yet accepted');

    // ── The engineer DECLINES in My Work, with a reason ───────────────────────────────────────────
    const presales = await seat(browser, baseURL!, USERS.presales);
    await presales.goto('/my-work/tasks', { waitUntil: 'domcontentloaded' });
    const offered = presales.locator(`[data-testid="work-item"][data-task-id="${v1.id}"]`);
    await expect(offered).toContainText('Pre-Sales study assigned', { timeout: 30_000 });
    await expect(offered).toContainText('Input Client enquiry Rev 01 · Site survey, Technical study · reviewer u-e2e-techmgr');
    await refused(await raw('techmgr', 'POST', `/work-items/presales-assignment/${v1.id}/accept`), 409, 'only the assigned Pre-Sales engineer can accept');
    await offered.getByRole('button', { name: 'Decline' }).click();
    const dialog = presales.getByTestId('decline-dialog');
    await expect(dialog.getByRole('heading', { name: 'Decline this study' })).toBeVisible();
    await dialog.getByRole('textbox').fill(`On site survey at Jumeirah until the 10th ${run}`);
    await dialog.getByRole('button', { name: 'Send decline' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    // ── It comes back to Sales, who REISSUES it on the opportunity ────────────────────────────────
    await sales.goto('/my-work/tasks', { waitUntil: 'domcontentloaded' });
    const back = sales.locator(`[data-testid="work-item"][data-task-id="${v1.id}"]`);
    await expect(back).toContainText('Pre-Sales study declined', { timeout: 30_000 });
    await expect(back).toContainText(`On site survey at Jumeirah until the 10th ${run}`);
    await back.getByRole('link', { name: /Open in Pre-Sales/ }).click();
    await expect(sales).toHaveURL(new RegExp(`/crm/opportunities/${O}\\?area=study`), { timeout: 30_000 });
    const panel = sales.getByTestId('presales-assignment');
    await expect(panel.getByTestId('presales-assignment-status')).toHaveText('Declined — back with Sales', { timeout: 30_000 });
    await panel.getByRole('button', { name: 'Reissue the package' }).click();
    const form = panel.getByTestId('presales-assignment-form');
    await expect(form.getByLabel('Pre-Sales engineer').locator('option', { hasText: USERS.presales })).toHaveCount(1, { timeout: 30_000 });
    await form.getByLabel('Study due date').fill('2026-10-16');
    await form.getByLabel('Reason for reissuing').fill('Due date moved past the Jumeirah survey');
    await form.getByRole('button', { name: 'Reissue' }).click();
    await expect(panel.getByText('Reissued. The engineer answers the new version in My Work.')).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByRole('heading', { name: 'Pre-Sales assignment · v2' })).toBeVisible();
    await expect(panel.getByTestId('presales-assignment-status')).toHaveText('Awaiting the engineer');
    await refused(await raw('presales', 'POST', `/crm/opportunities/${O}/presales-assignment/reissue`, { reason: 'self', dueDate: '2026-10-20' }), 403, 'crm.opportunity.deal-team');
    expect((await raw('viewer', 'GET', `/crm/opportunities/${O}/presales-assignment`)).status(), 'a viewer does not read the package').toBe(403);

    // ── The engineer ACCEPTS version 2 — and only now can the study start ─────────────────────────
    await presales.goto('/my-work/tasks', { waitUntil: 'domcontentloaded' });
    const v2 = presales.locator(`[data-testid="work-item"][data-task-id="${v1.id}"]`);
    await expect(v2).toContainText('· v2', { timeout: 30_000 });
    await v2.getByRole('button', { name: 'Accept' }).click();
    await expect(v2).toContainText('Completes when u-e2e-techmgr approves the study.', { timeout: 30_000 });
    await expect(v2.getByRole('button', { name: 'Complete' }), 'nobody closes it by hand').toHaveCount(0);
    await refused(await raw('presales', 'POST', `/work-items/presales-assignment/${v1.id}/accept`), 409, 'is accepted; only an assignment awaiting its engineer');

    // Bound: the Sales Manager holds every CRM grant and is still not the engineer Sales assigned.
    await refused(await raw('salesmgr', 'POST', studies, studyBody), 409, 'only the assigned Pre-Sales engineer can write this study');
    expect((await raw('estimator', 'POST', studies, studyBody)).status(), 'the estimator does not write studies').toBe(403);

    // ── On screen: the reviewer and the input revision are the package's, and locked ──────────────
    await presales.goto(`/crm/opportunities/${O}?area=study`, { waitUntil: 'domcontentloaded' });
    await expect(presales.getByLabel('Technical reviewer')).toHaveValue(USERS.techmgr, { timeout: 30_000 });
    await expect(presales.getByLabel('Technical reviewer')).toBeDisabled();
    await expect(presales.getByLabel('Input revision')).toHaveValue('Client enquiry Rev 01');
    await expect(presales.getByLabel('Input revision')).toHaveAttribute('readonly', '');
    await presales.getByLabel('Study title').fill(`Marina Heights CCTV study ${run}`);
    await presales.getByLabel('Scope summary').fill('CCTV for the podium and car park, 30-day retention.');
    await presales.getByLabel('Design basis 1').fill('IP CCTV, 4MP, central NVR');
    await presales.getByLabel('Acceptance criteria 1').fill('Podium and car park covered; 30 days retained');
    await presales.getByLabel('Technical response 1').fill('Included in the design basis');
    await presales.getByLabel('Compliance 1').selectOption('compliant');
    await presales.getByRole('button', { name: 'Create study draft' }).click();
    await expect(presales.getByText(/S-001 · draft/i)).toBeVisible({ timeout: 30_000 });
    const [study] = await call<Array<{ id: string; updatedAt: string; authorId: string; reviewerId: string; inputRevision: string }>>('presales', 'GET', studies);
    expect(study).toMatchObject({ authorId: USERS.presales, reviewerId: USERS.techmgr, inputRevision: 'Client enquiry Rev 01' });
    await refused(await raw('presales', 'PATCH', `${studies}/${study.id}`, { ...studyBody, expectedUpdatedAt: study.updatedAt, inputRevision: 'Client enquiry Rev 02' }), 409, 'can only follow a reissue by Sales');
    await presales.getByRole('button', { name: 'Submit for technical review' }).click();
    await expect(presales.getByText(/S-001 · in review/i)).toBeVisible({ timeout: 30_000 });

    // ── The Technical Manager approves on screen; the approval completes the assignment ───────────
    const techmgr = await seat(browser, baseURL!, USERS.techmgr);
    await techmgr.goto('/my-work/tasks', { waitUntil: 'domcontentloaded' });
    const review = techmgr.locator(`[data-testid="work-item"][data-task-id="${study.id}"]`);
    await expect(review).toContainText('Technical study review', { timeout: 30_000 });
    await review.getByRole('link', { name: new RegExp(`Marina Heights CCTV study ${run}`) }).first().click();
    await expect(techmgr.getByText('The study has no unresolved technical blockers.')).toBeVisible({ timeout: 30_000 });
    await techmgr.getByPlaceholder('Review comment / decision basis').fill('Basis approved.');
    await techmgr.getByRole('button', { name: 'Approve technical basis' }).click();
    await expect(techmgr.getByText('Technical basis approved for quantity take-off and estimating.')).toBeVisible({ timeout: 30_000 });

    // ── It comes back to Sales, who receives it; it leaves the engineer's list ───────────────────
    await presales.goto('/my-work/tasks', { waitUntil: 'domcontentloaded' });
    await expect(presales.getByText('Task source coverage')).toBeVisible({ timeout: 30_000 });
    await expect(presales.locator(`[data-testid="work-item"][data-task-id="${v1.id}"]`), 'the approved study closed the engineer\'s task').toHaveCount(0);
    await sales.goto('/my-work/tasks', { waitUntil: 'domcontentloaded' });
    const ready = sales.locator(`[data-testid="work-item"][data-task-id="${v1.id}"]`);
    await expect(ready).toContainText('Study approved — scope ready', { timeout: 30_000 });
    await refused(await raw('presales', 'POST', `/work-items/presales-assignment/${v1.id}/complete`), 409, 'who assigned this study, can take receipt');
    await ready.getByRole('button', { name: 'Complete' }).click();
    await expect(ready).toContainText('Done', { timeout: 30_000 });

    const { assignment: done } = await call<{ assignment: { status: string; version: number; studyId: string; acknowledgedAt: string | null; history: Array<{ version: number; act: string; actorId: string; note: string | null }> } }>('sales', 'GET', `/crm/opportunities/${O}/presales-assignment`);
    expect(done).toMatchObject({ status: 'completed', version: 2, studyId: study.id, acknowledgedAt: expect.any(String) });
    expect(done.history.map((h) => [h.version, h.act, h.actorId])).toEqual([
      [1, 'assigned', USERS.sales], [1, 'declined', USERS.presales], [2, 'reissued', USERS.sales],
      [2, 'accepted', USERS.presales], [2, 'completed', USERS.techmgr], [2, 'acknowledged', USERS.sales],
    ]);
    await sales.goto(`/crm/opportunities/${O}?area=study`, { waitUntil: 'domcontentloaded' });
    await expect(sales.getByTestId('presales-assignment-status')).toHaveText('Completed — study approved', { timeout: 30_000 });
  });
});
