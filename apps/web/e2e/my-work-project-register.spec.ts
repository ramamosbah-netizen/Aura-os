import { expect, test } from '@playwright/test';
import { createProject, runId } from './fixtures';

/**
 * §21 reaching My Work — proven in the browser, not only in the aggregator's unit tests.
 *
 * My Work is an AGGREGATOR. There is no task table behind a risk or an issue: the register is the
 * authority and this surface points at it. So the assertions are about a row APPEARING and LINKING,
 * never about acting on it from here.
 */

const RUN = runId();

test('a risk and an issue I raised appear in My Work, linking back to the register', async ({ page }) => {
  const projectId = await createProject(page.request, `My Work register ${RUN}`);

  const riskTitle = `Authority approval may be delayed ${RUN}`;
  const issueTitle = `Riser 3 access blocked ${RUN}`;
  const risk = await page.request.post('/api/projects/risks', {
    data: { projectId, title: riskTitle, area: 'AUTHORITY', likelihood: 'high', impact: 'high', targetDate: '2026-08-20' },
  });
  const issue = await page.request.post('/api/projects/issues', {
    data: { projectId, title: issueTitle, area: 'INTERFACE', severity: 'critical', dueDate: '2026-09-05' },
  });
  expect(risk.ok(), 'the risk fixture must exist for this to mean anything').toBe(true);
  expect(issue.ok(), 'the issue fixture must exist for this to mean anything').toBe(true);

  const res = await page.request.get('/api/work-items');
  expect(res.ok()).toBe(true);
  const payload = await res.json() as {
    items: Array<{ source: string; title: string; href: string; priority: string; dueAt: string | null; scopes: string[]; actions: string[] }>;
    coverage: { connected: string[] };
  };

  // Projects is a connected source now, not one of the "no user-assignment contract" gaps.
  expect(payload.coverage.connected).toContain('Projects');

  const riskItem = payload.items.find((i) => i.source === 'project-risk' && i.title === riskTitle);
  const issueItem = payload.items.find((i) => i.source === 'project-issue' && i.title === issueTitle);
  expect(riskItem, 'a risk raised by this actor belongs in their work list').toBeDefined();
  expect(issueItem, 'an issue raised by this actor belongs in their work list').toBeDefined();

  // The severity a person declared, and the matrix computed, both survive into the work list
  // rather than being flattened into a generic due-date priority.
  expect(riskItem?.priority).toBe('critical');
  expect(issueItem?.priority).toBe('critical');
  expect(riskItem?.dueAt).toBe('2026-08-20');
  expect(issueItem?.dueAt).toBe('2026-09-05');

  // Pointing, not owning: no action can be taken on either from My Work.
  expect(riskItem?.actions).toEqual([]);
  expect(issueItem?.actions).toEqual([]);
  // And only the scope the data can prove — `assigned` would be a guess while owner is free text.
  expect(riskItem?.scopes).toEqual(['created']);

  // The link resolves to the register that owns the record.
  await page.goto(riskItem!.href, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('project-risks-panel')).toBeVisible();
  await expect(page.getByTestId('risk-row').filter({ hasText: riskTitle })).toBeVisible();
});

test('a resolved issue stops being work without leaving the register', async ({ page }) => {
  const projectId = await createProject(page.request, `My Work resolved ${RUN}`);
  const title = `Transient coordination problem ${RUN}`;
  const created = await page.request.post('/api/projects/issues', {
    data: { projectId, title, severity: 'major' },
  });
  expect(created.ok()).toBe(true);
  const { id } = await created.json() as { id: string };

  const resolved = await page.request.patch(`/api/projects/issues/${id}/status`, {
    data: { status: 'resolved', note: 'Cleared at the coordination meeting' },
  });
  expect(resolved.ok()).toBe(true);

  // My Work reads the LIVE register only: a closed issue is history, not a task.
  const items = (await (await page.request.get('/api/work-items')).json() as { items: Array<{ title: string }> }).items;
  expect(items.find((i) => i.title === title)).toBeUndefined();

  // But it is still on the register, with what ended it — the two surfaces answer different
  // questions, and My Work going quiet must not mean the record disappeared.
  await page.goto(`/project/${projectId}/controls?tab=risks`, { waitUntil: 'domcontentloaded' });
  const row = page.getByTestId('issue-row').filter({ hasText: title });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Cleared at the coordination meeting');
});
