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
 *
 * THE SECOND TEST IS THE ACTUAL HANDOFF, and it needs TWO REAL PEOPLE — a Storekeeper who issues and
 * a Site Engineer who receives, each signed in as themselves, each holding a role AURA already ships.
 * A receipt is only a next-role receipt if somebody else sent the material.
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
     * the issuer signs records somebody agreeing with themselves.
     *
     * The refusal MOVING from "nobody holds the responsibility" to "you cannot acknowledge what you
     * issued" is strong evidence that a different authority path became reachable — it is not, on its
     * own, proof that the denials are correct. The explicit denial matrix in
     * `apps/api/test/delivery-acknowledgement.e2e-spec.ts` is what establishes that, case by case and
     * status by status; this observation does not stand in for it.
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

  /**
   * THE HANDOFF, WITH TWO REAL PEOPLE, ENTIRELY THROUGH THE PRODUCT SURFACE.
   *
   * This is the clause the capability exists for, and one principal cannot prove it: somebody signing
   * for their own delivery demonstrates that a button works, not that work reached the next role. So
   * both actors sign in for themselves, each holding a role AURA already ships, unmodified:
   *
   *   u-e2e-storekeeper   r-store          `inventory.*` — issues the material
   *   u-e2e-site          r-site-engineer  `inventory.*.read` — CANNOT write inventory, and accepts
   *                                        the delivery by discharging the responsibility it holds
   *
   * The site engineer's READ-ONLY inventory rights are the point rather than an inconvenience. If
   * accepting a delivery needed an inventory write, the next role could not do it at all, and the
   * only way to make this pass would be to widen a shipped role to suit a test — changing
   * authorization to fit a fixture, which is exactly backwards. It is governed instead by
   * `projects.responsibility.update`: accepting material at your work package is discharging the
   * responsibility you hold, and the domain then narrows it to the one person named for it.
   */
  test('a Storekeeper issues and a Site Engineer receives it, each signed in as themselves', async ({ browser, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const password = process.env.E2E_PASSWORD ?? 'e2e-password';
    const STOREKEEPER = process.env.E2E_STOREKEEPER_USERNAME ?? 'u-e2e-storekeeper';
    const SITE = process.env.E2E_SITE_USERNAME ?? 'u-e2e-site';

    const post = async <T>(path: string, data: unknown): Promise<T> => {
      const response = await request.post(`${API}${path}`, {
        headers: { 'content-type': 'application/json', ...apiAuthHeaders() }, data,
      });
      expect(response.ok(), `${path} — ${await response.text()}`).toBe(true);
      return response.json() as Promise<T>;
    };

    // ── The job, the work package, and WHO IS RESPONSIBLE FOR IT ──────────────
    const project = await post<{ id: string; title: string }>('/projects/projects', { title: `Handoff ${run}` });
    const wbs = await post<{ id: string }>('/projects/wbs', {
      projectId: project.id, code: `4.1-${run}`, title: 'Riser mains',
    });
    // PROJECT SCOPE, not only tenant permission: a responsibility is assignable only to somebody on
    // the project, and the delivery is accepted by the person named for THIS package.
    await post(`/projects/${project.id}/members`, { userId: STOREKEEPER, roleId: 'r-store' });
    await post(`/projects/${project.id}/members`, { userId: SITE, roleId: 'r-site-engineer' });
    await post(`/projects/${project.id}/responsibilities`, {
      workstream: 'site_execution', wbsNodeId: wbs.id,
      title: `Site execution — riser mains ${run}`, assigneeId: SITE,
    });

    const code = `HND-${run}`;
    await post('/inventory/stock', { code, name: '4mm² cable', unit: 'm', openingQty: 200, openingCost: 6 });

    /** A browser signed in as one named person, with their own session rather than the suite's. */
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

    // ── 1. THE STOREKEEPER ISSUES THE MATERIAL ────────────────────────────────
    const store = await signIn(STOREKEEPER);
    await store.page.goto('/inventory/stock', { waitUntil: 'domcontentloaded' });
    await openItem(store.page, code);
    await store.page.getByTestId('issue-project').selectOption({ label: project.title });
    await store.page.getByTestId('issue-work-package').selectOption(wbs.id);
    await store.page.getByTestId('issue-quantity').fill('40');
    await store.page.getByTestId('issue-out').click();
    await expect(store.page.getByTestId('issue-delivered'))
      .toContainText('40 m delivered to this work package', { timeout: 30_000 });

    /**
     * ── 2. AND CANNOT SIGN FOR WHAT THEY SENT ────────────────────────────────
     *
     * The storekeeper is refused because they are NOT the person responsible for this work package
     * — which is the rule that fires first here, and the right one: the site engineer holds it.
     *
     * That is a different refusal from maker/checker, and this journey deliberately does not claim
     * to exercise it. Maker/checker only applies when the issuer IS also the named recipient, and it
     * is proved on its own in `apps/api/test/delivery-acknowledgement.e2e-spec.ts` by making the
     * storekeeper the recipient of their own issue. Conflating the two would report one rule as
     * evidence for another.
     */
    const storeAck = () => store.page.getByRole('button', { name: 'Acknowledge' }).first();
    const storeError = store.page.locator('[data-testid^="receipt-error-"]').first();
    await expect(storeAck()).toBeVisible({ timeout: 30_000 });
    await expect(async () => {
      await storeAck().click({ timeout: 5_000 });
      await expect(storeError).toContainText(/only the person responsible/i, { timeout: 5_000 });
    }).toPass({ timeout: 60_000 });

    // ── 3. THE SITE ENGINEER SEES IT AND ACCEPTS IT ───────────────────────────
    const site = await signIn(SITE);
    await site.page.goto('/inventory/stock', { waitUntil: 'domcontentloaded' });
    await openItem(site.page, code);
    const siteAck = () => site.page.getByRole('button', { name: 'Acknowledge' }).first();
    await expect(siteAck()).toBeVisible({ timeout: 30_000 });

    const accepted = site.page.locator('[data-testid^="receipt-done-"]').first();
    await expect(async () => {
      await siteAck().click({ timeout: 5_000 });
      await expect(accepted).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 60_000 });

    // ── 4. IT SURVIVES A RELOAD, because the receipt is the server's ──────────
    await site.page.reload({ waitUntil: 'domcontentloaded' });
    await openItem(site.page, code);
    await expect(site.page.locator('[data-testid^="receipt-done-"]').first())
      .toBeVisible({ timeout: 30_000 });

    // ── 5. THE DELIVERY IS UNCHANGED BY BEING RECEIPTED ───────────────────────
    await site.page.getByTestId('issue-project').selectOption({ label: project.title });
    await site.page.getByTestId('issue-work-package').selectOption(wbs.id);
    await expect(site.page.getByTestId('issue-delivered'))
      .toContainText('40 m delivered to this work package', { timeout: 30_000 });

    // ── 6. AND THE SERVER AGREES THE HANDOFF HAPPENED ─────────────────────────
    const coverage = await request.get(`${API}/inventory/stock/acknowledgement-coverage`, {
      headers: apiAuthHeaders(), params: { projectId: project.id, wbs: wbs.id },
    });
    expect(coverage.ok(), await coverage.text()).toBe(true);
    expect(await coverage.json()).toMatchObject({ deliveries: 1, acknowledged: 1, outstanding: 0 });

    /**
     * ── 7. TWO DIFFERENT PEOPLE ARE ON THE RECORD ────────────────────────────
     *
     * Read back from the EVENT SPINE rather than inferred from the two sessions passing. This is the
     * whole claim of a next-role receipt: the person who sent the material and the person who
     * accepted it are not the same person, and the system can still say so afterwards.
     */
    const spine = await request.get(`${API}/events`, {
      headers: apiAuthHeaders(), params: { type: 'inventory.delivery.acknowledged' },
    });
    expect(spine.ok(), await spine.text()).toBe(true);
    const events = (await spine.json()) as Array<{ payload: Record<string, unknown> }>;
    const handoff = events.find((e) => e.payload?.wbsNodeId === wbs.id);
    expect(handoff, 'the handoff never reached the event spine').toBeDefined();
    expect(handoff!.payload.issuedBy).toBe(STOREKEEPER);
    expect(handoff!.payload.acknowledgedBy).toBe(SITE);
    expect(handoff!.payload.issuedBy).not.toBe(handoff!.payload.acknowledgedBy);

    await store.context.close();
    await site.context.close();
  });
});
