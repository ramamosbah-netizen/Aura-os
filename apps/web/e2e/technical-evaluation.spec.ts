import { expect, test, type Page } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * `SUP-01` on screen — the internal technical verdict on a supplier's offer.
 *
 * WHAT THE BROWSER HAS TO SHOW, because each is a way a technical decision goes wrong quietly:
 *
 *   The REQUIREMENT beside the OFFER. An evaluator judging without what was asked for is guessing.
 *   A DIFFERING QUANTITY flagged as a deviation — surfaced, not decided.
 *   The SUPPLIER'S CLAIM rendered as their words, never as a tick. A screen that shows "comply" as a
 *   pass is how a claim becomes a verdict without anybody deciding anything.
 *   And an un-evaluated offer saying plainly that it cannot be recommended, however low its price.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

async function openVerdict(page: Page, lineId: string): Promise<void> {
  await expect(async () => {
    await page.getByTestId(`evaluate-toggle-${lineId}`).click();
    await expect(page.getByTestId(`evaluation-${lineId}`)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

test.describe('The technical verdict on a supplier offer', () => {
  test.setTimeout(240_000);

  test('shows what was asked for beside what was offered, flags the deviation, and records a verdict', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };
    const post = async <T>(path: string, data: unknown): Promise<T> => {
      const response = await request.post(`${API}${path}`, { headers, data });
      expect(response.ok(), `${path} — ${await response.text()}`).toBe(true);
      return response.json() as Promise<T>;
    };

    const project = await post<{ id: string }>('/projects/projects', { title: `Eval ${run}` });
    const camera = await post<{ id: string }>('/inventory/materials', {
      code: `CAM-${run}`, name: '4MP dome camera', uom: 'nr',
      specification: 'IP67, 2.8mm fixed lens', manufacturer: 'Hikvision', model: 'DS-2CD2143G2-I',
    });
    const pr = await post<{ id: string }>('/procurement/purchase-requests', {
      title: `Cameras ${run}`, projectId: project.id, value: 0,
    });
    const prLine = await post<{ id: string }>(`/procurement/purchase-requests/${pr.id}/lines`, {
      material: camera.id, quantity: 12, estimatedUnitCost: 450,
    });
    const rfq = await post<{ id: string }>('/procurement/rfqs', { title: `RFQ ${run}`, prId: pr.id });
    /**
     * The offer is captured as a quotation REVISION (QC-01). A technical verdict belongs to the
     * lines of a specific revision — one recorded against Rev 1 must not read as a verdict on Rev
     * 2's different price — so the evaluation surfaces are keyed on the revision, not on a quotation.
     */
    const { baseOffer } = await post<{ baseOffer: { id: string } }>('/procurement/quotations/families', {
      rfqId: rfq.id, supplierName: `Gulf ELV ${run}`, supplierQuotationRef: `Q-${run}`,
    });
    const quotation = await post<{ id: string }>(`/procurement/quotations/offers/${baseOffer.id}/revisions`, {
      currency: 'AED', taxTreatment: 'exclusive', taxRatePct: 5, validityDate: '2026-12-31',
    });
    // The supplier offers TEN against a request for TWELVE, and claims compliance.
    const line = await post<{ id: string }>(`/procurement/quotations/revisions/${quotation.id}/lines`, {
      prLineId: prLine.id, quantity: 10, uom: 'nr', unitPrice: 430,
      offeredManufacturer: 'Hikvision', offeredModel: 'DS-2CD2143G2-I', complianceResponse: 'comply',
    });

    await page.goto(`/procurement/quotations/${quotation.id}`, { waitUntil: 'domcontentloaded' });

    // ── The supplier's claim is shown AS A CLAIM, in the register ─────────────
    await expect(page.getByTestId(`claim-${line.id}`)).toContainText('comply');

    await openVerdict(page, line.id);

    // ── Asked for, beside offered ─────────────────────────────────────────────
    await expect(page.getByTestId('requirement-quantity')).toContainText('12');
    await expect(page.getByTestId('offered-quantity')).toContainText('10');

    // ── The deviation is flagged, and explicitly left to the evaluator ────────
    await expect(page.getByTestId('quantity-deviation')).toContainText('10 offered against 12 requested');
    await expect(page.getByTestId('quantity-deviation')).toContainText('your judgement');

    // ── The supplier's claim is labelled as theirs, not as a state of the offer ──
    await expect(page.getByTestId('supplier-claim')).toContainText('Supplier states');

    // ── UNEVALUATED SAYS SO, and says what it means ───────────────────────────
    await expect(page.getByTestId('evaluation-eligibility')).toContainText('Not yet evaluated');
    await expect(page.getByTestId('evaluation-eligibility')).toContainText('however low its price');

    // ── A verdict costs a rationale ───────────────────────────────────────────
    await page.getByTestId('verdict').selectOption('non_compliant');
    await page.getByTestId('verdict-submit').click();
    await expect(page.getByTestId('verdict-error')).toContainText('requires a rationale', { timeout: 30_000 });

    // ── Recorded, with its reasoning, and the screen now states the decision ──
    await page.getByTestId('verdict-rationale').fill('only 10 offered against 12 required');
    await page.getByTestId('verdict-submit').click();
    await expect(page.getByTestId('evaluation-eligibility')).toContainText('Not compliant', { timeout: 30_000 });
    await expect(page.getByTestId('evaluation-eligibility')).toContainText('only 10 offered against 12 required');

    // ── AMENDING COSTS A REASON, and the prior decision is kept ───────────────
    await page.getByTestId('verdict').selectOption('compliant_with_deviation');
    await page.getByTestId('verdict-rationale').fill('short delivery accepted for this phase');
    await page.getByTestId('verdict-submit').click();
    await expect(page.getByTestId('verdict-error')).toContainText('requires a reason', { timeout: 30_000 });

    await page.getByTestId('verdict-amendment-reason').fill('phasing agreed with the site team');
    await page.getByTestId('verdict-submit').click();
    await expect(page.getByTestId('evaluation-eligibility')).toContainText('Compliant with deviation', { timeout: 30_000 });
    await expect(page.getByTestId('verdict-history')).toContainText('2 decisions');

    // ── AND IT SURVIVES A RELOAD, because the verdict is the server's ────────
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openVerdict(page, line.id);
    await expect(page.getByTestId('evaluation-eligibility')).toContainText('Compliant with deviation');
  });
});
