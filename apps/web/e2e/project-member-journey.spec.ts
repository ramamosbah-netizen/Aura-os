import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * A project member's journey, in a real browser, with auth ON.
 *
 * API tests prove the boundary holds. They do not prove a person can get their work done, and both
 * are required: a perfectly sealed API behind a screen that shows nothing is not a delivered
 * feature. So this signs in through the real login form as a member — not the admin the rest of the
 * suite runs as — and walks the journey the UX is supposed to make obvious:
 *
 *   My Projects → the project → its operational areas → back, still in the project
 *
 * ...and then tries to leave it by editing the URL, which must fail.
 *
 * ## Why its own browser context
 *
 * Global setup signs in once as `u-admin`, which holds an org-wide grant and therefore cannot
 * demonstrate scoping: everything would be visible and every assertion would pass for the wrong
 * reason. This opens a second context and signs in as the member, so what the screen shows is what
 * a project member actually sees.
 */
const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const V1 = `${API}/api/v1`;
const MEMBER = 'u-e2e-viewer';

async function signInAs(page: Page, baseURL: string, username: string): Promise<boolean> {
  const password = process.env.E2E_PASSWORD ?? process.env.AUTH_DEV_PASSWORD;
  if (!password) return false;
  await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  return page
    .waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
}

async function seed(request: APIRequestContext, admin: string, run: string) {
  const H = { 'content-type': 'application/json', Authorization: admin };
  const post = async <T>(url: string, data: unknown): Promise<T> => {
    const res = await request.post(`${V1}${url}`, { headers: H, data });
    expect(res.ok(), `${url} — ${await res.text()}`).toBe(true);
    return (await res.json()) as T;
  };
  const mine = await post<{ id: string }>('/projects/projects', { title: `Journey ${run} MINE`, code: `JN-${run}-M` });
  const theirs = await post<{ id: string }>('/projects/projects', { title: `Journey ${run} THEIRS`, code: `JN-${run}-T` });

  // Three delivery roles, because project scope and functional permission are separate dimensions:
  // membership alone would leave the member unable to open half the areas the nav offers.
  for (const roleId of ['r-pm', 'r-qa-qc', 'r-site-engineer']) {
    await post(`/projects/${mine.id}/members`, { userId: MEMBER, roleId });
  }

  // A record in each project, so "can they reach the other one" is a real question with real data.
  const drawing = await post<{ id: string }>('/engineering/drawings', {
    projectId: mine.id, code: `JN-${run}-MD`, title: 'Member drawing', revision: '0',
  });
  const foreign = await post<{ id: string }>('/engineering/drawings', {
    projectId: theirs.id, code: `JN-${run}-TD`, title: 'Foreign drawing', revision: '0',
  });
  return { mine, theirs, drawing, foreign };
}

test.describe('project member journey', () => {
  test.setTimeout(300_000);

  test('sees only their projects, works inside one, and cannot leave it by URL', async ({ browser, request, baseURL }) => {
    const admin = apiAuthHeaders().Authorization;
    test.skip(!admin, 'auth is off for this run — a member and an admin would be indistinguishable');
    test.skip(!process.env.E2E_PASSWORD && !process.env.AUTH_DEV_PASSWORD, 'needs a password to sign the member in');

    const run = Date.now().toString().slice(-6);
    const { mine, theirs, drawing, foreign } = await seed(request, admin!, run);

    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      expect(await signInAs(page, baseURL!, MEMBER), `${MEMBER} must be able to sign in`).toBe(true);

      // ── 1. My Projects shows theirs, and not the other ──────────────────────────────────────────
      await page.goto(`${baseURL}/my-projects`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId(`my-project-${mine.id}`), 'their project is listed').toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId(`my-project-${theirs.id}`), 'a project they are not on is not').toHaveCount(0);
      // The screen says WHICH set it is showing, rather than leaving it to be inferred.
      await expect(page.getByTestId('my-projects-scope')).toHaveText(/projects you are assigned to/i);

      // ── 2. Into the project ────────────────────────────────────────────────────────────────────
      await page.getByTestId(`my-project-open-${mine.id}`).click();
      await page.waitForURL(`**/project/${mine.id}**`, { timeout: 20_000 });

      // ── 3. The project's own drawing register, reached from inside it ───────────────────────────
      await page.goto(`${baseURL}/project/${mine.id}/drawings`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('project-drawings-scope'), 'the page names the project it is about').toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId(`eng-project-${mine.id}`)).toBeVisible();

      // ── 4. The record itself, in project context ────────────────────────────────────────────────
      await page.goto(`${baseURL}/project/${mine.id}/drawings/${drawing.id}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('drawing-status'), 'the drawing opens').toBeVisible({ timeout: 20_000 });
      // Breadcrumbs lead back into the project, not out to the global register — the context the
      // reader arrived in is the context they return to.
      await expect(page.locator(`a[href="/project/${mine.id}/drawings"]`).first()).toBeVisible();
      await expect(page.locator(`a[href="/project/${mine.id}"]`).first()).toBeVisible();

      // ── 5. THE URL CANNOT CARRY THEM OUT ────────────────────────────────────────────────────────
      // Three shapes, because they fail for three different reasons and all three must hold:
      //   a) another project's drawing under its own project — no grant on that project
      //   b) another project's drawing under THEIRS — the record resolves to its real project
      //   c) another project's register — no grant
      for (const [label, url] of [
        ['another project’s drawing', `/project/${theirs.id}/drawings/${foreign.id}`],
        ['the URL lie', `/project/${mine.id}/drawings/${foreign.id}`],
        ['another project’s register', `/project/${theirs.id}/drawings`],
      ] as const) {
        await page.goto(`${baseURL}${url}`, { waitUntil: 'domcontentloaded' });
        const text = await page.locator('body').innerText();
        expect(text, `${label}: the foreign drawing must not be rendered`).not.toContain(`JN-${run}-TD`);
        expect(text, `${label}: nor the foreign project's name`).not.toContain(`Journey ${run} THEIRS`);
      }

      // ── 6. And back, still in their project ────────────────────────────────────────────────────
      await page.goto(`${baseURL}/project/${mine.id}/drawings`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('project-drawings-scope')).toContainText(`Journey ${run} MINE`);
    } finally {
      await context.close();
    }
  });
});
