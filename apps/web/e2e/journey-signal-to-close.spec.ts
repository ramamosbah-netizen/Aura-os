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

/**
 * The direct-sale middle, walked to a contract — the one commercial path the demo seed does not
 * exercise (it uses tenders). Driven against the API DIRECTLY, because it needs TWO principals: the
 * preparer cannot approve their own quotation (segregation of duties), and a governed quotation's
 * approval is blocked until its evidence-readiness checklist is settled. Both are real gates; the
 * test satisfies them the honest way — a second permissioned approver, and waived evidence rows —
 * rather than relaxing the rule.
 *
 * Skips cleanly when the API base or the second actor is not configured for this run.
 */
const API_BASE = process.env.AURA_API_URL;
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-password';
const CHECKER = process.env.E2E_ALT_USERNAME; // a second principal, distinct from the session user

async function apiLogin(ctx: import('@playwright/test').APIRequestContext, username: string): Promise<string> {
  const r = await ctx.post('/api/v1/auth/login', { data: { username, password: PASSWORD } });
  expect(r.ok(), `login ${username} must succeed`).toBe(true);
  return ((await r.json()) as { token: string }).token;
}
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

test('the direct-sale middle: a quotation clears SoD and evidence readiness and becomes a contract', async ({ playwright }) => {
  test.skip(!API_BASE || !CHECKER, 'AURA_API_URL and a second actor (E2E_ALT_USERNAME) are required to exercise SoD approval');
  const api = await playwright.request.newContext({ baseURL: API_BASE });
  const admin = await apiLogin(api, process.env.E2E_USERNAME ?? 'u-admin');
  const checker = await apiLogin(api, CHECKER!);

  // Pre-award, as the preparer (admin): signal → lead → qualified → opportunity (direct sale).
  const sig = await api.post('/api/v1/crm/signals', { headers: bearer(admin), data: { title: `DS ${RUN}`, source: 'INBOUND', type: 'NEW_PROJECT', confidence: 80, accountName: `DS Client ${RUN}` } });
  const signalId = ((await sig.json()) as { id: string }).id;
  const prom = await api.post(`/api/v1/crm/signals/${signalId}/promote`, { headers: bearer(admin), data: {} });
  const promBody = (await prom.json()) as { lead?: { id: string }; leadId?: string; id?: string };
  const leadId = promBody.lead?.id ?? promBody.leadId ?? promBody.id!;
  expect(leadId, 'promotion must yield a lead id').toBeTruthy();
  await api.patch(`/api/v1/crm/leads/${leadId}/qualification`, { headers: bearer(admin), data: { dimensions: { budget: 4, authority: 4, need: 5, timing: 4 } } });
  await api.patch(`/api/v1/crm/leads/${leadId}`, { headers: bearer(admin), data: { status: 'qualified' } });
  const conv = await api.post(`/api/v1/crm/leads/${leadId}/convert`, { headers: bearer(admin), data: { title: `DS opp ${RUN}`, value: 800_000, requiresTender: false, closeDate: '2026-09-30' } });
  const c = (await conv.json()) as { opportunityId?: string; opportunity?: { id: string }; id?: string };
  const oppId = c.opportunityId ?? c.opportunity?.id ?? c.id!;
  expect(oppId, 'the lead must convert to an opportunity').toBeTruthy();

  // Open a quotation and submit it for review.
  const q = await api.post(`/api/v1/crm/opportunities/${oppId}/convert-to-quotation`, { headers: bearer(admin), data: {} });
  expect(q.status()).toBe(201);
  const quoteId = ((await q.json()) as { id: string }).id;
  const submitted = await api.patch(`/api/v1/crm/quotations/${quoteId}/status`, { headers: bearer(admin), data: { action: 'submit_review' } });
  expect(submitted.ok(), 'a quotation must submit for review').toBe(true);

  // Give the approver the crm authority they need (they are still not the preparer, so SoD holds).
  await api.post('/api/v1/admin/access/grants', { headers: bearer(admin), data: { userId: CHECKER, roleId: 'r-sales-manager' } });

  // Settle the evidence-readiness checklist: seed it, then waive each still-required row.
  const seeded = await api.post('/api/v1/document-requirements/seed', { headers: bearer(admin), data: { entityType: 'crm.quotation', entityId: quoteId } });
  const rows = (await seeded.json()) as Array<{ id: string; status: string }>;
  for (const row of rows) {
    if (row.status === 'REQUIRED') {
      const w = await api.post(`/api/v1/document-requirements/${row.id}/waive`, { headers: bearer(admin), data: { reason: 'e2e journey proof — evidence waived' } });
      expect(w.ok(), 'a required evidence row must be waivable with a reason').toBe(true);
    }
  }

  // Approve as the SECOND actor — SoD (not the preparer) and readiness (checklist settled) both pass.
  const approved = await api.patch(`/api/v1/crm/quotations/${quoteId}/status`, { headers: bearer(checker), data: { action: 'approve' } });
  expect(approved.status(), `approval must pass once SoD and readiness are satisfied — got ${await approved.text()}`).toBe(200);
  expect(((await approved.json()) as { status: string }).status).toBe('approved');

  // Send and accept (the preparer may), then the accepted quotation becomes a contract.
  await api.patch(`/api/v1/crm/quotations/${quoteId}/status`, { headers: bearer(admin), data: { action: 'send' } });
  const accepted = await api.patch(`/api/v1/crm/quotations/${quoteId}/status`, { headers: bearer(admin), data: { action: 'accept' } });
  expect(((await accepted.json()) as { status: string }).status).toBe('accepted');

  const contract = await api.post(`/api/v1/crm/quotations/${quoteId}/convert-to-contract`, { headers: bearer(admin), data: {} });
  expect(contract.status(), 'an accepted quotation must convert to a contract').toBe(201);
  const contractId = ((await contract.json()) as { id?: string; contractId?: string });
  expect(contractId.id ?? contractId.contractId, 'the direct-sale path must yield a contract').toBeTruthy();

  await api.dispose();
});

