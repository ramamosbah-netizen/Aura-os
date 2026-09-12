import { expect, test } from '@playwright/test';

/**
 * The Delivery Operations overview launches a discipline the way a Sales suite dashboard launches a
 * workspace: in the SAME window, as an AURA tab, with the launching page keeping a tab of its own.
 *
 * This was first built with `target="_blank"`, which reads as "keep this page open" but is a
 * different product: it opens an OS browser tab and leaves AURA's own tab strip — the thing that
 * actually carries open work — untouched, so the overview was still lost from it. Both halves of the
 * real contract are asserted here, because either one alone passes for the wrong reason: the overview
 * registers ITSELF (otherwise there is nothing to come back to), and a shortcut click adds a tab
 * BESIDE it (otherwise the overview is replaced).
 */
const SHORTCUTS = {
  Engineering: '/engineering',
  Site: '/site/control',
  Quality: '/quality/control',
  HSE: '/hse/control',
  'Testing & commissioning': '/commissioning',
  Handover: '/handover',
  Reports: '/operations/reports',
} as const;

test('the operations overview keeps its own AURA tab when a discipline shortcut is opened', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.localStorage.removeItem('aura.record-tabs'));

  await page.goto('/operations/overview', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('delivery-operations-overview')).toBeVisible();

  const auraTabs = page.getByRole('tablist', { name: 'Open AURA tabs' }).getByRole('tab');
  await expect(auraTabs).toHaveCount(1);
  await expect(auraTabs.nth(0)).toContainText('Execution Command Center');

  const shortcuts = page.getByTestId('operations-shortcut');
  await expect(shortcuts).toHaveCount(Object.keys(SHORTCUTS).length);
  for (const [label, href] of Object.entries(SHORTCUTS)) {
    const shortcut = shortcuts.filter({ has: page.getByText(label, { exact: true }) });
    await expect(shortcut).toHaveAttribute('href', href);
    // Same contract the My Work shortcuts hold to: an in-app navigation, never an OS browser tab.
    await expect(shortcut).not.toHaveAttribute('target', '_blank');
  }

  // Hydration-tolerant. A click landing before React attaches still NAVIGATES — it is a real link —
  // but registers no tab, which is exactly the failure this test exists to catch, so it must not be
  // confused with a timing artefact. Returning and clicking again settles it once the handler wires
  // up; a genuinely broken shortcut never reaches two tabs and still fails. (`/engineering` registers
  // no anchor tab of its own, so the second tab can only have come from the click.)
  await expect(async () => {
    if (!new URL(page.url()).pathname.startsWith('/operations/overview')) {
      await page.goto('/operations/overview', { waitUntil: 'domcontentloaded' });
    }
    await shortcuts.filter({ has: page.getByText('Engineering', { exact: true }) }).click({ timeout: 5_000 });
    await page.waitForURL('**/engineering', { timeout: 15_000 });
    await expect(auraTabs).toHaveCount(2, { timeout: 2_000 });
  }).toPass({ timeout: 60_000, intervals: [250, 500, 1_000] });

  await expect(auraTabs.nth(0)).toContainText('Execution Command Center');
  await expect(auraTabs.nth(1)).toContainText('Engineering');
  // The tab type proves the click registered it (the shortcut grid stamps the launching suite),
  // rather than the destination page having quietly anchored a tab for itself.
  await expect(auraTabs.nth(1)).toContainText('Delivery Operations');

  // …and "kept open" means reachable, not merely listed: the overview's tab goes back to it.
  await auraTabs.nth(0).click();
  await page.waitForURL('**/operations/overview');
  await expect(page.getByTestId('delivery-operations-overview')).toBeVisible();
  await expect(auraTabs).toHaveCount(2);
});
