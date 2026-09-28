import { expect, test, type APIRequestContext } from '@playwright/test';
import { memberPassword, signInAs } from './project-member-harness';

/**
 * SEC-01 STAGE 4, WAVE G — SAVED VIEWS AND FAVOURITES ARE EVERY STAFF MEMBER'S, NOT THE ADMINISTRATOR'S.
 *
 * Until wave G the views routes derived `views.view.read/create/delete` and `views.favorite.create`,
 * which only the System Administrator's `*` reached. The favourite star is in the shell on every page,
 * so every other user saw a button that looked fine and did nothing: the read was refused (so it
 * showed "not a favourite") and the toggle was refused (so it stayed that way). Proved as a Sales user:
 *
 *   favourite   the star toggles on, survives a reload (read back from the server), and the page is
 *               listed on My Favorites; toggling off removes it
 *   save view   a named view is saved as the caller's own
 *   private     another staff member does not see it and cannot delete it
 */
const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

async function bearer(request: APIRequestContext, username: string): Promise<Record<string, string>> {
  const res = await request.post(`${API}/auth/login`, { data: { username, password: memberPassword() } });
  expect(res.ok(), `${username} must sign in`).toBe(true);
  return { Authorization: `Bearer ${((await res.json()) as { token: string }).token}` };
}

test('wave G — a Sales user favourites a page and saves a private view', async ({ browser, request, baseURL }) => {
  test.skip(!memberPassword(), 'requires the Auth-ON local API and the e2e password');
  test.setTimeout(240_000);
  const run = Date.now().toString().slice(-6);
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  expect(await signInAs(page, baseURL!, 'u-e2e-sales'), 'u-e2e-sales signs in').toBe(true);

  // ── The favourite star, on an ordinary page ────────────────────────────────────────────────────
  await page.goto('/crm/leads', { waitUntil: 'domcontentloaded' });
  const star = page.getByTestId('favorite-page');
  await expect(star).toBeEnabled({ timeout: 60_000 });
  if ((await star.getAttribute('aria-pressed')) === 'true') {
    await star.click(); // a previous run left it on — start from off
    await expect(star).toHaveAttribute('aria-pressed', 'false', { timeout: 30_000 });
  }
  await star.click();
  await expect(star, 'the favourite is accepted').toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('favorite-page'), 'read back from the server after a reload').toHaveAttribute('aria-pressed', 'true', { timeout: 60_000 });

  await page.goto('/my-work/favorites', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('my-favorites-page')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('region', { name: 'My favorite pages' }).getByText('/crm/leads', { exact: true })).toBeVisible();

  await page.goto('/crm/leads', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('favorite-page')).toHaveAttribute('aria-pressed', 'true', { timeout: 60_000 });
  await page.getByTestId('favorite-page').click();
  await expect(page.getByTestId('favorite-page'), 'and it toggles off').toHaveAttribute('aria-pressed', 'false', { timeout: 30_000 });

  // ── A saved view is the caller's own ───────────────────────────────────────────────────────────
  const sales = await bearer(request, 'u-e2e-sales');
  const saved = await request.post(`${API}/views`, { headers: sales, data: { label: `My hot leads ${run}`, path: '/crm/leads', query: '?status=hot' } });
  expect(saved.status(), await saved.text()).toBe(201);
  const view = (await saved.json()) as { id: string; userId: string | null };
  expect(view.userId, 'saved as the caller’s own view').toBe('u-e2e-sales');
  const mine = (await (await request.get(`${API}/views?path=/crm/leads`, { headers: sales })).json()) as Array<{ id: string }>;
  expect(mine.map((v) => v.id)).toContain(view.id);

  // ── Another staff member neither sees it nor can delete it ─────────────────────────────────────
  const other = await bearer(request, 'u-e2e-salesmgr');
  const theirs = await request.get(`${API}/views?path=/crm/leads`, { headers: other });
  expect(theirs.ok(), 'a staff member may list views').toBe(true);
  expect(((await theirs.json()) as Array<{ id: string }>).map((v) => v.id), 'a colleague’s private view is never returned').not.toContain(view.id);
  await request.delete(`${API}/views/${view.id}`, { headers: other });
  const still = (await (await request.get(`${API}/views?path=/crm/leads`, { headers: sales })).json()) as Array<{ id: string }>;
  expect(still.map((v) => v.id), 'only the owner may delete it').toContain(view.id);

  expect((await request.delete(`${API}/views/${view.id}`, { headers: sales })).ok(), 'the owner deletes it').toBe(true);
  await context.close();
});
