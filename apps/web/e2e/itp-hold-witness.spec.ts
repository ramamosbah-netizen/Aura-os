// AURA OS — QHS-02: a hold point is released by its inspection, and every point result says who
// recorded it, when, and on what inspection. Auth ON, PostgreSQL, the shipped roles.
//
// Recording a point result stored a bare status — no actor, no time, no inspection — and a later
// write replaced it without trace, so a hold point could read "passed" with nobody behind it and a
// sign-off somebody relied on could be quietly rewritten. Proved here:
//
//   hold       QA/QC cannot pass a hold point on screen with no inspection, nor on one not yet
//              approved; it passes on the approved inspection the Site Engineer requested
//   witness    may pass with no inspection cited, and says so; a failed point is re-inspected
//   record     each result shows who recorded it, when and on which inspection, and survives a reload
//   final      a passed point cannot be re-recorded (409)
//   refused    the Site Engineer, who requests inspections, cannot record a result (403)
//   receipt    the Site Engineer reads the released hold point and who released it; QA/QC closes the plan
import { expect, test, type Browser, type Page } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { memberPassword, signInAs } from './project-member-harness';
import { provisionedActorsUnavailable } from './provisioned-actors';

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const QAQC = process.env.E2E_QAQC_USERNAME ?? 'u-e2e-qaqc';
const SITE = 'u-e2e-site';

async function seat(browser: Browser, baseURL: string, username: string): Promise<Page> {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  expect(await signInAs(page, baseURL, username), `${username} could not sign in`).toBe(true);
  return page;
}

