import { expect, test } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';

/**
 * The commissioning scope list is shown a page at a time.
 *
 * A project with fifty systems rendered fifty rows, and the one you wanted was somewhere in the
 * middle of a very long scroll. The list is already fully loaded, so paging it is presentational —
 * instant, and the filters above still work on the whole list rather than on the visible page.
 *
 * What is worth asserting is not that a pager appears. It is that the page you are NOT on is still
 * reachable, that the count tells the truth, and that a pager does not show up on a list that fits.
 */
const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const CX = `${API}/api/v1/commissioning/records`;
const H = () => apiAuthHeaders();
const PAGE_SIZE = 20;

test.setTimeout(180_000);

test('the commissioning scope pages, and the last system is still reachable', async ({ page, baseURL }) => {
  const run = Date.now().toString().slice(-6);
  const projectId = await createProject(page.request, `CX Paging ${run}`, baseURL);

  // One more than a page, so there is a second page with exactly one row on it.
  const total = PAGE_SIZE + 1;
  const first = await page.request.post(CX, {
    headers: H(),
    data: { projectId, code: `PG-${run}-01`, title: 'System 01', system: 'cctv' },
  });
  test.skip(!first.ok(), 'commissioning API not reachable');
  for (let n = 2; n <= total; n += 1) {
    await page.request.post(CX, {
      headers: H(),
      data: { projectId, code: `PG-${run}-${String(n).padStart(2, '0')}`, title: `System ${n}`, system: 'cctv' },
    });
  }

  await page.goto(`/commissioning?project=${encodeURIComponent(projectId)}&section=systems`, { waitUntil: 'domcontentloaded' });

  const rows = page.getByTestId('cx-scope').locator('li');
  await expect(rows, 'a full page, not the whole list').toHaveCount(PAGE_SIZE);
  await expect(page.getByTestId('cx-scope-pager-info')).toContainText(`1–${PAGE_SIZE} of ${total}`);

  // The scope reads NEWEST FIRST, so the row pushed onto page two is the one registered FIRST —
  // `-01`, not `-21`. Asserted by the code the product actually puts there rather than the one a
  // reader might assume, which is the difference between testing the list and testing a guess.
  const overflowCode = `PG-${run}-01`;
  await expect(page.getByTestId('cx-scope')).not.toContainText(overflowCode);

  await page.getByTestId('cx-scope-pager-next').click();
  await expect(rows, 'the remainder, not a second full page').toHaveCount(total - PAGE_SIZE);
  await expect(page.getByTestId('cx-scope-pager-info')).toContainText(`${total}–${total} of ${total}`);
  await expect(page.getByTestId('cx-scope'), 'the overflowed system is still reachable').toContainText(overflowCode);

  // Next is spent at the end, and Previous returns exactly where it came from.
  await expect(page.getByTestId('cx-scope-pager-next')).toBeDisabled();
  await page.getByTestId('cx-scope-pager-prev').click();
  await expect(rows).toHaveCount(PAGE_SIZE);
  await expect(page.getByTestId('cx-scope-pager-prev')).toBeDisabled();

  /**
   * The same twenty-one systems seen through every other section that lists them. A section that
   * quietly did not get the treatment is exactly the drift a per-section spec would miss, so they
   * are asserted from one table against one seeded project.
   */
  for (const [section, listId] of [
    ['itp', 'itp-systems'],
    ['pre-commissioning', 'pre-systems'],
    ['testing', 'cx-systems'],
    ['readiness', 'readiness-systems'],
  ] as const) {
    await page.goto(`/commissioning?project=${encodeURIComponent(projectId)}&section=${section}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId(listId).locator('> li'), `${section} shows one page`).toHaveCount(PAGE_SIZE);
    await expect(page.getByTestId(`${listId}-pager-info`)).toContainText(`1–${PAGE_SIZE} of ${total}`);

    await page.getByTestId(`${listId}-pager-next`).click();
    await expect(page.getByTestId(listId).locator('> li'), `${section} turns the page`).toHaveCount(total - PAGE_SIZE);
  }
});

test('a list that fits on one page offers no pager at all', async ({ page, baseURL }) => {
  const run = Date.now().toString().slice(-6);
  const projectId = await createProject(page.request, `CX Short ${run}`, baseURL);

  const created = await page.request.post(CX, {
    headers: H(),
    data: { projectId, code: `SH-${run}-01`, title: 'Only system', system: 'cctv' },
  });
  test.skip(!created.ok(), 'commissioning API not reachable');

  await page.goto(`/commissioning?project=${encodeURIComponent(projectId)}&section=systems`, { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('cx-scope').locator('li')).toHaveCount(1);
  await expect(
    page.getByTestId('cx-scope-pager'),
    'a pager that only ever reads "page 1 of 1" is furniture, and makes a short list look truncated',
  ).toHaveCount(0);
});
