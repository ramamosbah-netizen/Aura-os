// AURA OS — TC-GATE-2: the four-surface T&C workspace, driven end to end in the browser.
//
// Gate 1 proved the run lineage was correct. This proves it is USABLE: that a tester can select a
// project, open a system, author and execute a point, see a failure the moment it happens, raise the
// defect it caused, retest, watch the blockers clear, and sign off — without reloading, and without
// the screen ever promising a commissioning the backend would refuse.
import { expect, test, type Page } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';

const API = (process.env.AURA_API_URL ?? 'http://localhost:4000') + '/api/v1/commissioning/records';
const H = () => apiAuthHeaders();

const tabs = (page: Page) => page.getByRole('tablist', { name: 'Open AURA tabs' }).getByRole('tab');

test('the T&C workspace carries a system from no evidence to witnessed sign-off', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate2', baseURL);
  const code = `CX-WS-${Date.now().toString().slice(-6)}`;
  const created = await page.request.post(API, {
    headers: H(),
    data: { projectId, code, title: 'Structured cabling — Level 3', system: 'structured_cabling' },
  });
  test.skip(created.status() === 502 || created.status() === 404 || !created.ok(), 'commissioning API not reachable');

  // ── Project context, and the four surfaces ─────────────────────────────────────────────────────
  await page.goto('/commissioning', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('commissioning-workspace')).toBeVisible();
  // The workspace anchors its own AURA tab, unchanged from 08fd19e4.
  await expect(tabs(page).filter({ hasText: 'Testing' })).toHaveCount(1);

  await page.getByTestId('project-filter').selectOption(projectId);
  await expect(page).toHaveURL(new RegExp(`project=${projectId}`));
  await expect(page.getByTestId('cx-card-all-systems')).toContainText('1');

  // A system with nothing to prove is not "ready" — the Overview says what is missing.
  await expect(page.getByTestId('cx-blocking')).toContainText('No test points defined');

  // Navigating the sections keeps the project. This is the continuity requirement, asserted rather
  // than assumed: a section switch that drops the filter silently shows another project's work.
  for (const section of ['systems', 'testing', 'defects', 'overview']) {
    await page.getByTestId(`cx-section-${section}`).click();
    await expect(page).toHaveURL(new RegExp(`project=${projectId}`));
  }
  await expect(page.getByTestId('cx-section-overview')).toHaveAttribute('aria-current', 'page');

  // A section click must not be able to land in the gap while a project change is still in flight:
  // the query the click would write back is the PREVIOUS one, which silently discards the project
  // the reader just picked. The strip is inert until the navigation commits, so the project holds.
  await page.getByTestId('project-filter').selectOption('');
  await page.getByTestId('project-filter').selectOption(projectId);
  await expect(page.getByTestId('cx-section-testing')).toBeEnabled();
  await page.getByTestId('cx-section-testing').click();
  await expect(page).toHaveURL(new RegExp(`project=${projectId}`));
  await page.getByTestId('cx-section-overview').click();

  // ── Systems & Equipment: scope is T&C's, equipment is read from its own authority ──────────────
  await page.getByTestId('cx-section-systems').click();
  await expect(page.getByTestId('cx-scope')).toContainText(code);
  await expect(page.getByTestId('equipment-authority')).toContainText(/ELV device register, which owns this equipment/i);
  // Empty state, proved rather than assumed: this project has no devices registered.
  await expect(page.getByText('No devices registered for this project')).toBeVisible();

  // ── Testing: open the system, author a point, execute it ───────────────────────────────────────
  await page.getByTestId('cx-section-testing').click();
  await page.getByTestId(`cx-open-${code}`).click();
  // A real loading state while the system's detail is fetched.
  await expect(page.getByTestId(`system-panel-${code}`)).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('add-test-point').click();
  await page.getByTestId('point-no').fill('PL-034');
  await page.getByTestId('point-description').fill('Permanent link 034');
  await page.getByTestId('point-expected').fill('90 m or less');
  await page.getByTestId('point-save').click();
  await expect(page.getByTestId('test-point-PL-034')).toBeVisible();
  // Reconciled without a reload: the list line above the panel already knows.
  await expect(page.getByTestId(`cx-points-${code}`)).toContainText('0/1 passed');

  // Server-side validation surfaced, not swallowed: a failing run must explain itself.
  await page.getByTestId('record-run-PL-034').click();
  await page.getByTestId('run-fail-PL-034').click();
  await expect(page.getByTestId('run-error')).toContainText(/remarks/i);

  await page.getByTestId('run-actual-PL-034').fill('104.8 m');
  await page.getByTestId('run-remarks-PL-034').fill('Over length at patch panel');
  await page.getByTestId('run-fail-PL-034').click();

  // The failure is visible immediately, with the measurement that caused it.
  await expect(page.getByTestId('run-PL-034-1')).toContainText('fail');
  await expect(page.getByTestId('run-PL-034-1')).toContainText('104.8 m');
  await expect(page.getByTestId('point-result-PL-034')).toHaveText('fail');
  // …and the blockers above it reconciled in the same beat.
  await expect(page.getByTestId(`cx-blockers-${code}`)).toContainText(/failing/i);
  await expect(page.getByTestId(`cx-state-${code}`)).toHaveText('failing');

  // ── Defects & Retests: the failure, and the defect raised from it ──────────────────────────────
  await page.getByTestId('cx-section-defects').click();
  await expect(page.getByTestId('failing-PL-034')).toContainText('failed on run #1');
  await expect(page.getByTestId('failing-PL-034')).toContainText('104.8 m');
  // The authority boundary is stated on screen, not assumed.
  await expect(page.getByTestId('quality-boundary')).toContainText(/owned by Quality/i);

  await page.getByTestId('raise-defect-PL-034').click();
  await expect(page.getByTestId('defect-raised-PL-034')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('cx-open-defects')).toContainText(/raised from a failing test point/i);

  // ── Sign-off is refused while the defect is open, and the screen agrees ────────────────────────
  await page.getByTestId('cx-section-testing').click();
  await expect(page.getByTestId(`cx-blockers-${code}`)).toContainText(/open punch item/i);
  await page.getByTestId(`cx-open-${code}`).click();
  await expect(page.getByTestId(`system-panel-${code}`)).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('btn-commission').click();
  await expect(page.getByTestId('cx-error')).toContainText(/open punch|still failing/i);

  // ── Retest, close the defect, and the blockers clear ───────────────────────────────────────────
  await page.getByTestId('record-run-PL-034').click();
  await page.getByTestId('run-actual-PL-034').fill('71.2 m');
  await page.getByTestId('run-remarks-PL-034').fill('Re-pulled through riser and re-tested');
  await page.getByTestId('run-pass-PL-034').click();

  await expect(page.getByTestId('point-result-PL-034')).toHaveText('pass');
  // BOTH runs remain — the failure is not erased by the retest that fixed it.
  await expect(page.getByTestId('run-PL-034-1')).toContainText('fail');
  await expect(page.getByTestId('run-PL-034-2')).toContainText('pass');
  await expect(page.getByTestId('retested-PL-034')).toBeVisible();

  await page.locator('[data-testid^="close-punch-"]').first().click();
  await expect(page.getByTestId('punch-gate')).toHaveCount(0, { timeout: 15_000 });

  // ── Sign and witness ───────────────────────────────────────────────────────────────────────────
  await page.getByPlaceholder('Commissioned by').fill('Test Engineer');
  await page.getByPlaceholder('Witnessed by (consultant/client)').fill('Client Consultant');
  await page.getByTestId('btn-commission').click();

  // Commissioned, visible WITHOUT a reload.
  await expect(page.getByTestId('cx-locked')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId(`cx-state-${code}`)).toHaveText('commissioned');
  await expect(page.getByTestId('record-run-PL-034')).toHaveCount(0);

  // ── Reload: persistence and history unchanged ──────────────────────────────────────────────────
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('cx-section-testing').click();
  await page.getByTestId(`cx-open-${code}`).click();
  await expect(page.getByTestId(`system-panel-${code}`)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('run-PL-034-1')).toContainText('fail');
  await expect(page.getByTestId('run-PL-034-2')).toContainText('pass');
  await expect(page.getByTestId('cx-locked')).toBeVisible();

  // Back to Overview: the system is commissioned and nothing blocks it.
  await page.getByTestId('cx-section-overview').click();
  await expect(page.getByTestId('cx-card-commissioned-testing')).toContainText('1');
  await expect(page.getByTestId('cx-nothing-blocking')).toBeVisible();
});

