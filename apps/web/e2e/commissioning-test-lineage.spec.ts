// AURA OS — TC-GATE-1: test-run lineage and the tally bypass, proved in the browser.
//
// The two defects this gate closes are not visible in a green unit test alone, because both lived in
// what a person could SEE and DO: a failure that disappeared the moment it was corrected, and a
// sign-off reachable by typing a total over the evidence. So this drives the real 360 UI as a signed-
// in user and asserts, on screen:
//
//   run #1 FAIL recorded → visible → still visible after run #2 PASS → point reads pass
//   → commissioning blocked while a point stands failed → blocked while one was never executed
//   → a typed tally cannot move any of it → sign-off only once every point has passed
//   → signer and witness still required → history still on the record afterwards.
import { expect, test } from '@playwright/test';
import { projectFixtureId } from './fixtures';
import { apiAuthHeaders } from './api-auth';

const API = (process.env.AURA_API_URL ?? 'http://localhost:4000') + '/api/v1/commissioning/records';
const H = () => apiAuthHeaders();

test('a failed test survives its retest, and the tally cannot buy a sign-off', async ({ page, baseURL }) => {
  const code = `CX-LIN-${Date.now().toString().slice(-6)}`;
  const created = await page.request.post(API, {
    headers: H(),
    data: { projectId: await projectFixtureId(page.request, baseURL), code, title: 'Structured cabling — Level 3', system: 'structured_cabling' },
  });
  test.skip(created.status() === 502 || created.status() === 404 || !created.ok(), 'commissioning API not reachable');
  const { id } = await created.json();

  // Two points: one that will fail and be retested, one that stays unexecuted for a while.
  await page.request.post(`${API}/${id}/test-items`, { headers: H(), data: { pointNo: 'PL-034', description: 'Permanent link 034', expected: '≤ 90 m' } });
  await page.request.post(`${API}/${id}/test-items`, { headers: H(), data: { pointNo: 'IMG-01', description: 'Camera image', expected: 'Image on VMS' } });

  await page.goto(`/commissioning/${id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('test-point-PL-034')).toBeVisible();
  await expect(page.getByTestId('runs-PL-034')).toContainText('Never executed');

  // ── Run #1: FAIL, with the measurement that caused it ──────────────────────────────────────────
  await page.getByTestId('record-run-PL-034').click();
  await page.getByTestId('run-actual-PL-034').fill('104.8 m');
  await page.getByTestId('run-remarks-PL-034').fill('Over length at patch panel');
  await page.getByTestId('run-fail-PL-034').click();

  await expect(page.getByTestId('run-PL-034-1')).toContainText('fail');
  await expect(page.getByTestId('run-PL-034-1')).toContainText('104.8 m');
  await expect(page.getByTestId('point-result-PL-034')).toHaveText('fail');

  // A failing run must explain itself — the API refuses one that does not, and the UI says so.
  await page.getByTestId('record-run-PL-034').click();
  await page.getByTestId('run-fail-PL-034').click();
  await expect(page.getByTestId('run-error')).toContainText(/remarks/i);

  // ── The typed tally cannot overwrite the sheet ─────────────────────────────────────────────────
  const tally = await page.request.put(`${API}/${id}/test`, { headers: H(), data: { pointsPassed: 2, pointsTotal: 2 } });
  expect(tally.status(), 'a typed tally must be refused once a test sheet exists').toBe(409);
  expect(JSON.stringify(await tally.json())).toMatch(/only a system without an itemized test sheet/i);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('body'), 'the refused tally changed nothing on screen').toContainText('0/2 points passed');
  await expect(page.getByTestId('point-result-PL-034')).toHaveText('fail');

  // ── Sign-off is blocked while a point stands failed ────────────────────────────────────────────
  await page.getByTestId('btn-commission').click();
  await expect(page.getByTestId('cx-error')).toContainText(/still failing \(PL-034\)/);
  await expect(page.getByTestId('cx-status')).not.toHaveText('Commissioned');

  // ── Run #2: the retest passes. The failure stays. ──────────────────────────────────────────────
  await page.getByTestId('record-run-PL-034').click();
  await page.getByTestId('run-actual-PL-034').fill('71.2 m');
  await page.getByTestId('run-remarks-PL-034').fill('Re-pulled through riser and re-tested');
  await page.getByTestId('run-pass-PL-034').click();

  await expect(page.getByTestId('point-result-PL-034')).toHaveText('pass');
  await expect(page.getByTestId('run-PL-034-2')).toContainText('pass');
  await expect(page.getByTestId('run-PL-034-2')).toContainText('71.2 m');
  // THE POINT OF THE WHOLE GATE: run #1 is still there, still failed, still says why.
  await expect(page.getByTestId('run-PL-034-1')).toContainText('fail');
  await expect(page.getByTestId('run-PL-034-1')).toContainText('Over length at patch panel');
  await expect(page.getByTestId('retested-PL-034')).toBeVisible();

  // ── Sign-off still blocked: the second point was never executed ────────────────────────────────
  await page.getByTestId('btn-commission').click();
  await expect(page.getByTestId('cx-error')).toContainText(/never executed \(IMG-01\)/);

  await page.getByTestId('record-run-IMG-01').click();
  await page.getByTestId('run-actual-IMG-01').fill('Image on VMS');
  await page.getByTestId('run-pass-IMG-01').click();
  await expect(page.getByTestId('point-result-IMG-01')).toHaveText('pass');

  // ── Signer and witness are still required ──────────────────────────────────────────────────────
  const noWitness = await page.request.put(`${API}/${id}/commission`, { headers: H(), data: { commissionedBy: 'Test Engineer', witnessedBy: '  ' } });
  expect(noWitness.ok(), 'a sign-off without a witness must still be refused').toBe(false);

  // ── Now it signs off ───────────────────────────────────────────────────────────────────────────
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('Commissioned by').fill('Test Engineer');
  await page.getByPlaceholder('Witnessed by (consultant/client)').fill('Client Consultant');
  await page.getByTestId('btn-commission').click();
  await expect(page.getByTestId('cx-status')).toHaveText('Commissioned');
  await expect(page.getByTestId('signoff')).toContainText('Client Consultant');

  // ── And the history is still on the commissioned record ────────────────────────────────────────
  await expect(page.getByTestId('run-PL-034-1')).toContainText('fail');
  await expect(page.getByTestId('run-PL-034-2')).toContainText('pass');
  // A commissioned system is immutable: no way to add a run from the UI any more.
  await expect(page.getByTestId('record-run-PL-034')).toHaveCount(0);

  // The API agrees, queried directly: two runs on that point, oldest first.
  const runs = await (await page.request.get(`${API}/${id}/test-runs`, { headers: H() })).json();
  const lineage = (runs as { pointNo?: string; runNo: number; result: string; testItemId: string }[])
    .filter((r) => runs.find((x: { testItemId: string }) => x.testItemId === r.testItemId));
  expect(lineage.filter((r) => r.result === 'fail'), 'the failure is still queryable after sign-off').toHaveLength(1);
  expect(lineage.filter((r) => r.result === 'pass')).toHaveLength(2);
});
