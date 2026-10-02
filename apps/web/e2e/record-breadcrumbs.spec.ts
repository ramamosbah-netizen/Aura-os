// AURA OS — record pages say where they are.
//
// The topbar trail is derived from the navigation: the nav item whose path is the longest prefix of
// the page's own path. Measured 2026-10-02, 58 page routes matched no item and showed no trail at
// all — every opportunity record among them, because the Opportunities item links
// `/crm/pipeline?view=board` and a pathname never carries a query, so it matched nothing, not even
// its own board. Records reached from an item (an opportunity's 360, an account's, a project's
// workspace) now sit under it; components/nav.test.ts holds the route-by-route fitness.
import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

async function post<T>(request: APIRequestContext, path: string, data: unknown): Promise<T> {
  const res = await request.post(`${API}${path}`, { headers: { 'content-type': 'application/json', ...apiAuthHeaders() }, data });
  expect(res.ok(), `${path} — ${await res.text()}`).toBe(true);
  return res.json() as Promise<T>;
}

test('an opportunity, an account and a project page each carry a trail back to where they belong', async ({ page, request }) => {
  test.setTimeout(180_000);
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  const run = Date.now().toString().slice(-6);
  const opportunity = await post<{ id: string; title: string }>(request, '/crm/opportunities', { title: `Trail probe ${run}`, value: 10_000 });
  const account = await post<{ id: string; name: string }>(request, '/crm/accounts', { name: `Trail account ${run}` });
  const project = await post<{ id: string }>(request, '/projects/projects', { title: `Trail project ${run}`, reference: `TRL-${run}` });
  const trail = page.getByRole('navigation', { name: 'Breadcrumb' });

  // ── The opportunity: Sales & Commercial › Opportunities › its own title ───────────────────────
  await page.goto(`/crm/opportunities/${opportunity.id}`, { waitUntil: 'domcontentloaded' });
  await expect(trail).toContainText(`Trail probe ${run}`, { timeout: 60_000 });
  await expect(trail.locator(':scope > span')).toHaveCount(3);
  await expect(trail.locator(':scope > span').nth(0)).toHaveText('Sales & Commercial');
  const item = trail.getByRole('link', { name: 'Opportunities', exact: true });
  await expect(item).toHaveAttribute('href', '/crm/pipeline?view=board');
  // Present is not enough: at a 1280px window the trail was squeezed to "Sales &" and the rest sat
  // in the DOM, clipped to nothing. Every level must be on screen (the record may be ellipsised).
  for (let level = 0; level < 3; level += 1) {
    const box = await trail.locator(':scope > span > :last-child').nth(level).boundingBox();
    expect(box?.width ?? 0, `crumb ${level + 1} is on screen`).toBeGreaterThan(24);
  }
  await expect(item).toBeVisible();
  // The crumb is a way back, not a label: it opens the board the item names.
  await item.click();
  await expect(page).toHaveURL(/\/crm\/pipeline\?view=board$/, { timeout: 60_000 });
  // …where the item is the page itself, so it is no longer a link and no record is appended.
  await expect(trail.locator(':scope > span')).toHaveCount(2, { timeout: 60_000 });
  await expect(trail.getByRole('link', { name: 'Opportunities', exact: true })).toHaveCount(0);

  // ── The account: Sales & Commercial › Customers › its name ─────────────────────────────────────
  await page.goto(`/crm/accounts/${account.id}`, { waitUntil: 'domcontentloaded' });
  await expect(trail).toContainText(`Trail account ${run}`, { timeout: 60_000 });
  await expect(trail.getByRole('link', { name: 'Customers', exact: true })).toHaveAttribute('href', '/crm/customers');

  // ── A project's workspace: Projects › Projects ─────────────────────────────────────────────────
  await page.goto(`/project/${project.id}`, { waitUntil: 'domcontentloaded' });
  await expect(trail.getByRole('link', { name: 'Projects', exact: true }).last()).toHaveAttribute('href', '/projects/projects', { timeout: 60_000 });
  await expect(trail.locator(':scope > span').nth(0)).toHaveText('Projects');
});
