import { expect, test } from '@playwright/test';

import { runId, scoped } from './fixtures';

test('Project 360 exposes governed WBS/CBS and Delay/EOT authoring', async ({ page }) => {
  const title = scoped('Parity authoring project');
  const created = await page.request.post('/api/projects/projects', {
    // Authoring WBS/CBS is planning work, so a `planned` project is the honest fixture here.
    data: { title, reference: `PAR-${runId()}`, value: 100_000 },
  });
  expect(created.ok()).toBe(true);
  const project = await created.json() as { id: string };

  await page.goto(`/project/${project.id}/controls`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('project-controls')).toBeVisible();

  // Renamed with the Project 360 rebuild: the tabs are grouped by the question each answers
  // ('Scope & plan') rather than by the artefact that happens to live there ('WBS / CBS').
  await page.getByRole('tab', { name: /Scope/ }).click();
  await page.getByLabel('WBS code').fill('1.1');
  await page.getByLabel('WBS title').fill('Install field devices');
  await page.getByLabel('WBS planned value').fill('25000');
  await page.getByRole('button', { name: 'Create WBS' }).click();
  await expect(page.getByRole('table', { name: 'Project WBS and CBS' })).toContainText('Install field devices');

  await page.getByLabel('CBS code').fill('01.01');
  await page.getByLabel('CBS title').fill('Equipment');
  await page.getByLabel('CBS budget').fill('25000');
  await page.getByRole('button', { name: 'Create CBS' }).click();
  await expect(page.getByRole('table', { name: 'Project CBS metadata' })).toContainText('Equipment');
  await expect(page.getByText(/Actual and committed values are Cost Ledger/)).toBeVisible();
  await expect(page.getByLabel('CBS actual')).toHaveCount(0);
  await expect(page.getByLabel('WBS progress')).toHaveCount(0);

  await page.getByRole('tab', { name: /^Time/ }).click();
  await page.getByLabel('Delay title').fill('Late access permit');
  await page.getByLabel('Delay start').fill('2026-09-01');
  await page.getByLabel('Delay days').fill('3');
  await page.getByRole('button', { name: 'Log delay' }).click();
  await expect(page.getByRole('table', { name: 'Project delay events' })).toContainText('Late access permit');

  await page.getByLabel('EOT title').fill('EOT claim for access permit');
  await page.getByLabel('EOT days').fill('3');
  await page.getByLabel('EOT justification').fill('Access permit was issued late.');
  await page.getByRole('button', { name: 'Create EOT draft' }).click();
  const claims = page.getByRole('table', { name: 'Project EOT claims' });
  await expect(claims).toContainText('EOT claim for access permit');
  await claims.getByRole('button', { name: 'Submit' }).click();
  await expect(claims).toContainText('submitted');
  await claims.getByRole('button', { name: 'Approve' }).click();
  await expect(claims).toContainText('approved');
});
