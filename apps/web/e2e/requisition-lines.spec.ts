import { expect, test } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * BUY-01 / J3-05 — a material requisition, on a screen, with auth on.
 *
 * The screen this replaces offered three fields — a title, a value and a project — and printed the
 * money as `$` while the company's own record says AED. Between them they made a requisition
 * unusable as a procurement instruction: a buyer could not tell WHAT was wanted, HOW MUCH of it, in
 * WHAT UNIT or BY WHEN, and the only number on the page was in the wrong currency.
 *
 * What the screen has to carry now, and what this proves it does:
 *
 *   · the materials themselves, each naming a catalogue material with its own unit;
 *   · a quantity that always travels with that unit, never one typed beside it;
 *   · the company's currency, on every figure;
 *   · and — the one that matters most — a requisition with an unpriced line showing NO value.
 *     Not zero. Not the partial sum dressed up as a total. The partial figure is shown and
 *     labelled, because the value decides who may approve the requisition, and a total that
 *     quietly omits a line buys a less senior approver.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

interface Material { id: string; code: string }

test.describe('A requisition says what is needed, how much, and by when', () => {
  test.setTimeout(240_000);

  test('names materials in their own units, and refuses to call a partial sum the value', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };
    const post = async <T>(path: string, data: unknown): Promise<T> => {
      const response = await request.post(`${API}${path}`, { headers, data });
      expect(response.ok(), `${path} — ${await response.text()}`).toBe(true);
      return response.json() as Promise<T>;
    };

    const project = await post<{ id: string }>('/projects/projects', { title: `Requisition job ${run}` });
    // Two materials counted DIFFERENTLY — cameras in `nr`, cable in `m`. One unit for both would
    // prove nothing about whether the unit follows the material.
    const camera = await post<Material>('/inventory/materials', {
      code: `CAM-${run}`, name: '4MP dome camera', uom: 'nr',
      specification: 'IP67, 2.8mm fixed lens', manufacturer: 'Hikvision', model: 'DS-2CD2143G2-I',
    });
    const cable = await post<Material>('/inventory/materials', {
      code: `CBL-${run}`, name: 'Cat6 U/UTP cable', uom: 'm',
    });

    const pr = await post<{ id: string }>('/procurement/purchase-requests', {
      title: `Level 3 containment ${run}`, projectId: project.id, value: 0,
    });

    await page.goto(`/procurement/purchase-requests?projectId=${project.id}`, { waitUntil: 'domcontentloaded' });

    // ── The requisition has no materials yet, and says so ──────────────────────
    await page.getByTestId(`pr-materials-toggle-${pr.id}`).click();
    const panel = page.getByTestId(`req-lines-${pr.id}`);
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('req-lines-empty')).toContainText('at least one line before it can be submitted');

    // ── Author a priced line, from the catalogue ───────────────────────────────
    await page.getByTestId('req-line-material').selectOption(camera.id);
    // The unit appears from the MATERIAL the moment it is chosen — it is never typed.
    await expect(page.getByTestId('req-line-uom')).toHaveText('nr');
    await page.getByTestId('req-line-quantity').fill('12');
    await page.getByTestId('req-line-cost').fill('450');
    await page.getByTestId('req-line-needby').fill('2026-11-01');
    await page.getByTestId('req-line-add').click();

    const first = page.getByTestId('req-line-1');
    await expect(first).toContainText(camera.code);
    await expect(first).toContainText('Hikvision');
    // Quantity and unit together, and the money in the company's currency rather than `$`.
    await expect(page.getByTestId('req-line-qty-1')).toHaveText('12 nr');
    await expect(page.getByTestId('req-line-cost-1')).toContainText('AED');
    await expect(page.getByTestId('req-lines-value')).toContainText('AED 5,400.00');

    // ── A second material, counted in metres, left UNPRICED ────────────────────
    await page.getByTestId('req-line-material').selectOption(cable.id);
    await expect(page.getByTestId('req-line-uom')).toHaveText('m');
    await page.getByTestId('req-line-quantity').fill('250');
    await page.getByTestId('req-line-add').click();

    await expect(page.getByTestId('req-line-qty-2')).toHaveText('250 m');
    await expect(page.getByTestId('req-line-cost-2')).toContainText('not priced');

    // ── AN UNPRICED LINE LEAVES THE REQUISITION WITH NO VALUE ──────────────────
    // The screen still shows what HAS been priced, labelled "so far", and says outright that the
    // requisition has no value yet. It must not print AED 5,400 as though that were the total.
    await expect(page.getByTestId('req-lines-value')).toContainText('so far');
    await expect(page.getByTestId('req-lines-incomplete')).toContainText('1 of 2 lines are not priced');
    await expect(page.getByTestId('req-lines-incomplete')).toContainText('no value yet');
    // …and it names the line that has to be fixed, because "incomplete" alone is not actionable.
    await expect(page.getByTestId('req-lines-blocked')).toContainText('line 2');

    // ── Pricing it completes the requisition ───────────────────────────────────
    await page.getByTestId('req-line-remove-2').click();
    await expect(page.getByTestId('req-line-2')).toHaveCount(0);
    await page.getByTestId('req-line-material').selectOption(cable.id);
    await page.getByTestId('req-line-quantity').fill('250');
    await page.getByTestId('req-line-cost').fill('4');
    await page.getByTestId('req-line-add').click();

    await expect(page.getByTestId('req-lines-value')).toHaveText('AED 6,400.00');
    await expect(page.getByTestId('req-lines-incomplete')).toHaveCount(0);
    await expect(page.getByTestId('req-lines-blocked')).toHaveCount(0);

    // ── The screen refuses what the server refuses ─────────────────────────────
    await page.getByTestId('req-line-material').selectOption(camera.id);
    await page.getByTestId('req-line-quantity').fill('0');
    await page.getByTestId('req-line-add').click();
    await expect(page.getByTestId('req-lines-refusal')).toContainText('greater than zero');

    // ── Survives a reload: derived from the record, not from the clicks ────────
    await page.reload({ waitUntil: 'domcontentloaded' });

    // ONE REQUISITION, ONE TOTAL. The row's own Value column is the sum of the lines, not the
    // header figure authored before they existed — there must not be two totals on one screen
    // that disagree with each other.
    await expect(page.getByTestId(`pr-value-${pr.id}`)).toHaveText('AED 6,400');

    await page.getByTestId(`pr-materials-toggle-${pr.id}`).click();
    await expect(page.getByTestId('req-line-qty-1')).toHaveText('12 nr');
    await expect(page.getByTestId('req-line-qty-2')).toHaveText('250 m');
    await expect(page.getByTestId('req-lines-value')).toHaveText('AED 6,400.00');
  });
});
