import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { memberPassword, signInAs } from './project-member-harness';

/**
 * J1-11 — A TENDER IS SUBMITTED ONLY ON AN APPROVED STUDY AND AN INTERNALLY APPROVED OFFER.
 *
 * The finding: tender submission did not require the technical study or the internal approval of
 * the offer. Proved here on one tender, on the ordinary route, each refusal in the server's words:
 *
 *   no study        readiness names the study; the screen disables Submit and says why; both
 *                   submission routes are refused (409)
 *   study pending   a study submitted but not yet approved by the Technical Manager is not enough
 *   no approval     with the study approved and the offer priced, the unapproved offer is named and
 *                   submission is still refused
 *   under policy    with a company approval policy active, the tender offer's approval runs in
 *                   sequence in the approvers' own sessions — out of turn refused, the first step
 *                   recorded while the tender stays unsubmittable, the last step approves
 *   submitted       only then does the Sales Manager submit on screen
 *
 * TEST VALUES ONLY: the policy activated here (Commercial Manager then Sales Manager) proves the
 * mechanism on the tender route and is retired at the end. It is not the owner's policy.
 */
const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const USERS = {
  salesmgr: 'u-e2e-salesmgr', presales: 'u-e2e-presales', techmgr: 'u-e2e-techmgr', estimator: 'u-e2e-estimator',
  qs: 'u-e2e-qs', qs2: 'u-e2e-qs2',
} as const;
type Actor = keyof typeof USERS | 'admin';
type Headers = Record<string, string>;
const STUDY_GAP = 'Complete independent approval of the Technical Study.';
const OFFER_GAP = 'Generate and internally approve the current commercial offer.';

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

