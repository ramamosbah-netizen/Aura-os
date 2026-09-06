import { expect, test } from '@playwright/test';
import { scoped } from './fixtures';

test('Communication Meetings: schedule → minutes → decision/action → close', async ({ page }) => {
  await page.goto('/my-work/communication?view=meetings', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('meetings-workspace')).toBeVisible();
  await page.getByRole('button', { name: 'New meeting' }).click();
  // Scheduled RELATIVE to now, never on a fixed date. The workspace opens on its "Upcoming" scope,
  // which keeps only meetings whose `endsAt` is still in the future (meetings-workspace.tsx:19), so
  // a hardcoded date passes until that day arrives and then fails forever afterwards — which is
  // exactly what happened to `2026-08-30`.
  const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const starts = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const ends = new Date(starts.getTime() + 60 * 60 * 1000);
  // Scoped, never the bare phrase: this spec leaves a meeting behind on every run, so a plain
  // 'Weekly Progress Meeting' filter starts matching earlier runs' rows and fails strict mode.
  const title = scoped('Weekly Progress Meeting');
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
  await page.getByLabel('Starts').fill(localInput(starts));
  await page.getByLabel('Ends').fill(localInput(ends));
  await page.getByLabel('Agenda').fill('Progress, risks and next actions');
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  const meetingRow = page.getByTestId('meetings-workspace').locator('button').filter({ hasText: title });
  await expect(meetingRow).toBeVisible();
  await meetingRow.click();
  await page.getByLabel('Item title').fill('Submit revised drawing');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText(/Action · Submit revised drawing/)).toBeVisible();
  await page.getByLabel('Meeting minutes').fill('Client approved the direction.');
  await page.getByRole('button', { name: 'Complete meeting' }).click();
  await expect(page.getByText('completed', { exact: true })).toBeVisible();
});
