import { expect, test } from '@playwright/test';

import { apiAuthHeaders } from './api-auth';
import { runId, scoped } from './fixtures';

const API_BASE = process.env.AURA_API_URL ?? 'http://localhost:4000';

const PROJECT_TITLE = scoped('E2E Delivery Workspace');

test('project and operations share one usable delivery context', async ({ page, browser }) => {
  const created = await page.request.post('/api/projects/projects', {
    data: {
      title: PROJECT_TITLE,
      reference: `PXO-${runId()}`,
      status: 'active',
      value: 250_000,
    },
  });
  expect(created.ok()).toBe(true);
  const project = await created.json() as { id: string };
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
  await expect(page.getByRole('heading', { name: 'Delivery pulse' })).toBeVisible();
  await expect(page.getByText('Project delivery spine')).toBeVisible();

  const projectNav = page.getByRole('navigation', { name: 'Project delivery areas' });
  await projectNav.getByRole('link', { name: 'Project controls' }).click();
  await expect(page).toHaveURL(`/project/${project.id}/controls`);
  await expect(page.getByTestId('project-controls')).toBeVisible();
  await expect(page.getByRole('heading', { name: PROJECT_TITLE })).toBeVisible();
  const variationsTab = page.getByRole('tab', { name: /Variations/ });
  await variationsTab.focus();
  await variationsTab.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /Delays & EOT/ })).toHaveAttribute('aria-selected', 'true');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('project-controls')).toBeVisible();

  await page.goto(`/projects/projects/${project.id}?discipline=cctv`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(new RegExp(`/project/${project.id}/controls\\?discipline=cctv`));
  await expect(page.getByLabel('System or discipline lens')).toHaveValue('cctv');

  await page.goto(`/project/${project.id}`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('System or discipline lens').selectOption('cctv');
  await expect(page).toHaveURL(/discipline=cctv/);
  await page.getByRole('link', { name: 'Site', exact: true }).click();
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

  // The command centre shows the TOP 8 active projects — at-risk first, then by title. That is a
  // product decision, and a spec that asserts "my project is on this page" silently depends on it.
  // It has already gone wrong once: suite runs had accumulated 29 active projects in a shared
  // database, this project sorted to position 9, and a page that was working perfectly failed the
  // spec. The afternoon spent looking for the defect is why the precondition is now checked out
  // loud, against the same endpoint and the same ordering the page uses, before the assertions
  // that depend on it.
  //
  // Read it from the API directly: the portfolio is a server-component read, and the BFF has no
  // route for it — `/api/projects/projects/[id]` would take "portfolio" for an id.
  const portfolio = await page.request.get(`${API_BASE}/api/v1/projects/projects/portfolio`, { headers: apiAuthHeaders() });
  expect(portfolio.ok(), `the operations command centre reads the portfolio; ${API_BASE} answered ${portfolio.status()}`).toBe(true);
  type PortfolioRow = { id: string; title: string; status?: string; atRisk?: boolean };
  const visible = ((await portfolio.json()) as PortfolioRow[])
    .filter((p) => p.status === 'active')
    .sort((a, b) => Number(b.atRisk) - Number(a.atRisk) || a.title.localeCompare(b.title));
  const position = visible.findIndex((p) => p.id === project.id) + 1;
  expect(
    position > 0 && position <= 8,
    `this project sorts to position ${position} of ${visible.length} active projects, and the ` +
      'command centre renders only the first 8 — so the assertions below would fail for a reason ' +
      'that has nothing to do with the page. The database is not disposable, or this run created ' +
      'more projects than it should have.',
  ).toBe(true);

  await page.goto('/operations/overview', { waitUntil: 'domcontentloaded' });
  const operations = page.getByTestId('operations-command-center');
  await expect(operations).toBeVisible();
  await expect(operations).toContainText(PROJECT_TITLE);
  await expect(operations.getByRole('link', { name: new RegExp(PROJECT_TITLE) })).toHaveAttribute('href', `/project/${project.id}`);
});
