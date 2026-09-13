import { expect, test } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { MEMBER, V1, collectPageErrors, memberPassword, proveDomain, scenario, signInAs } from './project-member-harness';

/**
 * QUALITY from a project member's seat, in a browser, with auth ON.
 *
 * The identity holds `r-qa-qc` (quality.*, commissioning.*, site and engineering reads) plus `r-pm`
 * for discovery — and deliberately NOT `r-hse`, which is what makes the authority assertion below
 * mean something.
 *
 * ## What is deliberately NOT touched
 *
 * A Quality SNAG and a T&C PUNCH item are different records owned by different authorities, and
 * handover readiness is projected from the domains that hold the evidence. This phase changes how
 * those are REACHED, not what they mean: nothing here creates, resolves or reinterprets either, and
 * no readiness rule is consulted or altered.
 */
test.describe('Quality in project context', () => {
  test.setTimeout(300_000);

  test('a QA/QC member works inside their project and cannot reach another', async ({ browser, request, baseURL }) => {
    const admin = apiAuthHeaders().Authorization;
    test.skip(!admin, 'auth is off — a member and an admin would be indistinguishable');
    test.skip(!memberPassword(), 'needs a password to sign the member in');

    const s = await scenario(request, admin!, ['r-qa-qc'], 'Qual');

    const mineRef = `NCR-${s.run}-MINE`;
    const theirsRef = `NCR-${s.run}-THEIRS`;
    const ncr = (projectId: string, ncrNumber: string) =>
      s.post<{ id: string }>('/quality/ncrs', {
        projectId, ncrNumber, description: `${ncrNumber} cable tray not bonded`, severity: 'minor', system: 'cctv',
      });
    const mineNcr = await ncr(s.mine.id, mineRef);
    const theirsNcr = await ncr(s.theirs.id, theirsRef);

    // A snag on each project too — the OTHER quality register, and the one whose distinction from
    // a T&C punch item this phase must not blur.
    const mineSnag = `SNAG-${s.run}-MINE`;
    await s.post('/quality/snags', {
      projectId: s.mine.id, title: mineSnag, description: `${mineSnag} paint damage`, locationDetail: 'Level 2 riser', severity: 'low',
    });

    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = collectPageErrors(page);
    try {
      expect(await signInAs(page, baseURL!, MEMBER), `${MEMBER} signs in`).toBe(true);

      // 1–4, 7, 8
      await proveDomain(page, baseURL!, s, {
        path: (id) => `/project/${id}/quality`,
        rendered: 'Quality',
        mineMarker: mineRef,
        theirsMarker: theirsRef,
      });

      // 5 — the NCR register, and the snag register beside it. Two registers, one project.
      await page.goto(`${baseURL}/quality/ncrs?projectId=${s.mine.id}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body'), 'their NCR is readable').toContainText(mineRef, { timeout: 30_000 });
      await expect(page.locator('body'), 'and not the other project’s').not.toContainText(theirsRef);

      await page.goto(`${baseURL}/quality/snags?projectId=${s.mine.id}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body'), 'their snag is readable — a Quality record, not a T&C punch item')
        .toContainText(mineSnag, { timeout: 30_000 });

      // 9 — another project's NCR by id
      const foreign = await s.get(`/quality/ncrs/${theirsNcr.id}`, s.memberToken);
      expect([403, 404], 'another project’s NCR is not readable by id').toContain(foreign.status);

      // 6 — a representative authorised lifecycle step as the MEMBER. Planning the corrective action
      //     is QA/QC's own transition on their own NCR.
      const plan = await request.post(`${V1}/quality/ncrs/${mineNcr.id}/plan`, {
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${s.memberToken}` },
        data: { rootCause: 'bonding omitted at install', correctiveAction: 'bond and re-inspect' },
      });
      expect([200, 201], `QA/QC plans their own project's NCR — ${await plan.text()}`).toContain(plan.status());

      const foreignPlan = await request.post(`${V1}/quality/ncrs/${theirsNcr.id}/plan`, {
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${s.memberToken}` },
        data: { rootCause: 'x', correctiveAction: 'y' },
      });
      expect([403, 404], 'and not another project’s').toContain(foreignPlan.status());

      // 10 — membership is not authority. QA/QC carries no HSE permission at all, so a permit is
      //      refused on the very project they are a member of.
      const permit = await s.post<{ id: string }>('/hse/ptws', {
        projectId: s.mine.id, permitType: 'hot_work', description: `PTW-${s.run}-Q`,
        validFrom: '2026-09-13', validTo: '2026-09-14',
      });
      const approve = await request.put(`${V1}/hse/ptws/${permit.id}/approve`, {
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${s.memberToken}` },
        data: { approvedBy: MEMBER },
      });
      expect(approve.status(), 'QA/QC holds no HSE authority, membership notwithstanding').toBe(403);

      // 11 — an empty project renders its area rather than an error.
      const empty = await s.post<{ id: string }>('/projects/projects', { title: `Qual ${s.run} EMPTY`, code: `QU-${s.run}-E` });
      for (const roleId of ['r-pm', 'r-qa-qc']) await s.post(`/projects/${empty.id}/members`, { userId: MEMBER, roleId });
      await page.goto(`${baseURL}/project/${empty.id}/quality`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).toContainText('Quality', { timeout: 30_000 });
      await expect(page.locator('body')).not.toContainText(/could not be read|unavailable/i);

      // 12
      expect(errors, 'no runtime error on any Quality surface').toEqual([]);
    } finally {
      await context.close();
    }
  });
});
