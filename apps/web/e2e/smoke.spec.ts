// AURA OS — web smoke (TIER-2 #41): the shell renders even with no API behind it.
import { expect, test } from '@playwright/test';

test('workspace shell loads with the AURA title', async ({ page }) => {
  const res = await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(res?.status()).toBeLessThan(500);
  await expect(page).toHaveTitle(/AURA OS/i);
});

test('login route is reachable', async ({ page }) => {
  const res = await page.goto('/login', { waitUntil: 'domcontentloaded' });
  expect(res?.status()).toBeLessThan(500);
});
