// AURA OS — F-10: Senior Management reads the governed executive decision set, from the ordinary path.
//
// The CEO perspective used to be KPI cards computed in the browser from whatever lists the shell had
// loaded — a dollar sign on AED money, tender and project values summed as "contract volume", budget
// minus invoiced called variance — and it lived behind /command-center, which decides entry from
// /workspace/me: refused to every shipped role, so a real Senior Management user was sent to My Work
// and never saw it at all.
//
// Proved here, Auth ON against PostgreSQL:
//   reachable   u-e2e-exec (r-executive) gets there by clicking — launcher → Business Command Center →
//               Executive Decisions — not by typing a URL
//   lineage     every one of the fourteen decisions says when it was read and where from, and is
//               either measured with what it counted or unavailable with why; no source failed
//   population  the tile's count IS the drilldown's record count, and a fact written by this run is
//               in it at its value, linked to the page that holds it, which the executive can open
//   one read    the Command Center's CEO perspective shows the same decision set
//   authority   a Sales rep is told they may not see it — not shown an empty board
import { expect, test, type Browser, type Page } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { memberPassword, signInAs } from './project-member-harness';
import { provisionedActorsUnavailable } from './provisioned-actors';

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const RUN = Date.now().toString().slice(-6);
const DECISIONS = [
  'pipeline', 'backlog', 'project-health', 'schedule', 'resources', 'procurement', 'revenue',
  'cost', 'margin', 'cash', 'risks', 'variations', 'forecast', 'closeout',
];

async function seat(browser: Browser, baseURL: string, username: string): Promise<Page> {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  expect(await signInAs(page, baseURL, username), `${username} could not sign in`).toBe(true);
  return page;
}

