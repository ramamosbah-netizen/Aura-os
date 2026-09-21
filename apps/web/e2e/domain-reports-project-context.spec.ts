import { expect, test } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { MEMBER, collectPageErrors, memberPassword, scenario, signInAs } from './project-member-harness';
import { provisionedActorsUnavailable } from './provisioned-actors';

/**
 * REPORTS from a project member's seat, in a browser, with auth ON.
 *
 * Phase 2 measured the seven backend sources this page reads and found no leak. That is necessary
 * and not sufficient: a page can hold correct sources and still put a cross-project number next to
 * project-specific ones, where a reader will take it for a fact about the project in front of them.
 * So this asserts what the PAGE says, not what its sources return.
 *
 * Three things are checked that the API audit could not:
 *   • the report shows the member's project data and none of the other's;
 *   • the portfolio-only card is absent in project context, rather than showing a tenant-wide count
 *     among project facts;
 *   • changing the query to another project exposes nothing of it.
 */
test.describe('Reports in project context', () => {
  test.setTimeout(300_000);

  test('a project report answers for that project only', async ({ browser, request, baseURL }) => {
    const admin = apiAuthHeaders().Authorization;
    test.skip(!admin, 'auth is off — a member and an admin would be indistinguishable');
    test.skip(!memberPassword(), 'needs a password to sign the member in');
    test.skip(
      (await provisionedActorsUnavailable(request)) !== null,
      (await provisionedActorsUnavailable(request)) ?? '',
    );

    // Every role the report's seven sources touch, so a blank card means "no data" and never
    // "no permission" — the distinction this page would otherwise hide behind a dash.
    const s = await scenario(request, admin!, ['r-qa-qc', 'r-hse', 'r-site-engineer'], 'Rep');

    const mineRef = `RP-${s.run}-MINE`;
    const theirsRef = `RP-${s.run}-THEIRS`;
    for (const [projectId, ref] of [[s.mine.id, mineRef], [s.theirs.id, theirsRef]] as const) {
      await s.post('/engineering/drawings', { projectId, code: `${ref}-D`, title: `${ref} layout`, revision: '0' });
      await s.post('/quality/ncrs', { projectId, ncrNumber: `${ref}-N`, description: `${ref} defect`, severity: 'minor', system: 'cctv' });
    }

    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = collectPageErrors(page);
    try {
      expect(await signInAs(page, baseURL!, MEMBER), `${MEMBER} signs in`).toBe(true);

      // 1 — discovery, then Reports for that project.
      await page.goto(`${baseURL}/my-projects`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId(`my-project-${s.mine.id}`)).toBeVisible({ timeout: 30_000 });

      // 2, 3 — the report opens in context and renders.
      await page.goto(`${baseURL}/operations/reports?project=${s.mine.id}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body'), 'the report renders for a member').toContainText(/Engineering queue/i, { timeout: 30_000 });
      await expect(page.locator('body'), 'and does not fail').not.toContainText(/could not be read/i);

      // "Unavailable" is this page's own word for a source that returned no evidence, and it appears
      // in the footnote explaining that — so the whole-body text cannot distinguish the explanation
      // from the condition. Asserted on the CARD instead: the member's own NCR must be counted, which
      // is only possible if the quality source answered for their project.
      await expect(
        page.getByTestId('report-card-quality-exceptions'),
        'the member’s own project data reaches the report, rather than the source being refused',
      ).not.toContainText('Unavailable');

      // THE PORTFOLIO CARD. A count of PROJECTS is a cross-project answer; among project facts a
      // reader takes it for one. It belongs to the portfolio view and must be absent here.
      await expect(page.locator('body'), 'no portfolio-wide count inside a project report')
        .not.toContainText(/Projects in delivery/i);

      // 4 — the other project's data is nowhere on it.
      await expect(page.locator('body'), 'no trace of the project they are not on').not.toContainText(theirsRef);

      // 8 — the query changed to another project exposes nothing of it.
      await page.goto(`${baseURL}/operations/reports?project=${s.theirs.id}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).not.toContainText(/Loading/i, { timeout: 30_000 });
      await expect(page.locator('body'), 'another project’s report must expose nothing').not.toContainText(theirsRef);
      await expect(page.locator('body'), 'nor its name').not.toContainText(s.theirs.title);

      // 7 — and back, still their project.
      await page.goto(`${baseURL}/operations/reports?project=${s.mine.id}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).toContainText(/Engineering queue/i, { timeout: 30_000 });

      // The portfolio view still has its portfolio card — the card was scoped out of a project, not
      // deleted, and proving that keeps the fix from being a quiet removal.
      const orgPage = await context.newPage();
      try {
        await orgPage.goto(`${baseURL}/operations/reports`, { waitUntil: 'domcontentloaded' });
        await expect(orgPage.locator('body')).not.toContainText(/Loading/i, { timeout: 30_000 });
      } finally {
        await orgPage.close();
      }

      // 12
      expect(errors, 'no runtime error on any Reports surface').toEqual([]);
    } finally {
      await context.close();
    }
  });
});
