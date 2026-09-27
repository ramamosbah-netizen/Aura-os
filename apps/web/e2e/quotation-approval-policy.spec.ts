import { expect, test, type APIResponse, type Browser, type Page } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { signInAs } from './project-member-harness';

/**
 * EST-17 — THE QUOTATION APPROVAL POLICY IS COMPANY CONFIGURATION, CHANGED ON SCREEN, IN FORCE AT ONCE.
 *
 *   configure   the Admin opens Settings → Company Policies → Quotation Approval, starts a draft from
 *               the owner's defaults, and validation says why it cannot be activated as it stands
 *               (the Executive amount is the owner's to set; two roles hold no approval authority)
 *   refuse      activation is refused while validation reports an error
 *   adjust      the Admin removes the two unreachable steps, previews an offer's route, saves and
 *               activates with a reason; the change log shows who, when, why, before and after
 *   follow      offers submitted afterwards follow it in the approvers' own sessions: out of turn is
 *               refused, each step is recorded, the last step approves — no deployment in between
 *   manual      a manual quotation is refused under the policy
 *   version     a new version applies only to approvals started after it; one already started keeps
 *               the version it began under
 *   restore     the Admin retires the policy; the tenant is back to a single approval
 *
 * TEST VALUES ONLY: the policy activated here (Commercial Manager then Sales Manager, then Sales
 * Manager alone) exists to prove the mechanism. It is not the owner's policy, which stays a draft
 * until the owner sets the Executive amount and an administrator grants the approvers.
 */
const V1 = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const POLICY = '/admin/settings/company-policies/quotation-approval';
const USERS = { sales: 'u-e2e-sales', commercial: 'u-e2e-qs', salesmgr: 'u-e2e-salesmgr' } as const;
type Actor = keyof typeof USERS;

async function sessionAs(browser: Browser, baseURL: string, username: string): Promise<Page> {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  expect(await signInAs(page, baseURL, username), `${username} must sign in`).toBe(true);
  return page;
}

