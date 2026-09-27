import { expect, test } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { MEMBER, V1, collectPageErrors, memberPassword, scenario, signInAs } from './project-member-harness';
import { provisionedActorsUnavailable } from './provisioned-actors';

/**
 * J4-04 — THE SITE DIARY REGISTER OPENS THE REPORT, AND THE PROJECT'S PROGRESS VIEW IS THAT PROJECT'S.
 *
 * The finding: the daily report register let a report be submitted and printed but not opened on
 * its 360 for review and correction, and the general `/site/execution` route ignored the
 * `projectId` a project's Site area links it with. Proved on the ordinary route:
 *
 *   scoped     a project member opens Progress from the project: only that project's reports, the
 *              project named, a way to all projects — another project's report is not there
 *   reach      the reviewer (the member, r-pm on the project) opens the submitted report FROM THE
 *              REGISTER and rejects it with a reason on its 360
 *   correct    the preparer finds it FROM THE REGISTER again, reads the reason, and resubmits
 *   back       the 360's crumb returns to that project's progress view, not the tenant's
 */
test('J4-04 — the diary register opens the report for review and correction, and progress is scoped to the project', async ({ page, browser, request, baseURL }) => {
  test.setTimeout(240_000);
  const admin = apiAuthHeaders().Authorization;
  test.skip(!admin, 'auth is off — the preparer and the reviewer would be indistinguishable');
  test.skip(!memberPassword(), 'needs a password to sign the member in');
  test.skip((await provisionedActorsUnavailable(request)) !== null, (await provisionedActorsUnavailable(request)) ?? '');

  // MEMBER holds r-pm (review, approve) on "mine" and nothing on "theirs"; the admin prepares.
  const s = await scenario(request, admin!, ['r-site-engineer'], 'SiteReach');
  const mineRef = `SX-${s.run}-MINE`;
  const theirsRef = `SX-${s.run}-THEIRS`;
  const report = (projectId: string, reportNumber: string) => s.post<{ id: string }>('/site/daily-reports', {
    projectId, reportNumber, date: '2026-09-12', workDescription: `${reportNumber} — second fix ELV, L2 west`,
  });
  const mine = await report(s.mine.id, mineRef);
  await report(s.theirs.id, theirsRef);
  // The preparer submits the day they wrote.
  const submitted = await request.put(`${V1}/site/daily-reports/${mine.id}/submit`, { headers: { Authorization: admin! }, data: {} });
  expect(submitted.ok(), await submitted.text()).toBe(true);

  const reviewerContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const reviewer = await reviewerContext.newPage();
  const errors = collectPageErrors(reviewer);
  try {
    expect(await signInAs(reviewer, baseURL!, MEMBER), `${MEMBER} signs in`).toBe(true);

    // ── Scoped: Progress opened from the project is that project's ────────────────────────────
    await reviewer.goto(`/site/execution?projectId=${s.mine.id}`, { waitUntil: 'domcontentloaded' });
    await expect(reviewer.getByTestId('execution-scope')).toContainText(s.mine.title);
    await expect(reviewer.getByTestId('reports-table')).toContainText(mineRef);
    await expect(reviewer.getByTestId('reports-table')).not.toContainText(theirsRef);
    await expect(reviewer.locator('body')).not.toContainText(/could not be loaded/i);

    // ── Reach: from the register to the report, and a review with a reason ────────────────────
    await reviewer.goto(`/site/daily-reports?projectId=${s.mine.id}`, { waitUntil: 'domcontentloaded' });
    await reviewer.getByTestId(`open-report-${mine.id}`).click();
    await expect(reviewer).toHaveURL(new RegExp(`/site/execution/${mine.id}$`));
    await expect(reviewer.getByTestId('report-status')).toHaveText('Submitted');
    await reviewer.getByTestId('btn-start-review').click();
    await expect(reviewer.getByTestId('report-status')).toHaveText('Under Review');
    await reviewer.getByPlaceholder('Rejection reason (required to reject)').fill(`Add the helper headcount (${s.run})`);
    await reviewer.getByTestId('btn-reject').click();
    await expect(reviewer.getByTestId('report-status')).toHaveText('Draft');

    // ── Back: the crumb returns to this project's progress, not everyone's ────────────────────
    await reviewer.getByTestId('report-project-crumb').click();
    await expect(reviewer).toHaveURL(new RegExp(`/site/execution\\?projectId=${s.mine.id}$`));
    await expect(reviewer.getByTestId('execution-scope')).toContainText(s.mine.title);
    expect(errors, 'no page errors on the reviewer’s route').toEqual([]);
  } finally {
    await reviewerContext.close();
  }

  // ── Correct: the preparer finds it from the register, reads why, and resubmits ─────────────
  await page.goto(`/site/daily-reports?projectId=${s.mine.id}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId(`open-report-${mine.id}`).click();
  await expect(page.getByTestId('report-status')).toHaveText('Draft');
  await expect(page.getByTestId('rejection-note')).toContainText(`Add the helper headcount (${s.run})`);
  await page.getByTestId('btn-submit').click();
  await expect(page.getByTestId('report-status')).toHaveText('Submitted');
});
