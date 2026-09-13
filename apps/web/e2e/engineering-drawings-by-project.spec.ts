import { expect, test } from '@playwright/test';
import { createProject } from './fixtures';

/**
 * Active Drawings is a list of PROJECTS, not of drawings.
 *
 * The four facts a delivery engineer reads it for are asserted against seeded data rather than
 * eyeballed: where the project last got to, when that happened, how many drawings it holds, and the
 * way into it. The drawings themselves are behind the caret, which is what makes the list scannable
 * at fifty projects.
 *
 * The file assertions matter more than they look. `fileUrl` is a REFERENCE — AURA has no object
 * store — and the API accepted it on create, validated it, and then silently dropped it, so a
 * caller got a 201 and a drawing citing nothing. That is fixed, and this is the spec that says so:
 * a link goes in through the form and comes back out as a download on the row.
 */
const PAGE_SIZE = 20;

test.setTimeout(180_000);

test('drawings group by project, and each row carries status, date, count and a way in', async ({ page, baseURL }) => {
  const run = Date.now().toString().slice(-6);
  const name = `ENG Group ${run}`;
  const projectId = await createProject(page.request, name, baseURL);

  const seed = async (code: string, title: string, fileUrl?: string) =>
    page.request.post(`${baseURL}/api/engineering/drawings`, {
      data: { projectId, projectName: name, code, title, revision: '0', ...(fileUrl ? { fileUrl } : {}) },
    });

  const first = await seed(`GD-${run}-01`, 'Riser diagram');
  test.skip(!first.ok(), 'engineering API not reachable behind the web shell');
  const link = `https://example.invalid/drawings/GD-${run}-02.pdf`;
  const withFile = await seed(`GD-${run}-02`, 'Containment layout', link);
  expect(withFile.ok(), `a document link must be accepted — ${await withFile.text()}`).toBe(true);

  // THE REGRESSION: the link must survive the round trip. It used to be validated and discarded.
  const stored = await withFile.json();
  expect(stored.fileUrl, 'the link the caller sent is the link the register holds').toBe(link);

  await page.goto('/engineering?section=drawings', { waitUntil: 'domcontentloaded' });

  await page.getByTestId('eng-drawings-search').fill(name);
  const card = page.getByTestId(`eng-project-${projectId}`);
  await expect(card, 'the project is a row of its own').toBeVisible();

  await expect(page.getByTestId(`eng-project-count-${projectId}`)).toHaveText('2 drawings');
  await expect(page.getByTestId(`eng-project-status-${projectId}`), 'the latest status, from the newest movement').toHaveText('Draft');
  await expect(page.getByTestId(`eng-project-updated-${projectId}`)).toHaveText(new Date().toISOString().slice(0, 10));
  // The breakdown is what stops the single tag being read as a verdict on the whole project.
  await expect(page.getByTestId(`eng-project-breakdown-${projectId}`)).toContainText('2 still in the workflow');
  await expect(page.getByTestId(`eng-project-breakdown-${projectId}`)).toContainText('1 of 2 with a file');

  // Both ways in, and where each goes.
  await expect(page.getByTestId(`eng-project-link-${projectId}`)).toHaveAttribute('href', `/project/${projectId}`);
  // Both ways in are now project-scoped ROUTES rather than a filtered global list: the register
  // link is the shape the permission guard can read a project out of before a record is loaded.
  await expect(page.getByTestId(`eng-project-register-${projectId}`)).toHaveAttribute(
    'href',
    `/project/${projectId}/drawings`,
  );

  // Collapsed until asked: the rows are the detail behind the count above.
  await expect(page.getByTestId(`eng-project-drawings-${projectId}`)).toHaveCount(0);
  const caret = page.getByTestId(`eng-project-open-${projectId}`);
  await expect(caret).toBeEnabled();
  await caret.click();
  const rows = page.getByTestId(`eng-project-drawings-${projectId}`).locator('tbody tr');
  await expect(rows).toHaveCount(2);

  // Download where there is a file, and an honest "no file" where there is not — rather than an
  // empty cell that reads like the column is broken.
  await expect(page.getByTestId(`eng-drawing-file-${stored.id}`)).toHaveAttribute('href', link);
  const plain = await first.json();
  await expect(page.getByTestId(`eng-drawing-nofile-${plain.id}`)).toHaveText('no file');
});

test('the project list pages at twenty, and search finds a project by a drawing code', async ({ page, baseURL }) => {
  const run = Date.now().toString().slice(-6);
  const name = `ENG Search ${run}`;
  const projectId = await createProject(page.request, name, baseURL);
  const needle = `NEEDLE-${run}`;

  const seeded = await page.request.post(`${baseURL}/api/engineering/drawings`, {
    data: { projectId, projectName: name, code: needle, title: 'Findable by code', revision: '0' },
  });
  test.skip(!seeded.ok(), 'engineering API not reachable behind the web shell');

  await page.goto('/engineering?section=drawings', { waitUntil: 'domcontentloaded' });

  const list = page.getByTestId('eng-drawings-projects');
  expect(await list.locator('> li').count(), 'a page, not the whole tenant').toBeLessThanOrEqual(PAGE_SIZE);

  // Searching a DRAWING code must find the project holding it — the project's own name does not
  // contain the code, so a naive name-only filter would return nothing and look like no results.
  await page.getByTestId('eng-drawings-search').fill(needle);
  await expect(page.getByTestId(`eng-project-${projectId}`)).toBeVisible();
  await expect(page.getByTestId('eng-drawings-count')).toContainText('of');

  await page.getByTestId('eng-drawings-search').fill(`nothing-matches-${run}`);
  await expect(page.getByTestId('eng-drawings-no-match')).toBeVisible();
});

test('the grouped list caps at twenty projects, and the twenty-first is reachable', async ({ page, baseURL }) => {
  const run = Date.now().toString().slice(-6);
  const total = PAGE_SIZE + 1;

  // Twenty-one projects, each holding one drawing. Asserting the cap against a tenant that happens
  // to have fewer projects than the cap proves nothing, which is what the check here used to do.

  for (let n = 1; n <= total; n += 1) {
    const label = `GRP ${run} P${String(n).padStart(2, '0')}`;
    const projectId = await createProject(page.request, label, baseURL);

    const made = await page.request.post(`${baseURL}/api/engineering/drawings`, {
      data: { projectId, projectName: label, code: `GRP-${run}-${n}`, title: 'One drawing', revision: '0' },
    });
    if (n === 1) test.skip(!made.ok(), 'engineering API not reachable behind the web shell');
  }

  await page.goto('/engineering?section=drawings', { waitUntil: 'domcontentloaded' });
  // Narrowed to this run, so the count is one this spec owns rather than the whole tenant's.
  await page.getByTestId('eng-drawings-search').fill(`GRP ${run} `);

  const rows = page.getByTestId('eng-drawings-projects').locator('> li');
  await expect(rows, 'a full page of projects').toHaveCount(PAGE_SIZE);
  await expect(page.getByTestId('eng-drawings-pager-info')).toContainText(`1–${PAGE_SIZE} of ${total} projects`);

  await page.getByTestId('eng-drawings-pager-next').click();
  await expect(rows, 'the remainder, not a second full page').toHaveCount(total - PAGE_SIZE);
  await expect(page.getByTestId('eng-drawings-pager-next')).toBeDisabled();
});
