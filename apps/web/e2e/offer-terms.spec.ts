// AURA OS — QUOTE-TERMS-01: what a supplier offers besides the price is captured on screen, and read
// beside the price wherever the offers are compared — on screen, in the XLSX and in the PDF.
//
// The quotation line always had a warranty and an exclusions field, and the API took both; the capture
// screen offered neither, and the comparison showed none of make and model, lead time, warranty,
// deviations or exclusions. A recommendation could be reasoned "better warranty" while warranty could
// be read nowhere. Proved here, Auth ON against PostgreSQL:
//
//   capture    the Buyer (r-procurement) prices a line ON SCREEN with make, model, lead time, warranty,
//              a technical deviation and an exclusion; the line reads them back, and they survive a
//              reload because they are the server's
//   refusal    a Site Engineer cannot capture a quotation line (403)
//   read       the Commercial Manager (r-commercial-manager) — who may read the comparison but not
//              capture — sees each supplier's terms beside the prices, a term not stated SAID to be
//              not stated, and the prices unchanged by any of it
//   output     the comparison XLSX carries an "Offered terms" sheet and the PDF a section with the same
//              facts, both read from the same governed result as the screen
import { inflateRawSync, inflateSync, constants as zlib } from 'node:zlib';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { memberPassword, signInAs } from './project-member-harness';
import { provisionedActorsUnavailable } from './provisioned-actors';

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

async function seat(browser: Browser, baseURL: string, username: string): Promise<Page> {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  expect(await signInAs(page, baseURL, username), `${username} could not sign in`).toBe(true);
  return page;
}

/** Every file in a zip (an .xlsx), as text. */
function unzip(bytes: Buffer): Map<string, string> {
  const files = new Map<string, string>();
  const eocd = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(eocd, 'a zip end-of-central-directory record').toBeGreaterThan(0);
  const count = bytes.readUInt16LE(eocd + 10);
  let at = bytes.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i += 1) {
    const method = bytes.readUInt16LE(at + 10);
    const size = bytes.readUInt32LE(at + 20);
    const nameLength = bytes.readUInt16LE(at + 28);
    const extra = bytes.readUInt16LE(at + 30);
    const comment = bytes.readUInt16LE(at + 32);
    const local = bytes.readUInt32LE(at + 42);
    const name = bytes.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    const dataStart = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const raw = bytes.subarray(dataStart, dataStart + size);
    files.set(name, (method === 8 ? inflateRawSync(raw) : raw).toString('utf8'));
    at += 46 + nameLength + extra + comment;
  }
  return files;
}

/** The text a PDF shows, from its (deflated) content streams. */
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

