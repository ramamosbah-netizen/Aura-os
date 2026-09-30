// AURA OS — G-33 Document Control workflow, browser E2E.
// Drives the governed document lifecycle through the real UI: Register → 360 → submit → review →
// reject → raise new revision → submit → approve → issue, then verifies the revision history and an
// illegal transition (409). Skips if the API is not running behind the web shell.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { projectFixtureId } from './fixtures';
import { memberPassword, signInAs } from './project-member-harness';
import { provisionedActorsUnavailable } from './provisioned-actors';
import { apiAuthHeaders } from './api-auth';

const num = `DOC-E2E-${Date.now().toString().slice(-6)}`;
const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

/**
 * THREE PEOPLE, BECAUSE THE DOMAIN NOW INSISTS ON THEM.
 *
 * This spec drove submit, review, reject, approve and issue as ONE identity, and stopped at the
 * reject: the page stayed "Under Review" because the reject answered 403 —
 *
 *   "the person who submitted this revision may not reject their own — withdrawing it is a revision,
 *    not a decision"
 *
 * — and approve carries the same rule, while ISSUE refuses the approver ("approving it internally and
 * releasing it outside are two acts"). The shipped catalogue already separates the three:
 *
 *   doccontrol.revision.submit                        the author (here the session user)
 *   doccontrol.revision.start-review / .approve       r-technical-manager — and NOT .issue
 *   doccontrol.revision.issue                         r-document-controller — and approves nothing
 *
 * So the spec was stale, not the product. It is driven as those people now, and asserts the refusals
 * it used to walk into, so it proves the segregation instead of working around it.
 */
async function as(browser: Browser, baseURL: string, username: string, run: (page: Page) => Promise<void>): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    expect(await signInAs(page, baseURL, username), `${username} must be able to sign in`).toBe(true);
    await run(page);
  } finally {
    await context.close();
  }
}

async function tokenFor(page: Page, username: string): Promise<Record<string, string>> {
  const res = await page.request.post(`${API}/auth/login`, { data: { username, password: memberPassword() } });
  expect(res.ok(), `${username} signs in to the API — ${await res.text()}`).toBe(true);
  return { Authorization: `Bearer ${((await res.json()) as { token: string }).token}` };
}

