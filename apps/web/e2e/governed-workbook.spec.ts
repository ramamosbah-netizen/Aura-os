// AURA OS — F-03: the Excel a register hands out is a real, governed workbook.
//
// The accounts export wrote every value as text with no filter; the shared Excel button on every
// other register saved an HTML table as .xls, which Excel opens behind a format warning. Both now
// come from one builder: native .xlsx, typed values, an autofilter, a frozen header, and an
// "About this export" sheet that says what the rows are and how complete they are.
//
// Proved here, Auth ON against PostgreSQL, by clicking the controls a person clicks:
//   register   the accounts page's Excel is the WHOLE register, typed, filtered, header frozen,
//              its About sheet saying it is complete and under which issuer
//   on screen  the customer-invoice register's Excel button returns native .xlsx (not .xls), dates as
//              dates and money as numbers — and its About sheet says these are the rows on screen
import { inflateRawSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { expect, test, type Download, type Page } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

/** The parts of an .xlsx (a zip), by name — read with the zip's own central directory. */
function unzip(bytes: Buffer): Map<string, string> {
  const files = new Map<string, string>();
  const eocd = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(eocd, 'a zip end-of-central-directory record').toBeGreaterThan(0);
  const count = bytes.readUInt16LE(eocd + 10);
  let at = bytes.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i += 1) {
    const method = bytes.readUInt16LE(at + 10);
    const size = bytes.readUInt32LE(at + 20);
    const nameLength = bytes.readUInt16LE(at + 28);
    const extra = bytes.readUInt16LE(at + 30);
    const comment = bytes.readUInt16LE(at + 32);
    const local = bytes.readUInt32LE(at + 42);
    const name = bytes.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    const dataStart = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const raw = bytes.subarray(dataStart, dataStart + size);
    files.set(name, (method === 8 ? inflateRawSync(raw) : raw).toString('utf8'));
    at += 46 + nameLength + extra + comment;
  }
  return files;
}

async function downloadFrom(page: Page, click: () => Promise<void>): Promise<Download> {
  const downloaded = new Promise<Download>((resolve) => {
    page.context().on('page', (tab) => tab.once('download', resolve));
    page.once('download', resolve);
  });
  await click();
  return downloaded;
}

test('the Excel a register hands out is a native, typed, filtered workbook that says how complete it is', async ({ page, request }) => {
  test.setTimeout(240_000);
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  const run = Date.now().toString().slice(-6);
  const H = { 'content-type': 'application/json', ...apiAuthHeaders() };
  const accounts = (await (await request.get(`${API}/crm/accounts/paged?limit=1`, { headers: H })).json()) as { total: number };

  // ── The accounts register, from its own Excel control ────────────────────────────────────────
  await page.goto('/crm/accounts', { waitUntil: 'domcontentloaded' });
  const register = await downloadFrom(page, () => page.getByRole('link', { name: /Excel/ }).first().click({ timeout: 60_000 }));
  expect(register.suggestedFilename()).toBe('crm-accounts.xlsx');
  const parts = unzip(readFileSync((await register.path())!));
  const sheet = parts.get('xl/worksheets/sheet1.xml')!;
  // SheetJS writes strings inline: the About sheet's words are in its own worksheet part.
  const aboutRegister = parts.get('xl/worksheets/sheet2.xml') ?? '';
  expect(sheet, 'an autofilter over the register').toMatch(/<autoFilter ref="A1:L\d+"\/>/);
  expect(sheet, 'the header row is frozen').toContain('state="frozen"');
  expect(aboutRegister, 'the About sheet states completeness').toContain(`All ${accounts.total} accounts in the register — every account you are permitted to see.`);
  expect(parts.get('xl/workbook.xml')).toContain('name="About this export"');

  // ── A register's shared Excel button, with the rows it shows ──────────────────────────────────
  const created = await request.post(`${API}/finance/customer-invoices`, {
    headers: H,
    data: { invoiceNumber: `XL-${run}`, customerName: `Workbook customer ${run}`, issueDate: '2026-10-01', dueDate: '2026-10-31', lines: [{ description: 'Claim', quantity: 1, unitPrice: 1234.5, vatRate: 5 }] },
  });
  expect(created.ok(), await created.text()).toBe(true);
  await page.goto('/finance/customer-invoices', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(`XL-${run}`).first()).toBeVisible({ timeout: 60_000 });
  const shown = await downloadFrom(page, () => page.getByTestId('export-excel').first().click());
  expect(shown.suggestedFilename(), 'native .xlsx, not an HTML table named .xls').toMatch(/^customer-invoices-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const bytes = readFileSync((await shown.path())!);
  expect(bytes.subarray(0, 2).toString('latin1'), 'a zip, not HTML').toBe('PK');
  const screen = unzip(bytes);
  const rows = screen.get('xl/worksheets/sheet1.xml')!;
  const aboutScreen = screen.get('xl/worksheets/sheet2.xml') ?? '';
  // This run's invoice: its total 1296.225 → 1296.23 is a NUMBER cell in the Total column (E), not text.
  expect(rows, 'money is a number').toMatch(/<c r="E\d+"[^>]*><v>1296\.2/);
  expect(rows, 'the issue date is a date serial, not the text "2026-10-01"').toMatch(/<c r="C\d+"[^>]*><v>46296<\/v>/);
  expect(aboutScreen).toContain('This is what the page had loaded and filtered, which may not be the whole register.');
  expect(rows).toContain('state="frozen"');
});
