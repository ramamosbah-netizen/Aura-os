// AURA OS — G-34 Site Execution workflow, browser E2E.
// Seeds a daily report + line-items via the BFF, then drives the governed lifecycle through the real
// 360 UI: submit → review → reject → resubmit → approve, verifying the diary sections + an illegal
// transition (409). Skips if the API is not running behind the web shell.
import { expect, test } from '@playwright/test';
import { projectFixtureId } from './fixtures';
import { MEMBER, memberPassword, signInAs } from './project-member-harness';
import { provisionedActorsUnavailable } from './provisioned-actors';
import { apiAuthHeaders } from './api-auth';

const date = `2026-08-${String(10 + (Date.now() % 18)).padStart(2, '0')}`;

/**
 * TWO PEOPLE, BECAUSE THE DOMAIN NOW INSISTS ON TWO.
 *
 * This spec used to prepare, submit, review, reject and approve as a single identity and expect
 * "Draft" after the rejection. It got "Under Review", and the cause was not a UI bug: the reject
 * answered 403 —
 *
 *   "the person who prepared or submitted this daily report may not reject their own —
 *    withdrawing it is a resubmission, not a review"
 *
 * — and `site-report-actions` refreshes the 360 only on success, so the page correctly kept
 * showing the status the report still had. `approveReport` carries the same rule. A day written
 * and signed off by one person is a note to self with a status field on it, and the shipped role
 * catalogue already separates the two halves:
 *
 *   site.daily-report.create / .submit    r-site-engineer
 *   site.daily-report.review  / .approve  r-project-engineer, r-pm
 *
 * So the spec was stale, not the product, and the honest repair is to drive it as the two people
 * the rule is about rather than to weaken the rule. That also makes this a proof of the
 * segregation itself, in the browser, which is worth more than what it replaced.
 */
test('site execution: a site engineer submits, a reviewer rejects and approves (UI)', async ({ page, browser, baseURL, request }) => {
  test.setTimeout(240_000);
  test.skip(!apiAuthHeaders().Authorization, 'auth is off — the two identities would be indistinguishable');
  test.skip(!memberPassword(), 'needs a password to sign the two actors in');
  // Both actors are database-provisioned, so the in-memory tier cannot hold them.
  test.skip(
    (await provisionedActorsUnavailable(request)) !== null,
    (await provisionedActorsUnavailable(request)) ?? '',
  );

  const projectId = await projectFixtureId(page.request, baseURL);
  const create = await page.request.post(`${baseURL}/api/site/daily-reports`, {
    data: { projectId, date, workDescription: 'Second fix ELV — L2 west' },
  });
  test.skip(create.status() === 502 || create.status() === 404, 'site API not running behind the web shell');
  expect(create.ok()).toBeTruthy();
  const report = await create.json();
  const api = `${baseURL}/api/site/daily-reports/${report.id}`;

  // Seed diary line-items via the BFF (the 360 renders them read-only).
  await page.request.post(`${api}/labour`, { data: { trade: 'ELV Technician', headcount: 4, hours: 8 } });
  await page.request.post(`${api}/progress`, { data: { description: 'CCTV cameras', boqItemId: 'BOQ-CCTV', plannedQty: 30, installedQty: 24, unit: 'no' } });
  await page.request.post(`${api}/evidence`, { data: { fileId: 'file-abc', category: 'progress', description: 'L2 progress' } });

  // Dashboard lists the report.
  await page.goto('/site/execution', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('reports-table')).toContainText(report.reportNumber);

  // Open the 360 — Draft, with the seeded content visible.
  await page.goto(`/site/execution/${report.id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('report-status')).toHaveText('Draft');
  await expect(page.getByTestId('tab-progress')).toContainText('80%');
  await expect(page.getByTestId('tab-labour')).toContainText('32'); // man-hours
  await expect(page.getByTestId('tab-evidence')).toContainText('L2 progress');

  // ── The site engineer submits the day they wrote ────────────────────────────────────────────
  await page.getByTestId('btn-submit').click();
  await expect(page.getByTestId('report-status')).toHaveText('Submitted');

  // ── …and may not review their own. The rule is asserted, not worked around ──────────────────
  // Driven through the API as the SUBMITTER, because the point is the refusal itself. If this
  // ever answers 2xx the segregation has gone and the rest of this spec proves nothing.
  const selfReview = await page.request.post(`${api}/start-review`, { data: {} });
  expect(selfReview.ok(), 'the preparer starting their own review is allowed (it is a review of a day, not of a person)').toBeTruthy();
  const selfReject = await page.request.post(`${api}/reject`, { data: { reason: 'my own second thoughts' } });
  expect(selfReject.status(), 'the preparer must not reject their own day').toBe(403);
  expect(await selfReject.text()).toContain('may not reject their own');

  // ── The reviewer, signed in as themselves ───────────────────────────────────────────────────
  // The grant is made by the ADMIN, before the reviewer signs in — a member cannot award
  // themselves the authority to review, which is the whole point of the rule being tested. The
  // first attempt at this posted as the reviewer and was silently swallowed by a `.catch`, so the
  // reviewer reached the 360 with no authority and the page rendered nothing to assert against.
  const member = await page.request.post(`${baseURL}/api/projects/${projectId}/members`, {
    data: { userId: MEMBER, roleId: 'r-pm' },
  });
  expect([200, 201, 409].includes(member.status()), `granting ${MEMBER} r-pm: ${await member.text()}`).toBe(true);

  const reviewerContext = await browser.newContext();
  const reviewer = await reviewerContext.newPage();
  try {
    expect(await signInAs(reviewer, baseURL!, MEMBER), `${MEMBER} must be able to sign in`).toBe(true);
    await reviewer.goto(`/site/execution/${report.id}`, { waitUntil: 'domcontentloaded' });
    await expect(reviewer.getByTestId('report-status')).toHaveText('Under Review');

    await reviewer.getByPlaceholder('Rejection reason (required to reject)').fill('Add the helper headcount');
    await reviewer.getByTestId('btn-reject').click();
    await expect(reviewer.getByTestId('report-status')).toHaveText('Draft');
    await expect(reviewer.getByTestId('rejection-note')).toContainText('helper');
  } finally {
    await reviewerContext.close();
  }

  // ── Resubmitted by the author, approved by the reviewer ─────────────────────────────────────
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('btn-submit').click();
  await expect(page.getByTestId('report-status')).toHaveText('Submitted');

  const second = await browser.newContext();
  const reviewer2 = await second.newPage();
  try {
    expect(await signInAs(reviewer2, baseURL!, MEMBER)).toBe(true);
    await reviewer2.goto(`/site/execution/${report.id}`, { waitUntil: 'domcontentloaded' });
    await reviewer2.getByTestId('btn-start-review').click();
    await expect(reviewer2.getByTestId('report-status')).toHaveText('Under Review');
    await reviewer2.getByTestId('btn-approve').click();
    await expect(reviewer2.getByTestId('report-status')).toHaveText('Approved');
    await expect(reviewer2.getByTestId('report-locked')).toBeVisible();
  } finally {
    await second.close();
  }

  // Illegal transition refused by the backend (submit an approved report → 409).
  const illegal = await page.request.put(`${api}/submit`, { data: {} });
  expect(illegal.status()).toBe(409);
});
