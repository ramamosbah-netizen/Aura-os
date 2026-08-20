// AURA OS — QA/QC NCR workflow, browser E2E.
// Drives the corrective-action loop through the real UI: NCR 360 → Plan → Correct → Verify & close,
// asserting the status badge advances and the verification record appears. Skips if the API is down.
import { expect, test } from '@playwright/test';
import { projectFixtureId } from './fixtures';

const num = `NCR-E2E-${Date.now().toString().slice(-6)}`;

test('NCR 360 → plan → correct → verify & close (UI)', async ({ page, baseURL }) => {
  const create = await page.request.post(`${baseURL}/api/quality/ncrs`, {
    data: { projectId: await projectFixtureId(page.request, baseURL), ncrNumber: num, description: 'Containment not bonded', severity: 'major' },
  });
  test.skip(create.status() === 502 || create.status() === 404, 'quality API not running behind the web shell');
  expect(create.ok()).toBeTruthy();
  const ncr = await create.json();

  // Register loads and lists the new NCR.
  await page.goto('/quality/ncrs', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(num)).toBeVisible();

  // Open the 360 — status Raised.
  await page.goto(`/quality/ncrs/${ncr.id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('ncr-status')).toHaveText('Raised');

  // Plan corrective action → Action Planned.
  await page.getByPlaceholder('Root cause (required)').fill('Missing earth bond kit');
  await page.getByPlaceholder('Corrective action (required)').fill('Install bonding + re-test');
  await page.getByTestId('btn-plan').click();
  await expect(page.getByTestId('ncr-status')).toHaveText('Action Planned');

  // Mark corrected → Corrected.
  await page.getByTestId('btn-correct').click();
  await expect(page.getByTestId('ncr-status')).toHaveText('Corrected');

  // Verify & close → Closed, and the verification record shows accepted.
  await page.getByPlaceholder('Verification note (required to reject)').fill('Continuity verified');
  await page.getByTestId('btn-verify-accept').click();
  await expect(page.getByTestId('ncr-status')).toHaveText('Closed');
  await expect(page.getByTestId('tab-verifications')).toContainText('accepted');
});
