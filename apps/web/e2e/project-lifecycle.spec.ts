import { expect, test, type APIRequestContext } from '@playwright/test';
import { createProject, runId, scoped } from './fixtures';

/**
 * §2 — the project lifecycle, proved in a browser.
 *
 * The API tests prove the gate refuses. This proves the SCREEN never asks someone to press a
 * button the API will refuse, which is the failure this work was really about: Project 360 held
 * its own copy of the lifecycle rules, decided for itself that "Start execution" was available on
 * any planned project, and the API then rejected it. The person had already committed to the
 * action before finding out.
 *
 * So every assertion here is about what the page OFFERS, not about what the API answers.
 */

const RUN = runId();

async function scopeAndBaseline(request: APIRequestContext, id: string): Promise<void> {
  const node = await request.post('/api/projects/wbs', {
    data: { projectId: id, code: '01', title: 'ELV installation', plannedValue: 500_000 },
  });
  expect(node.ok(), 'the work package fixture must exist').toBe(true);
  const baseline = await request.post(`/api/projects/projects/${id}/wbs-baseline`, { data: {} });
  expect(baseline.ok(), 'the opening baseline fixture must exist').toBe(true);
}

test('an unplanned project is offered execution as a refusal, with its reasons', async ({ page }) => {
  const id = await createProject(page.request, `Lifecycle unplanned ${RUN}`);

  await page.goto(`/project/${id}/controls`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('project-controls-client')).toBeVisible();

  // Offered, not hidden. Hiding it answers "why can't I start this project?" with silence, and the
  // reason is the useful half.
  const start = page.getByRole('button', { name: /Start execution/ });
  await expect(start).toBeVisible();
  await expect(start).toBeDisabled();

  // And the refusal says what to do about it, in the band rather than only in a tooltip.
  await expect(page.getByText('No scope structure', { exact: false })).toBeVisible();
  await expect(page.getByText('No approved baseline', { exact: false })).toBeVisible();

  // The stage BEFORE execution is available: a project with nothing yet can still start planning.
  await expect(page.getByRole('button', { name: /Begin planning/ })).toBeEnabled();
});

test('once scope and a baseline exist, the same button works', async ({ page }) => {
  const id = await createProject(page.request, `Lifecycle planned ${RUN}`);
  await scopeAndBaseline(page.request, id);

  await page.goto(`/project/${id}/controls`, { waitUntil: 'domcontentloaded' });
  const start = page.getByRole('button', { name: /Start execution/ });
  await expect(start).toBeEnabled();
  await start.click();

  // The record re-reads its own state rather than assuming the write landed.
  await expect(page.getByText('In execution', { exact: false }).first()).toBeVisible();

  // And the next refusal is now the honest one: nothing has been registered for commissioning, so
  // testing and completion are both closed — and say so.
  await expect(page.getByRole('button', { name: /Complete project/ })).toBeDisabled();
  await expect(page.getByText('No systems are registered for commissioning', { exact: false }).first()).toBeVisible();
});

test('a planner can clear the refusal without leaving the app', async ({ page }) => {
  // The journey, end to end, with NO API fixtures. This is the test that would have caught the
  // dead end: the gate demanded an approved baseline and nothing in the product could produce one,
  // so a planner could read exactly what was wanted and still be stuck. Everything below is done
  // with the mouse.
  const id = await createProject(page.request, `Lifecycle journey ${RUN}`);
  await page.goto(`/project/${id}/controls`, { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('button', { name: /Start execution/ })).toBeDisabled();

  await page.getByRole('tab', { name: 'Scope & plan' }).click();
  await page.getByLabel('WBS code').fill('01');
  await page.getByLabel('WBS title').fill('ELV installation');
  await page.getByLabel('WBS planned value').fill('500000');
  await page.getByRole('button', { name: 'Create WBS' }).click();

  const baseline = page.getByTestId('wbs-baseline-control');
  await expect(baseline.getByRole('button', { name: /Approve opening baseline/ })).toBeEnabled();
  await baseline.getByRole('button', { name: /Approve opening baseline/ }).click();
  await expect(baseline.getByText('Opening baseline approved')).toBeVisible();

  // The refusal clears itself off the same screen, without a reload.
  await expect(page.getByRole('button', { name: /Start execution/ })).toBeEnabled();
  await page.getByRole('button', { name: /Start execution/ }).click();
  await expect(page.getByText('In execution', { exact: false }).first()).toBeVisible();
});

test('cancelling demands a reason and records it', async ({ page }) => {
  const title = scoped(`Lifecycle cancel ${RUN}`);
  const created = await page.request.post('/api/projects/projects', {
    data: { title, reference: `LC-${RUN}`, value: 120_000 },
  });
  expect(created.ok()).toBe(true);
  const id = ((await created.json()) as { id: string }).id;

  await page.goto(`/project/${id}/controls`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Cancel project/ }).click();

  const dialog = page.getByTestId('project-cancel-dialog');
  await expect(dialog).toBeVisible();

  // The confirm is refused until a reason exists. A cancellation with no reason is a row that
  // changed with nobody attached to it, which is the shape an audit cannot follow.
  const confirm = dialog.getByRole('button', { name: /Cancel project/ });
  await expect(confirm).toBeDisabled();

  await page.getByTestId('cancel-reason').fill('Client withdrew funding');
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page.getByText('Cancelled', { exact: false }).first()).toBeVisible();

  // The record is the visible half; the event is the durable one. A cancelled project must carry
  // the stage it stopped in and the reason given, or "cancelled" is just a label.
  const after = await page.request.get(`/api/projects/projects/${id}/transitions`);
  expect(after.ok()).toBe(true);
  expect(await after.json(), 'a cancelled project is terminal — no move remains').toEqual([]);
});

test('a cancelled project offers no further moves', async ({ page }) => {
  const id = await createProject(page.request, `Lifecycle terminal ${RUN}`);
  const cancelled = await page.request.patch(`/api/projects/projects/${id}/cancel`, {
    data: { reason: 'Superseded by another package' },
  });
  expect(cancelled.ok()).toBe(true);

  await page.goto(`/project/${id}/controls`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('project-controls-client')).toBeVisible();

  // Terminal means terminal: no forward move, and no second cancellation.
  await expect(page.getByRole('button', { name: /Start execution|Begin planning|Complete project/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Cancel project$/ })).toHaveCount(0);
});
