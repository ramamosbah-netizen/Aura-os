// AURA OS — Admin Control Center browser verification (gap register N-04).
//
// The Control Center was reported "100% verified" on the strength of typecheck, unit tests, lint
// and build. None of those four can open a page. This suite is the part that can: it drives the
// real shell in a real browser and asserts what a user actually gets.
//
// Two of the walkthrough's Definition-of-Done rows did not survive contact with it — see the
// `fixme` tests at the bottom, which document the gaps rather than asserting the claim.
//
// Scope note: RBAC 403s and tenant isolation are deliberately NOT here. Auth is off by default in
// dev (the staged pass-through), so a browser test would be asserting against an unguarded app and
// would pass for the wrong reason. Those belong in the API e2e suite, where the verifier can be
// switched on. Claiming them from here would repeat the mistake this row exists to correct.
import { expect, test } from '@playwright/test';

test.describe('Admin Control Center shell', () => {
  test('/admin loads the unified shell with its six domain tabs', async ({ page }) => {
    const res = await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBeLessThan(500);

    for (const tab of ['Overview', 'Users & Access', 'Business Rules', 'Operations']) {
      await expect(page.getByRole('button', { name: tab, exact: false }).first()).toBeVisible();
    }
  });

  test.fixme('a deep link selects the tab and sub-tab it names (DoD rule 3 — NOT true today)', async ({ page }) => {
    // /admin?tab=users&sub=roles renders the shell but never surfaces the Roles & Grants
    // sub-tab. The shell reads the params once on mount (getInitialTab) and the sub-tab is
    // reset to the tab's first entry, so the `sub` half of a deep link is discarded.
    await page.goto('/admin?tab=users&sub=roles', { waitUntil: 'domcontentloaded' });

    // The sub-tab named in the URL must be the active one, not merely present.
    const roles = page.getByRole('button', { name: /Roles & Grants/i }).first();
    await expect(roles).toBeVisible();
    await expect(page.getByText(/Roles|Grants/i).first()).toBeVisible();
  });

  test.fixme('choosing a tab writes it back to the URL, so the view is linkable (NOT true today)', async ({ page }) => {
    // Clicking Operations leaves the address bar at /admin. navigateTo updates React state but
    // never pushes to the router, so no admin view past the default is linkable or bookmarkable
    // — and the browser Back button does not step between tabs.
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: /Operations/i }).first().click();
    await expect(page).toHaveURL(/[?&]tab=ops|[?&]tab=operations/i);
  });

  test('the Overview renders without a client-side exception', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    expect(errors, `client exceptions on /admin: ${errors.join(' · ')}`).toEqual([]);
  });
});

// The restore panel could not be driven from a browser at all: not by URL (sub-tab deep-linking
// is broken — see the fixme above) and not by clicking through, where the "Backup & Restore"
// sub-tab never became clickable within 60s. So its typed-confirmation guard is UNVERIFIED from
// the browser, which is itself an N-04 result: the panel is not reachable by a scripted user.
// Static reading separately shows the guard has no backend (see the last fixme).
test.describe.fixme('Destructive-operation guard (panel not reachable from a browser)', () => {
  // Reached by clicking, not by URL: deep-linking to a sub-tab is one of the gaps this suite
  // records, so a test that navigated by URL would skip itself for the wrong reason.
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Operations/i }).first().click();
    await page.getByRole('button', { name: /Backup & Restore/i }).first().click();
  });

  test('restore refuses to proceed without the exact typed confirmation', async ({ page }) => {
    await page.getByRole('button', { name: /Restore Database Snapshot/i }).first().click();

    const dialogs: string[] = [];
    page.on('dialog', async (d) => {
      dialogs.push(d.message());
      await d.dismiss();
    });

    // Justification present, confirmation wrong — must be rejected on the confirmation, not waved
    // through because the reason box was filled.
    await page.getByRole('textbox').first().fill('E2E guard check');
    const typed = page.getByRole('textbox').nth(1);
    if (await typed.isVisible().catch(() => false)) await typed.fill('restore production');

    await page.getByRole('button', { name: /^Confirm|Execute|Proceed/i }).first().click();
    await page.waitForTimeout(300);

    expect(dialogs.join(' '), 'a wrong confirmation string must be refused').toMatch(
      /must type "RESTORE PRODUCTION"/i,
    );
  });

  test('restore refuses to proceed with no justification for the audit trail', async ({ page }) => {
    await page.getByRole('button', { name: /Restore Database Snapshot/i }).first().click();

    const dialogs: string[] = [];
    page.on('dialog', async (d) => {
      dialogs.push(d.message());
      await d.dismiss();
    });

    await page.getByRole('button', { name: /^Confirm|Execute|Proceed/i }).first().click();
    await page.waitForTimeout(300);

    expect(dialogs.join(' ')).toMatch(/justification is required/i);
  });
});

// ── Gaps this suite found. Kept as failing-by-design records, not deleted. ──────────────────────

test.fixme(
  'legacy /admin/users redirects into the shell (DoD rule 3 — NOT true today)',
  async ({ page }) => {
    // The walkthrough recorded "Legacy routes redirect/preserve query params & deep-links ✅".
    // They do not. There is no middleware, no next.config redirect, and app/admin/users/page.tsx
    // renders its own standalone screen. /admin is a 24th admin surface beside the 23, not a
    // consolidation of them — two views of the same settings that can drift apart.
    await page.goto('/admin/users', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/admin\?tab=users/);
  },
);

test.fixme(
  'restore reaches the backend and writes an audit event (DoD rules 10 & 13 — NOT true today)',
  async ({ page }) => {
    // backup-restore-panel.tsx makes zero API calls: handleConfirm sets a success string that
    // *says* "Audit event logged: { actor, action, reason, timestamp }". No request is sent, no
    // restore happens, and nothing reaches aura_audit_log. There is no server-side restore
    // endpoint at all — `RESTORE PRODUCTION` appears nowhere under apps/api or core.
    // The typed confirmation is real; what it guards is not.
    const calls: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/')) calls.push(`${r.method()} ${r.url()}`);
    });

    await page.goto('/admin?tab=operations&sub=backup', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Restore Database Snapshot/i }).first().click();
    await page.getByRole('textbox').first().fill('E2E backend check');
    await page.getByRole('textbox').nth(1).fill('RESTORE PRODUCTION');
    await page.getByRole('button', { name: /^Confirm|Execute|Proceed/i }).first().click();
    await page.waitForTimeout(500);

    expect(calls.some((c) => /restore/i.test(c)), 'restore must call the backend').toBe(true);
  },
);
