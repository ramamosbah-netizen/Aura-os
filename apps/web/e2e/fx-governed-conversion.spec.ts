import { expect, test } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * FX-02 on screen — the FX page stops contradicting itself.
 *
 * This page has always had two halves: a list of the rates somebody governed, and a converter. Until
 * now the converter did not consult that list. It answered from `getRate()`, which returned a
 * hardcoded peg for any pair the list did not cover — so a finance user could read "no GBP rate" in
 * the table and convert GBP in the box directly beneath it, at a constant nobody had approved.
 *
 * Now the two halves agree. An ungoverned pair is refused in the domain's own words, on the very
 * screen where the fix is a single form away; a governed pair converts and says WHICH rate did it.
 *
 * Runs against the real API and PostgreSQL.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

test.describe('The FX page converts only at a governed rate', () => {
  test.setTimeout(180_000);

  test('refuses an ungoverned pair, and converts a governed one with its provenance', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');

    /**
     * EUR→GBP is the refusal pair, and GBP→AED is the conversion pair — deliberately different.
     *
     * An earlier version of this spec refused GBP→AED and then registered GBP→AED to prove the
     * positive case. It passed once and failed on every run after, because its own second half made
     * its first half false. A spec that only works against a fresh database is not a spec.
     *
     * Nothing registers a EUR/GBP rate in either direction, and this resolver does not cross-rate,
     * so that pair stays ungoverned however many times this runs. Asserted, not assumed.
     */
    const probe = await request.get(`${API}/finance/fx/governed-rate`, {
      params: { from: 'EUR', to: 'GBP' },
      headers: apiAuthHeaders(),
    });
    expect((await probe.json()).status, 'EUR/GBP must be ungoverned for this spec to mean anything').toBe('unknown');

    await page.goto('/finance/fx', { waitUntil: 'domcontentloaded' });

    // ── 1. AN UNGOVERNED PAIR IS REFUSED, IN WORDS ────────────────────────
    await expect(async () => {
      await page.getByTestId('fx-convert-from').selectOption('EUR');
      await page.getByTestId('fx-convert-to').selectOption('GBP');
      await page.getByTestId('fx-convert-submit').click();
      await expect(page.getByTestId('fx-error')).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 60_000 });

    await expect(page.getByTestId('fx-error')).toContainText('No governed EUR/GBP exchange rate is available');
    await expect(page.getByTestId('fx-error')).toContainText('must be registered');
    // Nothing is shown as a result — no number appears beside the refusal.
    await expect(page.getByTestId('fx-convert-result')).toHaveCount(0);

    await page.screenshot({ path: 'test-results/fx-02-refusal.png' });

    // ── 2. A GOVERNED PAIR CONVERTS, AND SAYS WHICH RATE DID IT ───────────
    const registered = await request.post(`${API}/finance/fx/rates`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
      data: { from: 'GBP', to: 'AED', rate: 4.9123, effectiveDate: '2026-09-01' },
    });
    expect(registered.ok(), await registered.text()).toBe(true);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(async () => {
      await page.getByTestId('fx-convert-from').selectOption('GBP');
      await page.getByTestId('fx-convert-to').selectOption('AED');
      await page.getByTestId('fx-convert-submit').click();
      await expect(page.getByTestId('fx-convert-result')).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 60_000 });

    const result = page.getByTestId('fx-convert-result');
    await expect(result).toContainText('4.9123');
    // The provenance is the point: a converted figure with no date and no source is exactly what
    // FX-01 and FX-02 were about.
    await expect(page.getByTestId('fx-convert-provenance')).toContainText('governed rate effective 2026-09-01');
  });
});
