import { expect, test } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * Wave 4 on screen — what an order buys, and where it stands on delivery.
 *
 * Two slices built this and neither had a screen, so a buyer saw an order as a title and one
 * number, and a storekeeper had nowhere to say that three of the twelve cameras had arrived. The
 * three things that had to become visible are the three the API refuses to fudge:
 *
 *   · MATERIALS IN THEIR OWN UNITS — "12 nr" and "250 m", never a bare 12;
 *   · A PROVISIONAL PRICE LOOKING PROVISIONAL — an estimate carried from a requisition is the
 *     requisitioner's guess, and shown identically to a negotiated price it becomes a commitment
 *     the moment somebody issues the order;
 *   · 1 OF 100 RECEIVED, 99 OUTSTANDING — the order NOT reading as received, and the money still
 *     committed readable beside it.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

interface Material { id: string; code: string }
interface OrderLine { id: string; lineNo: number }


/**
 * Open a note's receiving panel, tolerating hydration.
 *
 * The register is server-rendered and the expander is client state, so between first paint and
 * hydration the button is inert — a click lands and nothing happens. Retrying until the panel is
 * actually open is the honest wait: it asserts the outcome rather than guessing a delay.
 */
async function openReceiving(page: import('@playwright/test').Page, grnId: string): Promise<void> {
  await expect(async () => {
    await page.getByTestId(`grn-receive-toggle-${grnId}`).click();
    await expect(page.getByTestId('receipt-line-order-line')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

test.describe('An order shows what it buys and where it stands', () => {
  test.setTimeout(240_000);

  test('names materials in their own units, marks a provisional price, and refuses to round a partial delivery up', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };
    const post = async <T>(path: string, data: unknown): Promise<T> => {
      const response = await request.post(`${API}${path}`, { headers, data });
      expect(response.ok(), `${path} — ${await response.text()}`).toBe(true);
      return response.json() as Promise<T>;
    };
    const patch = async (path: string, data: unknown): Promise<void> => {
      const response = await request.patch(`${API}${path}`, { headers, data });
      expect(response.ok(), `${path} — ${await response.text()}`).toBe(true);
    };

    const project = await post<{ id: string }>('/projects/projects', { title: `Order job ${run}` });
    // Two materials counted DIFFERENTLY. One unit for both would prove nothing about whether the
    // unit follows the material.
    const camera = await post<Material>('/inventory/materials', {
      code: `UCAM-${run}`, name: '4MP dome camera', uom: 'nr', manufacturer: 'Hikvision', model: 'DS-2CD2143G2-I',
    });
    const cable = await post<Material>('/inventory/materials', {
      code: `UCBL-${run}`, name: 'Cat6 U/UTP cable', uom: 'm',
    });

    // ── A requisition, approved, so its ESTIMATE is carried onto the drafted order ──
    const pr = await post<{ id: string }>('/procurement/purchase-requests', {
      title: `Carried ${run}`, projectId: project.id, value: 0,
    });
    await post(`/procurement/purchase-requests/${pr.id}/lines`, { material: camera.code, quantity: 12, estimatedUnitCost: 100 });
    await patch(`/procurement/purchase-requests/${pr.id}/status`, { status: 'submitted' });
    await patch(`/procurement/purchase-requests/${pr.id}/decision`, { status: 'approved' });

    const orders = await (await request.get(`${API}/procurement/purchase-orders`, { headers: apiAuthHeaders() })).json() as Array<{ id: string; title: string }>;
    const drafted = orders.find((o) => o.title.includes(`Carried ${run}`));
    expect(drafted, 'approving a requisition drafts an order').toBeTruthy();

    await page.goto(`/procurement/purchase-orders/${drafted!.id}`, { waitUntil: 'domcontentloaded' });

    // ── The carried line: its own unit, and its price marked as NOT agreed ─────
    const line1 = page.getByTestId('order-line-1');
    await expect(line1).toContainText(camera.code);
    await expect(page.getByTestId('order-line-qty-1')).toHaveText('12 nr');
    // The whole point: identical numbers, different commercial standing, and the screen says which.
    await expect(page.getByTestId('order-line-basis-1')).toContainText('estimate');
    await expect(page.getByTestId('order-line-basis-1')).toContainText('not agreed with a supplier');
    // …and the order says plainly it was not competitively sourced, rather than leaving it blank.
    await expect(page.getByTestId('order-line-source-1')).toHaveText('direct');
    await expect(page.getByTestId('order-provenance')).toContainText('Bought direct');
    await expect(page.getByTestId('order-lines-value')).toHaveText('AED 1,200.00');

    // ── A buyer adds a second material at an AGREED price ──────────────────────
    await page.getByTestId('order-line-material').selectOption(cable.id);
    // The unit appears from the MATERIAL the moment it is chosen; it is never typed.
    await expect(page.getByTestId('order-line-uom')).toHaveText('m');
    await page.getByTestId('order-line-quantity').fill('250');
    await page.getByTestId('order-line-price').fill('2');
    await page.getByTestId('order-line-add').click();

    await expect(page.getByTestId('order-line-qty-2')).toHaveText('250 m');
    // A buyer placing an order at a price has agreed it — so no provisional marker on this one.
    await expect(page.getByTestId('order-line-basis-2')).toHaveCount(0);
    await expect(page.getByTestId('order-lines-value')).toHaveText('AED 1,700.00');

    // ── Issue it, then receive ONE of the twelve cameras ───────────────────────
    // Submit, then issue (J3-01): each act is its own command, and issuing is reachable only from
    // approved — an order under the threshold has its approval RECORDED rather than skipped.
    await post(`/procurement/purchase-orders/${drafted!.id}/submit`, {});
    await post(`/procurement/purchase-orders/${drafted!.id}/issue`, {});
    const orderLines = await (await request.get(`${API}/procurement/purchase-orders/${drafted!.id}/lines`, { headers: apiAuthHeaders() })).json() as OrderLine[];
    const grn = await post<{ id: string }>('/inventory/grns', {
      title: `GRN ${run}`, poId: drafted!.id, projectId: project.id,
    });

    await page.goto('/inventory/grns', { waitUntil: 'domcontentloaded' });
    await openReceiving(page, grn.id);

    // The storekeeper records what arrived AGAINST an ordered line — not a number for the order.
    await page.getByTestId('receipt-line-order-line').selectOption(orderLines[0].id);
    await expect(page.getByTestId('receipt-line-uom')).toHaveText('nr');
    await page.getByTestId('receipt-line-accepted').fill('1');
    await page.getByTestId('receipt-line-record').click();
    await expect(page.getByTestId('receipt-entry-1')).toContainText(camera.code);

    // ── 1 of 100 — or here, 1 of 12 — and the rest is still owed ───────────────
    await page.goto(`/procurement/purchase-orders/${drafted!.id}`, { waitUntil: 'domcontentloaded' });

    const headline = page.getByTestId('order-receipt-headline');
    await expect(headline).toContainText('1 of 12 nr received, 11 outstanding');
    await expect(page.getByTestId('receipt-line-accepted-1')).toContainText('1 nr');
    await expect(page.getByTestId('receipt-line-outstanding-1')).toHaveText('11 nr');
    // The cable has not arrived at all, and the screen says so rather than averaging it away.
    await expect(page.getByTestId('receipt-line-outstanding-2')).toHaveText('250 m');
    // Exposure: 11 cameras at 100 + 250 metres at 2 = 1,600 still committed.
    await expect(page.getByTestId('order-receipt-exposure')).toContainText('AED 1,600.00');

    // …and the ORDER has not been rounded up to received.
    //
    // The status in the header is SERVER-rendered, while the reactor that moves it runs off the
    // outbox — so the first paint can legitimately still show `issued`. Reload until it settles
    // rather than asserting against a race: what matters is where it lands, and that it is never
    // `received` on the way there.
    await expect(async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('record-status')).toHaveText('partially received');
    }).toPass({ timeout: 30_000 });

    // ── A rejected delivery is recorded, and is NOT progress ───────────────────
    await page.goto('/inventory/grns', { waitUntil: 'domcontentloaded' });
    await openReceiving(page, grn.id);
    await page.getByTestId('receipt-line-order-line').selectOption(orderLines[1].id);
    await page.getByTestId('receipt-line-rejected').fill('50');
    await page.getByTestId('receipt-line-reason').fill('wrong cable category delivered');
    await page.getByTestId('receipt-line-record').click();
    await expect(page.getByTestId('receipt-entry-2')).toContainText('wrong cable category delivered');

    await page.goto(`/procurement/purchase-orders/${drafted!.id}`, { waitUntil: 'domcontentloaded' });
    // Shown beside the accepted figure, never added to it: the cable is still entirely owed.
    await expect(page.getByTestId('receipt-line-rejected-2')).toContainText('50 m rejected — not received');
    await expect(page.getByTestId('receipt-line-outstanding-2')).toHaveText('250 m');
    await expect(page.getByTestId('order-receipt-exposure')).toContainText('AED 1,600.00');
  });
});
