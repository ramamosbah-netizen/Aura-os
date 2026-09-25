// AURA OS — Commissioning workflow, browser E2E.
// Seeds a record + test sheet + an open punch item, then drives the retest gate through the real
// 360 UI: commission is blocked while a defect is open (409 surfaced) → close the punch → commission
// (witnessed sign-off). Skips if the API is not running behind the web shell.
import { expect, test } from '@playwright/test';
import { projectFixtureId } from './fixtures';

import { apiAuthHeaders } from './api-auth';
import { bindToChecklist } from './approved-checklist';

const API = (process.env.AURA_API_URL ?? 'http://localhost:4000') + '/api/v1/commissioning/records';
// Seeds go straight to the API rather than through the BFF, so they need their own token.
const H = () => apiAuthHeaders();
const code = `CX-E2E-${Date.now().toString().slice(-6)}`;

test('commissioning 360: punch gate blocks sign-off until closed (UI)', async ({ page, baseURL }) => {
  // Seed via the backend: a CCTV record, two passing test points, and one open punch item.
  const created = await page.request.post(API, { headers: H(), data: { projectId: await projectFixtureId(page.request, baseURL), code, title: 'CCTV T&C', system: 'cctv' } });
  test.skip(created.status() === 502 || created.status() === 404 || !created.ok(), 'commissioning API not reachable');
  const rec = await created.json();
  const id = rec.id;
  // The two points come from Quality's approved checklist (TC-08/TC-09), declared for this test only.
  const point = await bindToChecklist(page.request, {
    recordId: id, projectId: rec.projectId, system: 'cctv',
    points: ['1', '2'].map((n) => ({ code: n, activity: `Cam ${n} live view`, acceptanceCriteria: 'Live view on VMS' })),
  });
  for (const n of ['1', '2']) {
    await page.request.put(`${API}/${id}/test-items/${point(n).id}/result`, { headers: H(), data: { result: 'pass', actual: 'OK' } });
  }
  await page.request.post(`${API}/${id}/punch`, { headers: H(), data: { description: 'Loose connector at Cam 2', severity: 'major' } });

  // Open the 360 — test sheet + punch list rendered; the record is "Tested" (all points passed).
  await page.goto(`/commissioning/${id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('cx-status')).toHaveText('Tested');
  await expect(page.getByTestId('tab-tests')).toContainText('Cam 1 live view');
  await expect(page.getByTestId('punch-gate')).toBeVisible();

  // Attempt to commission while the punch item is open → backend refuses (409, surfaced in the UI).
  // Named first: since XOP-12 the screen refuses an unnamed sign-off before asking the API, and the
  // refusal under test here is the API's.
  await page.getByPlaceholder('Commissioned by').fill('Test Engineer');
  await page.getByPlaceholder('Witnessed by (consultant/client)').fill('Client Consultant');
  await page.getByTestId('btn-commission').click();
  await expect(page.getByTestId('cx-error')).toContainText(/open defect/i);
  await expect(page.getByTestId('cx-status')).toHaveText('Tested'); // unchanged

  // Close the punch item (retest gate), then commission succeeds.
  await page.locator('[data-testid^="close-punch-"]').first().click();
  await expect(page.getByTestId('punch-gate')).toHaveCount(0);
  await page.getByTestId('btn-commission').click();
  await expect(page.getByTestId('cx-status')).toHaveText('Commissioned');
  await expect(page.getByTestId('signoff')).toBeVisible();
});
