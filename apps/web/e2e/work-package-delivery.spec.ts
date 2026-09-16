import { expect, test, type Page } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * `BUY-07` on screen — material delivered to a work package.
 *
 * The storekeeper could issue to a project and a BOQ item (`BUY-06`) but could never say which WORK
 * PACKAGE the material was going to. Procurement knew: a requisition line and a purchase order line
 * both carry `wbs_node_id`. Inventory did not — the word appeared nowhere in the module — so the
 * coding was captured when the material was requested and lost the moment it physically moved.
 *
 * THE INVARIANT THIS PROVES, and the reason the scene has two packages on one BOQ item:
 *
 *   An issue counted as delivered to a work package must NAME it. Absence is UNKNOWN — never zero,
 *   and never inferred from the BOQ item. Two packages measuring the same item is where a resolver
 *   that guessed would report the same material as delivered to both.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

async function openItem(page: Page, code: string): Promise<void> {
  await expect(async () => {
    await page.getByTestId(`stock-row-${code}`).click();
    await expect(page.getByTestId('issue-project')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

test.describe('Material delivered to a work package', () => {
  test.setTimeout(240_000);

  test('names the destination, credits only the package that was named, and reports the unattributed separately', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };
    const post = async <T>(path: string, data: unknown): Promise<T> => {
      const response = await request.post(`${API}${path}`, { headers, data });
      expect(response.ok(), `${path} — ${await response.text()}`).toBe(true);
      return response.json() as Promise<T>;
    };

    const project = await post<{ id: string; title: string }>('/projects/projects', { title: `Riser job ${run}` });
    const boqItemId = `boq-wpui-${run}`;
    await post('/projects/quantity-ledger/baseline', { projectId: project.id, boqItemId, quantity: 1000, unit: 'm' });

    // TWO packages measuring the SAME BOQ item — the trap.
    const riser = await post<{ id: string; code: string; title: string }>('/projects/wbs', {
      projectId: project.id, code: `1.1-${run}`, title: 'Riser mains', boqItemId,
    });
    await post('/projects/wbs', {
      projectId: project.id, code: `1.2-${run}`, title: 'Floor distribution', boqItemId,
    });

    const code = `WPU-${run}`;
    await post('/inventory/stock', { code, name: '4mm² cable', unit: 'm', openingQty: 300, openingCost: 6 });

    await page.goto('/inventory/stock', { waitUntil: 'domcontentloaded' });
    await openItem(page, code);

    // ── A destination can be chosen, and is optional ──────────────────────────
    await page.getByTestId('issue-project').selectOption({ label: project.title });
    await expect(page.getByTestId('issue-work-package')).toBeEnabled();
    // Nothing chosen yet: the screen says what that will mean rather than leaving it implicit.
    await expect(page.getByTestId('issue-delivered')).toContainText('No work package chosen');

    await page.getByTestId('issue-boq-item').selectOption(boqItemId);
    await page.getByTestId('issue-work-package').selectOption(riser.id);
    await expect(page.getByTestId('issue-delivered')).toContainText('Nothing has been delivered to this work package yet');

    // ── Issue 40 m to the riser ───────────────────────────────────────────────
    await page.getByTestId('issue-quantity').fill('40');
    await page.getByTestId('issue-out').click();
    await expect(page.getByTestId('issue-delivered')).toContainText('40 m delivered to this work package', { timeout: 30_000 });

    // ── THE OTHER PACKAGE ON THE SAME BOQ ITEM GETS NOTHING ───────────────────
    // A destination resolved from the BOQ item would show 40 here too, and the project would appear
    // to have delivered 80 m of the 40 that actually left the store.
    await page.getByTestId('issue-work-package').selectOption({ label: `1.2-${run} · Floor distribution` });
    await expect(page.getByTestId('issue-delivered')).toContainText('Nothing has been delivered to this work package yet');

    // ── An issue with NO destination stays valid, and is reported once ────────
    await page.getByTestId('issue-work-package').selectOption('');
    await expect(page.getByTestId('issue-delivered')).toContainText('No work package chosen');
    await page.getByTestId('issue-quantity').fill('15');
    await page.getByTestId('issue-out').click();

    // It is NOT attached to a package…
    await expect(page.getByTestId('issue-unspecified')).toContainText('work package not specified', { timeout: 30_000 });
    await expect(page.getByTestId('issue-unspecified')).toContainText('15');
    // …and the riser still reads exactly what was delivered to it.
    await page.getByTestId('issue-work-package').selectOption(riser.id);
    await expect(page.getByTestId('issue-delivered')).toContainText('40 m delivered to this work package');
  });
});
