import { expect, test } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { MEMBER, V1, collectPageErrors, memberPassword, proveDomain, scenario, signInAs } from './project-member-harness';
import { provisionedActorsUnavailable } from './provisioned-actors';

/**
 * HSE from a project member's seat, in a browser, with auth ON.
 *
 * The identity holds `r-hse` (hse.*, site read) plus `r-pm` for discovery — and deliberately NOT
 * `r-qa-qc`, so the authority assertion below is about a boundary that really exists.
 *
 * Permits are the surface worth exercising: the PTW lifecycle is where HSE's authority actually
 * bites, and `approve` is the step a project member without the HSE role must never reach. Nothing
 * here changes a permit gate — a permit still needs its approved risk assessment, and this phase
 * does not touch that.
 */
test.describe('HSE in project context', () => {
  test.setTimeout(300_000);

  test('an HSE officer works inside their project and cannot reach another', async ({ browser, request, baseURL }) => {
    const admin = apiAuthHeaders().Authorization;
    test.skip(!admin, 'auth is off — a member and an admin would be indistinguishable');
    test.skip(!memberPassword(), 'needs a password to sign the member in');
    test.skip(
      (await provisionedActorsUnavailable(request)) !== null,
      (await provisionedActorsUnavailable(request)) ?? '',
    );

    const s = await scenario(request, admin!, ['r-hse'], 'Hse');

    const mineRef = `PTW-${s.run}-MINE`;
    const theirsRef = `PTW-${s.run}-THEIRS`;
    const permit = (projectId: string, ref: string) =>
      s.post<{ id: string }>('/hse/ptws', {
        projectId, permitType: 'hot_work', description: `${ref} hot works at riser`,
        validFrom: '2026-09-13', validTo: '2026-09-20',
      });
    const minePermit = await permit(s.mine.id, mineRef);
    const theirsPermit = await permit(s.theirs.id, theirsRef);

    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = collectPageErrors(page);
    try {
      expect(await signInAs(page, baseURL!, MEMBER), `${MEMBER} signs in`).toBe(true);

      await proveDomain(page, baseURL!, s, {
        path: (id) => `/project/${id}/hse`,
        rendered: 'HSE',
        mineMarker: mineRef,
        theirsMarker: theirsRef,
      });

      // 5 — the permit opens as a record, in project context.
      await page.goto(`${baseURL}/hse/permits/${minePermit.id}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body'), 'their own permit opens').toContainText(mineRef, { timeout: 30_000 });

      // 9 — another project's permit, by id
      await page.goto(`${baseURL}/hse/permits/${theirsPermit.id}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).not.toContainText(/Loading/i, { timeout: 30_000 });
      await expect(page.locator('body'), 'another project’s permit must not render').not.toContainText(theirsRef);
      const foreign = await s.get(`/hse/ptws/${theirsPermit.id}/detail`, s.memberToken);
      expect([403, 404], 'nor be readable through the API').toContain(foreign.status);

      // 6 — a representative authorised action. Requesting a permit is the HSE officer's own step on
      //     their own project; approving is gated on a risk assessment, which this phase does not
      //     touch, so the REQUEST is the honest thing to exercise here.
      const requested = await request.post(`${V1}/hse/ptws`, {
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${s.memberToken}` },
        data: {
          projectId: s.mine.id, permitType: 'height_work', description: `PTW-${s.run}-ACT`,
          validFrom: '2026-09-13', validTo: '2026-09-15',
        },
      });
      expect([200, 201], `an HSE officer raises a permit on their project — ${await requested.text()}`).toContain(requested.status());

      const foreignRequest = await request.post(`${V1}/hse/ptws`, {
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${s.memberToken}` },
        data: {
          projectId: s.theirs.id, permitType: 'height_work', description: `PTW-${s.run}-BAD`,
          validFrom: '2026-09-13', validTo: '2026-09-15',
        },
      });
      expect(foreignRequest.status(), 'and cannot raise one on a project they are not on').toBe(403);

      // 10 — membership is not authority. `r-hse` carries no quality permission, so raising an NCR
      //      on their own project is refused.
      const ncr = await request.post(`${V1}/quality/ncrs`, {
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${s.memberToken}` },
        data: { projectId: s.mine.id, ncrNumber: `NCR-${s.run}-H`, description: 'x', severity: 'minor', system: 'cctv' },
      });
      expect(ncr.status(), 'an HSE officer holds no Quality authority, membership notwithstanding').toBe(403);

      // 11
      const empty = await s.post<{ id: string }>('/projects/projects', { title: `Hse ${s.run} EMPTY`, code: `HS-${s.run}-E` });
      for (const roleId of ['r-pm', 'r-hse']) await s.post(`/projects/${empty.id}/members`, { userId: MEMBER, roleId });
      await page.goto(`${baseURL}/project/${empty.id}/hse`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).toContainText('HSE', { timeout: 30_000 });
      await expect(page.locator('body')).not.toContainText(/could not be read|unavailable/i);

      // 12
      expect(errors, 'no runtime error on any HSE surface').toEqual([]);
    } finally {
      await context.close();
    }
  });
});
