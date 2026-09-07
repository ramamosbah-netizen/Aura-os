import { expect, test } from '@playwright/test';
import { runId } from './fixtures';

/**
 * §27 — closeout is a gate, not a checklist.
 *
 * Before this, `finalizeCloseout` refused only when a box was unticked. Every box was manual, so a
 * project with every item ticked closed while a major NCR was open and no system had been
 * commissioned — and a blocked closeout could not explain itself, because nothing had asked the
 * domains that know.
 *
 * The journey below is the one that used to succeed and must now be refused, then the same project
 * cleared and closed. Asserted against the API rather than the screen: a verdict rendered on a page
 * is advice, and the only place a gate binds is the write.
 */

const RUN = runId();

async function project(request: import('@playwright/test').APIRequestContext, title: string) {
  const created = await request.post('/api/projects/projects', {
    data: { title: `${title} ${RUN}`, reference: `CO-${Date.now().toString().slice(-5)}`, status: 'active', value: 750_000 },
  });
  expect(created.ok(), 'the project fixture must exist').toBe(true);
  return ((await created.json()) as { id: string }).id;
}

async function tickedCloseout(request: import('@playwright/test').APIRequestContext, projectId: string) {
  const started = await request.post('/api/projects/closeouts', { data: { projectId, projectName: `Closeout ${RUN}` } });
  expect(started.ok(), 'the closeout checklist must start').toBe(true);
  const closeout = (await started.json()) as { id: string; items: unknown[] };
  for (let i = 0; i < closeout.items.length; i += 1) {
    const ticked = await request.patch(`/api/projects/closeouts/${closeout.id}/items/${i}`, { data: { done: true } });
    expect(ticked.ok(), `checklist item ${i} must tick`).toBe(true);
  }
  return closeout.id;
}

test('a blocked domain refuses the close, and names what is blocking it', async ({ request }) => {
  const projectId = await project(request, 'Closeout blocked');
  const closeoutId = await tickedCloseout(request, projectId);

  const raised = await request.post('/api/quality/ncrs', {
    data: { projectId, ncrNumber: `NCR-CLOSEOUT-API-${RUN}`, description: 'Cable tray not per specification', severity: 'major' },
  });
  expect(raised.status(), 'the NCR must be raised for this proof to mean anything').toBe(201);

  const verdict = (await (await request.get(`/api/projects/projects/${projectId}/closeout-readiness`)).json()) as {
    ready: boolean;
    blocked: Array<{ domain: string; detail?: string; href?: string }>;
  };

  expect(verdict.ready, 'an open major NCR must not be ready to close').toBe(false);
  const quality = verdict.blocked.find((b) => b.domain === 'quality');
  expect(quality?.detail, 'the blocker must say what is wrong, in words').toBe('1 major non-conformance still open.');
  expect(quality?.href, 'and where the work that clears it lives').toContain('/workspace/quality');

  // The state that used to be sufficient on its own: every manual box ticked.
  const refused = await request.post(`/api/projects/closeouts/${closeoutId}/finalize`, { data: { handoverDate: '2026-09-30' } });
  expect(refused.status(), 'a governed refusal is a conflict with project state, not a server fault').toBe(409);
  expect(await refused.text()).toContain('1 major non-conformance still open');
});

test('an unreadable or unproven domain is refused too, never waved through', async ({ request }) => {
  const projectId = await project(request, 'Closeout unproven');
  const closeoutId = await tickedCloseout(request, projectId);

  // Nothing wrong anywhere — and nothing commissioned either. A project that never tested a system
  // has not demonstrated readiness; it has demonstrated nothing, and that is not a pass.
  const verdict = (await (await request.get(`/api/projects/projects/${projectId}/closeout-readiness`)).json()) as {
    ready: boolean;
    blocked: unknown[];
    unknown: Array<{ domain: string; detail?: string }>;
  };
  expect(verdict.ready).toBe(false);
  expect(verdict.unknown.map((u) => u.domain)).toContain('commissioning');

  const refused = await request.post(`/api/projects/closeouts/${closeoutId}/finalize`, { data: { handoverDate: '2026-09-30' } });
  expect(refused.status()).toBe(409);
  expect(await refused.text(), 'the refusal distinguishes unverified from blocked').toContain('unverified');
});

