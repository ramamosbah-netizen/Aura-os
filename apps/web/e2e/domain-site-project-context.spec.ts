import { expect, test } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { MEMBER, V1, collectPageErrors, memberPassword, proveDomain, scenario, signInAs } from './project-member-harness';

/**
 * SITE / DELIVERY from a project member's seat, in a browser, with auth ON.
 *
 * The identity holds `r-site-engineer` (site.*, quality read, engineering read) plus `r-pm` for
 * project discovery — and deliberately NOT `r-hse`, which is what lets the last assertion here mean
 * something: being on the project does not confer HSE authority.
 *
 * The surfaces exercised are the operational ones, not the landing page: the project's site area
 * register, a daily report opened as a record, and the entity-addressed route that the resolver
 * layer covers. Site's quantity and progress authority is untouched — this is navigation and
 * access only.
 */
test.describe('Site in project context', () => {
  test.setTimeout(300_000);

  test('a site engineer works inside their project and cannot reach another', async ({ browser, request, baseURL }) => {
    const admin = apiAuthHeaders().Authorization;
    test.skip(!admin, 'auth is off — a member and an admin would be indistinguishable');
    test.skip(!memberPassword(), 'needs a password to sign the member in');

    const s = await scenario(request, admin!, ['r-site-engineer'], 'Site');

    // A daily report in each project. The marker is the reference the UI prints.
    const mineRef = `SR-${s.run}-MINE`;
    const theirsRef = `SR-${s.run}-THEIRS`;
    const report = (projectId: string, reportNumber: string) =>
      s.post<{ id: string }>('/site/daily-reports', {
        projectId,
        reportNumber,
        date: '2026-09-13',
        // The marker rides in the description because that is what the register prints.
        workDescription: `${reportNumber} — containment and cable pulling`,
      });
    const mineReport = await report(s.mine.id, mineRef);
    const theirsReport = await report(s.theirs.id, theirsRef);

    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = collectPageErrors(page);
    try {
      expect(await signInAs(page, baseURL!, MEMBER), `${MEMBER} signs in`).toBe(true);

      // 1–4, 7, 8 — discovery, context, the name, their rows only, and no crossing over.
      await proveDomain(page, baseURL!, s, {
        path: (id) => `/project/${id}/site`,
        rendered: 'Site',
        mineMarker: mineRef,
        theirsMarker: theirsRef,
      });

      // 5 — a representative entity opens. Site has no per-report ROUTE — the register is where a
      //     report is read and acted on, which is this domain's canonical shape and not something
      //     to invent a page for. Reached with the project carried, as the project nav does.
      await page.goto(`${baseURL}/site/daily-reports?projectId=${s.mine.id}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body'), 'the member’s own daily report is readable').toContainText(mineRef, { timeout: 30_000 });
      await expect(page.locator('body'), 'and the register did not fail for a member').not.toContainText(/could not be loaded/i);

      // 9 — the same register asked for ANOTHER project. The id in the query is not what decides:
      //     the guard refuses a project this member holds no grant on, so nothing of it renders.
      await page.goto(`${baseURL}/site/daily-reports?projectId=${s.theirs.id}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).not.toContainText(/Loading/i, { timeout: 30_000 });
      await expect(page.locator('body'), 'another project’s reports must not render').not.toContainText(theirsRef);

      //     And the entity-addressed API route, which is what the resolver layer governs: the
      //     project is read from the RECORD, so no URL shape reaches it.
      const foreignRead = await s.get(`/site/daily-reports/${theirsReport.id}`, s.memberToken);
      expect([403, 404], 'another project’s report is not readable by id either').toContain(foreignRead.status);

      // 6 — a representative authorised lifecycle step, as the MEMBER. Submitting a daily report
      //     is the site engineer's own transition and touches only this run's seeded record.
      const submit = await request.put(`${V1}/site/daily-reports/${mineReport.id}/submit`, {
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${s.memberToken}` },
        data: {},
      });
      expect([200, 201], `a site engineer submits their own project's report — ${await submit.text()}`).toContain(submit.status());

      //     ...and the same step on the OTHER project's report is refused. Same actor, same verb,
      //     different project: the only variable is scope.
      const foreignSubmit = await request.put(`${V1}/site/daily-reports/${theirsReport.id}/submit`, {
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${s.memberToken}` },
        data: {},
      });
      expect([403, 404], 'and cannot submit another project’s').toContain(foreignSubmit.status());

      // 10 — membership is not authority, stated precisely.
      //
      //      `r-site-engineer` carries `hse.*.read`, so a site engineer CAN read the permits on
      //      their project — and asserting otherwise would be asserting the wrong thing about the
      //      role. What they do not carry is `hse.*` : approving a permit is the HSE officer's
      //      authority. So the sharp test is that the read reaches and the ACTION does not, on the
      //      very project they are a member of.
      const hseRead = await s.get(`/hse/ptws?projectId=${s.mine.id}`, s.memberToken);
      expect(hseRead.status, 'a site engineer may READ the permits on their project').toBe(200);

      const permit = await s.post<{ id: string }>('/hse/ptws', {
        projectId: s.mine.id,
        permitType: 'hot_work',
        description: `PTW-${s.run}-S hot works`,
        validFrom: '2026-09-13',
        validTo: '2026-09-14',
      });
      const approve = await request.put(`${V1}/hse/ptws/${permit.id}/approve`, {
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${s.memberToken}` },
        data: { approvedBy: MEMBER },
      });
      expect(approve.status(), 'but must not APPROVE one — that authority belongs to HSE, and being').toBe(403);
      expect(await approve.text(), 'on the project does not confer it').toMatch(/no grant satisfies|Access denied/i);
      // 11 — an empty project still renders a usable page rather than an error.
      const emptyProject = await s.post<{ id: string }>('/projects/projects', { title: `Site ${s.run} EMPTY`, code: `SI-${s.run}-E` });
      await s.post(`/projects/${emptyProject.id}/members`, { userId: MEMBER, roleId: 'r-pm' });
      await s.post(`/projects/${emptyProject.id}/members`, { userId: MEMBER, roleId: 'r-site-engineer' });
      await page.goto(`${baseURL}/project/${emptyProject.id}/site`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body'), 'an empty project renders its area, not an error').toContainText('Site', { timeout: 30_000 });
      await expect(page.locator('body'), 'and says nothing is there rather than failing').not.toContainText(/could not be read|unavailable/i);

      // 12 — nothing threw.
      expect(errors, 'no runtime error on any Site surface').toEqual([]);
    } finally {
      await context.close();
    }
  });
});
