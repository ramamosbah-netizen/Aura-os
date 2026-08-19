import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * Project 360 delivery areas — browser smoke, one reported result per area.
 *
 * project-operations-workspace.spec.ts covers the Command center, Project controls and Site.
 * These five were reachable only on paper: the routes build and the slugs are unchanged from
 * main, but a built route proves nothing about the three things that matter when an engineer
 * runs a project from Project 360 —
 *
 *   1. the area is reached through the project shell, not by typing a URL,
 *   2. it stays inside the SAME project — the page filters rows by projectId server-side, so a
 *      wrong id yields a silently empty register rather than an error,
 *   3. the delivery context (project shell, system lens) survives the move between areas.
 *
 * Deliberately a smoke, not a domain journey: creating a drawing / NCR / permit / test / document
 * belongs to each module's own spec. One test per area so a failure names the area.
 */
const AREAS = [
  { label: 'Engineering', slug: 'engineering' },
  { label: 'Quality', slug: 'quality' },
  { label: 'HSE', slug: 'hse' },
  { label: 'Commissioning', slug: 'commissioning' },
  { label: 'Documents', slug: 'documents' },
] as const;

let projectId = '';

async function createProject(request: APIRequestContext): Promise<string> {
  const created = await request.post('/api/projects/projects', {
    data: {
      title: `E2E Project 360 Areas ${Date.now().toString().slice(-6)}`,
      reference: `PA-${Date.now().toString().slice(-4)}`,
      status: 'active',
      value: 100_000,
    },
  });
  expect(created.ok(), 'project fixture must be created for the area smoke to mean anything').toBe(true);
  return ((await created.json()) as { id: string }).id;
}

test.beforeAll(async ({ request }) => {
  projectId = await createProject(request);
});

for (const area of AREAS) {
  test(`Project 360 → ${area.label} keeps project and shell context`, async ({ page }) => {
    await page.goto(`/project/${projectId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('project-command-center')).toBeVisible();

    const projectNav = page.getByRole('navigation', { name: 'Project delivery areas' });
    // Reached the way a user reaches it — through the shell, not a typed URL.
    await projectNav.getByRole('link', { name: area.label, exact: true }).click();

    // Correct project, correct area.
    await expect(page).toHaveURL(new RegExp(`/project/${projectId}/${area.slug}(\\?|$)`));
    await expect(page.getByRole('heading', { name: new RegExp(area.label), level: 1 })).toBeVisible();

    // No refusal and no unexpected 403 dressed up as an empty register.
    await expect(page.getByTestId('data-error')).toHaveCount(0);

    // Navigation context preserved: the shell is still driving.
    await expect(projectNav).toBeVisible();
    await expect(projectNav.getByRole('link', { name: 'Command center', exact: true })).toBeVisible();
  });
}

test('the system lens survives moving between areas', async ({ page }) => {
  // The lens is delivery context. A silent reset would quietly widen what the engineer believes
  // they are looking at, which is worse than losing it visibly.
  await page.goto(`/project/${projectId}/engineering?discipline=cctv`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('System lens is active')).toBeVisible();

  const projectNav = page.getByRole('navigation', { name: 'Project delivery areas' });
  await projectNav.getByRole('link', { name: 'Quality', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/project/${projectId}/quality\\?discipline=cctv`));
  await expect(page.getByText('System lens is active')).toBeVisible();
});
