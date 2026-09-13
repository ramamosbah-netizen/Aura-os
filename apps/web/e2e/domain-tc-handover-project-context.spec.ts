import { expect, test } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { MEMBER, V1, collectPageErrors, memberPassword, proveDomain, scenario, signInAs } from './project-member-harness';

/**
 * TESTING & COMMISSIONING and HANDOVER from a project member's seat, in a browser, with auth ON.
 *
 * ## This is access and navigation only
 *
 * The T&C gate programme and the Handover semantics are CLOSED and are not reopened here. Nothing
 * in this spec creates a test run, fails or retests a point, issues a dossier, or accepts a
 * package. What it asserts is that the existing canonical surfaces are reachable from a project and
 * unreachable from outside it — the authorities, their lifecycles and their distinctions are
 * exactly as they were:
 *
 *   • DocControl remains the controlled-document authority.
 *   • A Quality SNAG and a T&C PUNCH item remain different records.
 *   • T&C sign-off and Handover acceptance remain different decisions.
 *   • A dossier issue remains immutable; receipt remains distinct from acceptance.
 *
 * The identity holds `r-qa-qc`, which carries `commissioning.*` — the role that actually owns this
 * work — plus `r-pm` for discovery.
 */
test.describe('T&C and Handover in project context', () => {
  test.setTimeout(360_000);

  test('commissioning and handover open in context and refuse another project', async ({ browser, request, baseURL }) => {
    const admin = apiAuthHeaders().Authorization;
    test.skip(!admin, 'auth is off — a member and an admin would be indistinguishable');
    test.skip(!memberPassword(), 'needs a password to sign the member in');

    const s = await scenario(request, admin!, ['r-qa-qc'], 'Tc');

    const mineRef = `CX-${s.run}-MINE`;
    const theirsRef = `CX-${s.run}-THEIRS`;
    const system = (projectId: string, code: string) =>
      s.post<{ id: string }>('/commissioning/records', { projectId, code, title: `${code} CCTV tower`, system: 'cctv' });
    const mineSystem = await system(s.mine.id, mineRef);
    const theirsSystem = await system(s.theirs.id, theirsRef);

    const minePkg = `HO-${s.run}-MINE`;
    const theirsPkg = `HO-${s.run}-THEIRS`;
    const minePackage = await s.post<{ id: string }>('/commissioning/handovers', { projectId: s.mine.id, code: minePkg, title: 'Tower A handover' });
    const theirsPackage = await s.post<{ id: string }>('/commissioning/handovers', { projectId: s.theirs.id, code: theirsPkg, title: 'Tower B handover' });

    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = collectPageErrors(page);
    try {
      expect(await signInAs(page, baseURL!, MEMBER), `${MEMBER} signs in`).toBe(true);

      // ── T&C ────────────────────────────────────────────────────────────────────────────────────
      await proveDomain(page, baseURL!, s, {
        path: (id) => `/project/${id}/commissioning`,
        rendered: 'Commissioning',
        mineMarker: mineRef,
        theirsMarker: theirsRef,
      });

      // 5 — the canonical T&C workspace, in project context.
      await page.goto(`${baseURL}/commissioning?project=${s.mine.id}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body'), 'their system is listed').toContainText(mineRef, { timeout: 30_000 });
      await expect(page.locator('body'), 'and not the other project’s').not.toContainText(theirsRef);

      // 9 — another project's system, by id
      const foreignSystem = await s.get(`/commissioning/records/${theirsSystem.id}`, s.memberToken);
      expect([403, 404], 'another project’s system is not readable by id').toContain(foreignSystem.status);

      // 6 — a representative authorised action that does NOT touch a closed gate: defining a test
      //     point is the QA/QC member's own step, and it neither runs nor passes anything.
      const point = await request.post(`${V1}/commissioning/records/${mineSystem.id}/test-items`, {
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${s.memberToken}` },
        data: { pointNo: `TP-${s.run}`, description: 'camera image on VMS' },
      });
      expect([200, 201], `QA/QC defines a test point on their own system — ${await point.text()}`).toContain(point.status());

      const foreignPoint = await request.post(`${V1}/commissioning/records/${theirsSystem.id}/test-items`, {
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${s.memberToken}` },
        data: { pointNo: `TP-${s.run}-B`, description: 'x' },
      });
      expect([403, 404], 'and not on another project’s').toContain(foreignPoint.status());

      // ── HANDOVER ───────────────────────────────────────────────────────────────────────────────
      await page.goto(`${baseURL}/handover?project=${s.mine.id}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body'), 'their package is listed').toContainText(minePkg, { timeout: 30_000 });
      await expect(page.locator('body'), 'and not the other project’s').not.toContainText(theirsPkg);

      // The O&M and spares sections, reached in the same context — the representative Handover
      // surfaces. Read only: nothing is seeded, acknowledged or accepted.
      await page.goto(`${baseURL}/handover?project=${s.mine.id}&section=om`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body'), 'the O&M authority note renders in context')
        .toContainText(/O&M pack is Handover’s own authority|DocControl owns the controlled documents/i, { timeout: 30_000 });

      await page.goto(`${baseURL}/handover?project=${s.theirs.id}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).not.toContainText(/Loading/i, { timeout: 30_000 });
      await expect(page.locator('body'), 'another project’s handover must not render').not.toContainText(theirsPkg);

      const foreignPackage = await s.get(`/commissioning/handovers/${theirsPackage.id}`, s.memberToken);
      expect([403, 404], 'nor be readable by id').toContain(foreignPackage.status);
      const ownPackage = await s.get(`/commissioning/handovers/${minePackage.id}`, s.memberToken);
      expect(ownPackage.status, 'while their own is').toBe(200);

      // 10 — membership is not authority: QA/QC holds no HSE permission.
      const permit = await s.post<{ id: string }>('/hse/ptws', {
        projectId: s.mine.id, permitType: 'hot_work', description: `PTW-${s.run}-T`,
        validFrom: '2026-09-13', validTo: '2026-09-14',
      });
      const approve = await request.put(`${V1}/hse/ptws/${permit.id}/approve`, {
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${s.memberToken}` },
        data: { approvedBy: MEMBER },
      });
      expect(approve.status(), 'commissioning authority is not HSE authority').toBe(403);

      // 12
      expect(errors, 'no runtime error on any T&C or Handover surface').toEqual([]);
    } finally {
      await context.close();
    }
  });
});
