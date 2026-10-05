// AURA OS — BUY-03: an enquiry names the suppliers it is sent to, and each receives its own document.
// Auth ON, PostgreSQL, the shipped roles.
//
// "Send to vendors" moved an RFQ from draft to sent, recorded who pressed it, and named no vendor:
// an RFQ could be sent to nobody, nothing was produced for a supplier to read, and once quotations
// arrived nobody could say who had been asked and had not answered. Proved here:
//
//   address    the Buyer finds suppliers in the register and invites them on screen; the list
//              survives a reload; a draft is corrected; a supplier not yet approved says so
//   refuse     sending to nobody is not offered; the Storekeeper may neither address nor send;
//              a second send is refused
//   send       the RFQ is sent to the named suppliers, and records who sent it
//   output     each invited supplier's enquiry downloads as a PDF addressed to them, from the
//              issuing company, listing what is asked for — and carrying no internal estimate;
//              none is issued to a supplier never asked, nor for a draft
//   receipt    the Procurement Manager sees who it went to; recording replies shows who has not
//              answered, and a reply from an invited supplier is tied to that supplier's record
import { inflateSync, constants as zlib } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { memberPassword, signInAs } from './project-member-harness';
import { provisionedActorsUnavailable } from './provisioned-actors';

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

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

async function seat(browser: Browser, baseURL: string, username: string): Promise<Page> {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] }, acceptDownloads: true });
  const page = await context.newPage();
  expect(await signInAs(page, baseURL, username), `${username} could not sign in`).toBe(true);
  return page;
}

