// AURA OS — what /admin actually is (gap register N-04).
//
// The walkthrough recorded "/admin functions as Unified Control Center" and "No fragmented admin
// UIs for normal business admins" as verified. Measured against the tree, neither holds:
//
//   ZERO of the 23 panels fetch any data — not one `fetch`, `getJson` or `useEffect`.
//   18 of 23 render a paragraph and a link to the legacy screen they were said to replace.
//
// So /admin is a **directory** over the 23 admin screens, not a consolidation of them. That is a
// perfectly reasonable thing to be, and it is genuinely useful — but it is not what was claimed,
// and the difference matters for the legacy-redirect question below.
//
// These tests pin the current shape. If someone later builds the panels for real, they will fail,
// and that failure is the signal to update the register rather than a bug.
import { expect, test } from '@playwright/test';

test.describe('what /admin is today', () => {
  test('the Control Center is reachable and lists its domains', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /Users & Access/i }).first()).toBeVisible({
      timeout: 45_000,
    });
  });

  test('the Users panel signposts the legacy screen rather than managing users itself', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    const users = page.getByRole('button', { name: /Users & Access/i }).first();
    await users.waitFor({ state: 'visible', timeout: 45_000 });
    await users.click();

    // The panel's whole function: a link out. There is no directory, no register/invite, no
    // deactivate — those live on /admin/users, which is why it must NOT be redirected away.
    const out = page.getByRole('link', { name: /Open Full User Manager/i }).first();
    await expect(out).toBeVisible({ timeout: 30_000 });
    await expect(out).toHaveAttribute('href', '/admin/users');
  });

  test('the legacy screen it points at is the one that actually manages users', async ({ page }) => {
    // Following the Control Center's own link must land on a working screen. If a redirect were
    // ever added from /admin/users back into the shell, this journey would loop and the only
    // functioning user management in the product would become unreachable.
    await page.goto('/admin/users', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/admin\/users$/);

    // Something interactive, not just prose — this is the screen with the real capability.
    await expect(page.locator('input, button, table').first()).toBeVisible({ timeout: 45_000 });
  });
});

test.describe('destructive operations tell the truth about themselves', () => {
  test('the backup/restore panel says plainly that it is not wired', async ({ page }) => {
    // It used to report "✅ Database Restore executed successfully. Audit event logged: {…}"
    // while making zero API calls. A UI that claims an audit entry it never wrote is worse than
    // one that does nothing, because an operator will believe the record exists.
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    const ops = page.getByRole('button', { name: /Operations/i }).first();
    await ops.waitFor({ state: 'visible', timeout: 45_000 });
    await ops.click();
    const backup = page.getByRole('button', { name: /Backup & Restore/i }).first();
    await backup.waitFor({ state: 'visible', timeout: 30_000 });
    await backup.click();

    await expect(page.getByText(/Not wired yet/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/nothing executes and nothing is written/i).first()).toBeVisible();
  });

  test('completing the guard reports refusal, never success', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    const ops = page.getByRole('button', { name: /Operations/i }).first();
    await ops.waitFor({ state: 'visible', timeout: 45_000 });
    await ops.click();
    await page.getByRole('button', { name: /Backup & Restore/i }).first().click();
    await page.getByRole('button', { name: /Restore Database$/i }).first().click();

    await page.getByPlaceholder(/Scheduled pre-maintenance/i).fill('E2E honesty check');
    await page.getByPlaceholder('RESTORE PRODUCTION').fill('RESTORE PRODUCTION');

    const calls: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/')) calls.push(r.url());
    });

    await page.getByRole('button', { name: /RESTORE DATABASE/ }).last().click();

    await expect(page.getByText(/is not available/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/no audit entry was written/i).first()).toBeVisible();
    // And it must not claim to have executed anything.
    await expect(page.getByText(/executed successfully/i)).toHaveCount(0);
    expect(calls.filter((c) => /restore|backup/i.test(c)), 'still no backend behind it').toHaveLength(0);
  });
});
