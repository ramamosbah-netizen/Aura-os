import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { memberPassword, signInAs } from './project-member-harness';

/**
 * EST-16 — ONE LOGICAL OFFER PER TENDER, the owner's decision of 2026-09-25 ("(a), (a), (a)"):
 * "immutable, linked revisions after first submission. An unsubmitted draft may refresh in place.
 *  Revising a submitted tender offer requires a permanent reason and regenerates the new revision
 *  from the current governed estimate. Preserve previous revision figures and decisions. Award must
 *  pin the exact approved revision."
 *
 *   estimator   generates Rev 0 on screen, re-prices, and REFRESHES it in place (never submitted)
 *   estimator   submits; generating again is refused; the reviewer (u-e2e-qs2) returns it with a reason
 *   estimator   re-prices and REVISES on screen with a reason → Rev 1, regenerated from the estimate
 *   qs2 / qs    approve and send Rev 1; the estimate is frozen behind it
 *   estimator   revises the sent Rev 1 with a reason → Rev 2; re-prices; Rev 2 refreshes in place
 *   qs2         compares revisions on screen — figures per BOQ item and each revision's decisions
 *   qs2 / sales approve Rev 2; submit; award — the award pins Rev 2, and nothing revises it after
 *   Rev 0 and Rev 1 keep their figures, their baseline and their decisions throughout.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const USERS = {
  salesmgr: 'u-e2e-salesmgr', presales: 'u-e2e-presales', techmgr: 'u-e2e-techmgr', estimator: 'u-e2e-estimator',
  qs: 'u-e2e-qs', qs2: 'u-e2e-qs2', viewer: 'u-e2e-viewer',
} as const;
type Actor = keyof typeof USERS;
type Headers = Record<string, string>;
interface Quote { id: string; quoteNumber: string; revision: number; status: string; total: number; parentQuotationId: string | null; lines: Array<{ unitPrice: number }> }

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

test.describe('EST-16 — a tender has one offer, and its submitted revisions do not move', () => {
  test.setTimeout(480_000);

  test('generate, refresh, return, revise with reasons, compare, award the exact revision', async ({ browser, request, baseURL }) => {
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
    const refused = async (actor: Actor, method: 'POST' | 'PATCH', path: string, data: unknown, status: number, words: string) => {
      const res = await raw(actor, method, path, data);
      expect(res.status(), `${actor} ${method} ${path} must be refused ${status}: ${await res.text()}`).toBe(status);
      if (words) expect(((await res.json()) as { message: string }).message).toContain(words);
    };
    const run = Date.now().toString().slice(-6);

    // ── Seeded by the roles that own it: an approved study, approved quantities, a priced camera ─
    const { id: T } = await call<{ id: string }>('salesmgr', 'POST', '/tendering/tenders', {
      tenderNumber: `TND-OF-${run}`, title: `Creek Harbour — ELV ${run}`, clientName: 'Emaar Properties',
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
    const price = (supply: number) => raw('estimator', 'POST', `/tendering/tenders/${T}/pricing/items/${camera.id}`, {
      resources: { supplyUnitPrice: supply, technician: { count: 2, hours: 90, rate: 55 }, engineer: { count: 0, hours: 0, rate: 0 }, projectManager: { count: 0, hours: 0, rate: 0 }, transport: 0, wastagePercent: 0, accessories: 0, subcontract: 0, equipmentRent: 0, otherDirect: 0 },
      indirectPercent: 4, overheadPercent: 8, riskPercent: 3, profitPercent: 15,
    });
    const priceOk = async (supply: number) => { const r = await price(supply); expect(r.ok(), `pricing at ${supply}: ${await r.text()}`).toBe(true); };
    await priceOk(420);
    const quote = (id: string) => call<Quote>('qs2', 'GET', `/crm/quotations/${id}`);
    const offerOf = async () => (await call<{ offer: { id: string; revision: number; status: string; next: string } | null; quotations: Quote[] }>('estimator', 'GET', `/tendering/tenders/${T}/pricing`));
    const evidence = async (id: string) => {
      const checklist = await call<{ requirements: Array<{ id: string; type: string }> }>('qs2', 'GET', `/document-requirements?entityType=crm.quotation&entityId=${id}`);
      expect(checklist.requirements.length, 'each revision is approved on its own seeded checklist').toBeGreaterThan(0);
      for (const row of checklist.requirements) {
        if (row.type === 'VENDOR_QUOTE') {
          await call('qs2', 'POST', `/document-requirements/${row.id}/waive`, { reason: 'EST-16 revision proof: this tender was not put to suppliers; sourcing is proved elsewhere' });
        } else {
          await call('estimator', 'POST', `/document-requirements/${row.id}/evidence`, { type: 'EXTERNAL_REFERENCE', reference: `est16-rev-${row.type}-${id.slice(0, 8)}` });
        }
      }
    };

    // ── ESTIMATOR: generate Rev 0 on screen, re-price, refresh it IN PLACE ─────────────────────
    const estimator = await seat(browser, baseURL!, USERS.estimator);
    await estimator.goto(`/tendering/tenders/${T}/pricing`);
    await expect(estimator.getByTestId('offer-generate')).toBeVisible({ timeout: 30_000 });
    await estimator.getByTestId('offer-generate').click();
    await expect(estimator.getByText(/Rev 0 created as a draft/)).toBeVisible({ timeout: 30_000 });
    const rev0Id = (await offerOf()).offer!.id;
    const rev0First = await quote(rev0Id);
    await priceOk(430);
    await estimator.getByTestId('offer-refresh').click();
    await expect(estimator.getByText(/Rev 0 refreshed in place from the estimate/)).toBeVisible({ timeout: 30_000 });
    const rev0 = await quote(rev0Id);
    expect(rev0).toMatchObject({ id: rev0Id, revision: 0, status: 'draft', quoteNumber: rev0First.quoteNumber });
    expect(rev0.total).toBeGreaterThan(rev0First.total);
    expect((await offerOf()).quotations.map((q) => q.id), 'refreshing raised no revision and no second number').toEqual([rev0Id]);

    // ── SUBMITTED: generating again is refused; the pricing lock holds while it is reviewed ──────
    await call('estimator', 'PATCH', `/crm/quotations/${rev0Id}/status`, { action: 'submit_review' });
    await refused('estimator', 'POST', `/tendering/tenders/${T}/quotation`, {}, 409, 'is with a commercial reviewer');
    expect((await price(400)).status(), 'the costing is sealed while a reviewer decides').toBe(409);
    await estimator.reload();
    await expect(estimator.getByTestId('tender-offer-guidance')).toContainText('is with a commercial reviewer');
    await expect(estimator.getByTestId('offer-generate')).toHaveCount(0);
    await expect(estimator.getByTestId('offer-revise')).toHaveCount(0);
    const returnReason = 'Re-rate the cameras against the supplier\'s revised price';
    await call('qs2', 'PATCH', `/crm/quotations/${rev0Id}/status`, { action: 'return_for_revision', reason: returnReason });

    // ── RETURNED: it was submitted, so the change is Rev 1 — with the reviser's reason ─────────
    await priceOk(400);
    await refused('estimator', 'POST', `/tendering/tenders/${T}/quotation`, {}, 409, 'was returned for revision');
    await refused('estimator', 'POST', `/tendering/tenders/${T}/quotation/revise`, { reason: '  ' }, 400, 'revising an offer requires a reason');
    await refused('viewer', 'POST', `/tendering/tenders/${T}/quotation/revise`, { reason: 'Not mine to revise' }, 403, '');
    await estimator.reload();
    await expect(estimator.getByTestId('offer-revise')).toBeDisabled();
    const reason1 = 'Cameras re-rated to the supplier\'s revised price, as the reviewer asked';
    await estimator.getByTestId('offer-revise-reason').fill(reason1);
    await estimator.getByTestId('offer-revise').click();
    await expect(estimator.getByText(/Rev 1 raised from the current estimate/)).toBeVisible({ timeout: 30_000 });
    const rev1Id = (await offerOf()).offer!.id;
    const rev1 = await quote(rev1Id);
    expect(rev1).toMatchObject({ quoteNumber: rev0.quoteNumber, revision: 1, status: 'draft', parentQuotationId: rev0Id });
    expect(rev1.total, 'Rev 1 is the estimate as it stands, not a copy of Rev 0').toBeLessThan(rev0.total);
    expect(await quote(rev0Id)).toMatchObject({ status: 'revised', total: rev0.total });

    // ── No second writer: CRM neither copies nor prices a tender offer ────────────────────────
    await refused('qs', 'POST', `/crm/quotations/${rev1Id}/revise`, {}, 409, 'can only be revised from its tender');
    await refused('estimator', 'POST', '/crm/pricing-sheets', { name: 'CRM sheet on a tender offer', quotationId: rev1Id, lines: [] }, 409, "can only be priced from its tender's estimate");

    // ── Rev 1 approved and sent; the estimate is frozen behind it ────────────────────────────
    await call('estimator', 'PATCH', `/crm/quotations/${rev1Id}/status`, { action: 'submit_review' });
    await evidence(rev1Id);
    await call('qs2', 'PATCH', `/crm/quotations/${rev1Id}/status`, { action: 'approve' });
    await call('qs', 'PATCH', `/crm/quotations/${rev1Id}/status`, { action: 'send' });
    const rev1Baseline = await call<{ id: string; total: number; revision: number }>('qs2', 'GET', `/crm/quotations/${rev1Id}/baseline`);
    expect(rev1Baseline).toMatchObject({ revision: 1, total: rev1.total });
    expect((await price(380)).status(), 'the costing behind a sent price is frozen').toBe(409);

    // ── A SENT offer revised with a reason → Rev 2; re-priced; the new draft refreshes in place ─
    await estimator.reload();
    const reason2 = 'Client asked for a lower camera specification after the site walk';
    await estimator.getByTestId('offer-revise-reason').fill(reason2);
    await estimator.getByTestId('offer-revise').click();
    await expect(estimator.getByText(/Rev 2 raised from the current estimate/)).toBeVisible({ timeout: 30_000 });
    const rev2Id = (await offerOf()).offer!.id;
    expect((await quote(rev2Id)).total, 'regenerated from the frozen estimate, Rev 2 starts at Rev 1\'s figures').toBe(rev1.total);
    await priceOk(380);
    await estimator.getByTestId('offer-refresh').click();
    await expect(estimator.getByText(/Rev 2 refreshed in place from the estimate/)).toBeVisible({ timeout: 30_000 });
    const rev2 = await quote(rev2Id);
    expect(rev2).toMatchObject({ revision: 2, status: 'draft', parentQuotationId: rev1Id });
    expect(rev2.total).toBeLessThan(rev1.total);

    // ── THE REVIEWER compares revisions on screen: figures per BOQ item, and every decision ──────
    const reviewer = await seat(browser, baseURL!, USERS.qs2);
    await reviewer.goto(`/crm/quotations/${rev2Id}?focus=revisions`);
    await expect(async () => {
      await reviewer.getByRole('tab', { name: /^Revisions/ }).click();
      await expect(reviewer.getByTestId('revision-compare-row')).toHaveCount(1, { timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
    const money = (n: number) => new Intl.NumberFormat('en-AE', { maximumFractionDigits: 2 }).format(n);
    const cmp = await call<{ rows: Array<{ from: { unitPrice: number; lineTotal: number }; to: { unitPrice: number; lineTotal: number }; delta: number }>; totalDelta: number }>('qs2', 'GET', `/crm/quotations/${rev2Id}/compare?with=${rev1Id}`);
    expect(cmp.totalDelta).toBe(Math.round((rev2.total - rev1.total) * 100) / 100);
    const row = reviewer.getByTestId('revision-compare-row');
    await expect(row).toContainText(money(cmp.rows[0].from.unitPrice));
    await expect(row).toContainText(money(cmp.rows[0].to.unitPrice));
    await expect(row).toContainText(money(cmp.rows[0].delta));
    await expect(reviewer.getByTestId('revision-compare-total')).toContainText(money(rev1.total));
    await expect(reviewer.getByTestId('revision-compare-total')).toContainText(money(rev2.total));
    const decisions = reviewer.getByTestId('revision-compare-decisions');
    await expect(decisions).toContainText(`Approved by ${USERS.qs2}`);
    await expect(decisions).toContainText(`Revised by ${USERS.estimator}`);
    await expect(decisions).toContainText(reason2);
    await reviewer.getByTestId('revision-compare-with').selectOption({ label: 'Rev 0 · revised' });
    await expect(decisions).toContainText(`Returned by ${USERS.qs2}`);
    await expect(decisions).toContainText(returnReason);
    await expect(decisions).toContainText(reason1);
    await refused('viewer', 'PATCH', `/crm/quotations/${rev2Id}/status`, { action: 'approve' }, 403, '');
    const viewerCompare = await raw('viewer', 'GET', `/crm/quotations/${rev2Id}/compare?with=${rev1Id}`);
    expect(viewerCompare.status(), 'the comparison shows cost — internal pricing only').toBe(403);

    // ── Rev 2 approved; submitted; AWARDED — the award pins Rev 2 exactly ─────────────────────
    await call('estimator', 'PATCH', `/crm/quotations/${rev2Id}/status`, { action: 'submit_review' });
    await evidence(rev2Id);
    await call('qs2', 'PATCH', `/crm/quotations/${rev2Id}/status`, { action: 'approve' });
    const rev2Baseline = await call<{ id: string; total: number }>('qs2', 'GET', `/crm/quotations/${rev2Id}/baseline`);
    const readiness = await call<{ ready: boolean; commercialQuotationId: string; commercialQuotationRevision: number; gaps: string[] }>('salesmgr', 'GET', `/tendering/tenders/${T}/submission-readiness`);
    expect(readiness).toMatchObject({ commercialQuotationId: rev2Id, commercialQuotationRevision: 2 });
    await call('salesmgr', 'POST', '/tendering/bid-scores', {
      tenderId: T, tenderTitle: `Creek Harbour — ELV ${run}`,
      criteria: [{ name: 'Strategic fit', weight: 3, score: 8 }, { name: 'Technical capability', weight: 3, score: 9 }, { name: 'Commercial attractiveness', weight: 2, score: 7 }],
      notes: 'Repeat client; core ELV scope.',
    });
    await call('salesmgr', 'POST', `/tendering/tenders/${T}/submit`, { method: 'email', reference: `EMR-${run}` });
    const awarded = await call<{ status: string; commercialBasis: { baselineId: string; quotationId: string; value: number } }>('salesmgr', 'POST', `/tendering/tenders/${T}/award`, {
      awardedValue: Math.round(rev2Baseline.total / 1.05), currency: 'AED', awardedAt: '2026-09-25T12:00:00.000Z', awardReference: `LOA-${run}`,
    });
    expect(awarded).toMatchObject({ status: 'won', commercialBasis: { baselineId: rev2Baseline.id, quotationId: rev2Id, value: rev2Baseline.total } });
    await refused('estimator', 'POST', `/tendering/tenders/${T}/quotation/revise`, { reason: 'After the award' }, 409, 'only be revised before the award');
    await estimator.reload();
    await expect(estimator.getByTestId('tender-offer-guidance')).toContainText('awarded on its approved revision');

    // ── PRESERVED: Rev 0 and Rev 1 keep their figures, their baseline and their decisions ─────
    expect(await quote(rev0Id)).toMatchObject({ status: 'revised', total: rev0.total, revision: 0 });
    expect(await quote(rev1Id)).toMatchObject({ status: 'revised', total: rev1.total, revision: 1 });
    expect(await call('qs2', 'GET', `/crm/quotations/${rev1Id}/baseline`)).toMatchObject({ id: rev1Baseline.id, total: rev1Baseline.total });
    const rev0Decisions = await call<Array<{ outcome: string; revision: number; decidedBy: string; reason: string }>>('qs2', 'GET', `/crm/quotations/${rev0Id}/review-decisions`);
    expect(rev0Decisions.map((d) => [d.outcome, d.revision, d.decidedBy, d.reason])).toEqual([
      ['returned', 0, USERS.qs2, returnReason],
      ['revised', 0, USERS.estimator, reason1],
    ]);
    const rev1Decisions = await call<Array<{ outcome: string; decidedBy: string; reason: string }>>('qs2', 'GET', `/crm/quotations/${rev1Id}/review-decisions`);
    expect(rev1Decisions.map((d) => [d.outcome, d.decidedBy, d.reason])).toEqual([['revised', USERS.estimator, reason2]]);
    const chain = await call<Quote[]>('qs2', 'GET', `/crm/quotations/${rev2Id}/revisions`);
    expect(chain.map((q) => [q.revision, q.status, q.quoteNumber])).toEqual([
      [0, 'revised', rev0.quoteNumber], [1, 'revised', rev0.quoteNumber], [2, 'approved', rev0.quoteNumber],
    ]);
  });
});
