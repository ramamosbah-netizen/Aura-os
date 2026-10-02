import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { memberPassword, signInAs } from './project-member-harness';

/**
 * VAT-BASIS-01 — a submitted bid says what its number is, and the award is compared with it NET WITH
 * NET. Auth ON, PostgreSQL.
 *
 * The submission used to store the approved offer's total INCLUDING VAT as a bare number, while the
 * customer's award is captured EXCLUDING VAT (ADR-0021). The first comparison built on them would
 * have read the VAT as a price difference: a tender won at exactly our price would look like a 4.76%
 * discount conceded. Neither the bid nor the award appeared on the tender at all.
 *
 *   seeded       a tender priced and its offer approved by the roles that own each step (API)
 *   submitted    the Sales Manager submits on screen; the submission, read back from PostgreSQL,
 *                carries the offer's gross AND its net and VAT, which add up to it exactly
 *   awarded      the Sales Manager records the award on screen at exactly our price before VAT
 *   compared     the tender shows the bid with its parts, the award excluding VAT, and "no
 *                difference" — not a VAT-sized one; Contract Value is still the offer's total
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const USERS = {
  salesmgr: 'u-e2e-salesmgr', presales: 'u-e2e-presales', techmgr: 'u-e2e-techmgr', estimator: 'u-e2e-estimator',
  qs: 'u-e2e-qs', qs2: 'u-e2e-qs2',
} as const;
type Actor = keyof typeof USERS;
type Headers = Record<string, string>;
const amount = (n: number): string => new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

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

test('a bid records its net and VAT, and an award at our price reads as no difference — not as the VAT', async ({ browser, request, baseURL }) => {
  test.setTimeout(360_000);
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
    const configured = await request.post('/api/admin/settings', { data: { key, value, description: 'VAT-BASIS-01 proof' } });
    expect(configured.ok(), await configured.text()).toBe(true);
  }

  // ── Seeded by the roles that own each step: a priced tender and its approved offer ──────────────
  const title = `Creek Harbour — CCTV ${run}`;
  const { id: T } = await call<{ id: string }>('salesmgr', 'POST', '/tendering/tenders', {
    tenderNumber: `TND-VAT-${run}`, title, clientName: 'Emaar Properties', submissionDeadline: '2026-12-31T00:00:00.000Z', estimatedValue: 0,
  });
  const study = await call<{ id: string }>('presales', 'POST', `/tendering/tenders/${T}/studies`, {
    title: 'CCTV technical study Rev A', inputRevision: 'RFP Rev 0', reviewerId: USERS.techmgr,
    scopeSummary: 'CCTV for a residential tower.', systems: [{ discipline: 'cctv', name: 'CCTV surveillance' }],
    requirements: [{ category: 'client', statement: '4MP minimum camera resolution', compliance: 'compliant' }],
    surveyFindings: [], clarifications: [], deviations: [], assumptions: [], exclusions: [], evidence: [],
  });
  await call('presales', 'POST', `/tendering/tenders/${T}/studies/${study.id}/submit`);
  await call('techmgr', 'POST', `/tendering/tenders/${T}/studies/${study.id}/approve`, { comment: 'Reviewed' });
  const takeoff = await call<{ id: string }>('presales', 'POST', `/tendering/tenders/${T}/quantity-takeoff`, {
    lines: [{ description: 'IP camera, 4MP dome, indoor', unit: 'no', quantity: 48 }],
  });
  await call('techmgr', 'POST', `/tendering/tenders/${T}/quantity-takeoff/${takeoff.id}/approve`);
  await call('estimator', 'POST', `/tendering/tenders/${T}/quantity-takeoff/${takeoff.id}/project-to-boq`);
  const { items: [camera] } = await call<{ items: Array<{ id: string }> }>('estimator', 'GET', `/tendering/tenders/${T}/boq`);
  await call('estimator', 'POST', `/tendering/tenders/${T}/pricing/items/${camera.id}`, {
    resources: { supplyUnitPrice: 437, technician: { count: 2, hours: 80, rate: 55 }, engineer: { count: 0, hours: 0, rate: 0 }, projectManager: { count: 0, hours: 0, rate: 0 }, transport: 0, wastagePercent: 0, accessories: 0, subcontract: 0, equipmentRent: 0, otherDirect: 0 },
    indirectPercent: 4, overheadPercent: 8, riskPercent: 3, profitPercent: 15,
  });
  const { id: Q } = await call<{ id: string }>('qs', 'POST', `/tendering/tenders/${T}/quotation`, {});
  await call('qs', 'PATCH', `/crm/quotations/${Q}/status`, { action: 'submit_review' });
  const checklist = await call<{ requirements: Array<{ id: string; type: string }> }>('qs2', 'GET', `/document-requirements?entityType=crm.quotation&entityId=${Q}`);
  for (const row of checklist.requirements) {
    if (row.type === 'VENDOR_QUOTE') {
      await call('qs2', 'POST', `/document-requirements/${row.id}/waive`, { reason: 'VAT-BASIS-01 proof: this tender was not put to suppliers; sourcing is proved elsewhere' });
    } else {
      await call('estimator', 'POST', `/document-requirements/${row.id}/evidence`, { type: 'EXTERNAL_REFERENCE', reference: `vat-${row.type}-${run}` });
    }
  }
  await call('qs2', 'PATCH', `/crm/quotations/${Q}/status`, { action: 'approve' });
  const baseline = await call<{ id: string; subtotal: number; vatTotal: number; total: number }>('qs2', 'GET', `/crm/quotations/${Q}/baseline`);
  expect(baseline.vatTotal, 'the offer carries VAT, or there is nothing to prove').toBeGreaterThan(0);
  await call('salesmgr', 'POST', '/tendering/bid-scores', {
    tenderId: T, tenderTitle: title,
    criteria: [{ name: 'Strategic fit', weight: 3, score: 8 }, { name: 'Technical capability', weight: 3, score: 9 }, { name: 'Commercial attractiveness', weight: 2, score: 7 }],
    notes: 'Repeat client; core ELV scope.',
  });

  // ── SUBMITTED on screen; the record, read back from PostgreSQL, says what its number is ─────────
  const sales = await seat(browser, baseURL!, USERS.salesmgr);
  try {
    await sales.goto(`/tendering/tenders/${T}`);
    await expect(async () => {
      await sales.getByTestId('tender-submit-open').click();
      await expect(sales.getByTestId('tender-submit-reference')).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
    await sales.getByTestId('tender-submit-reference').fill(`EMR-${run}`);
    await sales.getByTestId('tender-submit-confirm').click();
    await expect(sales.getByText(/Status: submitted/i)).toBeVisible({ timeout: 30_000 });

    const [submission] = await call<Array<{ submittedValue: number; valueBasis: string; submittedNet: number; submittedVat: number }>>('salesmgr', 'GET', `/tendering/tenders/${T}/submissions`);
    expect(submission).toMatchObject({ valueBasis: 'gross', submittedValue: baseline.total, submittedNet: baseline.subtotal, submittedVat: baseline.vatTotal });

    await sales.goto(`/tendering/tenders/${T}`);
    await expect(sales.getByTestId('tender-bid')).toContainText(
      `${amount(baseline.total)} including VAT — ${amount(baseline.subtotal)} before VAT + ${amount(baseline.vatTotal)} VAT`, { timeout: 30_000 });
    await expect(sales.getByTestId('tender-award')).toHaveCount(0);

    // ── AWARDED on screen at exactly our price before VAT ─────────────────────────────────────────
    await expect(async () => {
      await sales.getByRole('button', { name: 'Mark Won (Awarded)' }).click();
      await expect(sales.getByRole('dialog')).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
    const dialog = sales.getByRole('dialog');
    await dialog.getByPlaceholder('0.00').fill(String(baseline.subtotal));
    await dialog.getByPlaceholder('LOA / award letter reference').fill(`LOA-${run}`);
    await dialog.getByRole('button', { name: 'Record award' }).click();
    await expect.poll(async () => (await call<{ status: string }>('salesmgr', 'GET', `/tendering/tenders/${T}`)).status, { timeout: 30_000 }).toBe('won');

    // ── COMPARED: no difference, not the VAT; Contract Value is still the offer's total ────────────
    await sales.goto(`/tendering/tenders/${T}`);
    await expect(sales.getByTestId('tender-award')).toContainText(`AED ${amount(baseline.subtotal)} excluding VAT`, { timeout: 30_000 });
    await expect(sales.getByTestId('tender-award')).toContainText(`ref LOA-${run}`);
    await expect(sales.getByTestId('tender-bid-award-difference')).toHaveText('Against the bid, before VAT: no difference — awarded at the price we bid');
    await expect(sales.getByTestId('tender-bid-award')).toContainText('Compared before VAT: the award is recorded excluding VAT');
    const compared = await call<{ comparison: { state: string; difference: number; differencePercent: number } }>('salesmgr', 'GET', `/tendering/tenders/${T}/bid-versus-award`);
    expect(compared.comparison).toMatchObject({ state: 'compared', difference: 0, differencePercent: 0 });
    const tender = await call<{ commercialBasis: { value: number } | null }>('salesmgr', 'GET', `/tendering/tenders/${T}`);
    expect(tender.commercialBasis?.value, 'Contract Value is unchanged — the offer\'s total, including VAT').toBe(baseline.total);
  } finally {
    await sales.context().close();
  }
});