test('a hold point passes only on its approved inspection, and every result names who recorded it', async ({ browser, baseURL, request }) => {
  test.setTimeout(360_000);
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  test.skip(!memberPassword(), 'needs a password to sign the roles in');
  const unavailable = await provisionedActorsUnavailable(request);
  test.skip(unavailable !== null, unavailable ?? '');
  const run = Date.now().toString().slice(-6);
  const tokenOf = async (username: string) => {
    const res = await request.post(`${API}/auth/login`, { data: { username, password: memberPassword() } });
    expect(res.ok(), `${username} login`).toBe(true);
    return { 'content-type': 'application/json', Authorization: `Bearer ${((await res.json()) as { token: string }).token}` };
  };
  const as = { qaqc: await tokenOf(QAQC), site: await tokenOf(SITE) };

  const projectRes = await request.post(`${API}/projects/projects`, { headers: { 'content-type': 'application/json', ...apiAuthHeaders() }, data: { title: `QHS-02 ${run}` } });
  expect(projectRes.ok(), await projectRes.text()).toBe(true);
  const project = (await projectRes.json()) as { id: string };
  const created = await request.post(`${API}/quality/itps`, {
    headers: as.qaqc,
    data: {
      projectId: project.id, reference: `ITP-ELV-${run}`, title: 'Containment and cabling', discipline: 'elv',
      points: [
        { activity: 'Cable tray fixing before ceiling close', pointType: 'hold', acceptanceCriteria: 'Supports at 1.5 m centres' },
        { activity: 'Cable pull test', pointType: 'witness', acceptanceCriteria: 'No sheath damage' },
      ],
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const itp = (await created.json()) as { id: string; reference: string };
  const hold = `${itp.id}-0`;
  const witness = `${itp.id}-1`;

  const qaqc = await seat(browser, baseURL!, QAQC);
  const site = await seat(browser, baseURL!, SITE);
  try {
    /** The plan's points, opened — the reference is a client button, so a click before hydration is retried. */
    const openPlan = async (p: Page) => {
      await p.goto('/quality/itps', { waitUntil: 'domcontentloaded' });
      await expect(async () => {
        if (!(await p.getByTestId(`itp-point-${hold}`).isVisible())) await p.getByTestId(`itp-open-${itp.id}`).click();
        await expect(p.getByTestId(`itp-point-${hold}`)).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 60_000 });
    };

    // ── QA/QC PUTS THE PLAN IN FORCE, ON SCREEN ─────────────────────────────────────────────────────
    await qaqc.goto('/quality/itps', { waitUntil: 'domcontentloaded' });
    await expect(async () => {
      await qaqc.getByTestId(`itp-activate-${itp.id}`).click({ timeout: 3_000 });
      await expect(qaqc.getByTestId(`itp-activate-${itp.id}`)).toHaveCount(0, { timeout: 3_000 });
    }).toPass({ timeout: 60_000 });

    // ── A HOLD POINT WITH NO INSPECTION BEHIND IT IS NOT PASSED ─────────────────────────────────────
    await openPlan(qaqc);
    await qaqc.getByTestId(`itp-pass-${hold}`).click();
    await expect(qaqc.getByTestId('itp-error')).toContainText('approved inspection request is required to pass hold point 1');
    await expect(qaqc.getByTestId(`itp-result-${hold}`)).toHaveText('pending');

    // ── THE SITE ENGINEER CALLS THE INSPECTION; UNTIL IT IS APPROVED, IT RELEASES NOTHING ───────────
    const irRes = await request.post(`${API}/quality/irs`, {
      headers: as.site,
      data: { projectId: project.id, irNumber: `IR-TRAY-${run}`, discipline: 'elv', locationDetail: 'Level 3 corridor ceiling', inspectionDate: '2026-10-05' },
    });
    expect(irRes.ok(), await irRes.text()).toBe(true);
    const ir = (await irRes.json()) as { id: string; irNumber: string };
    await openPlan(qaqc);
    await qaqc.getByTestId(`itp-cite-${hold}`).selectOption(ir.id);
    await qaqc.getByTestId(`itp-pass-${hold}`).click();
    await expect(qaqc.getByTestId('itp-error')).toContainText(`${ir.irNumber} is not approved (status requested)`);
    await expect(qaqc.getByTestId(`itp-result-${hold}`)).toHaveText('pending');

    // ── THE SITE ENGINEER MAY NOT RECORD THE RESULT ─────────────────────────────────────────────────
    expect((await request.put(`${API}/quality/itps/${itp.id}/points/0`, { headers: as.site, data: { result: 'passed', inspectionRequestId: ir.id } })).status()).toBe(403);

    // ── APPROVED, THE INSPECTION RELEASES THE HOLD POINT ────────────────────────────────────────────
    const resolved = await request.put(`${API}/quality/irs/${ir.id}/resolve`, { headers: as.qaqc, data: { status: 'approved', comments: 'Supports checked at 1.5 m' } });
    expect(resolved.ok(), await resolved.text()).toBe(true);
    await openPlan(qaqc);
    await qaqc.getByTestId(`itp-cite-${hold}`).selectOption(ir.id);
    await qaqc.getByTestId(`itp-pass-${hold}`).click();
    await expect(qaqc.getByTestId(`itp-result-${hold}`)).toHaveText('passed', { timeout: 30_000 });
    await expect(qaqc.getByTestId(`itp-record-${hold}`)).toContainText(QAQC);
    await expect(qaqc.getByTestId(`itp-record-${hold}`)).toContainText(ir.irNumber);
    await expect(qaqc.getByTestId(`itp-pass-${hold}`), 'a passed point offers nothing further').toHaveCount(0);

    // ── A WITNESS POINT: FAILED, RE-INSPECTED, PASSED — EACH RESULT KEPT ────────────────────────────
    await qaqc.getByTestId(`itp-fail-${witness}`).click();
    await expect(qaqc.getByTestId(`itp-result-${witness}`)).toHaveText('failed', { timeout: 30_000 });
    await expect(qaqc.getByTestId(`itp-record-${witness}`)).toContainText('no inspection cited');
    await qaqc.getByTestId(`itp-pass-${witness}`).click();
    await expect(qaqc.getByTestId(`itp-result-${witness}`)).toHaveText('passed', { timeout: 30_000 });
    await expect(qaqc.getByTestId(`itp-record-${witness}`)).toContainText('2 results recorded');

    // ── IT SURVIVES A RELOAD, AND A PASSED POINT IS FINAL ───────────────────────────────────────────
    await openPlan(qaqc);
    await expect(qaqc.getByTestId(`itp-result-${hold}`)).toHaveText('passed');
    await expect(qaqc.getByTestId(`itp-record-${hold}`)).toContainText(ir.irNumber);
    await expect(qaqc.getByTestId(`itp-record-${witness}`)).toContainText('2 results recorded');
    const rewrite = await request.put(`${API}/quality/itps/${itp.id}/points/0`, { headers: as.qaqc, data: { result: 'failed' } });
    expect(rewrite.status(), 'a sign-off somebody relied on is not quietly rewritten').toBe(409);
    expect(((await rewrite.json()) as { message: string }).message).toMatch(/has already passed — a passed point is final/);
    const stored = (await (await request.get(`${API}/quality/itps?projectId=${project.id}`, { headers: as.qaqc })).json()) as Array<{ id: string; points: Array<{ history?: Array<{ result: string; recordedBy: string; inspectionRequestId: string | null }> }> }>;
    const plan = stored.find((i) => i.id === itp.id)!;
    expect(plan.points[0].history).toEqual([expect.objectContaining({ result: 'passed', recordedBy: QAQC, inspectionRequestId: ir.id })]);
    expect(plan.points[1].history?.map((h) => h.result)).toEqual(['failed', 'passed']);

    // ── THE SITE ENGINEER READS THE RELEASE; QA/QC CLOSES THE PLAN ──────────────────────────────────
    await openPlan(site);
    await expect(site.getByTestId(`itp-result-${hold}`)).toHaveText('passed');
    await expect(site.getByTestId(`itp-record-${hold}`)).toContainText(`${QAQC}`);
    await expect(site.getByTestId(`itp-record-${hold}`)).toContainText(ir.irNumber);
    await expect(site.getByTestId(`itp-pass-${witness}`)).toHaveCount(0);
    const closed = await request.put(`${API}/quality/itps/${itp.id}/close`, { headers: as.qaqc, data: {} });
    expect(closed.ok(), await closed.text()).toBe(true);
  } finally {
    await qaqc.context().close();
    await site.context().close();
  }
});
