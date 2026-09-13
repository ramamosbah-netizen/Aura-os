import { expect, test, type Locator } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';

/**
 * Handover reads as a page, not as a wall.
 *
 * The same three problems the T&C workspace had, and the same three answers: a long line stays in
 * its row, a long list is shown a page at a time, and a card whose detail is a whole TABLE opens
 * from a caret instead of being printed in full for every system on the project.
 *
 * Asserted on computed style and on what is actually in the DOM rather than by eye, because the
 * failure mode here is silent — a section that quietly did not get the treatment looks fine until
 * the project has fifty systems on it.
 */
const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const CX = `${API}/api/v1/commissioning/records`;
const HO = `${API}/api/v1/commissioning/handovers`;
const H = () => apiAuthHeaders();
const PAGE_SIZE = 20;

const LONG_TITLE =
  'CCTV — Tower A, levels B2 through 47, including the podium, the annexe and the external perimeter cameras';

const styleOf = (el: Locator, prop: string) =>
  el.evaluate((node, p) => getComputedStyle(node as Element).getPropertyValue(p).trim(), prop);

/** Does the element render wider than the box it sits in? That is the failure being prevented. */
const overflowsParent = (el: Locator) =>
  el.evaluate((node) => {
    const child = node as HTMLElement;
    const parent = child.parentElement as HTMLElement | null;
    if (!parent) return false;
    return child.getBoundingClientRect().width > parent.getBoundingClientRect().width + 1;
  });

test('the O&M pack and the spares table are behind a caret, and a long system title is contained', async ({ page, baseURL }) => {
  const run = Date.now().toString().slice(-6);
  const projectId = await createProject(page.request, `HO Containment ${run}`, baseURL);
  const code = `HC-${run}`;

  const created = await page.request.post(CX, {
    headers: H(),
    // Deliberately long: a title that fits proves nothing about a title that does not.
    data: { projectId, code, title: LONG_TITLE, system: 'cctv' },
  });
  test.skip(!created.ok(), 'commissioning API not reachable');
  const system = await created.json();

  // A pack and a spare, so both sections have the TABLE they hide rather than an empty state. An
  // empty card collapses trivially; what is worth asserting is that real rows are the thing behind
  // the caret.
  await page.request.post(`${HO}/om-items/seed`, { headers: H(), data: { commissioningId: system.id } });
  await page.request.post(`${HO}/spares`, {
    headers: H(),
    data: { commissioningId: system.id, description: 'Spare camera', quantityRequired: 2 },
  });

  await page.goto(`/handover?project=${encodeURIComponent(projectId)}&section=om`, { waitUntil: 'domcontentloaded' });

  for (const [prefix, rowSelector] of [
    ['om', `[data-testid^="om-item-${code}-"]`],
    ['spares', `[data-testid="spares-system-${code}"] table`],
  ] as const) {
    // Closed by default: the STATE is on the card, the rows are not. That is the whole trade — the
    // number a reader came for stays visible, the table it came from costs one click.
    await expect(page.locator(rowSelector), `${prefix}: collapsed on arrival`).toHaveCount(0);
    await expect(page.getByTestId(`${prefix}-state-${code}`), `${prefix}: the state is readable while closed`).toBeVisible();

    const disclosure = page.getByTestId(`${prefix}-open-${code}`);
    await expect(disclosure, `${prefix}: the caret is live once React has attached`).toBeEnabled();
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false');

    // The title is contained on the CLOSED card, which is the state it is read in most of the time.
    const title = disclosure.locator('strong').first();
    expect(await styleOf(title, 'text-overflow'), `${prefix}: a long system title truncates`).toBe('ellipsis');
    expect(await overflowsParent(title), `${prefix}: and does not push the state tag off the card`).toBe(false);
    // Truncation that hides information is the trade this avoids — the whole title is a hover away.
    await expect(title, `${prefix}: the full title stays reachable`).toHaveAttribute('title', LONG_TITLE);

    await disclosure.click();
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator(rowSelector), `${prefix}: opening shows the detail`).not.toHaveCount(0);
  }
});

test('the handover package list pages, and the overflowed package is still reachable', async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  const run = Date.now().toString().slice(-6);
  const projectId = await createProject(page.request, `HO Paging ${run}`, baseURL);

  // One more than a page, so there is a second page with exactly one row on it.
  const total = PAGE_SIZE + 1;
  const first = await page.request.post(HO, {
    headers: H(),
    data: { projectId, code: `HP-${run}-01`, title: 'Package 01' },
  });
  test.skip(!first.ok(), 'handover API not reachable');
  for (let n = 2; n <= total; n += 1) {
    await page.request.post(HO, {
      headers: H(),
      data: { projectId, code: `HP-${run}-${String(n).padStart(2, '0')}`, title: `Package ${n}` },
    });
  }

  await page.goto(`/handover?project=${encodeURIComponent(projectId)}`, { waitUntil: 'domcontentloaded' });

  const pager = page.getByTestId('handover-packages-pager-info');
  await expect(pager).toContainText(`1–${PAGE_SIZE} of ${total}`);

  // Which package overflows depends on the ORDER the list is read in, so it is taken from the pager
  // rather than assumed: whichever code is missing from page one must be the one page two holds.
  const onPageOne = await page.getByTestId('handover-package-list').innerText();
  const codes = Array.from({ length: total }, (_, i) => `HP-${run}-${String(i + 1).padStart(2, '0')}`);
  const overflowed = codes.filter((c) => !onPageOne.includes(c));
  expect(overflowed, 'exactly one package is pushed onto page two').toHaveLength(1);

  await page.getByTestId('handover-packages-pager-next').click();
  await expect(pager).toContainText(`${total}–${total} of ${total}`);
  await expect(page.getByTestId('handover-package-list'), 'the overflowed package is still reachable').toContainText(overflowed[0]);

  await expect(page.getByTestId('handover-packages-pager-next')).toBeDisabled();
  await page.getByTestId('handover-packages-pager-prev').click();
  await expect(pager).toContainText(`1–${PAGE_SIZE} of ${total}`);
  await expect(page.getByTestId('handover-packages-pager-prev')).toBeDisabled();
});
