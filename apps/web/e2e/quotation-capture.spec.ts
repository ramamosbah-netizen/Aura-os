import { expect, test } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * QC-01 stage A on screen — a buyer records a supplier quotation, and the one before it survives.
 *
 * The frozen example, driven through the UI: Rev 0 at AED 500 freight, Rev 1 at 500, Rev 2 at none.
 * Under the old single mutable row, Rev 0 and Rev 1 ceased to exist the moment Rev 2 was typed.
 *
 * What the screen has to show, because each is something a buyer could not do or see at all before:
 *
 *   THE COMMERCIAL FACTS HAVE SOMEWHERE TO GO. Currency, tax treatment and rate, freight, terms and
 *   validity — the old form had none of them, so every quotation reached SUP-06 as "the tax
 *   treatment was never stated".
 *
 *   THE HISTORY IS READABLE, with the diff between revisions, because a supplier moving from 500
 *   freight to none has restructured the offer and the price alone does not say that.
 *
 *   A WITHDRAWN CURRENT OFFER LEAVES NO CURRENT OFFER, stated in words, rather than quietly
 *   reinstating the revision before it.
 *
 * Against the real API and PostgreSQL, as the Buyer's own role.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

test.describe('Capturing a supplier quotation', () => {
  test.setTimeout(240_000);

  test('records the commercial terms, keeps every revision, and shows what changed', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };

    const project = await (await request.post(`${API}/projects/projects`, { headers, data: { title: `QC-01 ${run}` } })).json();
    const pr = await (await request.post(`${API}/procurement/purchase-requests`, { headers, data: { title: `Cameras ${run}`, projectId: project.id, value: 0 } })).json();
    const rfq = await (await request.post(`${API}/procurement/rfqs`, { headers, data: { title: `RFQ ${run}`, prId: pr.id } })).json();

    await page.goto(`/procurement/rfqs/${rfq.id}/quotations`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('no-quotations')).toBeVisible({ timeout: 30_000 });

    // ── OPEN THE QUOTATION ───────────────────────────────────────────────────
    await page.getByTestId('new-supplier').fill(`Gulf ELV ${run}`);
    await page.getByTestId('new-supplier-ref').fill(`Q-${run}`);
    await expect(async () => {
      await page.getByTestId('open-quotation').click();
      await expect(page.locator('[data-testid^="family-"]')).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 60_000 });

    const family = page.locator('[data-testid^="family-"]').first();
    await expect(family).toContainText(`Q-${run}`);
    const offer = family.locator('[data-testid^="offer-"]').first();
    const offerId = (await offer.getAttribute('data-testid'))!.replace('offer-', '');

    // Before anything is quoted, the offer says it has none — it is not blank.
    await expect(page.getByTestId(`no-effective-${offerId}`)).toContainText('no revision has been captured');

    // ── THREE REVISIONS, EACH WITH ITS COMMERCIAL TERMS ──────────────────────
    const captureRevision = async (freight: string, ref: string) => {
      await page.getByTestId(`capture-revision-${offerId}`).click();
      await expect(page.getByTestId(`revision-form-${offerId}`)).toBeVisible({ timeout: 10_000 });
      await page.getByTestId('rev-ref').fill(ref);
      await page.getByTestId('rev-validity').fill('2026-12-31');
      await page.getByTestId('rev-currency').selectOption('AED');
      await page.getByTestId('rev-tax-treatment').selectOption('exclusive');
      await page.getByTestId('rev-tax-rate').fill('5');
      await page.getByTestId('rev-freight').fill(freight);
      await page.getByTestId('rev-freight-terms').fill(freight === '0' ? 'DAP Dubai' : 'EXW');
      await page.getByTestId('rev-payment-terms').fill('30 days');
      await page.getByTestId(`save-revision-${offerId}`).click();
      await expect(page.getByTestId(`revision-form-${offerId}`)).toBeHidden({ timeout: 30_000 });
    };

    await captureRevision('500', 'Rev A');
    await captureRevision('500', 'Rev B');
    await captureRevision('0', 'Rev C');

    // All three are on screen. Nothing was overwritten.
    const history = page.getByTestId(`history-${offerId}`);
    await expect(history.locator('[data-testid^="revision-"]')).toHaveCount(3);
    await expect(history).toContainText('Rev A');
    await expect(history).toContainText('Rev B');
    await expect(history).toContainText('Rev C');

    // ── THE DIFF SAYS WHAT THE SUPPLIER CHANGED ─────────────────────────────
    await expect(history).toContainText('freight amount: 500 → 0');
    await expect(history).toContainText('freight terms: EXW → DAP Dubai');

    // ── MAKE THE LATEST CURRENT, AND THE OTHERS BECOME HISTORY ──────────────
    const rows = history.locator('[data-testid^="revision-"]');
    const latestId = (await rows.first().getAttribute('data-testid'))!.replace('revision-', '');
    await page.getByTestId(`confirm-${latestId}`).click();
    await expect(page.getByTestId(`effective-${offerId}`)).toContainText('Rev 2 is the current offer', { timeout: 30_000 });
    await expect(page.getByTestId(`effective-${offerId}`)).toContainText('freight 0');

    // ── AN ALTERNATIVE IS A SEPARATE OFFER, NOT A REPLACEMENT ───────────────
    const familyId = (await family.getAttribute('data-testid'))!.replace('family-', '');
    page.once('dialog', (d) => d.accept('Bosch equivalent'));
    await page.getByTestId(`add-alternative-${familyId}`).click();
    await expect(family.locator('[data-testid^="offer-"]')).toHaveCount(2, { timeout: 30_000 });
    await expect(family).toContainText('Alternative — Bosch equivalent');
    // The base offer still holds its own current revision: the alternative replaced nothing.
    await expect(page.getByTestId(`effective-${offerId}`)).toContainText('Rev 2 is the current offer');

    await page.screenshot({ path: 'test-results/qc-01-capture.png', fullPage: true });

    // ── WITHDRAWING THE CURRENT OFFER LEAVES NO CURRENT OFFER ───────────────
    await page.getByTestId(`withdraw-${latestId}`).click();
    await expect(page.getByTestId(`no-effective-${offerId}`))
      .toContainText('withdrawn by the supplier and no earlier revision is reinstated', { timeout: 30_000 });

    // And the earlier revisions are still there, still superseded — not silently reinstated.
    await expect(history.locator('[data-testid^="revision-"]')).toHaveCount(3);

    // ── IT IS THE SERVER'S, NOT THE PAGE'S ──────────────────────────────────
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId(`history-${offerId}`).locator('[data-testid^="revision-"]')).toHaveCount(3, { timeout: 30_000 });
    await expect(page.getByTestId(`no-effective-${offerId}`)).toContainText('withdrawn by the supplier');

    // …and read back through the API, the commercial facts are the ones that were typed.
    const stored = await (await request.get(`${API}/procurement/quotations/families/${familyId}`, { headers: apiAuthHeaders() })).json();
    const base = stored.offers.find((o: { offer: { kind: string } }) => o.offer.kind === 'base');
    expect(base.history).toHaveLength(3);
    expect(base.effective).toBeNull();
    expect(base.history[0].revision).toMatchObject({
      currency: 'AED', taxTreatment: 'exclusive', taxRatePct: 5, freightAmount: 0,
      freightTerms: 'DAP Dubai', paymentTerms: '30 days', validityDate: '2026-12-31',
    });
  });

  test('refuses at capture what a comparison would otherwise discover weeks later', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };

    const project = await (await request.post(`${API}/projects/projects`, { headers, data: { title: `QC-01 refuse ${run}` } })).json();
    const pr = await (await request.post(`${API}/procurement/purchase-requests`, { headers, data: { title: `Cameras ${run}`, projectId: project.id, value: 0 } })).json();
    const rfq = await (await request.post(`${API}/procurement/rfqs`, { headers, data: { title: `RFQ ${run}`, prId: pr.id } })).json();

    await page.goto(`/procurement/rfqs/${rfq.id}/quotations`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('new-supplier').fill(`Inclusive Co ${run}`);
    await expect(async () => {
      await page.getByTestId('open-quotation').click();
      await expect(page.locator('[data-testid^="family-"]')).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 60_000 });

    const offerId = (await page.locator('[data-testid^="offer-"]').first().getAttribute('data-testid'))!.replace('offer-', '');
    await page.getByTestId(`capture-revision-${offerId}`).click();
    await expect(page.getByTestId(`revision-form-${offerId}`)).toBeVisible({ timeout: 10_000 });

    // Tax-inclusive with no rate: refused while the supplier's document is still in front of them.
    await page.getByTestId('rev-tax-treatment').selectOption('inclusive');
    await page.getByTestId(`save-revision-${offerId}`).click();

    await expect(page.getByTestId('capture-error')).toContainText('must state its tax rate', { timeout: 30_000 });
    // The form keeps what was typed, so the buyer adds the rate rather than starting again.
    await expect(page.getByTestId(`revision-form-${offerId}`)).toBeVisible();
    await expect(page.getByTestId('rev-tax-treatment')).toHaveValue('inclusive');

    await page.getByTestId('rev-tax-rate').fill('5');
    await page.getByTestId(`save-revision-${offerId}`).click();
    await expect(page.getByTestId(`revision-form-${offerId}`)).toBeHidden({ timeout: 30_000 });
    await expect(page.getByTestId(`history-${offerId}`)).toContainText('inclusive');
  });
});
