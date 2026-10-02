// AURA OS — F-12: a client BOQ is read, shown, and only then written — and nothing is guessed.
//
// The import used to write on the first click: pasted lines that did not parse vanished without a
// word, an unreadable quantity became 0 (under text promising "nothing is invented"), an Excel
// file's problem rows were reported only after the write, and "replace" could wipe the BOQ and its
// estimates in the same click. There is no OCR or AI in it, and the page now says so.
//
// Proved here, Auth ON against PostgreSQL, on the tender's BOQ workspace:
//   paste    lines are checked by the server's one parser; the review lists the rows with their
//            line numbers and every line not imported with why; NOTHING is written until "Import";
//            then exactly the reviewed rows are
//   excel    a workbook (made by AURA's own governed workbook) is read with dryRun and reviewed;
//            going Back writes nothing
//   replace  the review says how many existing lines replacing would remove
import { expect, test } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

test('a client BOQ is reviewed before it is written, from paste and from Excel', async ({ page, request }) => {
  test.setTimeout(240_000);
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  const H = { 'content-type': 'application/json', ...apiAuthHeaders() };
  const run = Date.now().toString().slice(-6);
  const created = await request.post(`${API}/tendering/tenders`, { headers: H, data: { title: `BOQ review probe ${run}`, value: 0 } });
  expect(created.ok(), await created.text()).toBe(true);
  const tender = (await created.json()) as { id: string };
  const items = async () => ((await (await request.get(`${API}/tendering/tenders/${tender.id}/boq`, { headers: H })).json()) as { items: Array<{ itemCode: string; quantity: number }> }).items;
  expect(await items()).toHaveLength(0);

  await page.goto(`/tendering/tenders/${tender.id}/boq`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Import client BOQ' }).first().click({ timeout: 60_000 });
  const dialog = page.getByTestId('boq-import-dialog');
  await expect(dialog).toContainText('AURA does not read PDFs or images');

  // ── Paste: checked, shown, not written ─────────────────────────────────────────────────────────
  await dialog.getByTestId('boq-import-text').fill([
    `C-${run}-1, CCTV camera, no, 24, 650`,
    `C-${run}-2, Cable tray, m, TBD, 30`,
    `C-${run}-3, Patch panel, no, 4, 120`,
    `C-${run}-4, Cable, CAT6, 305m roll, box, 10, 120`,
  ].join('\n'));
  await dialog.getByTestId('boq-import-check').click();
  await expect(dialog.getByTestId('boq-import-summary')).toHaveText('2 row(s) will be imported · 2 line(s) will not be, or carry a note', { timeout: 30_000 });
  await expect(dialog.getByTestId('boq-import-rows')).toContainText(`C-${run}-1`);
  const issues = dialog.getByTestId('boq-import-issues');
  await expect(issues).toContainText('Line 2 — quantity "TBD" is not a number');
  await expect(issues).toContainText('Line 4 — has 7 fields');
  expect(await items(), 'reviewing writes nothing').toHaveLength(0);

  await dialog.getByTestId('boq-import-confirm').click();
  await expect(dialog).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText('Imported 2 reviewed line(s). 2 line(s) were not imported')).toBeVisible({ timeout: 30_000 });
  expect((await items()).map((i) => [i.itemCode, i.quantity]).sort()).toEqual([[`C-${run}-1`, 24], [`C-${run}-3`, 4]]);

  // ── Excel: an AURA-made workbook, read with dryRun, reviewed, abandoned ───────────────────────
  const workbook = await request.post(`${API}/documents/workbook`, {
    headers: H,
    data: {
      title: 'BOQ', filename: `boq-${run}`,
      columns: [{ key: 'code', label: 'Item Code' }, { key: 'description', label: 'Description' }, { key: 'unit', label: 'Unit' }, { key: 'qty', label: 'Qty', type: 'number' }, { key: 'rate', label: 'Rate', type: 'money' }],
      rows: [{ code: `X-${run}-1`, description: 'Access reader', unit: 'no', qty: 12, rate: 900 }, { code: `X-${run}-2`, description: 'Maglock', unit: 'no', qty: 12, rate: 450 }],
    },
  });
  expect(workbook.ok(), await workbook.text()).toBe(true);
  await page.getByRole('button', { name: 'Import client BOQ' }).first().click();
  await dialog.getByTestId('boq-import-file').setInputFiles({ name: `boq-${run}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await workbook.body() });
  await expect(dialog.getByTestId('boq-import-summary')).toContainText('2 row(s) will be imported', { timeout: 30_000 });
  await expect(dialog).toContainText(`From boq-${run}.xlsx; header found on row 1. Row numbers are as in Excel.`);
  await expect(dialog.getByTestId('boq-import-rows')).toContainText(`X-${run}-2`);
  // Replacing would remove the two lines already imported, and the review says so before it happens.
  await dialog.getByTestId('boq-import-replace').check();
  await expect(dialog.getByTestId('boq-import-replace-warning')).toHaveText('This removes the 2 existing line(s), and their estimates go with them.');
  await dialog.getByRole('button', { name: 'Back' }).click();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect((await items()).map((i) => i.itemCode).sort(), 'an abandoned review writes nothing').toEqual([`C-${run}-1`, `C-${run}-3`]);
});
