import { expect, test } from '@playwright/test';
import { createProject, runId } from './fixtures';

/**
 * §21 — the two registers, in a browser.
 *
 * The service tests prove the rules and the database proof pins the constraints. This proves the
 * SCREEN: that a project manager can reach the register at all, that the two registers read as two
 * rather than one blended list, and that the three governance rules a person can actually feel are
 * enforced where they will meet them.
 *
 * The specific failure being guarded against is the one that existed before this work: Plan &
 * Control linked to `/controls?tab=risks`, no such tab existed, and `validInitialTab` silently fell
 * back to Overview — so the person landed somewhere plausible and never learned the screen was
 * missing.
 */

const RUN = runId();
const openRegister = async (page: import('@playwright/test').Page, id: string): Promise<void> => {
  await page.goto(`/project/${id}/controls?tab=risks`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('project-risks-panel')).toBeVisible();
};

test('the Risks & issues link lands on the register, not silently on Overview', async ({ page }) => {
  const id = await createProject(page.request, `Risk link ${RUN}`);

  await page.goto(`/project/${id}/controls?tab=risks`, { waitUntil: 'domcontentloaded' });

  // The deep link is the whole point: it existed and pointed at nothing for as long as the tab
  // was missing, and the fallback made that invisible.
  await expect(page.getByTestId('project-risks-panel')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Risk register' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Issue register' })).toBeVisible();
});

test('a risk is graded by the matrix, never by what someone types', async ({ page }) => {
  const id = await createProject(page.request, `Risk severity ${RUN}`);
  await openRegister(page, id);

  const form = page.getByTestId('risk-authoring-form');
  // There is no severity field at all — it is the OUTPUT of likelihood × impact, and a typed-in
  // value would be a number the matrix never produced.
  await expect(form.getByLabel('Risk severity')).toHaveCount(0);

  await form.getByLabel('Risk title').fill(`Authority approval may be delayed ${RUN}`);
  await form.getByLabel('Likelihood').selectOption('high');
  await form.getByLabel('Impact').selectOption('high');
  await form.getByRole('button', { name: 'Add to register' }).click();

  const row = page.getByTestId('risk-row').filter({ hasText: `Authority approval may be delayed ${RUN}` });
  await expect(row).toBeVisible();
  // high × high → CRITICAL, computed server-side.
  await expect(row).toContainText('CRITICAL');
  await expect(row).toContainText('high × high');
});

