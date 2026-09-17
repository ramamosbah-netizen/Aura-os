import { expect, test, type Page } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * `SUP-01`'s OUTBOUND handoff — the technical decision reaching the role that consumes it.
 *
 * The distinction this spec exists to hold, because conflating the two is easy and wrong:
 *
 *   INBOUND receipt is work arriving AT the Technical Manager so they can execute SUP-01. That is
 *   proved by the evaluator's queue and it is NOT this.
 *
 *   OUTBOUND handoff is the VERDICT reaching the next role — the Buyer, who decides what to do about
 *   the offer. A verdict a buyer has to go and look up on a surface they cannot open has not been
 *   handed over.
 *
 * So this runs with TWO REAL PEOPLE, each signed in as themselves and each holding a role AURA
 * already ships:
 *
 *   u-e2e-techmgr   r-technical-manager  `engineering.*` — decides. No procurement permission.
 *   u-e2e-buyer     r-procurement        reads offers. CANNOT decide, and cannot open the
 *                                        technical surface at all.
 *
 * It runs against the REAL database through the real API, which is the only layer that proves
 * persistence — the API e2e suite runs on in-memory stores by construction.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

test.describe('A technical verdict reaches the Buyer', () => {
  test.setTimeout(240_000);

  test('the Technical Manager decides, and the Buyer sees it in their own context', async ({ browser, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const password = process.env.E2E_PASSWORD ?? 'e2e-password';
    const BUYER = process.env.E2E_BUYER_USERNAME ?? 'u-e2e-buyer';
    const TECH = process.env.E2E_TECHMGR_USERNAME ?? 'u-e2e-techmgr';

    const post = async <T>(path: string, data: unknown): Promise<T> => {
      const response = await request.post(`${API}${path}`, {
        headers: { 'content-type': 'application/json', ...apiAuthHeaders() }, data,
      });
      expect(response.ok(), `${path} — ${await response.text()}`).toBe(true);
      return response.json() as Promise<T>;
    };

    // A requirement for 12, and a supplier offering 10 of the specified model.
    const project = await post<{ id: string }>('/projects/projects', { title: `Handoff ${run}` });
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
    const quotation = await post<{ id: string }>(`/procurement/rfqs/${rfq.id}/quotes`, {
      supplierName: `Gulf ELV ${run}`, amount: 4300, currency: 'AED',
    });
    const line = await post<{ id: string }>(`/procurement/quotations/${quotation.id}/lines`, {
      prLineId: prLine.id, quantity: 10, uom: 'nr', unitPrice: 430,
      offeredManufacturer: 'Hikvision', offeredModel: 'DS-2CD2143G2-I', complianceResponse: 'comply',
    });

    const signIn = async (username: string) => {
      const context = await browser.newContext({ storageState: undefined });
      const page = await context.newPage();
      await page.goto('/login', { waitUntil: 'domcontentloaded' });
      await page.getByTestId('login-username').fill(username);
      await page.getByTestId('login-password').fill(password);
      await page.getByTestId('login-submit').click();
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 }).catch(async () => {
        const shown = await page.getByTestId('login-error').innerText().catch(() => null);
        throw new Error(`sign-in as '${username}' did not complete${shown ? ` — ${shown}` : ''}`);
      });
      return { context, page };
    };

    const openQuotation = async (page: Page) => {
      await page.goto(`/procurement/quotations/${quotation.id}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId(`eligibility-${line.id}`)).toBeVisible({ timeout: 30_000 });
    };

    /**
     * The row is server-rendered and the expander is client state, so a single click can land before
     * React has attached its handler and simply be lost. Retry until the panel is actually there —
     * the same pattern the rest of this suite uses.
     */
    const expectRefusedTechnicalSurface = async (page: Page) => {
      await expect(async () => {
        await page.getByTestId(`evaluate-toggle-${line.id}`).click();
        await expect(page.getByTestId('evaluation-unavailable')).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 60_000 });
    };

    // ── 1. THE BUYER SEES IT IS UNDECIDED, before anybody has decided ─────────
    const buyer = await signIn(BUYER);
    await openQuotation(buyer.page);
    await expect(buyer.page.getByTestId(`eligibility-${line.id}`)).toContainText('Not yet evaluated');
    // And the Buyer cannot open the technical surface: deciding is not theirs.
    await expect(buyer.page.getByTestId(`evaluate-toggle-${line.id}`)).toHaveCount(1);
    await expectRefusedTechnicalSurface(buyer.page);

    /**
     * ── 2. THE TECHNICAL MANAGER DECIDES, ON THEIR OWN SURFACE ───────────────
     *
     * A separate page on purpose. The Technical Manager holds `engineering.*` and no procurement
     * permission, so the Buyer's quotation page is closed to them — putting the evaluator's work
     * there would have made the determination unreachable by the only role allowed to make it.
     */
    const tech = await signIn(TECH);
    await tech.page.goto(`/procurement/technical-evaluation/${quotation.id}`, { waitUntil: 'domcontentloaded' });
    await expect(tech.page.getByTestId(`queue-item-${line.id}`)).toBeVisible({ timeout: 30_000 });
    await expect(async () => {
      await tech.page.getByTestId(`queue-open-${line.id}`).click();
      await expect(tech.page.getByTestId(`evaluation-${line.id}`)).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });

    await expect(tech.page.getByTestId('quantity-deviation')).toContainText('10 offered against 12 requested');
    await tech.page.getByTestId('verdict').selectOption('compliant_with_deviation');
    await tech.page.getByTestId('verdict-rationale').fill('short delivery accepted for this phase');
    await tech.page.getByTestId('verdict-submit').click();
    await expect(tech.page.getByTestId('evaluation-eligibility'))
      .toContainText('Compliant with deviation', { timeout: 30_000 });

    // ── 3. AND THE BUYER SEES THE DECISION, IN THEIR OWN CONTEXT ──────────────
    // This is the handoff: the verdict arrives where the Buyer already works, under the Buyer's own
    // permission, naming who decided it — not on a surface they are refused.
    await openQuotation(buyer.page);
    await expect(buyer.page.getByTestId(`eligibility-${line.id}`)).toContainText('compliant with deviation');
    await expect(buyer.page.getByTestId(`eligibility-${line.id}`)).toContainText(TECH);

    // …and the Buyer still cannot see the reasoning or open the decision.
    await expectRefusedTechnicalSurface(buyer.page);

    await buyer.context.close();
    await tech.context.close();
  });
});
