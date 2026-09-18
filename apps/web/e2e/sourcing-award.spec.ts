import { expect, test } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * SUP-14 in the browser, against Postgres — and the one question it exists to answer:
 *
 *   WHAT CURRENCY IS THE PURCHASE ORDER IN?
 *
 * Dallas quotes USD 100 a unit. The buyer compares in AED at a governed rate of 3.6725 and sees
 * AED 367.25. The order that goes to Dallas has to say USD 100 — because the comparison was a way of
 * weighing two offers against each other, and the order is a contract with somebody who never quoted
 * in AED and never agreed to that rate. The AED figure belongs in the audit trail of the decision;
 * it is not what anybody is being asked to invoice.
 *
 * TWO PRINCIPALS, EACH SIGNED IN AS THEMSELVES, holding roles AURA already ships:
 *
 *   u-e2e-buyer    r-procurement          prepares and submits; CANNOT approve and CANNOT award
 *   u-e2e-procmgr  r-procurement-manager  approves and awards
 *
 * One principal cannot prove any of this. The decision refuses its own submitter as approver, and the
 * award is a permission the Buyer does not hold — so a single admin driving both ends would show
 * that the buttons work and nothing about whether the control does.
 *
 * WHAT THIS PROVES THAT THE API SUITE CANNOT: that the order, its currency, its terms and its lines
 * survive into the database and come back — the API e2e runs on in-memory stores by construction.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
/** After this spec's own USD rate takes effect. */
const COMPARISON_DATE = '2026-03-10';

