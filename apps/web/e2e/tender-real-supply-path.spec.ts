import { inflateSync, constants as zlib } from 'node:zlib';
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { memberPassword, signInAs } from './project-member-harness';

/** The text a PDF's pages actually draw — its content streams, inflated where they are compressed. */
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
    try {
      parts.push(inflateSync(raw, { finishFlush: zlib.Z_SYNC_FLUSH }).toString('latin1'));
    } catch {
      parts.push(raw.toString('latin1'));
    }
    at = close + 'endstream'.length;
  }
  return parts.join('\n');
}

/**
 * THE REAL THREE-QUOTATION PATH, in a browser, with the shipped roles — no waiver anywhere.
 *
 *   estimator       maps each BOQ item to a material and puts the supply scope to suppliers
 *   buyer / TM      (Procurement, proved on its own screens elsewhere) RFQ, quotations, verdicts
 *   estimator       reads the coverage — Al Noor's non-compliant camera does not count — and takes
 *                   the supply price from a governed supplier line
 *   commercial mgr  (the independent approver) sees "Vendor quotes" COUNTED per supply item, is
 *                   refused while the camera has two independent suppliers, and approves once a
 *                   third confirms
 *   sales manager   downloads the offer and records the submission; the submitted value is the
 *                   approved offer's frozen baseline, read back
 *
 * The acts under test are driven on screen. The steps other screens own — the technical study and
 * take-off, Procurement's quotation capture, the resource sheet, generating the offer and the
 * non-supplier evidence — are seeded through the API as the role whose job each is.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const USERS = {
  salesmgr: 'u-e2e-salesmgr', presales: 'u-e2e-presales', techmgr: 'u-e2e-techmgr', estimator: 'u-e2e-estimator',
  buyer: 'u-e2e-buyer', store: 'u-e2e-storekeeper', qs: 'u-e2e-qs', qs2: 'u-e2e-qs2',
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
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] }, acceptDownloads: true });
  const page = await context.newPage();
  expect(await signInAs(page, baseURL, username), `${username} could not sign in`).toBe(true);
  return page;
}

test.describe('A bid priced from real supplier quotations, end to end', () => {
  test.setTimeout(480_000);

  test('put to suppliers → coverage → supplier price → independent approval on computed evidence → proposal → submission', async ({ browser, request, baseURL }) => {
    test.skip(!memberPassword(), 'requires the Auth-ON local API and the e2e password');
    const tokens = {} as Record<Actor, Headers>;
    for (const [actor, username] of Object.entries(USERS) as Array<[Actor, string]>) {
      const t = await bearer(request, username);
      test.skip(!t, `${username} is not provisioned`);
      tokens[actor] = t!;
    }
    const run = Date.now().toString().slice(-6);
    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const call = async <T>(actor: Actor, method: 'GET' | 'POST' | 'PATCH', path: string, data?: unknown): Promise<T> => {
      const res = await request.fetch(`${API}${path}`, { method, headers: tokens[actor], data });
      expect(res.ok(), `${actor} ${method} ${path}: ${res.status()} ${await res.text()}`).toBe(true);
      return (await res.json().catch(() => ({}))) as T;
    };

    // ── Administration's precondition: a customer document needs the company's legal identity ─────
    for (const [key, value] of [
      ['company.name', 'AURA MEP Systems Test LLC'],
      ['company.legalName', 'AURA MEP Systems Test L.L.C.'],
      ['company.trn', '100999999999999'],
      ['company.address', 'Dubai, United Arab Emirates'],
      ['finance.defaultCurrency', 'AED'],
    ]) {
      const configured = await request.post('/api/admin/settings', { data: { key, value, description: 'Real supply path proof' } });
      expect(configured.ok(), await configured.text()).toBe(true);
    }

    // ── Seeded by the roles that own it: a tender with an approved study and a projected BOQ ─────
    const tender = await call<{ id: string }>('salesmgr', 'POST', '/tendering/tenders', {
      tenderNumber: `TND-RP-${run}`, title: `Al Reem Tower — ELV ${run}`, clientName: 'Aldar Properties',
      submissionDeadline: '2026-12-31T00:00:00.000Z', estimatedValue: 0,
    });
    const T = tender.id;
    const study = await call<{ id: string }>('presales', 'POST', `/tendering/tenders/${T}/studies`, {
      title: 'ELV technical study Rev A', inputRevision: 'RFP Rev 0', reviewerId: USERS.techmgr,
      scopeSummary: 'CCTV for a 42-storey residential tower.', systems: [{ discipline: 'cctv', name: 'CCTV surveillance' }],
      requirements: [{ category: 'client', statement: '4MP minimum camera resolution', compliance: 'compliant' }],
      surveyFindings: [], clarifications: [], deviations: [], assumptions: [], exclusions: [], evidence: [],
    });
    await call('presales', 'POST', `/tendering/tenders/${T}/studies/${study.id}/submit`);
    await call('techmgr', 'POST', `/tendering/tenders/${T}/studies/${study.id}/approve`, { comment: 'Reviewed' });
    const takeoff = await call<{ id: string }>('presales', 'POST', `/tendering/tenders/${T}/quantity-takeoff`, { lines: [
      { description: 'IP camera, 4MP dome, indoor', unit: 'no', quantity: 120 },
      { description: 'Cat6A cabling to camera points', unit: 'm', quantity: 3600 },
    ] });
    await call('techmgr', 'POST', `/tendering/tenders/${T}/quantity-takeoff/${takeoff.id}/approve`);
    await call('estimator', 'POST', `/tendering/tenders/${T}/quantity-takeoff/${takeoff.id}/project-to-boq`);
    const boq = await call<{ items: Array<{ id: string; description: string }> }>('estimator', 'GET', `/tendering/tenders/${T}/boq`);
    const camera = boq.items.find((i) => i.description.startsWith('IP camera'))!;
    const cable = boq.items.find((i) => i.description.startsWith('Cat6A'))!;
    const cam = await call<{ id: string; code: string }>('store', 'POST', '/inventory/materials', { code: `CAM-RP-${run}`, name: 'IP camera 4MP dome', uom: 'no' });
    const cbl = await call<{ id: string; code: string }>('store', 'POST', '/inventory/materials', { code: `CBL-RP-${run}`, name: 'Cat6A U/FTP cable', uom: 'm' });

    // ── ESTIMATOR, on screen: put the supply scope to suppliers, one confirmed mapping per item ───
    const estimator = await seat(browser, baseURL!, USERS.estimator);
    await estimator.goto(`/tendering/tenders/${T}/pricing`);
    for (const [item, material] of [[camera, cam], [cable, cbl]] as const) {
      const select = estimator.getByTestId(`map-material-${item.id}`);
      await expect(async () => {
        await select.focus();
        await expect(select.locator(`option[value="${material.id}"]`)).toHaveCount(1, { timeout: 3_000 });
      }).toPass({ timeout: 30_000 });
      await select.selectOption(material.id);
    }
    await estimator.getByTestId('put-to-suppliers').click();
    await expect(estimator.getByText(/put to suppliers on .* It prices this bid and buys nothing/)).toBeVisible();
    const pricing = await call<Array<{ requisition: { id: string; purpose: string; status: string }; lines: Array<{ id: string; quantity: number; uom: string; sourceBoqItemId: string; materialId: string; materialMappedBy: string }> }>>(
      'estimator', 'GET', `/tendering/tenders/${T}/pricing-requisitions`);
    expect(pricing).toHaveLength(1);
    expect(pricing[0].requisition).toMatchObject({ purpose: 'tender_pricing', status: 'draft' });
    const camLine = pricing[0].lines.find((l) => l.sourceBoqItemId === camera.id)!;
    const cblLine = pricing[0].lines.find((l) => l.sourceBoqItemId === cable.id)!;
    expect(camLine).toMatchObject({ materialId: cam.id, materialMappedBy: USERS.estimator });
    expect(cblLine).toMatchObject({ materialId: cbl.id, materialMappedBy: USERS.estimator });

    // ── Seeded: the resource sheet, and Procurement's quotations and verdicts ─────────────────────
    const sheet = (supply: number, hours: number) => ({
      resources: {
        supplyUnitPrice: supply, technician: { count: 2, hours, rate: 55 }, engineer: { count: 0, hours: 0, rate: 0 },
        projectManager: { count: 0, hours: 0, rate: 0 }, transport: 0, wastagePercent: 0, accessories: 0, subcontract: 0, equipmentRent: 0, otherDirect: 0,
      },
      indirectPercent: 4, overheadPercent: 8, riskPercent: 3, profitPercent: 15,
    });
    await call('estimator', 'POST', `/tendering/tenders/${T}/pricing/items/${camera.id}`, sheet(420, 180));
    await call('estimator', 'POST', `/tendering/tenders/${T}/pricing/items/${cable.id}`, sheet(6.8, 120));
    const rfq = await call<{ id: string }>('buyer', 'POST', '/procurement/rfqs', { title: `Pricing RFQ ${run}`, prId: pricing[0].requisition.id });
    await call('buyer', 'PATCH', `/procurement/rfqs/${rfq.id}/send`);
    const quote = async (name: string, code: string, prices: { cam?: number; cbl?: number }, judgedOnScreen = false) => {
      const supplier = await call<{ id: string }>('buyer', 'POST', '/procurement/suppliers', { code: `${code}-${run}`, name, category: 'materials' });
      const family = await call<{ baseOffer: { id: string } }>('buyer', 'POST', '/procurement/quotations/families', { rfqId: rfq.id, supplierName: name, supplierId: supplier.id, supplierQuotationRef: `${code}-Q-${run}` });
      const revision = await call<{ id?: string; revision?: { id: string } }>('buyer', 'POST', `/procurement/quotations/offers/${family.baseOffer.id}/revisions`, {
        supplierRevisionRef: 'Rev 1', receivedAt: today, quotationDate: today, validityDate: in30,
        currency: 'AED', taxTreatment: 'exclusive', taxRatePct: 5, paymentTerms: '30 days',
      });
      const revisionId = revision.id ?? revision.revision!.id;
      const lines: { cam?: string; cbl?: string } = {};
      for (const [key, line, price] of [['cam', camLine, prices.cam], ['cbl', cblLine, prices.cbl]] as const) {
        if (price === undefined) continue;
        const l = await call<{ id: string }>('buyer', 'POST', `/procurement/quotations/revisions/${revisionId}/lines`, {
          prLineId: line.id, response: 'quoted', quantity: line.quantity, uom: line.uom, unitPrice: price, complianceResponse: 'comply',
        });
        lines[key] = l.id;
        if (judgedOnScreen) continue;
        await call('techmgr', 'POST', `/procurement/quotation-lines/${l.id}/evaluation`, {
          verdict: 'compliant', rationale: 'Meets the specification as offered',
        });
      }
      await call('buyer', 'PATCH', `/procurement/quotations/revisions/${revisionId}/status`, { status: 'confirmed' });
      return { ...lines, revisionId };
    };
    const gss = await quote('Gulf Security Systems', 'GSS', { cam: 395, cbl: 6.2 });
    const eet = await quote('Emirates ELV Trading', 'EET', { cam: 410, cbl: 5.9 });
    const ant = await quote('Al Noor Technologies', 'ANT', { cam: 402, cbl: 6.5 }, true);

    // ── TECHNICAL MANAGER, on screen: Al Noor's offer is judged on the evaluator's own surface ─────
    const evaluator = await seat(browser, baseURL!, USERS.techmgr);
    await evaluator.goto(`/procurement/technical-evaluation/${ant.revisionId}`);
    const judge = async (lineId: string, verdict: 'compliant' | 'non_compliant', rationale: string, label: RegExp, expected: string): Promise<void> => {
      // The queue lists each offer collapsed; its case opens on click (retried across hydration).
      await expect(evaluator.getByTestId(`queue-item-${lineId}`)).toBeVisible({ timeout: 30_000 });
      const panel = evaluator.getByTestId(`evaluation-${lineId}`);
      await expect(async () => {
        await evaluator.getByTestId(`queue-open-${lineId}`).click();
        await expect(panel).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 30_000 });
      await panel.getByTestId('verdict').selectOption(verdict);
      await panel.getByTestId('verdict-rationale').fill(rationale);
      await panel.getByTestId('verdict-submit').click();
      await expect(panel.getByTestId('evaluation-eligibility')).toContainText(label, { timeout: 30_000 });
      // Read back under the Buyer's permission — the evaluator holds no procurement read.
      const standing = await call<{ eligibility: string; verdict: string | null; decidedBy: string | null }>('buyer', 'GET', `/procurement/quotation-lines/${lineId}/eligibility`);
      expect(standing).toMatchObject({ eligibility: expected, verdict, decidedBy: USERS.techmgr });
    };
    await judge(ant.cam!, 'non_compliant', 'Offered 2MP sensor; specification requires 4MP minimum', /Not compliant/, 'not_eligible');
    await judge(ant.cbl!, 'compliant', 'Cat6A U/FTP as specified', /Compliant/, 'eligible');

    // ── ESTIMATOR, on screen: coverage — and a non-compliant camera does not count ─────────────────
    await estimator.reload();
    await expect(estimator.getByTestId('coverage-verdict')).toContainText('Supply scope NOT covered — 1 of 2');
    const cameraCoverage = estimator.getByTestId(`coverage-item-${camera.id}`);
    await expect(cameraCoverage).toContainText('2 of 3 count');
    await expect(cameraCoverage).toContainText('Al Noor Technologies — judged non-compliant by the Technical Manager');
    await expect(estimator.getByTestId(`coverage-item-${cable.id}`)).toContainText('3 of 3 count');

    // The comparison the counts come from is Procurement's own, one click away — and its sheet is
    // the actual output of the commercial comparison for this requirement (EST-13).
    await expect(estimator.getByTestId(`comparison-${camLine.id}`)).toHaveAttribute('href', `/procurement/requirements/${camLine.id}/comparison`);
    const sheetPdf = await estimator.request.get(`/api/procurement/requirements/${camLine.id}/comparison.pdf`);
    expect(sheetPdf.ok(), await sheetPdf.text()).toBe(true);
    const sheetBytes = await sheetPdf.body();
    expect(sheetBytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    const sheetText = pdfText(sheetBytes);
    for (const supplier of ['Gulf Security Systems', 'Emirates ELV Trading', 'Al Noor Technologies']) {
      expect(sheetText, `the comparison sheet names ${supplier}`).toContain(supplier);
    }

    // The acts stay with their owners: the estimator does not judge a line, the Technical Manager does
    // not price the bid.
    const estimatorVerdict = await request.post(`${API}/procurement/quotation-lines/${gss.cam}/evaluation`, {
      headers: tokens.estimator, data: { verdict: 'non_compliant', rationale: 'estimator overriding the technical verdict' },
    });
    expect(estimatorVerdict.status()).toBe(403);
    const buildUps = await call<{ buildUps: Record<string, { id: string; components: Array<{ id?: string; costType: string }> }> }>(
      'estimator', 'GET', `/tendering/tenders/${T}/pricing`);
    const cameraBuildUp = buildUps.buildUps[camera.id];
    const cameraMaterial = cameraBuildUp.components.find((c) => c.costType === 'material')!;
    const managerPricing = await request.post(`${API}/tendering/tenders/${T}/pricing/buildups/${cameraBuildUp.id}/components/${cameraMaterial.id}/source`, {
      headers: tokens.techmgr, data: { quotationLineId: gss.cam, comparisonDate: today },
    });
    expect(managerPricing.status()).toBe(403);
    const salesComparison = await request.get(`${API}/procurement/quotations/by-requirement/${camLine.id}/comparison`, { headers: tokens.salesmgr });
    expect(salesComparison.status(), 'the sales manager does not read the supplier comparison').toBe(403);

    // …and takes the supply price from a counted, governed supplier line.
    // Retried until the OUTCOME shows: a first click can land before hydration, or on a route `next
    // dev` is still compiling. The readback below proves one governed source per item either way.
    const useOffer = async (lineId: string, itemId: string, expected: string): Promise<void> => {
      await expect(async () => {
        const button = estimator.getByTestId(`use-offer-${lineId}`);
        if (await button.isEnabled()) await button.click();
        await expect(estimator.getByTestId(`sourced-${itemId}`)).toContainText(expected, { timeout: 4_000 });
      }).toPass({ timeout: 45_000 });
    };
    await useOffer(gss.cam!, camera.id, 'Supply priced from Gulf Security Systems at 395 AED');
    await useOffer(eet.cbl!, cable.id, 'Supply priced from Emirates ELV Trading at 5.9 AED');
    await estimator.reload();
    await expect(estimator.getByTestId(`sourced-${camera.id}`)).toContainText('Supply priced from Gulf Security Systems at 395 AED');
    await expect(estimator.getByTestId(`sourced-${cable.id}`)).toContainText('Supply priced from Emirates ELV Trading at 5.9 AED');
    const sources = await call<Array<{ boqItemId: string; sourcedUnitCost: number; governed: { quotationLineId: string; technicalVerdict: string } | null }>>(
      'estimator', 'GET', `/tendering/tenders/${T}/pricing/sources`);
    expect(sources.find((s) => s.boqItemId === camera.id)).toMatchObject({ sourcedUnitCost: 395, governed: { quotationLineId: gss.cam, technicalVerdict: 'compliant' } });
    expect(sources.find((s) => s.boqItemId === cable.id)).toMatchObject({ sourcedUnitCost: 5.9, governed: { quotationLineId: eet.cbl } });

    // ── Seeded: the offer is generated and sent for review; the non-supplier evidence recorded ─────
    const offer = await call<{ id: string }>('qs', 'POST', `/tendering/tenders/${T}/quotation`, {});
    const Q = offer.id;
    const { quoteNumber } = await call<{ quoteNumber: string }>('qs', 'GET', `/crm/quotations/${Q}`);
    await call('qs', 'PATCH', `/crm/quotations/${Q}/status`, { action: 'submit_review' });
    const checklist = await call<{ requirements: Array<{ id: string; type: string }>; derived: string[] }>('qs2', 'GET', `/document-requirements?entityType=crm.quotation&entityId=${Q}`);
    const req = Object.fromEntries(checklist.requirements.map((r) => [r.type, r.id]));
    expect(checklist.derived).toEqual([req.VENDOR_QUOTE]);
    // The estimator records the evidence but does not hold `tendering.study.read`; the sales manager,
    // who submits the proposal, reads which study revision it carries.
    const proposal = await call<{ study?: { revisionNo?: number } }>('salesmgr', 'GET', `/tendering/tenders/${T}/technical-proposal`);
    await call('estimator', 'POST', `/document-requirements/${req.TECHNICAL_PROPOSAL}/evidence`, { type: 'EXTERNAL_REFERENCE', reference: `technical-proposal:${T}:study-rev-${proposal.study?.revisionNo}` });
    await call('estimator', 'POST', `/document-requirements/${req.COMMERCIAL_OFFER}/evidence`, { type: 'EXTERNAL_REFERENCE', reference: `crm.quotation:${quoteNumber}` });
    await call('estimator', 'POST', `/document-requirements/${req.DATASHEET}/evidence`, { type: 'EXTERNAL_REFERENCE', reference: 'Hikvision DS-2CD2143G2 datasheet v2.1' });

    // ── THE INDEPENDENT APPROVER, on screen: counted evidence, and a refusal while it falls short ──
    // Reached the way the work reaches them: the approvals inbox, then the offer's Approval tab.
    const inbox = await call<Array<{ id: string; action: string; href: string }>>('qs2', 'GET', '/inbox');
    const waiting = inbox.find((item) => item.id === Q);
    expect(waiting, 'the offer should wait in the independent approver\'s inbox').toMatchObject({ action: 'Approve' });
    const approver = await seat(browser, baseURL!, USERS.qs2);
    const openApproval = async (): Promise<void> => {
      await approver.goto(waiting!.href);
      await expect(async () => {
        await approver.getByRole('tab', { name: 'Approval' }).click();
        await expect(approver.getByTestId('readiness-VENDOR_QUOTE')).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 30_000 });
    };
    await openApproval();
    const vendorQuotes = approver.getByTestId('readiness-VENDOR_QUOTE');
    await expect(vendorQuotes).toContainText('counted from the tender');
    await expect(vendorQuotes).toContainText('1 of 2 items covered');
    await approver.getByRole('button', { name: 'Approve ✓' }).first().click();
    await expect(approver.getByText(/approval blocked.*VENDOR_QUOTE \(1\/2\)/)).toBeVisible();
    expect((await call<{ status: string }>('qs2', 'GET', `/crm/quotations/${Q}`)).status).toBe('internal_review');

    // A third independent supplier confirms a compliant camera — Procurement's act, seeded.
    const tsl = await quote('Techno Secure LLC', 'TSL', { cam: 399 });

    await openApproval();
    await expect(vendorQuotes).toContainText('2 of 2 items covered');
    await approver.getByRole('button', { name: 'Approve ✓' }).first().click();
    await expect.poll(async () => (await call<{ status: string }>('qs2', 'GET', `/crm/quotations/${Q}`)).status, { timeout: 30_000 }).toBe('approved');

    // The frozen basis, and the evidence the approval was decided on — recorded, with lineage.
    const baseline = await call<{ total: number; lockedBy?: string; createdBy?: string }>('qs2', 'GET', `/crm/quotations/${Q}/baseline`);
    expect(baseline.lockedBy ?? baseline.createdBy).toBe(USERS.qs2);
    const decided = await call<{ requirements: Array<{ type: string; status: string; evidence: Array<{ reference: string }> }> }>(
      'qs2', 'GET', `/document-requirements?entityType=crm.quotation&entityId=${Q}`);
    const vendorQuote = decided.requirements.find((r) => r.type === 'VENDOR_QUOTE')!;
    expect(vendorQuote.status).toBe('PROVIDED');
    expect(vendorQuote.evidence).toHaveLength(2);
    // Per ITEM: Al Noor's camera was judged non-compliant, so it is not among the camera's three —
    // Techno Secure is — while its compliant cable line rightly counts on the cable.
    const cameraEvidence = vendorQuote.evidence.find((e) => e.reference.includes(cam.code))!.reference;
    const cableEvidence = vendorQuote.evidence.find((e) => e.reference.includes(cbl.code))!.reference;
    expect(cameraEvidence).toContain(`line ${tsl.cam}`);
    expect(cameraEvidence).not.toContain('Al Noor Technologies');
    expect(cableEvidence).toContain('Al Noor Technologies');

    // ── SALES MANAGER, on screen: the offer and the proposal as the client receives them ───────────
    const sales = await seat(browser, baseURL!, USERS.salesmgr);
    const pdf = await sales.request.get(`/api/crm/quotations/${Q}/pdf`);
    expect(pdf.ok(), await pdf.text()).toBe(true);
    expect(pdf.headers()['content-disposition']).toContain(`${quoteNumber}-rev-0.pdf`);
    expect((await pdf.body()).subarray(0, 5).toString('ascii')).toBe('%PDF-');
    const technical = await sales.request.get(`/api/tendering/tenders/${T}/technical-proposal.pdf`);
    expect(technical.ok(), await technical.text()).toBe(true);
    expect((await technical.body()).subarray(0, 5).toString('ascii')).toBe('%PDF-');

    await call('salesmgr', 'POST', '/tendering/bid-scores', {
      tenderId: T, tenderTitle: `Al Reem Tower — ELV ${run}`,
      criteria: [
        { name: 'Strategic fit', weight: 3, score: 8 }, { name: 'Technical capability', weight: 3, score: 9 },
        { name: 'Commercial attractiveness', weight: 2, score: 7 }, { name: 'Client relationship', weight: 2, score: 8 },
      ],
      notes: 'Supply scope market-tested with three independent suppliers per item.',
    });

    // …and records the submission, with its facts. The value is not entered: it is the baseline's.
    await sales.goto(`/tendering/tenders/${T}`);
    await expect(async () => {
      await sales.getByTestId('tender-submit-open').click();
      await expect(sales.getByTestId('tender-submit-reference')).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
    await sales.getByTestId('tender-submit-method').selectOption('portal');
    await sales.getByTestId('tender-submit-portal').fill('Aldar e-Tender');
    await sales.getByTestId('tender-submit-reference').fill(`ALD-${run}`);
    await sales.getByTestId('tender-submit-confirm').click();
    await expect(sales.getByText(/Status: submitted/i)).toBeVisible({ timeout: 30_000 });

    const submissions = await call<Array<{ method: string; portal: string | null; reference: string; submittedValue: number; submittedBy: string }>>(
      'salesmgr', 'GET', `/tendering/tenders/${T}/submissions`);
    expect(submissions[0]).toMatchObject({
      method: 'portal', portal: 'Aldar e-Tender', reference: `ALD-${run}`, submittedValue: baseline.total, submittedBy: USERS.salesmgr,
    });
  });
});
