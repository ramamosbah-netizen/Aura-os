// AURA OS — Supertest HTTP e2e over the business chains (deal chain + P2P).
// Boots the real AppModule (in-memory stores) and proves the cross-module
// reactor wires the chains end-to-end over HTTP, not just in unit harnesses.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

/** Poll until the fetcher returns a non-empty array (reactor handlers are async). */
async function eventually<T>(fetcher: () => Promise<T[]>, tries = 20): Promise<T[]> {
  for (let i = 0; i < tries; i++) {
    const rows = await fetcher();
    if (rows.length > 0) return rows;
    await new Promise((r) => setTimeout(r, 25));
  }
  return fetcher();
}

/**
 * The people who sign the governed pre-pricing acts, with the shipped roles that own them. Pricing is
 * downstream of an independently approved technical study and an approved quantity take-off projected
 * to the BOQ (`governedPricingContext`), and the study's reviewer must be an ACTIVE workspace user who
 * holds `tendering.study.approve` — the same rule production applies, so the fixture names real people.
 */
const TENANT = 'chain-tenant';
const PRESALES = 'u-e2e-presales';
const TECH_MANAGER = 'u-e2e-techmgr';
const ESTIMATOR = 'u-e2e-estimator';
const COMMERCIAL_MANAGER = 'u-e2e-qs';

/**
 * New quotations are governed by default; satisfy the persisted checklist before approval.
 *
 * VENDOR_QUOTE on an offer raised from a tender is COMPUTED from the tender's governed supplier
 * quotations and cannot be typed in (409). This tender was never put to suppliers — the supplier path
 * is proved in apps/web/e2e/tender-real-supply-path.spec.ts — so it takes the governed exception: a
 * reasoned waiver by the Commercial Manager, who answers for it and is not the offer's preparer.
 */
async function makeApprovalReady(http: ReturnType<typeof request>, quoteId: string): Promise<void> {
  await http.post('/api/v1/document-requirements/seed')
    .send({ entityType: 'crm.quotation', entityId: quoteId }).expect(201);
  const result = (await http.get(`/api/v1/document-requirements?entityType=crm.quotation&entityId=${quoteId}`).expect(200)).body as {
    requirements: Array<{ id: string; type: string; requiredCount: number }>;
  };
  for (const requirement of result.requirements) {
    if (requirement.type === 'VENDOR_QUOTE') {
      await http.post(`/api/v1/document-requirements/${requirement.id}/waive`).set('x-e2e-actor', COMMERCIAL_MANAGER)
        .send({ reason: 'Deal-chain fixture: this tender was not put to suppliers; the supplier path is proved elsewhere' })
        .expect(201);
      continue;
    }
    for (let i = 0; i < requirement.requiredCount; i++) {
      await http.post(`/api/v1/document-requirements/${requirement.id}/evidence`)
        .send({ type: requirement.type === 'VENDOR_QUOTE' ? 'EXTERNAL_REFERENCE' : 'DOCUMENT_ID', reference: `${requirement.type}-${i + 1}` })
        .expect(201);
    }
  }
}

