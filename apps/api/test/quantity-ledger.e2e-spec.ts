// AURA OS — the Project Quantity Ledger (Phase 2), the physical twin of the Cost Ledger, over HTTP.
// Proves the architecture: no module mutates a BOQ item's live quantities — every movement is an
// append-only entry keyed to the BOQ item, and the item's position (ordered/received/issued/… vs the
// BOQ target) is SUM(ledger). A material issue is +issued; a return is −issued (never a mutation).
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import { QuantityLedgerService } from '@aura/projects';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { establishGovernedQuotationReadiness } from './helpers/governed-quotation-readiness';

const TENANT = `qty-tenant-${Date.now()}`;
let activeTenantContext: TenantContext;

/** Poll until the fetcher returns a truthy value (reactor handlers are async). */
async function until<T>(fetcher: () => Promise<T | null>, tries = 25): Promise<T | null> {
  for (let i = 0; i < tries; i++) {
    const v = await fetcher();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  return fetcher();
}

/** Build the governed commercial prerequisite required by C2 before an installation can be posted. */
async function createGovernedDeliveryFixture(
  http: ReturnType<typeof request>,
  quantityLedger: QuantityLedgerService,
  title: string,
  quantity: number,
  unit: string,
): Promise<{ project: any; contract: any; item: any; boqItemId: string; wbs: any }> {
  const account = (await http.post('/api/v1/crm/accounts').send({ name: `${title} Account` }).expect(201)).body;
  const opportunity = (await http.post('/api/v1/crm/opportunities').send({
    title,
    value: 600_000,
    accountId: account.id,
    accountName: account.name,
    executionType: 'tender',
  }).expect(201)).body;
  const tender = (await http.post('/api/v1/tendering/tenders').send({
    title: `${title} Tender`,
    value: 600_000,
    accountId: account.id,
    accountName: account.name,
    status: 'submitted',
    sourceOpportunityId: opportunity.id,
  }).expect(201)).body;
  const { boq } = (await http.get(`/api/v1/tendering/tenders/${tender.id}/boq`).expect(200)).body;
  await http.post(`/api/v1/tendering/tenders/${tender.id}/boq/items`).send({
    boqId: boq.id,
    itemCode: `${title}-1`,
    description: title,
    unit,
    quantity,
    rate: 100,
  }).expect(201);
  const quotation = (await http.post(`/api/v1/tendering/tenders/${tender.id}/quotation`).send({}).expect(201)).body;
  await establishGovernedQuotationReadiness(http, quotation.id, `quantity-ledger-${title}`);
  await http.patch(`/api/v1/crm/quotations/${quotation.id}/status`).send({ action: 'submit_review' }).expect(200);
  await http.patch(`/api/v1/crm/quotations/${quotation.id}/status`).send({ action: 'approve' }).expect(200);
  const awardResponse = await http.post(`/api/v1/tendering/tenders/${tender.id}/award`).set('x-e2e-actor', 'u-c3-e2e').send({
    awardedValue: 600_000,
    currency: 'AED',
    awardedAt: '2026-08-25T07:30:00.000Z',
    awardReference: `LOA-${title}`,
  });
  if (awardResponse.status !== 201) throw new Error(`governed tender award failed: ${awardResponse.status} ${JSON.stringify(awardResponse.body)}`);
  const contract = await until(async () => {
    const contracts = (await http.get(`/api/v1/contracts/contracts?tenderId=${tender.id}`).expect(200)).body as any[];
    return contracts[0] ?? null;
  });
  if (!contract) throw new Error('governed tender did not produce a contract');
  await http.patch(`/api/v1/contracts/contracts/${contract.id}/status`).send({ status: 'active' }).expect(200);
  const project = await until(async () => {
    const projects = (await http.get(`/api/v1/projects/projects?contractId=${contract.id}`).expect(200)).body as any[];
    return projects[0] ?? null;
  });
  if (!project) throw new Error('signed governed contract did not produce a project');
  const item = (project.handoverSnapshot?.sourceItems ?? [])[0];
  if (!item?.frozenItemKey || item.unit !== unit || item.sourceItemId === null || item.soldQuantity !== quantity) {
    throw new Error('governed handover did not preserve authoritative Tender item evidence');
  }
  const wbs = (await http.post('/api/v1/projects/wbs').send({
    projectId: project.id,
    code: `1.${title.slice(0, 8)}`,
    title: `${title} delivery`,
    plannedValue: 100_000,
    boqItemId: item.sourceItemId,
  }).expect(201)).body;
  const mapping = (await http.post('/api/v1/projects/delivery-item-maps').send({
    projectId: project.id,
    handoverId: project.handoverId,
    frozenItemKey: item.frozenItemKey,
    sourceKind: item.sourceKind,
    sourceId: item.sourceId,
    sourceRevisionRef: item.sourceRevisionRef,
    sourceItemId: item.sourceItemId,
    wbsNodeId: wbs.id,
  }).expect(201)).body;
  await activeTenantContext.run({ tenantId: TENANT, companyId: null, actorId: null, correlationId: 'e2e-qty-sold' }, () =>
    quantityLedger.postSold({ mapping, soldQuantity: item.soldQuantity, unit: item.unit }),
  );
  return { project, contract, item, boqItemId: item.sourceItemId, wbs };
}

describe('quantity ledger — the physical twin of the Cost Ledger (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let quantityLedger: QuantityLedgerService;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    const tenant = app.get(TenantContext);
    activeTenantContext = tenant;
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({
        tenantId: TENANT,
        companyId: null,
        actorId: (_req as { headers?: Record<string, string> }).headers?.['x-e2e-actor'] ?? null,
        correlationId: 'e2e-qty',
      }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
    quantityLedger = app.get(QuantityLedgerService);
  });

  afterAll(async () => {
    await app?.close();
  });

  const ledger = async (boqItemId: string) =>
    (await http.get(`/api/v1/projects/quantity-ledger?boqItemId=${boqItemId}`).expect(200)).body as Array<{ type: string; quantity: number; source: string }>;
  const position = async (boqItemId: string) =>
    (await http.get(`/api/v1/projects/quantity-ledger/position/${boqItemId}`).expect(200)).body as {
      boq: number; ordered: number; received: number; issued: number; installed: number; approved: number; invoiced: number; onSite: number; inTransit: number;
      wastage: number; pendingApproval: number; pendingBilling: number; remainingToOrder: number; progressPct: number; unit: string | null;
    };

  it('BOQ baseline + material issue/return → the ISSUED position nets to what is on site', async () => {
    const project = (await http.post('/api/v1/projects/projects').send({ title: 'Cable Pull', value: 300_000 }).expect(201)).body;
    const boqItemId = 'boq-2.5mm-cable';

    // 1. Set the BOQ target: 100 m of 2.5mm² cable.
    await http.post('/api/v1/projects/quantity-ledger/baseline')
      .send({ projectId: project.id, boqItemId, quantity: 100, unit: 'm' })
      .expect(201);
    expect((await position(boqItemId)).boq).toBe(100);

    // 2. Stock on hand, then ISSUE 20 m to the project against that BOQ item → issued +20.
    const item = (await http.post('/api/v1/inventory/stock').send({ code: 'CBL-2.5', name: '2.5mm² Cable', unit: 'm', openingQty: 100, openingCost: 5 }).expect(201)).body;
    await http.post(`/api/v1/inventory/stock/${item.id}/movements`)
      .send({ direction: 'out', quantity: 20, projectId: project.id, boqItemId })
      .expect(201);
    const afterIssue = await until(async () => { const rows = await ledger(boqItemId); return rows.some((t) => t.source === 'material_issue') ? rows : null; });
    expect(afterIssue!.find((t) => t.source === 'material_issue')).toMatchObject({ type: 'issued', quantity: 20 });
    const issued = await until(async () => { const p = await position(boqItemId); return p.issued === 20 ? p : null; });
    expect(issued!.issued).toBe(20);

    // 3. RETURN 5 m from site → −issued. Net issued (on site as installed feedstock) = 15.
    await http.post(`/api/v1/inventory/stock/${item.id}/movements`)
      .send({ direction: 'in', quantity: 5, unitCost: 5, projectId: project.id, boqItemId })
      .expect(201);
    const netted = await until(async () => { const p = await position(boqItemId); return p.issued === 15 ? p : null; });
    expect(netted!.issued).toBe(15);

    // 4. The position reads off the ledger: target 100 m, net issued 15, still 100 m remaining to order.
    const pos = await position(boqItemId);
    expect(pos).toMatchObject({ boq: 100, issued: 15, remainingToOrder: 100, unit: 'm' });
    // Drill-down: 1 baseline + 2 issued movements (the +20 and the −5).
    const rows = await ledger(boqItemId);
    expect(rows.filter((t) => t.type === 'boq')).toHaveLength(1);
    expect(rows.filter((t) => t.type === 'issued')).toHaveLength(2);
  });

  it('PO coded to a BOQ item → ORDERED position; cancel → −reversal (mirrors committed cost)', async () => {
    const project = (await http.post('/api/v1/projects/projects').send({ title: 'Ductwork', value: 800_000 }).expect(201)).body;
    const boqItemId = 'boq-gi-duct';

    // Target 500 m², then order 300 m² of it → ORDERED 300 (net remaining-to-order = 200).
    await http.post('/api/v1/projects/quantity-ledger/baseline').send({ projectId: project.id, boqItemId, quantity: 500, unit: 'm2' }).expect(201);
    const po = (
      await http.post('/api/v1/procurement/purchase-orders')
        .send({ title: 'GI duct supply', value: 90_000, projectId: project.id, boqItemId, orderedQuantity: 300, unit: 'm2' })
        .expect(201)
    ).body;
    const ordered = await until(async () => { const p = await position(boqItemId); return p.ordered === 300 ? p : null; });
    expect(ordered).toMatchObject({ boq: 500, ordered: 300, remainingToOrder: 200 });

    // Cancel the PO → a −ordered reversal. Ordered nets back to 0 (append-only, never a mutation).
    await http.patch(`/api/v1/procurement/purchase-orders/${po.id}/status`).send({ status: 'cancelled' }).expect(200);
    const reversed = await until(async () => { const p = await position(boqItemId); return p.ordered === 0 ? p : null; });
    expect(reversed!.ordered).toBe(0);
    expect((await ledger(boqItemId)).filter((t) => t.type === 'ordered')).toHaveLength(2); // +300 and −300

    // Idempotent: a redelivered cancel must not double-reverse.
    await http.patch(`/api/v1/procurement/purchase-orders/${po.id}/status`).send({ status: 'cancelled' }).expect(200);
    await new Promise((r) => setTimeout(r, 200));
    expect((await ledger(boqItemId)).filter((t) => t.type === 'ordered')).toHaveLength(2);
  });

  it('the delivery chain on one BOQ item: BOQ → Ordered → Received → Issued, gaps read off the ledger', async () => {
    const fixture = await createGovernedDeliveryFixture(http, quantityLedger, 'Blockwork', 1000, 'nr');
    const project = fixture.project;
    const boqItemId = fixture.boqItemId;

    // Frozen SOLD target 1000 nr; order 800; receive 700; issue 500 to site.
    await http.post('/api/v1/procurement/purchase-orders')
      .send({ title: '200mm blocks', value: 40_000, projectId: project.id, boqItemId, orderedQuantity: 800, unit: 'nr' }).expect(201);
    await http.post('/api/v1/inventory/grns')
      .send({ title: 'Blocks delivery #1', projectId: project.id, boqItemId, receivedQuantity: 700, unit: 'nr', value: 35_000 }).expect(201);

    const item = (await http.post('/api/v1/inventory/stock').send({ code: 'BLK-200', name: '200mm Block', unit: 'nr', openingQty: 700, openingCost: 5 }).expect(201)).body;
    await http.post(`/api/v1/inventory/stock/${item.id}/movements`).send({ direction: 'out', quantity: 500, projectId: project.id, boqItemId }).expect(201);

    // Install 450 of the 500 issued (50 wastage/WIP).
    await http.post('/api/v1/site/installations')
      .send({ projectId: project.id, boqItemId, date: '2026-08-03', description: 'Blockwork L1', quantity: 450, unit: 'nr' }).expect(201);

    // Inspect & APPROVE 400 of the 450 installed (50 pending approval).
    const ir = (await http.post('/api/v1/quality/irs')
      .send({ projectId: project.id, irNumber: 'IR-BLK-01', discipline: 'civil', locationDetail: 'L1 grid A-C', inspectionDate: '2026-08-04', boqItemId, approvedQuantity: 400, unit: 'nr' })
      .expect(201)).body;
    await http.put(`/api/v1/quality/irs/${ir.id}/resolve`).send({ status: 'approved' }).expect(200);

    // Certify a remeasurement IPC for 350 of the 400 approved (50 pending billing) → INVOICED.
    const contract = fixture.contract;
    const ipc = (await http.post('/api/v1/contracts/certificates').send({ contractId: contract.id, cumulativeWorkDone: 200_000 }).expect(201)).body;
    await http.post(`/api/v1/contracts/certificates/${ipc.id}/lines`)
      .send({ projectId: project.id, boqItemId, description: 'Blockwork L1', quantity: 350, unit: 'nr', rate: 25 }).expect(201);
    await http.patch(`/api/v1/contracts/certificates/${ipc.id}/status`).send({ status: 'certified' }).expect(200);

    // The whole chain, each figure = SUM(ledger) by type; the gaps are the operational signals.
    const pos = await until(async () => { const p = await position(boqItemId); return p.invoiced === 350 && p.approved === 400 && p.installed === 450 && p.issued === 500 && p.received === 700 && p.ordered === 800 ? p : null; });
    expect(pos).toMatchObject({
      boq: 1000, ordered: 800, received: 700, issued: 500, installed: 450, approved: 400, invoiced: 350,
      remainingToOrder: 200, // 1000 − 800
      inTransit: 100,        // 800 − 700
      onSite: 200,           // 700 − 500 (received, not yet issued — site stock)
      wastage: 50,           // 500 − 450 (issued, not yet installed)
      pendingApproval: 50,   // 450 − 400 (installed, not yet approved)
      pendingBilling: 50,    // 400 − 350 (approved, not yet invoiced)
      progressPct: 45,       // installed 450 / BOQ 1000 — the physical % complete
    });
  });

  it('Progress Engine (Phase 3): installing work drives the linked WBS node progress + earned value', async () => {
    const fixture = await createGovernedDeliveryFixture(http, quantityLedger, 'EV Job', 200, 'm2');
    const project = fixture.project;
    const boqItemId = fixture.boqItemId;
    const wbs = fixture.wbs;
    expect(wbs.progress).toBe(0);

    // Install 150 of 200 m² → the Progress Engine syncs WBS progress to 75% and earnedValue to 75,000.
    await http.post('/api/v1/site/installations')
      .send({ projectId: project.id, boqItemId, date: '2026-08-05', description: 'Duct L2', quantity: 150, unit: 'm2' }).expect(201);
    const node = await until(async () => {
      const nodes = (await http.get(`/api/v1/projects/wbs?projectId=${project.id}`).expect(200)).body as Array<{ id: string; progress: number; earnedValue: number }>;
      const n = nodes.find((x) => x.id === wbs.id);
      return n && n.progress === 75 ? n : null;
    });
    expect(node).toMatchObject({ progress: 75, earnedValue: 75_000 });
  });
});
