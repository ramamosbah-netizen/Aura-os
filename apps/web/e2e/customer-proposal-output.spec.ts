import { readFileSync } from 'node:fs';
import { inflateSync, constants as zlib } from 'node:zlib';
import { expect, test, type APIResponse, type Download } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { signInAs } from './project-member-harness';

/**
 * EST-18 / J1-10 — THE CUSTOMER PROPOSAL, generated from the frozen study and estimate, approved,
 * issued and downloaded as a PDF, and read back from the bytes.
 *
 * Derived acceptance (the register's EST-18 criterion and the 2026-09-24 discovery's Slice E):
 *   generate    a branded offer from the approved study and the frozen pricing: company identity,
 *               customer, revision, lines at the approved quantity, totals, terms — and the
 *               ENGINEERING SCOPE it prices (J1-10: it printed money and no scope)
 *   leak-free   no internal cost vocabulary, and a deviation's internal impact note stays internal
 *   approve     an unapproved revision says so on its face ("nothing reaches a customer unapproved")
 *   issue       Sales records who received it and how, on screen; the offer keeps the record
 *   download    the PDF is the file the page's own Download button returns
 *   revisions   the next revision says what it supersedes and why; the old one says it is superseded
 *   denied      a viewer can neither download it nor read its basis
 */

const V1 = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const USERS = {
  presales: 'u-e2e-presales', techmgr: 'u-e2e-techmgr', salesmgr: 'u-e2e-salesmgr', sales: 'u-e2e-sales',
  commercial: 'u-e2e-qs', viewer: 'u-e2e-viewer',
} as const;
type Actor = keyof typeof USERS;

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

const INTERNAL = /\b(cost|costs|costing|margin|markup|mark-up|overhead|overheads|contingency|profit|build-up|buildup|labour rate|unit cost)\b/i;

