import { expect, test } from '@playwright/test';

// The Home launcher is DERIVED from the AURA_SUITES taxonomy (same source as the sidebar): the two
// work centers, the nine business suites (Sales first among them), and the Admin Center — each card
// opens that suite's Home. A subset is asserted here; the full set is generated, so this only pins
// the destinations that matter most.
const WORKSPACES = {
  'my-work': '/my-work',
  communication: '/my-work/communication',
  sales: '/crm/overview',
  'pre-award': '/tendering',
  'project-delivery': '/projects/dashboard',
  finance: '/finance',
  'administration-governance': '/admin',
} as const;

test('Home is a responsive suite launcher with working destinations (incl. Sales)', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('aura-home-board')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Primary' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Where would you like to work/ })).toBeVisible();
  await expect(page.getByLabel(/Signed in as/)).toBeVisible();
  await expect(page.getByTestId('home-communication-unread')).toHaveAttribute('href', '/my-work/communication?view=unread');

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
