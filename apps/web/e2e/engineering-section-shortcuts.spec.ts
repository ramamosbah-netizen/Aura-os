import { expect, test } from '@playwright/test';

/**
 * The Engineering workspace's sections are ADDRESSABLE, and its Overview offers them as the same
 * shortcut cards Sales and the Delivery Operations overview use.
 *
 * Before this, the sections were local component state behind a strip of buttons: there was no URL
 * for "the RFIs I am working on", so they could not be deep-linked, could not be reopened, and could
 * not be held open two at a time — reaching Submittals always cost you RFIs. The cards fix that by
 * having somewhere to go, which is why the `?section=` URL and the grid are one change and are
 * asserted together here.
 */
const SECTIONS = {
  'Shop Drawings': 'drawings',
  RFIs: 'rfis',
  'Technical Submittals': 'submittals',
  'Technical Queries': 'technical-queries',
  'Design Changes': 'design-changes',
  Documents: 'documents',
  'BIM Models': 'bim-models',
} as const;

test('Engineering sections are addressable and open as AURA tabs beside the workspace', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.localStorage.removeItem('aura.record-tabs'));

  await page.goto('/engineering', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Engineering workspace' })).toBeVisible();

  const auraTabs = page.getByRole('tablist', { name: 'Open AURA tabs' }).getByRole('tab');
  await expect(auraTabs).toHaveCount(1);
  await expect(auraTabs.nth(0)).toContainText('Engineering');

  const shortcuts = page.getByTestId('engineering-shortcut');
  await expect(shortcuts).toHaveCount(Object.keys(SECTIONS).length);
  for (const [label, section] of Object.entries(SECTIONS)) {
    const shortcut = shortcuts.filter({ has: page.getByText(label, { exact: true }) });
    await expect(shortcut).toHaveAttribute('href', `/engineering?section=${section}`);
    // In-app navigation, never an OS browser tab — the same contract the Operations shortcuts hold.
    await expect(shortcut).not.toHaveAttribute('target', '_blank');
  }

  // Hydration-tolerant: a click before React attaches still navigates (it is a real link) but
  // registers no tab. Returning and clicking again settles that; a shortcut that genuinely fails to
  // open a tab never reaches two and still fails here.
  const rfiForm = page.getByRole('heading', { name: 'Raise Request For Information (RFI)' });
  await expect(async () => {
    if (new URL(page.url()).search !== '') await page.goto('/engineering', { waitUntil: 'domcontentloaded' });
    await shortcuts.filter({ has: page.getByText('RFIs', { exact: true }) }).click({ timeout: 5_000 });
    await page.waitForURL('**/engineering?section=rfis', { timeout: 15_000 });
    await expect(auraTabs).toHaveCount(2, { timeout: 2_000 });
  }).toPass({ timeout: 60_000, intervals: [250, 500, 1_000] });

  // The URL is the source of truth for the section, so the card actually showed RFIs…
  await expect(rfiForm).toBeVisible();
  // …and the workspace kept its own tab, with the section opened beside it.
  await expect(auraTabs.nth(0)).toContainText('Engineering');
  await expect(auraTabs.nth(1)).toContainText('RFIs');

  // A section URL is a real address: reopening it cold lands on the section, not on Overview.
  await page.goto('/engineering?section=submittals', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Submittal/ }).first()).toBeVisible();

  // The top strip is gone: it was the same eight destinations as the cards, and the cards are the
  // half that can hold two sections open at once. What had to survive its removal is the WAY BACK —
  // so that is what is asserted now, from a section URL opened cold.
  await expect(
    page.getByRole('button', { name: 'Design Changes' }),
    'the duplicate strip must not come back',
  ).toHaveCount(0);

  const workspaceTab = page.getByRole('tablist', { name: 'Open AURA tabs' }).getByRole('tab').first();
  await expect(workspaceTab, "the workspace keeps its own tab, and that is the way back").toContainText('Engineering');
  await workspaceTab.click();
  await expect(page).toHaveURL(/\/engineering$/);
  await expect(page.getByRole('heading', { name: 'Pre-award technical context' })).toBeVisible();
});
