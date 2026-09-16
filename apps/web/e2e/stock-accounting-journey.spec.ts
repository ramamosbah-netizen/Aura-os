import { expect, test, type Page } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * THE OPERATIONAL STOCK-ACCOUNTING SEQUENCE, on screen, in one run:
 *
 *     receipt -> available -> issue -> return -> resulting stock AND net position
 *
 * This is deliberately NOT a `BUY-06` clause. `BUY-06`'s frozen acceptance proof is one sentence —
 * "Issue 20, return 5, retry both; net issued remains 15" — and it is satisfied and closed. What it
 * never asked for is the thing an operator actually does: material ARRIVES, becomes available, goes
 * out to a job, comes back, and the warehouse figure and the job's issued position both have to end
 * up telling the same story. That sequence had never been run end to end on the screen, and a
 * capability's closure must not be read as evidence for it.
 *
 * The two positions are different facts and this asserts BOTH at every step, because that is where
 * this kind of accounting goes wrong:
 *
 *   ON HAND — what the warehouse holds. Receipts raise it, issues lower it, returns raise it back.
 *
 *   NET ISSUED — what is currently out on a BOQ item. Only coded movements touch it, and it is the
 *   balance a return is measured against.
 *
 * A system can keep one and lose the other: issuing to a job that leaves on-hand untouched means the
 * warehouse thinks it still holds material that is on a site, and returning material that never
 * raises on-hand means it comes back to nowhere.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

async function openItem(page: Page, code: string): Promise<void> {
  await expect(async () => {
    await page.getByTestId(`stock-row-${code}`).click();
    await expect(page.getByTestId('issue-project')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

/** On-hand is re-read from the server after every movement, so poll rather than read once. */
async function expectOnHand(page: Page, code: string, text: string): Promise<void> {
  await expect(page.getByTestId(`stock-onhand-${code}`)).toContainText(text, { timeout: 30_000 });
}

test.describe('Stock accounting, end to end on the screen', () => {
  test.setTimeout(240_000);

  test('receipt → available → issue → return, with the warehouse and the job agreeing at every step', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };
    const post = async <T>(path: string, data: unknown): Promise<T> => {
      const response = await request.post(`${API}${path}`, { headers, data });
      expect(response.ok(), `${path} — ${await response.text()}`).toBe(true);
      return response.json() as Promise<T>;
    };

    const project = await post<{ id: string; title: string }>('/projects/projects', { title: `Riser mains ${run}` });
    const boqItemId = `boq-acct-${run}`;
    await post('/projects/quantity-ledger/baseline', { projectId: project.id, boqItemId, quantity: 500, unit: 'm' });

    // The item starts at ZERO on hand: the receipt below is what makes it available, so the
    // sequence proves arrival rather than assuming an opening balance.
    const code = `ACC-${run}`;
    await post('/inventory/stock', { code, name: '4mm² cable', unit: 'm', openingQty: 0, openingCost: 0 });

    await page.goto('/inventory/stock', { waitUntil: 'domcontentloaded' });
    await expectOnHand(page, code, '0 m');
    await openItem(page, code);

    // ── RECEIPT ───────────────────────────────────────────────────────────────
    // 100 m arrives at 6.00 each. This is the warehouse receiving, not a job consuming.
    await page.getByTestId('movement-qty').fill('100');
    await page.getByTestId('movement-cost').fill('6');
    await page.getByTestId('movement-reason').fill(`GRN receipt ${run}`);
    await page.getByTestId('movement-in').click();

    // ── AVAILABLE ─────────────────────────────────────────────────────────────
    await expectOnHand(page, code, '100 m');
    await expect(page.getByTestId(`stock-avgcost-${code}`)).toContainText('6');
    // Value is the position priced at what it cost: 100 × 6.
    await expect(page.getByTestId(`stock-value-${code}`)).toContainText('600');

    // Nothing is out on the job yet, and the screen says so rather than leaving it blank.
    await openItem(page, code);
    await page.getByTestId('issue-project').selectOption({ label: project.title });
    await page.getByTestId('issue-boq-item').selectOption(boqItemId);
    await expect(page.getByTestId('issue-position')).toContainText('Nothing is currently issued');

    // ── ISSUE TO THE JOB ──────────────────────────────────────────────────────
    // 40 m goes to site. BOTH positions must move, in opposite directions.
    await page.getByTestId('issue-quantity').fill('40');
    await page.getByTestId('issue-out').click();
    await expect(page.getByTestId('issue-position')).toContainText('40 m currently issued', { timeout: 30_000 });
    // THE WAREHOUSE NO LONGER HOLDS IT. This is the assertion the BUY-06 proof never made: if
    // on-hand stayed at 100 the warehouse would believe it still holds cable that is on a site.
    await expectOnHand(page, code, '60 m');
    await expect(page.getByTestId(`stock-value-${code}`)).toContainText('360');

    // ── RETURN FROM THE JOB ───────────────────────────────────────────────────
    // 15 m comes back. On hand rises, and the job's issued position falls to the net.
    await openItem(page, code);
    await page.getByTestId('issue-project').selectOption({ label: project.title });
    await page.getByTestId('issue-boq-item').selectOption(boqItemId);
    await page.getByTestId('issue-quantity').fill('15');
    await page.getByTestId('issue-return').click();
    await expect(page.getByTestId('issue-position')).toContainText('25 m currently issued', { timeout: 30_000 });
    await expectOnHand(page, code, '75 m');

    /**
     * AND IT COMES BACK WORTH WHAT IT WAS WORTH WHEN IT LEFT.
     *
     * This is the assertion the sequence was written to reach, and it failed when it was first run:
     * a return carried no price, `computeWac` read a missing cost as 0, and 15 m that cost 6.00 came
     * back valued at nothing — the average fell 6.00 -> 4.80 and AED 90 of inventory value vanished
     * while on-hand stayed correct at 75 m, which is exactly why nobody would notice.
     *
     * A return is now valued from the item's PERSISTED CURRENT VALUATION STATE (`avgCost`), which
     * that item's configured costing engine maintains — resolved on the server rather than sent by
     * this screen. So a round trip is value-neutral. For a FIFO item this is not original-layer
     * reversal: the return creates inventory at the current state, and layer provenance is not
     * modelled.
     */
    await expect(page.getByTestId(`stock-avgcost-${code}`)).toContainText('6');
    // 75 × 6.00 — not the 360 the defect produced.
    await expect(page.getByTestId(`stock-value-${code}`)).toContainText('450');

    // ── THE TWO POSITIONS AGREE ───────────────────────────────────────────────
    // 100 received, 40 issued, 15 returned. On hand 75, net issued 25, and 75 + 25 = 100 — nothing
    // has been created or lost between the warehouse and the job.
    await expect(page.getByTestId(`stock-onhand-${code}`)).toContainText('75 m');
    await expect(page.getByTestId('issue-position')).toContainText('25 m currently issued');

    // And the return is still bounded by the NET, not by the 40 that once went out.
    await page.getByTestId('issue-quantity').fill('26');
    await page.getByTestId('issue-return').click();
    await expect(page.getByTestId('issue-error')).toContainText('only 25 of this material is currently issued');
    // A refused movement moves neither position.
    await expectOnHand(page, code, '75 m');
    await expect(page.getByTestId('issue-position')).toContainText('25 m currently issued');
  });
});
