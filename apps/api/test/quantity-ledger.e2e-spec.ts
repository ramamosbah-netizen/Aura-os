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
      boq: number; ordered: number; received: number; issued: number; onSite: number; remainingToOrder: number; unit: string | null;
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
});