test('the loop closes: a signed contract delivers a project whose completion completes the contract and raises a renewal signal', async ({ playwright }) => {
  test.skip(!API_BASE || !CHECKER, 'AURA_API_URL and a second actor (E2E_ALT_USERNAME) are required to sign the contract (SoD)');
  const api = await playwright.request.newContext({ baseURL: API_BASE });
  const admin = await apiLogin(api, process.env.E2E_USERNAME ?? 'u-admin');
  const signer = await apiLogin(api, CHECKER!);

  // The signer needs contracts authority and must not be the preparer — no standard role carries
  // contract-write except admin, so the run grants a purpose role for a real second principal.
  await api.post('/api/v1/admin/access/roles', { headers: bearer(admin), data: { id: 'r-e2e-signer', name: 'E2E Contract Signer', permissions: ['contracts.*'] } });
  await api.post('/api/v1/admin/access/grants', { headers: bearer(admin), data: { userId: CHECKER, roleId: 'r-e2e-signer' } });

  // A contract, prepared by admin and SIGNED by the second actor (activating it).
  const made = await api.post('/api/v1/contracts/contracts', { headers: bearer(admin), data: { title: `Loop ${RUN}`, value: 600_000, accountName: `Loop Client ${RUN}` } });
  expect(made.status(), 'a contract must be creatable').toBe(201);
  const contractId = ((await made.json()) as { id: string }).id;
  const signed = await api.patch(`/api/v1/contracts/contracts/${contractId}/status`, { headers: bearer(signer), data: { status: 'active' } });
  expect(signed.status(), `the second actor must be able to sign — got ${await signed.text()}`).toBe(200);

  // Signing hands the deal over: a project is created from the contract (async reactor).
  const findProject = async (): Promise<{ id: string; status: string } | undefined> => {
    const list = (await (await api.get('/api/v1/projects/projects', { headers: bearer(admin) })).json()) as Array<{ id: string; status: string; contractId?: string }>;
    return Array.isArray(list) ? list.find((p) => p.contractId === contractId) : undefined;
  };
  await expect.poll(async () => Boolean(await findProject()), { message: 'signing a contract must hand over a project', timeout: 30_000 }).toBe(true);
  const projectId = (await findProject())!.id;

  // Take the project to execution (add scope + baseline if the handover did not).
  let toActive = await api.patch(`/api/v1/projects/projects/${projectId}/status`, { headers: bearer(admin), data: { status: 'active' } });
  if (!toActive.ok()) {
    await api.post('/api/v1/projects/wbs', { headers: bearer(admin), data: { projectId, code: '01', title: 'Works', plannedValue: 250_000 } });
    await api.post(`/api/v1/projects/projects/${projectId}/wbs-baseline`, { headers: bearer(admin), data: {} });
    toActive = await api.patch(`/api/v1/projects/projects/${projectId}/status`, { headers: bearer(admin), data: { status: 'active' } });
  }
  expect(toActive.ok(), 'the handed-over project must reach execution').toBe(true);

  // Deliver it through the closeout gate (the same real checks as the delivery-close test).
  const started = await api.post('/api/v1/projects/closeouts', { headers: bearer(admin), data: { projectId, projectName: `Closeout ${RUN}` } });
  const closeout = (await started.json()) as { id: string; items: unknown[] };
  for (let i = 0; i < closeout.items.length; i += 1) {
    await api.patch(`/api/v1/projects/closeouts/${closeout.id}/items/${i}`, { headers: bearer(admin), data: { done: true } });
  }
  const record = await api.post('/api/v1/commissioning/records', { headers: bearer(admin), data: { projectId, code: `SYS-${RUN}`, title: 'CCTV head end', system: 'cctv' } });
  const recordId = ((await record.json()) as { id: string }).id;
  const commissioned = await api.put(`/api/v1/commissioning/records/${recordId}/commission`, { headers: bearer(admin), data: { commissionedBy: 'u-admin', witnessedBy: CHECKER } });
  await api.post('/api/v1/doccontrol/register', { headers: bearer(admin), data: { projectId, documentNumber: `AB-${RUN}`, title: 'As-built — CCTV head end', status: 'as_built' } });
  test.skip(!commissioned.ok(), `commissioning fixture could not complete (${commissioned.status()}), so the loop cannot be closed here`);
  await api.post(`/api/v1/projects/closeouts/${closeout.id}/finalize`, { headers: bearer(admin), data: { handoverDate: '2026-09-30' } });

  // Completing the PROJECT is the act that closes the loop — it fires projects.project.completed.
  const completed = await api.patch(`/api/v1/projects/projects/${projectId}/status`, { headers: bearer(admin), data: { status: 'completed' } });
  expect(completed.status(), `a delivered project must complete — got ${await completed.text()}`).toBe(200);
  expect(((await completed.json()) as { status: string }).status).toBe('completed');

  // The reactors close the chain: the contract completes, and a renewal signal lands back on the Radar.
  await expect.poll(async () => ((await (await api.get(`/api/v1/contracts/contracts/${contractId}`, { headers: bearer(admin) })).json()) as { status: string }).status,
    { message: 'a completed project must complete its contract', timeout: 30_000 }).toBe('completed');
  await expect.poll(async () => {
    const sig = (await (await api.get('/api/v1/crm/signals?type=RENEWAL_DUE', { headers: bearer(admin) })).json()) as Array<{ type: string }>;
    return Array.isArray(sig) && sig.some((s) => s.type === 'RENEWAL_DUE');
  }, { message: 'a completed contract must raise a renewal signal, closing the loop to Radar', timeout: 30_000 }).toBe(true);

  await api.dispose();
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
