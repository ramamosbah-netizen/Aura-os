import { expect, test } from '@playwright/test';

/**
 * Favourites — the toggle, end to end, through a real SavedView.
 *
 * A favourite is not a new concept: it is a SavedView for the current route with no querystring.
 * What this proves is the part a unit test cannot — that the state SURVIVES A RELOAD, because it
 * lives on the server and not in this tab's memory, and that clicking twice leaves nothing behind
 * rather than two rows.
 *
 * The suite runs authenticated (`storageState`), which matters: favouriting requires a real actor,
 * since a favourite with no owner would silently become a tenant-wide view.
 */

const PAGE = '/crm/accounts';

test.describe('favourite the current page', () => {
  test.afterEach(async ({ page }) => {
    // Leave no favourite behind for the next run, whatever the test did.
    await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
    const button = page.getByTestId('favorite-page');
    if (await button.count()) {
      await expect(button).toBeEnabled();
      if ((await button.textContent())?.includes('Remove')) await button.click();
    }
  });

  test('add, survive a reload, then remove — and never twice', async ({ page }) => {
    await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
    const button = page.getByTestId('favorite-page');

    // It reads its state from the server on mount, so wait for that rather than the initial guess.
    await expect(button).toBeEnabled();
    await expect(button).toHaveText(/Add to Favorites/);

    await button.click();
    await expect(button).toHaveText(/Remove from Favorites/);

    // THE POINT: a refresh re-reads from the server. A tab-local flag would lose this.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('favorite-page')).toHaveText(/Remove from Favorites/);

    // …and it shows up where favourites are listed.
    await page.goto('/my-work/favorites', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: new RegExp(PAGE) }).first()).toBeVisible();

    // Toggling off removes it — one row existed, so one row goes.
    await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
    const again = page.getByTestId('favorite-page');
    await expect(again).toHaveText(/Remove from Favorites/);
    await again.click();
    await expect(again).toHaveText(/Add to Favorites/);

    await page.goto('/my-work/favorites', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: new RegExp(PAGE) })).toHaveCount(0);
  });

  test('favouriting twice cannot create a duplicate', async ({ page }) => {
    await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
    const button = page.getByTestId('favorite-page');
    await expect(button).toBeEnabled();

    await button.click();                                   // on
    await expect(button).toHaveText(/Remove from Favorites/);
    await button.click();                                   // off
    await expect(button).toHaveText(/Add to Favorites/);
    await button.click();                                   // on again
    await expect(button).toHaveText(/Remove from Favorites/);

    // Exactly one entry, not three. The unique index enforces this even if the UI misbehaved.
    await page.goto('/my-work/favorites', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: new RegExp(PAGE) })).toHaveCount(1);
  });
});
