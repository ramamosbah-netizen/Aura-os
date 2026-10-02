// AURA OS — F-01: a printed document carries its issuer's governed identity, never a typed-in one.
//
// Thirteen print pages (tax invoice, purchase order, payslip, contracts, certificates, NCR, …) and
// two account print views typed their issuer in: "AURA OS Contracting LLC, Dubai, TRN
// 100000000000003" — a name and a tax number nobody configured, on the paper a customer receives.
//
// Proved here, Auth ON against PostgreSQL:
//   server     a customer invoice's print page shows the organisation profile's legal name, TRN and
//              address (its session carries no company — the tenant's single identity speaks)
//   client     an account dossier, rendered in the browser, shows the same identity from the same API
//   governed   an administrator records a company's own legal name and address in the company's
//              "Document identity" fold, and it survives a reload
// The two-company case (each company's paper shows its own identity, never another's) is proved at
// the API with company-carrying sessions: apps/api/test/document-issuer-identity.e2e-spec.ts.
import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const H = () => ({ 'content-type': 'application/json', ...apiAuthHeaders() });

async function setting(request: APIRequestContext, key: string): Promise<string> {
  const res = await request.get(`${API}/admin/settings`, { headers: H() });
  expect(res.ok(), await res.text()).toBe(true);
  const rows = (await res.json()) as Array<{ key: string; value: string }>;
  return rows.find((row) => row.key === key)?.value ?? '';
}
async function setSetting(request: APIRequestContext, key: string, value: string): Promise<void> {
  const res = await request.post(`${API}/admin/settings`, { headers: H(), data: { key, value } });
  expect(res.ok(), await res.text()).toBe(true);
}

test('printed documents carry the governed issuer identity, and a company records its own', async ({ page, request }) => {
  test.setTimeout(240_000);
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  const run = Date.now().toString().slice(-6);
  const PROFILE: Record<string, string> = {
    'company.legalName': `Probe Holding ${run} L.L.C.`,
    'company.trn': `100${run}000000`,
    'company.address': `Tower ${run}, Business Bay, Dubai`,
  };
  // The organisation profile is the tenant's, shared with every other spec: put it back afterwards.
  const before: Record<string, string> = {};
  for (const key of Object.keys(PROFILE)) before[key] = await setting(request, key);
  const companiesBefore = (await (await request.get(`${API}/admin/companies`, { headers: H() })).json()) as Array<{ id: string }>;
  // With a company registered, a document no company issued is that company's (or, with several,
  // the group's) — the unit and API proofs cover those. Here the profile is the issuer's whole identity.
  test.skip(companiesBefore.length > 0, 'this tenant registers companies, so the organisation profile is not the whole issuer identity');
  const probeCompany = `company-probe-${run}`;
  try {
    for (const [key, value] of Object.entries(PROFILE)) await setSetting(request, key, value);

    // ── A tax invoice, printed on the server ─────────────────────────────────────────────────────
    const invoice = await request.post(`${API}/finance/customer-invoices`, {
      headers: H(),
      data: { invoiceNumber: `IDN-${run}`, customerName: 'Marina Developments', issueDate: '2026-10-01', dueDate: '2026-10-31', lines: [{ description: 'Progress claim', quantity: 1, unitPrice: 1000, vatRate: 5 }] },
    });
    expect(invoice.ok(), await invoice.text()).toBe(true);
    const { id } = (await invoice.json()) as { id: string };
    await page.goto(`/finance/customer-invoices/${id}/print`, { waitUntil: 'domcontentloaded' });
    const sheet = page.locator('.sheet');
    await expect(sheet).toContainText(PROFILE['company.legalName'], { timeout: 60_000 });
    await expect(sheet).toContainText(`TRN ${PROFILE['company.trn']}`);
    await expect(sheet).toContainText(PROFILE['company.address']);
    await expect(sheet).not.toContainText('AURA OS Contracting');
    await expect(sheet).not.toContainText('100000000000003');

    // ── An account dossier, printed in the browser ───────────────────────────────────────────────
    const account = await request.post(`${API}/crm/accounts`, { headers: H(), data: { name: `Issuer probe account ${run}` } });
    expect(account.ok(), await account.text()).toBe(true);
    const accountId = ((await account.json()) as { id: string }).id;
    await page.goto(`/crm/accounts/${accountId}/print`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('issuer-name')).toHaveText(PROFILE['company.legalName'], { timeout: 60_000 });
    await expect(page.locator('.sheet')).toContainText(`TRN ${PROFILE['company.trn']}`);
    await expect(page.locator('.sheet')).not.toContainText('AURA OS Contracting');

    // ── A company records its own identity, in its fold of the company registry ──────────────────
    const created = await request.post(`${API}/admin/companies`, { headers: H(), data: { id: probeCompany, name: `Probe Co ${run}`, trn: `100${run}999999` } });
    expect(created.ok(), await created.text()).toBe(true);
    await page.goto('/admin/organization', { waitUntil: 'domcontentloaded' });
    await page.getByTestId(`company-identity-toggle-${probeCompany}`).click({ timeout: 60_000 });
    const fold = page.getByTestId(`company-identity-${probeCompany}`);
    await fold.getByLabel(`Legal name of Probe Co ${run}`).fill(`Probe Co ${run} Systems L.L.C.`);
    await fold.getByLabel(`Registered address of Probe Co ${run}`).fill(`Office ${run}, Abu Dhabi`);
    await page.locator('tr', { has: page.getByTestId(`company-identity-toggle-${probeCompany}`) }).getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId(`company-identity-toggle-${probeCompany}`)).toBeVisible({ timeout: 30_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByTestId(`company-identity-toggle-${probeCompany}`).click({ timeout: 60_000 });
    await expect(fold.getByLabel(`Legal name of Probe Co ${run}`)).toHaveValue(`Probe Co ${run} Systems L.L.C.`);
    await expect(fold.getByLabel(`Registered address of Probe Co ${run}`)).toHaveValue(`Office ${run}, Abu Dhabi`);
    // …and that is what the company's own paper would say, TRN untouched by the edit.
    const identity = (await (await request.get(`${API}/documents/issuer-identity?companyId=${probeCompany}`, { headers: H() })).json()) as Record<string, string>;
    expect(identity).toMatchObject({ legalName: `Probe Co ${run} Systems L.L.C.`, address: `Office ${run}, Abu Dhabi`, trn: `100${run}999999` });
  } finally {
    await request.delete(`${API}/admin/companies?id=${probeCompany}`, { headers: H() });
    for (const [key, value] of Object.entries(before)) await setSetting(request, key, value);
  }
});
