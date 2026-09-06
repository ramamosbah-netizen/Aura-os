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
/**
 * These are the shell's WORKSPACE sections, which is what the Project 360 nav actually links to.
 * The spec previously drove `/project/<id>/<area>` through a nav landmark called "Project delivery
 * areas". The September rebuild replaced that with "Project 360 navigation" linking to
 * `/project/<id>/workspace/<section>`, and renamed "Commissioning" to "Testing & Commissioning".
 *
 * Link names are matched START-anchored because each nav item wraps its label AND its description
 * in one anchor, so the accessible name is both concatenated — "Engineering Drawings, RFIs and
 * technical queries" — and an exact match finds nothing.
 */
const AREAS = [
  { label: 'Engineering', slug: 'engineering' },
  { label: 'Quality', slug: 'quality' },
  { label: 'HSE', slug: 'hse' },
  { label: 'Testing & Commissioning', slug: 'testing' },
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

    const projectNav = page.getByRole('navigation', { name: 'Project 360 navigation' });
    // Reached the way a user reaches it — through the shell, not a typed URL.
    await projectNav.getByRole('link', { name: new RegExp(`^${area.label}`) }).first().click();

    // Correct project, correct section.
    await expect(page).toHaveURL(new RegExp(`/project/${projectId}/workspace/${area.slug}(\\?|$)`));
    await expect(page.getByRole('heading', { name: area.label, level: 1 })).toBeVisible();

    // No refusal and no unexpected 403 dressed up as an empty register.
    await expect(page.getByTestId('data-error')).toHaveCount(0);

    // Project context preserved. NOT the launcher: `showFullLauncher = isOverview`
    // (project-shell.tsx:173) deliberately renders the shortcut grid only on the overview —
    // "separate overview launcher from inner workspaces" (120d4e06), "remove redundant inner
    // shortcut bar" (3a230caf). Inside a section the shell swaps it for a context bar carrying
    // the project identity and the way back, which is what has to survive the move.
    const projectContext = page.getByRole('region', { name: 'Project context' });
    await expect(projectContext).toBeVisible();
    await expect(projectContext.getByRole('link', { name: /All projects/ })).toBeVisible();
  });
}

test('the system lens survives moving between areas', async ({ page }) => {
  // The lens is delivery context. A silent reset would quietly widen what the engineer believes
  // they are looking at, which is worse than losing it visibly.
  // Start on the overview, because that is the only page carrying the launcher — inner workspaces
  // render the context bar instead, so there is nowhere else to pick the next area from.
  await page.goto(`/project/${projectId}?discipline=cctv`, { waitUntil: 'domcontentloaded' });

  const projectNav = page.getByRole('navigation', { name: 'Project 360 navigation' });
  await projectNav.getByRole('link', { name: /^Quality/ }).first().click();

  // `scoped()` in project-shell.tsx re-attaches the query to every nav href, so the lens the
  // engineer selected survives the move between sections rather than silently widening.
  await expect(page).toHaveURL(new RegExp(`/project/${projectId}/workspace/quality\\?discipline=cctv`));
});

/**
 * The discipline lens itself lives on `/project/<id>/<area>` — that page reads `?discipline=`,
 * filters through `filterAreaRows()` and says so. The workspace sections the shell links to do
 * NOT read it: they carry the parameter and ignore it.
 *
 * So this asserts a capability that is currently reachable only by typing the URL. Nothing in the
 * Project 360 navigation links to it. Keeping the assertion means the lens stays covered while
 * that is true, and the test starts failing honestly if the page is removed rather than wired up.
 */
/**
 * The readiness contract, proven rather than assumed.
 *
 * `setDiscipline` navigates instead of setting state, so the onChange handler is the only thing
 * carrying a selection anywhere. Before this was fixed the select shipped from the server enabled:
 * a choice made in that window changed the DOM, reached no listener, never navigated, and was then
 * reconciled away — a silently lost interaction that a retry in the test would have hidden.
 *
 * Holding the client chunks turns that race into an observable window, so this asserts the promise
 * directly: while the shell cannot act, the lens does not pretend it can.
 */
test('the discipline lens refuses input until the shell can act on it', async ({ page }) => {
  // Read the SERVER's own markup, before a single script has run. Deterministic on purpose: an
  // earlier version of this test held the JS chunks to widen the pre-hydration window, but those
  // scripts gate `domcontentloaded`, so the navigation timed out before asserting anything. The
  // contract does not need a race to observe — it is a property of what the server sends.
  const html = await (await page.request.get(`/project/${projectId}`)).text();
  const lensTag = html.match(/<select[^>]*System or discipline lens[^>]*>/)?.[0] ?? '';
  expect(lensTag, 'the lens must be server-rendered').not.toBe('');
  expect(
    lensTag,
    'the lens must arrive DISABLED: setDiscipline only navigates, so a choice made before the ' +
      'handler attaches reaches nothing, never changes the URL, and is reconciled away — a lost ' +
      'interaction the user is given no sign of',
  ).toContain('disabled');

  // And in a live browser it becomes usable, and the choice actually reaches the URL.
  await page.goto(`/project/${projectId}`, { waitUntil: 'domcontentloaded' });
  const lens = page.getByLabel('System or discipline lens').first();
  await expect(lens).toBeEnabled();
  await lens.selectOption('cctv');
  await expect(page).toHaveURL(/discipline=cctv/);
});

test('the discipline lens filters an area register when reached directly', async ({ page }) => {
  await page.goto(`/project/${projectId}/engineering?discipline=cctv`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('System lens is active')).toBeVisible();
  await expect(page.getByTestId('data-error')).toHaveCount(0);
});