test.describe('The award', () => {
  test.setTimeout(240_000);

  test('turns an approved recommendation into a purchase order in the supplier’s own currency', async ({ browser, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const password = process.env.E2E_PASSWORD ?? 'e2e-password';
    const BUYER = process.env.E2E_BUYER_USERNAME ?? 'u-e2e-buyer';
    const MANAGER = process.env.E2E_PROCUREMENT_MANAGER_USERNAME ?? 'u-e2e-procmgr';

    const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };
    const post = async <T>(path: string, data: unknown): Promise<T> => {
      const res = await request.post(`${API}${path}`, { headers, data });
      expect(res.ok(), `${path} — ${await res.text()}`).toBe(true);
      return res.json() as Promise<T>;
    };

    // The governed rate the comparison uses. Effective 1 March, compared on 10 March — every other
    // suite's rates are effective 1 February or 1 September, so none of them can change this one.
    await request.post(`${API}/finance/fx/rates`, { headers, data: { from: 'USD', to: 'AED', rate: 3.6725, effectiveDate: '2026-03-01' } });

    // ── THE REQUIREMENT AND THE TWO OFFERS ──────────────────────────────────
    const project = await post<{ id: string }>('/projects/projects', { title: `SUP-14 ${run}` });
    const pr = await post<{ id: string }>('/procurement/purchase-requests', { title: `Cameras and cable ${run}`, projectId: project.id, value: 0 });
    const prLines: string[] = [];
    for (const [code, name] of [['CAM', '4MP dome camera'], ['CBL', 'Cat-6A cable']]) {
      const material = await post<{ id: string }>('/inventory/materials', { code: `${code}-${run}`, name, uom: 'nr' });
      const line = await post<{ id: string }>(`/procurement/purchase-requests/${pr.id}/lines`, {
        material: material.id, quantity: 10, estimatedUnitCost: 400,
      });
      prLines.push(line.id);
    }
    const rfq = await post<{ id: string }>('/procurement/rfqs', { title: `Cameras and cable ${run}`, prId: pr.id });

    const quote = async (supplierName: string, currency: string, unitPrices: [number, number], terms: Record<string, unknown>) => {
      const { baseOffer } = await post<{ baseOffer: { id: string } }>('/procurement/quotations/families', {
        rfqId: rfq.id, supplierName, supplierQuotationRef: `Q-${run}-${currency}`,
      });
      const revision = await post<{ id: string }>(`/procurement/quotations/offers/${baseOffer.id}/revisions`, {
        currency, taxTreatment: 'exclusive', taxRatePct: 5, validityDate: '2026-12-31', ...terms,
      });
      for (const [i, prLineId] of prLines.entries()) {
        await post(`/procurement/quotations/revisions/${revision.id}/lines`, {
          prLineId, quantity: 10, uom: 'nr', unitPrice: unitPrices[i],
          offeredManufacturer: `${supplierName} Industries`, offeredModel: `M-${i + 1}`,
        });
      }
      for (const status of ['received', 'confirmed']) {
        const res = await request.patch(`${API}/procurement/quotations/revisions/${revision.id}/status`, { headers, data: { status } });
        expect(res.ok(), await res.text()).toBe(true);
      }
      // SUP-01's verdict on every line, so nothing here is blocked by something else's gap.
      const lines = await (await request.get(`${API}/procurement/quotations/revisions/${revision.id}/lines`, { headers: apiAuthHeaders() })).json() as Array<{ id: string }>;
      for (const line of lines) {
        await post(`/procurement/quotation-lines/${line.id}/evaluation`, { verdict: 'compliant', rationale: 'meets the specification' });
      }
      return { offerId: baseOffer.id, revisionId: revision.id };
    };

    // Dallas: USD 100 + 250 a unit × 10 = USD 3,500, freight USD 200.
    //   In AED at 3.6725: 367.25 × 10 + 918.13 × 10 + 734.50 freight = AED 13,588.30
    await quote(`Dallas ${run}`, 'USD', [100, 250], { freightAmount: 200, freightTerms: 'DAP Dubai', paymentTerms: '30 days net' });
    // Gulf: AED 400 + 950 a unit × 10 = AED 13,500 — the CHEAPER comparison, and it loses anyway.
    await quote(`Gulf ${run}`, 'AED', [400, 950], { paymentTerms: '60 days net' });

    // ── THE BUYER RECORDS THE DECISION, IN THEIR OWN SESSION ────────────────
    const signedIn = async (username: string) => {
      const context = await browser.newContext({ storageState: undefined });
      const page = await context.newPage();
      await page.goto('/login', { waitUntil: 'domcontentloaded' });
      await page.getByTestId('login-username').fill(username);
      await page.getByTestId('login-password').fill(password);
      await page.getByTestId('login-submit').click();
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
      return { context, page };
    };

    const buyer = await signedIn(BUYER);
    const manager = await signedIn(MANAGER);

    try {
      /**
       * ── THE RFQ SCREEN NO LONGER AWARDS ANYTHING ─────────────────────────
       *
       * It used to tag the smallest quote "lowest" and put an Award button beside every row, which
       * raised a purchase order for that one figure. Both are gone, the screen says why the amounts
       * it still lists are not comparable, and the way on is the governed decision.
       */
      await buyer.page.goto('/procurement/rfqs', { waitUntil: 'domcontentloaded' });
      await buyer.page.getByText(`Cameras and cable ${run}`).first().click();
      await expect(buyer.page.getByRole('link', { name: /Sourcing decision/ }).first()).toBeVisible({ timeout: 40_000 });
      await expect(buyer.page.getByRole('button', { name: 'Award', exact: true })).toHaveCount(0);
      const rfqScreen = (await buyer.page.locator('main, body').first().innerText()).toLowerCase();
      expect(rfqScreen, 'the RFQ screen must not rank quotes').not.toContain('lowest');
      // The copy went with the button. "Award the winner" beside a list of incomparable header
      // figures is the claim the whole record exists to remove.
      expect(rfqScreen, 'the RFQ screen must not offer to award a winner').not.toContain('award the winner');
      expect(rfqScreen).toContain('not comparable with one another');

      await buyer.page.goto(`/procurement/rfqs/${rfq.id}/recommendation`, { waitUntil: 'domcontentloaded' });
      await expect(buyer.page.getByTestId('candidates-table')).toBeVisible({ timeout: 40_000 });
      await buyer.page.getByTestId('sourcing-date').fill(COMPARISON_DATE);

      // The comparison is in AED, and it says so before any figure is read.
      await expect(buyer.page.getByTestId('sourcing-context')).toContainText('AED');
      const dallasRow = buyer.page.locator('[data-testid^="candidate-"]', { hasText: `Dallas ${run}` });
      await expect(dallasRow).toContainText('13,588.30 AED', { timeout: 30_000 });
      // …while the OFFER's own currency stays visible beside it. Both facts, neither hidden.
      await expect(dallasRow).toContainText('USD');
      await expect(buyer.page.getByTestId('sourcing-no-winner')).toContainText('no offer is marked preferred');

      // Dallas is chosen although Gulf compares cheaper, so the reason is not optional.
      const dallasOfferId = (await dallasRow.getAttribute('data-testid'))!.replace('candidate-', '');
      for (const prLineId of prLines) {
        await buyer.page.getByTestId(`assign-${prLineId}`).selectOption(dallasOfferId);
      }
      await buyer.page.getByTestId('reason-code').selectOption('better_warranty');
      await buyer.page.getByTestId('reason-text').fill('five years on site against Gulf’s one');
      await buyer.page.getByTestId('prepare').click();
      await expect(buyer.page.getByTestId('recommendation-status')).toHaveText('draft', { timeout: 30_000 });

      await buyer.page.getByTestId('submit').click();
      await expect(buyer.page.getByTestId('recommendation-status')).toHaveText('submitted', { timeout: 30_000 });

      // ── THE BUYER CANNOT APPROVE THEIR OWN, AND CANNOT AWARD AT ALL ───────
      // The approve control is the Manager's; the Buyer's screen does not offer it, and the API
      // refuses it from this session even when asked directly.
      const live = await (await request.get(`${API}/procurement/rfqs/${rfq.id}/recommendations`, { headers: apiAuthHeaders() })).json() as Array<{ id: string; status: string }>;
      const recommendationId = live.find((r) => r.status === 'submitted')?.id;
      expect(recommendationId, 'the submitted recommendation must be readable').toBeTruthy();

      const buyerAward = await buyer.page.request.post(`/api/procurement/sourcing/recommendations/${recommendationId}/award`, {
        headers: { 'content-type': 'application/json' }, data: {},
      });
      expect(buyerAward.status(), 'a Buyer must not be able to award').toBe(403);

      // ── THE MANAGER APPROVES AND AWARDS ──────────────────────────────────
      await manager.page.goto(`/procurement/rfqs/${rfq.id}/recommendation`, { waitUntil: 'domcontentloaded' });
      await expect(manager.page.getByTestId('recommendation-status')).toHaveText('submitted', { timeout: 40_000 });
      await manager.page.getByTestId('decide-approved').click();
      await expect(manager.page.getByTestId('recommendation-status')).toHaveText('approved', { timeout: 30_000 });

      await manager.page.getByTestId('award').click();
      await expect(manager.page.getByTestId('awarded-orders')).toBeVisible({ timeout: 40_000 });

      // ── THE ORDER ON SCREEN IS IN USD ────────────────────────────────────
      const orderRow = manager.page.locator('[data-testid^="order-"]').first();
      await expect(orderRow).toContainText('USD');
      await expect(orderRow).toContainText('3,500.00');
      await expect(manager.page.getByTestId('award-currency-note')).toContainText('own currency');
      // The comparison figure must not appear as the order's value.
      await expect(manager.page.getByTestId('awarded-orders')).not.toContainText('13,588.30');

      await manager.page.screenshot({ path: 'test-results/sup-14-award.png', fullPage: true });

      // ── AND IT IS IN THE DATABASE, not just on the screen ────────────────
      const orders = await (await request.get(`${API}/procurement/purchase-orders`, {
        params: { projectId: project.id }, headers: apiAuthHeaders(),
      })).json() as Array<Record<string, unknown>>;
      const order = orders.find((o) => String(o.supplierName ?? '').includes(`Dallas ${run}`));
      expect(order, 'the awarded order must be readable back from the API').toBeTruthy();

      const persisted = await (await request.get(`${API}/procurement/purchase-orders/${order!.id}`, { headers: apiAuthHeaders() })).json();
      expect(persisted.currency, 'the SUPPLIER’S currency, read back out of Postgres').toBe('USD');
      expect(Number(persisted.value)).toBe(3_500);
      expect(persisted.taxTreatment).toBe('exclusive');
      expect(Number(persisted.taxRatePct)).toBe(5);
      expect(Number(persisted.freightAmount)).toBe(200);
      expect(persisted.freightTerms).toBe('DAP Dubai');
      expect(persisted.paymentTerms).toBe('30 days net');
      expect(persisted.supplierQuotationRef).toBe(`Q-${run}-USD`);
      expect(persisted.sourcingRecommendationId, 'a spend must name the decision that authorised it').toBeTruthy();
      expect(persisted.quotationRevisionId, 'and the offer revision its terms came from').toBeTruthy();

      const lines = await (await request.get(`${API}/procurement/purchase-orders/${order!.id}/lines`, { headers: apiAuthHeaders() })).json() as Array<Record<string, unknown>>;
      expect(lines, 'the legacy award produced an order with NO lines — this one has them').toHaveLength(2);
      expect(lines.map((l) => Number(l.unitPrice))).toEqual([100, 250]);
      expect(lines.every((l) => l.sourceType === 'sourced')).toBe(true);
      expect(lines.every((l) => Boolean(l.sourcePrLineId) && Boolean(l.sourceQuoteLineId))).toBe(true);

      // One total, not two that can disagree: the header equals what the lines come to.
      const summary = await (await request.get(`${API}/procurement/purchase-orders/${order!.id}/lines/summary`, { headers: apiAuthHeaders() })).json();
      expect(Number(summary.total.value)).toBe(Number(persisted.value));
      expect(summary.provenance).toBe('sourced');
    } finally {
      await buyer.context.close();
      await manager.context.close();
    }
  });
});
