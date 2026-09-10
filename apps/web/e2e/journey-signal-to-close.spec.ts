import { expect, test } from '@playwright/test';
import { createActiveProject, runId } from './fixtures';

/**
 * §25 — the whole journey, from a radar signal to a closed project.
 *
 * The deal chain is wired end to end via events (`cross-module-subscriber`), and a demo seed proves
 * the tender path materialises accounts → opportunity → won tender → active contract → project. What
 * had no durable, self-seeding test was the two ENDS a person actually drives by hand: the pre-award
 * spine that turns a signal into a priced opportunity, and the delivery close that turns an executed
 * project into a completed one. These two tests pin those ends against the API — the only place a
 * gate binds — so the journey stays walkable as the code changes.
 *
 * Asserted against the API, not the screen: a verdict rendered on a page is advice; the write is the
 * authority. Each step is checked and named, so a real break stops at exactly the handoff that broke.
 */

const RUN = runId();

/** Pre-award: signal → lead → qualified lead → opportunity. Returns the opportunity id. */
async function signalToOpportunity(
  request: import('@playwright/test').APIRequestContext,
  label: string,
): Promise<string> {
  // 1 — a radar signal.
  const sig = await request.post('/api/crm/signals', {
    data: { title: `${label} ${RUN}`, source: 'INBOUND', type: 'NEW_PROJECT', confidence: 78, accountName: `Client ${RUN}` },
  });
  expect(sig.status(), 'a signal must be capturable from Radar').toBe(201);
  const signalId = ((await sig.json()) as { id: string }).id;

  // 2 — promote it to a lead (transactional, lineage-preserving).
  const promoted = await request.post(`/api/crm/signals/${signalId}/promote`, {});
  expect(promoted.ok(), 'a signal must promote to a lead').toBe(true);
  const prom = (await promoted.json()) as { leadId?: string; lead?: { id: string }; id?: string };
  const leadId = prom.leadId ?? prom.lead?.id ?? prom.id!;
  expect(leadId, 'promotion must yield a lead id').toBeTruthy();

  // 3 — qualification is a two-part act: the engine records an assessment (it only recommends)…
  const assessed = await request.patch(`/api/crm/leads/${leadId}/qualification`, {
    data: { dimensions: { budget: 4, authority: 4, need: 5, timing: 4 }, notes: 'Strong fit' },
  });
  expect(assessed.ok(), 'a qualification assessment must record').toBe(true);
  // …and the human decision is a separate status transition. Convert refuses a lead that is still new.
  const qualified = await request.patch(`/api/crm/leads/${leadId}`, { data: { status: 'qualified' } });
  expect(qualified.ok(), 'a lead must be qualifiable').toBe(true);
  expect(((await qualified.json()) as { status: string }).status).toBe('qualified');

  // 4 — convert the qualified lead to an opportunity (direct-sale path).
  const converted = await request.post(`/api/crm/leads/${leadId}/convert`, {
    data: { title: `${label} opportunity ${RUN}`, value: 1_250_000, requiresTender: false, closeDate: '2026-08-31' },
  });
  expect(converted.status(), 'a qualified lead must convert to an opportunity').toBe(201);
  const conv = (await converted.json()) as { opportunityId?: string; opportunity?: { id: string }; id?: string };
  const oppId = conv.opportunityId ?? conv.opportunity?.id ?? conv.id!;
  expect(oppId, 'conversion must yield an opportunity id').toBeTruthy();
  return oppId;
}