test('J1-11 — a tender is submitted only on an approved study and an offer approved under company policy', async ({ browser, request, baseURL }) => {
  test.skip(!memberPassword() || !apiAuthHeaders().Authorization, 'requires the Auth-ON local API and the e2e password');
  test.setTimeout(420_000);
  const tokens = { admin: apiAuthHeaders() } as Record<Actor, Headers>;
  for (const [actor, username] of Object.entries(USERS) as Array<[Exclude<Actor, 'admin'>, string]>) {
    const t = await bearer(request, username);
    test.skip(!t, `${username} is not provisioned`);
    tokens[actor] = t!;
  }
  const send = (actor: Actor, method: 'GET' | 'POST' | 'PATCH' | 'PUT', path: string, data?: unknown) =>
    request.fetch(`${API}${path}`, { method, headers: tokens[actor], data });
  const call = async <T>(actor: Actor, method: 'GET' | 'POST' | 'PATCH' | 'PUT', path: string, data?: unknown): Promise<T> => {
    const res = await send(actor, method, path, data);
    expect(res.ok(), `${actor} ${method} ${path}: ${res.status()} ${await res.text()}`).toBe(true);
    return (await res.json().catch(() => ({}))) as T;
  };
  const POLICY = '/admin/company-policies/quotation-approval';
  type Overview = { active: { version: number } | null; versions: Array<{ version: number; status: string }>; ownerDefault: Record<string, unknown> & { steps: Array<Record<string, unknown>> } };
  const retireIfActive = async (reason: string) => {
    if ((await call<Overview>('admin', 'GET', POLICY)).active) await call('admin', 'POST', `${POLICY}/retire`, { reason });
  };
  const run = Date.now().toString().slice(-6);
  await retireIfActive(`J1-11 proof: start from no policy (${run})`);

  try {
    // ── A tender the Sales Manager has decided to bid; nothing technical or commercial yet ────────
    const title = `Creek Harbour — ELV ${run}`;
    const { id: T } = await call<{ id: string }>('salesmgr', 'POST', '/tendering/tenders', {
      tenderNumber: `TND-J111-${run}`, title, clientName: 'Emaar Properties',
      submissionDeadline: '2026-12-31T00:00:00.000Z', estimatedValue: 0,
    });
    await call('salesmgr', 'POST', '/tendering/bid-scores', {
      tenderId: T, tenderTitle: title,
      criteria: [{ name: 'Strategic fit', weight: 3, score: 8 }, { name: 'Technical capability', weight: 3, score: 9 }, { name: 'Commercial attractiveness', weight: 2, score: 7 }],
      notes: 'Core ELV scope.',
    });
    const readiness = () => call<{ ready: boolean; gaps: string[] }>('salesmgr', 'GET', `/tendering/tenders/${T}/submission-readiness`);
    const refusedSubmission = async (because: string) => {
      const viaSubmit = await send('salesmgr', 'POST', `/tendering/tenders/${T}/submit`, { method: 'portal', reference: `J111-${run}` });
      expect(viaSubmit.status(), 'the submit route refuses').toBe(409);
      expect(await viaSubmit.text()).toContain(because);
      const viaStatus = await send('salesmgr', 'PATCH', `/tendering/tenders/${T}/status`, { status: 'submitted' });
      expect(viaStatus.status(), 'the status route refuses').toBe(409);
      expect(await viaStatus.text()).toContain(because);
    };

    // ── No study: named, disabled on screen, refused by both routes ─────────────────────────────
    expect((await readiness()).gaps).toContain(STUDY_GAP);
    const sales = await seat(browser, baseURL!, USERS.salesmgr);
    await sales.goto(`/tendering/tenders/${T}`);
    await expect(sales.getByTestId('tender-submit-open')).toBeDisabled();
    await expect(sales.getByTestId('tender-submit-open')).toHaveAttribute('title', new RegExp(STUDY_GAP.replace(/\./g, '\\.')));
    await refusedSubmission(STUDY_GAP);

    // ── A study written and submitted, not yet approved: still not enough ───────────────────────
    const study = await call<{ id: string }>('presales', 'POST', `/tendering/tenders/${T}/studies`, {
      title: 'ELV technical study Rev A', inputRevision: 'RFP Rev 0', reviewerId: USERS.techmgr,
      scopeSummary: 'CCTV for a mixed-use tower.', systems: [{ discipline: 'cctv', name: 'CCTV surveillance' }],
      requirements: [{ category: 'client', statement: '4MP minimum camera resolution', compliance: 'compliant' }],
      surveyFindings: [], clarifications: [], deviations: [], assumptions: [], exclusions: [], evidence: [],
    });
    await call('presales', 'POST', `/tendering/tenders/${T}/studies/${study.id}/submit`);
    expect((await readiness()).gaps, 'a submitted study is not an approved one').toContain(STUDY_GAP);
    await refusedSubmission(STUDY_GAP);
    await call('techmgr', 'POST', `/tendering/tenders/${T}/studies/${study.id}/approve`, { comment: 'Reviewed' });
    expect((await readiness()).gaps).not.toContain(STUDY_GAP);

    // ── Quantities, pricing and the offer; the offer is not approved yet ────────────────────────
    const takeoff = await call<{ id: string }>('presales', 'POST', `/tendering/tenders/${T}/quantity-takeoff`, {
      lines: [{ description: 'IP camera, 4MP dome, indoor', unit: 'no', quantity: 40 }],
    });
    await call('techmgr', 'POST', `/tendering/tenders/${T}/quantity-takeoff/${takeoff.id}/approve`);
    await call('estimator', 'POST', `/tendering/tenders/${T}/quantity-takeoff/${takeoff.id}/project-to-boq`);
    const { items: [camera] } = await call<{ items: Array<{ id: string }> }>('estimator', 'GET', `/tendering/tenders/${T}/boq`);
    await call('estimator', 'POST', `/tendering/tenders/${T}/pricing/items/${camera.id}`, {
      resources: { supplyUnitPrice: 410, technician: { count: 2, hours: 60, rate: 55 }, engineer: { count: 0, hours: 0, rate: 0 }, projectManager: { count: 0, hours: 0, rate: 0 }, transport: 0, wastagePercent: 0, accessories: 0, subcontract: 0, equipmentRent: 0, otherDirect: 0 },
      indirectPercent: 4, overheadPercent: 8, riskPercent: 3, profitPercent: 15,
    });
    const { id: Q } = await call<{ id: string }>('qs', 'POST', `/tendering/tenders/${T}/quotation`, {});
    const priced = await readiness();
    expect(priced.gaps).toEqual([OFFER_GAP]);
    await refusedSubmission(OFFER_GAP);

    // ── A company approval policy is activated (TEST values): Commercial Manager, then Sales Manager ─
    const overview = await call<Overview>('admin', 'GET', POLICY);
    const open = overview.versions.find((v) => v.status === 'draft');
    const draft = open ?? await call<{ version: number }>('admin', 'POST', `${POLICY}/drafts`, { reason: `J1-11 proof: tender offers under a policy (${run})`, from: 'owner-default' });
    const body = {
      ...overview.ownerDefault,
      steps: [
        { id: 'commercial', label: 'Commercial Manager', role: 'r-commercial-manager', quorum: 1, order: 1, appliesAbove: null },
        { id: 'sales', label: 'Sales Manager', role: 'r-sales-manager', quorum: 1, order: 2, appliesAbove: null },
      ],
    };
    await call('admin', 'PUT', `${POLICY}/drafts/${draft.version}`, { body, reason: `J1-11 proof: Commercial then Sales (${run})` });
    await call('admin', 'POST', `${POLICY}/drafts/${draft.version}/activate`, { reason: `J1-11 proof: in force for the tender proof (${run})` });
    const version = (await call<Overview>('admin', 'GET', POLICY)).active!.version;

    // The offer goes to review under it, evidenced by the roles that own the evidence.
    await call('qs', 'PATCH', `/crm/quotations/${Q}/status`, { action: 'submit_review' });
    const checklist = await call<{ requirements: Array<{ id: string; type: string }> }>('qs2', 'GET', `/document-requirements?entityType=crm.quotation&entityId=${Q}`);
    for (const row of checklist.requirements) {
      if (row.type === 'VENDOR_QUOTE') {
        await call('qs2', 'POST', `/document-requirements/${row.id}/waive`, { reason: 'J1-11 proof: this tender was not put to suppliers; sourcing is proved elsewhere' });
      } else {
        await call('estimator', 'POST', `/document-requirements/${row.id}/evidence`, { type: 'EXTERNAL_REFERENCE', reference: `j111-${row.type}-${run}` });
      }
    }
    const route = await call<{ runs: Array<{ policyVersion: number; status: string }> }>('qs2', 'GET', `/crm/quotations/${Q}/approval`);
    expect(route.runs[0]).toMatchObject({ policyVersion: version, status: 'open' });

    const openApproval = async (page: Page): Promise<void> => {
      await page.goto(`/crm/quotations/${Q}?focus=approval`);
      await expect(page.getByTestId('approval-route')).toContainText(`policy version ${version}`, { timeout: 30_000 });
    };

    // The Sales Manager, out of turn, is refused in the server's words.
    await openApproval(sales);
    await expect(sales.getByTestId('approval-step-commercial')).toContainText('waiting');
    await sales.getByRole('button', { name: 'Approve ✓' }).first().click();
    await expect(sales.getByText(/waiting on Commercial Manager/)).toBeVisible();

    // The reviewing Commercial Manager records the first step; the tender still cannot be submitted.
    const reviewer = await seat(browser, baseURL!, USERS.qs2);
    await openApproval(reviewer);
    await reviewer.getByRole('button', { name: 'Approve ✓' }).first().click();
    await expect(reviewer.getByText('Your approval is recorded for your step')).toBeVisible();
    await expect(reviewer.getByTestId('approval-step-commercial')).toContainText(`approved by ${USERS.qs2}`);
    expect((await call<{ status: string }>('qs2', 'GET', `/crm/quotations/${Q}`)).status).toBe('internal_review');
    expect((await readiness()).gaps, 'one step of two is not an approved offer').toEqual([OFFER_GAP]);
    await refusedSubmission(OFFER_GAP);

    // The Sales Manager approves last; the offer is approved.
    await openApproval(sales);
    await sales.getByRole('button', { name: 'Approve ✓' }).first().click();
    await expect.poll(async () => (await call<{ status: string }>('qs2', 'GET', `/crm/quotations/${Q}`)).status, { timeout: 30_000 }).toBe('approved');
    await expect(sales.getByTestId('approval-step-sales')).toContainText(`approved by ${USERS.salesmgr}`);

    // ── Only now: ready, and the Sales Manager submits on screen ────────────────────────────────
    expect((await readiness())).toMatchObject({ ready: true, gaps: [] });
    await sales.goto(`/tendering/tenders/${T}`);
    await expect(async () => {
      await sales.getByTestId('tender-submit-open').click();
      await expect(sales.getByTestId('tender-submit-reference')).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
    await sales.getByTestId('tender-submit-reference').fill(`EMR-J111-${run}`);
    await sales.getByTestId('tender-submit-confirm').click();
    await expect(sales.getByText(/Status: submitted/i)).toBeVisible({ timeout: 30_000 });
    const submissions = await call<Array<{ reference: string | null; submittedBy: string | null }>>('salesmgr', 'GET', `/tendering/tenders/${T}/submissions`);
    expect(submissions[0]).toMatchObject({ reference: `EMR-J111-${run}`, submittedBy: USERS.salesmgr });

    await sales.context().close();
    await reviewer.context().close();
  } finally {
    await retireIfActive(`J1-11 proof: restore the single approval (${run})`);
  }
});