test('EST-17 — an Admin changes the quotation approval policy on screen and later offers follow it without a deployment', async ({ browser, page, baseURL }) => {
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  test.setTimeout(480_000);
  const api = page.request;
  const admin = apiAuthHeaders();
  const as = {} as Record<Actor, Record<string, string>>;
  for (const [actor, username] of Object.entries(USERS) as Array<[Actor, string]>) {
    const r = await api.post(`${V1}/auth/login`, { data: { username, password: process.env.E2E_PASSWORD ?? 'e2e-password' } });
    expect(r.ok(), `${username} must sign in — ${await r.text()}`).toBe(true);
    as[actor] = { Authorization: `Bearer ${((await r.json()) as { token: string }).token}` };
  }
  const ok = async <T>(res: APIResponse, act: string): Promise<T> => {
    expect(res.ok(), `${act} — ${res.status()} ${await res.text()}`).toBe(true);
    return (await res.json()) as T;
  };
  const overview = async () => ok<{ active: { version: number } | null; versions: Array<{ version: number; status: string }> }>(
    await api.get(`${V1}/admin/company-policies/quotation-approval`, { headers: admin }), 'reading the policy');
  const retireIfActive = async (reason: string) => {
    if ((await overview()).active) await ok(await api.post(`${V1}/admin/company-policies/quotation-approval/retire`, { headers: admin, data: { reason } }), 'retiring');
  };
  // The change log is append-only and keeps every earlier run's entries: each reason typed here
  // carries this run's id so the log can be read for THIS run.
  const run = Date.now().toString().slice(-6);

  // Start from no policy (a failed earlier run may have left one active).
  await retireIfActive('EST-17 proof: start from no policy');

  try {
    // Three offers raised while no policy is active — a manual quotation is still allowed then.
    const offer = async (name: string) => ok<{ id: string; quoteNumber: string }>(await api.post(`${V1}/crm/quotations`, {
      headers: as.sales,
      data: { customerName: `${name} ${run}`, issueDate: '2026-09-27', lines: [{ description: 'IP camera 4MP', quantity: 10, unit: 'no', unitPrice: 10_000, vatRate: 5 }] },
    }), `raising ${name}`);
    const A = await offer('EST-17 Offer A');
    const B = await offer('EST-17 Offer B');
    const C = await offer('EST-17 Offer C');
    for (const q of [A, B, C]) {
      const rows = await ok<Array<{ id: string; status: string }>>(await api.post(`${V1}/document-requirements/seed`, { headers: admin, data: { entityType: 'crm.quotation', entityId: q.id } }), 'seeding readiness');
      for (const row of rows.filter((r) => r.status === 'REQUIRED')) {
        await ok(await api.post(`${V1}/document-requirements/${row.id}/waive`, { headers: as.commercial, data: { reason: 'EST-17 proof: readiness evidence is not under test' } }), 'waiving');
      }
    }

    // ── The Admin reaches the policy through Settings → Company Policies ────────────────────────
    await page.goto('/admin/settings');
    await page.getByRole('link', { name: 'Open →' }).last().click();
    await expect(page).toHaveURL(/\/admin\/settings\/company-policies$/);
    await expect(page.getByTestId('company-policy-quotation-approval')).toContainText('No version is active');
    await page.getByRole('link', { name: 'Open →' }).click();
    await expect(page).toHaveURL(new RegExp(`${POLICY}$`));
    await expect(page.getByTestId('active-policy')).toContainText('No policy is active');

    const reason = page.getByLabel('Reason for the change');
    const startOwner = page.getByRole('button', { name: "Start a draft from the owner's defaults" });
    if (await startOwner.isVisible()) {
      await reason.fill(`EST-17 proof: start from the owner's defaults (${run})`);
      await startOwner.click();
      await expect(page.getByRole('status')).toContainText('started');
    } else {
      await page.getByRole('button', { name: "Load the owner's defaults" }).click();
    }
    const draft = page.getByTestId('policy-draft');
    await expect(draft).toBeVisible();
    for (const id of ['technical', 'commercial', 'sales', 'executive']) await expect(page.getByTestId(`policy-step-${id}`)).toBeVisible();
    await expect(page.getByTestId('policy-step-executive')).toContainText('Awaiting the owner');

    // Validation says why the owner's defaults cannot be activated as they stand.
    await page.getByRole('button', { name: 'Validate' }).click();
    const issues = page.getByTestId('policy-issues');
    await expect(issues).toContainText('pending-decision');
    await expect(issues).toContainText('unauthorised-approver');
    await expect(issues).toContainText('a policy does not grant the permission');
    await reason.fill(`EST-17 proof: try to activate as it stands (${run})`);
    await page.getByRole('button', { name: /^Activate version/ }).click();
    await expect(page.getByText(/Activating: .*validation failed/)).toBeVisible();

    // The Admin removes the two unreachable steps, validates, previews, saves and activates.
    await page.getByRole('button', { name: 'Remove Technical Manager' }).click();
    await page.getByRole('button', { name: 'Remove Executive' }).click();
    await page.getByRole('button', { name: 'Validate' }).click();
    await expect(issues).toContainText('No issues');
    await page.getByLabel('Preview net amount').fill('100000');
    await page.getByRole('button', { name: 'Preview the approval route' }).click();
    const preview = page.getByTestId('policy-preview');
    await expect(preview).toContainText('Commercial Manager');
    await expect(preview).toContainText('Sales Manager');
    await expect(preview).not.toContainText('Technical Manager');
    await reason.fill(`EST-17 proof: Commercial then Sales until the other approvers are granted (${run})`);
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('status')).toContainText('saved');
    await reason.fill(`EST-17 proof: in force for the browser proof (${run})`);
    await page.getByRole('button', { name: /^Activate version/ }).click();
    await expect(page.getByRole('status')).toContainText('is active');
    const v1 = (await overview()).active!.version;
    await expect(page.getByTestId('active-policy')).toContainText('Commercial Manager');
    const log = page.getByTestId('policy-changes');
    await expect(log).toContainText(`EST-17 proof: in force for the browser proof (${run})`);
    await expect(log).toContainText(`EST-17 proof: Commercial then Sales until the other approvers are granted (${run})`);
    await log.locator('details', { hasText: `EST-17 proof: Commercial then Sales until the other approvers are granted (${run})` }).locator('summary').click();
    await expect(log.locator('details', { hasText: `EST-17 proof: Commercial then Sales until the other approvers are granted (${run})` })).toContainText('steps.');

    // ── Under the policy a manual quotation is refused ──────────────────────────────────────────
    const manual = await api.post(`${V1}/crm/quotations`, { headers: as.sales, data: { customerName: `Manual ${run}`, issueDate: '2026-09-27', lines: [{ description: 'x', quantity: 1, unitPrice: 1, vatRate: 5 }] } });
    expect(manual.status()).toBe(409);
    expect(await manual.text()).toContain('forbids manual quotations for new deals');

    // ── Offers submitted now follow it, in the approvers' own sessions ──────────────────────────
    for (const q of [A, B]) await ok(await api.patch(`${V1}/crm/quotations/${q.id}/status`, { headers: as.sales, data: { action: 'submit_review' } }), 'submitting for review');
    const salesmgr = await sessionAs(browser, baseURL!, USERS.salesmgr);
    await salesmgr.goto(`/crm/quotations/${A.id}?focus=approval`);
    const routeA = salesmgr.getByTestId('approval-route');
    await expect(routeA).toContainText(`policy version ${v1}`);
    await expect(salesmgr.getByTestId('approval-step-commercial')).toContainText('waiting');
    await salesmgr.getByRole('button', { name: 'Approve ✓' }).click();
    await expect(salesmgr.getByText(/waiting on Commercial Manager/)).toBeVisible();

    const commercial = await sessionAs(browser, baseURL!, USERS.commercial);
    await commercial.goto(`/crm/quotations/${A.id}?focus=approval`);
    await commercial.getByRole('button', { name: 'Approve ✓' }).click();
    await expect(commercial.getByText('Your approval is recorded for your step')).toBeVisible();
    await expect(commercial.getByTestId('approval-step-commercial')).toContainText(`approved by ${USERS.commercial}`);
    await expect(commercial.getByTestId('approval-step-sales')).toContainText('waiting');

    await salesmgr.reload();
    await salesmgr.getByRole('button', { name: 'Approve ✓' }).click();
    await expect.poll(async () => ((await ok<{ status: string }>(await api.get(`${V1}/crm/quotations/${A.id}`, { headers: admin }), 'reading A')).status)).toBe('approved');
    await expect(salesmgr.getByTestId('approval-step-sales')).toContainText(`approved by ${USERS.salesmgr}`);

    // ── Version 2: the Sales Manager alone. B (already started) keeps version 1; C follows 2 ────
    await page.goto(POLICY);
    await reason.fill(`EST-17 proof: Sales Manager alone (${run})`);
    await page.getByRole('button', { name: 'Start a draft from the active version' }).click();
    await expect(page.getByRole('status')).toContainText('started');
    await page.getByRole('button', { name: 'Remove Commercial Manager' }).click();
    await reason.fill(`EST-17 proof: drop the Commercial step (${run})`);
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('status')).toContainText('saved');
    await reason.fill(`EST-17 proof: version 2 in force (${run})`);
    await page.getByRole('button', { name: /^Activate version/ }).click();
    await expect(page.getByRole('status')).toContainText('is active');
    const v2 = (await overview()).active!.version;
    expect(v2).toBeGreaterThan(v1);

    // B began under version 1: the Sales Manager still waits on the Commercial Manager.
    await salesmgr.goto(`/crm/quotations/${B.id}?focus=approval`);
    await expect(salesmgr.getByTestId('approval-route')).toContainText(`policy version ${v1}`);
    await expect(salesmgr.getByTestId('approval-step-commercial')).toContainText('waiting');
    // C begins under version 2: the Sales Manager alone approves it.
    await ok(await api.patch(`${V1}/crm/quotations/${C.id}/status`, { headers: as.sales, data: { action: 'submit_review' } }), 'submitting C');
    await salesmgr.goto(`/crm/quotations/${C.id}?focus=approval`);
    await expect(salesmgr.getByTestId('approval-route')).toContainText(`policy version ${v2}`);
    await expect(salesmgr.getByTestId('approval-step-commercial')).toHaveCount(0);
    await salesmgr.getByRole('button', { name: 'Approve ✓' }).click();
    await expect.poll(async () => ((await ok<{ status: string }>(await api.get(`${V1}/crm/quotations/${C.id}`, { headers: admin }), 'reading C')).status)).toBe('approved');

    // A Sales user cannot read or change company policy.
    expect((await api.get(`${V1}/admin/company-policies/quotation-approval`, { headers: as.sales })).status()).toBe(403);

    // ── The Admin retires it on screen: the tenant is back to a single approval ─────────────────
    await page.goto(POLICY);
    await reason.fill(`EST-17 proof: restore the single approval (${run})`);
    await page.getByRole('button', { name: `Retire version ${v2}` }).click();
    await expect(page.getByRole('status')).toContainText('retired');
    await expect(page.getByTestId('active-policy')).toContainText('No policy is active');
    await salesmgr.context().close();
    await commercial.context().close();
  } finally {
    await retireIfActive('EST-17 proof: restore after a failed run');
  }
});
