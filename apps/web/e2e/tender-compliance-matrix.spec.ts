import { inflateRawSync, inflateSync, constants as zlib } from 'node:zlib';
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { memberPassword, signInAs } from './project-member-harness';

/**
 * EST-12 — THE TECHNICAL COMPLIANCE MATRIX, the owner's decision of 2026-09-25 ("select (b)"):
 * "a separate server-generated, controlled Technical Compliance Matrix under Technical Manager
 *  authority … supplier, relevant quotation revision and line, BOQ/PR-line lineage, technical verdict,
 *  rationale, deviations, evaluator and date. Keep commercial prices out … File it in the internal
 *  tender dossier; do not automatically include it in the client submission pack."
 *
 *   technical manager   sees the live matrix on the tender; cannot issue while a quoted line is unjudged
 *   technical manager   judges the rest, ISSUES Rev 0 on screen; the server renders and files it
 *   estimator           reads the issued matrix where they price (the hand-off) and downloads it
 *   refused             the estimator issuing (403), a viewer reading (403), replacing the filed bytes (409)
 *   not in the pack     the client technical proposal carries nothing of it
 *   technical manager   amends a verdict and RE-ISSUES Rev 1 with a reason; Rev 0 is kept, as it was
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const USERS = {
  salesmgr: 'u-e2e-salesmgr', presales: 'u-e2e-presales', techmgr: 'u-e2e-techmgr', estimator: 'u-e2e-estimator',
  buyer: 'u-e2e-buyer', store: 'u-e2e-storekeeper', viewer: 'u-e2e-viewer',
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

/** Every entry of an .xlsx (a ZIP), read through its central directory — the spec has no xlsx library. */
function zipEntries(bytes: Buffer): Map<string, string> {
  const out = new Map<string, string>();
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let cd = bytes.readUInt32LE(end + 16);
  for (let i = 0, n = bytes.readUInt16LE(end + 10); i < n; i += 1) {
    const method = bytes.readUInt16LE(cd + 10);
    const size = bytes.readUInt32LE(cd + 20);
    const nameLength = bytes.readUInt16LE(cd + 28);
    const local = bytes.readUInt32LE(cd + 42);
    const name = bytes.subarray(cd + 46, cd + 46 + nameLength).toString('utf8');
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const data = bytes.subarray(start, start + size);
    out.set(name, (method === 8 ? inflateRawSync(data) : data).toString('utf8'));
    cd += 46 + nameLength + bytes.readUInt16LE(cd + 30) + bytes.readUInt16LE(cd + 32);
  }
  return out;
}
const decode = (x: string): string => x.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** Every cell value in the workbook — inline strings, shared strings and numbers alike. */
function workbookCells(bytes: Buffer): string[] {
  const cells: string[] = [];
  for (const [name, xml] of zipEntries(bytes)) {
    if (!/^xl\/(worksheets\/sheet\d+|sharedStrings)\.xml$/.test(name)) continue;
    for (const m of xml.matchAll(/<(v|t)(?:\s[^>]*)?>([^<]*)<\/\1>/g)) cells.push(decode(m[2]));
  }
  return cells;
}
const workbookText = (bytes: Buffer): string => workbookCells(bytes).join(' | ');

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
  return parts.join('\n');
}

