// AURA OS — Supertest HTTP e2e over the business chains (deal chain + P2P).
// Boots the real AppModule (in-memory stores) and proves the cross-module
// reactor wires the chains end-to-end over HTTP, not just in unit harnesses.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
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

/** New quotations are governed by default; satisfy the persisted checklist before approval. */
async function makeApprovalReady(http: ReturnType<typeof request>, quoteId: string): Promise<void> {
  await http.post('/api/v1/document-requirements/seed')
    .send({ entityType: 'crm.quotation', entityId: quoteId }).expect(201);
  const result = (await http.get(`/api/v1/document-requirements?entityType=crm.quotation&entityId=${quoteId}`).expect(200)).body as {
    requirements: Array<{ id: string; type: string; requiredCount: number }>;
  };
  for (const requirement of result.requirements) {
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
    // ADR-0021 needs a REAL identity to capture award evidence (no 'system' fallback), but
    // switching the actor on globally would turn AccessService on for every other call in these
    // specs. So the actor is per-request, via a header only the award helper sends.
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run(
        { tenantId: 'chain-tenant', companyId: null, actorId: (_req as { headers?: Record<string, string> }).headers?.['x-e2e-actor'] ?? null, correlationId: 'e2e-chains' },
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

    // 2b. Price the bid and APPROVE the resulting quotation, which locks the immutable Commercial
    //     Baseline. That baseline is the contract's commercial basis. Without one the award is still
    //     valid but NO contract is created (the deferred path) — the tender's own estimate is never
    //     promoted to a contractual value. See ADR-0021's follow-up.
    const { boq } = (await http.get(`/api/v1/tendering/tenders/${tender.id}/boq`).expect(200)).body;
    await http.post(`/api/v1/tendering/tenders/${tender.id}/boq/items`)
      .send({ boqId: boq.id, itemCode: '1.1', description: 'ELV package', unit: 'LS', quantity: 1, rate: 780_000 })
      .expect(201);
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
    const po = (
      await http
        .post('/api/v1/procurement/purchase-orders')
        .send({ title: 'Cat6 cable drums', supplierName: 'Gulf Cables', value: 900 })
        .expect(201)
    ).body;
    await http.patch(`/api/v1/procurement/purchase-orders/${po.id}/status`).send({ status: 'issued' }).expect(200);

    // Goods arrive: GRN against the PO → reactor flips the PO to received.
    await http
      .post('/api/v1/inventory/grns')
      .send({ title: 'GRN — Cat6 cable drums', poId: po.id, poTitle: po.title, supplierName: 'Gulf Cables', value: 900 })
      .expect(201);

    const received = await eventually(async () => {
      const current = (await http.get(`/api/v1/procurement/purchase-orders/${po.id}`).expect(200)).body;
      return current.status === 'received' ? [current] : [];
    });
    expect(received).toHaveLength(1);
  });

  it('validated DTOs reject bad create payloads with 400', async () => {
    await http.post('/api/v1/crm/opportunities').send({ title: 42 }).expect(400); // non-string title
    await http.post('/api/v1/procurement/purchase-orders').send({ value: 100 }).expect(400); // missing title
    await http.post('/api/v1/hse/incidents').send({ projectId: 'p1' }).expect(400); // missing required fields
  });
});
