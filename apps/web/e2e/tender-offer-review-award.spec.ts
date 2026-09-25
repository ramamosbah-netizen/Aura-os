import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { memberPassword, signInAs } from './project-member-harness';

/**
 * EST-16, the parts that do not wait on the revision model: a review has two outcomes ON SCREEN, the
 * review leaves a history, and the tender names the one revision its award was won on.
 *
 *   preparer (u-e2e-qs)        tries to return their own offer — refused, in the server's words
 *   reviewer (u-e2e-qs2)       returns it with a reason; the history records who, when and why
 *   preparer                   resubmits; the reviewer approves on screen; the history shows both
 *   sales manager              submits and records the award on screen; the tender reads
 *                              "Awarded on QUO-… Rev 0 — approved by u-e2e-qs2", read back against
 *                              the award's pinned basis
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const USERS = {
  salesmgr: 'u-e2e-salesmgr', presales: 'u-e2e-presales', techmgr: 'u-e2e-techmgr', estimator: 'u-e2e-estimator',
  qs: 'u-e2e-qs', qs2: 'u-e2e-qs2',
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

test.describe('A tender offer is reviewed both ways on screen, and its award names its revision', () => {
  test.setTimeout(360_000);

  test('return with a reason, resubmit, approve, submit, award — the tender names the revision', async ({ browser, request, baseURL }) => {
    test.skip(!memberPassword(), 'requires the Auth-ON local API and the e2e password');
    const tokens = {} as Record<Actor, Headers>;
    for (const [actor, username] of Object.entries(USERS) as Array<[Actor, string]>) {
      const t = await bearer(request, username);
      test.skip(!t, `${username} is not provisioned`);
      tokens[actor] = t!;
    }
    const call = async <T>(actor: Actor, method: 'GET' | 'POST' | 'PATCH', path: string, data?: unknown): Promise<T> => {
      const res = await request.fetch(`${API}${path}`, { method, headers: tokens[actor], data });
      expect(res.ok(), `${actor} ${method} ${path}: ${res.status()} ${await res.text()}`).toBe(true);
      return (await res.json().catch(() => ({}))) as T;
    };
    const run = Date.now().toString().slice(-6);

    for (const [key, value] of [
      ['company.name', 'AURA MEP Systems Test LLC'], ['company.legalName', 'AURA MEP Systems Test L.L.C.'],
      ['company.trn', '100999999999999'], ['company.address', 'Dubai, United Arab Emirates'], ['finance.defaultCurrency', 'AED'],
    ]) {
      const configured = await request.post('/api/admin/settings', { data: { key, value, description: 'EST-16 review proof' } });
      expect(configured.ok(), await configured.text()).toBe(true);
    }

    // ── Seeded by the roles that own it: a priced tender and its offer, sent for review ────────────
    const { id: T } = await call<{ id: string }>('salesmgr', 'POST', '/tendering/tenders', {
      tenderNumber: `TND-RV-${run}`, title: `Marina Heights — ELV ${run}`, clientName: 'Emaar Properties',
      submissionDeadline: '2026-12-31T00:00:00.000Z', estimatedValue: 0,
    });
    const study = await call<{ id: string }>('presales', 'POST', `/tendering/tenders/${T}/studies`, {
      title: 'ELV technical study Rev A', inputRevision: 'RFP Rev 0', reviewerId: USERS.techmgr,
      scopeSummary: 'CCTV for a residential tower.', systems: [{ discipline: 'cctv', name: 'CCTV surveillance' }],
      requirements: [{ category: 'client', statement: '4MP minimum camera resolution', compliance: 'compliant' }],
      surveyFindings: [], clarifications: [], deviations: [], assumptions: [], exclusions: [], evidence: [],
    });
    await call('presales', 'POST', `/tendering/tenders/${T}/studies/${study.id}/submit`);
    await call('techmgr', 'POST', `/tendering/tenders/${T}/studies/${study.id}/approve`, { comment: 'Reviewed' });
    const takeoff = await call<{ id: string }>('presales', 'POST', `/tendering/tenders/${T}/quantity-takeoff`, {
      lines: [{ description: 'IP camera, 4MP dome, indoor', unit: 'no', quantity: 60 }],
    });
    await call('techmgr', 'POST', `/tendering/tenders/${T}/quantity-takeoff/${takeoff.id}/approve`);
    await call('estimator', 'POST', `/tendering/tenders/${T}/quantity-takeoff/${takeoff.id}/project-to-boq`);
    const { items: [camera] } = await call<{ items: Array<{ id: string }> }>('estimator', 'GET', `/tendering/tenders/${T}/boq`);
    const sheet = (supply: number) => ({
      resources: { supplyUnitPrice: supply, technician: { count: 2, hours: 90, rate: 55 }, engineer: { count: 0, hours: 0, rate: 0 }, projectManager: { count: 0, hours: 0, rate: 0 }, transport: 0, wastagePercent: 0, accessories: 0, subcontract: 0, equipmentRent: 0, otherDirect: 0 },
      indirectPercent: 4, overheadPercent: 8, riskPercent: 3, profitPercent: 15,
    });
    await call('estimator', 'POST', `/tendering/tenders/${T}/pricing/items/${camera.id}`, sheet(420));
    const offer = await call<{ id: string }>('qs', 'POST', `/tendering/tenders/${T}/quotation`, {});
    const Q = offer.id;
    const { quoteNumber } = await call<{ quoteNumber: string }>('qs', 'GET', `/crm/quotations/${Q}`);
    await call('qs', 'PATCH', `/crm/quotations/${Q}/status`, { action: 'submit_review' });

    const openApproval = async (page: Page): Promise<void> => {
      await page.goto(`/crm/quotations/${Q}`);
      await expect(async () => {
        await page.getByRole('tab', { name: 'Approval' }).click();
        await expect(page.getByTestId('review-decision')).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 30_000 });
    };

    // ── THE PREPARER cannot return their own submission — refused in the server's words ──────────
    const preparer = await seat(browser, baseURL!, USERS.qs);
    await openApproval(preparer);
    await preparer.getByTestId('return-reason').fill('I would rather change my own figures now');
    await preparer.getByTestId('return-for-revision').click();
    await expect(preparer.getByRole('alert').filter({ hasText: 'cannot return their own quotation' })).toBeVisible();
    expect((await call<{ status: string }>('qs2', 'GET', `/crm/quotations/${Q}`)).status).toBe('internal_review');

    // ── THE REVIEWER returns it, with the reason the preparer will work from ─────────────────────
    const reviewer = await seat(browser, baseURL!, USERS.qs2);
    await openApproval(reviewer);
    const reason = 'Re-rate the technician hours against the agreed installation schedule';
    await reviewer.getByTestId('return-reason').fill(reason);
    await reviewer.getByTestId('return-for-revision').click();
    await expect.poll(async () => (await call<{ status: string }>('qs2', 'GET', `/crm/quotations/${Q}`)).status, { timeout: 30_000 }).toBe('draft');
    await expect(reviewer.getByTestId('review-history')).toContainText(`Returned Rev 0 · by ${USERS.qs2}`);
    await expect(reviewer.getByTestId('review-history')).toContainText(reason);
    const decisions = await call<Array<{ outcome: string; decidedBy: string; reason: string; revision: number }>>('qs2', 'GET', `/crm/quotations/${Q}/review-decisions`);
    expect(decisions).toEqual([expect.objectContaining({ outcome: 'returned', decidedBy: USERS.qs2, reason, revision: 0 })]);

    // ── Resubmitted and evidenced by the roles that own it; the reviewer APPROVES on screen ──────
    await call('qs', 'PATCH', `/crm/quotations/${Q}/status`, { action: 'submit_review' });
    const checklist = await call<{ requirements: Array<{ id: string; type: string }> }>('qs2', 'GET', `/document-requirements?entityType=crm.quotation&entityId=${Q}`);
    for (const row of checklist.requirements) {
      if (row.type === 'VENDOR_QUOTE') {
        await call('qs2', 'POST', `/document-requirements/${row.id}/waive`, { reason: 'EST-16 review proof: this tender was not put to suppliers; sourcing is proved elsewhere' });
      } else {
        await call('estimator', 'POST', `/document-requirements/${row.id}/evidence`, { type: 'EXTERNAL_REFERENCE', reference: `est16-${row.type}-${run}` });
      }
    }
    await openApproval(reviewer);
    await reviewer.getByRole('button', { name: 'Approve ✓' }).first().click();
    await expect.poll(async () => (await call<{ status: string }>('qs2', 'GET', `/crm/quotations/${Q}`)).status, { timeout: 30_000 }).toBe('approved');
    await openApproval(reviewer);
    await expect(reviewer.getByTestId('review-history')).toContainText(`Approved Rev 0 · by ${USERS.qs2}`);
    await expect(reviewer.getByTestId('review-history')).toContainText(reason);
    const baseline = await call<{ id: string; revision: number; lockedBy: string; total: number }>('qs2', 'GET', `/crm/quotations/${Q}/baseline`);
    expect(baseline).toMatchObject({ revision: 0, lockedBy: USERS.qs2 });

    // ── Readiness asks what the submission is asked: no bid decision, not ready — and the screen
    //    says so, instead of enabling a submission the server would refuse ─────────────────────────
    const before = await call<{ ready: boolean; gaps: string[] }>('salesmgr', 'GET', `/tendering/tenders/${T}/submission-readiness`);
    expect(before.ready).toBe(false);
    expect(before.gaps.join(' ')).toContain('No Go/Conditional bid decision on record');
    const early = await seat(browser, baseURL!, USERS.salesmgr);
    await early.goto(`/tendering/tenders/${T}`);
    await expect(early.getByTestId('tender-submit-open')).toBeDisabled();
    await expect(early.getByTestId('tender-submit-open')).toHaveAttribute('title', /No Go\/Conditional bid decision on record/);

    // ── SALES MANAGER commits to bid (seeded), then submits and records the award on screen ──────
    await call('salesmgr', 'POST', '/tendering/bid-scores', {
      tenderId: T, tenderTitle: `Marina Heights — ELV ${run}`,
      criteria: [{ name: 'Strategic fit', weight: 3, score: 8 }, { name: 'Technical capability', weight: 3, score: 9 }, { name: 'Commercial attractiveness', weight: 2, score: 7 }],
      notes: 'Repeat client; core ELV scope.',
    });
    const sales = await seat(browser, baseURL!, USERS.salesmgr);
    await sales.goto(`/tendering/tenders/${T}`);
    await expect(async () => {
      await sales.getByTestId('tender-submit-open').click();
      await expect(sales.getByTestId('tender-submit-reference')).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
    await sales.getByTestId('tender-submit-reference').fill(`EMR-${run}`);
    await sales.getByTestId('tender-submit-confirm').click();
    await expect(sales.getByText(/Status: submitted/i)).toBeVisible({ timeout: 30_000 });

    await expect(async () => {
      await sales.getByRole('button', { name: 'Mark Won (Awarded)' }).click();
      await expect(sales.getByRole('dialog')).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
    const dialog = sales.getByRole('dialog');
    await dialog.getByPlaceholder('0.00').fill(String(Math.round(baseline.total / 1.05)));
    await dialog.getByPlaceholder('LOA / award letter reference').fill(`LOA-${run}`);
    await dialog.getByRole('button', { name: 'Record award' }).click();

    // ── The tender names the ONE revision the award was won on ───────────────────────────────────
    const awarded = await expect.poll(async () => (await call<{ status: string; commercialBasis: { baselineId: string; quotationId: string; kind: string } | null }>('salesmgr', 'GET', `/tendering/tenders/${T}`)), { timeout: 30_000 });
    await awarded.toMatchObject({ status: 'won', commercialBasis: { baselineId: baseline.id, quotationId: Q, kind: 'AT_AWARD' } });
    await sales.goto(`/tendering/tenders/${T}`);
    const basis = sales.getByTestId('tender-award-basis');
    await expect(basis).toContainText(`Awarded on ${quoteNumber} Rev 0`);
    await expect(basis).toContainText(`approved by ${USERS.qs2}`);
    await expect(basis).toContainText('pinned at the award');
    await expect(basis.getByRole('link', { name: `${quoteNumber} Rev 0` })).toHaveAttribute('href', `/crm/quotations/${Q}`);
  });
});