test('a supplier\'s warranty, exclusions and other non-price terms are captured on screen and read beside the price', async ({ browser, baseURL, request }) => {
  test.setTimeout(300_000);
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  test.skip(!memberPassword(), 'needs a password to sign the actors in');
  const unavailable = await provisionedActorsUnavailable(request);
  test.skip(unavailable !== null, unavailable ?? '');
  const run = Date.now().toString().slice(-6);
  const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };
  const post = async <T>(path: string, data: unknown): Promise<T> => {
    const res = await request.post(`${API}${path}`, { headers, data });
    expect(res.ok(), `${path} — ${await res.text()}`).toBe(true);
    return res.json() as Promise<T>;
  };

  const project = await post<{ id: string }>('/projects/projects', { title: `Offer terms ${run}` });
  const material = await post<{ id: string }>('/inventory/materials', { code: `CAM-T-${run}`, name: 'Bullet camera, 8MP', uom: 'nr' });
  const pr = await post<{ id: string }>('/procurement/purchase-requests', { title: `Cameras ${run}`, projectId: project.id, value: 0 });
  const prLine = await post<{ id: string }>(`/procurement/purchase-requests/${pr.id}/lines`, { material: material.id, quantity: 12, estimatedUnitCost: 900 });
  const rfq = await post<{ id: string }>('/procurement/rfqs', { title: `RFQ ${run}`, prId: pr.id });

  // A second supplier, quoted by API, who states no warranty and no exclusions at all.
  const { baseOffer } = await post<{ baseOffer: { id: string } }>('/procurement/quotations/families', { rfqId: rfq.id, supplierName: `Plain Co ${run}` });
  const plainRevision = await post<{ id: string }>(`/procurement/quotations/offers/${baseOffer.id}/revisions`, { currency: 'AED', taxTreatment: 'exclusive', taxRatePct: 5, validityDate: '2026-12-31' });
  await post(`/procurement/quotations/revisions/${plainRevision.id}/lines`, { prLineId: prLine.id, quantity: 12, uom: 'nr', unitPrice: 880 });
  for (const status of ['received', 'confirmed']) {
    const res = await request.patch(`${API}/procurement/quotations/revisions/${plainRevision.id}/status`, { headers, data: { status } });
    expect(res.ok(), await res.text()).toBe(true);
  }

  // ── CAPTURE, ON SCREEN, BY THE BUYER ──────────────────────────────────────────────────────────────
  const buyer = await seat(browser, baseURL!, 'u-e2e-buyer');
  let revisionId = '';
  try {
    await buyer.goto(`/procurement/rfqs/${rfq.id}/quotations`, { waitUntil: 'domcontentloaded' });
    await buyer.getByTestId('new-supplier').fill(`Terms Co ${run}`);
    await expect(async () => {
      await buyer.getByTestId('open-quotation').click();
      await expect(buyer.locator('[data-testid^="family-"]', { hasText: `Terms Co ${run}` })).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 60_000 });
    const family = buyer.locator('[data-testid^="family-"]', { hasText: `Terms Co ${run}` });
    const offerId = (await family.locator('[data-testid^="offer-"]').first().getAttribute('data-testid'))!.replace('offer-', '');

    await buyer.getByTestId(`capture-revision-${offerId}`).click();
    await expect(buyer.getByTestId(`revision-form-${offerId}`)).toBeVisible({ timeout: 10_000 });
    await buyer.getByTestId('rev-currency').selectOption('AED');
    await buyer.getByTestId('rev-tax-treatment').selectOption('exclusive');
    await buyer.getByTestId('rev-tax-rate').fill('5');
    await buyer.getByTestId('rev-validity').fill('2026-12-31');
    await buyer.getByTestId(`save-revision-${offerId}`).click();
    await expect(buyer.getByTestId(`revision-form-${offerId}`)).toBeHidden({ timeout: 30_000 });

    revisionId = (await family.locator('[data-testid^="revision-"]').first().getAttribute('data-testid'))!.replace('revision-', '');
    await buyer.getByTestId(`price-items-${revisionId}`).click();
    await expect(buyer.getByTestId(`no-lines-${revisionId}`)).toBeVisible({ timeout: 10_000 });
    await buyer.getByTestId('line-requirement').selectOption(prLine.id);
    await buyer.getByTestId('line-description').fill('8MP bullet, IP67');
    await buyer.getByTestId('line-make').fill('Hanwha');
    await buyer.getByTestId('line-model').fill('XNO-8080R');
    await buyer.getByTestId('line-quantity').fill('12');
    await buyer.getByTestId('line-unit-price').fill('900');
    await buyer.getByTestId('line-lead-time').fill('21');
    await buyer.getByTestId('line-warranty').fill('36');
    await buyer.getByTestId('line-deviation').fill('IR range 30 m, not the 50 m specified');
    await buyer.getByTestId('line-exclusions').fill('Mounting brackets and junction boxes');
    await buyer.getByTestId(`save-line-${revisionId}`).click();

    const lines = buyer.getByTestId(`line-table-${revisionId}`);
    await expect(lines).toBeVisible({ timeout: 30_000 });
    await expect(lines).toContainText('36 months');
    await expect(lines).toContainText('excludes: Mounting brackets and junction boxes');
    await expect(lines).toContainText('technical: IR range 30 m');
    await buyer.getByTestId(`confirm-${revisionId}`).click();
    await expect(buyer.getByTestId(`effective-${offerId}`)).toContainText('is the current offer', { timeout: 30_000 });

    // The server's, not the form's: a reload reads the same terms back.
    await buyer.reload({ waitUntil: 'domcontentloaded' });
    await buyer.getByTestId(`view-items-${revisionId}`).click({ timeout: 30_000 });
    await expect(buyer.getByTestId(`items-read-only-${revisionId}`)).toContainText('its items can be read, not changed');
    await expect(buyer.getByTestId(`line-table-${revisionId}`)).toContainText('36 months', { timeout: 30_000 });
    await expect(buyer.getByTestId(`line-table-${revisionId}`)).toContainText('excludes: Mounting brackets and junction boxes');
  } finally {
    await buyer.context().close();
  }

  // ── A ROLE WITHOUT THE CAPTURE PERMISSION IS REFUSED ─────────────────────────────────────────────
  const siteLogin = await request.post(`${API}/auth/login`, { data: { username: 'u-e2e-site', password: memberPassword() } });
  const siteToken = ((await siteLogin.json()) as { token: string }).token;
  const refused = await request.post(`${API}/procurement/quotations/revisions/${plainRevision.id}/lines`, {
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${siteToken}` },
    data: { prLineId: prLine.id, quantity: 1, uom: 'nr', unitPrice: 1, warrantyMonths: 99 },
  });
  expect(refused.status(), 'a Site Engineer may not capture a supplier\'s offer').toBe(403);

  // ── READ BESIDE THE PRICE, BY THE COMMERCIAL MANAGER ─────────────────────────────────────────────
  const qs = await seat(browser, baseURL!, 'u-e2e-qs');
  try {
    await qs.goto(`/procurement/requirements/${prLine.id}/comparison`, { waitUntil: 'domcontentloaded' });
    await expect(qs.getByTestId('comparison-table')).toBeVisible({ timeout: 60_000 });
    const termsRow = qs.locator('[data-testid^="terms-row-"]', { hasText: `Terms Co ${run}` }).first();
    await expect(termsRow).toContainText('Hanwha XNO-8080R', { timeout: 30_000 });
    await expect(termsRow).toContainText('21 days');
    await expect(termsRow).toContainText('36 months');
    await expect(termsRow).toContainText('IR range 30 m, not the 50 m specified');
    await expect(termsRow).toContainText('Mounting brackets and junction boxes');
    const plainRow = qs.locator('[data-testid^="terms-row-"]', { hasText: `Plain Co ${run}` }).first();
    await expect(plainRow, 'a term not stated is said to be not stated').toContainText('not stated');
    await expect(plainRow).toContainText('none stated');
    // The terms change no figure: the prices read exactly as quoted.
    await expect(qs.locator('[data-testid^="offer-"]', { hasText: `Terms Co ${run}` })).toContainText('900.00 AED');
    await expect(qs.locator('[data-testid^="offer-"]', { hasText: `Plain Co ${run}` })).toContainText('880.00 AED');

    // ── THE SAME FACTS IN BOTH DOCUMENTS ───────────────────────────────────────────────────────────
    const xlsxHref = await qs.getByTestId('export-xlsx').getAttribute('href');
    const xlsx = await qs.request.get(xlsxHref!);
    expect(xlsx.ok(), `XLSX ${xlsx.status()}`).toBe(true);
    const files = unzip(await xlsx.body());
    expect([...files.get('xl/workbook.xml')!.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => m[1])).toContain('Offered terms');
    const sheets = [...files.entries()].filter(([name]) => name.startsWith('xl/')).map(([, xml]) => xml).join('\n');
    for (const fact of ['Warranty (months)', 'Exclusions', 'Mounting brackets and junction boxes', 'IR range 30 m, not the 50 m specified', 'XNO-8080R', 'not stated']) {
      expect(sheets, `the workbook carries ${fact}`).toContain(fact);
    }
    expect(sheets, 'warranty is a number in its cell').toMatch(/<v>36<\/v>/);

    const pdfHref = await qs.getByTestId('export-pdf').getAttribute('href');
    const pdf = await qs.request.get(pdfHref!);
    expect(pdf.ok(), `PDF ${pdf.status()}`).toBe(true);
    const printed = pdfText(await pdf.body());
    expect(printed).toContain('WHAT EACH SUPPLIER OFFERS BESIDES THE PRICE');
    expect(printed).toContain('warranty 36 months');
    expect(printed).toContain('Exclusions: Mounting brackets and junction boxes');
    expect(printed).toContain('Technical deviation: IR range 30 m');
    expect(printed).toContain('warranty not stated');
  } finally {
    await qs.context().close();
  }
});
