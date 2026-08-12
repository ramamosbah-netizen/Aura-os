// AURA OS — Commissioning workflow, browser E2E.
// Seeds a record + test sheet + an open punch item, then drives the retest gate through the real
// 360 UI: commission is blocked while a defect is open (409 surfaced) → close the punch → commission
// (witnessed sign-off). Skips if the API is not running behind the web shell.
import { expect, test } from '@playwright/test';

const API = (process.env.AURA_API_URL ?? 'http://localhost:4000') + '/api/v1/commissioning/records';
const code = `CX-E2E-${Date.now().toString().slice(-6)}`;

test('commissioning 360: punch gate blocks sign-off until closed (UI)', async ({ page }) => {
  // Seed via the backend: a CCTV record, two passing test points, and one open punch item.
  const created = await page.request.post(API, { data: { projectId: 'e2e-proj', code, title: 'CCTV T&C', system: 'cctv' } });
  test.skip(created.status() === 502 || created.status() === 404 || !created.ok(), 'commissioning API not reachable');
  const rec = await created.json();
  const id = rec.id;
  for (const n of ['1', '2']) {
    const t = await (await page.request.post(`${API}/${id}/test-items`, { data: { pointNo: n, description: `Cam ${n} live view` } })).json();
    await page.request.put(`${API}/${id}/test-items/${t.id}/result`, { data: { result: 'pass', actual: 'OK' } });
  }
  await page.request.post(`${API}/${id}/punch`, { data: { description: 'Loose connector at Cam 2', severity: 'major' } });

  // Open the 360 — test sheet + punch list rendered; the record is "Tested" (all points passed).
  await page.goto(`/commissioning/${id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('cx-status')).toHaveText('Tested');
  await expect(page.getByTestId('tab-tests')).toContainText('Cam 1 live view');
  await expect(page.getByTestId('punch-gate')).toBeVisible();

  // Attempt to commission while the punch item is open → backend refuses (409, surfaced in the UI).
  await page.getByTestId('btn-commission').click();
  await expect(page.getByTestId('cx-error')).toContainText(/open punch/i);
  await expect(page.getByTestId('cx-status')).toHaveText('Tested'); // unchanged

  // Close the punch item (retest gate), then commission succeeds.
  await page.locator('[data-testid^="close-punch-"]').first().click();
  await expect(page.getByTestId('punch-gate')).toHaveCount(0);
  await page.getByTestId('btn-commission').click();
  await expect(page.getByTestId('cx-status')).toHaveText('Commissioned');
  await expect(page.getByTestId('signoff')).toBeVisible();
});