test('the Buyer addresses an enquiry to named suppliers, sends it, and each supplier gets its own document', async ({ browser, baseURL, request }) => {
  test.setTimeout(420_000);
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  test.skip(!memberPassword(), 'needs a password to sign the roles in');
  const unavailable = await provisionedActorsUnavailable(request);
  test.skip(unavailable !== null, unavailable ?? '');
  const run = Date.now().toString().slice(-6);
  const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };
  const post = async <T>(path: string, data: unknown): Promise<T> => {
    const res = await request.post(`${API}${path}`, { headers, data });
    expect(res.ok(), `${path} — ${await res.text()}`).toBe(true);
    return res.json() as Promise<T>;
  };
  const tokenOf = async (username: string): Promise<string> => {
    const res = await request.post(`${API}/auth/login`, { data: { username, password: memberPassword() } });
    expect(res.ok(), `${username} login`).toBe(true);
    return ((await res.json()) as { token: string }).token;
  };

  // ── THE ISSUING COMPANY, only if this database has none (an outbound document needs one) ─────────
  const identity = (await (await request.get(`${API}/documents/issuer-identity`, { headers: apiAuthHeaders() })).json()) as { configured: boolean; legalName: string; name: string };
  if (!identity.configured) {
    for (const [key, value] of [['company.name', 'AURA MEP Systems Test LLC'], ['company.legalName', 'AURA MEP Systems Test L.L.C.']]) {
      await post('/admin/settings', { key, value, description: 'BUY-03 enquiry proof' });
    }
  }
  const issuer = identity.configured ? (identity.legalName || identity.name) : 'AURA MEP Systems Test L.L.C.';

  // ── WHAT IS ASKED FOR, AND WHO MIGHT ANSWER ───────────────────────────────────────────────────────
  // The estimated unit cost is distinctive on purpose: it must never reach a supplier.
  const project = await post<{ id: string }>('/projects/projects', { title: `BUY-03 ${run}` });
  const pr = await post<{ id: string }>('/procurement/purchase-requests', { title: `Access control ${run}`, projectId: project.id, value: 0 });
  for (const [code, name, quantity] of [['RDR', 'Proximity card reader', 24], ['MAG', 'Electromagnetic lock 600lb', 12]] as const) {
    const material = await post<{ id: string }>('/inventory/materials', { code: `${code}-${run}`, name, uom: 'nr' });
    await post(`/procurement/purchase-requests/${pr.id}/lines`, { material: material.id, quantity, estimatedUnitCost: 7777.77, needByDate: '2026-12-15' });
  }
  const rfq = await post<{ id: string; title: string }>('/procurement/rfqs', { title: `Access control enquiry ${run}`, prId: pr.id, reference: `RFQ-${run}`, dueDate: '2026-11-20' });
  const approved = await post<{ id: string; name: string }>('/procurement/suppliers', { code: `RFQD-A-${run}`, name: `Gulf Access Systems ${run}`, category: 'materials' });
  const pending = await post<{ id: string; name: string }>('/procurement/suppliers', { code: `RFQD-B-${run}`, name: `Emirates Door Hardware ${run}`, category: 'materials' });
  const neverAsked = await post<{ id: string; name: string }>('/procurement/suppliers', { code: `RFQD-C-${run}`, name: `Sharjah Locks ${run}`, category: 'materials' });
  const approve = await request.patch(`${API}/procurement/suppliers/${approved.id}/status`, { headers, data: { action: 'approve' } });
  expect(approve.ok(), await approve.text()).toBe(true);

  const buyer = await seat(browser, baseURL!, 'u-e2e-buyer');
  const manager = await seat(browser, baseURL!, 'u-e2e-procmgr');
  try {
    const openRfq = async (p: Page) => {
      await p.goto('/procurement/rfqs', { waitUntil: 'domcontentloaded' });
      const panel = p.getByTestId('rfq-dispatch');
      // A click before the list hydrates does nothing; the row toggles, so click only while closed.
      await expect(async () => {
        if (!(await panel.isVisible())) await p.getByTestId(`rfq-open-${rfq.id}`).click();
        await expect(panel).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 60_000 });
      return panel;
    };

    // ── NOBODY YET: SENDING IS NOT OFFERED ──────────────────────────────────────────────────────────
    let panel = await openRfq(buyer);
    await expect(panel.getByTestId('rfq-no-invitations')).toBeVisible();
    await expect(panel.getByTestId('rfq-send')).toBeDisabled();
    await expect(panel.getByTestId('rfq-send')).toContainText('invite a supplier first');

    // ── ADDRESSED FROM THE REGISTER, ON SCREEN ──────────────────────────────────────────────────────
    await panel.getByTestId('rfq-supplier-search').fill(`RFQD-A-${run}`);
    await expect(panel.getByTestId(`rfq-invite-${approved.id}`)).toBeVisible({ timeout: 30_000 });
    await panel.getByTestId(`rfq-invite-${approved.id}`).click();
    await expect(panel.getByTestId(`rfq-invitation-${approved.id}`)).toBeVisible({ timeout: 30_000 });
    await panel.getByTestId('rfq-supplier-search').fill(`Emirates Door Hardware ${run}`);
    await panel.getByTestId(`rfq-invite-${pending.id}`).click({ timeout: 30_000 });
    await expect(panel.getByTestId(`rfq-invitation-${pending.id}`)).toBeVisible({ timeout: 30_000 });
    // Asking for a price needs no approval — but the screen says this supplier cannot be ordered from yet.
    await expect(panel.getByTestId(`rfq-invitation-${pending.id}`)).toContainText('not yet approved to order from');
    await expect(panel.getByTestId(`rfq-invitation-${approved.id}`)).not.toContainText('not yet approved');

    // ── IT SURVIVES A RELOAD, AND A DRAFT CAN BE CORRECTED ──────────────────────────────────────────
    panel = await openRfq(buyer);
    await expect(panel.getByTestId(`rfq-invitation-${approved.id}`)).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByTestId(`rfq-invitation-${pending.id}`)).toBeVisible();
    await panel.getByTestId(`rfq-withdraw-${pending.id}`).click();
    await expect(panel.getByTestId(`rfq-invitation-${pending.id}`)).toHaveCount(0, { timeout: 30_000 });
    await panel.getByTestId('rfq-supplier-search').fill(`RFQD-B-${run}`);
    await panel.getByTestId(`rfq-invite-${pending.id}`).click({ timeout: 30_000 });
    await expect(panel.getByTestId(`rfq-invitation-${pending.id}`)).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByTestId('rfq-send')).toContainText('Send to 2 suppliers');

    // ── THE STOREKEEPER MAY NEITHER ADDRESS NOR SEND IT ─────────────────────────────────────────────
    const store = { Authorization: `Bearer ${await tokenOf('u-e2e-storekeeper')}`, 'content-type': 'application/json' };
    expect((await request.post(`${API}/procurement/rfqs/${rfq.id}/invitations`, { headers: store, data: { supplierId: neverAsked.id } })).status()).toBe(403);
    expect((await request.patch(`${API}/procurement/rfqs/${rfq.id}/send`, { headers: store, data: {} })).status()).toBe(403);
    // A supplier that is not in this register cannot be addressed at all.
    expect((await request.post(`${API}/procurement/rfqs/${rfq.id}/invitations`, { headers, data: { supplierId: '00000000-0000-0000-0000-000000000000' } })).status()).toBe(404);
    // No enquiry exists for a draft.
    expect((await request.get(`${API}/procurement/rfqs/${rfq.id}/enquiry?supplierId=${approved.id}`, { headers: apiAuthHeaders() })).status()).toBe(409);

    // ── SENT, TO THE NAMED SUPPLIERS ────────────────────────────────────────────────────────────────
    await panel.getByTestId('rfq-send').click();
    await expect(buyer.getByTestId(`rfq-status-${rfq.id}`)).toHaveText('sent', { timeout: 30_000 });
    await expect(panel.getByTestId('rfq-sent-note')).toContainText('by u-e2e-buyer');
    await expect(panel).toContainText('Sent to 2 suppliers');
    await expect(panel.getByTestId(`rfq-withdraw-${approved.id}`)).toHaveCount(0);
    await expect(panel.getByTestId('rfq-send')).toHaveCount(0);
    const again = await request.patch(`${API}/procurement/rfqs/${rfq.id}/send`, { headers, data: {} });
    expect(again.status(), 'an enquiry is sent once').toBe(409);
    // Once sent, who it went to is history.
    expect((await request.delete(`${API}/procurement/rfqs/${rfq.id}/invitations/${pending.id}`, { headers: apiAuthHeaders() })).status()).toBe(409);
    expect((await request.post(`${API}/procurement/rfqs/${rfq.id}/invitations`, { headers, data: { supplierId: neverAsked.id } })).status()).toBe(409);

    // ── EACH SUPPLIER'S OWN ENQUIRY, DOWNLOADED FROM THE SCREEN ─────────────────────────────────────
    const [download] = await Promise.all([
      buyer.waitForEvent('download', { timeout: 60_000 }),
      panel.getByTestId(`rfq-enquiry-${approved.id}`).click(),
    ]);
    const bytes = await readFile((await download.path())!);
    await download.saveAs(test.info().outputPath('enquiry.pdf'));
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(download.suggestedFilename()).toContain(`RFQ-${run}`);
    const text = pdfText(bytes);
    for (const expected of ['REQUEST FOR QUOTATION', `RFQ-${run}`, approved.name, rfq.title, `RDR-${run}`, `MAG-${run}`, 'Proximity card reader', '24', '12', '2026-11-20', '2026-12-15', issuer]) {
      expect(text, `the enquiry says ${expected}`).toContain(expected);
    }
    expect(text, 'the enquiry is addressed to one supplier only').not.toContain(pending.name);
    expect(text, 'our estimate never reaches a supplier').not.toContain('7777');
    expect(text).not.toContain('7,777');
    // None is issued to a supplier never asked.
    expect((await request.get(`${API}/procurement/rfqs/${rfq.id}/enquiry?supplierId=${neverAsked.id}`, { headers: apiAuthHeaders() })).status()).toBe(404);

    // ── THE NEXT ROLE: THE MANAGER SEES WHO IT WENT TO ──────────────────────────────────────────────
    const managerPanel = await openRfq(manager);
    await expect(managerPanel).toContainText('Sent to 2 suppliers');
    await expect(managerPanel.getByTestId(`rfq-invitation-${approved.id}`)).toContainText(approved.name);
    await expect(managerPanel.getByTestId(`rfq-invitation-${pending.id}`)).toContainText(pending.name);

    // ── REPLIES: WHO HAS NOT ANSWERED, AND AN ANSWER TIED TO THE SUPPLIER ASKED ─────────────────────
    await buyer.getByTestId('rfq-quotations-link').click({ timeout: 30_000 });
    await expect(buyer.getByTestId('invited-suppliers')).toBeVisible({ timeout: 60_000 });
    await expect(buyer.getByTestId(`invited-state-${approved.id}`)).toHaveText('no quotation recorded yet');
    await expect(buyer.getByTestId(`invited-state-${pending.id}`)).toHaveText('no quotation recorded yet');
    await buyer.getByTestId(`record-invited-${approved.id}`).click();
    await expect(buyer.getByTestId(`invited-state-${approved.id}`)).toHaveText('quotation recorded', { timeout: 30_000 });
    await expect(buyer.getByTestId(`invited-state-${pending.id}`)).toHaveText('no quotation recorded yet');
    const families = (await (await request.get(`${API}/procurement/quotations/families?rfqId=${rfq.id}`, { headers: apiAuthHeaders() })).json()) as Array<{ family: { supplierId: string | null; supplierName: string } }>;
    expect(families.map((f) => f.family), 'the reply is recorded against the supplier asked, not a typed name')
      .toEqual([expect.objectContaining({ supplierId: approved.id, supplierName: approved.name })]);
  } finally {
    await buyer.context().close();
    await manager.context().close();
  }
});
