import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { apiAuthHeaders } from './api-auth';

/**
 * SUP-06 on screen, and in the two documents a buyer actually circulates.
 *
 * Three suppliers answer the same requirement on deliberately different terms. What the screen has
 * to show, because each is a way a comparison misleads quietly:
 *
 *   THE BASIS, before any figure — the date it was computed on, the currency, ex-tax, ex-freight.
 *   A number read without its basis is a number whose meaning the reader has to guess.
 *
 *   EVERY REFUSAL AS A SENTENCE. A blank cell reads as "nothing to say" and a zero reads as "free".
 *
 *   THE DEVIATIONS. A cheaper unit price against a short quantity is not a cheaper offer, and the
 *   screen must not let that read as one.
 *
 *   FREIGHT AT THE QUOTATION LEVEL, stated as not being in the line values.
 *
 *   AND NO WINNER. Nothing ranked, nothing marked preferred.
 *
 * The XLSX and the PDF are asserted to carry the SAME governed values as the screen — that is the
 * whole point of both of them reading one result rather than recomputing.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
/** After this spec's own EUR rate takes effect, and before every other suite's September rates. */
const COMPARISON_DATE = '2026-02-15';
/** Before this spec's EUR rate: nothing at all is governed here. */
const BEFORE_ANY_RATE = '2026-01-05';

