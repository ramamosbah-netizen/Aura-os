// AURA OS — the compliance journey, driven through the UI (G-20 / ADR-0018).
//
// Written after N-04, where a Control Center was reported "100% verified" on typecheck, unit
// tests, lint and build — none of which can open a page. So this drives the real screen: the
// empty state a fresh install actually shows, registering an authority, opening a case, and
// reading back the history that the append-only model exists to preserve.
import { expect, test, type Page } from '@playwright/test';
import { runId } from './fixtures';

const UNIQUE = runId();
// Uppercased deliberately: the domain normalises an authority code on write
// (modules/compliance/src/domain/authority.ts), so the canonical form is what the register renders
// and what the assertions below must look for. The previous marker was all digits, which hid this.
const CODE = `E2E${UNIQUE}`.toUpperCase();

/** The page is a client component behind a suspense boundary; wait for it, never a fixed delay. */
async function open(page: Page): Promise<void> {
  await page.goto('/compliance', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Register authority/i }).first().waitFor({ state: 'visible', timeout: 60_000 });
}

test.describe('compliance register', () => {
  test('renders without a client-side exception', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page);
    expect(errors, errors.join(' · ')).toEqual([]);
  });

  test('a fresh install says it has no authorities and offers the one action that helps', async ({ page }) => {
    await open(page);
    const body = await page.locator('body').innerText();

    // Only meaningful before any authority exists; once the suite registers one this is history.
    if (/No authorities registered/i.test(body)) {
      // The empty state must explain WHY it is empty — shipping no regulatory rules is a decision,
      // not an oversight, and a blank table would read as the latter.
      expect(body).toMatch(/never assumed|published requirements/i);
    }
  });

  test('registers an authority and shows it in the register', async ({ page }) => {
    await open(page);

    await page.getByPlaceholder('SIRA').first().fill(CODE);
    await page.getByPlaceholder(/Security Industry Regulatory Agency/i).first().fill(`Probe Authority ${UNIQUE}`);
    await page.getByRole('button', { name: /Register authority/i }).first().click();

    // Scoped to a table cell: getByText would also match the hidden <option> the select gains,
    // which is present but not visible and says nothing about the register rendering.
    await expect(page.getByRole('cell', { name: CODE, exact: true }).first()).toBeVisible({ timeout: 30_000 });
  });

  test('opens a case against that authority and lists it', async ({ page }) => {
    await open(page);

    // By label, not by position — this also asserts the field is actually associated with its
    // label, which a positional locator would have let slip.
    const authoritySelect = page.getByLabel('Authority');
    await authoritySelect.waitFor({ state: 'visible', timeout: 30_000 });
    await authoritySelect.selectOption(CODE);

    await page.getByPlaceholder('SYSTEM_CERTIFICATION').fill('E2E_OBLIGATION');
    await page.getByPlaceholder('uuid').fill('11111111-1111-1111-1111-111111111111');
    await page.getByRole('button', { name: /^Open case$/i }).click();

    await expect(page.getByText('E2E_OBLIGATION').first()).toBeVisible({ timeout: 30_000 });
  });

  test('shows the case history — submissions, inspections, decisions, certificates', async ({ page }) => {
    await open(page);

    const historyButton = page.getByRole('button', { name: /^History$/ }).first();
    await historyButton.waitFor({ state: 'visible', timeout: 30_000 });
    await historyButton.click();

    // All four series are surfaced. The UI must not collapse them to "current status" — the whole
    // reason decisions and certificates are append-only is that the history is the record.
    for (const heading of ['Submissions', 'Inspections', 'Decisions', 'Certificates']) {
      await expect(page.getByText(heading, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    }

    // Inspections are optional, and the UI says so rather than showing an empty box.
    await expect(page.getByText(/not every obligation requires one/i).first()).toBeVisible();
  });

  test('filters the register by authority — one list, not one screen per regulator', async ({ page }) => {
    await open(page);

    const filter = page.locator('select').filter({ has: page.locator('option', { hasText: 'All authorities' }) }).first();
    await filter.waitFor({ state: 'visible', timeout: 30_000 });
    await filter.selectOption(CODE);

    await expect(page.getByText('E2E_OBLIGATION').first()).toBeVisible({ timeout: 20_000 });
  });
});