test.describe('EST-12 — the Technical Compliance Matrix is issued, filed and read by the people it is for', () => {
  test.setTimeout(480_000);

  test('live matrix → refused while unjudged → issued Rev 0 → handed to the estimator → re-issued Rev 1 with a reason', async ({ browser, request, baseURL }) => {
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
    const run = Date.now().toString().slice(-6);
    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

    for (const [key, value] of [
      ['company.name', 'AURA MEP Systems Test LLC'], ['company.legalName', 'AURA MEP Systems Test L.L.C.'],
      ['company.trn', '100999999999999'], ['company.address', 'Dubai, United Arab Emirates'], ['finance.defaultCurrency', 'AED'],
    ]) {
      const configured = await request.post('/api/admin/settings', { data: { key, value, description: 'EST-12 compliance matrix proof' } });
      expect(configured.ok(), await configured.text()).toBe(true);
    }

    // ── Seeded by the roles that own it: study, quantities, the pricing requisition, two suppliers ─
    const { id: T, reference } = await call<{ id: string; reference: string }>('salesmgr', 'POST', '/tendering/tenders', {
      tenderNumber: `TND-CM-${run}`, title: `Saadiyat Villas — ELV ${run}`, clientName: 'Aldar Properties',
      submissionDeadline: '2026-12-31T00:00:00.000Z', estimatedValue: 0,
    });
    const study = await call<{ id: string }>('presales', 'POST', `/tendering/tenders/${T}/studies`, {
      title: 'ELV technical study Rev A', inputRevision: 'RFP Rev 0', reviewerId: USERS.techmgr,
      scopeSummary: 'CCTV for a villa community.', systems: [{ discipline: 'cctv', name: 'CCTV surveillance' }],
      requirements: [{ category: 'client', statement: '4MP minimum camera resolution', compliance: 'compliant' }],
      surveyFindings: [], clarifications: [], deviations: [], assumptions: [], exclusions: [], evidence: [],
    });
    await call('presales', 'POST', `/tendering/tenders/${T}/studies/${study.id}/submit`);
    await call('techmgr', 'POST', `/tendering/tenders/${T}/studies/${study.id}/approve`, { comment: 'Reviewed' });
    const takeoff = await call<{ id: string }>('presales', 'POST', `/tendering/tenders/${T}/quantity-takeoff`, { lines: [
      { description: 'IP camera, 4MP bullet, outdoor', unit: 'no', quantity: 80 },
      { description: 'Cat6A cabling to camera points', unit: 'm', quantity: 2400 },
    ] });
    await call('techmgr', 'POST', `/tendering/tenders/${T}/quantity-takeoff/${takeoff.id}/approve`);
    await call('estimator', 'POST', `/tendering/tenders/${T}/quantity-takeoff/${takeoff.id}/project-to-boq`);
    const boq = await call<{ items: Array<{ id: string; itemCode: string; description: string }> }>('estimator', 'GET', `/tendering/tenders/${T}/boq`);
    const camera = boq.items.find((i) => i.description.startsWith('IP camera'))!;
    const cable = boq.items.find((i) => i.description.startsWith('Cat6A'))!;
    const cam = await call<{ id: string; code: string }>('store', 'POST', '/inventory/materials', { code: `CAM-CM-${run}`, name: 'IP camera 4MP bullet', uom: 'no' });
    const cbl = await call<{ id: string; code: string }>('store', 'POST', '/inventory/materials', { code: `CBL-CM-${run}`, name: 'Cat6A U/FTP cable', uom: 'm' });
    const { requisition, lines } = await call<{ requisition: { id: string }; lines: Array<{ id: string; quantity: number; uom: string; sourceBoqItemId: string }> }>(
      'estimator', 'POST', `/tendering/tenders/${T}/pricing-requisitions`, { lines: [{ boqItemId: camera.id, materialId: cam.id }, { boqItemId: cable.id, materialId: cbl.id }] });
    const camLine = lines.find((l) => l.sourceBoqItemId === camera.id)!;
    const cblLine = lines.find((l) => l.sourceBoqItemId === cable.id)!;
    const rfq = await call<{ id: string }>('buyer', 'POST', '/procurement/rfqs', { title: `Pricing RFQ ${run}`, prId: requisition.id });
    await call('buyer', 'PATCH', `/procurement/rfqs/${rfq.id}/send`);
    const quote = async (name: string, code: string, offers: Array<{ line: typeof camLine; price: number; make: string; model: string; claim: string; deviations?: string }>) => {
      const supplier = await call<{ id: string }>('buyer', 'POST', '/procurement/suppliers', { code: `${code}-${run}`, name, category: 'materials' });
      const family = await call<{ baseOffer: { id: string } }>('buyer', 'POST', '/procurement/quotations/families', { rfqId: rfq.id, supplierName: name, supplierId: supplier.id, supplierQuotationRef: `${code}-Q-${run}` });
      const revision = await call<{ id?: string; revision?: { id: string } }>('buyer', 'POST', `/procurement/quotations/offers/${family.baseOffer.id}/revisions`, {
        supplierRevisionRef: 'Rev 1', receivedAt: today, quotationDate: today, validityDate: in30, currency: 'AED', taxTreatment: 'exclusive', taxRatePct: 5, paymentTerms: '30 days',
      });
      const revisionId = revision.id ?? revision.revision!.id;
      const ids: string[] = [];
      for (const o of offers) {
        const l = await call<{ id: string }>('buyer', 'POST', `/procurement/quotations/revisions/${revisionId}/lines`, {
          prLineId: o.line.id, response: 'quoted', quantity: o.line.quantity, uom: o.line.uom, unitPrice: o.price,
          offeredManufacturer: o.make, offeredModel: o.model, complianceResponse: o.claim, ...(o.deviations ? { deviations: o.deviations } : {}),
        });
        ids.push(l.id);
      }
      await call('buyer', 'PATCH', `/procurement/quotations/revisions/${revisionId}/status`, { status: 'confirmed' });
      return ids;
    };
    const [gssCam, gssCbl] = await quote('Gulf Security Systems', 'GSS', [
      { line: camLine, price: 395, make: 'Hikvision', model: 'DS-2CD2T47', claim: 'comply' },
      { line: cblLine, price: 6.2, make: 'Belden', model: '10GXS13', claim: 'comply' },
    ]);
    const [antCam, antCbl] = await quote('Al Noor Technologies', 'ANT', [
      { line: camLine, price: 402, make: 'Dahua', model: 'IPC-HFW2231', claim: 'comply' },
      { line: cblLine, price: 6.5, make: 'Nexans', model: 'LANmark-6A', claim: 'comply_with_deviation', deviations: 'LSZH jacket instead of the specified PVC' },
    ]);
    for (const id of [gssCam, gssCbl]) {
      await call('techmgr', 'POST', `/procurement/quotation-lines/${id}/evaluation`, { verdict: 'compliant', rationale: 'Meets the specification as offered' });
    }

    // ── TECHNICAL MANAGER, on screen: the live matrix, and no issue while two lines are unjudged ────
    const manager = await seat(browser, baseURL!, USERS.techmgr);
    await manager.goto(`/tendering/tenders/${T}#compliance-matrix`);
    const panel = manager.getByTestId('compliance-matrix');
    await expect(panel.getByTestId('compliance-matrix-summary')).toContainText('4 supplier line(s) on 2 requirement(s)', { timeout: 30_000 });
    await expect(panel.getByTestId('compliance-matrix-summary')).toContainText('2 awaiting a verdict');
    await expect(panel.getByTestId('compliance-matrix-row')).toHaveCount(4);
    await expect(panel.getByTestId('compliance-matrix-issue')).toBeDisabled();
    const early = await raw('techmgr', 'POST', `/tendering/tenders/${T}/compliance-matrix/issue`, {});
    expect(early.status()).toBe(400);
    expect((await early.json()).message).toContain('awaiting: Al Noor Technologies');
    expect((await raw('estimator', 'POST', `/tendering/tenders/${T}/compliance-matrix/issue`, {})).status(), 'the estimator does not issue it').toBe(403);
    expect((await raw('viewer', 'GET', `/tendering/tenders/${T}/compliance-matrix`)).status(), 'a viewer does not read it').toBe(403);

    await call('techmgr', 'POST', `/procurement/quotation-lines/${antCam}/evaluation`, { verdict: 'non_compliant', rationale: 'Offered 2MP sensor; specification requires 4MP minimum' });
    await call('techmgr', 'POST', `/procurement/quotation-lines/${antCbl}/evaluation`, { verdict: 'compliant_with_deviation', rationale: 'LSZH jacket accepted — it exceeds the fire requirement' });

    // ── ISSUED, on screen: Rev 0 — rendered and filed by the server ───────────────────────────────
    await manager.reload();
    await expect(async () => {
      await expect(panel.getByTestId('compliance-matrix-issue')).toBeEnabled({ timeout: 3_000 });
      await panel.getByTestId('compliance-matrix-issue').click();
      await expect(panel.getByRole('status')).toContainText('Rev 0 issued and filed in the tender dossier', { timeout: 5_000 });
    }).toPass({ timeout: 45_000 });
    const number = `TCM-${reference}`;
    const view0 = await call<{ current: { id: string; matrixNumber: string; revision: number; issuedBy: string; documentId: string; checksum: string }; issues: unknown[] }>('techmgr', 'GET', `/tendering/tenders/${T}/compliance-matrix`);
    expect(view0.current).toMatchObject({ matrixNumber: number, revision: 0, issuedBy: USERS.techmgr });
    await expect(panel.getByTestId('compliance-matrix-issued')).toHaveCount(1);

    const rev0Bytes = await (async () => {
      const res = await manager.request.get(`/api/tendering/tenders/${T}/compliance-matrix/issues/${view0.current.id}/workbook`);
      expect(res.status()).toBe(200);
      expect(res.headers()['content-disposition']).toContain(`${number}-rev-0.xlsx`);
      return res.body();
    })();
    expect(rev0Bytes.subarray(0, 2).toString('ascii')).toBe('PK');
    const rev0Text = workbookText(rev0Bytes);
    for (const expected of [
      'TECHNICAL COMPLIANCE MATRIX', number, USERS.techmgr, 'Not part of the client submission',
      `${camera.itemCode}`, `${cam.code} — IP camera 4MP bullet`, 'Gulf Security Systems', 'Al Noor Technologies',
      `GSS-Q-${run}`, 'Rev 0 · supplier ref Rev 1', antCam, 'Dahua · IPC-HFW2231', 'LSZH jacket instead of the specified PVC',
      'Not compliant', 'Offered 2MP sensor; specification requires 4MP minimum', 'Compliant with deviation', 'Compliant',
    ]) expect(rev0Text, `the issued matrix must print: ${expected}`).toContain(expected);
    const rev0Cells = workbookCells(rev0Bytes);
    for (const commercial of ['395', '402', '6.2', '6.5']) {
      expect(rev0Cells, `the matrix carries no supplier price: ${commercial}`).not.toContain(commercial);
    }
    for (const word of ['AED', 'Unit price', 'Price', 'Amount', 'Discount']) {
      expect(rev0Text, `the matrix carries no commercial column or currency: ${word}`).not.toContain(word);
    }

    // ── FILED in the internal dossier, sealed; NOT in the client submission ───────────────────────
    const dossier = await call<Array<{ id: string; kind: string; title: string }>>('techmgr', 'GET', `/tendering/tenders/${T}/study-files`);
    expect(dossier.find((d) => d.id === view0.current.documentId)).toMatchObject({ kind: 'technical_compliance_matrix', title: `${number} Rev 0 — Technical Compliance Matrix` });
    const forgedByIssuer = await raw('techmgr', 'POST', `/documents/${view0.current.documentId}/versions`, { content: 'forged matrix', fileName: 'forged.txt' });
    expect(forgedByIssuer.status(), 'the issuer holds no generic document write').toBe(403);
    // An administrator clears every route permission — and is still refused, by the seal and by name.
    const admin = await bearer(request, process.env.E2E_USERNAME ?? 'u-admin');
    const forged = await request.post(`${API}/documents/${view0.current.documentId}/versions`, { headers: admin!, data: { content: 'forged matrix', fileName: 'forged.txt' } });
    expect(forged.status(), 'the filed bytes cannot be replaced, even by an administrator').toBe(409);
    expect((await forged.json()).message).toContain('can only be superseded by re-issuing the matrix');
    // The client technical proposal is the Sales Manager's to print — it is what goes to the client.
    const sales = await seat(browser, baseURL!, USERS.salesmgr);
    const proposal = await sales.request.get(`/api/tendering/tenders/${T}/technical-proposal.pdf`);
    expect(proposal.status(), await proposal.text().catch(() => '')).toBe(200);
    const proposalText = pdfText(await proposal.body());
    for (const absent of ['TECHNICAL COMPLIANCE MATRIX', number, 'Al Noor Technologies', 'Gulf Security Systems']) {
      expect(proposalText, `the client technical proposal carries nothing of the matrix: ${absent}`).not.toContain(absent);
    }

    // ── THE HAND-OFF: the estimator reads the issued matrix where they price, and downloads it ────
    const estimator = await seat(browser, baseURL!, USERS.estimator);
    await estimator.goto(`/tendering/tenders/${T}/pricing`);
    await expect(estimator.getByTestId('compliance-matrix-current')).toContainText(`${number} Rev 0 · issued by ${USERS.techmgr}`, { timeout: 30_000 });
    const estimatorCopy = await estimator.request.get(`/api/tendering/tenders/${T}/compliance-matrix/issues/${view0.current.id}/workbook`);
    expect(estimatorCopy.status()).toBe(200);
    expect(Buffer.compare(await estimatorCopy.body(), rev0Bytes), 'the estimator reads the same filed bytes').toBe(0);
    const viewer = await seat(browser, baseURL!, USERS.viewer);
    expect((await viewer.request.get(`/api/tendering/tenders/${T}/compliance-matrix/issues/${view0.current.id}/workbook`)).status(), 'a viewer is refused the workbook').toBe(403);

    // ── RE-ISSUED, on screen: a verdict amended, Rev 1 with a reason; Rev 0 kept as it was ─────────
    await call('techmgr', 'POST', `/procurement/quotation-lines/${antCam}/evaluation`, {
      verdict: 'compliant_with_deviation', rationale: 'Supplier confirmed a 4MP sensor; night range 25 m accepted',
      amendmentReason: 'Clarification ANT-CL-01 corrected the offered model',
    });
    expect((await raw('techmgr', 'POST', `/tendering/tenders/${T}/compliance-matrix/issue`, { reason: '  ' })).status(), 'a re-issue says why').toBe(400);
    await manager.reload();
    await expect(panel.getByTestId('compliance-matrix-issue')).toBeDisabled({ timeout: 30_000 });
    const reason = 'Al Noor camera re-judged after clarification ANT-CL-01';
    await panel.getByTestId('compliance-matrix-reason').fill(reason);
    await panel.getByTestId('compliance-matrix-issue').click();
    await expect(panel.getByRole('status')).toContainText('Rev 1 issued and filed in the tender dossier', { timeout: 30_000 });
    await expect(panel.getByTestId('compliance-matrix-issued')).toHaveCount(2);
    await expect(panel.locator('[data-testid="compliance-matrix-issued"][data-revision="0"]')).toContainText('superseded');
    await expect(panel.locator('[data-testid="compliance-matrix-issued"][data-revision="1"]')).toContainText(reason);

    const view1 = await call<{ current: { id: string; revision: number; reason: string }; issues: Array<{ id: string; revision: number; supersededBy: string | null; checksum: string }> }>('estimator', 'GET', `/tendering/tenders/${T}/compliance-matrix`);
    expect(view1.current).toMatchObject({ revision: 1, reason });
    expect(view1.issues.map((i) => [i.revision, i.supersededBy])).toEqual([[1, null], [0, view1.current.id]]);
    expect(view1.issues[1].checksum, 'Rev 0 keeps the hash it was issued with').toBe(view0.current.checksum);
    const rev1Text = workbookText(await (await manager.request.get(`/api/tendering/tenders/${T}/compliance-matrix/issues/${view1.current.id}/workbook`)).body());
    expect(rev1Text).toContain(reason);
    expect(rev1Text).toContain('Supplier confirmed a 4MP sensor; night range 25 m accepted');
    expect(rev1Text).toContain('Clarification ANT-CL-01 corrected the offered model');
    const rev0Again = await (await manager.request.get(`/api/tendering/tenders/${T}/compliance-matrix/issues/${view0.current.id}/workbook`)).body();
    expect(Buffer.compare(rev0Again, rev0Bytes), 'Rev 0 still reads exactly as issued').toBe(0);
    expect(workbookText(rev0Again)).toContain('Offered 2MP sensor; specification requires 4MP minimum');
    await estimator.reload();
    await expect(estimator.getByTestId('compliance-matrix-current')).toContainText(`${number} Rev 1`, { timeout: 30_000 });
  });
});