test('document register → 360 → reject → new rev → approve → issue, by the people who own each act (UI)', async ({ page, browser, baseURL, request }) => {
  test.setTimeout(300_000);
  test.skip(!apiAuthHeaders().Authorization, 'auth is off — the three identities would be indistinguishable');
  test.skip(!memberPassword(), 'needs a password to sign the reviewer and the document controller in');
  const unavailable = await provisionedActorsUnavailable(request);
  test.skip(unavailable !== null, unavailable ?? '');

  const create = await page.request.post(`${baseURL}/api/doccontrol/register`, {
    data: { projectId: await projectFixtureId(page.request, baseURL), documentNumber: num, title: 'E2E CCTV Specification', discipline: 'elv' },
  });
  test.skip(create.status() === 502 || create.status() === 404, 'doccontrol API not running behind the web shell');
  expect(create.ok()).toBeTruthy();
  const entry = await create.json();

  // Register lists the new document.
  await page.goto('/doccontrol/register', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('document-register')).toContainText(num);

  // Open the 360 — active revision A is Draft. The session user is the AUTHOR.
  await page.goto(`/doccontrol/register/${entry.id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('active-status')).toHaveText('Draft');
  await page.getByTestId('btn-submit').click();
  await expect(page.getByTestId('active-status')).toHaveText('Submitted');

  // ── The author may not decide their own revision. Asserted, not worked around ────────────────
  const revisions = async () => (await (await page.request.get(`${baseURL}/api/doccontrol/register/${entry.id}/revisions`)).json()) as Array<{ id: string; status: string; revision?: string }>;
  const revA = (await revisions()).find((r) => r.status === 'submitted')!;
  const selfReview = await page.request.post(`${baseURL}/api/doccontrol/revisions/${revA.id}/start-review`, { data: {} });
  expect(selfReview.ok(), 'opening the review is a stage, not a decision — the author may start it').toBe(true);
  const selfReject = await page.request.post(`${baseURL}/api/doccontrol/revisions/${revA.id}/reject`, { data: { reason: 'my own second thoughts' } });
  expect(selfReject.status(), 'the author must not reject their own revision').toBe(403);
  expect(await selfReject.text()).toContain('may not reject their own');
  const selfApprove = await page.request.post(`${baseURL}/api/doccontrol/revisions/${revA.id}/approve`, { data: {} });
  expect(selfApprove.status(), 'nor approve it').toBe(403);
  expect(await selfApprove.text()).toContain('may not approve their own');

  // ── The Technical Manager, signed in as themselves, REJECTS revision A ────────────────────────
  await as(browser, baseURL!, 'u-e2e-techmgr', async (reviewer) => {
    await reviewer.goto(`/doccontrol/register/${entry.id}`, { waitUntil: 'domcontentloaded' });
    await expect(reviewer.getByTestId('active-status')).toHaveText('Under Review', { timeout: 60_000 });
    await reviewer.getByPlaceholder('Comments / rejection reason').fill('Camera schedule incomplete');
    await reviewer.getByTestId('btn-reject').click();
    await expect(reviewer.getByTestId('active-status')).toHaveText('Rejected');
  });

  // The author raises revision B and submits it.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('active-status')).toHaveText('Rejected');
  await page.getByPlaceholder('Reason for new revision (required)').fill('Complete the schedule');
  await page.getByTestId('btn-revise').click();
  await expect(page.getByTestId('active-status')).toHaveText('Draft');
  await page.getByTestId('btn-submit').click();
  await expect(page.getByTestId('active-status')).toHaveText('Submitted');

  // ── The Technical Manager reviews and APPROVES revision B — and cannot release it ──────────────
  await as(browser, baseURL!, 'u-e2e-techmgr', async (reviewer) => {
    await reviewer.goto(`/doccontrol/register/${entry.id}`, { waitUntil: 'domcontentloaded' });
    await expect(reviewer.getByTestId('active-status')).toHaveText('Submitted', { timeout: 60_000 });
    await reviewer.getByTestId('btn-start-review').click();
    await expect(reviewer.getByTestId('active-status')).toHaveText('Under Review');
    await reviewer.getByTestId('btn-approve').click();
    await expect(reviewer.getByTestId('active-status')).toHaveText('Approved');
  });
  const revB = (await revisions()).find((r) => r.status === 'approved')!;
  const approverIssues = await request.post(`${API}/doccontrol/revisions/${revB.id}/issue`, { headers: await tokenFor(page, 'u-e2e-techmgr'), data: {} });
  expect(approverIssues.status(), 'approving internally and releasing outside are two acts — the approver holds no release').toBe(403);

  // ── The Document Controller ISSUES it ─────────────────────────────────────────────────────────
  await as(browser, baseURL!, 'u-e2e-doccon', async (controller) => {
    await controller.goto(`/doccontrol/register/${entry.id}`, { waitUntil: 'domcontentloaded' });
    await expect(controller.getByTestId('active-status')).toHaveText('Approved', { timeout: 60_000 });
    await controller.getByTestId('btn-issue').click();
    await expect(controller.getByTestId('active-status')).toHaveText('Issued');
  });

  // Revision history shows both A (rejected) and B (issued), as the author sees it.
  await page.reload({ waitUntil: 'domcontentloaded' });
  const history = page.getByTestId('tab-revisions');
  await expect(history).toContainText('Rejected');
  await expect(history).toContainText('Issued');

  // Illegal transition is refused by the backend (submit on an issued revision → 409).
  const issued = (await revisions()).find((r) => r.status === 'issued')!;
  const illegal = await page.request.post(`${baseURL}/api/doccontrol/revisions/${issued.id}/submit`, { data: {} });
  expect(illegal.status()).toBe(409);
});