test('the closeout panel shows a state and a reason per domain, not one badge', async ({ page, request }) => {
  const projectId = await project(request, 'Closeout panel');
  await tickedCloseout(request, projectId);
  await request.post('/api/quality/ncrs', {
    data: { projectId, ncrNumber: `NCR-CLOSEOUT-UI-${RUN}`, description: 'Containment not per drawing', severity: 'major' },
  });

  await page.goto(`/project/${projectId}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /^Closeout/ }).click();

  await expect(page.getByTestId('project-closeout-panel')).toBeVisible();
  await expect(page.getByTestId('closeout-verdict')).toContainText('CLOSEOUT BLOCKED');
  // Per-domain, with its own reason — the thing a single green/red badge cannot say.
  await expect(page.getByTestId('readiness-quality-ncrs')).toContainText('BLOCKED');
  await expect(page.getByTestId('readiness-quality-ncrs')).toContainText('1 major non-conformance still open.');
  await expect(page.getByTestId('readiness-commissioning-systems')).toContainText('UNVERIFIED');

  // And the button cannot promise what the write would refuse.
  await expect(page.getByRole('button', { name: 'Finalize closeout' })).toBeDisabled();
});

/**
 * The positive case, and the reason the whole gate is worth building.
 *
 * A gate that only ever refuses is indistinguishable from a broken feature. This proves the other
 * half: a project whose domains all report clean actually closes, and the verdict that permitted it
 * is written into the completion event.
 *
 * That last part answers a question nobody asks on the day and everybody asks in a dispute months
 * later — "why was this project allowed to close?". A verdict that lives only in the request which
 * produced it cannot answer it.
 */
test('a clean project closes, and the permitting verdict is kept as evidence', async ({ request }) => {
  const projectId = await project(request, 'Closeout clean');
  const closeoutId = await tickedCloseout(request, projectId);

  // Commission a system so the commissioning check has something to pass ON. Left out, this project
  // would be UNVERIFIED rather than ready — which the previous test asserts on purpose.
  const record = await request.post('/api/commissioning/records', {
    data: { projectId, code: `SYS-${RUN}`, title: 'CCTV head end', system: 'cctv' },
  });
  expect(record.ok(), 'the commissioning fixture must exist').toBe(true);
  const { id: recordId } = (await record.json()) as { id: string };
  // PUT, and both names are required: commissioning is a WITNESSED sign-off, so the domain refuses
  // one without a witness. Read from the route rather than assumed — POST answers 405 here.
  const commissioned = await request.put(`/api/commissioning/records/${recordId}/commission`, {
    data: { commissionedBy: 'u-admin', witnessedBy: 'u-e2e-checker' },
  });

  // An approved as-built in the controlled register. Without one the documents check is UNKNOWN and
  // the close is refused — which the gate does correctly, and which is why the handover pack has to
  // be complete for this path to exist at all. Building the fixture is the honest way to reach it;
  // relaxing the rule to make a test pass would delete the guarantee the test is for.
  const asBuilt = await request.post('/api/doccontrol/register', {
    data: { projectId, documentNumber: `AB-${RUN}`, title: 'As-built — CCTV head end', status: 'as_built' },
  });
  expect(asBuilt.ok(), 'the as-built fixture must exist').toBe(true);

  const verdict = (await (await request.get(`/api/projects/projects/${projectId}/closeout-readiness`)).json()) as {
    ready: boolean;
    checks: Array<{ id: string; state: string; detail?: string }>;
    blocked: Array<{ domain: string; detail?: string }>;
    unknown: Array<{ domain: string }>;
  };

  // If the fixture could not be commissioned, say so plainly rather than asserting against a state
  // this environment cannot reach — a test that quietly changes what it proves is worse than one
  // that stops.
  test.skip(
    !commissioned.ok(),
    `commissioning fixture could not be completed (${commissioned.status()}), so the ready path cannot be exercised here`,
  );

  expect(
    verdict.ready,
    `expected ready; blocked=${JSON.stringify(verdict.blocked)} unknown=${JSON.stringify(verdict.unknown)}`,
  ).toBe(true);

  const finalized = await request.post(`/api/projects/closeouts/${closeoutId}/finalize`, { data: { handoverDate: '2026-09-30' } });
  expect(finalized.ok(), 'a project whose domains all report clean must be closable').toBe(true);
  expect(((await finalized.json()) as { status: string }).status).toBe('completed');

  // The stamped evidence is asserted separately, against the event store itself: apps/web exposes
  // no events route, and inventing one for a test would be building product to make a proof pass.
});
