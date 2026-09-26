// AURA OS — EST-19 / J1-08: awarded quantity continuity on the DIRECT route.
//
// Measured before this slice: a governed direct offer was materialised at the approved scope's 24
// cameras, and a quotation-level pricing sheet then regenerated it at 30 — no scope change, no
// revision, a second writer of the sold quantity. The frozen criterion: "Reject mismatched source
// quantities; approved change creates traceable revision."
//
// The acts under test are the Estimator's, in the shipped r-estimator role: pricing the offer in the
// quotation's own workspace. The governed chain before them is fixture, signed as it is in
// journey-signal-to-close.spec.ts: Pre-Sales writes the study and the Technical Manager approves it; the
// scope and its estimate are prepared by the fixture preparer (the administrator — among shipped roles
// only the Sales Manager holds crm.opportunity.scope, and the Sales Manager is the checker here) and
// approved by the Sales Manager; the preparer opens, prices and freezes the pre-award pricing and
// the preparer materialises the offer (r-estimator holds none of those opportunity acts); the Estimator
// submits and revises it and prices it in its workspace. Then, in the Estimator's workspace: the approved line's quantity is HELD, the offer
// re-prices at 24, and a sheet asking for 30 is refused on both write paths — the offer keeps 24.
import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { provisionedActorsUnavailable } from './provisioned-actors';
import { signInAs } from './project-member-harness';

const V1 = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const USERS = {
  presales: 'u-e2e-presales', techmgr: 'u-e2e-techmgr', estimator: 'u-e2e-estimator', salesmgr: 'u-e2e-salesmgr',
} as const;
type Actor = keyof typeof USERS;

async function login(api: APIRequestContext, username: string): Promise<Record<string, string>> {
  const r = await api.post(`${V1}/auth/login`, { data: { username, password: process.env.E2E_PASSWORD ?? 'e2e-password' } });
  expect(r.ok(), `${username} must sign in — ${await r.text()}`).toBe(true);
  return { Authorization: `Bearer ${((await r.json()) as { token: string }).token}` };
}

