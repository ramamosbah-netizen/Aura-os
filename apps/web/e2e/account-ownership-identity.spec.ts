// AURA OS — "me" on the account screens is the signed-in person, for every role — not only admin.
//
// Account 360 and the account portfolio derived "me" from GET /workspace/me, which requires
// `workspace.me.read` — a permission no shipped role holds. Measured 2026-09-30 against the Auth-ON
// API: 403 for u-e2e-sales and u-e2e-salesmgr alike. So for every real role "me" was nobody, and
// "Assign to me" never appeared. The code said the session `sub` could not be used because it "need
// not equal the username" — also measured: the token's `sub` IS the username, and it is exactly what
// an account stores as `ownerId` (the API writes `ctx.actorId`, which is the `sub`).
//
// The fix reads identity where the API does — the session — and grants nothing. Whether a manager
// should be able to LIST the team (its picker) is `workspace.users.read`, a permission-catalogue
// decision left to the owner.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { memberPassword, signInAs } from './project-member-harness';
import { provisionedActorsUnavailable } from './provisioned-actors';

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const RUN = Date.now().toString().slice(-6);

async function seat(browser: Browser, baseURL: string, username: string): Promise<Page> {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  expect(await signInAs(page, baseURL, username), `${username} could not sign in`).toBe(true);
  return page;
}

test('a Sales rep sees "Assign to me" on an account, takes it, and finds it under My Accounts', async ({ browser, baseURL, request }) => {
  test.setTimeout(180_000);
  test.skip(!apiAuthHeaders().Authorization, 'auth is off — there is no signed-in person to be "me"');
  test.skip(!memberPassword(), 'needs a password to sign the Sales rep in');
  const unavailable = await provisionedActorsUnavailable(request);
  test.skip(unavailable !== null, unavailable ?? '');

  // Owned by the administrator who created it — so for the rep it is somebody else's account.
  const name = `Ownership probe ${RUN}`;
  const created = await request.post(`${API}/crm/accounts`, { headers: apiAuthHeaders(), data: { name } });
  expect(created.ok(), await created.text()).toBe(true);
  const account = (await created.json()) as { id: string; ownerId: string };
  expect(account.ownerId).not.toBe('u-e2e-sales');

  const rep = await seat(browser, baseURL!, 'u-e2e-sales');
  try {
    await rep.goto(`/crm/accounts/${account.id}`, { waitUntil: 'domcontentloaded' });
    const assign = rep.getByRole('button', { name: 'Assign to me' });
    await expect(assign, 'the rep is somebody, so the account can be theirs').toBeVisible({ timeout: 60_000 });
    await assign.click();
    await expect(rep.getByText('u-e2e-sales').first()).toBeVisible({ timeout: 30_000 });
    await expect(assign, 'once theirs, there is nothing left to assign to them').toHaveCount(0);

    // Stored as the rep's own username — the same identity the API records.
    const reread = await request.get(`${API}/crm/accounts/${account.id}`, { headers: apiAuthHeaders() });
    expect(((await reread.json()) as { ownerId: string }).ownerId).toBe('u-e2e-sales');

    // …and "My Accounts" is the rep's, with the new one in it.
    await rep.goto('/crm/accounts', { waitUntil: 'domcontentloaded' });
    await rep.getByRole('button', { name: /My Accounts/ }).first().click();
    await expect(rep.getByText(name).first()).toBeVisible({ timeout: 60_000 });
  } finally {
    await rep.context().close();
  }
});
