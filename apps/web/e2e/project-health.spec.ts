import { expect, test } from '@playwright/test';
import { createProject, runId, scoped } from './fixtures';

/**
 * §24 — cross-domain project health, in a browser.
 *
 * The service tests prove the aggregation. This proves the SCREEN says the thing the two axes were
 * built to make sayable: that a project can be simultaneously in trouble and incompletely assessed,
 * and that neither fact is allowed to hide the other.
 *
 * The failure being guarded against is the one the audit found: health computed from Projects'
 * own five signals, so a project with open critical NCRs read as fine.
 */

const RUN = runId();

test('a project with nothing wrong is still not presented as fine while domains cannot answer', async ({ page }) => {
  const id = await createProject(page.request, `Health clear ${RUN}`);

  await page.goto(`/project/${id}/controls`, { waitUntil: 'domcontentloaded' });
  const health = page.getByTestId('cross-domain-health');
  await expect(health).toBeVisible();

  // "Not established", never "Nothing outstanding": three domains have not declared what their
  // facts mean, so a clean bill of health has not been earned.
  await expect(health).toContainText('Not established');
  await expect(health).not.toContainText('Nothing outstanding');
  await expect(page.getByTestId('health-unknown')).toContainText('Could not be assessed');
});

test('an unassessable domain says WHY, in that domain\'s terms', async ({ page }) => {
  const id = await createProject(page.request, `Health unknown ${RUN}`);
  await page.goto(`/project/${id}/controls`, { waitUntil: 'domcontentloaded' });

  const unknown = page.getByTestId('health-unknown');
  // Each names itself and its reason. "No data" would have been the easy answer and the useless
  // one — these are separate conversations with separate teams.
  //
  // HSE used to be in this list and is deliberately no longer: once it declared what its incidents
  // and corrective actions mean, it started answering. This assertion moving is the intended
  // direction of travel, and it caught its own staleness on the first run after HSE landed.
  for (const domain of ['engineering', 'procurement']) {
    await expect(unknown).toContainText(domain);
  }
  await expect(unknown, 'HSE answers now; it must not still be reported as unassessable').not.toContainText('hse');
  await expect(unknown).toContainText('cannot yet say');
  // And the sentence that stops a reader assuming the blanks mean fine.
  await expect(unknown).toContainText('These are not clean results');
});

test('a critical Quality condition is shown as Quality-owned, with a way into Quality', async ({ page }) => {
  const id = await createProject(page.request, `Health critical ${RUN}`);

  const ncr = await page.request.post('/api/quality/ncrs', {
    data: {
      projectId: id,
      ncrNumber: scoped(`NCR-H-${RUN}`).slice(0, 40),
      description: 'Cable tray support spacing exceeds specification',
      severity: 'major',
    },
  });
  expect(ncr.ok(), 'the NCR fixture must exist for this to mean anything').toBe(true);

  await page.goto(`/project/${id}/controls`, { waitUntil: 'domcontentloaded' });
  const health = page.getByTestId('cross-domain-health');

  await expect(health).toContainText('Critical');
  // Quality's own words, and Quality named as the owner — Project 360 explains and points; it is
  // not where the NCR gets worked.
  await expect(health).toContainText('major non-conformance');
  await expect(health).toContainText('quality');
  await expect(health.getByRole('link', { name: /Open quality/ })).toBeVisible();

  // The known critical did NOT swallow the unknowns: both statements survive side by side, which
  // is the whole point of keeping severity and coverage independent.
  await expect(page.getByTestId('health-unknown')).toBeVisible();
});

test('health never changes the project it reports on', async ({ page }) => {
  // §24 explains; §2 and §27 decide. Reading health must leave both the project and the lifecycle
  // gate exactly as they were — asserted here rather than assumed from the absence of a button.
  const id = await createProject(page.request, `Health readonly ${RUN}`);

  const before = await (await page.request.get(`/api/projects/projects/${id}/transitions`)).json();
  await page.goto(`/project/${id}/controls`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('cross-domain-health')).toBeVisible();
  const after = await (await page.request.get(`/api/projects/projects/${id}/transitions`)).json();

  expect(after, 'a health read must not move the lifecycle gate').toEqual(before);
});