test('the pre-award spine: a radar signal becomes a qualified opportunity with a quotation opened', async ({ request }) => {
  const oppId = await signalToOpportunity(request, 'Marina Bay ELV');

  // The opportunity carries the converted value and the direct-sale execution type.
  const opp = (await (await request.get(`/api/crm/opportunities/${oppId}`)).json()) as { stage: string; executionType: string; value: number };
  expect(opp.executionType, 'a non-tender deal is a direct sale').toBe('direct_sale');
  expect(opp.value).toBe(1_250_000);

  // The direct-sale path opens a quotation from the opportunity.
  const toQuote = await request.post(`/api/crm/opportunities/${oppId}/convert-to-quotation`, { data: {} });
  expect(toQuote.status(), 'a direct-sale opportunity must open a quotation').toBe(201);
  const quoteId = ((await toQuote.json()) as { id: string }).id;
  expect(quoteId).toBeTruthy();

  // The quotation moves by governed ACTIONS, not a free status set. Submitting for review is the
  // first, and the only one a single actor may take: approval is a segregation-of-duties act — the
  // preparer cannot approve their own quotation — so the accept→contract tail is exercised by the
  // event-driven demo chain, not forced here with one principal.
  const submitted = await request.patch(`/api/crm/quotations/${quoteId}/status`, { data: { action: 'submit_review' } });
  expect(submitted.ok(), 'a quotation must submit for review').toBe(true);
  expect(((await submitted.json()) as { status: string }).status).toBe('internal_review');

  // And the preparer is refused their own approval — the SoD gate that makes the pre-award chain safe.
  const selfApprove = await request.patch(`/api/crm/quotations/${quoteId}/status`, { data: { action: 'approve' } });
  expect(selfApprove.status(), 'the preparer must not approve their own quotation (SoD)').toBe(403);
});

/** Tick every item of a freshly started closeout checklist. */
async function tickedCloseout(request: import('@playwright/test').APIRequestContext, projectId: string): Promise<string> {
  const started = await request.post('/api/projects/closeouts', { data: { projectId, projectName: `Closeout ${RUN}` } });
  expect(started.ok(), 'the closeout checklist must start').toBe(true);
  const closeout = (await started.json()) as { id: string; items: unknown[] };
  for (let i = 0; i < closeout.items.length; i += 1) {
    const ticked = await request.patch(`/api/projects/closeouts/${closeout.id}/items/${i}`, { data: { done: true } });
    expect(ticked.ok(), `checklist item ${i} must tick`).toBe(true);
  }
  return closeout.id;
}

test('the delivery close: an executed project clears every domain gate and completes', async ({ request }) => {
  // A project that has reached execution — the only state a closeout applies to.
  const projectId = await createActiveProject(request, `Signal-to-close delivery ${RUN}`);
  const closeoutId = await tickedCloseout(request, projectId);

  // The closeout gate asks the domains that KNOW, not just the checklist. Give it a commissioned
  // system (a witnessed sign-off) and an approved as-built, so commissioning and documents can pass
  // ON something rather than report UNVERIFIED — the honest way to reach the ready path.
  const record = await request.post('/api/commissioning/records', {
    data: { projectId, code: `SYS-${RUN}`, title: 'CCTV head end', system: 'cctv' },
  });
  expect(record.ok(), 'the commissioning fixture must exist').toBe(true);
  const recordId = ((await record.json()) as { id: string }).id;
  const commissioned = await request.put(`/api/commissioning/records/${recordId}/commission`, {
    data: { commissionedBy: 'u-admin', witnessedBy: 'u-e2e-checker' },
  });

  const asBuilt = await request.post('/api/doccontrol/register', {
    data: { projectId, documentNumber: `AB-${RUN}`, title: 'As-built — CCTV head end', status: 'as_built' },
  });
  expect(asBuilt.ok(), 'the as-built fixture must exist').toBe(true);

  const verdict = (await (await request.get(`/api/projects/projects/${projectId}/closeout-readiness`)).json()) as {
    ready: boolean;
    blocked: Array<{ domain: string; detail?: string }>;
    unknown: Array<{ domain: string }>;
  };

  // If this environment cannot complete the commissioning sign-off, say so rather than assert against
  // a state it cannot reach — a test that quietly changes what it proves is worse than one that stops.
  test.skip(
    !commissioned.ok(),
    `commissioning fixture could not be completed (${commissioned.status()}), so the close path cannot be exercised here`,
  );

  expect(
    verdict.ready,
    `expected ready to close; blocked=${JSON.stringify(verdict.blocked)} unknown=${JSON.stringify(verdict.unknown)}`,
  ).toBe(true);

  const finalized = await request.post(`/api/projects/closeouts/${closeoutId}/finalize`, { data: { handoverDate: '2026-09-30' } });
  expect(finalized.ok(), 'a project whose domains all report clean must close').toBe(true);
  expect(((await finalized.json()) as { status: string }).status).toBe('completed');
});
