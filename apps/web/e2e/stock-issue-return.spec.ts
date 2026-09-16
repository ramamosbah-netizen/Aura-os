import { expect, test, type Page } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * `BUY-06` on screen — issuing material to a job, and taking it back.
 *
 * The stock screen could move material in and out of the WAREHOUSE and nothing else: the movement
 * it posted carried no project and no BOQ item, so a storekeeper could not issue to a job at all
 * and the quantity ledger never saw an issue. The capability was unreachable from the screen it
 * belongs on.
 *
 * Three things have to be true here, and the last one is the one the register records as broken:
 *
 *   · a storekeeper can issue to a named project against a measured BOQ item;
 *   · the screen shows WHAT IS ACTUALLY OUT THERE before anybody types a return, because that is
 *     the balance the server measures a return against;
 *   · and a return larger than what went out is REFUSED in the domain's own words — measured
 *     against the NET, not the gross, so 20 issued and 5 returned leaves 15 that can come back.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

/** The stock row expands on click, and the panel inside it is client state. */
async function openItem(page: Page, code: string): Promise<void> {
  await expect(async () => {
    // The code cell renders a disclosure marker before the code, so match the ROW by text.
    await page.getByRole('row').filter({ hasText: code }).first().click();
    await expect(page.getByTestId('issue-project')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

test.describe('Material issued to a job, and what comes back', () => {
  test.setTimeout(240_000);

  test('issues against a BOQ item, shows what is out there, and refuses a return bigger than it', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };
    const post = async <T>(path: string, data: unknown): Promise<T> => {
      const response = await request.post(`${API}${path}`, { headers, data });
      expect(response.ok(), `${path} — ${await response.text()}`).toBe(true);
      return response.json() as Promise<T>;
    };

    const project = await post<{ id: string; title: string }>('/projects/projects', { title: `Cable pull ${run}` });
    const boqItemId = `boq-ui-${run}`;
    await post('/projects/quantity-ledger/baseline', { projectId: project.id, boqItemId, quantity: 100, unit: 'm' });
    const code = `UIR-${run}`;
    await post('/inventory/stock', { code, name: '2.5mm² cable', unit: 'm', openingQty: 100, openingCost: 5 });

    await page.goto('/inventory/stock', { waitUntil: 'domcontentloaded' });
    await openItem(page, code);

    // ── Nothing is out there yet, and the screen says so ──────────────────────
    await page.getByTestId('issue-project').selectOption({ label: project.title });
    await page.getByTestId('issue-boq-item').selectOption(boqItemId);
    await expect(page.getByTestId('issue-position')).toContainText('Nothing is currently issued');
    // …so returning is not even offered.
    await expect(page.getByTestId('issue-return')).toBeDisabled();

    // ── Issue 20 m to the job ─────────────────────────────────────────────────
    await page.getByTestId('issue-quantity').fill('20');
    await page.getByTestId('issue-out').click();
    await expect(page.getByTestId('issue-position')).toContainText('20 m currently issued', { timeout: 30_000 });
    await expect(page.getByTestId('issue-position')).toContainText('the most that can come back');

    // ── Return 5 m — the net is 15 ────────────────────────────────────────────
    await page.getByTestId('issue-quantity').fill('5');
    await page.getByTestId('issue-return').click();
    await expect(page.getByTestId('issue-position')).toContainText('15 m currently issued', { timeout: 30_000 });

    // ── YOU CANNOT RETURN MORE THAN YOU TOOK ──────────────────────────────────
    // 20 went out in total, but 5 already came back — so 16 is returning material that is no
    // longer on site, and the refusal is measured against the NET rather than the gross.
    await page.getByTestId('issue-quantity').fill('16');
    await page.getByTestId('issue-return').click();
    await expect(page.getByTestId('issue-error')).toContainText('only 15 of this material is currently issued');
    await expect(page.getByTestId('issue-error')).toContainText('cannot return more than you took');
    // The position is untouched by a refused movement.
    await expect(page.getByTestId('issue-position')).toContainText('15 m currently issued');

    // ── And the whole 15 can come back ────────────────────────────────────────
    await page.getByTestId('issue-quantity').fill('15');
    await page.getByTestId('issue-return').click();
    await expect(page.getByTestId('issue-position')).toContainText('Nothing is currently issued', { timeout: 30_000 });
  });
});
