import { expect, test } from '@playwright/test';

/** The restricted actor: TIER-3 seeds a dedicated one; elsewhere u-approver already is a viewer. */
const VIEWER = process.env.E2E_VIEWER_USERNAME ?? 'u-approver';

test('global shell exposes the Home launcher, the suite sidebar and permission-aware suites', async ({ page, browser }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('aura-home-board')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Where would you like to work/ })).toBeVisible();
  // The launcher is derived from AURA_SUITES; assert a representative set of suite cards (Sales
  // included) and their Home destinations.
  for (const section of ['My Work', 'Communication', 'Business Command Center', 'Sales', 'Pre-Award', 'Project Delivery', 'Admin Center']) {
    await expect(page.getByText(section, { exact: true })).toBeVisible();
  }
  const workspaceDestinations = {
    'my-work': '/my-work',
    'business-command-center': '/command-center',
    sales: '/crm/overview',
    'pre-award': '/tendering',
    'project-delivery': '/projects/dashboard',
    finance: '/finance',
    'administration-governance': '/admin',
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
  // The sidebar IS the suite taxonomy (lib/suites.ts), grouped My Work / Control / Business Suites / System.
  // It carries no separate Home/Projects/Suites/Reports/Admin entries — those belonged to the
  // pre-IA topbar. d80d40ad rewrote the first half of this spec for the new taxonomy and left this
  // half describing the old one, which is why it has failed on every run since 2026-08-22.
  // One label from each of the four sections, so a dropped section fails here.
  for (const label of ['My Work', 'Communication', 'Business Command Center', 'Sales', 'Pre-Award', 'Project Delivery', 'Admin Center']) {
    await expect(navigation.getByRole('link', { name: label, exact: true })).toBeVisible();
  }
  for (const retired of ['Inbox', 'Search', 'AI Workspace', 'Notifications', 'Saved Views']) {
    await expect(navigation.getByRole('link', { name: retired, exact: true })).toHaveCount(0);
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
  await expect(myWorkTools.getByRole('link')).toHaveCount(4);
  for (const tool of ['My Day', 'Tasks', 'Approvals', 'Favorites']) {
    await expect(myWorkTools.getByRole('link', { name: new RegExp(`^${tool}`) })).toBeVisible();
  }

  await navigation.getByRole('link', { name: 'Business Command Center', exact: true }).click();
  await expect(page).toHaveURL('/command-center');
  await expect(page.getByTestId('business-command-center')).toBeVisible();
  await expect(page.getByText('AURA OS / BUSINESS COMMAND CENTER')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Organization health, decisions and control.' })).toBeVisible();

  await page.goto('/inbox', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL('/my-work/approvals');
  await expect(page.getByTestId('my-approvals-page')).toBeVisible();

  await page.goto('/ai', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL('/intelligence');

  await page.goto('/my-work/command-center?view=ceo', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL('/command-center?view=ceo');
  await expect(page.getByTestId('business-command-center')).toBeVisible();

  await page.goto('/suites', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('suites-page')).toBeVisible();
  // Thirteen: every suite in lib/suites.ts, because this actor is an admin and only `adminOnly` and
  // ungranted `gate`s remove one. Deliberately a literal — the count is the point, so adding or
  // dropping a suite has to be acknowledged here rather than absorbed by deriving it from the source.
  await expect(page.getByTestId('suite-launcher').getByRole('link')).toHaveCount(13);
  // Scoped to the launcher: the sidebar carries a 'Project Delivery' suite link too, so an
  // unscoped name match is ambiguous and fails on strict mode rather than on the behaviour.
  const delivery = page.getByTestId('suite-launcher').getByRole('link', { name: /Project Delivery/ });
  await expect(delivery).not.toHaveAttribute('target', '_blank');
  await delivery.click();
  await expect(page).toHaveURL('/suites/project-delivery');
  await expect(page.getByTestId('suite-home')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Project Delivery' })).toBeVisible();
  await expect(page.getByText('Capability truth')).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('link', { name: 'Open suite' })).toHaveAttribute('href', '/projects/dashboard');

  // What used to be here: a `/suites/workplace-collaboration` home and its "Workplace shortcuts"
  // rail. That suite no longer exists in the taxonomy — `findSuite` returns null and the route
  // 404s — and NO suite populates `featured`, so the rail never renders for any id. The block was
  // asserting a surface that had been deleted out from under it.
  //
  // Its real subject is honest capability reporting: the Communication suite exposes the
  // implemented Cloud API seam while the runtime screen still explains when configuration is
  // missing.
  await page.goto('/suites/communication', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('suite-home')).toBeVisible();
  // `<aside aria-labelledby>` — role complementary, not region.
  const capabilities = page.getByRole('complementary', { name: 'Capability truth' });
  const whatsappCapability = capabilities.locator('li').filter({ hasText: 'WhatsApp Business Cloud' });
  await expect(whatsappCapability).toBeVisible();
  await expect(whatsappCapability.getByText('PARTIALLY IMPLEMENTED', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open suite' })).toHaveAttribute('href', '/my-work/communication');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('aura-home-board')).toBeVisible();
  for (const workspace of Object.keys(workspaceDestinations)) {
    await expect(page.getByTestId(`workspace-card-${workspace}`)).toBeVisible();
  }
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/projects/projects', { waitUntil: 'domcontentloaded' });
  // The sidebar is present on a deep page and still navigates by suite. It has no 'Suites' entry
  // any more — the taxonomy replaced that hub link — so reaching the launcher is a URL, not a click.
  await expect(navigation.getByRole('link', { name: 'Sales', exact: true })).toBeVisible();
  await navigation.getByRole('link', { name: 'Sales', exact: true }).click();
  await expect(page).toHaveURL('/crm/overview');
  await page.goto('/suites', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('suite-launcher')).toBeVisible();
  await expect(page.getByTestId('suite-launcher').getByRole('link')).toHaveCount(13);

  const restricted = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 900 } });
  const login = await restricted.request.post('/api/auth/login', {
    // The RESTRICTED identity this test is about — deliberately its own actor, not the suite's
    // segregation-of-duties one. It must be a real viewer: a credential plus a grant that reaches
    // workspace.me.read and nothing more. Falling back to u-approver keeps TIER-2 unchanged, where
    // the seeder gives it a password and the workspace directory defaults it to viewer.
    data: { username: VIEWER, password: process.env.E2E_PASSWORD ?? 'e2e-password' },
  });
  expect(login.ok()).toBe(true);
  await expect(login.json()).resolves.toMatchObject({ user: { sub: VIEWER } });
  const restrictedMe = await restricted.request.get('/api/workspace/me');
  expect(restrictedMe.ok()).toBe(true);
  await expect(restrictedMe.json()).resolves.toMatchObject({ username: VIEWER, role: 'viewer', isAdmin: false });
  const restrictedPage = await restricted.newPage();
  await restrictedPage.goto('/suites', { waitUntil: 'domcontentloaded' });
  // Two, not one: a viewer holds no `suite.*` grant, so it sees exactly the suites with no gate —
  // My Work and Communication — and none of the gated business suites. The old expectation named a
  // single 'Workplace & Collaboration' suite, which the taxonomy replaced with these two centers.
  const restrictedLauncher = restrictedPage.getByTestId('suite-launcher');
  await expect(restrictedLauncher.getByRole('link')).toHaveCount(2);
  await expect(restrictedLauncher.getByRole('link', { name: /My Work/ })).toBeVisible();
  await expect(restrictedLauncher.getByRole('link', { name: /Communication/ })).toBeVisible();
  // The negative half, and the one that carries the permission claim: a gated business suite is
  // absent, so an empty-looking launcher cannot pass for a working one.
  await expect(restrictedLauncher.getByRole('link', { name: /Sales/ })).toHaveCount(0);
  // 'Admin Center' is the link's real name. Asserting `'Admin'` with exact:true matched nothing for
  // ANY actor once the taxonomy renamed it, so this negative control had stopped measuring the
  // permission it exists to prove.
  await expect(restrictedPage.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Admin Center', exact: true })).toHaveCount(0);
  await restrictedPage.goto('/suites/administration-governance', { waitUntil: 'domcontentloaded' });
  await expect(restrictedPage.getByTestId('data-error')).toHaveAttribute('data-error-kind', 'forbidden');
  await restrictedPage.goto('/command-center', { waitUntil: 'domcontentloaded' });
  await expect(restrictedPage).toHaveURL('/my-work');
  await expect(restrictedPage.getByTestId('my-work-dashboard')).toBeVisible();
  await restricted.close();
});
