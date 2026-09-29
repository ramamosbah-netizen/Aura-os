import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { provisionedActorsUnavailable } from './provisioned-actors';
import { signInAs } from './project-member-harness';

/**
 * SEC-01 D-13 — WHO WORKS THE PRE-AWARD PACKAGE: the Estimator prices, Pre-Sales scopes.
 *
 * Owner's decision (2026-09-28): apply the role split ONLY after the mismatch is reproduced in the
 * browser. The mismatch: the package's routes derived names only `crm.*` reached, so on the shipped
 * roles only the Sales Manager could add a scope basis or edit an estimate's build-ups — the Estimator
 * working in the estimation workspace and the Pre-Sales engineer in the Commercial panel were refused
 * the acts their jobs are.
 *
 * REPRODUCED 2026-09-28 by this spec in its first form, on these screens, before any change: Pre-Sales
 * saw `Access denied: no grant satisfies "crm.opportunity.scope"` and the Estimator `Access denied: no
 * grant satisfies "crm.opportunity.build-ups"`. The routes now declare the vocabularies those roles
 * already speak (`crm.scope.*`, `crm.estimate.*`, `crm.pricing-sheet.*`), and this spec proves the same
 * two acts now succeed and persist. The forbidden side — Pre-Sales refused the estimate, the Estimator
 * refused the scope and the pricing policy — is proved against the API (sec01-owner-decisions.e2e-spec.ts).
 */
const V1 = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const USERS = { presales: 'u-e2e-presales', techmgr: 'u-e2e-techmgr', estimator: 'u-e2e-estimator', salesmgr: 'u-e2e-salesmgr' } as const;
type Actor = keyof typeof USERS;

async function login(api: APIRequestContext, username: string): Promise<Record<string, string>> {
  const r = await api.post(`${V1}/auth/login`, { data: { username, password: process.env.E2E_PASSWORD ?? 'e2e-password' } });
  expect(r.ok(), `${username} must sign in — ${await r.text()}`).toBe(true);
  return { Authorization: `Bearer ${((await r.json()) as { token: string }).token}` };
}

async function governedDeal(api: APIRequestContext, as: Record<Actor, Record<string, string>>, run: string) {
  const ok = async <T>(res: import('@playwright/test').APIResponse, act: string): Promise<T> => {
    expect(res.ok(), `${act} — ${res.status()} ${await res.text()}`).toBe(true);
    return (await res.json()) as T;
  };
  const opp = await ok<{ id: string }>(await api.post(`${V1}/crm/opportunities`, {
    headers: as.salesmgr, data: { title: `D-13 access ${run}`, value: 250_000, executionType: 'direct_sale' },
  }), 'opening the opportunity');
  const base = `${V1}/crm/opportunities/${opp.id}/pre-award-package`;
  const study = await ok<{ id: string }>(await api.post(`${base}/studies`, {
    headers: as.presales,
    data: {
      title: `D-13 study ${run}`, inputRevision: 'Client enquiry Rev 0', reviewerId: USERS.techmgr,
      scopeSummary: 'Access control for an office floor.', systems: [{ discipline: 'access-control', name: 'Access control' }],
      requirements: [{ category: 'client', statement: '12 card readers', compliance: 'compliant' }],
      surveyFindings: [], clarifications: [], deviations: [], assumptions: [], exclusions: [], evidence: [],
    },
  }), 'Pre-Sales writing the study');
  await ok(await api.post(`${base}/studies/${study.id}/submit`, { headers: as.presales, data: {} }), 'submitting the study');
  await ok(await api.post(`${base}/studies/${study.id}/approve`, { headers: as.techmgr, data: { comment: 'Accepted for estimating' } }), 'approving the study');
  return { opp, base, ok };
}