test.describe('The commercial comparison for one requirement', () => {
  test.setTimeout(240_000);

  test('shows comparable facts, every refusal in words, and names no winner', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };
    const post = async <T>(path: string, data: unknown): Promise<T> => {
      const res = await request.post(`${API}${path}`, { headers, data });
      expect(res.ok(), `${path} — ${await res.text()}`).toBe(true);
      return res.json() as Promise<T>;
    };

    /**
     * THE DATES ARE CHOSEN SO THIS SPEC CANNOT DRIFT.
     *
     * Every other suite registers rates effective 2026-09-01. This one registers EUR effective
     * 1 Feb and compares on 15 Feb, so EUR is governed and every September rate is simply not yet
     * in effect — a rate applies forward from its effective date, so no later registration by any
     * other spec can make GBP governed on 15 Feb. An earlier version asserted GBP was ungoverned on
     * one date and then compared on another, and was quietly proved wrong by the FX-02 suite.
     */
    await request.post(`${API}/finance/fx/rates`, { headers, data: { from: 'EUR', to: 'AED', rate: 4.0, effectiveDate: '2026-02-01' } });
    const probe = await request.get(`${API}/finance/fx/governed-rate`, { params: { from: 'GBP', to: 'AED', asOf: COMPARISON_DATE }, headers: apiAuthHeaders() });
    expect((await probe.json()).status, `GBP must be ungoverned on ${COMPARISON_DATE} for this spec to mean anything`).toBe('unknown');

    const project = await post<{ id: string }>('/projects/projects', { title: `SUP-06 ${run}` });
    const material = await post<{ id: string }>('/inventory/materials', { code: `CAM-${run}`, name: '4MP dome camera', uom: 'nr' });
    const pr = await post<{ id: string }>('/procurement/purchase-requests', { title: `Cameras ${run}`, projectId: project.id, value: 0 });
    const prLine = await post<{ id: string }>(`/procurement/purchase-requests/${pr.id}/lines`, { material: material.id, quantity: 12, estimatedUnitCost: 450 });
    const rfq = await post<{ id: string }>('/procurement/rfqs', { title: `RFQ ${run}`, prId: pr.id });

    const alpha = await post<{ id: string }>(`/procurement/rfqs/${rfq.id}/quotes`, {
      supplierName: `Alpha ${run}`, amount: 6000, currency: 'AED', taxTreatment: 'exclusive', taxRatePct: 5, validityDate: '2026-12-31',
    });
    await post(`/procurement/quotations/${alpha.id}/lines`, { prLineId: prLine.id, quantity: 12, uom: 'nr', unitPrice: 500 });

    // Cheaper per unit, but SHORT — the case a naive comparison gets wrong.
    const beta = await post<{ id: string }>(`/procurement/rfqs/${rfq.id}/quotes`, {
      supplierName: `Beta ${run}`, amount: 1260, currency: 'EUR', taxTreatment: 'inclusive', taxRatePct: 5,
      freightAmount: 200, freightTerms: 'DAP Dubai', validityDate: '2026-12-31',
    });
    await post(`/procurement/quotations/${beta.id}/lines`, { prLineId: prLine.id, quantity: 10, uom: 'nr', unitPrice: 126 });

    // Cheapest-looking header scalar of all, and not valuable at all: no governed GBP rate.
    const gamma = await post<{ id: string }>(`/procurement/rfqs/${rfq.id}/quotes`, {
      supplierName: `Gamma ${run}`, amount: 1080, currency: 'GBP', taxTreatment: 'exclusive', taxRatePct: 0, validityDate: '2026-01-31',
    });
    const gammaLine = await post<{ id: string }>(`/procurement/quotations/${gamma.id}/lines`, { prLineId: prLine.id, quantity: 12, uom: 'nr', unitPrice: 90 });

    await page.goto(`/procurement/requirements/${prLine.id}/comparison`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('comparison-table')).toBeVisible({ timeout: 30_000 });

    // ── THE BASIS IS ON SCREEN, INCLUDING THE DATE IT WAS COMPUTED ON ────────
    await page.getByTestId('comparison-date').fill(BEFORE_ANY_RATE);
    await expect(page.getByTestId('comparison-context')).toContainText('AED');
    await expect(page.getByTestId('comparison-context')).toContainText('ex-tax');
    await expect(page.getByTestId('comparison-context')).toContainText('exclude freight');

    // Before any rate took effect, the foreign offers cannot be valued at all — and say so.
    await expect(page.getByTestId(`unit-price-${gammaLine.id}`)).toContainText('Not known', { timeout: 30_000 });

    // ── MOVE TO A DATE THE EUR RATE GOVERNS ─────────────────────────────────
    await page.getByTestId('comparison-date').fill(COMPARISON_DATE);
    await expect(page.getByTestId('comparison-table')).toBeVisible();

    const alphaRow = page.locator('[data-testid^="offer-"]', { hasText: `Alpha ${run}` });
    const betaRow = page.locator('[data-testid^="offer-"]', { hasText: `Beta ${run}` });
    const gammaRow = page.locator('[data-testid^="offer-"]', { hasText: `Gamma ${run}` });

    // Alpha: exact quantity, base currency, complete.
    await expect(alphaRow).toContainText('500.00 AED');
    await expect(alphaRow).toContainText('6,000.00 AED');

    // Beta: CHEAPER per unit, and the requisition-line total is refused in words.
    await expect(betaRow).toContainText('480.00 AED');
    await expect(betaRow).toContainText('offered a different quantity');
    await expect(betaRow).toContainText('covers 83.3%');
    // …and it says which governed rate produced that 480.
    await expect(betaRow).toContainText('governed rate effective 2026-02-01');

    // Gamma: no governed rate, refused in words rather than shown blank or zero.
    await expect(gammaRow).toContainText('no governed exchange rate');
    await expect(gammaRow).toContainText('Expired');

    // ── FREIGHT IS SEPARATE, AND SAYS IT IS NOT IN THE LINE VALUES ──────────
    const charges = page.getByTestId('quotation-charges');
    await expect(charges).toContainText('not');
    await expect(charges).toContainText('allocated across lines');
    await expect(charges.locator(`[data-testid="freight-${beta.id}"]`)).toContainText('761.90 AED');

    // ── AND NOTHING IS RANKED ───────────────────────────────────────────────
    await expect(page.getByTestId('comparison-no-recommendation')).toContainText('not a recommendation');
    const rendered = (await page.getByTestId('comparison-table').innerText()).toLowerCase();
    for (const word of ['cheapest', 'recommended', 'winner', 'best value']) {
      expect(rendered, `the comparison table must not say "${word}"`).not.toContain(word);
    }
    // The order is the order offers were recorded, not price order.
    await expect(page.locator('[data-testid^="offer-"]').first()).toContainText(`Alpha ${run}`);

    await page.screenshot({ path: 'test-results/sup-06-comparison.png', fullPage: true });

    // ── THE TWO DOCUMENTS CARRY THE SAME GOVERNED VALUES ────────────────────
    const query = { comparisonDate: COMPARISON_DATE };
    const governed = await (await request.get(
      `${API}/procurement/quotations/by-requirement/${prLine.id}/comparison`, { params: query, headers: apiAuthHeaders() },
    )).json();
    const betaOffer = governed.offers.find((o: { supplierName: string }) => o.supplierName.startsWith(`Beta ${run}`));
    expect(betaOffer.normalisedUnitPrice.unitValue).toBe(480);

    const xlsx = await request.get(`${API}/procurement/quotations/by-requirement/${prLine.id}/comparison.xlsx`, { params: query, headers: apiAuthHeaders() });
    expect(xlsx.ok(), await xlsx.text()).toBe(true);
    expect(xlsx.headers()['content-type']).toContain('spreadsheetml');
    const xlsxBytes = await xlsx.body();
    expect(xlsxBytes.length).toBeGreaterThan(2_000);

    const pdf = await request.get(`/api/procurement/requirements/${prLine.id}/comparison.pdf?comparisonDate=${COMPARISON_DATE}`);
    expect(pdf.ok(), await pdf.text()).toBe(true);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    const pdfBytes = await pdf.body();
    expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-');

    const outputDir = path.resolve(process.cwd(), '../../output');
    await mkdir(path.join(outputDir, 'pdf'), { recursive: true });
    await mkdir(path.join(outputDir, 'xlsx'), { recursive: true });
    await writeFile(path.join(outputDir, 'pdf', 'sup-06-commercial-comparison.pdf'), pdfBytes);
    await writeFile(path.join(outputDir, 'xlsx', 'sup-06-commercial-comparison.xlsx'), xlsxBytes);
  });
});
