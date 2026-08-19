import { expect, test } from '@playwright/test';

test('Approvals & Reviews is a decision queue, not a task or day-plan duplicate', async ({ page }) => {
  await page.goto('/my-work/approvals', { waitUntil: 'domcontentloaded' });
  const workspace = page.getByTestId('my-approvals-page');

  await expect(workspace).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Approvals & Reviews' })).toBeVisible();
  await expect(page.getByText('Tasks and My Day are not duplicated here')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Approval views' })).toBeVisible();
  await expect(page.getByLabel('Search decisions')).toBeVisible();
  await expect(page.getByLabel('Filter by domain')).toBeVisible();
  await expect(page.getByLabel('Filter by record type')).toBeVisible();
  await expect(page.getByLabel('Filter by source')).toBeVisible();

  for (const view of ['Inbox', 'To Review', 'To Approve', 'Sign-off / Decision', 'Returned', 'Waiting', 'Completed']) {
    await expect(page.getByRole('button', { name: new RegExp(view) })).toBeVisible();
  }

  await page.getByRole('button', { name: /Waiting/ }).click();
  await expect(page.getByText('No verified items in this view')).toBeVisible();
  await expect(page.getByRole('button', { name: /Waiting/ })).toBeFocused();

  for (const link of await workspace.getByRole('link').all()) {
    await expect(link).not.toHaveAttribute('target', '_blank');
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Approvals & Reviews' })).toBeVisible();
  await expect(page.getByLabel('Search decisions')).toBeVisible();
  await expect(page.getByRole('button', { name: /To Approve/ })).toBeVisible();
});
