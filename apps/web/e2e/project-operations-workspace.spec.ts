import { expect, test } from '@playwright/test';

import { createActiveProject, runId, scoped } from './fixtures';


const PROJECT_TITLE = scoped('E2E Delivery Workspace');

test('project and operations share one usable delivery context', async ({ page, browser }) => {
  // Walked into execution rather than declared into it: a project cannot be CREATED `active` any
  // more, and this spec genuinely needs an active one — it asserts the command centre's list of
  // active projects further down.
  const project = { id: await createActiveProject(page.request, PROJECT_TITLE) };
  const report = await page.request.post('/api/site/daily-reports', {
    data: {
      projectId: project.id,
      date: '2026-08-16',
      workDescription: 'CCTV device installation — Level 2',
    },
  });
  expect(report.ok()).toBe(true);

  // Anonymous must not see project data. WHICH refusal depends on WEB_AUTH_REQUIRED: with the
  // gate on the proxy redirects to /login (asserted in web-auth-gate.spec.ts, against a server
  // that declares the flag); with it off — this server, per playwright.config.ts — the request
  // reaches the page and must render a refusal instead. Asserting the redirect here made the
  // spec pass only on a machine whose .env.local happened to enable the gate.
  const signedOut = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const signedOutPage = await signedOut.newPage();
  await signedOutPage.goto(`/project/${project.id}`, { waitUntil: 'domcontentloaded' });
  await expect(signedOutPage.getByTestId('data-error')).toBeVisible();
  await expect(signedOutPage.getByText(PROJECT_TITLE)).toHaveCount(0);
  await signedOut.close();

  // A SIGNED-IN user without access — a different refusal from the anonymous one above. Sign-in
  // now needs a registered identity with a real credential (S1), so the account is provisioned
  // through the admin API instead of relying on the old behaviour where any username plus the
  // shared dev password was accepted. It is deliberately given no grants.
  // Run-scoped: registering a fixed username succeeds once and 409s on the second run against
  // the same database, which would fail this spec on setup rather than on what it measures.
  const deniedUser = `u-no-access-${runId()}`;
  const password = process.env.E2E_PASSWORD ?? 'e2e-password';
  const registered = await page.request.post('/api/admin/users', {
    data: { userId: deniedUser, displayName: 'No project access' },
  });
  expect(registered.ok()).toBe(true);
  const credential = await page.request.post(`/api/admin/users/${deniedUser}/password`, {
    data: { password, mustChange: false },
  });
  expect(credential.ok()).toBe(true);

  const denied = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const deniedLogin = await denied.request.post('/api/auth/login', {
    data: { username: deniedUser, password },
  });
  expect(deniedLogin.ok()).toBe(true);
  const deniedPage = await denied.newPage();
  await deniedPage.goto(`/project/${project.id}`, { waitUntil: 'domcontentloaded' });
  await expect(deniedPage).toHaveURL(`/project/${project.id}`);
  await expect(deniedPage.getByTestId('data-error')).toHaveAttribute('data-error-kind', 'forbidden');
  await expect(deniedPage.getByRole('heading', { name: "You don't have access to this" })).toBeVisible();
  await denied.close();

  await page.goto(`/project/${project.id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('project-command-center')).toBeVisible();
  // The overview's landmarks, updated with the Project 360 rebuild.
  //
  // This route used to render a second, hand-written dashboard beside the record at /controls, and
  // these assertions named its sections. Both routes now render the SAME record, so the equivalent
  // claims are made against the record's own structure: it composes the delivery workspaces rather
  // than duplicating their registers, and it carries the attention rail on every tab.
  //
  // Asserted by landmark rather than by copy. This block was written once against a heading the
  // record carried for an hour: the rebuilt 360 briefly listed the six delivery workspaces itself,
  // until a screenshot showed the project shell rendering the SAME grid directly beneath it. The
  // links were removed as the duplication they were, and this assertion went with them — which is
  // the argument for landmarks made twice in one afternoon.
  //
  // What is durable: the record's own tab panel is present, and the shell — not the record —
  // is what offers the delivery workspaces on this route.
  await expect(page.getByTestId('project-controls-overview')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Project 360 navigation' })).toBeVisible();

  // The launcher is named "Project 360 navigation" now, and Project controls was folded into
  // "Plan & Control" at /workspace/plan — see project-shell.tsx:54, which still treats the older
  // /controls path as making that item active.
  const projectNav = page.getByRole('navigation', { name: 'Project 360 navigation' });
  await projectNav.getByRole('link', { name: /^Plan & Control/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`/project/${project.id}/workspace/plan`));
  // Plan & Control is a HUB, not the controls workspace itself — it lists WBS & progress, Project
  // controls, Risks & issues and Changes & claims, each one hop further. The rebuild put this
  // landing page between the launcher and the controls surface this test is about.
  await page.getByRole('link', { name: /^Project controls/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`/project/${project.id}/controls`));
  await expect(page.getByTestId('project-controls')).toBeVisible();
  await expect(page.getByRole('heading', { name: PROJECT_TITLE })).toBeVisible();
  // Roving-tabindex keyboard navigation, on the rebuilt tab set. The sections are now grouped by
  // the question each answers — Change sits before Time — rather than by the artefact that happens
  // to live there, so this walks that order instead of the old one.
  const changeTab = page.getByRole('tab', { name: /^Change/ });
  await changeTab.focus();
  await changeTab.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /^Time/ })).toHaveAttribute('aria-selected', 'true');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('project-controls')).toBeVisible();

  await page.goto(`/projects/projects/${project.id}?discipline=cctv`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(new RegExp(`/project/${project.id}/controls\\?discipline=cctv`));
  await expect(page.getByLabel('System or discipline lens')).toHaveValue('cctv');

  await page.goto(`/project/${project.id}`, { waitUntil: 'domcontentloaded' });
  // No retry, deliberately. The lens is disabled until the shell hydrates (project-shell.tsx), so
  // `selectOption` waits for enabled through Playwright's own actionability check and the choice
  // cannot land on a control with no listener. A retry loop here would pass either way and would
  // hide a returning defect — the product now says when it is ready, so the test can simply believe
  // it. If this line starts failing again, the readiness signal is what broke.
  await page.getByLabel('System or discipline lens').selectOption('cctv');
  await expect(page).toHaveURL(/discipline=cctv/);
  // Opened by URL, not through the shell. The Project 360 launcher links "Site" to
  // /workspace/site, which does not read `?discipline=` — only the `[area]` route below
  // implements the lens (filterAreaRows). Nothing in the navigation reaches it any more, so
  // driving it through the shell here would assert a path that no longer exists. The lens
  // register itself still works, and this keeps it covered while that remains true.
  await page.goto(`/project/${project.id}/site?discipline=cctv`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(new RegExp(`/project/${project.id}/site\\?discipline=cctv`));
  const register = page.getByRole('table', { name: 'Site project register' });
  await expect(register).toBeVisible();
  await expect(register).toContainText('CCTV device installation');
  await expect(page).toHaveURL(/project_site_sort=date/);
  const sort = page.getByRole('button', { name: /Sort by Date/ });
  await sort.focus();
  await sort.press('Enter');
  await expect(register.getByRole('columnheader', { name: /Date/ })).toHaveAttribute('aria-sort', 'descending');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/project/${project.id}/site?discipline=cctv`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('link', { name: /2026-08-16/ })).toBeVisible();
  await expect(page.getByText('CCTV device installation')).toBeVisible();
  await page.goto(`/project/${project.id}/controls`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('project-controls')).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Record sections' })).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });

  // The command centre's "Active execution" panel lists active projects and links each into its
  // site context. It renders only the first few, so a spec that asserts "MY project is on this
  // page" is really asserting "my project happens to sort near the front" — a fact about how many
  // OTHER projects a run created, not about the page. That broke twice: once on a shared database
  // holding 29 active projects, once on a clean run whose own specs made 17. The page was working
  // perfectly both times.
  //
  // The previous guard modelled the page as the portfolio ranked at-risk-first then by title, top
  // 8. It is not: the panel takes the first SIX from a plain project list, and the titles a naive
  // `toContainText` matches come from the filter dropdown, which lists every project whether the
  // panel shows it or not — so that assertion passed for reasons unrelated to what it claimed.
  //
  // So this drives the page's own filter instead. `?project=` is a real control on the screen, it
  // narrows the panel to one project, and the result cannot be perturbed by anything else the
  // suite creates. Same intent as the original — this project and operations share one delivery
  // context — asserted in a way that stays true on run 2 and on run 200.
  await page.goto('/operations/overview', { waitUntil: 'domcontentloaded' });
  // Renamed to `delivery-operations-overview` — `operations-command-center` exists nowhere in the
  // source any more, only here.
  const operations = page.getByTestId('delivery-operations-overview');
  await expect(operations).toBeVisible();
  // Unfiltered, the panel must be doing its job for somebody: at least one project, with a way in.
  await expect(operations.locator('a[href^="/project/"]').first()).toBeVisible();

  await page.goto(`/operations/overview?project=${project.id}`, { waitUntil: 'domcontentloaded' });
  const filtered = page.getByTestId('delivery-operations-overview');
  await expect(filtered).toBeVisible();
  // .first(): the filtered overview links this project from BOTH the execution panel and the
  // pre-execution readiness panel. Two ways in is the product working, not an ambiguity to resolve.
  await expect(filtered.getByRole('link', { name: new RegExp(PROJECT_TITLE) }).first()).toBeVisible();
  // Prefix, not exact: the panel deep-links into the project's Site area rather than its root,
  // which is the more useful destination from a delivery view. The id is the assertion; the
  // landing section is a product choice.
  await expect(
    filtered.locator(`a[href^="/project/${project.id}"]`).first(),
    'the command centre offers no way back into the project it is reporting on',
  ).toBeVisible();
});
