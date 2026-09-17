import { expect, test } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * FX-01 on screen — the user is TOLD why the invoice was refused, and keeps what they typed.
 *
 * The two things this exists to hold, because both are ways a correct backend still fails a person:
 *
 *   The refusal is SPECIFIC. "No governed GBP/AED exchange rate is available for 10 Sep 2026" is
 *   actionable — register that rate, or change the currency. A generic "Error 400" is not, and a
 *   silent failure is worse than either.
 *
 *   The FORM SURVIVES it. Losing a half-typed supplier invoice because a rate was missing punishes
 *   the user for the system's gap. The drawer stays open, every value stays put, and correcting the
 *   currency and re-submitting works — without retyping anything.
 *
 * It runs against the REAL API and PostgreSQL. The API e2e suite cannot prove any of this: it has
 * no browser, and it runs on in-memory stores.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

test.describe('An invoice in a currency with no governed rate', () => {
  test.setTimeout(180_000);

  test('is refused in words the user can act on, and the form keeps what they typed', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);

    // GBP is deliberately left ungoverned. Assert that, rather than assuming it: a rate registered
    // by another spec would turn this into a test of nothing.
    const probe = await request.get(`${API}/finance/fx/governed-rate`, {
      params: { from: 'GBP', to: 'AED', asOf: '2026-09-10' },
      headers: apiAuthHeaders(),
    });
    expect(probe.ok()).toBe(true);
    expect((await probe.json()).status, 'GBP must be ungoverned for this spec to mean anything').toBe('unknown');

    await page.goto('/finance/invoices', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('create-invoice').click();
    await expect(page.getByTestId('drawer-invoice')).toBeVisible({ timeout: 30_000 });

    const title = `GBP supplier ${run}`;
    await page.getByTestId('field-title').fill(title);
    await page.getByTestId('field-value').fill('100000');
    await page.getByTestId('field-supplierName').fill(`Thames ELV ${run}`);
    await page.getByTestId('field-invoiceDate').fill('2026-09-10');
    await page.getByTestId('field-currency').selectOption('GBP');

    await page.getByTestId('submit-invoice').click();

    // ── 1. THE REFUSAL NAMES THE PAIR AND THE DATE ────────────────────────────
    const error = page.getByTestId('drawer-error-invoice');
    await expect(error).toBeVisible({ timeout: 30_000 });
    await expect(error).toContainText('No governed GBP/AED exchange rate is available for 10 Sep 2026');
    await expect(error).toContainText('must be registered');

    // The refusal as the user sees it, saved as evidence rather than described.
    await page.getByTestId('drawer-invoice').screenshot({ path: 'test-results/fx-01-refusal.png' });

    // ── 2. NOTHING WAS BOOKED ────────────────────────────────────────────────
    const listed = await request.get(`${API}/finance/invoices`, { headers: apiAuthHeaders() });
    expect((await listed.json()).some((i: { title?: string }) => i.title === title)).toBe(false);

    // ── 3. AND THE FORM STILL HAS EVERYTHING THE USER TYPED ──────────────────
    await expect(page.getByTestId('drawer-invoice')).toBeVisible();
    await expect(page.getByTestId('field-title')).toHaveValue(title);
    await expect(page.getByTestId('field-value')).toHaveValue('100000');
    await expect(page.getByTestId('field-supplierName')).toHaveValue(`Thames ELV ${run}`);
    await expect(page.getByTestId('field-invoiceDate')).toHaveValue('2026-09-10');
    await expect(page.getByTestId('field-currency')).toHaveValue('GBP');

    // ── 4. THE USER CORRECTS THE CURRENCY AND RE-SUBMITS, RETYPING NOTHING ───
    await page.getByTestId('field-currency').selectOption('AED');
    await page.getByTestId('submit-invoice').click();
    await expect(page.getByTestId('drawer-invoice')).toBeHidden({ timeout: 30_000 });

    const after = await request.get(`${API}/finance/invoices`, { headers: apiAuthHeaders() });
    const booked = (await after.json()).find((i: { title?: string }) => i.title === title);
    expect(booked, 'the corrected invoice is booked').toBeTruthy();
    expect(booked.currency).toBe('AED');
    expect(booked.value).toBe(100000);
  });

  test('books a foreign-currency invoice once a rate governs its date, citing that rate', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);

    // A governed SAR rate, registered through the API the same way a finance user would.
    const registered = await request.post(`${API}/finance/fx/rates`, {
      headers: { 'content-type': 'application/json', ...apiAuthHeaders() },
      data: { from: 'SAR', to: 'AED', rate: 0.9793, effectiveDate: '2026-09-01' },
    });
    expect(registered.ok(), await registered.text()).toBe(true);

    await page.goto('/finance/invoices', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('create-invoice').click();
    await expect(page.getByTestId('drawer-invoice')).toBeVisible({ timeout: 30_000 });

    const title = `SAR supplier ${run}`;
    await page.getByTestId('field-title').fill(title);
    await page.getByTestId('field-value').fill('10000');
    await page.getByTestId('field-invoiceDate').fill('2026-09-10');
    await page.getByTestId('field-currency').selectOption('SAR');
    await page.getByTestId('submit-invoice').click();
    await expect(page.getByTestId('drawer-invoice')).toBeHidden({ timeout: 30_000 });

    // Booked at the governed rate, and carrying WHICH governed rate did it — read back from the
    // database through the API, not from the page's own optimistic state.
    const after = await request.get(`${API}/finance/invoices`, { headers: apiAuthHeaders() });
    const booked = (await after.json()).find((i: { title?: string }) => i.title === title);
    expect(booked).toMatchObject({
      currency: 'SAR', exchangeRate: 0.9793, baseValue: 9793,
      invoiceDate: '2026-09-10', exchangeRateEffectiveDate: '2026-09-01', exchangeRateSource: 'stored',
    });
    expect(booked.exchangeRateId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('AR — a client invoice is refused the same way, and keeps what was typed', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);

    // The AR half of the remediation, on the surface a Finance user actually uses. Asserted
    // ungoverned first, so a rate left behind by another spec cannot turn this into a no-op.
    const probe = await request.get(`${API}/finance/fx/governed-rate`, {
      params: { from: 'USD', to: 'AED', asOf: '2026-09-10' },
      headers: apiAuthHeaders(),
    });
    expect((await probe.json()).status, 'USD must be ungoverned for this spec to mean anything').toBe('unknown');

    await page.goto('/finance/customer-invoices', { waitUntil: 'domcontentloaded' });
    // The trigger is server-rendered and the drawer is client state, so a single click can land
    // before React has attached its handler and simply be lost — the same retry the rest of this
    // suite uses.
    await expect(async () => {
      await page.getByTestId('create-customer-invoice').click();
      await expect(page.getByTestId('drawer-customer-invoice')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 60_000 });

    const number = `AR-${run}`;
    await page.getByTestId('field-invoiceNumber').fill(number);
    await page.getByTestId('field-issueDate').fill('2026-09-10');
    await page.getByTestId('field-customerName').fill(`US Client ${run}`);
    await page.getByTestId('field-currency').selectOption('USD');
    // The line editor is addressed by its accessible labels — it has no testids, and adding some
    // purely to be testable would be the test shaping the product.
    await page.getByLabel('Line items, line 1, description').fill('CCTV supply');
    await page.getByLabel('Line items, line 1, quantity').fill('1');
    await page.getByLabel('Line items, line 1, unit price').fill('50000');
    await page.getByTestId('submit-customer-invoice').click();

    const error = page.getByTestId('drawer-error-customer-invoice');
    await expect(error).toBeVisible({ timeout: 30_000 });
    await expect(error).toContainText('No governed USD/AED exchange rate is available for 10 Sep 2026');

    // Nothing booked, and the invoice NUMBER is still free — the refusal consumed no identifier.
    const listed = await request.get(`${API}/finance/customer-invoices`, { headers: apiAuthHeaders() });
    expect((await listed.json()).some((i: { invoiceNumber?: string }) => i.invoiceNumber === number)).toBe(false);

    // The form kept everything, including the line item.
    await expect(page.getByTestId('field-invoiceNumber')).toHaveValue(number);
    await expect(page.getByTestId('field-customerName')).toHaveValue(`US Client ${run}`);
    await expect(page.getByLabel('Line items, line 1, unit price')).toHaveValue('50000');
  });
});