test('a governed direct offer holds its approved quantity — priced, never re-measured, by its pricing sheet', async ({ browser, page, baseURL }) => {
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  const unavailable = await provisionedActorsUnavailable(page.request);
  test.skip(unavailable !== null, unavailable ?? '');
  test.setTimeout(360_000);

  const api = page.request;
  const as = {} as Record<Actor, Record<string, string>>;
  for (const [actor, username] of Object.entries(USERS) as Array<[Actor, string]>) as[actor] = await login(api, username);
  const ok = async <T>(res: import('@playwright/test').APIResponse, act: string): Promise<T> => {
    expect(res.ok(), `${act} — ${res.status()} ${await res.text()}`).toBe(true);
    return (await res.json()) as T;
  };
  const run = Date.now().toString().slice(-6);

  // ── The governed direct deal, each act by the role that owns it ─────────────────────────────
  const opp = await ok<{ id: string }>(await api.post(`${V1}/crm/opportunities`, {
    headers: as.salesmgr, data: { title: `EST-19 direct ${run}`, value: 400_000, executionType: 'direct_sale' },
  }), 'opening the direct opportunity');
  const base = `${V1}/crm/opportunities/${opp.id}/pre-award-package`;
  const study = await ok<{ id: string }>(await api.post(`${base}/studies`, {
    headers: as.presales,
    data: {
      title: `EST-19 study ${run}`, inputRevision: 'Client enquiry Rev 0', reviewerId: USERS.techmgr,
      scopeSummary: 'IP CCTV for a warehouse.', systems: [{ discipline: 'cctv', name: 'CCTV surveillance' }],
      requirements: [{ category: 'client', statement: '24 IP cameras', compliance: 'compliant' }],
      surveyFindings: [], clarifications: [], deviations: [], assumptions: [], exclusions: [], evidence: [],
    },
  }), 'Pre-Sales writing the study');
  await ok(await api.post(`${base}/studies/${study.id}/submit`, { headers: as.presales, data: {} }), 'submitting the study');
  await ok(await api.post(`${base}/studies/${study.id}/approve`, { headers: as.techmgr, data: { comment: 'Accepted for estimating' } }), 'the Technical Manager approving it');
  const lines = [{ lineId: 'camera-line', description: 'IP camera, 4MP dome', quantity: 24, unit: 'no', sourceLineId: 'est19-line-1' }];
  const preparer = apiAuthHeaders();
  const draft = await ok<{ id: string }>(await api.post(`${base}/scope`, { headers: preparer, data: { lines } }), 'drafting the scope');
  const scope = await ok<{ id: string }>(await api.post(`${base}/scope/${draft.id}/approve`, { headers: as.salesmgr, data: {} }), 'the Sales Manager approving the scope');
  const costed = await ok<{ estimate: { id: string } }>(await api.post(`${base}/estimate`, {
    headers: preparer,
    data: { basisRevisionId: scope.id, lines, buildUps: [{ basisLineId: 'camera-line', components: [{ costType: 'material', description: 'IP camera', quantity: 1, unitCost: 100 }] }] },
  }), 'costing the approved scope');
  await ok(await api.post(`${base}/estimate/${costed.estimate.id}/freeze`, { headers: preparer, data: {} }), 'freezing the estimate');
  await ok(await api.post(`${base}/estimate/${costed.estimate.id}/approve`, { headers: as.salesmgr, data: {} }), 'the Sales Manager approving the estimate');
  const pricing = await ok<{ id: string }>(await api.post(`${base}/pricing/open`, { headers: preparer, data: {} }), 'opening the pricing');
  await ok(await api.patch(`${base}/pricing/${pricing.id}/policy`, { headers: preparer, data: { method: 'target_margin', percent: 20 } }), 'setting the policy');
  await ok(await api.post(`${base}/pricing/${pricing.id}/freeze`, { headers: preparer, data: {} }), 'freezing the pricing');
  const quote = await ok<{ id: string; quoteNumber: string; lines: Array<{ quantity: number; sourceItemId: string | null }> }>(
    await api.post(`${V1}/crm/opportunities/${opp.id}/convert-to-quotation`, { headers: preparer, data: {} }), 'materialising the offer');
  expect(quote.lines).toEqual([expect.objectContaining({ quantity: 24, sourceItemId: 'camera-line' })]);

  const remeasured = [{ description: 'IP camera, 4MP dome', unit: 'no', sourceItemId: 'camera-line', quantity: 30, materialUnitCost: 100 }];
  const refused = async (res: import('@playwright/test').APIResponse, what: string) => {
    expect(res.status(), what).toBe(409);
    expect(((await res.json()) as { message: string }).message).toContain('carries 24 from the approved basis, and the pricing asks for 30');
  };

  // ── Rev 0, as materialised: its build-up is the frozen pre-award pricing — read-only on screen ─
  const context = await browser.newContext({ storageState: undefined });
  const estimator = await context.newPage();
  expect(await signInAs(estimator, baseURL!, USERS.estimator), 'the Estimator signs in').toBe(true);
  // Opened with a bounded retry: the e2e dev server can fail a first compile of this route.
  const openWorkspace = async (quotationId: string) => expect(async () => {
    await estimator.goto(`/crm/quotations/${quotationId}/pricing`, { waitUntil: 'domcontentloaded' });
    await expect(estimator.getByLabel('Quantity')).toHaveValue('24', { timeout: 8_000 });
  }).toPass({ timeout: 90_000 });
  await openWorkspace(quote.id);
  await expect(estimator.getByLabel('Quantity')).toBeDisabled();
  await expect(estimator.getByTestId('quantity-held')).toContainText('Quantity held by the approved scope');
  // The screen offered no way to re-measure it; the API did — a quotation-level sheet was a second
  // writer of the sold quantity. That door is now shut, by name.
  await refused(await api.post(`${V1}/crm/pricing-sheets`, { headers: as.estimator, data: { name: `EST-19 R0 ${run}`, quotationId: quote.id, lines: remeasured } }), 'a sheet asking Rev 0 for 30 is refused');

  // ── Rev 1: approved, sent, revised for the customer — the workspace is live, the quantity held ─
  await ok(await api.patch(`${V1}/crm/quotations/${quote.id}/status`, { headers: as.estimator, data: { action: 'submit_review' } }), 'submitting Rev 0 for review');
  const commercial = await login(api, process.env.E2E_COMMERCIAL_USERNAME ?? 'u-e2e-qs');
  for (const row of await ok<Array<{ id: string; status: string }>>(await api.post(`${V1}/document-requirements/seed`, { headers: as.estimator, data: { entityType: 'crm.quotation', entityId: quote.id } }), 'seeding the checklist')) {
    if (row.status === 'REQUIRED') await ok(await api.post(`${V1}/document-requirements/${row.id}/waive`, { headers: commercial, data: { reason: 'EST-19 proof: evidence is not under test here' } }), 'the Commercial Manager waiving a row');
  }
  await ok(await api.patch(`${V1}/crm/quotations/${quote.id}/status`, { headers: as.salesmgr, data: { action: 'approve' } }), 'the Sales Manager approving Rev 0');
  await ok(await api.patch(`${V1}/crm/quotations/${quote.id}/status`, { headers: as.salesmgr, data: { action: 'send' } }), 'the Sales Manager sending Rev 0');
  const rev1 = await ok<{ id: string; revision: number; lines: Array<{ quantity: number; sourceItemId: string | null }> }>(
    await api.post(`${V1}/crm/quotations/${quote.id}/revise`, { headers: as.estimator, data: {} }), 'the Estimator revising for the customer');
  expect(rev1).toMatchObject({ revision: 1 });
  expect(rev1.lines).toEqual([expect.objectContaining({ quantity: 24, sourceItemId: 'camera-line' })]);

  await openWorkspace(rev1.id);
  const quantity = estimator.getByLabel('Quantity');
  await expect(quantity).toBeDisabled();
  await expect(estimator.getByTestId('quantity-held')).toBeVisible();
  // …and Rev 1 re-prices at the held quantity, through the screen.
  await expect(estimator.getByLabel('Target margin %')).toBeEnabled();
  await estimator.getByLabel('Target margin %').fill('25');
  await estimator.getByRole('button', { name: 'Save draft (creates the sheet)' }).click();
  await expect(estimator.getByText(/Draft saved — sheet v1/)).toBeVisible({ timeout: 30_000 });
  await estimator.getByRole('button', { name: /Freeze baseline/ }).click();
  await expect(estimator.getByText(/Baseline frozen/)).toBeVisible({ timeout: 30_000 });
  await estimator.getByRole('button', { name: /Generate quotation/ }).click();
  await expect(estimator.getByText('Quotation lines generated from the frozen sheet.')).toBeVisible({ timeout: 30_000 });
  const repriced = await ok<{ lines: Array<{ quantity: number; unitPrice: number; sourceItemId: string | null }> }>(await api.get(`${V1}/crm/quotations/${rev1.id}`, { headers: as.estimator }), 'reading Rev 1 back');
  expect(repriced.lines).toEqual([expect.objectContaining({ quantity: 24, sourceItemId: 'camera-line' })]);

  // ── Re-measuring Rev 1 is refused on both write paths — and it keeps 24 ─────────────────────
  await refused(await api.post(`${V1}/crm/pricing-sheets`, { headers: as.estimator, data: { name: `EST-19 R1 ${run}`, quotationId: rev1.id, lines: remeasured } }), 'a new sheet asking Rev 1 for 30 is refused');
  const sheets = await ok<Array<{ id: string }>>(await api.get(`${V1}/crm/pricing-sheets?quotationId=${rev1.id}`, { headers: as.estimator }), 'listing Rev 1\'s sheets');
  const version = await ok<{ id: string }>(await api.post(`${V1}/crm/pricing-sheets/${sheets[0].id}/revise`, { headers: as.estimator, data: {} }), 'raising a new sheet version');
  await refused(await api.put(`${V1}/crm/pricing-sheets/${version.id}/lines`, { headers: as.estimator, data: { lines: remeasured } }), 'saving 30 onto a sheet version is refused');
  const after = await ok<{ lines: Array<{ quantity: number }> }>(await api.get(`${V1}/crm/quotations/${rev1.id}`, { headers: as.estimator }), 'reading Rev 1 back again');
  expect(after.lines.map((l) => l.quantity)).toEqual([24]);

  // ── An APPROVED change is the traceable path: scope revised to 30, approved, costed, priced, and
  //    materialised as the offer's next revision — superseding the live copy, never adopting it ───
  const lines30 = [{ ...lines[0], quantity: 30 }];
  const draft2 = await ok<{ id: string; revisionNo: number }>(await api.post(`${base}/scope`, { headers: preparer, data: { lines: lines30 } }), 'drafting the changed scope');
  const scope2 = await ok<{ id: string }>(await api.post(`${base}/scope/${draft2.id}/approve`, { headers: as.salesmgr, data: {} }), 'the Sales Manager approving the change');
  const costed2 = await ok<{ estimate: { id: string; basisRevisionId: string } }>(await api.post(`${base}/estimate`, {
    headers: preparer,
    data: { basisRevisionId: scope2.id, lines: lines30, buildUps: [{ basisLineId: 'camera-line', components: [{ costType: 'material', description: 'IP camera', quantity: 1, unitCost: 100 }] }] },
  }), 'costing the changed scope');
  expect(costed2.estimate.basisRevisionId).toBe(scope2.id);
  await ok(await api.post(`${base}/estimate/${costed2.estimate.id}/freeze`, { headers: preparer, data: {} }), 'freezing it');
  await ok(await api.post(`${base}/estimate/${costed2.estimate.id}/approve`, { headers: as.salesmgr, data: {} }), 'the Sales Manager approving it');
  const pricing2 = await ok<{ id: string }>(await api.post(`${base}/pricing/revision`, { headers: preparer, data: {} }), 'opening the pricing revision');
  await ok(await api.patch(`${base}/pricing/${pricing2.id}/policy`, { headers: preparer, data: { method: 'target_margin', percent: 20 } }), 'setting its policy');
  await ok(await api.post(`${base}/pricing/${pricing2.id}/freeze`, { headers: preparer, data: {} }), 'freezing it');
  const rev2 = await ok<{ id: string; revision: number; parentQuotationId: string; lines: Array<{ quantity: number; sourceItemId: string | null }> }>(
    await api.post(`${V1}/crm/opportunities/${opp.id}/convert-to-quotation`, { headers: preparer, data: {} }), 'materialising the approved change');
  expect(rev2.id, 'the live copy is superseded, not adopted').not.toBe(rev1.id);
  expect(rev2).toMatchObject({ revision: 2, parentQuotationId: rev1.id });
  expect(rev2.lines).toEqual([expect.objectContaining({ quantity: 30, sourceItemId: 'camera-line' })]);
  const chain = await ok<Array<{ revision: number; status: string; lines: Array<{ quantity: number }> }>>(await api.get(`${V1}/crm/quotations/${rev2.id}/revisions`, { headers: as.estimator }), 'reading the revision chain');
  expect(chain.map((q) => [q.revision, q.status, q.lines[0].quantity])).toEqual([[0, 'revised', 24], [1, 'revised', 24], [2, 'draft', 30]]);
  // …and on screen, Rev 2 holds the approved 30.
  await expect(async () => {
    await estimator.goto(`/crm/quotations/${rev2.id}/pricing`, { waitUntil: 'domcontentloaded' });
    await expect(estimator.getByLabel('Quantity')).toHaveValue('30', { timeout: 8_000 });
  }).toPass({ timeout: 90_000 });
  await expect(estimator.getByLabel('Quantity')).toBeDisabled();
  await context.close();
});
