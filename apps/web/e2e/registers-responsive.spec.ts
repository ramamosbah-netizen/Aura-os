import { expect, test, type Page } from '@playwright/test';

/**
 * The registers display on every screen.
 *
 * This asserts a property, not an appearance, because appearance is what the last two attempts at
 * this kept arguing about. The property is: A PAGE NEVER SCROLLS SIDEWAYS.
 *
 * A register table cannot be made narrow — a purchase order row carries seven columns and none of
 * them is optional. Left uncontained it sets the width of the whole document rather than its own
 * panel, and then the header, the headline figures and the navigation all slide off the screen
 * together when somebody drags the table. Measured on the purchase orders register at 375px before
 * this was fixed: a 616px table in a 341px panel, and 266px of document scroll.
 *
 * The Sales registers never had it, because each one wraps its table in an overflow container. The
 * assertion below is the same thing stated as a test: the DOCUMENT must not scroll, and where a
 * table is genuinely too wide, the scrolling must belong to a container INSIDE the page.
 */

const REGISTERS = [
  '/procurement/purchase-orders',
  '/procurement/purchase-requests',
  '/inventory/grns',
  '/inventory/stock',
];

/** Reads the page's own overflow, and who owns any table's scrolling. */
async function measure(page: Page): Promise<{ sideways: number; tables: number; uncontained: string[] }> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const tables = [...document.querySelectorAll('table')];
    return {
      sideways: doc.scrollWidth - doc.clientWidth,
      tables: tables.length,
      // A table wider than the space it has must sit in a container that scrolls. Anything else
      // means the page itself is absorbing the overflow.
      uncontained: tables
        .filter((t) => {
          const holder = t.closest<HTMLElement>('.table-scroll');
          if (holder) return false;
          const parent = t.parentElement;
          return !!parent && t.scrollWidth > parent.clientWidth + 1;
        })
        .map((t) => (t.querySelector('th')?.textContent ?? 'unnamed').trim()),
    };
  });
}

test.describe('The registers display on every screen', () => {
  test.setTimeout(180_000);

  for (const width of [375, 768, 1440]) {
    test(`no register scrolls the page sideways at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });

      for (const route of REGISTERS) {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        // The tables are server-rendered, but the register chrome is client state — wait for the
        // headline row so the measurement is taken against the page a person actually sees.
        await page.getByTestId('register-kpis').first().waitFor({ state: 'visible', timeout: 30_000 });

        const { sideways, uncontained } = await measure(page);

        expect(sideways, `${route} at ${width}px scrolls the document sideways by ${sideways}px — ` +
          'the header and the navigation slide off with it').toBeLessThanOrEqual(1);
        expect(uncontained, `${route} at ${width}px has a table wider than its parent and no ` +
          'container to scroll it, so the page absorbs the overflow').toEqual([]);
      }
    });
  }

  test('a wide table scrolls inside its own panel rather than moving the page', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto('/procurement/purchase-orders', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('register-kpis').first().waitFor({ state: 'visible', timeout: 30_000 });

    // This is the positive half: containment must not be achieved by hiding the columns. The table
    // is still its full width and still reachable — the scrolling simply belongs to the panel.
    const containment = await page.evaluate(() => {
      const table = document.querySelector('table');
      const holder = table?.closest<HTMLElement>('.table-scroll');
      if (!table || !holder) return null;
      return {
        tableWider: table.scrollWidth > holder.clientWidth,
        holderScrolls: holder.scrollWidth > holder.clientWidth,
        overflowX: getComputedStyle(holder).overflowX,
      };
    });

    expect(containment, 'the orders table is not inside a scroll container').not.toBeNull();
    expect(containment!.tableWider, 'the table should still be its full width at 375px').toBe(true);
    expect(containment!.holderScrolls, 'the container should be the thing that scrolls').toBe(true);
    expect(containment!.overflowX).toBe('auto');
  });
});