test('the first click after a fresh navigation is not dropped', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate2 Hydration', baseURL);
  const code = `CX-HY-${Date.now().toString().slice(-6)}`;
  const created = await page.request.post(API, { headers: H(), data: { projectId, code, title: 'CCTV — hydration', system: 'cctv' } });
  test.skip(!created.ok(), 'commissioning API not reachable');

  // Straight to the section, cold. The known systemic risk is a click landing on server-rendered
  // markup before React attaches, which does nothing and leaves the tester staring at an unchanged
  // screen. Controls stay disabled until hydration, so this asserts the control is ENABLED first and
  // then that one click is enough.
  await page.goto(`/commissioning?section=testing&project=${projectId}`, { waitUntil: 'domcontentloaded' });
  const open = page.getByTestId(`cx-open-${code}`);
  await expect(open).toBeEnabled({ timeout: 15_000 });
  await open.click();
  await expect(page.getByTestId(`system-panel-${code}`)).toBeVisible({ timeout: 15_000 });
});

test('a mutation cannot be double-submitted, and the section strip is keyboard reachable', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate2 Guards', baseURL);
  const code = `CX-GD-${Date.now().toString().slice(-6)}`;
  const created = await page.request.post(API, { headers: H(), data: { projectId, code, title: 'CCTV — guards', system: 'cctv' } });
  test.skip(!created.ok(), 'commissioning API not reachable');
  const { id } = await created.json();
  await page.request.post(`${API}/${id}/test-items`, { headers: H(), data: { pointNo: 'IMG-01', description: 'Camera image' } });

  await page.goto(`/commissioning?section=testing&project=${projectId}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId(`cx-open-${code}`).click();
  await expect(page.getByTestId(`system-panel-${code}`)).toBeVisible({ timeout: 15_000 });

  // Double-click the pass button: the in-flight guard must make the second click a no-op, so the
  // point ends with ONE run rather than two identical executions nobody performed twice.
  await page.getByTestId('record-run-IMG-01').click();
  await page.getByTestId('run-actual-IMG-01').fill('Image on VMS');
  const pass = page.getByTestId('run-pass-IMG-01');
  await pass.dblclick();
  await expect(page.getByTestId('run-IMG-01-1')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('run-IMG-01-2')).toHaveCount(0);

  // Keyboard: the section strip is real buttons, reachable and operable without a mouse.
  const defects = page.getByTestId('cx-section-defects');
  await defects.focus();
  await expect(defects).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('cx-section-defects')).toHaveAttribute('aria-current', 'page');
});
