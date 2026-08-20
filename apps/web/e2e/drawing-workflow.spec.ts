// AURA OS — G-32 drawing workflow, browser E2E.
// Drives the shop-drawing lifecycle through the real UI: Drawing Register → Drawing 360 →
// Submit → Start review → Approve, asserting the status badge advances at each step.
// The API is seeded through the web BFF; if the API is unreachable the spec skips (the web shell
// degrades gracefully, so there is nothing to drive).
import { expect, test } from '@playwright/test';
import { projectFixtureId } from './fixtures';

const code = `ELV-E2E-${Date.now().toString().slice(-6)}`;

test('drawing register → 360 → submit → review → approve (UI)', async ({ page, baseURL }) => {
  // Seed a drawing via the BFF (same proxy the UI uses). Skip the spec if the API is down.
  const create = await page.request.post(`${baseURL}/api/engineering/drawings`, {
    data: { projectId: await projectFixtureId(page.request, baseURL), projectName: 'E2E Project', code, title: 'E2E CCTV Layout' },
  });
  test.skip(create.status() === 502 || create.status() === 404, 'engineering API not running behind the web shell');
  expect(create.ok()).toBeTruthy();

  // 1. Register shows the new drawing.
  await page.goto('/engineering/drawings', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('drawing-register')).toBeVisible();
  const openLink = page.getByTestId(`open-${code}-0`);
  await expect(openLink).toBeVisible();

  // 2. Open the Drawing 360 — status is Draft.
  await openLink.click();
  await expect(page.getByTestId('drawing-status')).toHaveText('Draft');

  // 3. Submit for review → Submitted.
  await page.getByTestId('btn-submit').click();
  await expect(page.getByTestId('drawing-status')).toHaveText('Submitted');

  // 4. Start review → Under Review.
  await page.getByTestId('btn-start-review').click();
  await expect(page.getByTestId('drawing-status')).toHaveText('Under Review');

  // 5. Approve → Approved, and the Transmit action becomes available.
  await page.getByTestId('btn-approve').click();
  await expect(page.getByTestId('drawing-status')).toHaveText('Approved');
  await expect(page.getByTestId('btn-transmit')).toBeVisible();

  // A submission and a review record are now shown on the 360 (audit trail).
  await expect(page.getByTestId('tab-submissions')).toContainText('For Approval');
  await expect(page.getByTestId('tab-reviews')).toContainText('Approved');
});
