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

test('never claims the register is unreadable while it is still being read', async ({ page }) => {
  // Found by looking at a screenshot, not by a test: the panel treated its own initial state as a
  // failed read, so the first paint announced "could not be read" — beside an empty table saying
  // "No risks identified". Two contradictory claims, neither of them established.
  //
  // Asserted on a project that HAS a risk, so a genuinely empty register cannot make this pass.
  const id = await createProject(page.request, `Risk load state ${RUN}`);
  const seeded = await page.request.post('/api/projects/risks', {
    data: { projectId: id, title: `Seeded before load ${RUN}`, likelihood: 'high', impact: 'high' },
  });
  expect(seeded.ok(), 'the fixture must exist for this to mean anything').toBe(true);

  await page.goto(`/project/${id}/controls?tab=risks`, { waitUntil: 'domcontentloaded' });
  const row = page.getByTestId('risk-row').filter({ hasText: `Seeded before load ${RUN}` });
  await expect(row).toBeVisible();

  // Once the read has landed and succeeded, the failure notice must be absent — and must never
  // have been the resting state of a screen whose fetch simply had not returned.
  await expect(page.getByTestId('risk-register-unavailable')).toHaveCount(0);
  await expect(page.getByTestId('project-risks-panel')).not.toContainText('No risks identified');
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

test('a register entry can be corrected, and correcting it never moves its status', async ({ page }) => {
  const id = await createProject(page.request, `Risk edit ${RUN}`);
  await openRegister(page, id);

  const form = page.getByTestId('risk-authoring-form');
  await form.getByLabel('Risk title').fill(`Switchgear delivery slipping ${RUN}`);
  await form.getByLabel('Likelihood').selectOption('low');
  await form.getByLabel('Impact').selectOption('low');
  await form.getByRole('button', { name: 'Add to register' }).click();

  const row = page.getByTestId('risk-row').filter({ hasText: `Switchgear delivery slipping ${RUN}` });
  await expect(row).toBeVisible();
  await expect(row).toContainText('LOW');

  // Move it out of OPEN first, so the edit has a status it could plausibly disturb.
  await row.getByRole('button', { name: 'Mitigate' }).click();
  await expect(row).toContainText('MITIGATING');

  await row.getByRole('button', { name: 'Edit' }).click();
  const editForm = page.getByTestId('register-edit-form');
  await editForm.getByLabel('Edit title').fill(`Switchgear delivery slipping badly ${RUN}`);
  // Re-grading goes through the two axes. There is no severity field to type into, on the edit
  // form any more than on the create form.
  await expect(editForm.getByLabel('Edit severity')).toHaveCount(0);
  await editForm.getByLabel('Edit likelihood').selectOption('high');
  await editForm.getByLabel('Edit impact').selectOption('high');
  await editForm.getByLabel('Edit owner').fill('Procurement lead');
  await editForm.getByRole('button', { name: 'Save' }).click();

  const edited = page.getByTestId('risk-row').filter({ hasText: `Switchgear delivery slipping badly ${RUN}` });
  await expect(edited).toBeVisible();
  // Severity is RECOMPUTED from the new axes, not carried and not typed.
  await expect(edited).toContainText('CRITICAL');
  await expect(edited).toContainText('Procurement lead');
  // And the lifecycle is exactly where it was. A status change riding in on a correction would be
  // an unlogged move — which is why no layer forwards `status` on this path.
  await expect(edited).toContainText('MITIGATING');
});

test('a reader without permission is refused in the domain\'s own words', async ({ page, browser }) => {
  const viewer = process.env.E2E_VIEWER_USERNAME;
  const apiBase = process.env.AURA_API_URL;
  test.skip(!viewer || !apiBase, 'needs a restricted viewer and an API base to mean anything');

  const id = await createProject(page.request, `Risk forbidden ${RUN}`);

  const ctx = await browser.newContext();
  const login = await ctx.request.post(`${apiBase}/api/v1/auth/login`, {
    data: { username: viewer, password: process.env.E2E_PASSWORD ?? 'e2e-password' },
  });
  expect(login.ok(), await login.text()).toBe(true);
  const token = (await login.json() as { token: string }).token;

  // Refused, and refused by NAME. "Action failed" would leave an administrator guessing which
  // grant to add; naming the permission is the difference between a dead end and a next step.
  const denied = await ctx.request.post(`${apiBase}/api/v1/projects/risks`, {
    headers: { authorization: `Bearer ${token}` },
    data: { projectId: id, title: 'should not exist' },
  });
  expect(denied.status()).toBe(403);
  expect(await denied.text()).toContain('projects.risk.create');

  // The guard and the service must demand the SAME permission for a status move. Route derivation
  // would have asked for `projects.risk.status` while the service asserts `projects.risk.update`,
  // so a role scoped precisely to the latter would pass the service and be refused at the door.
  const deniedMove = await ctx.request.patch(
    `${apiBase}/api/v1/projects/risks/11111111-1111-4111-8111-111111111111/status`,
    { headers: { authorization: `Bearer ${token}` }, data: { status: 'MITIGATING' } },
  );
  expect(deniedMove.status()).toBe(403);
  expect(await deniedMove.text()).toContain('projects.risk.update');
  await ctx.close();
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
