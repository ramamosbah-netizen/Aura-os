import { expect, test } from '@playwright/test';

/**
 * Onboarding, end to end, in the product.
 *
 * Registering someone never let them in: sign-in needs a credential, and nothing in the app could
 * create one — the only path was a dev-only environment variable, so an invited user was stuck and
 * the directory said "active" while they could not sign in at all. This drives the whole journey
 * an administrator actually performs, and then signs in AS the new person to prove it worked.
 */
const HANDOVER = 'handover-secret-9271';
const CHOSEN = 'the-users-own-secret-4417';

test('an administrator can onboard a user who then signs in and chooses their own password', async ({ page, browser }) => {
  const userId = `u-onboarded-${Date.now().toString().slice(-6)}`;

  await page.goto('/admin/users', { waitUntil: 'domcontentloaded' });

  // 1. Register the account.
  await page.getByTestId('new-user-id').fill(userId);
  await page.getByTestId('new-user-name').fill('Onboarded Person');
  await page.getByTestId('new-user-register').click();

  // 2. It is registered and CANNOT sign in — the state that used to be invisible.
  const signIn = page.getByTestId(`user-signin-${userId}`);
  await expect(signIn).toContainText('no password');

  // 3. Hand over a password.
  await page.getByTestId(`user-set-password-${userId}`).click();
  await page.getByTestId(`user-password-input-${userId}`).fill(HANDOVER);
  await page.getByTestId(`user-password-save-${userId}`).click();
  await expect(signIn).toContainText('must change');

  // 4. That person signs in. The handover password is not their password: it gets them exactly
  //    one step, and the session only exists after they choose their own.
  const theirs = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const theirPage = await theirs.newPage();
  await theirPage.goto('/login', { waitUntil: 'domcontentloaded' });
  await theirPage.getByTestId('login-username').fill(userId);
  await theirPage.getByTestId('login-password').fill(HANDOVER);
  await theirPage.getByTestId('login-submit').click();

  await expect(theirPage.getByTestId('login-new-password')).toBeVisible();
  await expect(theirPage.getByText('set by an administrator')).toBeVisible();

  // A mismatch is caught before anything is sent.
  await theirPage.getByTestId('login-new-password').fill(CHOSEN);
  await theirPage.getByTestId('login-confirm-password').fill(`${CHOSEN}-typo`);
  await theirPage.getByTestId('login-submit').click();
  await expect(theirPage.getByTestId('login-error')).toContainText('do not match');

  await theirPage.getByTestId('login-confirm-password').fill(CHOSEN);
  await theirPage.getByTestId('login-submit').click();

  // 5. They are in — not bounced back to /login, which is what happened before this existed.
  await expect(theirPage).toHaveURL(/^(?!.*\/login).*$/);
  await expect(theirPage.getByTestId('login-username')).toHaveCount(0);

  // 6. The handover password is spent, and the one they chose works.
  const stale = await theirPage.request.post('/api/auth/login', { data: { username: userId, password: HANDOVER } });
  expect(stale.ok()).toBe(false);
  const fresh = await theirPage.request.post('/api/auth/login', { data: { username: userId, password: CHOSEN } });
  expect(fresh.ok()).toBe(true);
  expect(await fresh.json()).not.toHaveProperty('challenge');
  await theirs.close();

  // 7. And the directory now says so.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId(`user-signin-${userId}`)).toContainText('can sign in');
});
