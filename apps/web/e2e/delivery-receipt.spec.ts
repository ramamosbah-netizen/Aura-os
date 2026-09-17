import { expect, test, type Page } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * `BUY-07` on screen — the next-role receipt.
 *
 * The Storekeeper has already issued the material and the movement is persisted. This is the other
 * half of the handoff: somebody at Site accepts receipt of it.
 *
 * The property the browser has to show, because it is the one a reviewer would assume rather than
 * check: ACCEPTING RECEIPT DOES NOT CHANGE WHAT WAS DELIVERED. The quantity is read before and after
 * and must be identical. A receipt that moved it would be a second writer of a number that already
 * has an authority.
 *
 * And where nobody holds site-execution responsibility for the package, the screen REFUSES in the
 * server's own words rather than quietly accepting — no falling back to whoever happens to be
 * signed in.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

async function openItem(page: Page, code: string): Promise<void> {
  await expect(async () => {
    await page.getByTestId(`stock-row-${code}`).click();
    await expect(page.getByTestId('issue-project')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

test.describe('Site acknowledges a delivery at a work package', () => {
  test.setTimeout(240_000);

  test('refuses while nobody is responsible, then records a receipt that leaves the delivery untouched', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };
    const post = async <T>(path: string, data: unknown): Promise<T> => {
      const response = await request.post(`${API}${path}`, { headers, data });
      expect(response.ok(), `${path} — ${await response.text()}`).toBe(true);
      return response.json() as Promise<T>;
    };

    const project = await post<{ id: string; title: string }>('/projects/projects', { title: `Receipt job ${run}` });
    const wbs = await post<{ id: string; code: string; title: string }>('/projects/wbs', {
      projectId: project.id, code: `3.1-${run}`, title: 'Riser mains',
    });
    const code = `RCP-${run}`;
    await post('/inventory/stock', { code, name: '4mm² cable', unit: 'm', openingQty: 200, openingCost: 6 });

    await page.goto('/inventory/stock', { waitUntil: 'domcontentloaded' });
    await openItem(page, code);

    // ── Issue 40 m to the work package, from the screen ───────────────────────
    await page.getByTestId('issue-project').selectOption({ label: project.title });
    await page.getByTestId('issue-work-package').selectOption(wbs.id);
    await page.getByTestId('issue-quantity').fill('40');
    await page.getByTestId('issue-out').click();
    await expect(page.getByTestId('issue-delivered')).toContainText('40 m delivered to this work package', { timeout: 30_000 });

    // The receipt control appears against the issue, because it declared a destination.
    // Targeted by its accessible name: the panel beside it polls an eventually-consistent position,
    // so the row re-renders and a locator bound to a detached element never becomes clickable.
    const acknowledge = () => page.getByRole('button', { name: 'Acknowledge' }).first();
    await expect(acknowledge()).toBeVisible({ timeout: 30_000 });

    // ── NOBODY IS RESPONSIBLE YET, SO IT REFUSES ──────────────────────────────
    // Not a generic failure: the message names what is missing and what to do about it.
    const error = page.locator('[data-testid^="receipt-error-"]').first();
    await expect(async () => {
      await acknowledge().click({ timeout: 5_000 });
      await expect(error).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 60_000 });
    await expect(error).toContainText('site-execution responsibility', { timeout: 30_000 });
    await expect(error).toContainText('assign the responsibility');
    // …and the delivery is untouched by a refused receipt.
    await expect(page.getByTestId('issue-delivered')).toContainText('40 m delivered to this work package');

    // ── Give the package an owner, then accept ────────────────────────────────
    // Membership first: operational ownership is only assignable to somebody on the project, which
    // is the responsibility service's own rule and not something this slice relaxes.
    const me = process.env.E2E_USERNAME ?? 'u-admin';
    await post(`/projects/${project.id}/members`, { userId: me, roleId: 'r-site-engineer' });
    await post(`/projects/${project.id}/responsibilities`, {
      workstream: 'site_execution',
      wbsNodeId: wbs.id,
      title: `Site execution — riser mains ${run}`,
      assigneeId: me,
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await openItem(page, code);
    await expect(acknowledge()).toBeVisible({ timeout: 30_000 });

    /**
     * NOW THE PACKAGE HAS AN OWNER — AND THE RECEIPT IS STILL REFUSED, FOR A DIFFERENT REASON.
     *
     * The browser identity issued this material a moment ago, and it is now also the assignee. That
     * makes this the maker/checker case, and it is deterministic rather than incidental: a receipt
     * the issuer signs records somebody agreeing with themselves. The refusal MOVING from "nobody
     * holds the responsibility" to "you cannot acknowledge what you issued" is the proof that the
     * first refusal was about authority and not a blanket denial.
     */
    await expect(async () => {
      await acknowledge().click({ timeout: 5_000 });
      await expect(error).toBeVisible({ timeout: 5_000 });
      await expect(error).toContainText(/cannot also acknowledge/i, { timeout: 5_000 });
    }).toPass({ timeout: 60_000 });

    // ── THE DELIVERY IS UNCHANGED THROUGHOUT ──────────────────────────────────
    // The assertion the whole slice turns on: a receipt records who accepted, never how much, and a
    // REFUSED receipt moves nothing at all.
    await page.getByTestId('issue-project').selectOption({ label: project.title });
    await page.getByTestId('issue-work-package').selectOption(wbs.id);
    await expect(page.getByTestId('issue-delivered')).toContainText('40 m delivered to this work package', { timeout: 30_000 });
  });
});