test('D-13 — Pre-Sales creates the scope basis and the Estimator saves a build-up, on the screens that refused them', async ({ browser, page, baseURL }) => {
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  const unavailable = await provisionedActorsUnavailable(page.request);
  test.skip(unavailable !== null, unavailable ?? '');
  test.setTimeout(360_000);
  const api = page.request;
  const as = {} as Record<Actor, Record<string, string>>;
  for (const [actor, username] of Object.entries(USERS) as Array<[Actor, string]>) as[actor] = await login(api, username);
  const run = Date.now().toString().slice(-6);
  const { opp, base, ok } = await governedDeal(api, as, run);

  // ── Pre-Sales, on the Commercial panel: create the scope basis ──────────────────────────────────
  const presalesContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const presales = await presalesContext.newPage();
  expect(await signInAs(presales, baseURL!, USERS.presales), 'Pre-Sales signs in').toBe(true);
  await presales.goto(`/crm/opportunities/${opp.id}?area=commercial`, { waitUntil: 'domcontentloaded' });
  const openPackage = presales.getByRole('button', { name: 'Open Pre-Award package' });
  const scopeItem = presales.getByPlaceholder('Scope item').last();
  await expect(openPackage.or(scopeItem)).toBeVisible({ timeout: 60_000 });
  if (await openPackage.isVisible()) {
    await ok(await api.post(`${base}/open`, { headers: as.salesmgr, data: {} }), 'the Sales Manager opening the package');
    await presales.reload({ waitUntil: 'domcontentloaded' });
  }
  await scopeItem.fill(`Card reader ${run}`);
  await presales.getByPlaceholder('Qty').last().fill('12');
  await presales.getByRole('button', { name: /Create scope basis/ }).click();
  await expect(presales.getByText('Basis B-001'), 'Pre-Sales creates the scope basis').toBeVisible({ timeout: 30_000 });
  await expect(presales.getByText(/Access denied/)).toHaveCount(0);
  await presales.reload({ waitUntil: 'domcontentloaded' });
  await expect(presales.getByText('Basis B-001'), 'and it is there after a reload').toBeVisible({ timeout: 60_000 });

  // ── The Estimator, in the estimation workspace: save a build-up ─────────────────────────────────
  // The basis Pre-Sales just created, approved by the Sales Manager; then the ESTIMATOR costs it —
  // an act that was refused before this change too.
  const pkgNow = (await (await api.get(`${base}`, { headers: as.salesmgr })).json()) as { basis?: Array<{ id: string; status: string; lines?: Array<{ lineId: string }> }> };
  const draftBasis = pkgNow.basis?.find((b) => b.status === 'draft');
  expect(draftBasis, 'the basis Pre-Sales created is readable').toBeDefined();
  const scope = await ok<{ id: string; lines: Array<{ lineId: string; description: string; quantity: number | null; unit: string }> }>(await api.post(`${base}/scope/${draftBasis!.id}/approve`, { headers: as.salesmgr, data: {} }), 'approving the scope');
  const lines = scope.lines.map((l) => ({ lineId: l.lineId, description: l.description, quantity: l.quantity ?? 12, unit: l.unit }));
  const costed = await ok<{ estimate: { id: string } }>(await api.post(`${base}/estimate`, {
    headers: as.estimator,
    data: { basisRevisionId: scope.id, lines, buildUps: [{ basisLineId: lines[0].lineId, components: [{ costType: 'material', description: 'Card reader', quantity: 1, unitCost: 300 }] }] },
  }), 'the Estimator costing the approved scope');

  const estimatorContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const estimator = await estimatorContext.newPage();
  expect(await signInAs(estimator, baseURL!, USERS.estimator), 'the Estimator signs in').toBe(true);
  await expect(async () => {
    await estimator.goto(`/crm/opportunities/${opp.id}/pre-award/estimate/${costed.estimate.id}`, { waitUntil: 'domcontentloaded' });
    await expect(estimator.getByRole('button', { name: 'Save draft' })).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 90_000 });
  await estimator.getByLabel('Supply unit price').first().fill('320');
  const saved = estimator.waitForResponse((r) => r.url().includes('/build-ups') && r.request().method() === 'PATCH');
  await estimator.getByRole('button', { name: 'Save draft' }).click();
  const savedResponse = await saved;
  // Waited for before reloading: a reload while the PATCH is in flight cancels the save itself.
  expect(savedResponse.status(), 'the Estimator’s save is accepted').toBe(200);
  await expect(estimator.getByText(/Access denied|Save failed/)).toHaveCount(0, { timeout: 30_000 });
  await expect(async () => {
    await estimator.reload({ waitUntil: 'domcontentloaded' });
    await expect(estimator.getByLabel('Supply unit price').first(), 'the Estimator’s build-up is saved and read back').toHaveValue('320', { timeout: 10_000 });
  }).toPass({ timeout: 60_000 });

  await presalesContext.close();
  await estimatorContext.close();
});