test('accepting a risk demands a reason, and the reason is kept apart from the mitigation', async ({ page }) => {
  const id = await createProject(page.request, `Risk accept ${RUN}`);
  await openRegister(page, id);

  const form = page.getByTestId('risk-authoring-form');
  await form.getByLabel('Risk title').fill(`Client may not release the workfront ${RUN}`);
  // `exact` matters: "Mitigation" is also a prefix of "Mitigation target date".
  await form.getByLabel('Mitigation', { exact: true }).fill('Weekly release meeting with the client');
  await form.getByRole('button', { name: 'Add to register' }).click();

  const row = page.getByTestId('risk-row').filter({ hasText: `Client may not release the workfront ${RUN}` });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Accept' }).click();

  // The confirm button is unreachable until a reason exists. An acceptance nobody had to justify
  // is indistinguishable from an unattended risk.
  const note = page.getByTestId('risk-issue-note-form');
  await expect(note.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  await note.getByLabel('Reason').fill('Client carries this; agreed at the 4 Sep meeting');
  await note.getByRole('button', { name: 'Confirm' }).click();

  await expect(row).toContainText('ACCEPTED');
  await expect(row).toContainText('Accepted: Client carries this');
  // The mitigation survives the acceptance — two different statements, neither erasing the other.
  await expect(row).toContainText('Mitigation: Weekly release meeting');
});

test('a risk that happens becomes a second record, and the register still says it was foreseen', async ({ page }) => {
  const id = await createProject(page.request, `Risk materialise ${RUN}`);
  await openRegister(page, id);

  const title = `Long-lead switchgear may slip ${RUN}`;
  const form = page.getByTestId('risk-authoring-form');
  await form.getByLabel('Risk title').fill(title);
  await form.getByLabel('Risk area').selectOption('PROCUREMENT');
  await form.getByLabel('Likelihood').selectOption('high');
  await form.getByLabel('Impact').selectOption('high');
  await form.getByRole('button', { name: 'Add to register' }).click();

  const riskRow = page.getByTestId('risk-row').filter({ hasText: title });
  await expect(riskRow).toBeVisible();
  await riskRow.getByRole('button', { name: 'It happened' }).click();

  // Severity is NOT carried across. The risk's CRITICAL was computed from a likelihood that has
  // now resolved to certainty, so a person states what it is doing to delivery instead.
  const note = page.getByTestId('risk-issue-note-form');
  await expect(note).toContainText('not carried over');
  await note.getByLabel('Issue severity').selectOption('critical');
  await note.getByRole('button', { name: 'Confirm' }).click();

  // TWO records. The risk keeps its forecast and is retired as MATERIALISED — not RESOLVED, which
  // would report a failed forecast as a success.
  await expect(riskRow).toContainText('MATERIALISED');
  await expect(riskRow).toContainText('CRITICAL');
  await expect(riskRow).toContainText('Occurred');

  const issueRow = page.getByTestId('issue-row').filter({ hasText: title });
  await expect(issueRow).toBeVisible();
  await expect(issueRow).toContainText('critical');
  await expect(issueRow).toContainText('Foreseen');
  // The area travels with it: a procurement risk that lands is a procurement issue.
  await expect(issueRow).toContainText('Procurement');

  // And the rollups count it once as a live issue, not twice as an exposure and a problem.
  const summary = page.getByTestId('risk-register-summary');
  await expect(summary).toContainText('Risks that occurred');
  await expect(summary).toContainText('Foreseen as risks');
});

test('ending an issue demands a note, and resolved is kept apart from withdrawn', async ({ page }) => {
  const id = await createProject(page.request, `Issue endings ${RUN}`);
  await openRegister(page, id);

  const form = page.getByTestId('issue-authoring-form');
  await form.getByLabel('Issue title').fill(`Access to riser 3 is blocked ${RUN}`);
  await form.getByLabel('Issue severity').selectOption('critical');
  await form.getByRole('button', { name: 'Raise issue' }).click();

  const row = page.getByTestId('issue-row').filter({ hasText: `Access to riser 3 is blocked ${RUN}` });
  await expect(row).toBeVisible();
  await expect(row).toContainText('critical');

  await row.getByRole('button', { name: 'Resolve' }).click();
  const note = page.getByTestId('risk-issue-note-form');
  // A resolution nobody had to write is indistinguishable from an issue somebody stopped looking at.
  await expect(note.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  await note.getByLabel('Reason').fill('Main contractor cleared the riser on 8 Sep');
  await note.getByRole('button', { name: 'Confirm' }).click();

  await expect(row).toContainText('resolved');
  await expect(row).toContainText('Resolved: Main contractor cleared the riser');

  // Reopening clears the resolution — a live issue still displaying a resolution that evidently
  // did not hold is a screen contradicting itself.
  await row.getByRole('button', { name: 'Reopen' }).click();
  await expect(row).toContainText('open');
  await expect(row).not.toContainText('Main contractor cleared the riser');
});

test('the register never changes the project it reports on', async ({ page }) => {
  // §21 records; §2 and §27 decide. Reading and writing the register must leave the lifecycle gate
  // exactly as it was — asserted rather than assumed from the absence of a button.
  const id = await createProject(page.request, `Risk readonly ${RUN}`);

  const before = await (await page.request.get(`/api/projects/projects/${id}/transitions`)).json();
  await openRegister(page, id);
  const form = page.getByTestId('issue-authoring-form');
  await form.getByLabel('Issue title').fill(`Coordination decision outstanding ${RUN}`);
  await form.getByRole('button', { name: 'Raise issue' }).click();
  await expect(page.getByTestId('issue-row').filter({ hasText: `Coordination decision outstanding ${RUN}` })).toBeVisible();

  const after = await (await page.request.get(`/api/projects/projects/${id}/transitions`)).json();
  expect(after, 'raising an issue must not move the lifecycle gate').toEqual(before);
});
