// AURA OS — G-34 Site Execution workflow, browser E2E.
// Seeds a daily report + line-items via the BFF, then drives the governed lifecycle through the real
// 360 UI: submit → review → reject → resubmit → approve, verifying the diary sections + an illegal
// transition (409). Skips if the API is not running behind the web shell.
import { expect, test } from '@playwright/test';

const date = `2026-08-${String(10 + (Date.now() % 18)).padStart(2, '0')}`;

test('site execution: dashboard → 360 → submit → review → reject → approve (UI)', async ({ page, baseURL }) => {
  const create = await page.request.post(`${baseURL}/api/site/daily-reports`, {
    data: { projectId: 'e2e-proj', date, workDescription: 'Second fix ELV — L2 west' },
  });
  test.skip(create.status() === 502 || create.status() === 404, 'site API not running behind the web shell');
  expect(create.ok()).toBeTruthy();
  const report = await create.json();
  const api = `${baseURL}/api/site/daily-reports/${report.id}`;

  // Seed diary line-items via the BFF (the 360 renders them read-only).
  await page.request.post(`${api}/labour`, { data: { trade: 'ELV Technician', headcount: 4, hours: 8 } });
  await page.request.post(`${api}/progress`, { data: { description: 'CCTV cameras', boqItemId: 'BOQ-CCTV', plannedQty: 30, installedQty: 24, unit: 'no' } });
  await page.request.post(`${api}/evidence`, { data: { fileId: 'file-abc', category: 'progress', description: 'L2 progress' } });

  // Dashboard lists the report.
  await page.goto('/site/execution', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('reports-table')).toContainText(report.reportNumber);

  // Open the 360 — Draft, with the seeded content visible.
  await page.goto(`/site/execution/${report.id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('report-status')).toHaveText('Draft');
  await expect(page.getByTestId('tab-progress')).toContainText('80%');
  await expect(page.getByTestId('tab-labour')).toContainText('32'); // man-hours
  await expect(page.getByTestId('tab-evidence')).toContainText('L2 progress');

  // Submit → review → REJECT (reopens to draft, shows the reason).
  await page.getByTestId('btn-submit').click();
  await expect(page.getByTestId('report-status')).toHaveText('Submitted');
  await page.getByTestId('btn-start-review').click();
  await expect(page.getByTestId('report-status')).toHaveText('Under Review');
  await page.getByPlaceholder('Rejection reason (required to reject)').fill('Add the helper headcount');
  await page.getByTestId('btn-reject').click();
  await expect(page.getByTestId('report-status')).toHaveText('Draft');
  await expect(page.getByTestId('rejection-note')).toContainText('helper');

  // Resubmit → review → APPROVE → immutable.
  await page.getByTestId('btn-submit').click();
  await page.getByTestId('btn-start-review').click();
  await page.getByTestId('btn-approve').click();
  await expect(page.getByTestId('report-status')).toHaveText('Approved');
  await expect(page.getByTestId('report-locked')).toBeVisible();

  // Illegal transition refused by the backend (submit an approved report → 409).
  const illegal = await page.request.put(`${api}/submit`, { data: {} });
  expect(illegal.status()).toBe(409);
});
