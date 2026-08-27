import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Accessibility must be testable without a pre-existing session. The login page is the one screen
// every user, including a locked-out or first-time user, must be able to operate independently.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('WCAG 2.1 AA — login', () => {
  test('has no automatically detectable A/AA violations', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('login-username')).toBeEnabled();

    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(
      scan.violations,
      scan.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} node(s))`).join('\n'),
    ).toEqual([]);
  });

  test('keeps the credential workflow in a logical keyboard order', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    const username = page.getByTestId('login-username');
    const password = page.getByTestId('login-password');
    const submit = page.getByTestId('login-submit');
    await expect(username).toBeEnabled();

    await username.focus();
    await expect(username).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(password).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(submit).toBeFocused();
  });
});
