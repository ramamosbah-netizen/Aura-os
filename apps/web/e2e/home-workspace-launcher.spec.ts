import { expect, test } from '@playwright/test';

const WORKSPACES = {
  'my-work': '/my-work',
  'project-command-center': '/suites/project-delivery',
  business: '/suites/sales-pre-award',
  management: '/suites/intelligence-reporting',
  'aura-ai': '/ai',
  administration: '/suites/administration-governance',
} as const;

test('Home is a responsive six-workspace launcher with working destinations', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('aura-home-board')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Primary' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Where would you like to work/ })).toBeVisible();
  await expect(page.getByLabel(/Signed in as/)).toBeVisible();

  for (const [workspace, destination] of Object.entries(WORKSPACES)) {
    const card = page.getByTestId(`workspace-card-${workspace}`);
    await expect(card).toHaveAttribute('href', destination);
    await card.click();
    await expect(page).toHaveURL(destination);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  for (const workspace of Object.keys(WORKSPACES)) {
    await expect(page.getByTestId(`workspace-card-${workspace}`)).toBeVisible();
  }
});