describe('business-chain e2e (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidUnknownValues: false,
      transformOptions: { exposeUnsetFields: false },
    }));
    const tenant = app.get(TenantContext);
    const access = app.get(AccessService);
    const users = app.get(UsersService);
    for (const [userId, roleId] of [[PRESALES, 'r-pre-sales'], [TECH_MANAGER, 'r-technical-manager'], [ESTIMATOR, 'r-estimator'], [COMMERCIAL_MANAGER, 'r-commercial-manager']]) {
      access.grant({ userId, roleId, scope: { kind: 'org', level: 'tenant', id: TENANT } });
      users.save({ tenantId: TENANT, userId, displayName: userId, active: true });
    }
    // ADR-0021 needs a REAL identity to capture award evidence (no 'system' fallback), but
    // switching the actor on globally would turn AccessService on for every other call in these
    // specs. So the actor is per-request, via a header only the award helper sends.
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run(
        { tenantId: TENANT, companyId: null, actorId: (_req as { headers?: Record<string, string> }).headers?.['x-e2e-actor'] ?? null, correlationId: 'e2e-chains' },
        () => next(),
      ),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  it('deal chain: tender (started from an opportunity) → award → {contract + opportunity Won} → sign → project (+WBS seed)', async () => {
    // 1. Client account + opportunity on the tender execution path — still OPEN (bidding precedes winning).
    const account = (
      await http.post('/api/v1/crm/accounts').send({ name: 'Acme Developments LLC' }).expect(201)
    ).body;
    const opp = (
      await http
        .post('/api/v1/crm/opportunities')
        .send({ title: 'Marina Tower ELV', value: 750_000, accountId: account.id, accountName: account.name, executionType: 'tender' })
        .expect(201)
    ).body;

    // 2. The bid goes out, linked to the opportunity. (The lifecycle draft→submitted is the tender
    //    e2e's subject; here it starts submitted so the chain under test is award → downstream.)
    const tender = (
      await http
        .post('/api/v1/tendering/tenders')
        .send({ title: 'Marina Tower ELV — bid', value: 750_000, accountId: account.id, accountName: account.name, status: 'submitted', sourceOpportunityId: opp.id })
        .expect(201)
    ).body;
    expect(tender.sourceOpportunityId).toBe(opp.id);

    // 2b. The governed basis pricing stands on: Pre-Sales writes the technical study and the Technical
    //     Manager — independently — approves it; the quantity take-off is approved and the Estimator
    //     projects it to the BOQ; the Estimator then prices the item. No BOQ line is typed in directly.
    const base = `/api/v1/tendering/tenders/${tender.id}`;
    const study = (await http.post(`${base}/studies`).set('x-e2e-actor', PRESALES).send({
      title: 'Marina Tower ELV technical study', inputRevision: 'Client specification Rev 01', reviewerId: TECH_MANAGER,
      scopeSummary: 'Supply, install, test and commission the ELV package.',
      systems: [{ discipline: 'ELV', name: 'CCTV', designBasis: 'IP cameras and NVR', interfaces: ['LAN'] }],
      requirements: [{ category: 'client', statement: 'ELV package as specified', acceptanceCriteria: 'Installed and tested', compliance: 'compliant', response: 'Included' }],
      surveyFindings: [], clarifications: [], deviations: [], assumptions: [], exclusions: [], evidence: [],
    }).expect(201)).body;
    await http.post(`${base}/studies/${study.id}/submit`).set('x-e2e-actor', PRESALES).expect(201);
    await http.post(`${base}/studies/${study.id}/approve`).set('x-e2e-actor', TECH_MANAGER).send({ comment: 'Approved for estimation' }).expect(201);
    const takeoff = (await http.post(`${base}/quantity-takeoff`).set('x-e2e-actor', PRESALES)
      .send({ lines: [{ description: 'ELV package', unit: 'LS', quantity: 1 }] }).expect(201)).body;
    await http.post(`${base}/quantity-takeoff/${takeoff.id}/approve`).set('x-e2e-actor', TECH_MANAGER).send({}).expect(201);
    const projection = (await http.post(`${base}/quantity-takeoff/${takeoff.id}/project-to-boq`).set('x-e2e-actor', ESTIMATOR).expect(201)).body;
    const [item] = projection.items as Array<{ id: string }>;
    await http.post(`${base}/pricing/items/${item.id}`).set('x-e2e-actor', ESTIMATOR).send({
      resources: {
        supplyUnitPrice: 520_000, technician: { count: 4, hours: 400, rate: 55 }, engineer: { count: 1, hours: 200, rate: 90 },
        projectManager: { count: 0, hours: 0, rate: 0 }, transport: 0, wastagePercent: 0, accessories: 0, subcontract: 0, equipmentRent: 0, otherDirect: 0,
      },
      indirectPercent: 4, overheadPercent: 8, riskPercent: 3, profitPercent: 15,
    }).expect(201);

    //     Then the offer is generated and APPROVED, which locks the immutable Commercial Baseline. That
    //     baseline is the contract's commercial basis. Without one the award is still valid but NO
    //     contract is created (the deferred path) — the tender's own estimate is never promoted to a
    //     contractual value. See ADR-0021's follow-up.
    const quote = (await http.post(`/api/v1/tendering/tenders/${tender.id}/quotation`).send({}).expect(201)).body;
    expect(quote.sourceTenderId).toBe(tender.id);
    await makeApprovalReady(http, quote.id);
    await http.patch(`/api/v1/crm/quotations/${quote.id}/status`).send({ action: 'submit_review' }).expect(200);
    await http.patch(`/api/v1/crm/quotations/${quote.id}/status`).send({ action: 'approve' }).expect(200);

    // 3. Award the tender → the contract is drafted AND (J3) the source opportunity closes Won.
    // ADR-0021 — the governed award, with the customer's evidence. This is what makes the deal
    // chain fire AND what makes the resulting Opportunity GOVERNED_WON rather than LEGACY_WON.
    await http.post(`/api/v1/tendering/tenders/${tender.id}/award`)
      .set('x-e2e-actor', 'u-e2e-bid-manager')
      .send({ awardedValue: 1_000_000, currency: 'AED', awardedAt: '2026-08-21T07:30:00.000Z', awardReference: 'LOA-E2E' })
      .expect(201);
    const contracts = await eventually(async () =>
      (await http.get(`/api/v1/contracts/contracts?tenderId=${tender.id}`).expect(200)).body as any[],
    );
    expect(contracts).toHaveLength(1);
    const contract = contracts[0];
    // The CONTRACT is valued from the approved commercial basis, never from the 750k tender estimate
    // and never from the 1,000,000 the customer awarded — three separate measures.
    expect(contract.value).not.toBe(750_000);
    expect(contract.commercialBaselineId).toBeTruthy();

    // The award is the opportunity's outcome — it is now Won, with a reason naming the tender.
    const wonOpp = await eventually(async () => {
      const o = (await http.get(`/api/v1/crm/opportunities/${opp.id}`).expect(200)).body;
      return o.stage === 'won' ? [o] : [];
    });
    expect(wonOpp[0].winReason).toMatch(/tender/i);

    // 4. Sign the contract → auto project, seeded with a root WBS node.
    await http.patch(`/api/v1/contracts/contracts/${contract.id}/status`).send({ status: 'active' }).expect(200);
    const projects = await eventually(async () =>
      (await http.get(`/api/v1/projects/projects?contractId=${contract.id}`).expect(200)).body as any[],
    );
    expect(projects).toHaveLength(1);
    expect(projects[0].accountName).toBe('Acme Developments LLC');

    const wbs = await eventually(async () =>
      (await http.get(`/api/v1/projects/wbs?projectId=${projects[0].id}`).expect(200)).body as any[],
    );
    expect(wbs.length).toBeGreaterThanOrEqual(1);
  });

  it('junction (J2): "Start Tender" creates ONE linked draft tender, idempotently', async () => {
    const account = (await http.post('/api/v1/crm/accounts').send({ name: 'Emaar Malls' }).expect(201)).body;
    const opp = (
      await http
        .post('/api/v1/crm/opportunities')
        .send({ title: 'Dubai Mall ELV Upgrade', value: 1_200_000, accountId: account.id, accountName: account.name, executionType: 'tender' })
        .expect(201)
    ).body;
    expect(opp.executionType).toBe('tender');

    // Bidding PRECEDES winning: the bid starts while the deal is still open, in `draft` (not the
    // deal-chain reactor's already-won `submitted`).
    const started = (await http.post(`/api/v1/crm/opportunities/${opp.id}/start-tender`).expect(201)).body;
    expect(started.status).toBe('draft');
    expect(started.sourceOpportunityId).toBe(opp.id);

    // A deal has ONE bid — a second Start Tender hands back the same tender, never a duplicate.
    const again = (await http.post(`/api/v1/crm/opportunities/${opp.id}/start-tender`).expect(201)).body;
    expect(again.id).toBe(started.id);

    // The 360 composes the tender under the opportunity via the provenance link.
    const summary = (await http.get(`/api/v1/crm/opportunities/${opp.id}/summary`).expect(200)).body;
    expect(summary.tenders.map((t: any) => t.id)).toEqual([started.id]);
    expect(summary.route).toBe('tender');

    // A direct-sale opportunity has no tender to start.
    const direct = (
      await http.post('/api/v1/crm/opportunities').send({ title: 'Small ELV job', value: 5_000, executionType: 'direct_sale' }).expect(201)
    ).body;
    await http.post(`/api/v1/crm/opportunities/${direct.id}/start-tender`).expect(400);
  });

  it('junction (J2): a tender registered directly auto-creates a linked Opportunity (reverse)', async () => {
    const tender = (
      await http.post('/api/v1/tendering/tenders').send({ title: 'Airport ELV RFQ (direct)', value: 3_000_000 }).expect(201)
    ).body;
    expect(tender.sourceOpportunityId).toBeNull();

    // The Opportunity is the single source of truth for the pipeline, so a directly-registered
    // tender still surfaces there — the reverse reactor creates it (executionType 'tender').
    const opps = await eventually(async () =>
      ((await http.get('/api/v1/crm/opportunities').expect(200)).body as any[]).filter(
        (o) => o.title === 'Airport ELV RFQ (direct)',
      ),
    );
    expect(opps).toHaveLength(1);
    expect(opps[0].executionType).toBe('tender');
    expect(opps[0].source).toBe('tender');

    // ...and back-links the tender to it, so the Opportunity 360 composes it (the link is what the
    // 360 follows — even for this account-less tender).
    const linked = await eventually(async () => {
      const t = (await http.get(`/api/v1/tendering/tenders/${tender.id}`).expect(200)).body;
      return t.sourceOpportunityId ? [t] : [];
    });
    expect(linked[0].sourceOpportunityId).toBe(opps[0].id);
  });

  it('junction (J3): losing the tender closes the source Opportunity as Lost', async () => {
    const opp = (
      await http.post('/api/v1/crm/opportunities').send({ title: 'Airport ELV re-bid', value: 400_000, executionType: 'tender' }).expect(201)
    ).body;
    const tender = (
      await http
        .post('/api/v1/tendering/tenders')
        .send({ title: 'Airport ELV re-bid — bid', value: 400_000, status: 'submitted', sourceOpportunityId: opp.id })
        .expect(201)
    ).body;

    await http.patch(`/api/v1/tendering/tenders/${tender.id}/status`).send({ status: 'lost' }).expect(200);

    const lostOpp = await eventually(async () => {
      const o = (await http.get(`/api/v1/crm/opportunities/${opp.id}`).expect(200)).body;
      return o.stage === 'lost' ? [o] : [];
    });
    expect(lostOpp[0].lossReason).toMatch(/tender/i);
  });

  it('P2P chain: PO issued → GRN receipt → PO auto-transitions to received', async () => {
    // Small-value PO auto-approves (below the approval-matrix threshold) → issue it.
    // The ORDERED quantity is part of the order, not decoration: completion is the conclusion
    // "everything ordered has arrived", and that sentence needs both numbers. This test used to
    // send neither and still expect `received` — which is how it passed while the service was
    // concluding completion from an absence.
    const po = (
      await http
        .post('/api/v1/procurement/purchase-orders')
        .send({ title: 'Cat6 cable drums', supplierName: 'Gulf Cables', value: 900, orderedQuantity: 10, unit: 'drum' })
        .expect(201)
    ).body;
    // Submit, then issue (J3-01). 900 is in the auto-approve tier, so submitting RECORDS the
    // approval rather than skipping it — and issuing is reachable only from approved, at any value.
    await http.post(`/api/v1/procurement/purchase-orders/${po.id}/submit`).expect(201);
    await http.post(`/api/v1/procurement/purchase-orders/${po.id}/issue`).expect(201);

    // Goods arrive in full: GRN against the PO → reactor flips the PO to received.
    await http
      .post('/api/v1/inventory/grns')
      .send({ title: 'GRN — Cat6 cable drums', poId: po.id, poTitle: po.title, supplierName: 'Gulf Cables', value: 900, receivedQuantity: 10 })
      .expect(201);

    const received = await eventually(async () => {
      const current = (await http.get(`/api/v1/procurement/purchase-orders/${po.id}`).expect(200)).body;
      return current.status === 'received' ? [current] : [];
    });
    expect(received).toHaveLength(1);
  });

  it('P2P chain: a receipt against an unquantified order does NOT complete it', async () => {
    // The containment this pins. With no ordered quantity recorded, nothing about a delivery can
    // say the order is finished — and "received" is the answer that stops a buyer chasing the rest.
    // The order stays where it is and keeps reading as outstanding, which is the true statement.
    const po = (
      await http
        .post('/api/v1/procurement/purchase-orders')
        .send({ title: 'Trunking — quantity not recorded', supplierName: 'Gulf Cables', value: 900 })
        .expect(201)
    ).body;
    // Submit, then issue (J3-01). 900 is in the auto-approve tier, so submitting RECORDS the
    // approval rather than skipping it — and issuing is reachable only from approved, at any value.
    await http.post(`/api/v1/procurement/purchase-orders/${po.id}/submit`).expect(201);
    await http.post(`/api/v1/procurement/purchase-orders/${po.id}/issue`).expect(201);

    await http
      .post('/api/v1/inventory/grns')
      .send({ title: 'GRN — one bundle', poId: po.id, poTitle: po.title, supplierName: 'Gulf Cables', value: 90 })
      .expect(201);

    // Give the reactor the same room the passing case gets (`eventually` exhausts its tries and
    // returns empty rather than throwing), then assert it did NOT complete.
    const completed = await eventually(async () => {
      const current = (await http.get(`/api/v1/procurement/purchase-orders/${po.id}`).expect(200)).body;
      return current.status === 'received' ? [current] : [];
    });
    expect(completed).toHaveLength(0);

    const current = (await http.get(`/api/v1/procurement/purchase-orders/${po.id}`).expect(200)).body;
    expect(current.status).toBe('issued');
  });

  it('validated DTOs reject bad create payloads with 400', async () => {
    await http.post('/api/v1/crm/opportunities').send({ title: 42 }).expect(400); // non-string title
    await http.post('/api/v1/procurement/purchase-orders').send({ value: 100 }).expect(400); // missing title
    await http.post('/api/v1/hse/incidents').send({ projectId: 'p1' }).expect(400); // missing required fields
  });
});