test('EST-18 — the customer proposal is generated from the frozen basis, approved, issued, downloaded and revised', async ({ browser, page, baseURL }) => {
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

  for (const [key, value] of [
    ['company.name', 'AURA MEP Systems Test LLC'], ['company.legalName', 'AURA MEP Systems Test L.L.C.'],
    ['company.trn', '100999999999999'], ['company.address', 'Dubai, United Arab Emirates'], ['finance.defaultCurrency', 'AED'],
  ]) {
    await ok(await api.post('/api/admin/settings', { data: { key, value, description: 'EST-18 customer proposal proof' } }), `setting ${key}`);
  }

  // ── The frozen basis: an approved study with a real engineering scope, then scope, estimate, pricing ─
  const customer = `Jumeirah Villas Owners Association ${run}`;
  const account = await ok<{ id: string }>(await api.post(`${V1}/crm/accounts`, { headers: as.salesmgr, data: { name: customer } }), 'recording the customer');
  const opp = await ok<{ id: string }>(await api.post(`${V1}/crm/opportunities`, {
    headers: as.salesmgr, data: { title: `Jumeirah villas CCTV ${run}`, value: 300_000, executionType: 'direct_sale', accountId: account.id, accountName: customer },
  }), 'opening the direct opportunity');
  const base = `${V1}/crm/opportunities/${opp.id}/pre-award-package`;
  const study = await ok<{ id: string }>(await api.post(`${base}/studies`, {
    headers: as.presales,
    data: {
      title: `Villa compound CCTV ${run}`, inputRevision: 'Client enquiry Rev 0', reviewerId: USERS.techmgr,
      scopeSummary: 'Perimeter and entrance CCTV for the villa compound.',
      systems: [{ discipline: 'ELV', name: 'CCTV surveillance', designBasis: 'IP 4MP cameras', interfaces: ['LAN'] }],
      requirements: [
        { category: 'client', statement: '24 IP cameras', sourceRef: 'Spec 5.1', compliance: 'compliant' },
        { category: 'client', statement: '90-day recording retention', sourceRef: 'Spec 7.2', compliance: 'deviation' },
      ],
      surveyFindings: [],
      clarifications: [{ question: 'Is PoE switching in scope?', requestedFrom: 'Consultant', status: 'closed', answer: 'Yes, supplied by us', reference: 'RFI-03' }],
      deviations: [{ requirementRef: 'Spec 7.2', description: 'Retention offered at 30 days', impact: 'INTERNAL NOTE storage saving AED 2000', proposedResolution: 'Storage can be extended later', status: 'accepted' }],
      assumptions: ['Work in normal hours'], exclusions: ['Civil works', 'Builders work'], evidence: [],
    },
  }), 'Pre-Sales writing the study');
  await ok(await api.post(`${base}/studies/${study.id}/submit`, { headers: as.presales, data: {} }), 'submitting the study');
  await ok(await api.post(`${base}/studies/${study.id}/approve`, { headers: as.techmgr, data: { comment: 'Basis approved' } }), 'the Technical Manager approving it');
  const lines = [{ lineId: 'camera-line', description: 'IP camera, 4MP dome', quantity: 24, unit: 'no', sourceLineId: `est18-${run}` }];
  const draft = await ok<{ id: string }>(await api.post(`${base}/scope`, { headers: preparer, data: { lines } }), 'drafting the scope');
  const scope = await ok<{ id: string }>(await api.post(`${base}/scope/${draft.id}/approve`, { headers: as.salesmgr, data: {} }), 'approving the scope');
  const costed = await ok<{ estimate: { id: string } }>(await api.post(`${base}/estimate`, {
    headers: preparer,
    data: { basisRevisionId: scope.id, lines, buildUps: [{ basisLineId: 'camera-line', components: [{ costType: 'material', description: 'IP camera', quantity: 1, unitCost: 100 }] }] },
  }), 'costing the approved scope');
  await ok(await api.post(`${base}/estimate/${costed.estimate.id}/freeze`, { headers: preparer, data: {} }), 'freezing the estimate');
  await ok(await api.post(`${base}/estimate/${costed.estimate.id}/approve`, { headers: as.salesmgr, data: {} }), 'approving the estimate');
  const pricing = await ok<{ id: string }>(await api.post(`${base}/pricing/open`, { headers: preparer, data: {} }), 'opening the pricing');
  await ok(await api.patch(`${base}/pricing/${pricing.id}/policy`, { headers: preparer, data: { method: 'target_margin', percent: 20 } }), 'setting the policy');
  await ok(await api.post(`${base}/pricing/${pricing.id}/freeze`, { headers: preparer, data: {} }), 'freezing the pricing');
  const quote = await ok<{ id: string; quoteNumber: string }>(await api.post(`${V1}/crm/opportunities/${opp.id}/convert-to-quotation`, { headers: preparer, data: {} }), 'materialising the offer');
  await ok(await api.patch(`${V1}/crm/quotations/${quote.id}/terms`, {
    headers: preparer, data: { paymentConditions: '30% advance, balance on delivery', deliveryTerms: 'Six weeks from approval', exclusions: ['Civil works', 'Permits'] },
  }), 'setting the commercial terms');

  const sales = await (await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } })).newPage();
  expect(await signInAs(sales, baseURL!, USERS.sales), 'Sales signs in').toBe(true);

  // ── Unapproved: the draft says so on its face ─────────────────────────────────────────────────────
  const draftPdf = await sales.request.get(`/api/crm/quotations/${quote.id}/pdf`);
  expect(draftPdf.status()).toBe(200);
  expect(pdfText(await draftPdf.body())).toContain('DRAFT - NOT APPROVED FOR ISSUE');

  // ── Approved by the governed route ────────────────────────────────────────────────────────────────
  await ok(await api.patch(`${V1}/crm/quotations/${quote.id}/status`, { headers: preparer, data: { action: 'submit_review' } }), 'submitting the offer');
  for (const row of await ok<Array<{ id: string; status: string }>>(await api.post(`${V1}/document-requirements/seed`, { headers: preparer, data: { entityType: 'crm.quotation', entityId: quote.id } }), 'seeding the checklist')) {
    if (row.status === 'REQUIRED') await ok(await api.post(`${V1}/document-requirements/${row.id}/waive`, { headers: as.commercial, data: { reason: 'EST-18 proof: evidence is not under test here' } }), 'waiving a row');
  }
  await ok(await api.patch(`${V1}/crm/quotations/${quote.id}/status`, { headers: as.salesmgr, data: { action: 'approve' } }), 'the Sales Manager approving the offer');

  // ── Issued on screen, with who received it and how ────────────────────────────────────────────────
  await sales.goto(`/crm/quotations/${quote.id}`, { waitUntil: 'domcontentloaded' });
  await sales.getByRole('button', { name: 'Record as sent' }).first().click({ timeout: 30_000 });
  await sales.getByLabel('Issued to').fill(`Hessa Al Marri, procurement ${run}`);
  await sales.getByLabel('Issue channel').selectOption('email');
  await sales.getByRole('button', { name: 'Record issue' }).click();
  await expect(sales.getByText('Sent', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(sales.getByTestId('customer-issues')).toContainText(`to Hessa Al Marri, procurement ${run} by email — recorded by ${USERS.sales}`, { timeout: 30_000 });

  // ── Downloaded through the page's own button, and read from the bytes ─────────────────────────────
  // The button opens a new tab whose response is the attachment: listen on the tab from the moment
  // it exists, or the download can start before a listener is attached.
  const downloadPromise = new Promise<Download>((resolve) => {
    sales.context().on('page', (tab) => tab.once('download', resolve));
    sales.once('download', resolve);
  });
  await sales.getByRole('link', { name: /Download PDF/ }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${quote.quoteNumber}-rev-0.pdf`);
  const bytes = readFileSync((await download.path())!);
  // Kept beside the run's other results for a human to open (test-results/ is not committed).
  await download.saveAs(test.info().outputPath('customer-proposal-rev0.pdf'));
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  const text = pdfText(bytes);
  for (const printed of [
    'AURA MEP Systems Test L.L.C.', 'TRN 100999999999999', 'CUSTOMER QUOTATION', `${quote.quoteNumber} | Rev 0`, 'QUOTE TO', customer,
    'IP camera, 4MP dome', 'Subtotal', 'Total',
    'Technical basis', 'S-001', `Villa compound CCTV ${run}`, 'Scope of works', 'Perimeter and entrance CCTV for the villa compound.',
    'Systems', 'CCTV surveillance', 'IP 4MP cameras',
    'Deviations from the specification', 'Spec 7.2', 'Retention offered at 30 days', 'Storage can be extended later',
    'Clarifications', 'RFI-03', 'Yes, supplied by us', 'Assumptions', 'Work in normal hours',
    'Exclusions', 'Permits', 'Builders work', 'Payment conditions', '30% advance, balance on delivery', 'Delivery terms',
  ]) expect(text, `the issued proposal prints: ${printed}`).toContain(printed);
  expect(text.split('- Civil works').length - 1, 'an exclusion the offer and the study share is printed once').toBe(1);
  expect(text, 'an issued revision carries no draft or superseded banner').not.toMatch(/NOT APPROVED FOR ISSUE|SUPERSEDED/);
  expect(text, 'the deviation\'s internal impact note stays internal').not.toContain('INTERNAL NOTE');
  expect(text.match(INTERNAL), 'no internal cost vocabulary reaches the customer').toBeNull();

  // ── Revised: the new revision says what it supersedes and why; the old one says it is superseded ──
  const rev1 = await ok<{ id: string; revision: number }>(await api.post(`${V1}/crm/quotations/${quote.id}/revise`, {
    headers: preparer, data: { reason: 'Client asked for 60-day validity' },
  }), 'revising the offer for the customer');
  expect(rev1.revision).toBe(1);
  const rev1Text = pdfText(await (await sales.request.get(`/api/crm/quotations/${rev1.id}/pdf`)).body());
  expect(rev1Text).toContain('DRAFT - NOT APPROVED FOR ISSUE');
  expect(rev1Text).toContain(`supersedes ${quote.quoteNumber} Rev 0 - Client asked for 60-day validity`);
  const rev0Text = pdfText(await (await sales.request.get(`/api/crm/quotations/${quote.id}/pdf`)).body());
  expect(rev0Text).toContain('SUPERSEDED BY REV 1 - NOT VALID FOR ACCEPTANCE');

  // ── A study approved AFTER the offer does not rewrite the offer's document ────────────────────────
  const next = await ok<{ id: string; revisionNo: number }>(await api.post(`${base}/studies`, {
    headers: as.presales,
    data: {
      title: `Villa compound CCTV S-002 ${run}`, inputRevision: 'Client enquiry Rev 1', reviewerId: USERS.techmgr,
      scopeSummary: 'Revised scope for a later enquiry.', systems: [{ discipline: 'ELV', name: 'Access control', designBasis: 'Card readers', interfaces: [] }],
      requirements: [{ category: 'client', statement: 'Card access at the gate', sourceRef: 'Spec 9.1', compliance: 'compliant' }],
      surveyFindings: [], clarifications: [], deviations: [], assumptions: [], exclusions: [], evidence: [],
    },
  }), 'Pre-Sales opening the next study revision');
  expect(next.revisionNo).toBe(2);
  await ok(await api.post(`${base}/studies/${next.id}/submit`, { headers: as.presales, data: {} }), 'submitting S-002');
  await ok(await api.post(`${base}/studies/${next.id}/approve`, { headers: as.techmgr, data: { comment: 'Next revision approved' } }), 'approving S-002');
  const afterText = pdfText(await (await sales.request.get(`/api/crm/quotations/${quote.id}/pdf`)).body());
  expect(afterText, 'the Rev 0 document still cites the study it was priced from').toContain('S-001');
  expect(afterText).toContain('Perimeter and entrance CCTV for the villa compound.');
  expect(afterText, 'not the study approved after it').not.toContain('Revised scope for a later enquiry.');

  // ── Refused: a viewer reads neither the document nor its basis ────────────────────────────────────
  const viewer = await (await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } })).newPage();
  expect(await signInAs(viewer, baseURL!, USERS.viewer), 'the viewer signs in').toBe(true);
  expect((await viewer.request.get(`/api/crm/quotations/${quote.id}/pdf`)).status(), 'a viewer cannot download the proposal').toBe(403);
  expect((await api.get(`${V1}/crm/quotations/${quote.id}/proposal-basis`, { headers: as.viewer })).status(), 'nor read its basis').toBe(403);
});
