// AURA OS — G-32 drawing workflow, browser E2E.
// Drives the shop-drawing lifecycle through the real project UI: register → Drawing 360 →
// Submit → Start review → Approve → controlled transmit, asserting each state and conveyance.
// The API is seeded through the web BFF; if the API is unreachable the spec skips (the web shell
// degrades gracefully, so there is nothing to drive).
import { expect, test } from '@playwright/test';
import { projectFixtureId } from './fixtures';

const code = `ELV-E2E-${Date.now().toString().slice(-6)}`;

test('project drawing → review → sent DocControl transmittal (UI)', async ({ page, baseURL }) => {
  const projectId = await projectFixtureId(page.request, baseURL);
  const member = await page.request.post(`${baseURL}/api/projects/${projectId}/members`, {
    data: { userId: 'u-admin', roleId: 'r-pm' },
  });
  expect(member.ok(), await member.text()).toBe(true);
  const assigned = await page.request.post(`${baseURL}/api/projects/${projectId}/responsibilities`, {
    data: { workstream: 'engineering_release', title: `Receive ${code} for construction`, assigneeId: 'u-admin' },
  });
  expect(assigned.ok(), await assigned.text()).toBe(true);
  const responsibility = (await assigned.json()) as { id: string };

  // 1. Register in the owning project's workspace. The user never loses project context or
  //    supplies a project selector that could point the drawing somewhere else.
  await page.goto(`/project/${projectId}/drawings`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('project-drawing-register')).toBeVisible();
  await page.getByTestId('project-drawing-code').fill(code);
  await page.getByTestId('project-drawing-title').fill('E2E CCTV Layout');
  await page.getByTestId('project-drawing-discipline').selectOption('elv');
  await page.getByTestId('project-drawing-create').click();

  // 2. Creation opens Drawing 360 in the same project — status is Draft.
  await expect(page.getByTestId('drawing-status')).toHaveText('Draft');

  // 3. Submit for review → Submitted.
  await page.getByTestId('btn-submit').click();
  await expect(page.getByTestId('drawing-status')).toHaveText('Submitted');

  // 4. Start review → Under Review.
  await page.getByTestId('btn-start-review').click();
  await expect(page.getByTestId('drawing-status')).toHaveText('Under Review');

  // 5. Approve → Approved. Conveyance stays disabled until a named recipient is recorded.
  await page.getByTestId('btn-approve').click();
  await expect(page.getByTestId('drawing-status')).toHaveText('Approved');
  await expect(page.getByTestId('btn-transmit')).toBeVisible();
  await expect(page.getByTestId('btn-transmit')).toBeDisabled();

  // 6. Transmit this exact approved revision. The UI proves the resulting DocControl reference.
  await page.getByTestId('transmit-recipient').fill('Consultant');
  await page.getByTestId('transmit-purpose').selectOption({ label: 'For Construction' });
  await expect(page.getByTestId('btn-transmit')).toBeDisabled();
  await page.getByTestId('transmit-responsibility').selectOption(responsibility.id);
  await page.getByTestId('btn-transmit').click();
  await expect(page.getByTestId('drawing-status')).toHaveText('Transmitted');
  await expect(page.getByTestId('transmittal-ref')).toContainText('TR-');
  await expect(page.getByTestId('drawing-release-receipt')).toContainText(`${code} Rev 0 through TR-`);

  // A submission and a review record are now shown on the 360 (audit trail).
  await expect(page.getByTestId('tab-submissions')).toContainText('For Approval');
  await expect(page.getByTestId('tab-reviews')).toContainText('Approved');
});
