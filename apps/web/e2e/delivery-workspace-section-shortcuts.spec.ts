import { expect, test, type Page } from '@playwright/test';

/**
 * Site, Quality and HSE hold the same contract Engineering does: their sections are addressable, the
 * workspace keeps an AURA tab of its own, and the shortcut cards at the foot of the page open a
 * section BESIDE it instead of replacing it.
 *
 * One spec for the three, driven from a table, because the failure worth catching is a workspace
 * that quietly did not get the treatment — and that is invisible in a spec written per page.
 *
 * The first section of each workspace is what the bare path already shows, so its card points there
 * and opens no second tab. That is deliberate (one view, one URL, one tab) and is asserted below
 * rather than left as an accident for someone to "fix" into a duplicate.
 */
interface Workspace {
  name: string;
  path: string;
  testId: string;
  /** The tab title the workspace anchors for itself. */
  tabTitle: string;
  /** Section ids in order; the first is the landing section, which has no `?section=` URL. */
  sections: string[];
  /** A section to open from a card, and text that proves that section is the one showing. */
  opens: { id: string; label: string; proof: RegExp };
}

const WORKSPACES: Workspace[] = [
  {
    name: 'Site',
    path: '/site/control',
    testId: 'site-shortcut',
    tabTitle: 'Site',
    sections: ['instructions', 'daily-reports', 'delay-logs', 'material-consumption', 'labour-allocations', 'progress-mapping'],
    opens: { id: 'delay-logs', label: 'Site Delay Logs', proof: /Delay/i },
  },
  {
    name: 'Quality',
    path: '/quality/control',
    testId: 'quality-shortcut',
    tabTitle: 'Quality',
    sections: ['ncrs', 'irs', 'snags', 'audits'],
    opens: { id: 'snags', label: 'Snagging & Punch List', proof: /Snag/i },
  },
  {
    name: 'HSE',
    path: '/hse/control',
    testId: 'hse-shortcut',
    tabTitle: 'HSE',
    sections: ['incidents', 'ptws', 'capas', 'training'],
    opens: { id: 'training', label: 'Safety Training Matrix', proof: /Training/i },
  },
];

const auraTabs = (page: Page) => page.getByRole('tablist', { name: 'Open AURA tabs' }).getByRole('tab');

for (const workspace of WORKSPACES) {
  test(`${workspace.name} sections are addressable and open as AURA tabs beside the workspace`, async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.localStorage.removeItem('aura.record-tabs'));

    await page.goto(workspace.path, { waitUntil: 'domcontentloaded' });
    const tabs = auraTabs(page);
    await expect(tabs).toHaveCount(1);
    await expect(tabs.nth(0)).toContainText(workspace.tabTitle);

    // Every section on the strip is offered as a card — a section the cards cannot reach is exactly
    // the drift this list-in-one-place arrangement exists to prevent.
    const shortcuts = page.getByTestId(workspace.testId);
    await expect(shortcuts).toHaveCount(workspace.sections.length);
    for (const [index, section] of workspace.sections.entries()) {
      const expected = index === 0 ? workspace.path : `${workspace.path}?section=${section}`;
      await expect(shortcuts.nth(index)).toHaveAttribute('href', expected);
      // In-app navigation, never an OS browser tab.
      await expect(shortcuts.nth(index)).not.toHaveAttribute('target', '_blank');
    }

    // Hydration-tolerant: a click before React attaches still navigates (it is a real link) but
    // registers no tab. Returning and clicking again settles that; a card that genuinely opens no
    // tab never reaches two and still fails here.
    await expect(async () => {
      if (new URL(page.url()).search !== '') await page.goto(workspace.path, { waitUntil: 'domcontentloaded' });
      await shortcuts.filter({ has: page.getByText(workspace.opens.label, { exact: true }) }).click({ timeout: 5_000 });
      await page.waitForURL(`**${workspace.path}?section=${workspace.opens.id}`, { timeout: 15_000 });
      await expect(tabs).toHaveCount(2, { timeout: 2_000 });
    }).toPass({ timeout: 60_000, intervals: [250, 500, 1_000] });

    await expect(tabs.nth(0)).toContainText(workspace.tabTitle);
    await expect(tabs.nth(1)).toContainText(workspace.opens.label.split(' ')[0]);
    // The URL drives the section, so the card actually showed the work it advertises.
    await expect(page.getByRole('heading', { name: workspace.opens.proof }).first()).toBeVisible();

    // The landing section keeps ONE address: its card returns to the workspace and adds no tab.
    await shortcuts.nth(0).click();
    await page.waitForURL(`**${workspace.path}`);
    await expect(tabs).toHaveCount(2);

    // The strip stays instant (no navigation) but still writes the URL, so the two controls can
    // never disagree about which section is showing.
    // `exact`: the open AURA tab carries a "Close <section>" button that a loose name match also hits.
    await page.getByRole('button', { name: workspace.opens.label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`\\?section=${workspace.opens.id}$`));
  });
}
