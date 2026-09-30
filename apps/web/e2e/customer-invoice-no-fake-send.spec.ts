// AURA OS — the customer invoice screen claims no send that did not happen.
//
// Each invoice row carried an "📧 Email PDF" button. Its modal checked only that a recipient was
// typed, then announced "✅ Tax Invoice PDF sent to … Recorded in audit log." — and called nothing:
// no mail left, no audit entry was written. A finance user believing the client had the invoice is
// exactly the failure a success message must never cause.
//
// AURA cannot email a client yet: its mail delivers to AURA users only (the aura-internal provider;
// no external adapter is connected) and a compose carries no attachment. So the button is gone, and
// the act that does exist — open the tax invoice to print or save as PDF — says so plainly.
import { expect, test } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { runId } from './fixtures';

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const RUN = runId();
const NUMBER = `AR-NOSEND-${RUN}`;

test('no email action claims a send; the print link opens the real tax invoice and states the limit', async ({ page, request }) => {
  const created = await request.post(`${API}/finance/customer-invoices`, {
    headers: apiAuthHeaders(),
    data: { invoiceNumber: NUMBER, customerName: `No-send Client ${RUN}`, issueDate: '2026-09-20', lines: [{ description: 'ELV works', quantity: 1, unitPrice: 1000, vatRate: 5 }] },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const invoice = (await created.json()) as { id: string };

  await page.goto('/finance/customer-invoices', { waitUntil: 'domcontentloaded' });
  const row = page.getByRole('row').filter({ hasText: NUMBER }).first();
  await expect(row).toBeVisible({ timeout: 60_000 });

  // Nothing on the row, or the page, offers to email — and nothing says anything was sent.
  await expect(row.getByRole('button', { name: /email/i })).toHaveCount(0);
  await expect(page.getByText(/Email PDF|Send Email|Log Audit/i)).toHaveCount(0);
  await expect(page.getByText(/sent to .*Recorded in audit log/i)).toHaveCount(0);

  // The act that exists: the tax invoice, to print or save as PDF, with the limitation stated.
  const print = page.getByTestId(`print-invoice-${invoice.id}`);
  await expect(print).toHaveText('🖨 Print / PDF');
  await expect(print).toHaveAttribute('title', /AURA does not email invoices to clients yet/);
  await expect(print).toHaveAttribute('href', `/finance/customer-invoices/${invoice.id}/print`);

  const [printed] = await Promise.all([page.context().waitForEvent('page'), print.click()]);
  await printed.waitForLoadState('domcontentloaded');
  await expect(printed.getByText(NUMBER).first()).toBeVisible({ timeout: 60_000 });
  await printed.close();
});
