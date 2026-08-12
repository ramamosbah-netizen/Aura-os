// AURA OS — HSE permit-to-work, browser E2E (G-08 residue).
//
// Drives the permit lifecycle through the real UI: Permit Register → Permit 360 → Approve → Close,
// and — the part that matters for a safety control — asserts that a permit whose authorisation
// gates are NOT satisfied cannot be approved from the UI, with the failing gate named on screen.
//
// The API is seeded through the web BFF; if the API is unreachable the spec skips (the web shell
// degrades gracefully, so there is nothing to drive).
import { expect, test } from '@playwright/test';

const RUN = Date.now().toString().slice(-6);

const openWindow = () => ({
  validFrom: new Date(Date.now() - 3600_000).toISOString(),
  validTo: new Date(Date.now() + 3600_000).toISOString(),
});

test('permit register → 360 → approve → close, with the authorisation gates enforced (UI)', async ({ page, baseURL }) => {
  // ── Seed an APPROVED risk assessment: without one the permit can never be issued.
  const raRes = await page.request.post(`${baseURL}/api/hse/risk-assessments`, {
    data: {
      projectId: 'e2e-hse-proj',
      reference: `RA-E2E-${RUN}`,
      activity: 'Hot work on riser',
      hazards: [{ hazard: 'Fire', likelihood: 4, severity: 4, controls: 'Fire watch', residualLikelihood: 2, residualSeverity: 2 }],
    },
  });
  test.skip(raRes.status() === 502 || raRes.status() === 404, 'HSE API not running behind the web shell');
  expect(raRes.ok()).toBeTruthy();
  const ra = await raRes.json();
  expect((await page.request.put(`${baseURL}/api/hse/risk-assessments/${ra.id}/approve`)).ok()).toBeTruthy();

  // ── A permit WITHOUT an assessment — the blocked case.
  const bare = await (
    await page.request.post(`${baseURL}/api/hse/ptws`, {
      data: {
        projectId: 'e2e-hse-proj',
        permitType: 'confined_space',
        ...openWindow(),
        description: `E2E unassessed ${RUN}`,
      },
    })
  ).json();

  // ── A permit WITH the approved assessment — the happy path.
  const permit = await (
    await page.request.post(`${baseURL}/api/hse/ptws`, {
      data: {
        projectId: 'e2e-hse-proj',
        permitType: 'hot_work',
        ...openWindow(),
        description: `E2E welding ${RUN}`,
        riskAssessmentId: ra.id,
      },
    })
  ).json();

  // 1. The register lists both, and flags the one with no assessment.
  await page.goto('/hse/permits', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('permit-register')).toBeVisible();
  await expect(page.getByTestId('permit-register')).toContainText(`E2E welding ${RUN}`);
  await expect(page.getByTestId(`ra-linked-${permit.id}`)).toHaveText('Linked');
  await expect(page.getByTestId(`ra-missing-${bare.id}`)).toHaveText('Not assessed');

  // 2. The unassessed permit cannot be approved, and the UI names the failing gate rather than
  //    letting the user click into a refusal.
  await page.getByTestId(`open-permit-${bare.id}`).click();
  await expect(page.getByTestId('permit-status')).toHaveText('Requested');
  await expect(page.getByTestId('gate-risk-assessment')).toContainText('No risk assessment is cited');
  await expect(page.getByTestId('btn-approve')).toBeDisabled();
  await expect(page.getByTestId('permit-blocked')).toContainText('Risk assessment approved');

  // 3. The assessed permit passes its gates and can be issued.
  await page.goto('/hse/permits', { waitUntil: 'domcontentloaded' });
  await page.getByTestId(`open-permit-${permit.id}`).click();
  await expect(page.getByTestId('permit-status')).toHaveText('Requested');
  await expect(page.getByTestId('permit-risk-assessment')).toContainText(`RA-E2E-${RUN}`);
  await expect(page.getByTestId('btn-approve')).toBeEnabled();

  await page.getByTestId('btn-approve').click();
  await expect(page.getByTestId('permit-status')).toHaveText('Approved');

  // 4. Close it out — and closed is terminal, so the approve/close actions are gone.
  await page.getByTestId('btn-close').click();
  await expect(page.getByTestId('permit-status')).toHaveText('Closed');
  await expect(page.getByTestId('permit-terminal')).toBeVisible();
  await expect(page.getByTestId('btn-close')).toHaveCount(0);
});

test('a rejected permit carries its reason and re-opens for correction (UI)', async ({ page, baseURL }) => {
  const create = await page.request.post(`${baseURL}/api/hse/ptws`, {
    data: {
      projectId: 'e2e-hse-proj',
      permitType: 'height_work',
      ...openWindow(),
      description: `E2E facade ${RUN}`,
    },
  });
  test.skip(create.status() === 502 || create.status() === 404, 'HSE API not running behind the web shell');
  const permit = await create.json();

  await page.goto(`/hse/permits/${permit.id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('permit-status')).toHaveText('Requested');

  await page.getByTestId('input-reject-reason').fill('Fire watch not staffed');
  await page.getByTestId('btn-reject').click();

  await expect(page.getByTestId('permit-status')).toHaveText('Rejected');
  await expect(page.getByTestId('permit-rejection')).toContainText('Fire watch not staffed');

  await page.getByTestId('btn-reopen').click();
  await expect(page.getByTestId('permit-status')).toHaveText('Draft');
});
