import { expect, test } from '@playwright/test';

test('Communication Meetings: schedule → minutes → decision/action → close', async ({ page }) => {
  await page.goto('/my-work/communication?view=meetings', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('meetings-workspace')).toBeVisible();
  await page.getByRole('button', { name: 'New meeting' }).click();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Weekly Progress Meeting');
  await page.getByLabel('Starts').fill('2026-08-30T10:00');
  await page.getByLabel('Ends').fill('2026-08-30T11:00');
  await page.getByLabel('Agenda').fill('Progress, risks and next actions');
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  const meetingRow = page.getByTestId('meetings-workspace').locator('button').filter({ hasText: 'Weekly Progress Meeting' });
  await expect(meetingRow).toBeVisible();
  await meetingRow.click();
  await page.getByLabel('Item title').fill('Submit revised drawing');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText(/Action · Submit revised drawing/)).toBeVisible();
  await page.getByLabel('Meeting minutes').fill('Client approved the direction.');
  await page.getByRole('button', { name: 'Complete meeting' }).click();
  await expect(page.getByText('completed', { exact: true })).toBeVisible();
});
