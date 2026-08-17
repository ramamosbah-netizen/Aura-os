import { expect, test } from '@playwright/test';

test('global shell exposes Home, My Work, Projects and permission-aware suites', async ({ page, browser }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('aura-home-board')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Where would you like to work/ })).toBeVisible();
  for (const section of ['My Work', 'Project Command Center', 'Business', 'Management', 'AURA AI', 'Administration']) {
    await expect(page.getByText(section, { exact: true })).toBeVisible();
  }
  const workspaceDestinations = {
    'my-work': '/my-work',
    'project-command-center': '/suites/project-delivery',
    business: '/suites/sales-pre-award',
    management: '/suites/intelligence-reporting',
    'aura-ai': '/ai',
    administration: '/suites/administration-governance',
  } as const;
  for (const [workspace, href] of Object.entries(workspaceDestinations)) {
    await expect(page.getByTestId(`workspace-card-${workspace}`)).toHaveAttribute('href', href);
  }
  await expect(page.getByTestId('aura-home-board').getByRole('list')).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Primary' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /sidebar/i })).toHaveCount(0);

  const myWorkCard = page.getByTestId('workspace-card-my-work');
  await myWorkCard.focus();
  await myWorkCard.press('Enter');
  await expect(page).toHaveURL('/my-work');

  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  for (const label of ['Home', 'My Work', 'Projects', 'Suites', 'Reports', 'Admin']) {
    await expect(navigation.getByRole('link', { name: label, exact: true })).toBeVisible();
  }

  const myWork = navigation.getByRole('link', { name: 'My Work', exact: true });
  await myWork.focus();
  await myWork.press('Enter');
  await expect(page).toHaveURL('/my-work');
  await expect(page.getByTestId('my-work-dashboard')).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  // exact: role-name matching is substring and case-insensitive, so a bare 'My Work' also
  // matches the "My work summary" metrics region and counts its links too.
  const myWorkTools = page.getByRole('region', { name: 'My Work', exact: true });
  await expect(myWorkTools.getByRole('link')).toHaveCount(7);
  for (const tool of ['My Day', 'Tasks', 'Approvals', 'Communication', 'Contacts', 'Files', 'Favorites']) {
    await expect(myWorkTools.getByRole('link', { name: new RegExp(`^${tool}`) })).toBeVisible();
  }

  await page.goto('/suites', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('suites-page')).toBeVisible();
  await expect(page.getByTestId('suite-launcher').getByRole('link')).toHaveCount(10);
  const delivery = page.getByRole('link', { name: /Project Delivery/ });
  await expect(delivery).not.toHaveAttribute('target', '_blank');
  await delivery.click();
  await expect(page).toHaveURL('/suites/project-delivery');
  await expect(page.getByTestId('suite-home')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Project Delivery' })).toBeVisible();
  await expect(page.getByText('Capability truth')).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('link', { name: 'Open suite' })).toHaveAttribute('href', '/projects/dashboard');

  await page.goto('/suites/workplace-collaboration', { waitUntil: 'domcontentloaded' });
  const workplaceTools = page.getByRole('region', { name: 'Workplace shortcuts' });
  for (const tool of ['My Work', 'Communications', 'Contacts', 'My Day', 'Meetings & MOM']) {
    await expect(workplaceTools.getByRole('link', { name: new RegExp(`^${tool}`) })).toBeVisible();
  }
  await expect(workplaceTools.getByText('Notes', { exact: true })).toBeVisible();
  await expect(workplaceTools.getByText('NOT IMPLEMENTED', { exact: true })).toBeVisible();
  await expect(workplaceTools.getByRole('link', { name: /^My Day/ })).toHaveAttribute('href', '/my-work/my-day');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('aura-home-board')).toBeVisible();
  for (const workspace of Object.keys(workspaceDestinations)) {
    await expect(page.getByTestId(`workspace-card-${workspace}`)).toBeVisible();
  }
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
  await page.goto('/projects/projects', { waitUntil: 'domcontentloaded' });
  await expect(navigation.getByRole('link', { name: 'Suites', exact: true })).toBeVisible();
  await navigation.getByRole('link', { name: 'Suites', exact: true }).click();
  await expect(page.getByTestId('suite-launcher')).toBeVisible();
  await expect(page.getByTestId('suite-launcher').getByRole('link')).toHaveCount(10);

  const restricted = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 900 } });
  const login = await restricted.request.post('/api/auth/login', {
    data: { username: 'u-approver', password: process.env.E2E_PASSWORD ?? 'e2e-password' },
  });
  expect(login.ok()).toBe(true);
  await expect(login.json()).resolves.toMatchObject({ user: { sub: 'u-approver' } });
  const restrictedMe = await restricted.request.get('/api/workspace/me');
  expect(restrictedMe.ok()).toBe(true);
  await expect(restrictedMe.json()).resolves.toMatchObject({ username: 'u-approver', role: 'viewer', isAdmin: false });
  const restrictedPage = await restricted.newPage();
  await restrictedPage.goto('/suites', { waitUntil: 'domcontentloaded' });
  await expect(restrictedPage.getByTestId('suite-launcher').getByRole('link')).toHaveCount(1);
  await expect(restrictedPage.getByRole('link', { name: /Workplace & Collaboration/ })).toBeVisible();
  await expect(restrictedPage.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);
  await restrictedPage.goto('/suites/administration-governance', { waitUntil: 'domcontentloaded' });
  await expect(restrictedPage.getByTestId('data-error')).toHaveAttribute('data-error-kind', 'forbidden');
  await restricted.close();
});
