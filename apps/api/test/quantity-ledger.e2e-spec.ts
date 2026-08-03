// AURA OS — the Project Quantity Ledger (Phase 2), the physical twin of the Cost Ledger, over HTTP.
// Proves the architecture: no module mutates a BOQ item's live quantities — every movement is an
// append-only entry keyed to the BOQ item, and the item's position (ordered/received/issued/… vs the
// BOQ target) is SUM(ledger). A material issue is +issued; a return is −issued (never a mutation).
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

const TENANT = 'qty-tenant';

/** Poll until the fetcher returns a truthy value (reactor handlers are async). */
async function until<T>(fetcher: () => Promise<T | null>, tries = 25): Promise<T | null> {
  for (let i = 0; i < tries; i++) {
    const v = await fetcher();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  return fetcher();
}

describe('quantity ledger — the physical twin of the Cost Ledger (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: TENANT, companyId: null, actorId: null, correlationId: 'e2e-qty' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const ledger = async (boqItemId: string) =>
    (await http.get(`/api/v1/projects/quantity-ledger?boqItemId=${boqItemId}`).expect(200)).body as Array<{ type: string; quantity: number; source: string }>;
  const position = async (boqItemId: string) =>
    (await http.get(`/api/v1/projects/quantity-ledger/position/${boqItemId}`).expect(200)).body as {
      boq: number; ordered: number; received: number; issued: number; installed: number; approved: number; onSite: number; inTransit: number;
      wastage: number; pendingApproval: number; remainingToOrder: number; progressPct: number; unit: string | null;
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
    const project = (await http.post('/api/v1/projects/projects').send({ title: 'Blockwork', value: 600_000 }).expect(201)).body;
    const boqItemId = 'boq-block-200';

    // BOQ target 1000 nr; order 800; receive 700; issue 500 to site.
    await http.post('/api/v1/projects/quantity-ledger/baseline').send({ projectId: project.id, boqItemId, quantity: 1000, unit: 'nr' }).expect(201);
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

    // The whole chain, each figure = SUM(ledger) by type; the gaps are the operational signals.
    const pos = await until(async () => { const p = await position(boqItemId); return p.approved === 400 && p.installed === 450 && p.issued === 500 && p.received === 700 && p.ordered === 800 ? p : null; });
    expect(pos).toMatchObject({
      boq: 1000, ordered: 800, received: 700, issued: 500, installed: 450, approved: 400,
      remainingToOrder: 200, // 1000 − 800
      inTransit: 100,        // 800 − 700
      onSite: 200,           // 700 − 500 (received, not yet issued — site stock)
      wastage: 50,           // 500 − 450 (issued, not yet installed)
      pendingApproval: 50,   // 450 − 400 (installed, not yet approved)
      progressPct: 45,       // installed 450 / BOQ 1000 — the physical % complete
    });
  });
});