test('Senior Management reaches the executive decisions, reads each figure with its lineage, and opens the record behind one', async ({ browser, baseURL, request }) => {
  test.setTimeout(240_000);
  test.skip(!apiAuthHeaders().Authorization, 'auth is off — there is no Senior Management identity to prove');
  test.skip(!memberPassword(), 'needs a password to sign the executive in');
  const unavailable = await provisionedActorsUnavailable(request);
  test.skip(unavailable !== null, unavailable ?? '');

  // A fact only this run owns, so it can be found among everything else the suite has written.
  const title = `Executive probe ${RUN}`;
  const created = await request.post(`${API}/crm/opportunities`, { headers: apiAuthHeaders(), data: { title, value: 123_456 } });
  expect(created.ok(), await created.text()).toBe(true);
  const opportunity = (await created.json()) as { id: string };

  const ceo = await seat(browser, baseURL!, 'u-e2e-exec');
  try {
    // The ordinary path, by clicking.
    await ceo.goto('/suites', { waitUntil: 'domcontentloaded' });
    await ceo.getByTestId('suite-launcher').getByRole('link', { name: /^Business Command Center/ }).click();
    await expect(ceo.getByTestId('suite-home')).toBeVisible({ timeout: 60_000 });
    await ceo.getByTestId('suite-home').getByRole('link', { name: /Executive Decisions/ }).click();
    await expect(ceo).toHaveURL(/\/executive$/, { timeout: 60_000 });

    const asOf = ceo.getByTestId('executive-as-of');
    await expect(asOf).toContainText('Read live from the system of record at', { timeout: 60_000 });
    await expect(asOf).toContainText('money in AED');
    for (const id of DECISIONS) {
      const tile = ceo.getByTestId(`decision-${id}`);
      await expect(tile, `${id} is answered`).toBeVisible();
      await expect(tile, `${id} names its source`).toContainText('Source:');
      const measured = await tile.getByTestId(`decision-${id}-population`).count();
      const notMeasured = await tile.getByTestId(`decision-${id}-unavailable`).count();
      expect(measured + notMeasured, `${id} is measured with its population, or says why it is not — never neither`).toBe(1);
      if (measured) {
        // The drill promises exactly the counted population — and a population of none is not a link.
        const n = Number(/Counted (\d+)/.exec(await tile.getByTestId(`decision-${id}-population`).innerText())?.[1]);
        if (n > 0) {
          await expect(tile.getByTestId(`decision-${id}-drill`)).toHaveText(`Open the ${n} ${n === 1 ? 'record' : 'records'} →`);
        } else {
          await expect(tile.getByTestId(`decision-${id}-drill`), `${id} counts nothing, so it offers nothing to open`).toHaveCount(0);
          await expect(tile.getByTestId(`decision-${id}-no-records`)).toBeVisible();
        }
      }
    }
    // "Unavailable" is honest for a decision with no source yet; a source that THREW against the real
    // database is a defect, and must not hide behind the same word.
    await expect(ceo.getByText(/It could not be read/)).toHaveCount(0);

    // The tile's population is the drilldown's record count.
    const tile = ceo.getByTestId('decision-pipeline');
    const counted = Number(/Counted (\d+)/.exec(await tile.getByTestId('decision-pipeline-population').innerText())?.[1]);
    expect(counted, 'this run\'s opportunity is open, so the pipeline counts at least it').toBeGreaterThanOrEqual(1);
    await expect(tile.getByTestId('decision-pipeline-drill')).toHaveText(`Open the ${counted} ${counted === 1 ? 'record' : 'records'} →`);
    await tile.getByTestId('decision-pipeline-drill').click();
    await expect(ceo).toHaveURL(/\/executive\/pipeline$/, { timeout: 60_000 });
    await expect(ceo.getByTestId('decision-lineage')).toContainText(`Counted ${counted}`, { timeout: 60_000 });
    await expect(ceo.getByTestId('decision-lineage')).toContainText('Source:');
    await expect(ceo.getByTestId('decision-records-count')).toHaveText(`${counted} ${counted === 1 ? 'record' : 'records'}`);

    // Three crumbs in a tight top bar: each clips its own label instead of painting over the next.
    const trail = ceo.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(trail.locator(':scope > span')).toHaveCount(3, { timeout: 30_000 });
    const boxes = await trail.locator(':scope > span > :last-child').evaluateAll((els) => els.map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right };
    }));
    for (let i = 1; i < boxes.length; i += 1) {
      expect(boxes[i].left, `crumb ${i + 1} starts after crumb ${i} ends`).toBeGreaterThanOrEqual(boxes[i - 1].right - 0.5);
    }

    // This run's fact, at its value, opening the page that holds it.
    await ceo.getByTestId('decision-records-find').fill(title);
    const row = ceo.getByTestId(`decision-record-${opportunity.id}`);
    await expect(row).toContainText('AED 123,456');
    await row.getByRole('link', { name: title }).click();
    await expect(ceo).toHaveURL(new RegExp(`/crm/opportunities/${opportunity.id}$`), { timeout: 60_000 });
    await expect(ceo.getByText(title).first()).toBeVisible({ timeout: 60_000 });
    await expect(ceo.getByText("You don't have access to this")).toHaveCount(0);
  } finally {
    await ceo.context().close();
  }

  const rep = await seat(browser, baseURL!, 'u-e2e-sales');
  try {
    await rep.goto('/executive', { waitUntil: 'domcontentloaded' });
    await expect(rep.getByText("You don't have access to this"), 'refused, and told so').toBeVisible({ timeout: 60_000 });
    await expect(rep.getByTestId('decision-pipeline')).toHaveCount(0);
  } finally {
    await rep.context().close();
  }
});

test('the Command Center\'s CEO perspective shows the same governed decision set', async ({ page }) => {
  test.skip(!apiAuthHeaders().Authorization, 'auth is off');
  await page.goto('/command-center', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /CEO Command Center/ }).click({ timeout: 60_000 });
  await expect(page.getByTestId('executive-as-of')).toContainText('Read live from the system of record at', { timeout: 60_000 });
  for (const id of DECISIONS) await expect(page.getByTestId(`decision-${id}`)).toBeVisible();
  await expect(page.getByText('Tender Win Rate')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open the full page →' })).toHaveAttribute('href', '/executive');
});
