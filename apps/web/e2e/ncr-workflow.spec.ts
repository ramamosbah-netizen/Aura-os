// AURA OS — QA/QC NCR workflow, browser E2E.
// Drives the corrective-action loop through the real UI: NCR 360 → Plan → Correct → Verify & close,
// asserting the status badge advances and the verification record appears. Skips if the API is down.
import { expect, test } from '@playwright/test';
import { projectFixtureId } from './fixtures';
import { memberPassword, signInAs } from './project-member-harness';
import { provisionedActorsUnavailable } from './provisioned-actors';
import { apiAuthHeaders } from './api-auth';

const num = `NCR-E2E-${Date.now().toString().slice(-6)}`;

/**
 * THE VERIFIER IS NOT THE PERSON WHO DID THE REPAIR (QHS-03).
 *
 * This spec raised, planned, corrected and verified an NCR as ONE identity and expected "Closed". It
 * got "Corrected": the verify answered 403 — "the person who corrected this NCR may not verify it" —
 * and the page correctly kept the status the NCR still had. The rule is deliberately narrow: the
 * raiser MAY verify (they are normally the right person to look), the one who did the work may not.
 *
 * So the session user raises, plans and corrects; the corrector's own verification is asserted as a
 * refusal; and a second QA/QC engineer, signed in as themselves, verifies and closes it.
 */
test('NCR 360 → plan → correct → verify & close, by somebody other than the corrector (UI)', async ({ page, browser, baseURL, request }) => {
  test.setTimeout(240_000);
  test.skip(!apiAuthHeaders().Authorization, 'auth is off — the corrector and the verifier would be indistinguishable');
  test.skip(!memberPassword(), 'needs a password to sign the verifier in');
  const unavailable = await provisionedActorsUnavailable(request);
  test.skip(unavailable !== null, unavailable ?? '');

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

  // Mark corrected → Corrected. The session user did the repair.
  await page.getByTestId('btn-correct').click();
  await expect(page.getByTestId('ncr-status')).toHaveText('Corrected');

  // ── The corrector may not sign off their own repair. Asserted, not worked around ─────────────
  const selfVerify = await page.request.post(`${baseURL}/api/quality/ncrs/${ncr.id}/verify`, { data: { accepted: true, note: 'my own repair looks fine' } });
  expect(selfVerify.status(), 'the corrector must not verify their own correction').toBe(403);
  expect(await selfVerify.text()).toContain('may not verify it');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('ncr-status')).toHaveText('Corrected');

  // ── A second QA/QC engineer verifies & closes → Closed, with the verification on record ──────
  const context = await browser.newContext();
  const verifier = await context.newPage();
  try {
    expect(await signInAs(verifier, baseURL!, 'u-e2e-qaqc'), 'u-e2e-qaqc must be able to sign in').toBe(true);
    await verifier.goto(`/quality/ncrs/${ncr.id}`, { waitUntil: 'domcontentloaded' });
    await expect(verifier.getByTestId('ncr-status')).toHaveText('Corrected', { timeout: 60_000 });
    await verifier.getByPlaceholder('Verification note (required to reject)').fill('Continuity verified');
    await verifier.getByTestId('btn-verify-accept').click();
    await expect(verifier.getByTestId('ncr-status')).toHaveText('Closed');
    await expect(verifier.getByTestId('tab-verifications')).toContainText('accepted');
  } finally {
    await context.close();
  }
});
