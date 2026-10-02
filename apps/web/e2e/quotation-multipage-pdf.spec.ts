import { readFileSync } from 'node:fs';
import { inflateSync, constants as zlib } from 'node:zlib';
import { expect, test, type APIResponse, type Download } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { signInAs } from './project-member-harness';

/**
 * F-02 — AN APPROVED RECORD GENERATES A BRANDED, MULTIPAGE PDF WITH ITS REAL LINES AND REVISION.
 *
 * The register's finding was that the template designer's preview fills a layout with sample values
 * ("Al Habtoor Group", "AED 430,750.00", a stamp reading APPROVED) and generates nothing from a
 * record. Live documents are generated elsewhere — from the governed record by a governed layout —
 * and EST-18 proved a one-page customer offer. What no run had shown is that the generation holds
 * across pages: 45 priced lines from the approved basis, every page naming its issuer, document,
 * revision and place, the table header carried onto each page, no line lost at a break.
 */

const V1 = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const USERS = { presales: 'u-e2e-presales', techmgr: 'u-e2e-techmgr', salesmgr: 'u-e2e-salesmgr', sales: 'u-e2e-sales', commercial: 'u-e2e-qs' } as const;
type Actor = keyof typeof USERS;
const LINES = 45;

/** The text a PDF draws: every string shown with Tj, in order, from its (inflated) content streams. */
function pdfText(bytes: Buffer): string {
  const parts: string[] = [];
  let at = 0;
  for (;;) {
    const open = bytes.indexOf('stream', at);
    if (open < 0) break;
    let start = open + 'stream'.length;
    if (bytes[start] === 0x0d) start += 1;
    if (bytes[start] === 0x0a) start += 1;
    const close = bytes.indexOf('endstream', start);
    if (close < 0) break;
    const raw = bytes.subarray(start, close);
    try { parts.push(inflateSync(raw, { finishFlush: zlib.Z_SYNC_FLUSH }).toString('latin1')); } catch { parts.push(raw.toString('latin1')); }
    at = close + 'endstream'.length;
  }
  const shown = parts.join('\n').match(/\((?:\\.|[^\\)])*\)\s*Tj/g) ?? [];
  return shown.map((t) => t.replace(/\)\s*Tj$/, '').slice(1).replace(/\\([()\\])/g, '$1')).join(' ');
}

