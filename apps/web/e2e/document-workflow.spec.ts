// AURA OS — G-33 Document Control workflow, browser E2E.
// Drives the governed document lifecycle through the real UI: Register → 360 → submit → review →
// reject → raise new revision → submit → approve → issue, then verifies the revision history and an
// illegal transition (409). Skips if the API is not running behind the web shell.
import { expect, test } from '@playwright/test';

const num = `DOC-E2E-${Date.now().toString().slice(-6)}`;

test('document register → 360 → reject → new rev → approve → issue (UI)', async ({ page, baseURL }) => {
  const create = await page.request.post(`${baseURL}/api/doccontrol/register`, {
    data: { projectId: 'e2e-proj', documentNumber: num, title: 'E2E CCTV Specification', discipline: 'elv' },
  });
  test.skip(create.status() === 502 || create.status() === 404, 'doccontrol API not running behind the web shell');
  expect(create.ok()).toBeTruthy();
  const entry = await create.json();

  // Register lists the new document.
  await page.goto('/doccontrol/register', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('document-register')).toContainText(num);

  // Open the 360 — active revision A is Draft.
  await page.goto(`/doccontrol/register/${entry.id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('active-status')).toHaveText('Draft');

  // Submit → review → REJECT (with a reason).
  await page.getByTestId('btn-submit').click();
  await expect(page.getByTestId('active-status')).toHaveText('Submitted');
  await page.getByTestId('btn-start-review').click();
  await expect(page.getByTestId('active-status')).toHaveText('Under Review');
  await page.getByPlaceholder('Comments / rejection reason').fill('Camera schedule incomplete');
  await page.getByTestId('btn-reject').click();
  await expect(page.getByTestId('active-status')).toHaveText('Rejected');

  // Raise the next revision (B, draft).
  await page.getByPlaceholder('Reason for new revision (required)').fill('Complete the schedule');
  await page.getByTestId('btn-revise').click();
  await expect(page.getByTestId('active-status')).toHaveText('Draft');

  // Rev B: submit → review → approve → issue.
  await page.getByTestId('btn-submit').click();
  await expect(page.getByTestId('active-status')).toHaveText('Submitted');
  await page.getByTestId('btn-start-review').click();
  await page.getByTestId('btn-approve').click();
  await expect(page.getByTestId('active-status')).toHaveText('Approved');
  await page.getByTestId('btn-issue').click();
  await expect(page.getByTestId('active-status')).toHaveText('Issued');

  // Revision history shows both A (rejected) and B (issued).
  const history = page.getByTestId('tab-revisions');
  await expect(history).toContainText('Rejected');
  await expect(history).toContainText('Issued');

  // Illegal transition is refused by the backend (submit on an issued revision → 409).
  const revs = await (await page.request.get(`${baseURL}/api/doccontrol/register/${entry.id}/revisions`)).json();
  const issued = revs.find((r: { status: string }) => r.status === 'issued');
  const illegal = await page.request.post(`${baseURL}/api/doccontrol/revisions/${issued.id}/submit`, { data: {} });
  expect(illegal.status()).toBe(409);
});
