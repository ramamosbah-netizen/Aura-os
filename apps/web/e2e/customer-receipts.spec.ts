// AURA OS — AR-INV-02 on the real Customer Invoices screen: each receipt is a record of its own.
//
// Before this, recording a receipt was a `window.prompt` for an amount that was added to a running
// total — who took which money, when it arrived and against what bank reference existed nowhere, and
// two receipts of 5,000 looked exactly like one of 10,000. Now the screen records the amount, the date
// the money was received and the bank reference, shows every receipt with who recorded it, and the
// Paid column is their sum. Against the running API and PostgreSQL (migration 0400); who may record a
// receipt is proved Auth-ON in apps/api/test/customer-invoice-authority.e2e-spec.ts.
import { expect, test, type Page } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { runId } from './fixtures';

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const RUN = runId();
const NUMBER = `AR-RCPT-${RUN}`;

async function row(page: Page) {
  const r = page.getByRole('row').filter({ hasText: NUMBER }).first();
  await expect(r).toBeVisible({ timeout: 60_000 });
  return r;
}

async function openReceiptForm(page: Page, invoiceId: string): Promise<void> {
  // Server-rendered rows, client handlers: a click can land before hydration and be lost.
  await expect(async () => {
    await (await row(page)).getByRole('button', { name: /^Receipt$/ }).click();
    await expect(page.getByTestId(`receipt-form-${invoiceId}`)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
}

test('a receipt is recorded with its date and bank reference, listed with its recorder, and the paid amount is their sum', async ({ page, request }) => {
  const headers = apiAuthHeaders();
  const created = await request.post(`${API}/finance/customer-invoices`, {
    headers, data: {
      invoiceNumber: NUMBER, customerName: `Receipt Client ${RUN}`, issueDate: '2026-09-20',
      lines: [{ description: 'ELV works', quantity: 1, unitPrice: 1000, vatRate: 5 }],
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const invoice = (await created.json()) as { id: string; total: number };
  expect(invoice.total).toBe(1050);
  const issued = await request.post(`${API}/finance/customer-invoices/${invoice.id}/issue`, { headers, data: {} });
  expect(issued.ok(), await issued.text()).toBe(true);

  await page.goto('/finance/customer-invoices', { waitUntil: 'domcontentloaded' });
  await openReceiptForm(page, invoice.id);
  const form = page.getByTestId(`receipt-form-${invoice.id}`);
  await expect(form.getByLabel('Amount'), 'the outstanding balance is offered').toHaveValue('1050.00');

  // A reference of blanks passes the browser's `required` and must be refused by the server.
  await form.getByLabel('Amount').fill('400');
  await form.getByLabel('Received on').fill('2026-09-27');
  await form.getByLabel('Bank reference').fill('   ');
  await form.getByRole('button', { name: 'Record receipt' }).click();
  await expect(page.getByText(/requires the bank reference it reconciles to/)).toBeVisible({ timeout: 30_000 });

  await form.getByLabel('Bank reference').fill(`TT-${RUN}`);
  await form.getByRole('button', { name: 'Record receipt' }).click();
  const history = page.getByTestId(`receipts-${invoice.id}`);
  await expect(history.getByRole('row').filter({ hasText: `TT-${RUN}` })).toContainText('2026-09-27');
  await expect(history.getByRole('row').filter({ hasText: `TT-${RUN}` })).toContainText('400');
  await expect(history.getByRole('row').filter({ hasText: `TT-${RUN}` })).toContainText('u-admin');
  await expect(await row(page)).toContainText('partially paid');

  // The rest of the money, on a different day and by cheque.
  await openReceiptForm(page, invoice.id);
  await expect(form.getByLabel('Amount')).toHaveValue('650.00');
  await form.getByLabel('Received on').fill('2026-09-28');
  await form.getByLabel('Bank reference').fill(`CHQ-${RUN}`);
  await form.getByRole('button', { name: 'Record receipt' }).click();
  await expect(history.getByRole('row').filter({ hasText: `CHQ-${RUN}` })).toContainText('650');
  await expect(await row(page)).toContainText('paid');

  // PERSISTED: a fresh page reads both receipts back from PostgreSQL, and the Paid column is their sum.
  await page.reload({ waitUntil: 'domcontentloaded' });
  const invoiceRow = await row(page);
  await expect(invoiceRow).toContainText('1,050');
  await expect(async () => {
    await invoiceRow.getByRole('button', { name: 'Receipts' }).click();
    await expect(history).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  await expect(history.locator('tbody tr')).toHaveCount(2);
  await expect(history).toContainText(`TT-${RUN}`);
  await expect(history).toContainText(`CHQ-${RUN}`);

  const listed = await request.get(`${API}/finance/customer-invoices/${invoice.id}/receipts`, { headers });
  const receipts = (await listed.json()) as Array<{ amount: number }>;
  expect(receipts.reduce((s, r) => s + r.amount, 0), 'the invoice reconciles to its receipts').toBe(1050);
});