test('F-02 — an approved offer of 45 lines prints across pages, each naming issuer, document, revision and page', async ({ browser, page, baseURL }) => {
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  test.setTimeout(480_000);
  const api = page.request;
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
  const preparer = apiAuthHeaders();
  const run = Date.now().toString().slice(-6);
  const legalName = `Multipage Issuer ${run} L.L.C.`;

  // The organisation profile is shared with every other spec: put back what was there.
  const settings = (await ok<Array<{ key: string; value: string }>>(await api.get(`${V1}/admin/settings`, { headers: preparer }), 'reading settings'));
  const before = Object.fromEntries(['company.legalName', 'company.trn'].map((key) => [key, settings.find((row) => row.key === key)?.value ?? '']));
  try {
    for (const [key, value] of [['company.legalName', legalName], ['company.trn', `100${run}424242`]]) {
      await ok(await api.post('/api/admin/settings', { data: { key, value, description: 'F-02 multipage proof' } }), `setting ${key}`);
    }

    // ── The governed basis: approved study → approved scope of 45 lines → frozen estimate and pricing ──
    const customer = `Marina Heights Owners ${run}`;
    const account = await ok<{ id: string }>(await api.post(`${V1}/crm/accounts`, { headers: as.salesmgr, data: { name: customer } }), 'recording the customer');
    const opp = await ok<{ id: string }>(await api.post(`${V1}/crm/opportunities`, {
      headers: as.salesmgr, data: { title: `Marina Heights ELV ${run}`, value: 900_000, executionType: 'direct_sale', accountId: account.id, accountName: customer },
    }), 'opening the opportunity');
    const base = `${V1}/crm/opportunities/${opp.id}/pre-award-package`;
    const study = await ok<{ id: string }>(await api.post(`${base}/studies`, {
      headers: as.presales,
      data: {
        title: `Marina Heights ELV ${run}`, inputRevision: 'Client enquiry Rev 0', reviewerId: USERS.techmgr,
        scopeSummary: 'Structured cabling, CCTV and access control across 45 floors.',
        systems: [{ discipline: 'ELV', name: 'Integrated ELV', designBasis: 'Per floor distribution', interfaces: ['LAN'] }],
        requirements: [{ category: 'client', statement: 'One distribution per floor', sourceRef: 'Spec 2.1', compliance: 'compliant' }],
        surveyFindings: [], clarifications: [], deviations: [], assumptions: ['Work in normal hours'], exclusions: ['Civil works'], evidence: [],
      },
    }), 'Pre-Sales writing the study');
    await ok(await api.post(`${base}/studies/${study.id}/submit`, { headers: as.presales, data: {} }), 'submitting the study');
    await ok(await api.post(`${base}/studies/${study.id}/approve`, { headers: as.techmgr, data: { comment: 'Basis approved' } }), 'approving the study');

    const lines = Array.from({ length: LINES }, (_, i) => ({
      lineId: `floor-${i + 1}`, description: `Floor ${String(i + 1).padStart(2, '0')} distribution and terminations`,
      quantity: 10 + i, unit: 'no', sourceLineId: `f02-${run}-${i + 1}`,
    }));
    const draft = await ok<{ id: string }>(await api.post(`${base}/scope`, { headers: preparer, data: { lines } }), 'drafting the scope');
    const scope = await ok<{ id: string }>(await api.post(`${base}/scope/${draft.id}/approve`, { headers: as.salesmgr, data: {} }), 'approving the scope');
    const costed = await ok<{ estimate: { id: string } }>(await api.post(`${base}/estimate`, {
      headers: preparer,
      data: {
        basisRevisionId: scope.id, lines,
        buildUps: lines.map((line) => ({ basisLineId: line.lineId, components: [{ costType: 'material', description: 'Distribution kit', quantity: 1, unitCost: 100 }] })),
      },
    }), 'costing the approved scope');
    await ok(await api.post(`${base}/estimate/${costed.estimate.id}/freeze`, { headers: preparer, data: {} }), 'freezing the estimate');
    await ok(await api.post(`${base}/estimate/${costed.estimate.id}/approve`, { headers: as.salesmgr, data: {} }), 'approving the estimate');
    const pricing = await ok<{ id: string }>(await api.post(`${base}/pricing/open`, { headers: preparer, data: {} }), 'opening the pricing');
    await ok(await api.patch(`${base}/pricing/${pricing.id}/policy`, { headers: preparer, data: { method: 'target_margin', percent: 20 } }), 'setting the policy');
    await ok(await api.post(`${base}/pricing/${pricing.id}/freeze`, { headers: preparer, data: {} }), 'freezing the pricing');
    const quote = await ok<{ id: string; quoteNumber: string }>(await api.post(`${V1}/crm/opportunities/${opp.id}/convert-to-quotation`, { headers: preparer, data: {} }), 'materialising the offer');

    // ── Approved by the governed route ───────────────────────────────────────────────────────────
    await ok(await api.patch(`${V1}/crm/quotations/${quote.id}/status`, { headers: preparer, data: { action: 'submit_review' } }), 'submitting the offer');
    for (const row of await ok<Array<{ id: string; status: string }>>(await api.post(`${V1}/document-requirements/seed`, { headers: preparer, data: { entityType: 'crm.quotation', entityId: quote.id } }), 'seeding the checklist')) {
      if (row.status === 'REQUIRED') await ok(await api.post(`${V1}/document-requirements/${row.id}/waive`, { headers: as.commercial, data: { reason: 'F-02 proof: evidence is not under test here' } }), 'waiving a row');
    }
    await ok(await api.patch(`${V1}/crm/quotations/${quote.id}/status`, { headers: as.salesmgr, data: { action: 'approve' } }), 'the Sales Manager approving the offer');
    const approved = await ok<{ lines: Array<{ description: string; lineNet: number }>; revision: number }>(await api.get(`${V1}/crm/quotations/${quote.id}`, { headers: preparer }), 'reading the approved offer');
    expect(approved.lines).toHaveLength(LINES);

    // ── Downloaded through the page's own button, and read from the bytes ─────────────────────────
    const sales = await (await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } })).newPage();
    expect(await signInAs(sales, baseURL!, USERS.sales), 'Sales signs in').toBe(true);
    await sales.goto(`/crm/quotations/${quote.id}`, { waitUntil: 'domcontentloaded' });
    const downloadPromise = new Promise<Download>((resolve) => {
      sales.context().on('page', (tab) => tab.once('download', resolve));
      sales.once('download', resolve);
    });
    await sales.getByRole('link', { name: /Download PDF/ }).first().click({ timeout: 60_000 });
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`${quote.quoteNumber}-rev-0.pdf`);
    const bytes = readFileSync((await download.path())!);
    await download.saveAs(test.info().outputPath('quotation-multipage.pdf'));
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    const pages = (bytes.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
    expect(pages, 'forty-five lines do not fit one page').toBeGreaterThanOrEqual(2);
    const text = pdfText(bytes);

    // Every page names its issuer, the document, its revision and its place in the whole.
    for (let n = 1; n <= pages; n += 1) {
      expect(text, `page ${n} footer`).toContain(`${legalName} | ${quote.quoteNumber} | Rev ${approved.revision} | Page ${n} of ${pages}`);
    }
    // The table header is carried onto every page that holds lines.
    expect((text.match(/Description/g) ?? []).length, 'a table header on each page').toBeGreaterThanOrEqual(pages);
    // Every line, at its real description — none lost at a page break.
    for (const line of approved.lines) expect(text, line.description).toContain(line.description);
    // Branded on its face, and approved: nothing says otherwise.
    expect(text).toContain(legalName);
    expect(text).toContain(`TRN 100${run}424242`);
    expect(text).not.toMatch(/NOT APPROVED|NOT VALID/);
    expect(text).not.toContain('SAMPLE DATA');
  } finally {
    for (const [key, value] of Object.entries(before)) await api.post('/api/admin/settings', { data: { key, value, description: '' } });
  }
});

test('F-02 — the template designer says it is a design filled with sample data, not a document', async ({ page }) => {
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  test.setTimeout(120_000);
  const name = `F-02 design probe ${Date.now().toString().slice(-6)}`;
  const created = await page.request.post(`${V1}/templates`, { headers: { 'content-type': 'application/json', ...apiAuthHeaders() }, data: { name, category: 'Purchase Order', elements: [] } });
  expect(created.ok(), await created.text()).toBe(true);
  const { id } = (await created.json()) as { id: string };
  try {
    await page.goto('/admin/templates', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('a designed template does not generate any document yet', { exact: false })).toBeVisible({ timeout: 60_000 });
    await page.getByText(name).first().click();
    await expect(page.getByTestId('template-design-note')).toContainText('the preview fills it with sample values');
    await expect(page.getByRole('button', { name: /Preview with sample data/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Preview PDF$/ })).toHaveCount(0);
  } finally {
    await page.request.delete(`${V1}/templates/${id}`, { headers: apiAuthHeaders() });
  }
});
