import { expect, test } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * J4-02 — A SITE DIARY WRITTEN JUST AFTER MIDNIGHT IN DUBAI IS DATED THAT DAY.
 *
 * The finding: the daily report's default date was the UTC date, which is still yesterday from
 * 00:00 to 04:00 in the UAE, so a report written at 00:30 defaulted to the day before. The browser's
 * clock is frozen at 00:30 on the 14th in Dubai (20:30 on the 13th in UTC) — after the page has
 * hydrated, because the server renders at real time — and the form's own reset computes "today":
 * that default is what is shown, saved and read back.
 */
const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const HALF_PAST_MIDNIGHT_IN_DUBAI = new Date('2026-09-13T20:30:00.000Z');

test('J4-02 — a daily report written at 00:30 in Dubai defaults to that day, and is saved on it', async ({ page, request }) => {
  const admin = apiAuthHeaders();
  test.skip(!admin.Authorization, 'requires the Auth-ON local API');
  const run = Date.now().toString().slice(-6);
  // A project of its own, so the one-report-per-project-per-day rule never meets an earlier run.
  const created = await request.post(`${API}/projects/projects`, { headers: admin, data: { title: `Night shift ${run}`, reference: `J402-${run}` } });
  expect(created.ok(), await created.text()).toBe(true);
  const project = (await created.json()) as { id: string };

  await page.goto(`/site/daily-reports?projectId=${project.id}`);
  const date = page.locator('input[type="date"]').first();
  const describe = page.getByPlaceholder('Containment 2nd fix, L3 east');
  await expect(date).toBeEnabled();
  await page.clock.setFixedTime(HALF_PAST_MIDNIGHT_IN_DUBAI);

  // A first report on an earlier day; saving it resets the form, and the reset asks the (frozen) clock.
  await date.fill('2026-09-10');
  await describe.fill(`Day shift ${run}`);
  await page.getByRole('button', { name: 'Add report' }).click();
  await expect(describe).toHaveValue('');
  await expect(date, 'the default is the day it is in Dubai, not in UTC').toHaveValue('2026-09-14');

  // The night shift's report, on the default.
  await describe.fill(`Night shift ${run}`);
  await page.getByRole('button', { name: 'Add report' }).click();
  await expect(page.getByRole('cell', { name: `Night shift ${run}` })).toBeVisible();

  const list = await request.get(`${API}/site/daily-reports?projectId=${project.id}`, { headers: admin });
  expect(list.ok(), await list.text()).toBe(true);
  const body = (await list.json()) as Array<{ date: string; workDescription: string }> | { items: Array<{ date: string; workDescription: string }> };
  const rows = Array.isArray(body) ? body : body.items;
  expect(rows.find((r) => r.workDescription === `Night shift ${run}`)?.date, 'saved and read back on the Dubai day').toBe('2026-09-14');
  expect(rows.find((r) => r.workDescription === `Day shift ${run}`)?.date).toBe('2026-09-10');
});
